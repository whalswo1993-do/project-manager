// 복수 Site 필터 도우미. 선택 배열이 비어 있으면 "전체"로 본다.

/** 선택한 Site 중 하나라도 맞으면 true. normalize를 주면 양쪽을 같은 규칙으로 맞춰 비교한다. */
export function matchesSites(selected, site, normalize = (s) => s) {
  if (!selected || selected.length === 0) return true;
  const target = normalize(site || "");
  return selected.some((s) => s === site || normalize(s) === target);
}

/** 화면 요약 글자: 없으면 "전체", 하나면 그 이름, 여럿이면 쉼표로 이은 이름 */
export function sitesLabel(selected) {
  return !selected || selected.length === 0 ? "전체" : selected.join(", ");
}
