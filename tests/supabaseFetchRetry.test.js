import { describe, expect, it, vi } from "vitest";
import { createJwtSkewRetryFetch } from "../src/supabase.js";

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const skewBody = { code: "PGRST303", details: null, hint: null, message: "JWT issued at future" };

describe("createJwtSkewRetryFetch — 토큰 발급 직후 401(PGRST303) 재시도", () => {
  it("PGRST303 401 이면 기다렸다가 다시 보내고 성공 응답을 돌려준다", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, skewBody))
      .mockResolvedValueOnce(jsonResponse(200, [{ id: "u1" }]));
    const sleep = vi.fn().mockResolvedValue();
    const f = createJwtSkewRetryFetch({ fetchImpl, sleep, delays: [5, 5, 5] });

    const res = await f("https://x/rest/v1/profiles", { method: "GET", headers: { a: "b" } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "u1" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it("계속 실패하면 정해진 횟수까지만 재시도하고 마지막 401 을 그대로 돌려준다", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse(401, skewBody));
    const f = createJwtSkewRetryFetch({ fetchImpl, sleep: async () => {}, delays: [1, 1] });

    const res = await f("https://x/rest/v1/profiles", {});

    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 처음 1번 + 재시도 2번
  });

  it("만료된 토큰(PGRST301) 같은 다른 401 은 재시도하지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { code: "PGRST301", message: "JWT expired" }));
    const sleep = vi.fn();
    const f = createJwtSkewRetryFetch({ fetchImpl, sleep, delays: [1, 1, 1] });

    const res = await f("https://x/rest/v1/profiles", {});

    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("401 이 아닌 응답과 JSON 이 아닌 401 은 그대로 돌려준다", async () => {
    const ok = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    expect((await createJwtSkewRetryFetch({ fetchImpl: ok, delays: [1] })("u", {})).status).toBe(200);
    expect(ok).toHaveBeenCalledTimes(1);

    const html = vi.fn().mockResolvedValue(new Response("<html>nope</html>", { status: 401 }));
    expect((await createJwtSkewRetryFetch({ fetchImpl: html, delays: [1] })("u", {})).status).toBe(401);
    expect(html).toHaveBeenCalledTimes(1);
  });

  it("다시 읽을 수 없는 본문(스트림 등)이 있는 요청은 재시도하지 않는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, skewBody));
    const f = createJwtSkewRetryFetch({ fetchImpl, sleep: async () => {}, delays: [1, 1] });

    const res = await f("https://x/upload", { method: "POST", body: new Blob(["x"]) });

    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
