import { describe, it, expect } from "vitest";
import { matchesSites, sitesLabel } from "../src/siteFilter";

describe("복수 Site 필터", () => {
  it("선택이 없으면 모든 Site를 통과시킨다", () => {
    expect(matchesSites([], "SKOH")).toBe(true);
    expect(matchesSites(undefined, "")).toBe(true);
  });

  it("선택한 Site 중 하나라도 맞으면 통과한다", () => {
    expect(matchesSites(["SKOH", "SDI"], "SDI")).toBe(true);
    expect(matchesSites(["SKOH", "SDI"], "HSBMA")).toBe(false);
  });

  it("정규화 함수를 주면 표기 차이를 맞춰 비교한다", () => {
    const norm = (s) => s.replace(/\s+/g, "").toUpperCase();
    expect(matchesSites(["sk oh"], "SKOH", norm)).toBe(true);
  });

  it("요약 글자", () => {
    expect(sitesLabel([])).toBe("전체");
    expect(sitesLabel(["A", "B"])).toBe("A, B");
  });
});
