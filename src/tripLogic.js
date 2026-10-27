// 출장자 관리: 화면과 무관한 계산 로직 (주차 만들기, 계획 공수 대비 배정, 충돌 판정, 명단 붙여넣기 해석).
// 날짜는 전부 'YYYY-MM-DD' 문자열이고, 시간대 때문에 하루가 밀리지 않도록 UTC 로만 계산한다.

export const TRIP_DEPTS = [
  { key: "mechanical", label: "기구" },
  { key: "vision", label: "비전" },
  { key: "control", label: "제어" },
  { key: "electrical", label: "전장" },
  { key: "manager", label: "PM" },
];
export const TRIP_DEPT_LABEL = Object.fromEntries(TRIP_DEPTS.map((d) => [d.key, d.label]));

// 한 부서 자리에 다른 부서 인원도 넣을 수 있는 경우: PM(manager) 자리에는 PM 인원과 기구 인원을 모두 넣는다.
// (DB 의 trip_assignment_check 트리거도 같은 규칙이다)
const EXTRA_ASSIGNABLE = { manager: ["mechanical"] };
/** 이 부서 자리에 배정할 수 있는 인원의 부서들 (자기 부서가 맨 앞) */
export const assignableDepts = (dept) => [dept, ...(EXTRA_ASSIGNABLE[dept] || [])];

// B1 비자가 필요한 미국 사이트. 프로젝트의 Site 가 이 중 하나면 출장자의 B1 보유를 확인한다(다른 해외 사이트는 해당 없음).
export const US_SITES = ["HSBMA", "SKBA", "SKOT"];
export function isUsSite(site) {
  const text = String(site || "").toUpperCase();
  return US_SITES.some((name) => new RegExp(`(^|[^A-Z0-9])${name}([^A-Z0-9]|$)`).test(text));
}

// 프로젝트로 등록되지 않은 대응 일정(고객사 대응·테스트 등)과 교육·휴직.
// out = 본사를 떠나 어딘가에 가 있는 일정(어디에 가 있는지 location 을 적는다). CS 대응은 고객사 대응에 합쳤다.
export const ABSENCE_KINDS = [
  { key: "customer", label: "고객사 대응", optionLabel: "고객사 대응 (CS 포함)", out: true },
  { key: "test", label: "테스트", out: true },
  { key: "trip", label: "기타 출장", out: true },
  { key: "training", label: "교육", out: false },
  { key: "leave", label: "휴직·휴가", out: false },
  { key: "other", label: "기타", out: false },
];
// 예전에 "CS 대응"(cs)으로 저장된 일정은 고객사 대응으로 본다 (DB 값은 그대로 두고 화면에서 합친다)
const LEGACY_KIND = { cs: "customer" };
export const normalizeKind = (kind) => LEGACY_KIND[kind] || kind;
export const ABSENCE_KIND_LABEL = { ...Object.fromEntries(ABSENCE_KINDS.map((k) => [k.key, k.label])), cs: "고객사 대응" };
const OUT_KINDS = new Set(ABSENCE_KINDS.filter((k) => k.out).map((k) => k.key));
/** 프로젝트에 배정된 것은 아니지만 본사 밖(고객사 대응·테스트 등)에 나가 있는 일정인가 */
export const isOutTrip = (kind) => OUT_KINDS.has(normalizeKind(kind));
/** 어디에 가 있는지: 적어 둔 장소, 없으면 종류 이름 */
export const awayPlace = (ab) => String(ab?.location || "").trim() || ABSENCE_KIND_LABEL[ab?.kind] || "기타";
/** "고객사 대응 · SKO 서산" 처럼 종류와 장소를 한 줄로 */
export const absenceText = (ab) => `${ABSENCE_KIND_LABEL[ab?.kind] || "부재"}${ab?.location ? ` · ${ab.location}` : ""}`;

export const PLAN_STATUS = [
  { key: "planning", label: "계획" },
  { key: "confirmed", label: "공수 확정" },
  { key: "done", label: "종료" },
];
export const PLAN_STATUS_LABEL = Object.fromEntries(PLAN_STATUS.map((s) => [s.key, s.label]));

// ───────── 날짜 ─────────
const DAY_MS = 86400000;
const OPEN_END = "9999-12-31";

export function isValidISO(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  return toISO(t) === value;
}

