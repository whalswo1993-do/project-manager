import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildColumns, needOnDay, haveOnDay, needForWeek, haveForWeek, peakNeed, layoutLanes, laneCellState, laneGapRange,
  parseMemberPaste, planMemberSync, mergeMemberRow, memberChanges, dayCount, guessDept, TRIP_DEPT_LABEL, assignableDepts,
} from "../src/tripLogic.js";
import { buildMemberWorkbook, memberToRow, TEMPLATE_HEADERS } from "../src/tripTemplate.js";

// 전부 가짜 데이터
const plan = { id: "p1", start_date: "2026-11-02", end_date: "2026-12-27" };
const asg = (id, member_id, start_date, end_date, extra = {}) => ({ id, member_id, project_id: "p1", dept: "mechanical", start_date, end_date, label: null, ...extra });
const dem = (start_date, end_date, headcount) => ({ id: `d-${start_date}`, project_id: "p1", dept: "mechanical", start_date, end_date, headcount });

describe("일 단위 칸", () => {
  it("일 단위 칸은 하루씩, 주말과 주 시작을 표시한다", () => {
    const cols = buildColumns("day", "2026-11-04", 9); // 수요일을 줘도 그 주 월요일부터
    expect(cols[0]).toMatchObject({ start: "2026-11-02", end: "2026-11-02", day: true, dow: 0, weekStart: true, weekend: false });
    expect(cols[5]).toMatchObject({ start: "2026-11-07", weekend: true });
    expect(cols[7]).toMatchObject({ start: "2026-11-09", weekStart: true });
    expect(buildColumns("week", "2026-11-04", 2).map((c) => c.start)).toEqual(["2026-11-02", "2026-11-09"]);
  });
  it("하루 단위 필요·배정 인원", () => {
    const demands = [dem("2026-11-02", "2026-11-08", 3), dem("2026-11-05", "2026-11-08", 1)];
    expect(needOnDay(demands, "mechanical", "2026-11-04")).toBe(3);
    expect(needOnDay(demands, "mechanical", "2026-11-06")).toBe(4);
    expect(needOnDay(demands, "mechanical", "2026-11-09")).toBe(0);
    const a = [asg("a1", "m1", "2026-11-02", "2026-11-04"), asg("a2", "m2", "2026-11-05", "2026-11-08")];
    expect(haveOnDay(a, "mechanical", "2026-11-04")).toBe(1);
    expect(haveOnDay(a, "mechanical", "2026-11-05")).toBe(1);
  });
  it("주로 볼 때는 하루 기준 가장 많은 날이고, 교대로 이어진 두 사람은 1명이다", () => {
    const week = { start: "2026-11-02", end: "2026-11-08" };
    const rotation = [asg("a1", "m1", "2026-11-02", "2026-11-04"), asg("a2", "m2", "2026-11-05", "2026-11-08")];
    expect(haveForWeek(rotation, "mechanical", week)).toBe(1);
    const overlap = [asg("a1", "m1", "2026-11-02", "2026-11-05"), asg("a2", "m2", "2026-11-05", "2026-11-08")];
    expect(haveForWeek(overlap, "mechanical", week)).toBe(2);
    // 필요 인원: 같은 날에 겹치지 않는 두 구간은 합치지 않는다
    expect(needForWeek([dem("2026-11-02", "2026-11-04", 3), dem("2026-11-05", "2026-11-08", 2)], "mechanical", week)).toBe(3);
  });
  it("날 수는 양 끝을 포함한다", () => {
    expect(dayCount("2026-11-02", "2026-11-02")).toBe(1);
    expect(dayCount("2026-11-02", "2026-11-08")).toBe(7);
  });
});

