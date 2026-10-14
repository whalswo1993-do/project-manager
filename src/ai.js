import { GoogleGenerativeAI } from "@google/generative-ai";
import { ensureSupabaseAuth } from "./authService";
import { supabase } from "./supabase";

// AI 호출 공통 모듈. 앱의 모든 AI 분석(마스터플랜/일보/견적/이슈 PPT)은 generateAIText 하나를 거친다.
//
// 제공자 선택 (환경변수 VITE_AI_PROVIDER):
//   auto   (기본) Gemini 를 먼저 쓰고, 실패하면 Claude(/api/claude)로 자동 전환. Claude 가 설정되지 않았으면
//          예전처럼 Gemini 오류를 그대로 전달한다.
//   gemini Gemini 만 사용 (기존 동작과 동일)
//   claude Claude 만 사용 (Gemini 구독 종료 후 권장)
// Claude 키(ANTHROPIC_API_KEY)는 브라우저가 아니라 서버 함수(api/claude.js)에만 있다.

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

export function getAIProvider() {
  const value = String(import.meta.env.VITE_AI_PROVIDER || "auto").toLowerCase();
  return value === "gemini" || value === "claude" ? value : "auto";
}

function hasGeminiKey() {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY);
}

/** 호출 전에 "AI를 쓸 수 있는 상태인가"를 가볍게 확인한다. (Claude 설정 여부는 서버만 알 수 있으므로 낙관적으로 true) */
export function isAIConfigured() {
  return getAIProvider() === "gemini" ? hasGeminiKey() : true;
}

async function callGemini(parts) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new AIError("Gemini API 키가 설정되지 않았습니다.", { code: "not_configured" });
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(parts);
  return result.response.text();
}

async function callClaude(parts) {
  await ensureSupabaseAuth();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new AIError("Claude 분석은 서버 로그인이 필요합니다.", { code: "no_session" });

  let res;
  try {
    res = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ parts }),
    });
  } catch (e) {
    throw new AIError(`Claude 서버에 연결하지 못했습니다: ${e.message}`, { code: "not_available" });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AIError(body?.error?.message || `Claude 요청 실패 (${res.status})`, { status: res.status, code: body?.error?.code });
  }
  // 개발 서버(vite dev)에는 /api 가 없어 HTML 이 돌아온다.
  if (!body || typeof body.text !== "string") {
    throw new AIError("Claude 서버 함수를 사용할 수 없는 환경입니다.", { code: "not_available" });
  }
  return body.text;
}

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

  if (provider === "gemini") {
    if (!hasGeminiKey()) throw notConfigured;
    return callGemini(parts);
  }

  if (provider === "claude") {
    try {
      return await callClaude(parts);
    } catch (e) {
      throw e.code === "not_configured" ? notConfigured : e;
    }
  }

  // auto: Gemini → (실패 시) Claude
  let geminiError = null;
  if (hasGeminiKey()) {
    try {
      return await callGemini(parts);
    } catch (e) {
      geminiError = e;
      console.warn("[AI] Gemini 실패, Claude로 전환을 시도합니다:", e?.message);
    }
  }

  try {
    const text = await callClaude(parts);
    if (geminiError) console.info("[AI] Claude 로 응답했습니다.");
    return text;
  } catch (claudeError) {
    if (!geminiError) throw claudeError.code === "not_configured" ? notConfigured : claudeError;
    if (CLAUDE_UNAVAILABLE_CODES.has(claudeError.code)) throw geminiError;
    throw new AIError(`${claudeError.message} (Gemini 오류: ${geminiError.message})`, {
      status: claudeError.status,
      code: claudeError.code,
    });
  }
}