export function parseISO(value) {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function toISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  return toISO(parseISO(iso) + days * DAY_MS);
}

/** 그 날짜가 속한 주의 월요일 */
export function mondayOf(iso) {
  const dow = new Date(parseISO(iso)).getUTCDay(); // 0 = 일요일
  return addDays(iso, -((dow + 6) % 7));
}

/** 이 컴퓨터의 오늘 날짜(로컬 기준) */
export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** startISO 가 속한 주부터 count 주. 한 주 = 월~일 */
export function buildWeeks(startISO, count) {
  const first = mondayOf(startISO);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const start = addDays(first, i * 7);
    return { key: start, start, end: addDays(start, 6) };
  });
}

/**
 * 화면의 시간 칸. mode = "week"(월~일 한 주) | "day"(하루). startISO 가 속한 주(일 단위도 그 주 월요일)부터 count 칸.
 * day 칸에는 weekend(토·일)와 dow(0=월 … 6=일), weekStart 가 붙는다.
 */
export function buildColumns(mode, startISO, count) {
  if (mode !== "day") return buildWeeks(startISO, count);
  const first = mondayOf(startISO);
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const day = addDays(first, i);
    const dow = i % 7;
    return { key: day, start: day, end: day, day: true, dow, weekend: dow >= 5, weekStart: dow === 0 };
  });
}

export const DOW_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

/** 두 기간이 하루라도 겹치는가. end 가 비어 있으면 "계속"으로 본다. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= (bEnd || OPEN_END) && bStart <= (aEnd || OPEN_END);
}

/** 시작일과 종료일을 모두 포함한 날 수 */
export function dayCount(startISO, endISO) {
  return Math.round((parseISO(endISO) - parseISO(startISO)) / DAY_MS) + 1;
}

export function weeksBetween(startISO, endISO) {
  const first = mondayOf(startISO);
  const last = mondayOf(endISO);
  return Math.round((parseISO(last) - parseISO(first)) / (7 * DAY_MS)) + 1;
}

/** '2026-11-09' → '11/9' */
export function shortDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  return `${m}/${d}`;
}

export function rangeLabel(start, end) {
  return end ? `${shortDate(start)} ~ ${shortDate(end)}` : `${shortDate(start)} ~ 계속`;
}

/** 주 배열을 월별로 묶는다(월요일 기준) → [{ label, span }] */
export function monthSpans(weeks) {
  const spans = [];
  weeks.forEach((w) => {
    const [y, m] = w.start.split("-").map(Number);
    const key = `${y}-${m}`;
    const last = spans[spans.length - 1];
    if (last && last.key === key) last.span += 1;
    else spans.push({ key, label: `${y}년 ${m}월`, shortLabel: `${m}월`, span: 1 });
  });
  return spans;
}

// ───────── 공수 대비 배정 ─────────

/** 하루의 계획 공수 (그날을 포함하는 같은 부서 구간의 인원을 더한다) */
export function needOnDay(demands, dept, iso) {
  let sum = 0;
  demands.forEach((d) => {
    if (d.dept === dept && d.start_date <= iso && iso <= d.end_date) sum += Number(d.headcount) || 0;
  });
  return sum;
}

/** 하루에 배정된 서로 다른 사람(또는 이름 없는 자리)의 수 */
export function haveOnDay(assignments, dept, iso) {
  const keys = new Set();
  assignments.forEach((a) => {
    if (a.dept === dept && a.start_date <= iso && iso <= (a.end_date || OPEN_END)) keys.add(a.member_id || `slot:${a.id}`);
  });
  return keys.size;
}

