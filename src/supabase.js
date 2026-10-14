import { createClient } from "@supabase/supabase-js";

const env = typeof import.meta !== "undefined" ? import.meta.env : undefined;
const nodeEnv = typeof globalThis !== "undefined" && globalThis.process ? globalThis.process.env : undefined;

const url = env?.VITE_SUPABASE_URL || nodeEnv?.VITE_SUPABASE_URL || "https://tebtuzxafkymlplmlhzu.supabase.co";
const key = env?.VITE_SUPABASE_KEY || nodeEnv?.VITE_SUPABASE_KEY || "sb_publishable_grHTjPexU7_f9M8w4IrEYQ_o7_gx160";

// 토큰을 막 발급받은 직후(로그인·토큰 갱신 후 1초 안팎)에는 Supabase 서버 사이의 시계 차이 때문에
// 정상 토큰인데도 API가 401(PGRST303, "JWT issued at future")로 거절할 수 있다.
// 로그인 직후 첫 요청(내 프로필 조회)이 자주 여기에 걸려서 "계정 정보를 불러오지 못했습니다"가 떴다.
// 그 경우에만(다른 401은 그대로) 잠깐 기다렸다가 같은 요청을 다시 보낸다.
export const JWT_SKEW_RETRY_DELAYS_MS = [700, 1300, 2000];

export function createJwtSkewRetryFetch({
  fetchImpl = (...args) => globalThis.fetch(...args),
  delays = JWT_SKEW_RETRY_DELAYS_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  return async function fetchWithJwtSkewRetry(input, init) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(input, init);
      if (res.status !== 401 || attempt >= delays.length) return res;
      // 스트림처럼 다시 읽을 수 없는 요청 본문은 재시도하지 않는다 (supabase-js 는 문자열 본문을 쓴다)
      if (init && init.body && typeof init.body !== "string") return res;

      let issuedAtFuture = false;
      try {
        const body = await res.clone().json();
        issuedAtFuture = body?.code === "PGRST303" || /issued at future/i.test(body?.message || "");
      } catch {
        // 본문이 JSON 이 아니면 이 문제가 아니다
      }
      if (!issuedAtFuture) return res;
      await sleep(delays[attempt]);
    }
  };
}

export const supabase = createClient(url, key, { global: { fetch: createJwtSkewRetryFetch() } });
