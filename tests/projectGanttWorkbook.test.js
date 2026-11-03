import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildProjectGanttWorkbook, buildGanttColumns, projectBlocks, scheduleRange, SHEET_GANTT, SHEET_LIST } from "../src/projectGanttWorkbook";

// 가짜 데이터만 쓴다(실제 프로젝트·금액 없음)
const projects = [
  {
    id: "a", manufacturingNo: "MFG-001-ab12", name: "테스트 라인 A", site: "SITE-X", status: "진행중", value: 40,
    startDate: "2026-11-02", endDate: "2026-12-11", projectColor: "#2563eb",
    milestones: [
      { id: "m1", name: "설계", startDate: "2026-11-02", endDate: "2026-11-13" },
      { id: "m2", name: "제작", startDate: "2026-11-16", endDate: "2026-12-04" },
      { id: "__status_meta__", name: "meta", startDate: "2026-11-02", endDate: "2026-11-02" },
      { id: "m3", name: "날짜 없음", startDate: "", endDate: "" },
    ],
  },
  { id: "b", manufacturingNo: "MFG-002", name: "테스트 라인 B", site: "SITE-Y", status: "완료", startDate: "2026-12-01", endDate: "2026-12-18", milestones: [] },
];

describe("프로젝트 간트 엑셀", () => {
  it("마일스톤은 날짜가 있는 것만, 시작일 순으로 모은다", () => {
    const b = projectBlocks(projects);
    expect(b[0].milestones.map((m) => m.name)).toEqual(["설계", "제작"]);
    expect(scheduleRange(b)).toEqual({ start: "2026-11-02", end: "2026-12-18" });
  });

  it("일 단위는 하루씩, 주 단위는 월요일부터 7일씩 칸을 만든다", () => {
    expect(buildGanttColumns("day", "2026-11-02", "2026-11-04").cols).toHaveLength(3);
    const w = buildGanttColumns("week", "2026-11-04", "2026-11-17");
    expect(w.cols.map((c) => c.start)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(w.span).toBe(7);
  });

  it("시트 구성·개요 그룹·접힘 상태", () => {
    const wb = buildProjectGanttWorkbook(ExcelJS, projects, { unit: "week", collapsed: true, today: "2026-11-10" });
    expect(wb.worksheets.map((s) => s.name)).toEqual([SHEET_GANTT, SHEET_LIST, "작성 안내"]);
    const ws = wb.getWorksheet(SHEET_GANTT);
    const { firstRow } = wb.__gantt;
    expect(ws.getRow(firstRow).outlineLevel).toBe(0);
    expect(ws.getRow(firstRow + 1).outlineLevel).toBe(1);
    expect(ws.getRow(firstRow + 1).hidden).toBe(true);
    expect(ws.getRow(firstRow).collapsed).toBe(true);
    // 마일스톤이 없는 프로젝트는 접힘 표시를 하지 않는다
    expect(ws.getRow(firstRow + 3).collapsed).toBe(false);
  });

  it("동시 진행 프로젝트 수 캐시 값이 일정과 맞는다", () => {
    const wb = buildProjectGanttWorkbook(ExcelJS, projects, { unit: "week", today: "2026-11-10" });
    const ws = wb.getWorksheet(SHEET_GANTT);
    const { sumRow, cols } = wb.__gantt;
    const counts = cols.map((_, i) => ws.getCell(sumRow, 9 + i).value.result);
    // 11/30 주(2026-11-30~12-06)에는 A·B가 모두 진행 중
    const i = cols.findIndex((c) => c.start === "2026-11-30");
    expect(counts[i]).toBe(2);
    expect(counts[0]).toBe(1);
  });

  it("엑셀 파일로 저장했다가 다시 읽을 수 있고 시트 XML 순서가 맞다", async () => {
    const wb = buildProjectGanttWorkbook(ExcelJS, projects, { unit: "day", today: "2026-11-10" });
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    expect(back.getWorksheet(SHEET_GANTT).rowCount).toBeGreaterThan(5);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("xl/worksheets/sheet1.xml").async("string");
    const pr = xml.match(/<sheetPr>.*?<\/sheetPr>/)[0];
    expect(pr.indexOf("tabColor")).toBeLessThan(pr.indexOf("outlinePr"));
    expect(pr).toContain('summaryBelow="0"');
    expect(xml).toContain("conditionalFormatting");
    // 한 칸짜리 병합은 엑셀이 거부한다
    const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)];
    merges.forEach((m) => expect(m[1]).not.toBe(m[2]));
  });

  it("일정이 없거나 너무 긴 기간은 안내 문구로 막는다", () => {
    expect(() => buildProjectGanttWorkbook(ExcelJS, [{ name: "x", milestones: [] }])).toThrow(/일정/);
    expect(() => buildProjectGanttWorkbook(ExcelJS, projects, { unit: "day", startDate: "2020-01-01", endDate: "2026-12-31" })).toThrow(/너무 깁니다/);
  });
});
