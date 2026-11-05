// 공사일보 취합 엑셀 내보내기 (AI 호출 없음).
// 시트 2개: ① 일보 내용(프로젝트별 묶음, 날짜순)  ② 공수(날짜별 + 프로젝트 소계 + 전체 합계)
// 대상은 SITE 기준 또는 프로젝트 직접 선택, 기간은 지정하거나 "전체 기간".
import { matchesSites } from './siteFilter.js';
import { normalizeJVName } from './utils.js';

// 부서 열 (DB 컬럼명 → 표 머리글). 안전은 personnel_count 컬럼을 쓴다.
export const DEPT_COLUMNS = [
  { key: 'pm_count', label: '소장' },
  { key: 'design_count', label: '설계' },
  { key: 'facility_count', label: '기구' },
  { key: 'facility_outsource', label: '기구외주' },
  { key: 'control_count', label: '제어' },
  { key: 'control_outsource', label: '제어외주' },
  { key: 'electrical_count', label: '전장' },
  { key: 'electrical_outsource', label: '전장외주' },
  { key: 'vision_count', label: '비전' },
  { key: 'vision_outsource', label: '비전외주' },
  { key: 'personnel_count', label: '안전' },
];

const num = (v) => Number(v) || 0;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** daily_reports 한 행을 화면과 같은 방식으로 정리한다 (content JSON 안의 보조 값 포함). */
export function normalizeReportRow(r) {
  let extra = {};
  if (r.content && typeof r.content === 'string' && r.content.trim().startsWith('{')) {
    try { extra = JSON.parse(r.content); } catch { extra = {}; }
  }
  const out = { ...r, custom_depts: extra.custom_depts || r.custom_depts || {} };
  for (const { key } of DEPT_COLUMNS) out[key] = num(r[key] ?? extra[key]);
  return out;
}

const customTotal = (r) => Object.values(r.custom_depts || {}).reduce((a, b) => a + num(b), 0);
export const reportTotal = (r) => DEPT_COLUMNS.reduce((s, c) => s + num(r[c.key]), 0) + customTotal(r);

const dateOnly = (v) => String(v || '').slice(0, 10);
export const weekdayOf = (date) => {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? '' : WEEKDAYS[new Date(t).getUTCDay()];
};

const projectLabel = (p) => [normalizeJVName(p.manufacturingNo || ''), normalizeJVName(p.name || '')].filter(Boolean).join(' · ');

/**
 * 프로젝트별로 묶은 데이터를 만든다 (순수 함수 — 파일 저장과 분리해 시험한다).
 *  reports : daily_reports 행(정리 전)
 *  projects: 프로젝트 목록
 *  sites   : 선택한 Site(빈 배열 = 전체)   projectIds: 주어지면 이 프로젝트만
 *  startDate/endDate: 비우면 기간 제한 없음
 */
