// 공수 부서 분류 규칙 (공수 화면과 프로젝트 목록 엑셀 내보내기가 같이 쓴다)
export const BASE_DEPT_ORDER = [
  "mechanical",
  "mechanical_sub",
  "vision",
  "vision_sub",
  "control",
  "control_sub",
  "electrical",
  "electrical_sub",
  "supervisor",
  "safety",
  "manager"
];

export const DEPT_SHORT = {
  mechanical: "기구",
  mechanical_sub: "기구외주",
  vision: "비전",
  vision_sub: "비전외주",
  control: "제어",
  control_sub: "제어외주",
  electrical: "전장",
  electrical_sub: "전장외주",
  supervisor: "SV",
  safety: "안전",
  manager: "소장"
};

export function normalizeDeptKey(key) {
  if (!key) return "other";
  const s = String(key).toLowerCase().trim();

  // 1. Check if it's an outsourced (외주) department
  const isSub = /외주|sub|협력|outsourc|엘라이트/i.test(s);
  if (isSub) {
    if (/vision|비전|비젼|vis|엘라이트/i.test(s)) return "vision_sub";
    if (/electrical|electronical|전장|전기|elec/i.test(s)) return "electrical_sub";
    if (/mechanical|기구|mech/i.test(s)) return "mechanical_sub";
    if (/control|제어|cont/i.test(s)) return "control_sub";
    return "other_sub";
  }

  // 2. Pure internal departments (No 외주 keyword)
  // Mechanical / 설비기술 must be checked BEFORE generic manager/소장 because strings often have "(소장포함)"
  if (/설비기술/i.test(s)) return "mechanical";
  if (/mechanical|기구|mech/i.test(s)) return "mechanical";

  // Supervisor
  if (/supervis|슈퍼바이저|\bsv\b|해체\s*검수|장착\s*검수|해체\/장착\s*검수/i.test(s)) return "supervisor";

  // ★ Safety vs 소장(Manager) 구분:
  // "Safety Manager", "안전관리자", "Safety", "안전", "HSE Manager" 등 안전 관련 키워드는 반드시 "safety"로 매핑합니다.
  // 이 검사를 manager/소장보다 항상 먼저 수행하여 "Safety Manager"가 "manager(소장)"로 오인식되는 혼선을 원천 차단합니다.
  if (/safety|안전|safe|hse|ehs/i.test(s)) return "safety";

  // 소장 / Site Manager / Project Manager / PM:
  // safety 키워드가 없는 순수 소장/관리자 명칭만 "manager"로 매핑합니다.
  if (/manager|소장|현장대리인|site mgr|field mgr|\bpm\b|project\s*manager/i.test(s)) return "manager";

  if (/vision|비전|비젼|vis/i.test(s)) return "vision";
  if (/control|제어|cont/i.test(s)) return "control";
  if (/electrical|electronical|전장|전기|elec/i.test(s)) return "electrical";
  if (/설계|design/i.test(s)) return "design";

  return s;
}
