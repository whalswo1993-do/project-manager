import { describe, it, expect } from "vitest";
import { buildDailyReportData, reportTotal, normalizeReportRow, weekdayOf } from "../src/exportDailyReports";

const projects = [
  { id: "p1", site: "SKOH", line: "10Line", manufacturingNo: "91144", name: "Stacker 1호기" },
  { id: "p2", site: "SDI", line: "A", manufacturingNo: "70001", name: "Notcher" },
];
const reports = [
  { project_id: "p1", report_date: "2026-05-01", work_details: "셋팅", special_notes: "지연", pm_count: 1, facility_count: 4, content: JSON.stringify({ electrical_count: 2, custom_depts: { 통역: 1 } }) },
  { project_id: "p1", report_date: "2026-05-02", work_details: "조립", facility_count: 3 },
  { project_id: "p2", report_date: "2026-05-02", work_details: "시운전", vision_count: 2, issues: "소프트 오류" },
  { project_id: "p2", report_date: "2026-06-30", work_details: "기간 밖", vision_count: 9 },
  { project_id: "zz", report_date: "2026-05-02", facility_count: 5 },
];

describe("공사일보 취합 엑셀 데이터", () => {
  it("content JSON의 보조 값과 사용자 지정 부서를 합계에 넣는다", () => {
    const r = normalizeReportRow(reports[0]);
    expect(r.electrical_count).toBe(2);
    expect(reportTotal(r)).toBe(1 + 4 + 2 + 1);
  });

  it("요일을 계산한다", () => {
    expect(weekdayOf("2026-05-02")).toBe("토");
    expect(weekdayOf("2026-05-03")).toBe("일");
  });

  it("프로젝트별로 묶고 날짜순 정렬, 기간 밖·미등록 프로젝트는 제외한다", () => {
    const d = buildDailyReportData({ reports, projects, startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(d.total).toBe(3);
    expect(d.groups.map((g) => g.project.id)).toEqual(["p2", "p1"]); // SDI < SKOH
    const p1 = d.groups.find((g) => g.project.id === "p1");
    expect(p1.days.map((x) => x.date)).toEqual(["2026-05-01", "2026-05-02"]);
    expect(p1.days[0].notes).toBe("지연");
    expect(p1.days[0].summary).toBe("소장 1 · 기구 4 · 전장 2 · 통역 1");
  });

  it("값이 없는 부서 열은 빼고, 소계·전체 합계가 일별 값의 합과 같다", () => {
    const d = buildDailyReportData({ reports, projects, startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(d.depts.map((x) => x.label)).toEqual(["소장", "기구", "전장", "비전", "통역"]);
    d.groups.forEach((g) => {
      expect(g.total).toBe(g.days.reduce((s, x) => s + x.total, 0));
      g.sums.forEach((s, i) => expect(s).toBe(g.days.reduce((a, x) => a + x.values[i], 0)));
    });
    expect(d.grandTotal).toBe(13); // p1: 8 + 3, p2: 2
    expect(d.sums.reduce((a, b) => a + b, 0)).toBe(d.grandTotal);
  });

  it("기간을 비우면 전체 기간을 모은다", () => {
    const d = buildDailyReportData({ reports, projects });
    expect(d.total).toBe(4);
  });

  it("SITE 또는 프로젝트를 골라 거른다", () => {
    expect(buildDailyReportData({ reports, projects, sites: ["SDI"] }).groups.map((g) => g.project.id)).toEqual(["p2"]);
    expect(buildDailyReportData({ reports, projects, projectIds: ["p1"] }).groups.map((g) => g.project.id)).toEqual(["p1"]);
  });
});
