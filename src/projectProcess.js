// 프로젝트 공정 구분(NC/ST). 프로젝트 이름·Site·Line 글자에서 판단한다.
//   NC: NC, Notcher, Notching, 노칭, 노처
//   ST: ST, Stacker, Stacking, Stack, 스택, 스태킹, 스태커
// "NC"·"ST"는 영문자와 붙어 있지 않을 때만 인정한다(SYNC·TEST·BEST 같은 단어 오인 방지).
// 한 프로젝트가 두 공정을 모두 가질 수 있다(예: "노칭, 스택 셋업").

export const PROCESS_OPTIONS = [
  { value: "NC", label: "NC (Notching)" },
  { value: "ST", label: "ST (Stacking)" },
  { value: "기타", label: "공정 미구분" },
];

const NC_RE = /(?<![a-z])nc(?![a-z])|notch|노칭|노처/i;
const ST_RE = /(?<![a-z])st(?![a-z])|stack|스택|스태킹|스태커/i;

/** 프로젝트가 속한 공정 목록: ["NC"], ["ST"], ["NC","ST"] 또는 [] */
export function projectProcesses(p) {
  const text = [p?.name, p?.site, p?.line].filter(Boolean).join(" ");
  const out = [];
  if (NC_RE.test(text)) out.push("NC");
  if (ST_RE.test(text)) out.push("ST");
  return out;
}

/** 공정 필터("전체" | "NC" | "ST" | "기타")에 맞으면 true */
export function matchesProcess(filter, p) {
  if (!filter || filter === "전체") return true;
  const procs = projectProcesses(p);
  return filter === "기타" ? procs.length === 0 : procs.includes(filter);
}

export function processLabel(filter) {
  return PROCESS_OPTIONS.find((o) => o.value === filter)?.label || "전체";
}
