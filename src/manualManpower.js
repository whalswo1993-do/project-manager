// 마스터 스케줄 없이 손으로 적는 부서별 계획 공수.
// 구간(부서·시작일·종료일·인원)을 마스터 플랜과 같은 모양의 manpower 객체로 바꿔 두면
// 공수 화면·출장자 관리·내보내기가 따로 손보지 않아도 그대로 읽는다.

export const MANUAL_DEPTS = [
  { key: "mechanical", label: "기구" },
  { key: "vision", label: "비전" },
  { key: "control", label: "제어" },
  { key: "electrical", label: "전장" },
  { key: "manager", label: "소장" },
  { key: "mechanical_sub", label: "기구 외주" },
  { key: "vision_sub", label: "비전 외주" },
  { key: "control_sub", label: "제어 외주" },
  { key: "electrical_sub", label: "전장 외주" },
];

const LABEL = Object.fromEntries(MANUAL_DEPTS.map((d) => [d.key, d.label]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// 마스터 플랜의 공수를 가진 프로젝트인가(수동 공수는 마스터가 없을 때만 쓴다)
export const hasMasterManpower = (manpower) => Boolean(manpower) && manpower.source !== "manual";

// 시작일~종료일 중 일요일을 뺀 날짜(마스터 플랜 공수 달력과 같은 월~토 기준)
function workDays(start, end) {
  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last && out.length < 800) {
    if (cur.getUTCDay() !== 0) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function isValidManualRow(r) {
  return Boolean(r) && Boolean(LABEL[r.dept]) && ISO.test(r.start || "") && ISO.test(r.end || "")
    && r.end >= r.start && Number(r.count) > 0;
}

export function emptyManualRow() {
  return { dept: "mechanical", start: "", end: "", count: 1 };
}

// 구간 목록 → manpower 객체. 쓸 수 있는 구간이 없으면 null.
export function buildManualManpower(rows) {
  const valid = (rows || []).filter(isValidManualRow);
  if (valid.length === 0) return null;
  const departments = {};
  valid.forEach((r) => {
    const name = LABEL[r.dept];
    const dept = departments[name] || (departments[name] = { total: 0, peak: 0, daily: {} });
    workDays(r.start, r.end).forEach((d) => {
      dept.daily[d] = (dept.daily[d] || 0) + Number(r.count);
    });
  });
  const dailyTotal = {};
  Object.values(departments).forEach((dept) => {
    dept.total = Object.values(dept.daily).reduce((a, b) => a + b, 0);
    dept.peak = Object.values(dept.daily).reduce((a, b) => Math.max(a, b), 0);
    Object.entries(dept.daily).forEach(([d, v]) => { dailyTotal[d] = (dailyTotal[d] || 0) + v; });
  });
  return {
    source: "manual",
    manualRows: valid.map((r) => ({ dept: r.dept, start: r.start, end: r.end, count: Number(r.count) })),
    totalManday: Object.values(departments).reduce((a, d) => a + d.total, 0),
    dailyPeak: Object.values(dailyTotal).reduce((a, b) => Math.max(a, b), 0),
    departments,
    byDepartment: Object.fromEntries(Object.entries(departments).map(([k, v]) => [k, v.total])),
    dailyTotal,
  };
}