export function buildDailyReportData({ reports = [], projects = [], startDate = '', endDate = '', sites = [], projectIds = null }) {
  const idSet = projectIds ? new Set(projectIds.map(String)) : null;
  const byId = new Map();
  for (const p of projects) {
    if (idSet && !idSet.has(String(p.id))) continue;
    if (!matchesSites(sites, normalizeJVName(p.site || ''), normalizeJVName)) continue;
    byId.set(String(p.id), p);
  }
  const groupsMap = new Map();
  for (const raw of reports) {
    const p = byId.get(String(raw.project_id));
    if (!p) continue;
    const date = dateOnly(raw.report_date);
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;
    if (!groupsMap.has(String(p.id))) groupsMap.set(String(p.id), { project: p, days: [] });
    groupsMap.get(String(p.id)).days.push({ date, r: normalizeReportRow(raw) });
  }
  const groups = [...groupsMap.values()].sort((a, b) =>
    String(a.project.site || '').localeCompare(String(b.project.site || ''), 'ko') ||
    String(a.project.manufacturingNo || '').localeCompare(String(b.project.manufacturingNo || ''), 'ko') ||
    String(a.project.name || '').localeCompare(String(b.project.name || ''), 'ko'));
  groups.forEach((g) => g.days.sort((a, b) => a.date.localeCompare(b.date)));

  // 부서 열: 값이 한 번이라도 있는 부서만 남긴다 (빈 열이 많으면 표가 지저분해진다). 사용자 지정 부서는 뒤에 붙인다.
  const allDays = groups.flatMap((g) => g.days);
  const fixed = DEPT_COLUMNS.filter((c) => allDays.some(({ r }) => num(r[c.key]) !== 0));
  const customNames = [...new Set(allDays.flatMap(({ r }) => Object.entries(r.custom_depts || {}).filter(([, v]) => num(v) !== 0).map(([k]) => k)))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const depts = [
    ...fixed.map((c) => ({ label: c.label, get: (r) => num(r[c.key]) })),
    ...customNames.map((n) => ({ label: n, get: (r) => num(r.custom_depts?.[n]) })),
  ];
  const valuesOf = (r) => depts.map((d) => d.get(r));

  groups.forEach((g) => {
    g.label = projectLabel(g.project);
    g.sums = depts.map(() => 0);
    g.days.forEach((d) => {
      d.values = valuesOf(d.r);
      d.total = d.values.reduce((a, b) => a + b, 0);
      d.weekday = weekdayOf(d.date);
      d.work = d.r.work_details || '';
      d.notes = d.r.special_notes || d.r.issues || '';
      d.summary = depts.map((x, i) => (d.values[i] ? `${x.label} ${d.values[i]}` : '')).filter(Boolean).join(' · ');
      d.values.forEach((v, i) => { g.sums[i] += v; });
    });
    g.total = g.sums.reduce((a, b) => a + b, 0);
    g.first = g.days[0]?.date || '';
    g.last = g.days.at(-1)?.date || '';
  });

  return {
    groups,
    depts,
    total: allDays.length,
    sums: depts.map((_, i) => groups.reduce((s, g) => s + g.sums[i], 0)),
    grandTotal: groups.reduce((s, g) => s + g.total, 0),
  };
}

// ---- 엑셀 쓰기 ----
const FONT = 'Malgun Gothic';
const C = {
  ink: 'FF1F2937', muted: 'FF6B7280', line: 'FFE2E6EA',
  head: 'FFEEF2F7', band: 'FFDCE8F5', bandInk: 'FF0B57A4',
  sub: 'FFF3F6FA', grand: 'FFE6EEF8', note: 'FFFFF6E0', sun: 'FFC0392B', sat: 'FF2563EB',
};
const hair = { style: 'thin', color: { argb: C.line } };
const box = { top: hair, left: hair, bottom: hair, right: hair };
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const NUM_FMT = '#,##0;-#,##0;"-"';

function setCollapsed(row, value) {
  Object.defineProperty(row, 'collapsed', { get: () => Boolean(value), configurable: true });
}

// 줄바꿈 글자가 잘리지 않도록 행 높이를 어림한다 (한글은 영문 2칸으로 계산)
function estimateHeight(text, colWidth, base = 18) {
  if (!text) return base;
  const cap = Math.max(4, colWidth - 1);
  let lines = 0;
  for (const part of String(text).split('\n')) {
    let w = 0;
    for (const ch of part) w += ch.charCodeAt(0) > 255 ? 2 : 1;
    lines += Math.max(1, Math.ceil(w / cap));
  }
  return Math.max(base, lines * 15 + 4);
}

const cellStyle = (cell, { bold = false, color = C.ink, size = 10, bg = null, align = 'left', wrap = false, valign = 'middle', border = true } = {}) => {
  cell.font = { name: FONT, size, bold, color: { argb: color } };
  cell.alignment = { horizontal: align, vertical: valign, wrapText: wrap };
  if (bg) cell.fill = fill(bg);
  if (border) cell.border = box;
};

function titleBlock(ws, title, sub, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { name: FONT, size: 15, bold: true, color: { argb: C.ink } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, lastCol);
  ws.getCell(2, 1).value = sub;
  ws.getCell(2, 1).font = { name: FONT, size: 9.5, color: { argb: C.muted } };
}

function headerRow(ws, rowNo, labels) {
  const row = ws.getRow(rowNo);
  labels.forEach((l, i) => {
    const c = row.getCell(i + 1);
    c.value = l;
    cellStyle(c, { bold: true, bg: C.head, align: 'center', wrap: true });
    c.border = { ...box, bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } } };
  });
  row.height = 24;
}

