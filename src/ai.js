import { GoogleGenerativeAI } from "@google/generative-ai";
import { ensureSupabaseAuth } from "./authService";
import { supabase } from "./supabase";

// AI 호출 공통 모듈. 앱의 모든 AI 분석(마스터플랜/일보/견적/이슈 PPT)은 generateAIText 하나를 거친다.
//
// 호출 경로
//   Gemini: ① 서버 함수 /api/gemini (키가 서버에만 있음)  ② 서버를 쓸 수 없으면 브라우저 키(VITE_GEMINI_API_KEY)로 직접 호출(안전망)
//   Claude: 서버 함수 /api/claude (키는 항상 서버에만 있음)
//
// 제공자 선택 (환경변수 VITE_AI_PROVIDER):
//   auto   (기본) Gemini 를 먼저 쓰고, 실패하면 Claude 로 자동 전환. Claude 가 설정되지 않았으면
//          예전처럼 Gemini 오류를 그대로 전달한다.
//   gemini Gemini 만 사용
//   claude Claude 만 사용 (Gemini 구독 종료 후 권장)

const GEMINI_MODEL = "gemini-3.8-flash";

export class AIError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "AIError";
    this.status = status;
    this.code = code;
  }
}

// Claude 를 "시도해 볼 수 없는" 상황 — 이때는 Gemini 의 원래 오류를 사용자에게 보여준다.
const CLAUDE_UNAVAILABLE_CODES = new Set(["not_configured", "unauthenticated", "forbidden", "no_session", "not_available"]);

// Gemini 서버 경로를 "쓸 수 없는" 상황 — 이때만 브라우저 키로 직접 호출한다.
// (429 같은 실제 Gemini 오류는 같은 키/한도이므로 직접 재시도하지 않는다.)
const GEMINI_SERVER_UNAVAILABLE_CODES = new Set(["not_configured", "no_session", "unauthenticated", "forbidden", "not_available", "too_large"]);

export function getAIProvider() {
  const value = String(import.meta.env.VITE_AI_PROVIDER || "auto").toLowerCase();
  return value === "gemini" || value === "claude" ? value : "auto";
}

function hasBrowserGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

/**
 * 호출 전 가벼운 확인용. 서버에 키가 있는지는 브라우저가 알 수 없으므로 항상 true 이고,
 * 키가 하나도 없으면 generateAIText 가 호출 시점에 안내 문구와 함께 오류를 던진다.
 */
export function isAIConfigured() {
  return true;
}

// 서버 함수 호출 공통부 (/api/gemini, /api/claude). 로그인한 사용자의 Supabase 토큰으로 인증한다.
async function callServer(endpoint, parts, label) {
  await ensureSupabaseAuth();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new AIError(`${label} 분석은 서버 로그인이 필요합니다.`, { code: "no_session" });

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parts }),
    });
  } catch (e) {
    throw new AIError(`${label} 서버에 연결하지 못했습니다: ${e.message}`, { code: "not_available" });
  }

  // 413 은 Vercel 이 본문 크기 초과(약 4.5MB)로 거절할 때 JSON 없이 돌아올 수 있다.
  const body = await res.json().catch(() => null);
  if (res.status === 413) {
    throw new AIError("파일이 너무 커서(약 3MB 초과) AI 서버로 보낼 수 없습니다. 파일을 줄이거나 나눠서 다시 시도해주세요.", { status: 413, code: "too_large" });
  }
  if (!res.ok) {
    throw new AIError(body?.error?.message || `${label} 요청 실패 (${res.status})`, { status: res.status, code: body?.error?.code });
  }
  // 개발 서버(vite dev)에는 /api 가 없어 HTML 이 돌아온다.
  if (!body || typeof body.text !== "string") {
    throw new AIError(`${label} 서버 함수를 사용할 수 없는 환경입니다.`, { code: "not_available" });
  }
  return body.text;
}

async function callGeminiDirect(parts) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new AIError("Gemini API 키가 설정되지 않았습니다.", { code: "not_configured" });
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(parts);
  return result.response.text();
}

async function callGemini(parts) {
  try {
    return await callServer("/api/gemini", parts, "Gemini");
  } catch (e) {
    if (!GEMINI_SERVER_UNAVAILABLE_CODES.has(e.code)) throw e;
    // 서버 경로를 쓸 수 없다 → 브라우저 키가 있으면 직접 호출
    if (!hasBrowserGeminiKey()) {
      // 브라우저 키가 없는데 파일이 커서 거절된 경우: "키 없음"이 아니라 실제 원인(파일 크기)을 알려준다
      if (e.code === "too_large") throw e;
      throw new AIError("Gemini API 키가 설정되지 않았습니다.", { code: "not_configured" });
    }
    return callGeminiDirect(parts);
  }
}

const callClaude = (parts) => callServer("/api/claude", parts, "Claude");

/**
 * @param {string | Array<string | {text: string} | {inlineData: {data: string, mimeType: string}}>} input
 *        Gemini generateContent 와 같은 입력(문자열 또는 parts 배열)
 * @param {{ provider?: "auto" | "gemini" | "claude", notConfiguredMessage?: string }} [options]
 * @returns {Promise<string>} 모델이 돌려준 텍스트
 */
export async function generateAIText(input, options = {}) {
  const parts = Array.isArray(input) ? input : [input];
  const provider = options.provider || getAIProvider();
  const notConfigured = new AIError(
    options.notConfiguredMessage || "AI API 키가 설정되지 않았습니다. (Gemini 또는 Claude)",
    { code: "not_configured" },
  );
  const orNotConfigured = (e) => (e.code === "not_configured" ? notConfigured : e);

  if (provider === "gemini") {
    try {
      return await callGemini(parts);
    } catch (e) {
      throw orNotConfigured(e);
    }
  }

  if (provider === "claude") {
    try {
      return await callClaude(parts);
    } catch (e) {
      throw orNotConfigured(e);
    }
  }

  // auto: Gemini → (실패 시) Claude
  let geminiError;
  try {
    return await callGemini(parts);
  } catch (e) {
    geminiError = e;
    // 역할 때문에 막힌 것은 Claude 서버도 똑같이 막으므로 전환하지 않고 안내 문구를 그대로 보여준다
    if (e.code === "ai_not_allowed") throw e;
    if (e.code !== "not_configured") console.warn("[AI] Gemini 실패, Claude로 전환을 시도합니다:", e?.message);
  }

  try {
    const text = await callClaude(parts);
    if (geminiError.code !== "not_configured") console.info("[AI] Claude 로 응답했습니다.");
    return text;
  } catch (claudeError) {
    // Gemini 를 쓸 수 없었던 경우(키 없음): Claude 쪽 상황이 곧 최종 상태
    if (geminiError.code === "not_configured") throw orNotConfigured(claudeError);
    // Claude 를 시도할 수 없었던 경우: 예전처럼 Gemini 의 원래 오류를 그대로 보여준다
    if (CLAUDE_UNAVAILABLE_CODES.has(claudeError.code)) throw geminiError;
    throw new AIError(`${claudeError.message} (Gemini 오류: ${geminiError.message})`, {
      status: claudeError.status,
      code: claudeError.code,
    });
  }
}
