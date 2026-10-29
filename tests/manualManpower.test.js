import { describe, it, expect } from "vitest";
import { buildManualManpower, hasMasterManpower, isValidManualRow } from "../src/manualManpower";
import { autoDemands } from "../src/tripLogic";
import { normalizeDeptKey } from "../src/manpowerDepts";

describe("manualManpower", () => {
  it("구간을 부서별 일 단위 공수로 바꾼다(일요일 제외)", () => {
    // 2026-11-02(월) ~ 11-08(일): 월~토 6일
    const mp = buildManualManpower([
      { dept: "mechanical", start: "2026-11-02", end: "2026-11-08", count: 3 },
      { dept: "vision", start: "2026-11-02", end: "2026-11-04", count: 2 },
    ]);
    expect(mp.source).toBe("manual");
    expect(mp.departments["기구"].total).toBe(18);
    expect(mp.departments["기구"].peak).toBe(3);
    expect(mp.departments["비전"].total).toBe(6);
    expect(mp.totalManday).toBe(24);
    expect(mp.dailyTotal["2026-11-03"]).toBe(5);
    expect(mp.dailyTotal["2026-11-08"]).toBeUndefined();
    expect(mp.dailyPeak).toBe(5);
  });

  it("같은 부서의 겹치는 구간은 합산한다", () => {
    const mp = buildManualManpower([
      { dept: "control", start: "2026-11-02", end: "2026-11-03", count: 1 },
      { dept: "control", start: "2026-11-03", end: "2026-11-04", count: 2 },
    ]);
    expect(mp.departments["제어"].daily).toEqual({ "2026-11-02": 1, "2026-11-03": 3, "2026-11-04": 2 });
  });

  it("쓸 수 없는 구간은 무시하고, 하나도 없으면 null", () => {
    expect(buildManualManpower([])).toBeNull();
    expect(buildManualManpower([{ dept: "vision", start: "2026-11-05", end: "2026-11-01", count: 2 }])).toBeNull();
    expect(isValidManualRow({ dept: "vision", start: "2026-11-01", end: "2026-11-05", count: 0 })).toBe(false);
  });

  it("마스터 공수가 있는지 구분한다", () => {
    expect(hasMasterManpower(null)).toBe(false);
    expect(hasMasterManpower({ totalManday: 10, departments: {} })).toBe(true);
    expect(hasMasterManpower(buildManualManpower([{ dept: "vision", start: "2026-11-02", end: "2026-11-03", count: 1 }]))).toBe(false);
  });

  it("출장자 관리가 수동 공수를 부서별 필요 인원으로 읽는다(외주는 본 부서에 합산)", () => {
    const mp = buildManualManpower([
      { dept: "mechanical", start: "2026-11-02", end: "2026-11-02", count: 2 },
      { dept: "mechanical_sub", start: "2026-11-02", end: "2026-11-02", count: 1 },
      { dept: "manager", start: "2026-11-02", end: "2026-11-02", count: 1 },
    ]);
    const keyOf = (n) => { const k = normalizeDeptKey(n); return k.endsWith("_sub") ? k.replace("_sub", "") : k; };
    const demands = autoDemands("p1", mp, keyOf);
    const mech = demands.filter((d) => d.dept === "mechanical");
    expect(mech).toHaveLength(1);
    expect(mech[0]).toMatchObject({ headcount: 3, sub: 1, start_date: "2026-11-02", end_date: "2026-11-02" });
    expect(demands.some((d) => d.dept === "manager")).toBe(true);
  });
});