const dateStyle = (cell, wd) => {
  cellStyle(cell, { align: 'center', color: wd === '일' ? C.sun : wd === '토' ? C.sat : C.ink });
};

function sheetShared(ws, lastCol, freezeRow, freezeCols) {
  ws.views = [{ state: 'frozen', ySplit: freezeRow, xSplit: freezeCols, showGridLines: false }];
  ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  ws.headerFooter = { oddFooter: '&C&P / &N' };
  ws.pageSetup.printTitlesRow = `${freezeRow}:${freezeRow}`;
  void lastCol;
}

function addContentSheet(wb, data, sub) {
  const ws = wb.addWorksheet('일보 내용', { properties: { tabColor: { argb: 'FF0B57A4' } } });
  const widths = [11, 6, 62, 40, 24, 8];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  titleBlock(ws, '공사일보 내용', sub, widths.length);
  headerRow(ws, 4, ['일자', '요일', '작업내용', '특이사항', '투입 인원', '합계']);
  let r = 5;
  data.groups.forEach((g, gi) => {
    if (gi > 0) { ws.getRow(r).height = 8; r += 1; }
    // 프로젝트 띠
    ws.mergeCells(r, 1, r, widths.length);
    const band = ws.getCell(r, 1);
    const p = g.project;
    band.value = `▣  ${g.label}      ${[normalizeJVName(p.site || ''), normalizeJVName(p.line || '')].filter(Boolean).join(' / ')}   |   일보 ${g.days.length}건 (${g.first} ~ ${g.last})   |   투입 ${g.total}인·일`;
    cellStyle(band, { bold: true, bg: C.band, color: C.bandInk, size: 11 });
    ws.getRow(r).height = 24;
    r += 1;
    g.days.forEach((d) => {
      const row = ws.getRow(r);
      row.getCell(1).value = d.date; dateStyle(row.getCell(1), d.weekday);
      row.getCell(2).value = d.weekday; dateStyle(row.getCell(2), d.weekday);
      row.getCell(3).value = d.work; cellStyle(row.getCell(3), { wrap: true, valign: 'top' });
      row.getCell(4).value = d.notes; cellStyle(row.getCell(4), { wrap: true, valign: 'top', bg: d.notes ? C.note : null });
      row.getCell(5).value = d.summary; cellStyle(row.getCell(5), { wrap: true, valign: 'top', size: 9.5, color: C.muted });
      row.getCell(6).value = d.total || null; cellStyle(row.getCell(6), { align: 'center', bold: true, valign: 'top' });
      row.getCell(6).numFmt = NUM_FMT;
      [1, 2].forEach((c) => { row.getCell(c).alignment = { horizontal: 'center', vertical: 'top' }; });
      row.height = Math.min(300, Math.max(estimateHeight(d.work, widths[2]), estimateHeight(d.notes, widths[3]), estimateHeight(d.summary, widths[4])));
      r += 1;
    });
  });
  sheetShared(ws, widths.length, 4, 2);
  return ws;
}

