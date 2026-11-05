import { describe, it, expect } from "vitest";
import { buildDailyReportSheets, reportTotal, normalizeReportRow } from "../src/exportDailyReports";

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

  it("기간 밖·미등록 프로젝트 일보는 제외하고 3개 표를 만든다", () => {
    const s = buildDailyReportSheets({ reports, projects, startDate: "2026-05-01", endDate: "2026-05-31" });
    expect(s.total).toBe(3);
    expect(s.list.map((r) => r[0])).toEqual(["2026-05-02", "2026-05-01", "2026-05-02"]);
    expect(s.deptHeaders.at(-1)).toBe("통역");
    const sdi = s.projectRows.find((r) => r[2] === "70001");
    expect(sdi[4]).toBe(1);
    expect(sdi.at(-1)).toBe(2);
    const may2 = s.dateRows.find((r) => r[0] === "2026-05-02");
    expect(may2[1]).toBe(2);
    expect(may2.at(-1)).toBe(5);
    // 행마다 합계 = 부서별 값의 합
    s.list.forEach((row) => {
      const n = s.deptHeaders.length;
      expect(row.slice(7, 7 + n).reduce((a, b) => a + b, 0)).toBe(row.at(-1));
    });
  });

  it("SITE를 고르면 그 SITE만 모은다", () => {
    const s = buildDailyReportSheets({ reports, projects, startDate: "2026-05-01", endDate: "2026-05-31", sites: ["SDI"] });
    expect(s.total).toBe(1);
    expect(s.list[0][4]).toBe("Notcher");
  });
});
