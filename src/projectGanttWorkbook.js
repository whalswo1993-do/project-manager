// 프로젝트 일정 종합 엑셀: 프로젝트별 전체 일정 + 마일스톤별 간트차트를 한 시트에 만든다.
// 막대는 칸을 칠한 값이 아니라 "조건부 서식"이라서, 엑셀에서 시작일·종료일을 고치면 막대가 같이 움직인다.
// 마일스톤 줄은 프로젝트 줄 아래 개요 그룹(+/−)이라 프로젝트별로 접고 펼 수 있다.
// 일 단위/주 단위를 골라 칸 폭을 바꾼다. 일정 날짜는 텍스트(날짜 칸)로도 그대로 보인다.
//
// 시트: 프로젝트 간트(간트+일정) · 일정표(텍스트 목록) · 작성 안내
import { addDays, mondayOf, todayISO } from "./tripLogic";

export const SHEET_GANTT = "프로젝트 간트";
export const SHEET_LIST = "일정표";
const FONT = "맑은 고딕";
const C = { ink: "FF1F2937", muted: "FF6B7280", line: "FFD1D5DB", head: "FFDCE8F5", brand: "FF0B57A4", today: "FFFDE2E2", weekend: "FFF3F4F6", sat: "FF2563EB", sun: "FFDC2626" };
const COL = { NO: 1, NAME: 2, SITE: 3, START: 4, END: 5, DAYS: 6, KIND: 7, STATE: 8, T0: 9 };
const HEADER_DATE_ROW = 6;
const FIRST_ROW = 7;
const MAX_COLUMNS = 1500;
const DEFAULT_COLOR = "0B57A4";
const HELPER_IDS = new Set(["__status_meta__", "__manpower_meta__"]);

const colLetter = (n) => { let s = ""; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); } return s; };
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const isISO = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(asDate(v).getTime());
const diffDays = (a, b) => Math.round((asDate(b) - asDate(a)) / 86400000);
const stripHash = (no) => String(no || "").replace(/-[a-f0-9]{4}$/i, "");
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: C.line } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const font = (extra = {}) => ({ name: FONT, size: 10, color: { argb: C.ink }, ...extra });
const progressOf = (p) => (Number.isFinite(+p.value) ? +p.value : p.status === "완료" ? 100 : 0);
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function setCollapsed(row, value) {
  Object.defineProperty(row, "collapsed", { get: () => Boolean(value), configurable: true });
}

function colorOf(p) {
  const h = String(p.projectColor || "").replace("#", "").slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : DEFAULT_COLOR;
}
// 흰색과 섞어 연하게 (ratio = 원래 색 비율)
function tint(hex, ratio) {
  const n = [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * ratio + 255 * (1 - ratio)));
  return n.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function isoWeek(iso) {
  const d = asDate(iso);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 86400000 + 1) / 7);
}

/** 프로젝트 목록 → 프로젝트·마일스톤 줄 구조 (날짜가 없는 마일스톤은 제외) */
export function projectBlocks(projects) {
  return projects.map((p) => {
    const milestones = (p.milestones || [])
      .filter((m) => m && m.name && !HELPER_IDS.has(m.id) && isISO(m.startDate) && isISO(m.endDate))
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
    return { p, milestones, color: colorOf(p), start: isISO(p.startDate) ? p.startDate : "", end: isISO(p.endDate) ? p.endDate : "" };
  });
}

