// 프로젝트의 마스터 스케줄 데이터(마일스톤·부서별 일 공수)를 "Master Schedule 양식" 파일에 채워 내려받는다.
//
// 원칙: 양식의 수식·서식·조건부 서식(간트 막대)은 건드리지 않고 **입력 칸에 값만** 넣는다.
//  - 양식 파일(public/master-schedule-fill.b64)은 원본 xlsx를 base64로 담은 것이다.
//    (사내 문서보안(Fasoo DRM)이 저장소 폴더의 xlsx/zip 파일을 자동으로 암호화해서, 파일 대신 텍스트로 둔다.)
//  - ExcelJS 등으로 다시 쓰면 서식이 달라질 수 있어, 시트 XML의 해당 셀 값만 직접 바꾼다.
//  - 값이 들어가는 칸은 모두 양식이 입력용으로 비워 둔 칸이다:
//      Edit!F3 프로젝트명 · Edit!H3 시작일 · Edit!F6:F25 공정명 · Edit!C14:C17 여분 부서명
//      Planning!C7 Line · D7 Equipment · G7:G26 Start · I7:I26 Duration · J28:NJ39 부서별 일 공수
//  - 수식 칸(End, Total, Peak, 날짜 머리글 등)은 수식을 그대로 두고 저장된 계산값(캐시)만 새 값으로 맞춘다.
//    엑셀로 열면 전체 재계산(fullCalcOnLoad)이 한 번 더 돈다.
//  - 한 파일에는 이 프로젝트(설비) 하나가 양식의 첫 블록에 들어간다. 나머지 블록은 양식 그대로 비어 있다.
import { normalizeDeptName } from './masterPlanParser.js';

export const TEMPLATE_PATH = 'master-schedule-fill.b64';

const MAX_ACTIVITIES = 20; // Planning 7~26행 / Edit F6:F25
const FIRST_DAY_COL = 10; // J
const LAST_DAY_COL = 374; // NJ (365일)
const DEPT_ROWS = 12; // Planning 28~39행 / Edit C6:C17
const ACTIVITY_ROW0 = 7;
const DEPT_ROW0 = 28;