describe("칸(슬롯) 배치", () => {
  it("계획 공수가 가장 큰 때의 인원이 칸 수", () => {
    expect(peakNeed([dem("2026-11-02", "2026-11-29", 4), dem("2026-11-30", "2027-01-31", 2)], "mechanical")).toBe(4);
    expect(peakNeed([], "mechanical")).toBe(0);
  });
  it("동시에 일하는 사람은 다른 칸, 교대로 이어지는 사람은 같은 칸", () => {
    const lanes = layoutLanes([
      asg("a1", "m1", "2026-11-02", "2026-12-27"),
      asg("a2", "m2", "2026-11-02", "2026-11-15"),
      asg("a3", "m3", "2026-11-16", "2026-12-27"), // 2번 칸 교대
      asg("a4", "m4", "2026-11-02", "2026-12-27"),
    ]);
    expect(lanes.map((l) => l.map((a) => a.id))).toEqual([["a1"], ["a2", "a3"], ["a4"]]);
  });
  it("종료일을 고쳐도 먼저 등록한 순서의 칸 위치가 바뀌지 않는다", () => {
    const before = layoutLanes([asg("a1", "m1", "2026-11-02", "2026-12-06", { created_at: "1" }), asg("a2", "m2", "2026-11-02", "2026-11-29", { created_at: "2" })]);
    const after = layoutLanes([asg("a1", "m1", "2026-11-02", "2026-11-16", { created_at: "1" }), asg("a2", "m2", "2026-11-02", "2026-11-29", { created_at: "2" })]);
    expect(before.map((l) => l[0].id)).toEqual(["a1", "a2"]);
    expect(after.map((l) => l[0].id)).toEqual(["a1", "a2"]);
  });
  it("칸 상태: 배정됨 / 필요한데 빔 / 필요 없음", () => {
    const lane = [asg("a1", "m1", "2026-11-02", "2026-11-08")];
    const week1 = { start: "2026-11-02", end: "2026-11-08" };
    const week2 = { start: "2026-11-09", end: "2026-11-15" };
    expect(laneCellState(lane, 1, week1, 2).state).toBe("filled");
    expect(laneCellState(lane, 1, week2, 2).state).toBe("gap");
    expect(laneCellState(lane, 1, week2, 1).state).toBe("idle"); // 2번 칸(index 1)은 필요 1명이면 불필요
  });
  it("빈 칸을 눌렀을 때 채울 기간: 필요한데 비어 있는 날이 이어지는 데까지", () => {
    const demands = [dem("2026-11-02", "2026-11-29", 2), dem("2026-11-30", "2026-12-27", 1)];
    const lane = [asg("a1", "m1", "2026-11-02", "2026-11-08")];
    const col = { start: "2026-11-09", end: "2026-11-15" };
    expect(laneGapRange(lane, 1, demands, "mechanical", col, plan)).toEqual({ start: "2026-11-09", end: "2026-11-29" });
    // 일 단위로 중간 날을 눌러도 그 날부터
    expect(laneGapRange(lane, 1, demands, "mechanical", { start: "2026-11-12", end: "2026-11-12" }, plan)).toEqual({ start: "2026-11-12", end: "2026-11-29" });
    // 앞칸(index 0)은 12/27까지 필요하므로 이어서 채운다
    expect(laneGapRange([], 0, demands, "mechanical", { start: "2026-11-30", end: "2026-12-06" }, plan)).toEqual({ start: "2026-11-30", end: "2026-12-27" });
  });
});

describe("팀원 표 붙여넣기 (양식)", () => {
  const header = "부서(분야)\t소속 팀\t이름\t직위\t등급\tB1 비자\t상태\t비고";
  it("양식 머리글을 읽고 예시 줄은 건너뛴다", () => {
    const r = parseMemberPaste([header, "기구\t설비기술 1팀\t(예시) 홍길동\t책임\tPL\tO\t재직\t", "비전\t비전 2팀\t갑\t선임\t\tO\t재직\t메모", "제어\t제어팀\t을\t\t\t\t퇴사\t"].join("\n"));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ name: "갑", dept: "vision", team: "비전 2팀", b1_visa: true, active: true, note: "메모" });
    expect(r.rows[1]).toMatchObject({ name: "을", dept: "control", active: false, b1_visa: false });
    expect(r.rows[0].known).toMatchObject({ rank: true, grade: true, b1: true, note: true, team: true, status: true });
  });
  it("'부서'가 소속 팀 열인 예전 표도 그대로 읽는다 (상태 열이 없으면 active 는 정하지 않는다)", () => {
    const r = parseMemberPaste("No.\t사원\t직위(25)\t현재부서\t등급\tB1 비자\t비고\n1\t가가\t책임\t설비기술 1팀\tTL\tO\t");
    expect(r.rows[0]).toMatchObject({ name: "가가", team: "설비기술 1팀", dept: "mechanical", active: undefined });
    expect(r.rows[0].known.status).toBe(false);
  });
});

