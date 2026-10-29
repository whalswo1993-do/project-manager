import { describe, it, expect } from "vitest";
import {
  isUsSite, phaseColors, phaseRows, isOutTrip, absenceText, normalizeKind, ABSENCE_KINDS, awayPlace,
  addDays, mondayOf, buildWeeks, overlaps, weeksBetween, isValidISO, monthSpans, todayISO,
  needForWeek, haveForWeek, planCoverage, shortageRuns, checkAssignment, analyzeAssignments, worstLevel,
  memberWeekState, deptWeekStats, parseMemberPaste, guessDept, memberKey,
  projectsToPlans, autoDemands, buildDemands, assignmentState, isPastProject, needOnDay,
} from "../src/tripLogic.js";

// 전부 가짜 데이터 (실제 인원·PJT 는 공개 저장소에 넣지 않는다)
const plan = { id: "p1", name: "시험 PJT A", start_date: "2026-11-02", end_date: "2026-12-27", overseas: false };
const usPlan = { id: "p2", name: "시험 PJT B(해외)", start_date: "2026-11-02", end_date: "2026-12-27", overseas: true };
const members = [
  { id: "m1", name: "갑", dept: "mechanical", team: "설비기술 1팀", active: true, b1_visa: true },
  { id: "m2", name: "을", dept: "mechanical", team: "설비기술 1팀", active: true, b1_visa: false },
  { id: "m3", name: "병", dept: "mechanical", team: "설비기술 2팀", active: false, b1_visa: true },
  { id: "m4", name: "정", dept: "vision", team: "비전 1팀", active: true, b1_visa: false },
];
const asg = (id, member_id, project_id, start_date, end_date, dept = "mechanical") => ({ id, member_id, project_id, start_date, end_date, dept, label: null });

