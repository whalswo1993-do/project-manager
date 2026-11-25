// Site → 국가 분류(이름 규칙). Site가 늘면 COUNTRY_RULES에 추가한다.
// 프로젝트의 site 칸에 목록 밖의 글자(예: "SK 대전연구소 ...")가 들어 있어도 같은 규칙으로 판단한다.

export const COUNTRY_ORDER = ["한국", "미국", "헝가리", "중국", "기타"];

// 앞에서부터 먼저 맞는 규칙을 쓴다(SKOH2가 SKOH보다, SKOT가 SKO보다 먼저 오도록 구체적인 것을 앞에).
const COUNTRY_RULES = [
  [/^\s*(hsbma|skba|skot)/i, "미국"],
  [/^\s*(skbm|skoh)/i, "헝가리"],
  [/^\s*(skoj|skoy)/i, "중국"],
  [/시안|xi'?an/i, "중국"],
  [/대전|서산|기흥|울산|천안|안성|탑립|오창|청주|^\s*sko\s|^\s*sko$/i, "한국"],
];

export function siteCountry(site) {
  const name = String((site && typeof site === "object" ? site.name : site) || "");
  if (!name.trim()) return "기타";
  const hit = COUNTRY_RULES.find(([re]) => re.test(name));
  return hit ? hit[1] : "기타";
}

/** 선택한 국가(빈 배열 = 전체) 중 하나에 속하면 true */
export function matchesCountries(selected, site) {
  if (!selected || selected.length === 0) return true;
  return selected.includes(siteCountry(site));
}

/** Site 목록에 실제로 있는 국가만 정해진 순서로 */
export function countriesOf(siteNames) {
  const set = new Set((siteNames || []).map(siteCountry));
  return COUNTRY_ORDER.filter((c) => set.has(c));
}
