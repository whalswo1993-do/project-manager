import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 서비스워커를 다시 등록하면 index.html 의 정리 스크립트와 부딪혀 iPad(Safari)에서 첫 접속부터 무한 새로고침이 난다.
// (autoUpdate 서비스워커는 새로 켜질 때마다 페이지를 새로고침하고, 정리 스크립트는 매 로드마다 서비스워커를 지운다)
const root = join(import.meta.dirname, "..");
const read = (file) => readFileSync(join(root, file), "utf8");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(jsx?|html)$/.test(name) ? [full] : [];
  });
}

describe("서비스워커 정책 — 등록하지 않고, 남은 것은 스스로 해제한다", () => {
  it("src 어디에서도 서비스워커를 등록하거나 PWA 등록 모듈을 불러오지 않는다", () => {
    const offenders = sourceFiles(join(root, "src")).filter((file) => {
      const text = readFileSync(file, "utf8");
      return /serviceWorker\s*\.\s*register\s*\(/.test(text) || /virtual:pwa-register/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("vite 설정이 해제용 서비스워커를 만들고 자동 등록 스크립트를 넣지 않는다", () => {
    const config = read("vite.config.js");
    expect(config).toMatch(/selfDestroying:\s*true/);
    expect(config).toMatch(/injectRegister:\s*false/);
    expect(config).not.toMatch(/registerType:\s*['"]autoUpdate['"]/);
  });

  it("index.html 은 예전 서비스워커와 캐시를 지우고, 서비스워커를 등록하지 않는다", () => {
    const html = read("index.html");
    expect(html).toMatch(/getRegistrations\(\)/);
    expect(html).toMatch(/\.unregister\(\)/);
    expect(html).not.toMatch(/serviceWorker\s*\.\s*register\s*\(/);
  });
});