describe("명단 최신화 계획", () => {
  const existing = [
    { id: "m1", name: "갑", dept: "vision", team: "비전 1팀", rank: "선임", grade: "", b1_visa: false, active: true, note: "" },
    { id: "m2", name: "을", dept: "vision", team: "비전 1팀", rank: "책임", grade: "PL", b1_visa: true, active: true, note: "" },
    { id: "m3", name: "병", dept: "control", team: "제어 1팀", rank: "주임", grade: "", b1_visa: true, active: true, note: "" },
    { id: "m4", name: "정", dept: "vision", team: "비전 2팀", rank: "사원", grade: "", b1_visa: false, active: true, note: "" },
  ];
  const row = (p) => ({ name: "", rank: "", team: "", grade: "", b1_visa: false, note: "", dept: "vision", known: { team: true, rank: true, grade: true, b1: true, note: true, status: false }, ...p });

  it("새 사람 / 달라진 사람 / 그대로인 사람 / 팀을 옮긴 사람을 가른다", () => {
    const { items } = planMemberSync([
      row({ name: "신", team: "비전 1팀" }),
      row({ name: "갑", team: "비전 1팀", rank: "책임" }),
      row({ name: "을", team: "비전 1팀", rank: "책임", grade: "PL", b1_visa: true }),
      row({ name: "정", team: "비전 3팀", rank: "사원" }),
    ], existing);
    expect(items.map((i) => i.kind)).toEqual(["new", "update", "same", "move"]);
    expect(items[1].changes).toEqual(["직위"]);
    expect(items[3].changes).toEqual(["팀"]);
    expect(items[3].match.id).toBe("m4");
  });
  it("표에 있던 부서에서 표에 없는 재직 인원은 퇴사 후보로 알려 준다 (다른 부서는 건드리지 않음)", () => {
    const { missing } = planMemberSync([row({ name: "갑", team: "비전 1팀", rank: "선임" })], existing);
    expect(missing.map((m) => m.id).sort()).toEqual(["m2", "m4"]);
  });
  it("상태가 퇴사인 새 사람은 등록하지 않고, 기존 사람은 퇴사 처리한다", () => {
    const rows = [row({ name: "신", team: "비전 1팀", active: false }), row({ name: "갑", team: "비전 1팀", rank: "선임", active: false })];
    const { items } = planMemberSync(rows, existing);
    expect(items[0].kind).toBe("skip");
    expect(items[1].merged.active).toBe(false);
    expect(items[1].changes).toEqual(["상태"]);
  });
  it("표에 열이 없으면 기존 값을 지키고, 열이 있는데 비어 있으면 비운다", () => {
    const keep = mergeMemberRow(existing[1], row({ name: "을", known: { team: false, rank: false, grade: false, b1: false, note: false, status: false } }));
    expect(keep).toMatchObject({ team: "비전 1팀", rank: "책임", grade: "PL", b1_visa: true });
    const clear = mergeMemberRow(existing[1], row({ name: "을", team: "비전 1팀", rank: "책임" }));
    expect(clear).toMatchObject({ grade: "", b1_visa: false });
    expect(memberChanges(existing[1], clear)).toEqual(["등급", "B1"]);
  });
});

