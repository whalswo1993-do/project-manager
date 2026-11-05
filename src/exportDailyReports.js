// 공사일보 취합 엑셀 내보내기 (AI 호출 없음).
// 기간 안에 등록된 공사일보를 프로젝트·부서별로 모아 3개 시트로 내려받는다.
//   일보 목록 / 프로젝트별 공수 / 일자별 공수
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

/**
 * 시트에 들어갈 값을 만든다 (순수 함수 — 파일 저장과 분리해 시험한다).
 * reports: daily_reports 행(정리 전), projects: 프로젝트 목록, sites: 선택한 Site(빈 배열 = 전체)
 */
export function buildDailyReportSheets({ reports = [], projects = [], startDate, endDate, sites = [] }) {
  const byId = new Map(projects.map((p) => [String(p.id), p]));
  const rows = [];
  for (const raw of reports) {
    const p = byId.get(String(raw.project_id));
    if (!p) continue;
    if (!matchesSites(sites, normalizeJVName(p.site || ''), normalizeJVName)) continue;
    const date = dateOnly(raw.report_date);
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;
    rows.push({ project: p, date, r: normalizeReportRow(raw) });
  }
  rows.sort((a, b) =>
    String(a.project.site || '').localeCompare(String(b.project.site || ''), 'ko') ||
    String(a.project.manufacturingNo || '').localeCompare(String(b.project.manufacturingNo || ''), 'ko') ||
    a.date.localeCompare(b.date));

  // 사용자 지정 부서(통역·지원 등)는 기간 안에 등장한 이름만 열로 만든다.
  const customNames = [...new Set(rows.flatMap(({ r }) => Object.keys(r.custom_depts || {})))].sort((a, b) => a.localeCompare(b, 'ko'));
  const deptHeaders = [...DEPT_COLUMNS.map((c) => c.label), ...customNames];
  const deptValues = (r) => [...DEPT_COLUMNS.map((c) => num(r[c.key])), ...customNames.map((n) => num(r.custom_depts?.[n]))];

  const list = rows.map(({ project: p, date, r }) => [
    date,
    normalizeJVName(p.site || ''),
    normalizeJVName(p.line || ''),
    normalizeJVName(p.manufacturingNo || ''),
    normalizeJVName(p.name || ''),
    r.work_details || '',
    r.special_notes || r.issues || '',
    ...deptValues(r),
    reportTotal(r),
  ]);

  // 프로젝트별: 일보 일수, 부서별 투입 합계(사람·일), 첫/마지막 일보일
  const perProject = new Map();
  for (const { project: p, date, r } of rows) {
    const k = String(p.id);
    if (!perProject.has(k)) perProject.set(k, { p, days: new Set(), first: date, last: date, sums: deptHeaders.map(() => 0) });
    const e = perProject.get(k);
    e.days.add(date);
    if (date < e.first) e.first = date;
    if (date > e.last) e.last = date;
    deptValues(r).forEach((v, i) => { e.sums[i] += v; });
  }
  const projectRows = [...perProject.values()].map(({ p, days, first, last, sums }) => [
    normalizeJVName(p.site || ''),
    normalizeJVName(p.line || ''),
    normalizeJVName(p.manufacturingNo || ''),
    normalizeJVName(p.name || ''),
    days.size,
    first,
    last,
    ...sums,
    sums.reduce((a, b) => a + b, 0),
  ]);

  // 일자별: 날짜마다 일보 수와 부서별 투입 합계
  const perDate = new Map();
  for (const { date, r } of rows) {
    if (!perDate.has(date)) perDate.set(date, { count: 0, sums: deptHeaders.map(() => 0) });
    const e = perDate.get(date);
    e.count += 1;
    deptValues(r).forEach((v, i) => { e.sums[i] += v; });
  }
  const dateRows = [...perDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => [
    date, e.count, ...e.sums, e.sums.reduce((a, b) => a + b, 0),
  ]);

  return {
    deptHeaders,
    listHeaders: ['일보일', 'Site', 'Line', '제조번호', '프로젝트', '작업내용', '특이사항', ...deptHeaders, '합계'],
    projectHeaders: ['Site', 'Line', '제조번호', '프로젝트', '일보 일수', '첫 일보', '마지막 일보', ...deptHeaders, '합계(인·일)'],
    dateHeaders: ['일보일', '일보 수', ...deptHeaders, '합계'],
    list,
    projectRows,
    dateRows,
    total: rows.length,
  };
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

function addSheet(wb, name, title, subtitle, headers, rows, { textCols = [], wideCols = {}, sumFromCol = null } = {}) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.addRow([title]);
  ws.mergeCells(1, 1, 1, Math.max(2, headers.length));
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.addRow([subtitle]);
  ws.getCell(2, 1).font = { color: { argb: 'FF595959' } };
  ws.addRow([]);
  const head = ws.addRow(headers);
  head.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E5E5' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell({ includeEmpty: true }, (c, i) => {
      c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
      c.alignment = textCols.includes(i) ? { vertical: 'top', wrapText: true } : { vertical: 'top', horizontal: typeof c.value === 'number' ? 'center' : 'left' };
    });
  });
  // 합계 줄은 수식으로 둔다 (필터·행 추가 시에도 맞게)
  if (sumFromCol && rows.length) {
    const first = 5, last = 4 + rows.length;
    const tr = ws.addRow(headers.map((_, i) => {
      if (i === 0) return '합계';
      if (i + 1 < sumFromCol) return '';
      const col = ws.getColumn(i + 1).letter;
      return { formula: `SUBTOTAL(9,${col}${first}:${col}${last})`, result: rows.reduce((s, r) => s + (Number(r[i]) || 0), 0) };
    }));
    tr.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; c.alignment = { horizontal: 'center' }; });
  }
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = wideCols[i + 1] || Math.max(8, Math.min(14, String(h).length * 2 + 2));
  });
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: headers.length } };
  return ws;
}

/** 기간 안의 공사일보를 엑셀로 내려받는다. 반환: { total } (일보 건수) */
export async function exportDailyReportsExcel(input) {
  const sheets = buildDailyReportSheets(input);
  if (sheets.total === 0) throw new Error('해당 기간·SITE에 등록된 공사일보가 없습니다.');
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TW Project Manager';
  const siteText = input.sites?.length ? input.sites.join(', ') : '전체 SITE';
  const sub = `기간 ${input.startDate} ~ ${input.endDate} | ${siteText} | 일보 ${sheets.total}건`;

  addSheet(wb, '일보 목록', '공사일보 목록', sub, sheets.listHeaders, sheets.list, {
    textCols: [6, 7], wideCols: { 1: 12, 2: 10, 3: 10, 4: 12, 5: 28, 6: 60, 7: 40 }, sumFromCol: 8,
  });
  addSheet(wb, '프로젝트별 공수', '프로젝트별 투입 공수 (인·일)', sub, sheets.projectHeaders, sheets.projectRows, {
    wideCols: { 1: 10, 2: 10, 3: 12, 4: 30, 5: 10, 6: 12, 7: 12 }, sumFromCol: 5,
  });
  addSheet(wb, '일자별 공수', '일자별 투입 공수', sub, sheets.dateHeaders, sheets.dateRows, {
    wideCols: { 1: 12, 2: 8 }, sumFromCol: 2,
  });

  saveFile(await wb.xlsx.writeBuffer(), `공사일보_취합_${input.startDate}_${input.endDate}.xlsx`);
  return { total: sheets.total };
}
