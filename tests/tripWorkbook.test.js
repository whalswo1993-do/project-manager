import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTripWorkbook, MAIN } from "../src/tripWorkbook";
import { projectsToPlans, buildDemands, OUTSOURCE_PARENT } from "../src/tripLogic";
import { normalizeDeptKey } from "../src/manpowerDepts";

// 가짜 데이터로 만든 종합 엑셀의 구조(시트·수식·접기/펼치기·검증)를 지킨다. 실제 계산값은 엑셀에서 따로 확인했다.
const day = (from, count, n) => Object.fromEntries(Array.from({ length: count }, (_, i) => [new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10), n]));
const mkProject = (id, name, site, line, start, end, mp, ms = []) => ({ id, customer: "SK on", site, line, name, startDate: start, endDate: end, status: "진행중", milestones: ms, manpower: { departments: mp } });
const projects = [
  mkProject("p1", "시험 HSBMA 3Line J/C Stacker (10대)", "HSBMA", "3Line", "2026-11-02", "2027-01-31",
    { "기구": { daily: { ...day("2026-11-02", 28, 4), ...day("2026-11-30", 63, 2) } }, "비전": { daily: day("2026-11-02", 56, 2) }, "비전 외주": { daily: day("2026-11-09", 21, 1) }, "제어": { daily: day("2026-11-02", 30, 1) }, "소장": { daily: day("2026-11-02", 91, 1) } },
    [{ name: "J/C", startDate: "2026-11-02", endDate: "2026-11-22" }, { name: "FOB", startDate: "2026-11-16", endDate: "2026-12-06" }, { name: "SAT", startDate: "2027-01-18", endDate: "2027-01-31" }]),
  mkProject("p2", "시험 SKO 서산 4,5L 개조", "SKO 서산", "4Line", "2026-11-16", "2026-12-27", { "기구": { daily: day("2026-11-16", 28, 2) }, "제어": { daily: day("2026-11-16", 42, 1) } }),
  mkProject("p3", "시험 공수 없는 프로젝트", "SKO 대전", "PP4", "2026-11-09", "2026-12-20", {}),
];
const plans = projectsToPlans(projects);
const keyOf = (n) => { const k = normalizeDeptKey(n); const p = OUTSOURCE_PARENT[k] || k; return ["mechanical", "vision", "control", "electrical", "manager"].includes(p) ? p : null; };
const demands = buildDemands(plans, [], keyOf);
const mk = (id, name, dept, team, b1, active = true) => ({ id, name, dept, team, rank: "선임", grade: "", b1_visa: b1, active, note: "" });
const members = [mk("m1", "가나", "mechanical", "설비기술 1팀", true), mk("m2", "나다", "mechanical", "설비기술 1팀", false), mk("m3", "다라", "mechanical", "설비기술 2팀", true), mk("m4", "라마", "mechanical", "설비기술 2팀", true),
  mk("m5", "아자", "vision", "비전 1팀", true), mk("m6", "자차", "vision", "비전 2팀", false), mk("m7", "차카", "control", "제어 1팀", true), mk("m8", "파하", "manager", "PM 1팀", true), mk("m9", "퇴사자", "vision", "비전 1팀", false, false)];
const A = (id, p, dept, m, s, e, extra = {}) => ({ id, project_id: p, dept, member_id: m, label: null, start_date: s, end_date: e, note: null, ...extra });
const assignments = [
  A("a1", "p1", "mechanical", "m1", "2026-11-02", "2027-01-31"), A("a2", "p1", "mechanical", "m2", "2026-11-02", "2026-12-27", { note: "3라인 후 4라인" }), A("a3", "p1", "mechanical", "m3", "2026-11-02", "2026-11-04"),
  A("a4", "p1", "mechanical", "m4", "2026-11-05", "2026-11-29"), A("a5", "p1", "vision", "m5", "2026-11-02", "2026-12-27"), A("a6", "p1", "vision", null, "2026-11-09", "2026-11-29", { label: "비전 외주 1" }),
  A("a7", "p2", "mechanical", "m1", "2026-11-23", "2026-12-13"), A("a8", "p2", "control", "m7", "2026-11-16", "2026-12-27"), A("a9", "p1", "manager", "m3", "2026-12-07", "2027-01-31"),
];
const absences = [{ id: "ab1", member_id: "m6", kind: "customer", location: "현대 인성 PJT 대응", start_date: "2026-11-09", end_date: "2026-11-22", note: null }, { id: "ab2", member_id: "m4", kind: "leave", location: "", start_date: "2026-12-14", end_date: null, note: "육아휴직" }];
const notes = [{ project_id: "p1", dept: "vision", note: "개조 동시 진행 — 외주 1명 11/9~11/29" }];

const build = (opts = {}) => buildTripWorkbook(ExcelJS, { plans, demands, assignments, members, absences, notes }, { today: "2026-10-27", startWeek: "2026-10-26", weeks: 14, ...opts });
const val = (c) => (c && typeof c === "object" && "formula" in c ? c : { value: c });