describe("날짜", () => {
  it("월요일을 구한다 (일요일은 앞 주)", () => {
    expect(mondayOf("2026-11-09")).toBe("2026-11-09"); // 월
    expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // 일
    expect(mondayOf("2026-11-11")).toBe("2026-11-09"); // 수
  });
  it("연말·윤년 경계를 넘어도 하루가 밀리지 않는다", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
  it("주를 만든다 (월~일, 7일 간격)", () => {
    const w = buildWeeks("2026-11-11", 3);
    expect(w.map((x) => x.start)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(w[0].end).toBe("2026-11-15");
    expect(buildWeeks("2026-11-09", 0)).toEqual([]);
  });
  it("기간 겹침: 하루만 닿아도 겹침, 끝이 비면 계속", () => {
    expect(overlaps("2026-11-01", "2026-11-10", "2026-11-10", "2026-11-20")).toBe(true);
    expect(overlaps("2026-11-01", "2026-11-09", "2026-11-10", "2026-11-20")).toBe(false);
    expect(overlaps("2026-11-01", null, "2030-01-01", "2030-01-02")).toBe(true);
  });
  it("주 수·날짜 검증·월 묶음", () => {
    expect(weeksBetween("2026-11-09", "2026-11-22")).toBe(2);
    expect(weeksBetween("2026-11-15", "2026-11-16")).toBe(2);
    expect(isValidISO("2026-02-30")).toBe(false);
    expect(isValidISO("2026-11-09")).toBe(true);
    expect(isValidISO("2026/11/09")).toBe(false);
    const spans = monthSpans(buildWeeks("2026-11-09", 5)); // 11/9 11/16 11/23 11/30 12/7
    expect(spans.map((s) => [s.shortLabel, s.span])).toEqual([["11월", 4], ["12월", 1]]);
  });
  it("오늘 날짜는 로컬 기준 문자열", () => {
    expect(todayISO(new Date(2026, 10, 5))).toBe("2026-11-05");
  });
});

describe("계획 공수 대비 배정", () => {
  const weeks = buildWeeks("2026-11-02", 4); // 11/2 11/9 11/16 11/23
  const demands = [
    { id: "d1", project_id: "p1", dept: "mechanical", start_date: "2026-11-02", end_date: "2026-11-15", headcount: 3 },
    { id: "d2", project_id: "p1", dept: "mechanical", start_date: "2026-11-09", end_date: "2026-11-29", headcount: 1 },
  ];
  it("겹치는 공수 구간은 더한다", () => {
    expect(weeks.map((w) => needForWeek(demands, "mechanical", w))).toEqual([3, 4, 1, 1]);
    expect(needForWeek(demands, "vision", weeks[0])).toBe(0);
  });
  it("배정 수는 서로 다른 사람으로 센다 (같은 사람 중복은 1명)", () => {
    const a = [asg("a1", "m1", "p1", "2026-11-02", "2026-11-15"), asg("a2", "m1", "p1", "2026-11-09", "2026-11-20"), asg("a3", "m2", "p1", "2026-11-02", "2026-11-08")];
    expect(haveForWeek(a, "mechanical", weeks[0])).toBe(2);
    expect(haveForWeek(a, "mechanical", weeks[1])).toBe(1);
    expect(haveForWeek(a, "mechanical", weeks[3])).toBe(0);
  });
  it("이름 없는 자리(외주 등)도 한 명으로 센다", () => {
    const a = [{ id: "s1", member_id: null, label: "외주1", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-11-08" }];
    expect(haveForWeek(a, "vision", weeks[0])).toBe(1);
  });
  it("부족(gap>0)·초과(gap<0)를 계산하고, 데이터 없는 부서는 뺀다", () => {
    const a = [asg("a1", "m1", "p1", "2026-11-02", "2026-11-29"), asg("a3", "m2", "p1", "2026-11-09", "2026-11-15")];
    const cov = planCoverage(demands, a, weeks);
    expect(Object.keys(cov)).toEqual(["mechanical"]);
    expect(cov.mechanical.map((c) => c.gap)).toEqual([2, 2, 0, 0]);
    const over = planCoverage(demands, [asg("x1", "m1", "p1", "2026-11-23", "2026-11-29"), asg("x2", "m2", "p1", "2026-11-23", "2026-11-29")], weeks);
    expect(over.mechanical[3].gap).toBe(-1);
  });
});

describe("부족 구간", () => {
  const weeks = buildWeeks("2026-11-02", 6);
  const demands = [{ id: "d", project_id: "p1", dept: "vision", start_date: "2026-11-02", end_date: "2026-12-13", headcount: 2 }];
  it("모자란 주를 이어 붙인다", () => {
    const a = [
      { id: "1", member_id: "m4", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-11-15" },
      { id: "2", member_id: "m5", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-11-08" },
    ];
    // 주별 gap: [0, 1, 2, 2, 2, 2]
    expect(shortageRuns(demands, a, weeks)).toEqual([{ dept: "vision", start: "2026-11-09", end: "2026-12-13", gap: 2 }]);
  });
  it("지난 주는 제외하고, 다 채워졌으면 비어 있다", () => {
    const none = shortageRuns(demands, [], weeks, "2026-11-23");
    expect(none).toEqual([{ dept: "vision", start: "2026-11-23", end: "2026-12-13", gap: 2 }]);
    const full = [
      { id: "1", member_id: "m4", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-12-13" },
      { id: "2", member_id: "m5", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-12-13" },
    ];
    expect(shortageRuns(demands, full, weeks)).toEqual([]);
  });
  it("중간에 채워진 주가 끼면 구간이 둘로 나뉜다", () => {
    const a = [
      { id: "1", member_id: "m4", dept: "vision", project_id: "p1", start_date: "2026-11-02", end_date: "2026-12-13" },
      { id: "2", member_id: "m5", dept: "vision", project_id: "p1", start_date: "2026-11-16", end_date: "2026-11-22" },
    ];
    expect(shortageRuns(demands, a, weeks).map((r) => [r.start, r.end])).toEqual([["2026-11-02", "2026-11-15"], ["2026-11-23", "2026-12-13"]]);
  });
});

describe("충돌·경고", () => {
  const ctx = (assignments, absences = [], plans = [plan, usPlan]) => ({ assignments, absences, members, plans });
  it("같은 사람이 다른 PJT 와 기간이 겹치면 bad", () => {
    const a1 = asg("a1", "m1", "p1", "2026-11-02", "2026-11-15");
    const a2 = asg("a2", "m1", "p2", "2026-11-10", "2026-11-30");
    const r = analyzeAssignments(ctx([a1, a2]));
    expect(Object.keys(r).sort()).toEqual(["a1", "a2"]);
    expect(r.a1[0].type).toBe("overlap");
    expect(r.a1[0].message).toContain("시험 PJT B");
    expect(worstLevel(r.a1)).toBe("bad");
  });
  it("이어붙은 일정(끝 다음날 시작)은 겹침이 아니다", () => {
    const r = analyzeAssignments(ctx([asg("a1", "m1", "p1", "2026-11-02", "2026-11-15"), asg("a2", "m1", "p2", "2026-11-16", "2026-11-30")]));
    expect(r).toEqual({});
  });
  it("부재 기간과 겹치면 bad, 끝이 비면 계속 부재", () => {
    const r = analyzeAssignments(ctx([asg("a1", "m1", "p1", "2026-12-01", "2026-12-10")], [{ id: "ab1", member_id: "m1", kind: "leave", start_date: "2026-11-20", end_date: null, note: "육아휴직" }]));
    expect(r.a1[0].type).toBe("absent");
    expect(r.a1[0].message).toContain("육아휴직");
  });
  it("해외 PJT 에 B1 없는 사람은 warn, 있는 사람은 통과", () => {
    const r = analyzeAssignments(ctx([asg("a1", "m2", "p2", "2026-11-02", "2026-11-15"), asg("a2", "m1", "p2", "2026-11-02", "2026-11-15")]));
    expect(r.a1[0]).toMatchObject({ type: "visa", level: "warn" });
    expect(r.a2).toBeUndefined();
  });
  it("비활성 인원과 PJT 기간 밖 배정을 알린다", () => {
    const r = analyzeAssignments(ctx([asg("a1", "m3", "p1", "2026-11-02", "2026-11-15"), asg("a2", "m1", "p1", "2026-12-20", "2027-01-10")]));
    expect(r.a1[0].type).toBe("inactive");
    expect(r.a2[0]).toMatchObject({ type: "outside", level: "info" });
  });
  it("후보 검사: 저장 전 배정이 기존과 겹치는지 (자기 자신은 제외)", () => {
    const existing = asg("a1", "m1", "p1", "2026-11-02", "2026-11-15");
    const cand = { id: "__new__", member_id: "m1", project_id: "p2", dept: "mechanical", start_date: "2026-11-10", end_date: "2026-11-20" };
    expect(checkAssignment(cand, ctx([existing])).map((i) => i.type)).toContain("overlap");
    expect(checkAssignment(existing, ctx([existing])).map((i) => i.type)).not.toContain("overlap");
    expect(checkAssignment({ ...cand, member_id: null }, ctx([existing]))).toEqual([]);
  });
});

describe("인원 현황", () => {
  const week = { start: "2026-11-09", end: "2026-11-15" };
  const c = {
    plans: [plan, usPlan],
    assignments: [asg("a1", "m1", "p1", "2026-11-02", "2026-11-30"), asg("a2", "m1", "p2", "2026-11-12", "2026-11-14")],
    absences: [{ id: "ab", member_id: "m2", kind: "trip", start_date: "2026-11-01", end_date: "2026-11-10" }],
  };
  it("한 주의 상태를 구분한다", () => {
    expect(memberWeekState(members[0], week, c).state).toBe("double");
    expect(memberWeekState(members[1], week, c).state).toBe("absent");
    expect(memberWeekState(members[3], week, c).state).toBe("free");
    expect(memberWeekState(members[0], { start: "2026-12-07", end: "2026-12-13" }, c).state).toBe("free");
    const both = { ...c, absences: [{ id: "ab2", member_id: "m1", kind: "leave", start_date: "2026-11-09", end_date: "2026-11-09" }] };
    expect(memberWeekState(members[0], week, both).state).toBe("conflict");
  });
  it("부서 통계는 활동 인원만 센다", () => {
    const mech = members.filter((m) => m.dept === "mechanical");
    expect(deptWeekStats(mech, week, c)).toEqual({ total: 2, b1: 1, assigned: 1, away: 1, absent: 0, free: 0 });
  });
});

describe("명단 붙여넣기", () => {
  it("부서 추정", () => {
    expect(guessDept("설비기술 2팀")).toBe("mechanical");
    expect(guessDept("PLC제어 1팀")).toBe("control");
    expect(guessDept("비전 2팀")).toBe("vision");
    expect(guessDept("전장팀_하네스")).toBe("electrical");
    expect(guessDept("PM 1팀")).toBe("manager");
    expect(guessDept("ME 팀")).toBeNull();
    expect(guessDept("")).toBeNull();
  });
  it("B1 비자 시트 모양(번호·머리글 포함)을 읽는다", () => {
    const text = [
      "No.\t사원\t직위(25)\t현재부서\t등급\tB1 비자\t비고",
      "1\t가가\t책임\t설비기술 1팀\tTL\tO\t",
      "2\t나나\t주임\t설비기술 1팀\tUA\tX\t병특",
      "3\t다다\t선임\tPM 2팀\tPM\tO\t",
    ].join("\n");
    const r = parseMemberPaste(text);
    expect(r.usedHeader).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ name: "가가", rank: "책임", team: "설비기술 1팀", grade: "TL", b1_visa: true, dept: "mechanical" });
    expect(r.rows[1]).toMatchObject({ b1_visa: false, note: "병특" });
    expect(r.rows[2].dept).toBe("manager");
  });
  it("머리글이 없어도 이름 직위 부서 등급 B1 비고 순서로 읽고, 앞 번호는 버린다", () => {
    const r = parseMemberPaste("7\t라라\t사원\t비전 1팀\tQS\tY\t일병행\n\n8\t마마\t선임\t제어팀\tPS\tX");
    expect(r.usedHeader).toBe(false);
    expect(r.rows.map((x) => [x.name, x.dept, x.b1_visa])).toEqual([["라라", "vision", true], ["마마", "control", false]]);
  });
  it("이름 없는 줄은 건너뛰고 알려 준다", () => {
    const r = parseMemberPaste("이름\t직위\t부서\n\t책임\t비전\n바바\t책임\t비전");
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
  });
  it("같은 사람 판정 키는 대소문자·공백을 무시한다", () => {
    expect(memberKey({ dept: "vision", team: "비전 1팀 ", name: " Kim " })).toBe(memberKey({ dept: "vision", team: "비전 1팀", name: "kim" }));
  });
});

describe("프로젝트 일정 연동", () => {
  const deptKeyOf = (name) => ({ "기구": "mechanical", "비전": "vision", "소장": "manager", "비전 외주": "vision", "기구 외주": "mechanical", "안전": "safety" }[name] || null); // 외주는 본 부서 키로 합친다
  const daily = (from, days, n) => Object.fromEntries(Array.from({ length: days }, (_, i) => [addDays(from, i), n]));
  const project = (extra = {}) => ({
    id: "pr1", name: "시험 프로젝트", site: "SITE-A", customer: "SK on", startDate: "2026-11-02", endDate: "2027-01-31", status: "진행중",
    milestones: [{ name: "설계", startDate: "2026-11-02", endDate: "2026-11-15" }, { name: "나쁜 날짜", startDate: "2026-11-20", endDate: "2026-11-10" }],
    manpower: { departments: { "기구": { daily: { ...daily("2026-11-02", 14, 2), ...daily("2026-11-16", 14, 4) } }, "비전": { daily: daily("2026-11-04", 3, 1) }, "비전 외주": { daily: daily("2026-11-02", 7, 2) }, "안전": { daily: daily("2026-11-02", 7, 1) } } },
    ...extra,
  });

  it("프로젝트를 출장 화면용으로 바꾼다 (날짜가 이상한 프로젝트는 제외, 미국 사이트만 B1 확인 대상, 시작일 순)", () => {
    const plans = projectsToPlans([project(), project({ id: "bad", startDate: "", endDate: "2027-01-01" }), project({ id: "rev", startDate: "2027-02-01", endDate: "2027-01-01" }), project({ id: "early", startDate: "2026-10-01" }), project({ id: "us", site: "HSBMA 3Line" })]);
    expect(plans.map((p) => p.id)).toEqual(["early", "pr1", "us"]);
    expect(plans[1]).toMatchObject({ name: "시험 프로젝트", site: "SITE-A", start_date: "2026-11-02", end_date: "2027-01-31", overseas: false });
    expect(plans[0].overseas).toBe(false);
    expect(plans.find((p) => p.id === "us").overseas).toBe(true);
    expect(plans[1].phases).toEqual([{ label: "설계", start: "2026-11-02", end: "2026-11-15" }]);
  });
  it("마스터 플랜 공수를 일 단위 구간으로 바꾼다 (같은 인원이 이어지면 한 구간, 외주는 본 부서에 합치고 안전은 제외)", () => {
    const d = autoDemands("pr1", project().manpower, deptKeyOf);
    const mech = d.filter((x) => x.dept === "mechanical");
    expect(mech.map((x) => [x.start_date, x.end_date, x.headcount])).toEqual([["2026-11-02", "2026-11-15", 2], ["2026-11-16", "2026-11-29", 4]]);
    // 비전: 11/2~11/3 외주 2 + 11/4~11/6 (내부 1 + 외주 2) + 11/7~11/8 외주 2
    expect(d.filter((x) => x.dept === "vision").map((x) => [x.start_date, x.end_date, x.headcount, x.sub])).toEqual([
      ["2026-11-02", "2026-11-03", 2, 2], ["2026-11-04", "2026-11-06", 3, 2], ["2026-11-07", "2026-11-08", 2, 2],
    ]);
    expect(d.some((x) => x.dept === "safety")).toBe(false);
    expect(d.every((x) => x.auto && x.project_id === "pr1")).toBe(true);
  });
  it("한 주 안에서 인원이 바뀌면 그 날부터 바뀐 값을 쓴다 (주 단위로 부풀리지 않는다)", () => {
    const mp = { departments: { "기구": { daily: { ...daily("2026-11-02", 3, 2), ...daily("2026-11-05", 4, 5) } } } };
    const d = autoDemands("p", mp, deptKeyOf);
    expect(d.map((x) => [x.start_date, x.end_date, x.headcount])).toEqual([["2026-11-02", "2026-11-04", 2], ["2026-11-05", "2026-11-08", 5]]);
    const week = { start: "2026-11-02", end: "2026-11-08" };
    expect(needOnDay(d, "mechanical", "2026-11-03")).toBe(2);
    expect(needForWeek(d, "mechanical", week)).toBe(5); // 주 단위로 볼 때만 그 주의 최대
  });
  it("계획 공수 정합성: 부서별 하루 인원 합이 마스터 플랜(외주 포함)의 하루 인원 합과 정확히 같다", () => {
    const mp = {
      departments: {
        "기구": { daily: { ...daily("2026-11-02", 10, 3), ...daily("2026-11-14", 5, 1) } },
        "기구 외주": { daily: daily("2026-11-05", 6, 2) },
        "비전": { daily: daily("2026-11-02", 4, 1) },
        "비전 외주": { daily: daily("2026-11-04", 4, 3) },
        "안전": { daily: daily("2026-11-02", 9, 1) },
      },
    };
    const d = autoDemands("p", mp, deptKeyOf);
    const expectMech = {};
    [["기구"], ["기구 외주"]].forEach(([n]) => Object.entries(mp.departments[n].daily).forEach(([day, c]) => { expectMech[day] = (expectMech[day] || 0) + c; }));
    Object.entries(expectMech).forEach(([day, c]) => expect(needOnDay(d, "mechanical", day)).toBe(c));
    // 사람·일 합계도 같다 (일 단위로 쪼개 더해 본다)
    const manday = (dept) => { let sum = 0; for (let day = "2026-10-30"; day <= "2026-11-30"; day = addDays(day, 1)) sum += needOnDay(d, dept, day); return sum; };
    expect(manday("mechanical")).toBe(Object.values(expectMech).reduce((x, y) => x + y, 0));
    expect(manday("vision")).toBe(4 * 1 + 4 * 3);
    expect(d.filter((x) => x.dept === "mechanical" && x.sub > 0).length).toBeGreaterThan(0); // 외주 몫이 표시용으로 남는다
  });
  it("공수가 없거나 모양이 이상하면 빈 목록", () => {
    expect(autoDemands("p", null, deptKeyOf)).toEqual([]);
    expect(autoDemands("p", { departments: { "기구": { daily: { "나쁜날짜": 3, "2026-11-02": 0 } } } }, deptKeyOf)).toEqual([]);
  });
  it("수동 입력이 있는 부서는 자동 공수를 버리고 수동만 쓴다", () => {
    const plans = projectsToPlans([project()]);
    const manual = [{ id: "m1", project_id: "pr1", dept: "mechanical", start_date: "2026-11-02", end_date: "2026-12-27", headcount: 9 }];
    const d = buildDemands(plans, manual, deptKeyOf);
    expect(d.filter((x) => x.dept === "mechanical").map((x) => [x.headcount, x.auto])).toEqual([[9, false]]);
    expect(d.some((x) => x.dept === "vision" && x.auto)).toBe(true);
  });
  it("지난 프로젝트 판정", () => {
    expect(isPastProject({ end_date: "2026-10-26" }, "2026-10-27")).toBe(true);
    expect(isPastProject({ end_date: "2026-10-27" }, "2026-10-27")).toBe(false);
  });
  it("배정 상태: 아무도 없으면 none, 모자라면 short, 다 채우면 ok", () => {
    const plan = projectsToPlans([project()])[0];
    const demands = [{ id: "d", project_id: "pr1", dept: "vision", start_date: "2026-11-02", end_date: "2026-11-15", headcount: 1 }];
    expect(assignmentState(plan, demands, [], "2026-10-27").state).toBe("none");
    expect(assignmentState(plan, [], [], "2026-10-27").state).toBe("nodemand"); // 공수가 없으면 배정 필요로 보지 않는다
    const a = (id, end) => ({ id, project_id: "pr1", dept: "vision", member_id: id, start_date: "2026-11-02", end_date: end });
    expect(assignmentState(plan, demands, [a("m4", "2026-11-08")], "2026-10-27")).toEqual({ state: "short", shortDepts: ["vision"] });
    expect(assignmentState(plan, demands, [a("m4", "2026-11-15")], "2026-10-27").state).toBe("ok");
  });
});

describe("미국 사이트 B1 확인 · 마일스톤 색", () => {
  it("HSBMA·SKBA·SKOT 사이트만 B1 확인 대상이다", () => {
    ["HSBMA", "hsbma 3Line", "SKBA", "SKBA 8~12Line", "SKOT", "SK ON SKOT"].forEach((site) => expect(isUsSite(site)).toBe(true));
    ["SKO 서산", "SKOTA", "SDI 울산", "SKOY", "", null, undefined].forEach((site) => expect(isUsSite(site)).toBe(false));
  });
  it("마일스톤마다 서로 다른 색 번호를 주고, 같은 이름은 같은 시작 색을 쓴다", () => {
    const phases = ["J/C", "공정 세팅", "Test Run", "납품", "설계", "제작", "출하", "설치", "시운전"].map((label) => ({ label }));
    const colors = phaseColors(phases);
    expect(new Set(colors.slice(0, 8)).size).toBe(8); // 한 프로젝트 안에서는 겹치지 않는다
    expect(colors.every((c) => c >= 0 && c < 8)).toBe(true);
    expect(phaseColors([{ label: "J/C" }])).toEqual([colors[0]]);
    expect(phaseColors([])).toEqual([]);
  });
});

describe("마일스톤 줄 나누기", () => {
  const cols = buildWeeks("2027-01-04", 4); // 1/4 1/11 1/18 1/25
  const colors = [0, 1, 2];
  it("일정이 겹치는 마일스톤은 서로 다른 줄에 모두 놓는다", () => {
    const phases = [
      { label: "FOB", start: "2027-01-11", end: "2027-01-24" },
      { label: "2라인 이설", start: "2027-01-18", end: "2027-01-24" },
      { label: "발송 준비", start: "2027-01-04", end: "2027-01-10" },
    ];
    const rows = phaseRows(cols, phases, colors);
    expect(rows.length).toBe(2);
    const all = rows.flat().map((x) => x.label).sort();
    expect(all).toEqual(["2라인 이설", "FOB", "발송 준비"]); // 하나도 빠지지 않는다
    // 같은 줄 안에서는 칸이 겹치지 않는다
    rows.forEach((r) => r.forEach((x, i) => { if (i) expect(x.from).toBeGreaterThan(r[i - 1].to); }));
    expect(rows[0].map((x) => x.label)).toEqual(["발송 준비", "FOB"]);
    expect(rows[1].map((x) => x.label)).toEqual(["2라인 이설"]);
  });
  it("겹치지 않으면 한 줄, 보이는 칸 밖의 마일스톤은 뺀다", () => {
    const rows = phaseRows(cols, [{ label: "A", start: "2027-01-04", end: "2027-01-10" }, { label: "B", start: "2027-01-11", end: "2027-01-17" }, { label: "먼 훗날", start: "2027-06-01", end: "2027-06-10" }], colors);
    expect(rows.length).toBe(1);
    expect(rows[0].map((x) => x.label)).toEqual(["A", "B"]);
    expect(phaseRows(cols, [], [])).toEqual([]);
  });
});

describe("미등록 프로젝트 대응 (CS·고객사 대응·테스트)", () => {
  const members2 = [
    { id: "m1", name: "갑", dept: "mechanical", team: "t", active: true, b1_visa: false },
    { id: "m2", name: "을", dept: "mechanical", team: "t", active: true, b1_visa: false },
    { id: "m3", name: "병", dept: "mechanical", team: "t", active: true, b1_visa: false },
  ];
  const ab = (id, member_id, kind, location, start_date = "2026-11-02", end_date = "2026-11-08") => ({ id, member_id, kind, location, start_date, end_date });
  const week = { start: "2026-11-02", end: "2026-11-08" };
  const ctx2 = (absences, assignments = []) => ({ assignments, absences, members: members2, plans: [] });

  it("미등록 프로젝트 대응 종류를 가른다", () => {
    ["cs", "customer", "test", "trip"].forEach((k) => expect(isOutTrip(k)).toBe(true)); // cs 는 예전 값(고객사 대응으로 본다)
    ["leave", "training", "other"].forEach((k) => expect(isOutTrip(k)).toBe(false));
    expect(absenceText({ kind: "customer", location: "SKO 서산" })).toBe("고객사 대응 · SKO 서산");
    expect(absenceText({ kind: "cs", location: "SKO 서산" })).toBe("고객사 대응 · SKO 서산"); // 예전 CS 대응은 고객사 대응으로 합쳐 보인다
    expect(normalizeKind("cs")).toBe("customer");
    expect(awayPlace({ kind: "customer", location: " 현대 인성 " })).toBe("현대 인성"); // 간 곳이 칸 이름
    expect(awayPlace({ kind: "test", location: "" })).toBe("테스트"); // 장소가 없으면 종류 이름
    expect(ABSENCE_KINDS.map((k) => k.key)).not.toContain("cs");
    expect(absenceText({ kind: "leave" })).toBe("휴직·휴가");
  });
  it("부서 통계에서 외부 출장(away)과 휴직 등 부재(absent)를 따로 센다", () => {
    const stats = deptWeekStats(members2, week, ctx2([ab("a1", "m1", "cs", "SKO 서산"), ab("a2", "m2", "leave", "")]));
    expect(stats).toMatchObject({ total: 3, away: 1, absent: 1, assigned: 0, free: 1 });
  });
  it("그 사람의 그 주 상태에 어디에 가 있는지 담긴다", () => {
    const s = memberWeekState(members2[0], week, ctx2([ab("a1", "m1", "test", "고객사 설비")]));
    expect(s.state).toBe("absent");
    expect(absenceText(s.absence)).toBe("테스트 · 고객사 설비");
  });
  it("프로젝트 배정이 외부 출장과 겹치면 장소와 함께 경고한다", () => {
    const a = { id: "x", member_id: "m1", project_id: "p1", dept: "mechanical", start_date: "2026-11-03", end_date: "2026-11-05" };
    const issues = checkAssignment(a, { assignments: [a], absences: [ab("a1", "m1", "cs", "SKO 서산")], members: members2, plans: [plan] });
    expect(issues.map((i) => i.type)).toContain("absent");
    expect(issues.find((i) => i.type === "absent").message).toContain("고객사 대응 · SKO 서산");
  });
});

import { dayOverview, nextNotableDay } from "../src/tripLogic";
describe("날짜 띠: dayOverview / nextNotableDay", () => {
  const plans = [{ id: "p1", name: "SKBA 4Line" }];
  const demands = [{ project_id: "p1", dept: "vision", start_date: "2026-11-02", end_date: "2026-11-06", headcount: 2 }];
  const assignments = [{ id: "a1", project_id: "p1", dept: "vision", member_id: "m1", start_date: "2026-11-02", end_date: "2026-11-04" }];
  const members = [{ id: "m1", name: "홍길동", dept: "vision" }];
  const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"];
  const ov = dayOverview(days, { plans, demands, assignments, members, depts: ["vision"] });

  it("계획 공수보다 배정이 적은 날을 부족으로 센다", () => {
    expect(ov.get("2026-11-01").short).toBe(0);
    expect(ov.get("2026-11-03").short).toBe(1); // 필요 2 - 배정 1
    expect(ov.get("2026-11-05").short).toBe(2); // 필요 2 - 배정 0
    expect(ov.get("2026-11-07").short).toBe(0);
  });
  it("출장 시작·종료를 변동으로 표시한다", () => {
    expect(ov.get("2026-11-02").events.map((e) => e.type)).toEqual(["start"]);
    expect(ov.get("2026-11-04").events.map((e) => e.type)).toEqual(["end"]);
  });
  it("변동일 이동은 이어지는 부족 구간의 첫 날만 밟는다", () => {
    expect(nextNotableDay(ov, "2026-11-01", 1)).toBe("2026-11-02");
    expect(nextNotableDay(ov, "2026-11-02", 1)).toBe("2026-11-04");
    expect(nextNotableDay(ov, "2026-11-04", 1)).toBe("2026-11-05");
    expect(nextNotableDay(ov, "2026-11-05", 1)).toBeNull();
    expect(nextNotableDay(ov, "2026-11-05", -1)).toBe("2026-11-04");
  });
});