// 저장된 부서명(normalizeDeptName 결과) → 양식 Edit!C6:C13 에 미리 적혀 있는 이름
const TEMPLATE_DEPTS = [
  ['기구', 'Mechanical'],
  ['비전', 'Vision'],
  ['제어', 'Control'],
  ['전장', 'Electronical'],
  ['안전', 'Safety'],
  ['비전 외주', '비전 외주'],
  ['Supervisor', 'Supervisor'],
  ['소장', '소장'],
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' → 엑셀 날짜 일련번호 (유효하지 않으면 null) */
export function isoToSerial(iso) {
  const m = ISO.exec(String(iso || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (Number.isNaN(t)) return null;
  return Math.round(t / 86400000) + 25569;
}

export function colName(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 프로젝트 이름("Site - 3Line - 상세 - 설비")에서 양식의 제목과 설비명을 나눈다. */
export function splitProjectName(name) {
  const clean = String(name || '').trim();
  const parts = clean.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return { title: parts.slice(0, -1).join(' - '), equipment: parts[parts.length - 1] };
  return { title: clean, equipment: parts.length === 2 ? parts[1] : clean };
}

/**
 * 프로젝트 → 양식에 넣을 값 계획 (순수 함수 — 파일 처리와 분리해 시험한다).
 * 반환: { title, equipment, line, startSerial, activities, depts, warnings }
 */
export function planMasterScheduleFill(project) {
  const warnings = [];
  const p = project || {};
  const { title, equipment } = splitProjectName(p.name);
  const lineDigits = String(p.line || '').match(/\d+/);
  const line = lineDigits ? Number(lineDigits[0]) : null;

  // 마일스톤 (등록된 순서 그대로)
  const rawMs = (p.milestones || []).filter((m) => m && m.name && isoToSerial(m.startDate) !== null && isoToSerial(m.endDate) !== null);
  if (rawMs.length > MAX_ACTIVITIES) {
    warnings.push(`마일스톤 ${rawMs.length}개 중 양식에 들어가는 ${MAX_ACTIVITIES}개만 넣었습니다.`);
  }
  const activities = rawMs.slice(0, MAX_ACTIVITIES).map((m) => {
    const s = isoToSerial(m.startDate);
    const e = isoToSerial(m.endDate);
    return { name: String(m.name), start: s, duration: Math.max(1, e - s + 1) };
  });

  // 부서별 일 공수 — 저장된 이름을 표준 이름으로 합친다
  const merged = new Map();
  const departments = p.manpower?.departments || {};
  for (const [rawName, d] of Object.entries(departments)) {
    const norm = normalizeDeptName(rawName);
    if (!norm || norm === 'Total Manday') continue;
    const cur = merged.get(norm) || {};
    for (const [date, val] of Object.entries(d?.daily || {})) {
      const n = Number(val);
      if (!(n > 0)) continue;
      cur[date] = (cur[date] || 0) + n;
    }
    merged.set(norm, cur);
  }

  // 일자 축 시작일 = 가장 빠른 마일스톤/공수 날짜 (양식은 시작일부터 365일 칸)
  const serials = activities.map((a) => a.start);
  for (const daily of merged.values()) {
    for (const date of Object.keys(daily)) {
      const s = isoToSerial(date);
      if (s !== null) serials.push(s);
    }
  }
  let startSerial = serials.length ? Math.min(...serials) : isoToSerial(p.startDate);
  if (startSerial === null || startSerial === undefined) startSerial = isoToSerial(new Date().toISOString().slice(0, 10));

  // 양식에 이름이 적혀 있는 부서 → 그 줄에, 나머지 부서 → 여분 줄(Edit!C14:C17)에
  const rows = TEMPLATE_DEPTS.map(([key, label]) => ({ label, daily: merged.get(key) || {}, spare: false }));
  const extras = [...merged.keys()].filter((k) => !TEMPLATE_DEPTS.some(([key]) => key === k));
  const spareSlots = DEPT_ROWS - TEMPLATE_DEPTS.length;
  extras.slice(0, spareSlots).forEach((k) => rows.push({ label: k, daily: merged.get(k), spare: true }));
  if (extras.length > spareSlots) {
    warnings.push(`부서 ${extras.slice(spareSlots).join(', ')}는 양식의 부서 줄이 모자라 넣지 못했습니다.`);
  }

  const depts = rows.map((r) => {
    const cells = {}; // 열 번호 → 인원
    let total = 0;
    let peak = 0;
    let outOfRange = 0;
    for (const [date, val] of Object.entries(r.daily)) {
      const s = isoToSerial(date);
      if (s === null) continue;
      const col = FIRST_DAY_COL + (s - startSerial);
      if (col < FIRST_DAY_COL || col > LAST_DAY_COL) {
        outOfRange += 1;
        continue;
      }
      cells[col] = val;
      total += val;
      if (val > peak) peak = val;
    }
    if (outOfRange) warnings.push(`${r.label}: 양식의 일자 칸(시작일부터 365일)을 벗어난 공수 ${outOfRange}일치는 넣지 못했습니다.`);
    return { label: r.label, spare: r.spare, cells, total, peak };
  });

  const lastEnd = activities.reduce((mx, a) => Math.max(mx, a.start + a.duration - 1), 0);
  if (lastEnd && lastEnd - startSerial + 1 > LAST_DAY_COL - FIRST_DAY_COL + 1) {
    warnings.push('일정이 365일을 넘어 양식의 간트 칸 밖으로 나가는 구간이 있습니다.');
  }

  return { title, equipment, line, startSerial, activities, depts, warnings };
}

// ───────────────────────── 시트 XML 셀 패치 ─────────────────────────

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  // XML 1.0 에서 허용되지 않는 제어 문자는 뺀다
  .split('').filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 || c === 9 || c === 10 || c === 13; }).join('');

const CELL_RE = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
const FORMULA_RE = /<f(?:\s[^>]*)?\/>|<f(?:\s[^>]*)?>[\s\S]*?<\/f>/;

/** 셀 하나를 새 값으로 바꾼 XML 조각. edit = {num}|{str}|{clear}|{cache: number|string} */
function buildCell(ref, attrs, inner, edit) {
  const keep = attrs.replace(/\s+t="[^"]*"/, '');
  if ('cache' in edit) {
    const f = (inner || '').match(FORMULA_RE);
    if (!f) throw new Error(`수식 칸이 아닙니다: ${ref}`);
    const isStr = typeof edit.cache === 'string';
    return `<c r="${ref}"${keep}${isStr ? ' t="str"' : ''}>${f[0]}<v>${isStr ? xmlEscape(edit.cache) : edit.cache}</v></c>`;
  }
  if ('num' in edit) return `<c r="${ref}"${keep}><v>${edit.num}</v></c>`;
  if ('str' in edit) return `<c r="${ref}"${keep} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(edit.str)}</t></is></c>`;
  return `<c r="${ref}"${keep}/>`; // clear
}

/** rowEdits: { [행번호]: { [셀주소]: edit } } — 행 단위로 한 번씩만 훑는다(시트 XML이 4.6MB라서). */
export function patchSheetXml(xml, rowEdits) {
  let out = xml;
  for (const [rowNo, edits] of Object.entries(rowEdits)) {
    const open = out.indexOf(`<row r="${rowNo}" `);
    if (open < 0) throw new Error(`양식에서 ${rowNo}행을 찾지 못했습니다.`);
    const close = out.indexOf('</row>', open);
    const seg = out.slice(open, close);
    const pending = new Set(Object.keys(edits));
    const patched = seg.replace(CELL_RE, (whole, ref, attrs, inner) => {
      const edit = edits[ref];
      if (!edit) return whole;
      pending.delete(ref);
      return buildCell(ref, attrs, inner, edit);
    });
    if (pending.size) throw new Error(`양식에서 셀을 찾지 못했습니다: ${[...pending].slice(0, 3).join(', ')}`);
    out = out.slice(0, open) + patched + out.slice(close);
  }
  return out;
}

/** plan → 시트별 셀 편집 목록 */
export function buildSheetEdits(plan) {
  const edit = {}; // Edit 시트
  const plan2 = {}; // Planning 시트
  const put = (target, row, ref, e) => {
    (target[row] = target[row] || {})[ref] = e;
  };

  // ── Edit 시트: 입력 원본 ──
  put(edit, 3, 'F3', { str: plan.title });
  put(edit, 3, 'H3', { num: plan.startSerial });
  for (let i = 0; i < MAX_ACTIVITIES; i++) {
    const a = plan.activities[i];
    put(edit, 6 + i, `F${6 + i}`, a ? { str: a.name } : { clear: true });
  }
  plan.depts.forEach((d, i) => {
    if (d.spare) put(edit, 6 + i, `C${6 + i}`, { str: d.label });
  });

  // ── Planning 시트 ──
  put(plan2, 2, 'E2', { cache: plan.title });
  put(plan2, 3, 'E3', { cache: plan.startSerial });
  for (let c = FIRST_DAY_COL; c <= LAST_DAY_COL; c++) {
    put(plan2, 3, `${colName(c)}3`, { cache: plan.startSerial + (c - FIRST_DAY_COL) });
  }
  put(plan2, ACTIVITY_ROW0, 'C7', plan.line === null ? { clear: true } : { num: plan.line });
  put(plan2, ACTIVITY_ROW0, 'D7', plan.equipment ? { str: plan.equipment } : { clear: true });
  for (let i = 0; i < MAX_ACTIVITIES; i++) {
    const r = ACTIVITY_ROW0 + i;
    const a = plan.activities[i];
    put(plan2, r, `E${r}`, { cache: a ? a.name : 0 });
    put(plan2, r, `G${r}`, a ? { num: a.start } : { clear: true });
    put(plan2, r, `I${r}`, a ? { num: a.duration } : { clear: true });
    put(plan2, r, `H${r}`, { cache: a ? a.start - 1 + a.duration : -1 });
  }
  for (let i = 0; i < DEPT_ROWS; i++) {
    const r = DEPT_ROW0 + i;
    const d = plan.depts[i];
    if (d?.spare) put(plan2, r, `G${r}`, { cache: d.label });
    put(plan2, r, `H${r}`, { cache: d ? d.total : 0 });
    put(plan2, r, `I${r}`, { cache: d ? d.peak : 0 });
    if (d) {
      for (const [col, val] of Object.entries(d.cells)) put(plan2, r, `${colName(+col)}${r}`, { num: val });
    }
  }
  return { edit, planning: plan2 };
}

// ───────────────────────── 파일 만들기 ─────────────────────────

async function loadJSZip() {
  const mod = await import('jszip');
  return mod.default || mod;
}

/** base64 텍스트 → 바이트 */
export function base64ToBytes(b64) {
  const bin = atob(String(b64).replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 양식(바이트)에 프로젝트 값을 채운 xlsx 바이트를 돌려준다.
 * 반환: { bytes: Uint8Array, warnings: string[] }
 */
export async function fillMasterScheduleTemplate(templateBytes, project) {
  const plan = planMasterScheduleFill(project);
  const edits = buildSheetEdits(plan);
  const JSZip = await loadJSZip();
  const zip = await JSZip.loadAsync(templateBytes);

  // 시트 파일 이름은 workbook.xml(.rels)로 찾는다 (Edit / Planning)
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetPath = (name) => {
    const sm = wbXml.match(new RegExp(`<sheet [^>]*name="${name}"[^>]*r:id="([^"]+)"`));
    if (!sm) throw new Error(`양식에 ${name} 시트가 없습니다.`);
    const rm = relsXml.match(new RegExp(`<Relationship [^>]*Id="${sm[1]}"[^>]*Target="([^"]+)"`))
      || relsXml.match(new RegExp(`<Relationship [^>]*Target="([^"]+)"[^>]*Id="${sm[1]}"`));
    if (!rm) throw new Error(`양식에서 ${name} 시트 경로를 찾지 못했습니다.`);
    return `xl/${rm[1].replace(/^\/?(xl\/)?/, '')}`;
  };

  for (const [name, rowEdits] of [['Edit', edits.edit], ['Planning', edits.planning]]) {
    const path = sheetPath(name);
    const xml = await zip.file(path).async('string');
    zip.file(path, patchSheetXml(xml, rowEdits), { createFolders: false });
  }

  // 열 때 전체 재계산 (수식은 그대로, 저장된 계산값만 새로 맞춘다)
  const newWb = wbXml.replace(/<calcPr([^>]*?)\/>/, (m, a) => (/fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`));
  zip.file('xl/workbook.xml', newWb, { createFolders: false });

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, warnings: plan.warnings };
}

export function masterScheduleFileName(project) {
  const base = [project?.manufacturingNo, project?.name].filter(Boolean).join(' ')
    .replace(/-[a-f0-9]{4}\b/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'Project'} Master Schedule.xlsx`;
}

/** 브라우저: 양식을 불러와 채운 뒤 내려받는다. 경고 문구 배열을 돌려준다. */
export async function downloadMasterSchedule(project) {
  const url = `${import.meta.env.BASE_URL || '/'}${TEMPLATE_PATH}`.replace('//', '/');
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`양식 파일을 불러오지 못했습니다 (${res.status})`);
  const { bytes, warnings } = await fillMasterScheduleTemplate(base64ToBytes(await res.text()), project);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = masterScheduleFileName(project);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return warnings;
}