describe("팀원 엑셀 양식", () => {
  it("머리글이 첫 줄이고 예시 두 줄이 들어 있으며 안내 시트가 있다", async () => {
    const wb = buildMemberWorkbook(ExcelJS, null);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["팀원 명단", "작성 안내"]);
    const ws = wb.getWorksheet("팀원 명단");
    expect(ws.getRow(1).values.slice(1)).toEqual(TEMPLATE_HEADERS);
    expect(String(ws.getCell("C2").value)).toMatch(/^\(예시\)/);
    expect(ws.getCell("A10").dataValidation.formulae[0]).toContain("기구");
    // 파일로 쓰고 다시 읽어도 깨지지 않는다
    const buffer = await wb.xlsx.writeBuffer();
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(buffer);
    expect(again.getWorksheet("팀원 명단").getRow(1).getCell(3).value).toBe("이름");
  });
  it("현재 명단은 부서별 시트로 나뉘고, 시트마다 그대로 붙여넣으면 아무것도 바뀌지 않는다 (왕복)", () => {
    const members = [
      { id: "m1", name: "갑", dept: "vision", team: "비전 1팀", rank: "선임", grade: "QS", b1_visa: true, active: true, note: "일병행" },
      { id: "m2", name: "을", dept: "mechanical", team: "", rank: "", grade: "", b1_visa: false, active: false, note: "" },
      { id: "m3", name: "병", dept: "mechanical", team: "설비기술 1팀", rank: "책임", grade: "", b1_visa: true, active: true, note: "" },
    ];
    const wb = buildMemberWorkbook(ExcelJS, members);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["기구", "비전", "작성 안내"]); // 인원이 없는 부서 시트는 만들지 않는다
    const sheetText = (name, count) => {
      const ws = wb.getWorksheet(name);
      return Array.from({ length: count + 1 }, (_, r) => TEMPLATE_HEADERS.map((_h, c) => String(ws.getRow(r + 1).getCell(c + 1).value ?? "")).join("\t")).join("\n");
    };
    const mech = parseMemberPaste(sheetText("기구", 2));
    expect(mech.rows.map((r) => r.name)).toEqual(["을", "병"]); // 팀 이름순(팀 없음이 앞)
    const vis = parseMemberPaste(sheetText("비전", 1));
    const rows = [...mech.rows, ...vis.rows];
    const { items } = planMemberSync(rows, members);
    expect(items.map((i) => i.kind)).toEqual(["same", "same", "same"]);
    expect(memberToRow(members[1])[6]).toBe("퇴사");
    // 보여 줄 부서를 정하면 그 부서 시트만
    expect(buildMemberWorkbook(ExcelJS, members, ["vision"]).worksheets.map((w) => w.name)).toEqual(["비전", "작성 안내"]);
  });
  it("팀장용 양식은 담당 부서만 고르게 하고 예시 줄도 그 부서로 채운다", () => {
    const ws = buildMemberWorkbook(ExcelJS, null, ["vision"]).getWorksheet("팀원 명단");
    expect(ws.getCell("A2").value).toBe("비전");
    expect(ws.getCell("A3").value).toBe("비전");
    expect(ws.getCell("A10").dataValidation.formulae[0]).toBe('"비전"');
  });
});

describe("PM 부서 이름", () => {
  it("화면과 엑셀에서는 PM, 예전 '소장' 표기도 같은 부서로 읽는다", () => {
    expect(TRIP_DEPT_LABEL.manager).toBe("PM");
    expect(guessDept("PM")).toBe("manager");
    expect(guessDept("소장")).toBe("manager");
    const members = [{ id: "m1", name: "갑", dept: "manager", team: "PM 1팀", rank: "", grade: "", b1_visa: false, active: true, note: "" }];
    const wb = buildMemberWorkbook(ExcelJS, members);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["PM", "작성 안내"]);
    expect(wb.getWorksheet("PM").getCell("A2").value).toBe("PM");
    expect(parseMemberPaste(["부서(분야)\t이름", "소장\t을", "PM\t병"].join("\n")).rows.map((r) => r.dept)).toEqual(["manager", "manager"]);
  });
});

describe("PM 자리 배정 대상", () => {
  it("PM 자리에는 PM과 기구 인원을 넣을 수 있고, 다른 부서 자리는 그 부서 인원만 넣는다", () => {
    expect(assignableDepts("manager")).toEqual(["manager", "mechanical"]);
    expect(assignableDepts("mechanical")).toEqual(["mechanical"]);
    expect(assignableDepts("vision")).toEqual(["vision"]);
  });
});