function addManpowerSheet(wb, data, sub, { collapseDaily }) {
  const ws = wb.addWorksheet('공수', { properties: { tabColor: { argb: 'FF2E8B57' }, outlineLevelRow: 1 } });
  const nd = data.depts.length;
  const colTotal = 3 + nd;            // 합계 열(1-based)
  const colDays = colTotal + 1;
  const colAvg = colTotal + 2;
  const lastCol = colAvg;
  ws.getColumn(1).width = 30; // 프로젝트 이름(소계 줄)이 잘리지 않도록 넓게
  ws.getColumn(2).width = 6;
  for (let i = 0; i < nd; i += 1) ws.getColumn(3 + i).width = Math.max(7, data.depts[i].label.length * 2 + 3);
  ws.getColumn(colTotal).width = 9;
  ws.getColumn(colDays).width = 9;
  ws.getColumn(colAvg).width = 9;
  titleBlock(ws, '공수 현황 (사람·일)', `${sub}   |   프로젝트 줄의 [-]를 누르면 일자별 내용이 접혀 종합만 보입니다`, lastCol);
  headerRow(ws, 4, ['일자 / 프로젝트', '요일', ...data.depts.map((d) => d.label), '합계', '일보 일수', '일평균']);
  const colLetter = (c) => ws.getColumn(c).letter;

  // 전체 합계 줄 (맨 위) — 아래 프로젝트 소계는 SUBTOTAL 이라 이중으로 세지 않는다
  const grandRow = 5;
  let r = 6;
  const subtotalRows = [];
  const dayRanges = [];
  data.groups.forEach((g) => {
    ws.getRow(r).height = 6; r += 1; // 프로젝트 사이 여백
    const first = r;
    g.days.forEach((d) => {
      const row = ws.getRow(r);
      row.getCell(1).value = d.date; dateStyle(row.getCell(1), d.weekday);
      row.getCell(2).value = d.weekday; dateStyle(row.getCell(2), d.weekday);
      d.values.forEach((v, i) => {
        const c = row.getCell(3 + i);
        c.value = v || null; cellStyle(c, { align: 'center' }); c.numFmt = NUM_FMT;
      });
      const t = row.getCell(colTotal);
      t.value = { formula: `SUM(${colLetter(3)}${r}:${colLetter(2 + nd)}${r})`, result: d.total };
      cellStyle(t, { align: 'center', bold: true }); t.numFmt = NUM_FMT;
      [colDays, colAvg].forEach((c) => cellStyle(row.getCell(c), {}));
      row.outlineLevel = 1;
      if (collapseDaily) row.hidden = true;
      row.height = 18;
      r += 1;
    });
    const last = r - 1;
    dayRanges.push(`${colLetter(colTotal)}${first}:${colLetter(colTotal)}${last}`);
    const row = ws.getRow(r);
    row.getCell(1).value = `▣  ${g.label}`;
    ws.mergeCells(r, 1, r, 2);
    cellStyle(row.getCell(1), { bold: true, bg: C.band, color: C.bandInk });
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
    cellStyle(row.getCell(2), { bg: C.band });
    g.sums.forEach((s, i) => {
      const c = row.getCell(3 + i);
      c.value = { formula: `SUBTOTAL(9,${colLetter(3 + i)}${first}:${colLetter(3 + i)}${last})`, result: s };
      cellStyle(c, { bold: true, bg: C.band, align: 'center' }); c.numFmt = NUM_FMT;
    });
    const t = row.getCell(colTotal);
    t.value = { formula: `SUBTOTAL(9,${colLetter(colTotal)}${first}:${colLetter(colTotal)}${last})`, result: g.total };
    cellStyle(t, { bold: true, bg: C.band, color: C.bandInk, align: 'center' }); t.numFmt = NUM_FMT;
    const dcell = row.getCell(colDays);
    dcell.value = { formula: `COUNT(${colLetter(colTotal)}${first}:${colLetter(colTotal)}${last})`, result: g.days.length };
    cellStyle(dcell, { bold: true, bg: C.band, align: 'center' }); dcell.numFmt = NUM_FMT;
    const a = row.getCell(colAvg);
    a.value = { formula: `IF(${colLetter(colDays)}${r}=0,0,ROUND(${colLetter(colTotal)}${r}/${colLetter(colDays)}${r},1))`, result: g.days.length ? Math.round((g.total / g.days.length) * 10) / 10 : 0 };
    cellStyle(a, { bold: true, bg: C.band, align: 'center' }); a.numFmt = '0.0';
    row.height = 22;
    setCollapsed(row, collapseDaily);
    subtotalRows.push(r);
    r += 1;
  });
  const lastData = r - 1;

  // 맨 위 전체 합계
  const gr = ws.getRow(grandRow);
  gr.getCell(1).value = `전체 합계  (${data.groups.length}개 프로젝트)`;
  ws.mergeCells(grandRow, 1, grandRow, 2);
  cellStyle(gr.getCell(1), { bold: true, bg: C.grand, size: 11 });
  cellStyle(gr.getCell(2), { bg: C.grand });
  const rangeOf = (c) => `${colLetter(c)}6:${colLetter(c)}${lastData}`;
  data.sums.forEach((s, i) => {
    const c = gr.getCell(3 + i);
    c.value = { formula: `SUBTOTAL(9,${rangeOf(3 + i)})`, result: s };
    cellStyle(c, { bold: true, bg: C.grand, align: 'center', size: 11 }); c.numFmt = NUM_FMT;
  });
  const gt = gr.getCell(colTotal);
  gt.value = { formula: `SUBTOTAL(9,${rangeOf(colTotal)})`, result: data.grandTotal };
  cellStyle(gt, { bold: true, bg: C.grand, align: 'center', size: 11, color: C.bandInk }); gt.numFmt = NUM_FMT;
  const gd = gr.getCell(colDays);
  gd.value = data.total;
  cellStyle(gd, { bold: true, bg: C.grand, align: 'center', size: 11 });
  const ga = gr.getCell(colAvg);
  ga.value = data.total ? Math.round((data.grandTotal / data.total) * 10) / 10 : 0;
  cellStyle(ga, { bold: true, bg: C.grand, align: 'center', size: 11 }); ga.numFmt = '0.0';
  gr.height = 26;

  // 일별 합계 열: 사람이 많은 날일수록 진하게 (시인성)
  dayRanges.forEach((ref, i) => {
    ws.addConditionalFormatting({
      ref,
      rules: [{ type: 'dataBar', priority: i + 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: 'FF9DC3E6' }, gradient: false }],
    });
  });
  sheetShared(ws, lastCol, 4, 2);
  return ws;
}

