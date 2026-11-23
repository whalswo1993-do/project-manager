import { describe, it, expect } from "vitest";
import { extractManufacturingNo, isModelCode } from "../src/masterPlanParser.js";

describe("제조번호 추출", () => {
  it("형교환 모델명은 제조번호가 아니다", () => {
    for (const m of ["E1127", "H055", "S010", "S012A", "E1540"]) expect(isModelCode(m)).toBe(true);
    expect(extractManufacturingNo("SKOH2 - 9Line - E1127 J/C Stacker (9대)")).toBe("");
    expect(extractManufacturingNo("ESS S012A J/C")).toBe("");
  });
  it("실제 제조번호 형태를 읽는다", () => {
    expect(extractManufacturingNo("2202HNM-9L-02R")).toBe("2202HNM-9L-02R");
    expect(extractManufacturingNo("제조번호: 2309AD-03R")).toBe("2309AD-03R");
    expect(extractManufacturingNo("개조 SKBA-25C 건")).toBe("SKBA-25C");
  });
  it("미정·빈 값은 비운다", () => {
    expect(extractManufacturingNo("제조번호: 미정")).toBe("");
    expect(extractManufacturingNo("")).toBe("");
  });
});