describe("출장자 종합 엑셀 builder", () => {
  it("시트 7개를 만들고 첫 시트가 PJT 출장자 양식이다", () => {
    const wb = build();
    expect(wb.worksheets.map((w) => w.name)).toEqual([MAIN, "종합 현황", "인원별 위치 현황", "프로젝트 목차", "인원 명단", "외부 일정", "작성 안내"]);
  });

  it("프로젝트마다 H·S·T 표시 줄이 있고 TOTAL·취합 공수는 수식이다", () => {
    const wb = build();
    const ws = wb.getWorksheet(MAIN);
    const meta = wb.__trip;
    expect(meta.blocks).toHaveLength(3);
    meta.blocks.forEach((b) => {
      expect(ws.getCell(b.headerRow, 1).value).toBe("H");
      expect(b.totalRows).toHaveLength(5);
      b.totalRows.forEach((r) => {
        expect(ws.getCell(r, 1).value).toBe("T");
        expect(String(val(ws.getCell(r, 5).value).formula)).toMatch(/^COUNTIFS\(\$C\$\d+:\$C\$\d+,"[^"]+\*",E\$\d+:E\$\d+,"<>"\)$/);
      });
    });
    const sum = ws.getCell(meta.sumTitle, 5).value;
    expect(sum.formula).toContain(`SUMIFS(E$8:E$${meta.rangeEnd},$A$8:$A$${meta.rangeEnd},"T"`);
  });

  it("TOTAL 줄의 캐시 값은 그 프로젝트 칸 수이고, 취합 줄은 프로젝트 합이다", () => {
    const wb = build();
    const ws = wb.getWorksheet(MAIN);
    const meta = wb.__trip;
    // 공수가 없는 프로젝트(p3)의 TOTAL 은 항상 0 이어야 한다
    const empty = meta.blocks.find((b) => b.plan.id === "p3");
    empty.totalRows.forEach((r) => {
      for (let c = 5; c < 5 + meta.weeks; c += 1) expect(ws.getCell(r, c).value.result || 0).toBe(0);
    });
    for (let d = 0; d < 5; d += 1) {
      for (let c = 5; c < 5 + meta.weeks; c += 1) {
        const total = meta.blocks.reduce((s, b) => s + (ws.getCell(b.totalRows[d], c).value.result || 0), 0);
        expect(ws.getCell(meta.sumTitle + d, c).value.result || 0).toBe(total);
      }
    }
  });

  it("프로젝트 줄은 개요(펼치기/접기) 그룹이고, 접은 상태 옵션이 줄을 숨긴다", () => {
    const open = build();
    const ws = open.getWorksheet(MAIN);
    const b = open.__trip.blocks[0];
    expect(ws.getRow(b.slotFirst).outlineLevel).toBe(1);
    expect(ws.getRow(b.slotFirst).hidden).toBeFalsy();
    const closed = build({ collapsed: true });
    expect(closed.getWorksheet(MAIN).getRow(closed.__trip.blocks[0].slotFirst).hidden).toBe(true);
  });

  it("이름 칸에 명단 목록 검증이 걸리고, 미국 사이트에는 B1 조건부 서식이 붙는다", () => {
    const wb = build();
    const ws = wb.getWorksheet(MAIN);
    const dv = Object.values(ws.dataValidations.model);
    expect(dv.some((v) => v.type === "list" && String(v.formulae[0]).includes("인원 명단"))).toBe(true);
    expect(ws.conditionalFormattings.length).toBeGreaterThan(1);
  });

  it("지난 프로젝트는 기본으로 빼고, 옵션으로 포함한다", () => {
    const old = { ...plans[1], id: "old", name: "끝난 프로젝트", start_date: "2026-01-05", end_date: "2026-03-01" };
    const input = { plans: [...plans, old], demands, assignments, members, absences, notes };
    const base = buildTripWorkbook(ExcelJS, input, { today: "2026-10-27", startWeek: "2026-10-26", weeks: 12 });
    const withPast = buildTripWorkbook(ExcelJS, input, { today: "2026-10-27", startWeek: "2026-10-26", weeks: 12, includePast: true });
    expect(base.__trip.blocks).toHaveLength(3);
    expect(withPast.__trip.blocks).toHaveLength(4);
  });

  it("엑셀 파일로 저장했다가 다시 읽어도 수식과 시트가 그대로다", async () => {
    const wb = build();
    const buf = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buf);
    expect(back.worksheets).toHaveLength(7);
    const b = wb.__trip.blocks[0];
    expect(back.getWorksheet(MAIN).getCell(b.totalRows[0], 5).value.formula).toBe(wb.getWorksheet(MAIN).getCell(b.totalRows[0], 5).value.formula);
  });

  it("종합 현황·인원별 위치 현황이 메인 시트를 수식으로 참조한다", () => {
    const wb = build();
    const sm = wb.getWorksheet("종합 현황");
    const found = [];
    sm.eachRow((row) => row.eachCell((c) => { if (c.value && c.value.formula && c.value.formula.includes(`'${MAIN}'`)) found.push(c.address); }));
    expect(found.length).toBeGreaterThan(10);
  });
});