/** 일정이 있는 가장 이른 날 ~ 가장 늦은 날 */
export function scheduleRange(blocks) {
  const dates = blocks.flatMap((b) => [b.start, b.end, ...b.milestones.flatMap((m) => [m.startDate, m.endDate])]).filter(Boolean).sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

/** 칸 목록: unit = "day" | "week"(월요일 시작) */
export function buildGanttColumns(unit, start, end) {
  const span = unit === "day" ? 1 : 7;
  const first = unit === "day" ? start : mondayOf(start);
  const cols = [];
  for (let s = first; s <= end; s = addDays(s, span)) cols.push({ start: s, end: addDays(s, span - 1) });
  return { span, cols };
}

/**
 * projects = 화면의 프로젝트(projectColor 포함), options = { unit, startDate, endDate, collapsed, customer, label, today }
 */
export function buildProjectGanttWorkbook(ExcelJS, projects, options = {}) {
  const unit = options.unit === "day" ? "day" : "week";
  const blocks = projectBlocks(projects);
  const auto = scheduleRange(blocks);
  if (!auto) throw new Error("일정(시작일·종료일)이 입력된 프로젝트가 없습니다.");
  const rangeStart = isISO(options.startDate) ? options.startDate : auto.start;
  const rangeEnd = isISO(options.endDate) ? options.endDate : auto.end;
  if (rangeEnd < rangeStart) throw new Error("종료일이 시작일보다 빠릅니다.");
  const { span, cols } = buildGanttColumns(unit, rangeStart, rangeEnd);
  if (cols.length > MAX_COLUMNS) throw new Error(`조회 기간이 너무 깁니다. ${unit === "day" ? "일" : "주"} 단위로 ${cols.length}칸이 필요합니다. 기간을 줄이거나 주 단위를 선택해 주세요.`);
  const today = options.today || todayISO();
  const collapsed = Boolean(options.collapsed);
  const lastCol = COL.T0 + cols.length - 1;
  const tl = colLetter(COL.T0);
  const ll = colLetter(lastCol);
  const dr = HEADER_DATE_ROW;
  const unitLabel = unit === "day" ? "일 단위" : "주 단위";

  const wb = new ExcelJS.Workbook();
  wb.creator = "TW Project Manager";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const ws = wb.addWorksheet(SHEET_GANTT, {
    views: [{ state: "frozen", xSplit: COL.NAME, ySplit: dr, zoomScale: 90, showGridLines: false }],
    properties: { tabColor: { argb: C.brand }, outlineLevelRow: 1, outlineProperties: { summaryBelow: false } },
    pageSetup: { orientation: "landscape", paperSize: 8 },
  });
  ws.columns = [
    { width: 15 }, { width: 46 }, { width: 11 }, { width: 11.5 }, { width: 11.5 }, { width: 7.5 }, { width: 9 }, { width: 14 },
    ...cols.map(() => ({ width: unit === "day" ? 3.3 : 5.4 })),
  ];

  // ── 머리글 ──
  ws.getCell(1, 1).value = `${options.customer ? `${options.customer} ` : ""}프로젝트 일정 종합 간트`;
  ws.getCell(1, 1).font = font({ size: 15, bold: true, color: { argb: C.brand } });
  ws.getRow(1).height = 26;
  ws.getCell(2, 1).value = `${options.label ? `${options.label} · ` : ""}프로젝트 ${blocks.length}건 · ${rangeStart} ~ ${rangeEnd} · ${unitLabel} · 작성일 ${today} · 막대는 시작일·종료일을 고치면 같이 움직입니다. 프로젝트 줄 왼쪽의 +/− 로 마일스톤을 접고 펼칩니다.`;
  ws.getCell(2, 1).font = font({ size: 9, color: { argb: C.muted } });

  const headLabels = ["제조번호", "프로젝트 / 마일스톤", "Site", "시작일", "종료일", "기간(일)", "구분", "상태 · 진행"];
  headLabels.forEach((t, i) => {
    ws.mergeCells(4, i + 1, dr, i + 1);
    const cell = ws.getCell(4, i + 1);
    cell.value = t;
    cell.font = font({ bold: true });
    cell.fill = solid(C.head);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let r = 4; r <= dr; r += 1) ws.getCell(r, i + 1).border = box;
  });

  // 월 줄(4): 같은 달 칸을 합치고, 요일/주차(5), 날짜(6)
  let runStart = 0;
  cols.forEach((col, i) => {
    const c = COL.T0 + i;
    const monthKey = col.start.slice(0, 7);
    const next = cols[i + 1];
    if (!next || next.start.slice(0, 7) !== monthKey) {
      const c1 = COL.T0 + runStart;
      if (c > c1) ws.mergeCells(4, c1, 4, c);
      const cell = ws.getCell(4, c1);
      cell.value = `${col.start.slice(0, 4)}년 ${Number(col.start.slice(5, 7))}월`;
      cell.font = font({ bold: true, size: 9 });
      cell.alignment = { horizontal: "center", vertical: "middle" };
      for (let k = c1; k <= c; k += 1) { ws.getCell(4, k).fill = solid(Number(monthKey.slice(5)) % 2 ? C.head : "FFEAF1FB"); ws.getCell(4, k).border = box; }
      runStart = i + 1;
    }
    const wk = ws.getCell(5, c);
    const dt = ws.getCell(dr, c);
    const dow = asDate(col.start).getUTCDay();
    if (unit === "day") {
      wk.value = WEEKDAY[dow];
      dt.numFmt = "d";
    } else {
      wk.value = `W${isoWeek(col.start)}`;
      dt.numFmt = "m/d";
    }
    dt.value = asDate(col.start);
    const tone = unit === "day" && dow === 0 ? C.sun : unit === "day" && dow === 6 ? C.sat : C.ink;
    [wk, dt].forEach((cell) => {
      cell.font = font({ size: 8.5, color: { argb: tone } });
      cell.fill = solid(C.head);
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = box;
    });
  });
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 15;
  ws.getRow(dr).height = 17;

  // ── 본문 ──
  const formulaDays = (r, a, b) => ({ formula: `IF(AND(ISNUMBER(D${r}),ISNUMBER(E${r})),E${r}-D${r}+1,"")`, result: a && b ? diffDays(a, b) + 1 : "" });
  const styleRow = (r, { fill, bold, indent }) => {
    for (let c = 1; c <= COL.STATE; c += 1) {
      const cell = ws.getCell(r, c);
      cell.border = box;
      cell.font = font({ bold: Boolean(bold), size: bold ? 10 : 9.5 });
      if (fill) cell.fill = solid(fill);
      cell.alignment = { vertical: "middle", horizontal: c === COL.NAME ? "left" : "center", indent: c === COL.NAME ? indent : 0 };
    }
    ws.getCell(r, COL.START).numFmt = "yyyy-mm-dd";
    ws.getCell(r, COL.END).numFmt = "yyyy-mm-dd";
    for (let c = COL.T0; c <= lastCol; c += 1) ws.getCell(r, c).border = box;
    ws.getRow(r).height = 18;
  };

  const barRules = [];
  const projectRows = [];
  let r = FIRST_ROW;
  blocks.forEach((b) => {
    const { p, milestones, color } = b;
    const pr = r;
    projectRows.push({ row: pr, start: b.start, end: b.end });
    ws.getCell(pr, COL.NO).value = stripHash(p.manufacturingNo);
    ws.getCell(pr, COL.NAME).value = p.name || "";
    ws.getCell(pr, COL.SITE).value = p.site || "";
    if (b.start) ws.getCell(pr, COL.START).value = asDate(b.start);
    if (b.end) ws.getCell(pr, COL.END).value = asDate(b.end);
    ws.getCell(pr, COL.DAYS).value = formulaDays(pr, b.start, b.end);
    ws.getCell(pr, COL.KIND).value = "프로젝트";
    ws.getCell(pr, COL.STATE).value = `${p.status || "진행중"} · ${Math.round(progressOf(p))}%`;
    styleRow(pr, { fill: `FF${tint(color, 0.22)}`, bold: true, indent: 0 });
    setCollapsed(ws.getRow(pr), collapsed && milestones.length > 0);
    barRules.push({ first: pr, last: pr, color: `FF${color}` });
    r += 1;

    const mFirst = r;
    milestones.forEach((m) => {
      ws.getCell(r, COL.NAME).value = m.name;
      ws.getCell(r, COL.START).value = asDate(m.startDate);
      ws.getCell(r, COL.END).value = asDate(m.endDate);
      ws.getCell(r, COL.DAYS).value = formulaDays(r, m.startDate, m.endDate);
      ws.getCell(r, COL.KIND).value = "마일스톤";
      styleRow(r, { fill: null, bold: false, indent: 2 });
      ws.getCell(r, COL.KIND).font = font({ size: 9, color: { argb: C.muted } });
      const row = ws.getRow(r);
      row.outlineLevel = 1;
      setCollapsed(row, false);
      if (collapsed) row.hidden = true;
      r += 1;
    });
    if (milestones.length) barRules.push({ first: mFirst, last: r - 1, color: `FF${tint(color, 0.62)}` });
  });
  const lastRow = r - 1;

  // 동시 진행 프로젝트 수: "구분"과 날짜 칸을 보고 세므로 프로젝트·마일스톤 줄을 더해도 같이 바뀐다
  const sumRow = r + 1;
  ws.getCell(sumRow, COL.NAME).value = "동시 진행 프로젝트 수";
  for (let c = 1; c <= COL.STATE; c += 1) { const cell = ws.getCell(sumRow, c); cell.fill = solid(C.head); cell.border = box; cell.font = font({ bold: true }); }
  ws.getCell(sumRow, COL.NAME).alignment = { horizontal: "left", indent: 0, vertical: "middle" };
  cols.forEach((col, i) => {
    const c = COL.T0 + i;
    const L = colLetter(c);
    const rng = (x) => `$${x}$${FIRST_ROW}:$${x}$${lastRow}`;
    const result = projectRows.filter((x) => x.start && x.end && x.start <= col.end && x.end >= col.start).length;
    const cell = ws.getCell(sumRow, c);
    cell.value = { formula: `SUMPRODUCT((${rng("G")}="프로젝트")*(${rng("D")}>0)*(${rng("D")}<=${L}$${dr}+${span - 1})*(${rng("E")}>=${L}$${dr}))`, result };
    cell.font = font({ size: 9, bold: true });
    cell.fill = solid(C.head);
    cell.border = box;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(sumRow).height = 18;

  // ── 조건부 서식: 막대(프로젝트 색) → 오늘 → 주말 순으로 우선 ──
  let priority = 1;
  const inBar = (row) => `AND(ISNUMBER($D${row}),ISNUMBER($E${row}),${tl}$${dr}<=$E${row},${tl}$${dr}+${span - 1}>=$D${row})`;
  barRules.forEach((rule) => {
    ws.addConditionalFormatting({
      ref: `${tl}${rule.first}:${ll}${rule.last}`,
      rules: [{ type: "expression", formulae: [inBar(rule.first)], priority: priority++, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: rule.color } } } }],
    });
  });
  const todayTest = `AND(TODAY()>=${tl}$${dr},TODAY()<=${tl}$${dr}+${span - 1})`;
  ws.addConditionalFormatting({ ref: `${tl}${dr}:${ll}${dr}`, rules: [{ type: "expression", formulae: [todayTest], priority: priority++, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFCA5A5" } } } }] });
  ws.addConditionalFormatting({ ref: `${tl}${FIRST_ROW}:${ll}${lastRow}`, rules: [{ type: "expression", formulae: [todayTest], priority: priority++, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: C.today } } } }] });
  if (unit === "day") {
    ws.addConditionalFormatting({ ref: `${tl}${FIRST_ROW}:${ll}${lastRow}`, rules: [{ type: "expression", formulae: [`WEEKDAY(${tl}$${dr},2)>5`], priority: priority++, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: C.weekend } } } }] });
  }

  // ── 일정표(텍스트 목록): 필터·정렬해서 쓰는 용도 ──
  const ls = wb.addWorksheet(SHEET_LIST, { views: [{ state: "frozen", ySplit: 1, showGridLines: false }], properties: { tabColor: { argb: "FF6B7280" } } });
  const listHead = ["제조번호", "프로젝트", "Site", "구분", "일정", "시작일", "종료일", "기간(일)", "상태", "진행률(%)"];
  ls.columns = [{ width: 15 }, { width: 40 }, { width: 11 }, { width: 10 }, { width: 40 }, { width: 12 }, { width: 12 }, { width: 9 }, { width: 10 }, { width: 10 }];
  listHead.forEach((t, i) => {
    const cell = ls.getCell(1, i + 1);
    cell.value = t;
    cell.font = font({ bold: true });
    cell.fill = solid(C.head);
    cell.border = box;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  let lr = 2;
  const addListRow = (vals, isProject) => {
    vals.forEach((v, i) => {
      const cell = ls.getCell(lr, i + 1);
      if (v !== "" && v !== null && v !== undefined) cell.value = v;
      cell.font = font({ bold: isProject, size: 9.5 });
      cell.border = box;
      cell.alignment = { vertical: "middle", horizontal: i === 1 || i === 4 ? "left" : "center" };
    });
    ls.getCell(lr, 6).numFmt = "yyyy-mm-dd";
    ls.getCell(lr, 7).numFmt = "yyyy-mm-dd";
    lr += 1;
  };
  blocks.forEach((b) => {
    const { p } = b;
    const days = (a, e) => (a && e ? diffDays(a, e) + 1 : "");
    addListRow([stripHash(p.manufacturingNo), p.name || "", p.site || "", "프로젝트", "전체 일정", b.start ? asDate(b.start) : "", b.end ? asDate(b.end) : "", days(b.start, b.end), p.status || "진행중", Math.round(progressOf(p))], true);
    b.milestones.forEach((m) => addListRow([stripHash(p.manufacturingNo), p.name || "", p.site || "", "마일스톤", m.name, asDate(m.startDate), asDate(m.endDate), days(m.startDate, m.endDate), "", ""], false));
  });
  ls.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, lr - 1), column: listHead.length } };

  // ── 작성 안내 ──
  const guide = wb.addWorksheet("작성 안내", { views: [{ showGridLines: false }], properties: { tabColor: { argb: "FF9CA3AF" } } });
  guide.columns = [{ width: 110 }];
  [
    "프로젝트 일정 종합 엑셀 사용 안내",
    "· '프로젝트 간트' 시트: 프로젝트 줄은 색이 진한 막대, 마일스톤 줄은 같은 색의 연한 막대입니다. 프로젝트 줄 왼쪽의 +/− 로 마일스톤을 접고 펼칩니다. 왼쪽 위 숫자 1·2 버튼으로 전체를 한 번에 접고 펼칠 수 있습니다.",
    "· 막대는 조건부 서식이라서 시작일·종료일 칸을 고치면 막대가 같이 움직입니다. 오늘이 든 칸은 붉게 표시됩니다.",
    `· 칸 단위는 ${unitLabel}입니다. 주 단위의 한 칸은 월요일부터 일요일까지이고, 그 주에 하루라도 걸치면 칠해집니다.`,
    "· '일정표' 시트는 같은 내용을 텍스트 목록으로 모은 것입니다. 머리글의 필터로 프로젝트·구분·Site를 골라 볼 수 있습니다.",
    "· 이 파일에서 고친 내용은 시스템에 자동으로 반영되지 않습니다(내려받기 전용).",
  ].forEach((t, i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = t;
    cell.font = font({ size: i === 0 ? 14 : 10, bold: i === 0, color: { argb: i === 0 ? C.brand : C.ink } });
    cell.alignment = { wrapText: true, vertical: "top" };
  });

  wb.__gantt = { blocks, cols, span, unit, firstRow: FIRST_ROW, lastRow, sumRow, dateRow: dr, rangeStart, rangeEnd };
  return wb;
}

function saveBuffer(buffer, fileName) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** 프로젝트 일정 종합 엑셀 내려받기 */
export async function downloadProjectGanttWorkbook(projects, options = {}) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildProjectGanttWorkbook(ExcelJS, projects, options);
  const name = ["TW_프로젝트일정_간트", options.customer, options.label, todayISO().replaceAll("-", "")].filter(Boolean).join("_").replace(/[\\/:*?"<>|\s]+/g, "_");
  saveBuffer(await wb.xlsx.writeBuffer(), `${name}.xlsx`);
}