function daysOf(period) {
  const days = [];
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** 기간(한 날 또는 한 주) 안에서 계획 공수가 가장 큰 날의 인원 */
export function needForWeek(demands, dept, week) {
  const mine = demands.filter((d) => d.dept === dept && overlaps(d.start_date, d.end_date, week.start, week.end));
  if (mine.length === 0) return 0;
  return Math.max(...daysOf(week).map((day) => needOnDay(mine, dept, day)));
}

/** 기간 안에서 동시에 배정된 인원이 가장 많은 날의 인원 (교대로 이어 붙은 사람은 겹치지 않으므로 1명) */
export function haveForWeek(assignments, dept, week) {
  const mine = assignments.filter((a) => a.dept === dept && overlaps(a.start_date, a.end_date, week.start, week.end));
  if (mine.length === 0) return 0;
  return Math.max(...daysOf(week).map((day) => haveOnDay(mine, dept, day)));
}

/**
 * 한 PJT 의 부서별·주별 공수 대비 배정. 공수나 배정이 하나도 없는 부서는 넣지 않는다.
 * gap > 0 = 부족, gap < 0 = 초과.
 */
export function planCoverage(demands, assignments, weeks) {
  const result = {};
  TRIP_DEPTS.forEach(({ key }) => {
    const hasData = demands.some((d) => d.dept === key) || assignments.some((a) => a.dept === key);
    if (!hasData) return;
    result[key] = weeks.map((week) => {
      const need = needForWeek(demands, key, week);
      const have = haveForWeek(assignments, key, week);
      return { need, have, gap: need - have };
    });
  });
  return result;
}

/**
 * 공수보다 배정이 모자란 구간을 부서별로 이어 붙여 돌려준다. fromISO 보다 앞선(지난) 주는 보지 않는다.
 * → [{ dept, start, end, gap }]  (gap = 그 구간에서 가장 크게 모자란 인원)
 */
export function shortageRuns(demands, assignments, weeks, fromISO = "") {
  const coverage = planCoverage(demands, assignments, weeks);
  const runs = [];
  Object.entries(coverage).forEach(([dept, cells]) => {
    let run = null;
    cells.forEach((cell, i) => {
      const w = weeks[i];
      const short = cell.gap > 0 && w.end >= fromISO;
      if (short) {
        if (run) {
          run.end = w.end;
          run.gap = Math.max(run.gap, cell.gap);
        } else {
          run = { dept, start: w.start, end: w.end, gap: cell.gap };
        }
      } else if (run) {
        runs.push(run);
        run = null;
      }
    });
    if (run) runs.push(run);
  });
  return runs;
}

// ───────── 칸(슬롯) 배치 ─────────

/** 부서의 계획 공수가 가장 큰 때의 인원 = 만들어 둘 칸 수 */
export function peakNeed(demands, dept) {
  const mine = demands.filter((d) => d.dept === dept);
  if (mine.length === 0) return 0;
  return Math.max(...mine.map((d) => needOnDay(mine, dept, d.start_date)));
}

/**
 * 배정들을 칸(줄)에 나눠 담는다. 같은 줄에는 기간이 겹치지 않게 앞에서부터 채우므로,
 * 한 사람이 끝난 뒤 이어지는 교대 인원은 같은 줄에 놓이고, 동시에 일하는 사람이 많을수록 줄이 늘어난다.
 * → [[assignment, …], …]  (줄마다 시작일 순)
 */
export function layoutLanes(assignments) {
  // 시작일이 같으면 먼저 등록한 순서: 종료일을 고쳐도(교대 등) 칸 위치가 뒤바뀌지 않는다
  const sorted = [...assignments].sort((a, b) => a.start_date.localeCompare(b.start_date) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
  const lanes = [];
  sorted.forEach((a) => {
    const lane = lanes.find((list) => list[list.length - 1].end_date < a.start_date);
    if (lane) lane.push(a);
    else lanes.push([a]);
  });
  return lanes;
}

/**
 * 한 칸(줄)의 한 시간 칸이 어떤 상태인가. need = 그 시간 칸의 부서 필요 인원.
 * filled = 배정이 있음, gap = 공수상 필요한데 비어 있음, idle = 필요 없음
 */
export function laneCellState(lane, laneIndex, col, need) {
  const hit = lane.filter((a) => overlaps(a.start_date, a.end_date, col.start, col.end));
  if (hit.length) return { state: "filled", items: hit };
  return { state: need >= laneIndex + 1 ? "gap" : "idle", items: [] };
}

/**
 * 비어 있는 칸을 눌렀을 때 채울 기간: 누른 칸 안에서 처음 비는 날부터, 필요한데 비어 있는 날이 이어지는 데까지.
 * 필요 없는 날(공수 0)이나 배정이 있는 날을 만나면 멈춘다. 프로젝트 기간을 넘지 않는다.
 */
export function laneGapRange(lane, laneIndex, demands, dept, col, plan) {
  const lo = col.start < plan.start_date ? plan.start_date : col.start;
  const hi = col.end > plan.end_date ? plan.end_date : col.end;
  const covered = (day) => lane.some((a) => a.start_date <= day && day <= (a.end_date || OPEN_END));
  const open = (day) => day <= plan.end_date && needOnDay(demands, dept, day) >= laneIndex + 1 && !covered(day);
  let start = lo;
  while (start <= hi && !open(start)) start = addDays(start, 1);
  if (start > hi) return { start: lo, end: hi < lo ? lo : hi };
  let end = start;
  while (open(addDays(end, 1))) end = addDays(end, 1);
  return { start, end };
}

// ───────── 충돌·경고 ─────────

/**
 * 배정 하나(후보 포함)의 문제점을 모은다.
 * ctx = { assignments, absences, members, plans } — assignments 에는 자기 자신이 들어 있어도 된다(id 로 제외).
 * level: bad(겹침·부재·비활성) / warn(B1 비자 없음) / info(PJT 기간 밖)
 */
export function checkAssignment(candidate, ctx) {
  const issues = [];
  if (!candidate.member_id) return issues;
  const member = ctx.members.find((m) => m.id === candidate.member_id);
  const plan = ctx.plans.find((p) => p.id === candidate.project_id);
  if (!member) return issues;

  if (!member.active) {
    issues.push({ type: "inactive", level: "bad", message: `${member.name}: 배정 대상에서 빠진(비활성) 인원입니다` });
  }

  ctx.assignments.forEach((other) => {
    if (other.id === candidate.id || other.member_id !== candidate.member_id) return;
    if (!overlaps(candidate.start_date, candidate.end_date, other.start_date, other.end_date)) return;
    const otherPlan = ctx.plans.find((p) => p.id === other.project_id);
    const same = other.project_id === candidate.project_id;
    issues.push({
      type: "overlap",
      level: "bad",
      message: `${member.name}: ${same ? "같은 프로젝트 안에서" : `'${otherPlan?.name || "다른 프로젝트"}'와`} 기간이 겹칩니다 (${rangeLabel(other.start_date, other.end_date)})`,
      otherAssignmentId: other.id,
    });
  });

  ctx.absences.forEach((ab) => {
    if (ab.member_id !== candidate.member_id) return;
    if (!overlaps(candidate.start_date, candidate.end_date, ab.start_date, ab.end_date)) return;
    issues.push({
      type: "absent",
      level: "bad",
      message: `${member.name}: ${absenceText(ab)} 일정과 겹칩니다 (${rangeLabel(ab.start_date, ab.end_date)}${ab.note ? `, ${ab.note}` : ""})`,
      absenceId: ab.id,
    });
  });

  if (plan?.overseas && !member.b1_visa) {
    issues.push({ type: "visa", level: "warn", message: `${member.name}: 미국 사이트(HSBMA·SKBA·SKOT) 프로젝트인데 B1 비자가 없습니다` });
  }

  if (plan && (candidate.start_date < plan.start_date || candidate.end_date > plan.end_date)) {
    issues.push({ type: "outside", level: "info", message: `프로젝트 기간(${rangeLabel(plan.start_date, plan.end_date)}) 밖에 걸쳐 있습니다` });
  }
  return issues;
}

/** 모든 배정의 문제점 → { [assignmentId]: issues[] } (문제 없는 배정은 넣지 않는다) */
export function analyzeAssignments(ctx) {
  const result = {};
  ctx.assignments.forEach((a) => {
    const issues = checkAssignment(a, ctx);
    if (issues.length) result[a.id] = issues;
  });
  return result;
}

export const LEVEL_RANK = { bad: 3, warn: 2, info: 1 };
export function worstLevel(issues) {
  return (issues || []).reduce((worst, i) => (LEVEL_RANK[i.level] > (LEVEL_RANK[worst] || 0) ? i.level : worst), null);
}

// ───────── 인원 현황 ─────────

/** 인원 한 명의 한 주: 어떤 PJT 에 배정됐는지, 부재인지 */
export function memberWeekState(member, week, ctx) {
  const assigned = ctx.assignments
    .filter((a) => a.member_id === member.id && overlaps(a.start_date, a.end_date, week.start, week.end))
    .map((a) => ({ assignment: a, plan: ctx.plans.find((p) => p.id === a.project_id) || null }));
  const absence = ctx.absences.find((ab) => ab.member_id === member.id && overlaps(ab.start_date, ab.end_date, week.start, week.end)) || null;
  let state = "free";
  if (absence && assigned.length) state = "conflict";
  else if (absence) state = "absent";
  else if (assigned.length > 1) state = "double";
  else if (assigned.length === 1) state = "assigned";
  return { state, assigned, absence };
}

/** 부서별 한 주 현황: 활동 인원·B1 보유·프로젝트 출장(assigned)·미등록 프로젝트 대응(away)·휴직 등 부재(absent)·본사 가용(free) */
export function deptWeekStats(members, week, ctx) {
  const active = members.filter((m) => m.active);
  let assigned = 0;
  let away = 0;
  let absent = 0;
  let free = 0;
  active.forEach((m) => {
    const st = memberWeekState(m, week, ctx);
    if (st.state === "free") free += 1;
    else if (st.state === "absent") { if (isOutTrip(st.absence.kind)) away += 1; else absent += 1; }
    else assigned += 1; // assigned · double · conflict 는 일하는 중
  });
  return {
    total: active.length,
    b1: active.filter((m) => m.b1_visa).length,
    assigned,
    away,
    absent,
    free,
  };
}

// ───────── 명단 붙여넣기 ─────────

const TRUE_WORDS = /^(o|y|yes|true|1|보유|있음|유|예|○|◯|v)$/i;

/** 팀·부서 글자에서 부서를 추정한다. 못 정하면 null(미리보기에서 사람이 고른다). */
export function guessDept(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (/제어|plc|control/i.test(s)) return "control";
  if (/전장|하네스|전기/i.test(s)) return "electrical";
  if (/비전|비젼|vision/i.test(s)) return "vision";
  if (/설비기술|설기|기구|mech/i.test(s)) return "mechanical";
  if (/\bpm\b|pm\s*\d*\s*팀|소장|영업/i.test(s)) return "manager";
  return null;
}

// 열 머리글 → 항목. 앞에 있는 항목이 먼저 열을 차지하므로 "부서(분야)"는 부서, "소속 팀"은 팀으로 읽힌다.
const HEADER_PATTERNS = [
  ["name", /^(이름|성명|사원|사원명|name)$/i],
  ["dept", /^(부서\s*[(（]\s*분야|분야|구분)/],
  ["rank", /^(직위|직급|직책|rank)/i],
  ["grade", /^등급/],
  ["b1", /b\s*-?1|비자/i],
  ["status", /^(상태|재직)/],
  ["note", /^비고/],
  ["team", /(현재)?부서|소속|^팀$/],
];

const INACTIVE_WORDS = /퇴사|퇴직|제외|비활성|중단/;

function splitLine(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  return line.trim().split(/\s{2,}/).map((c) => c.trim());
}

/** 양식 안내용 예시 줄("(예시) …")은 건너뛴다 */
const isExampleName = (name) => /^[(（]\s*예시/.test(name);

/**
 * 엑셀 표(복사한 글자)를 인원 후보 목록으로 바꾼다.
 * 머리글(이름/부서(분야)/팀/직위/등급/B1/상태/비고)이 있으면 그걸로, 없으면 "이름 직위 부서 등급 B1 비고" 순서로 본다.
 * 맨 앞의 번호 열(No.)은 자동으로 무시한다.
 * 행의 b1_known = B1 열이 있었는가(없으면 기존 값을 그대로 둔다), active = 상태 열이 있으면 true/false, 없으면 undefined.
 */
export function parseMemberPaste(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  const rows = [];
  const skipped = [];
  let cols = null;

  lines.forEach((line, idx) => {
    const cells = splitLine(line);
    if (!cols) {
      const probe = {};
      const taken = new Set();
      HEADER_PATTERNS.forEach(([key, re]) => {
        const at = cells.findIndex((c, i) => !taken.has(i) && re.test(c));
        if (at >= 0) { probe[key] = at; taken.add(at); }
      });
      if (probe.name !== undefined && Object.keys(probe).length >= 2) {
        cols = probe;
        return;
      }
    }
    let use = cells;
    let map = cols;
    if (!map) {
      if (use.length > 1 && /^\d+$/.test(use[0])) use = use.slice(1);
      map = { name: 0, rank: 1, team: 2, grade: 3, b1: 4, note: 5 };
    }
    const pick = (k) => (map[k] === undefined ? "" : String(use[map[k]] ?? "").trim());
    const name = pick("name");
    if (isExampleName(name)) return;
    if (!name || /^\d+$/.test(name)) {
      skipped.push({ line: idx + 1, reason: "이름이 없습니다" });
      return;
    }
    const team = pick("team");
    const deptText = pick("dept");
    const status = pick("status");
    // known = 붙여넣은 표에 그 열이 있었는가. 있으면 빈 칸도 "비움"으로 읽고, 없으면 기존 값을 그대로 둔다.
    const known = Object.fromEntries(["team", "rank", "grade", "b1", "note", "status"].map((k) => [k, map[k] !== undefined && (cols ? true : map[k] < use.length)]));
    rows.push({
      name,
      rank: pick("rank"),
      team,
      grade: pick("grade"),
      b1_visa: TRUE_WORDS.test(pick("b1")),
      note: pick("note"),
      active: map.status === undefined ? undefined : !INACTIVE_WORDS.test(status),
      known,
      dept: (deptText && guessDept(deptText)) || guessDept(team),
    });
  });
  return { rows, skipped, usedHeader: Boolean(cols) };
}

// ───────── 명단 최신화 (붙여넣은 표 ↔ 등록된 인원) ─────────

const sameText = (a, b) => String(a || "").trim() === String(b || "").trim();
const MEMBER_FIELD_LABEL = { team: "팀", rank: "직위", grade: "등급", b1_visa: "B1", note: "비고", active: "상태" };

/** 붙여넣은 한 줄을 기존 인원(base)에 합친 결과. 표에 없던 열은 기존 값을 그대로 둔다. */
export function mergeMemberRow(base, row) {
  const k = row.known || { team: true, rank: true, grade: true, b1: true, note: true, status: false };
  const take = (key, field) => (k[key] ? String(row[field] || "").trim() : base[field] || "");
  return {
    ...base,
    team: take("team", "team"),
    rank: take("rank", "rank"),
    grade: take("grade", "grade"),
    note: take("note", "note"),
    b1_visa: k.b1 ? Boolean(row.b1_visa) : Boolean(base.b1_visa),
    active: row.active === undefined ? base.active !== false : row.active,
  };
}

/** 합치기 전후로 달라지는 항목 이름들 */
export function memberChanges(base, merged) {
  const out = [];
  ["team", "rank", "grade", "note"].forEach((f) => { if (!sameText(base[f], merged[f])) out.push(MEMBER_FIELD_LABEL[f]); });
  if (Boolean(base.b1_visa) !== Boolean(merged.b1_visa)) out.push(MEMBER_FIELD_LABEL.b1_visa);
  if ((base.active !== false) !== (merged.active !== false)) out.push(MEMBER_FIELD_LABEL.active);
  return out;
}

/**
 * 붙여넣은 표(rows, 부서가 정해진 것만)를 등록된 인원(existing)과 맞춰 본다.
 * kind: new(처음 보는 사람) / update(같은 부서·팀·이름, 내용이 달라짐) / same(달라진 것 없음) / move(같은 부서에 같은 이름이 한 명뿐인데 팀이 달라짐) / skip(퇴사로 적힌 새 사람)
 * missing: 표에 나온 부서 안에서 표에 없는 재직 인원(퇴사·이동 후보)
 */
export function planMemberSync(rows, existing) {
  const byKey = new Map(existing.map((m) => [memberKey(m), m]));
  const claimed = new Set();
  rows.forEach((r) => { const m = r.dept ? byKey.get(memberKey(r)) : null; if (m) claimed.add(m.id); });
  const items = rows.map((r) => {
    if (!r.dept) return { row: r, kind: "none", match: null, changes: [], merged: null };
    let match = byKey.get(memberKey(r)) || null;
    let kind = match ? "same" : "new";
    if (!match) {
      const loose = existing.filter((m) => m.dept === r.dept && String(m.name).trim().toLowerCase() === String(r.name).trim().toLowerCase() && !claimed.has(m.id));
      if (loose.length === 1) { match = loose[0]; kind = "move"; claimed.add(match.id); }
    }
    if (!match) return { row: r, kind: r.active === false ? "skip" : "new", match: null, changes: [], merged: null };
    const merged = mergeMemberRow(match, r);
    const changes = memberChanges(match, merged);
    return { row: r, kind: kind === "move" ? "move" : changes.length ? "update" : "same", match, changes, merged };
  });
  const depts = new Set(rows.map((r) => r.dept).filter(Boolean));
  const matched = new Set(items.filter((i) => i.match).map((i) => i.match.id));
  const missing = existing.filter((m) => m.active !== false && depts.has(m.dept) && !matched.has(m.id));
  return { items, missing };
}

// ───────── 프로젝트 일정과 연동 ─────────

/** 완료 시점이 오늘보다 앞선 프로젝트 (화면에서는 기본으로 숨긴다) */
export function isPastProject(plan, today) {
  return Boolean(plan?.end_date) && plan.end_date < today;
}

/**
 * 프로젝트 일정의 프로젝트들을 출장 화면용 "plan" 으로 바꾼다. (날짜가 올바르지 않은 프로젝트는 뺀다)
 * overseas = 프로젝트의 Site 가 미국 사이트(HSBMA·SKBA·SKOT)인가 → B1 비자 확인 대상
 */
export function projectsToPlans(projects) {
  return (projects || [])
    .filter((p) => p && isValidISO(p.startDate) && isValidISO(p.endDate) && p.endDate >= p.startDate)
    .map((p) => ({
      id: p.id,
      name: p.name || "(이름 없음)",
      site: p.site || "",
      line: p.line || "",
      customer: p.customer || "",
      manufacturingNo: p.manufacturingNo || "",
      start_date: p.startDate,
      end_date: p.endDate,
      status: p.status || "",
      overseas: isUsSite(p.site),
      phases: (p.milestones || [])
        .filter((m) => m && m.name && isValidISO(m.startDate) && isValidISO(m.endDate) && m.endDate >= m.startDate)
        .map((m) => ({ label: m.name, start: m.startDate, end: m.endDate })),
      manpower: p.manpower || null,
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.name.localeCompare(b.name, "ko"));
}

/**
 * 프로젝트 마스터 플랜 공수(manpower.departments[부서].daily = { 날짜: 인원 })를 주 단위 필요 인원으로 바꾼다.
 * 한 주(월~일) 안에서 가장 큰 값을 그 주 인원으로 보고, 같은 인원이 이어지는 주를 한 구간으로 묶는다.
 * 기구·비전·제어·전장·소장(화면에서는 PM)만 쓴다(외주·안전·SV 는 출장자 명단 대상이 아니다).
 * deptKeyOf: 공수 부서 이름 → 출장 부서 키(없으면 null)
 */
export function autoDemands(projectId, manpower, deptKeyOf) {
  const departments = manpower?.departments;
  if (!departments || typeof departments !== "object") return [];
  const perDay = {}; // 부서 키 → { 날짜: 인원 합 } (같은 부서로 모이는 이름이 둘 이상이면 합친다)
  Object.entries(departments).forEach(([name, obj]) => {
    const key = deptKeyOf(name);
    if (!key || !TRIP_DEPT_LABEL[key]) return;
    Object.entries(obj?.daily || {}).forEach(([date, count]) => {
      const n = Number(count);
      if (!isValidISO(date) || !(n > 0)) return;
      perDay[key] = perDay[key] || {};
      perDay[key][date] = (perDay[key][date] || 0) + n;
    });
  });
  const rows = [];
  Object.entries(perDay).forEach(([dept, days]) => {
    const weekly = {};
    Object.entries(days).forEach(([date, n]) => {
      const wk = mondayOf(date);
      weekly[wk] = Math.max(weekly[wk] || 0, n);
    });
    const weeks = Object.keys(weekly).sort();
    let run = null;
    weeks.forEach((wk) => {
      const n = weekly[wk];
      if (run && run.headcount === n && addDays(run.lastWeek, 7) === wk) {
        run.lastWeek = wk;
      } else {
        if (run) rows.push(run);
        run = { dept, headcount: n, firstWeek: wk, lastWeek: wk };
      }
    });
    if (run) rows.push(run);
  });
  return rows.map((r) => ({
    id: `auto-${projectId}-${r.dept}-${r.firstWeek}`,
    project_id: projectId,
    dept: r.dept,
    start_date: r.firstWeek,
    end_date: addDays(r.lastWeek, 6),
    headcount: r.headcount,
    auto: true,
  }));
}

/**
 * 화면이 쓰는 계획 공수 = 프로젝트 공수(자동) + 수동 보정.
 * 어떤 프로젝트의 어떤 부서에 수동 입력이 하나라도 있으면, 그 부서는 자동 값을 버리고 수동 값만 쓴다.
 */
export function buildDemands(plans, manualDemands, deptKeyOf) {
  const manualKeys = new Set(manualDemands.map((d) => `${d.project_id}|${d.dept}`));
  const out = manualDemands.map((d) => ({ ...d, auto: false }));
  plans.forEach((p) => {
    autoDemands(p.id, p.manpower, deptKeyOf).forEach((d) => {
      if (!manualKeys.has(`${d.project_id}|${d.dept}`)) out.push(d);
    });
  });
  return out;
}

/** 어떤 프로젝트가 "배정이 필요한" 상태인가: 'none' = 공수가 있는데 아직 아무도 배정 안 함, 'short' = 일부 부족, 'nodemand' = 공수 미등록(배정 없음), 'ok' */
export function assignmentState(plan, demands, assignments, today) {
  const mine = assignments.filter((a) => a.project_id === plan.id);
  const myDemands = demands.filter((d) => d.project_id === plan.id);
  // 공수가 등록되지 않은 프로젝트는 채울 인원 수가 없으므로 "배정 필요"로 몰아붙이지 않는다
  if (mine.length === 0) return { state: myDemands.length ? "none" : "nodemand", shortDepts: [] };
  const weeks = buildWeeks(plan.start_date, Math.min(78, weeksBetween(plan.start_date, plan.end_date)));
  const runs = shortageRuns(myDemands, mine, weeks, today);
  return { state: runs.length ? "short" : "ok", shortDepts: [...new Set(runs.map((r) => r.dept))] };
}

/** 같은 부서·팀·이름이면 같은 사람으로 본다 (DB 의 중복 방지 인덱스와 같은 기준) */
export function memberKey(m) {
  return `${m.dept}|${String(m.team || "").trim()}|${String(m.name || "").trim().toLowerCase()}`;
}

// ───────── 마일스톤 색 ─────────

export const PHASE_COLOR_COUNT = 8;

/**
 * 프로젝트의 마일스톤마다 색 번호(0~7)를 정한다. 이름이 같으면 같은 색이 나오도록 이름에서 시작 번호를 잡고,
 * 한 프로젝트 안에서 겹치면 다음 빈 번호로 밀어서 서로 구분되게 한다.
 */
export function phaseColors(phases) {
  const used = new Set();
  return (phases || []).map((p) => {
    let idx = [...String(p.label || "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7) % PHASE_COLOR_COUNT;
    for (let i = 0; i < PHASE_COLOR_COUNT && used.has(idx); i += 1) idx = (idx + 1) % PHASE_COLOR_COUNT;
    used.add(idx);
    return idx;
  });
}

// 마일스톤을 줄(행)로 나눈다. 일정이 겹치는 단계는 서로 다른 줄에 모두 보여서, 어느 때 어떤 작업이 동시에 진행되는지 알 수 있게 한다.
// 같은 줄에는 시간 칸이 겹치지 않는 단계만 놓는다. → 줄마다 [{ from, to, label, color }] (from·to 는 칸 번호)
export function phaseRows(cols, phases, phaseIdx) {
  const items = [];
  (phases || []).forEach((ph, i) => {
    let from = -1;
    let to = -1;
    cols.forEach((c, k) => {
      if (overlaps(ph.start, ph.end, c.start, c.end)) { if (from < 0) from = k; to = k; }
    });
    if (from >= 0) items.push({ from, to, label: ph.label, color: phaseIdx[i] ?? i % 8, start: ph.start });
  });
  items.sort((x, y) => x.from - y.from || x.start.localeCompare(y.start) || y.to - x.to);
  const rows = [];
  items.forEach((it) => {
    const row = rows.find((r) => r[r.length - 1].to < it.from);
    if (row) row.push(it);
    else rows.push([it]);
  });
  return rows;
}