function saveFile(buffer, fileName) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

const safeName = (s) => String(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 40);

/** 공사일보를 엑셀로 내려받는다. options: { collapseDaily, scopeLabel }. 반환: { total, projects } */
export async function exportDailyReportsExcel(input, options = {}) {
  const data = buildDailyReportData(input);
  if (data.total === 0) throw new Error('해당 조건에 등록된 공사일보가 없습니다.');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TW Project Manager';
  wb.calcProperties = { fullCalcOnLoad: true };
  const period = input.startDate || input.endDate ? `${input.startDate || '처음'} ~ ${input.endDate || '현재'}` : '전체 기간';
  const scope = options.scopeLabel || (input.sites?.length ? input.sites.join(', ') : '전체 SITE');
  const sub = `${scope}   |   ${period}   |   프로젝트 ${data.groups.length}개 · 일보 ${data.total}건`;
  addContentSheet(wb, data, sub);
  addManpowerSheet(wb, data, sub, { collapseDaily: Boolean(options.collapseDaily) });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = data.groups.length === 1
    ? `공사일보_${safeName(data.groups[0].label)}_${stamp}.xlsx`
    : `공사일보_취합_${safeName(scope)}_${stamp}.xlsx`;
  saveFile(await wb.xlsx.writeBuffer(), name);
  return { total: data.total, projects: data.groups.length };
}
