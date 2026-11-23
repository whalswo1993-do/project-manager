// 날짜 입력칸(type=date/month/datetime-local)은 max 가 없으면 연도를 6자리까지 칠 수 있어
// 2026 을 "262626" 으로 잘못 넣는 실수가 난다. 칸에 들어가는 순간 max 를 9999 년으로 달아
// 연도를 4자리로 제한한다(max 가 이미 있는 칸은 그대로 둔다). 화면마다 고치지 않아도 모든 칸에 적용된다.
const DEFAULT_MAX = { date: "9999-12-31", month: "9999-12", "datetime-local": "9999-12-31T23:59" };

function guardDateInput(el) {
  if (!el || el.tagName !== "INPUT") return;
  const max = DEFAULT_MAX[el.type];
  if (max && !el.getAttribute("max")) el.setAttribute("max", max);
}

function installDateGuard(doc = document) {
  doc.addEventListener("focusin", e => guardDateInput(e.target), true);
  doc.addEventListener("pointerdown", e => guardDateInput(e.target), true);
}
installDateGuard();
