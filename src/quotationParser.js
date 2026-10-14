// 견적서(Quotation / Detail List) 결정적 파서.
// AI 없이 정해진 규칙으로 엑셀 파일 또는 시트별 "표 붙여넣기" 데이터를 분석한다.
//
// 핵심 원칙
// 1. 특정 셀 주소(A11, C14 ...)에 의존하지 않는다. 사람마다 드래그 범위가 다르기 때문이다.
//    - 머리글 행이 있으면 머리글 글자(Item, Q'ty, Unit Price [KRW] ...)로 열을 찾는다.
//    - 머리글이 없으면 "수량 × 단가 = 금액"이 성립하는 숫자 열 3개를 찾아 기준(앵커)으로 삼고,
//      품명/규격 같은 글자 열은 그 앵커로부터의 상대 위치로 찾는다.
// 2. 금액은 KRW만 저장한다. USD/CNY 열은 무시한다.
// 3. 총액보다 품목별 단가가 중요하다. 그래서 모든 행에 대해 수량×단가=금액, 상세 블록 합계,
//    견적 라인 단가 ↔ 상세 블록 합계 일치 여부를 검증해 결과를 함께 돌려준다.

import { parseTSVWithQuotes } from './masterPlanParser.js';

// ───────────────────────── 기본 유틸 ─────────────────────────

export function cellText(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

// 엑셀 값/붙여넣기 문자열을 숫자로. 숫자가 아니면 null.
// "1,234", "₩1,234", "1,234원", "(1,234)", "△1,234", "-" (회계 서식의 0) 등을 처리한다.
// 회사 양식의 수량 열은 서식이 `\(General\)`이라 화면에 "(1)"로 보인다. 그래서 수량은 괄호를 음수로 보지 않는다(toQty).
export function toNumber(v, { parenNegative = true } = {}) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = cellText(v);
  if (!s) return null;
  if (/^[-–—]$/.test(s)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = parenNegative; s = s.slice(1, -1); }
  if (/^[△▲]/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/[₩￦$,\s]|원$|KRW$|krw$/g, '');
  if (s.endsWith('%')) s = s.slice(0, -1);
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}

// 금액 저장용: 부동소수 오차(32670.000000000004)를 지우고 소수 2자리까지만 남긴다.
export function roundKRW(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export const toQty = (v) => toNumber(v, { parenNegative: false });

const approxEqual = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.0005);

export function excelSerialToISO(serial) {
  if (typeof serial !== 'number' || serial < 20000 || serial > 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return d.toISOString().slice(0, 10);
}

export function parseDateValue(v) {
  if (typeof v === 'number') return excelSerialToISO(v);
  const s = cellText(v);
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{2})[.-](\d{1,2})[.-](\d{1,2})$/);
  if (m) return `20${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // 엑셀 서식 m/d/yy 로 보이는 날짜 ("10/7/26")
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const n = toNumber(s);
  return n !== null ? excelSerialToISO(n) : null;
}

// "1) ", "2.1)", "3.2) " 같은 번호 머리를 떼어낸다.
export function stripNumbering(s) {
  return cellText(s).replace(/^\d+(?:\.\d+)*\s*\)\s*/, '').trim();
}

function numberingOf(s) {
  const m = cellText(s).match(/^(\d+(?:\.\d+)*)\s*\)/);
  return m ? m[1] : null;
}

// ───────────────────────── 표(grid) 만들기 ─────────────────────────

// SheetJS 워크시트 → 2차원 배열. 병합 셀은 엑셀 복사와 똑같이 첫 칸에만 값이 있다.
export function gridFromSheet(XLSX, ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
}

// 붙여넣기 텍스트(TSV) → 2차원 배열
export function gridFromText(text) {
  const rows = parseTSVWithQuotes(String(text || '').replace(/\r\n?/g, '\n'));
  return rows.map(r => r.map(c => (typeof c === 'string' ? c : cellText(c))));
}

// ───────────────────────── 사전(키워드) ─────────────────────────

const UOM_RE = /^(set|sets|ea|md|m\/d|plt|lot|box|%|식|pc|pcs|kg|m|대|개|式|ls|unit|units|job|hr|h)$/i;
const TOTAL_ROW_RE = /합\s*계|총\s*계|총\s*견적|sub-?\s*total|^total|\(total\)|nego|final\s*price|tool\s*amount|service\s*amount|소\s*계/i;
const SUBTOTAL_RE = /소\s*계|sub-?\s*total/i;
const DISCIPLINES = [
  [/^mechanical$/i, '기구'],
  [/^control$/i, '제어'],
  [/^vision$/i, '비전'],
  [/^(electronic|electrical|wiring)$/i, '전장'],
  [/^safety$/i, '안전'],
];

// 가공품 재질(모재) 표기
const MATERIAL_RE = /^(a\d{4}|al\d*|al\s?\d{4}|sus\s?\d{3}|s\d{2}c|skd\s?\d+|skh-?\d+|ss\s?41|ss400|spcc|sphc|suj\s?2?|sk\s?\d|scm\s?\d+|acetal|아세탈|흑색\s*아세탈|peek|paek|pom|mc\s*nylon|mcnylon|nylon|urethane|우레탄|pyrex|glass|teflon|ptfe|bakelite|베이클라이트|도면\s*참조|c\d{4}|cu|brass|황동)/i;

export function classifyDetailItem({ name, maker, spec }) {
  const m = cellText(maker);
  const n = cellText(name);
  if (m && MATERIAL_RE.test(m)) return '가공품';
  if (/잡자재/.test(n)) return '잡자재';
  if (m && !/^(pc|pcs|ea|tbd|-)$/i.test(m)) return '구매품';
  if (/비용|인증|보관함/.test(n)) return '기타';
  if (/jig|지그|bkt|bracket|plate|block|holder|guide/i.test(n)) return '가공품';
  if (cellText(spec)) return '구매품';
  return '기타';
}

export function classifySection(section) {
  const s = cellText(section);
  if (/재사용|차감|금액\s*제외/i.test(s)) return '차감';
  if (/프로그램|program|s\/?w|소프트/i.test(s)) return '프로그램';
  if (/인건비|labor|설계/i.test(s)) return '인건비';
  if (/포장|운송|package|transport|하역|반입|unloading|공통|expense|비자|항공|체류/i.test(s)) return '경비';
  if (/기구|mechanism|tool|자재|부품|material/i.test(s)) return '기구 SET';
  return '기타';
}

// ───────────────────────── 머리글 찾기 ─────────────────────────

function rowTexts(row) {
  return row.map(cellText);
}

function findCol(texts, re, exclude = []) {
  for (let i = 0; i < texts.length; i++) {
    if (exclude.includes(i)) continue;
    if (re.test(texts[i])) return i;
  }
  return -1;
}

// 견적서(Quotation) 머리글: Item / Details / Unit / Amount / Unit Price [KRW] / Amount [KRW] / Remark
function detectQuotationHeader(row) {
  const t = rowTexts(row);
  const section = findCol(t, /^(item|items|구분|항목|대분류)$/i);
  const detail = findCol(t, /^(details?|내역|세부\s*내역|품명|description)$/i);
  const priceCols = t.map((x, i) => (/unit\s*price|단\s*가/i.test(x) ? i : -1)).filter(i => i >= 0);
  if (detail < 0 || priceCols.length === 0) return null;
  if (section < 0 && !/details?/i.test(t[detail])) return null;
  const pickKRW = (cols) => cols.find(i => /krw|원|₩/i.test(t[i])) ?? (cols.find(i => !/usd|cny|rmb|eur|jpy|\$/i.test(t[i])) ?? -1);
  const unitPrice = pickKRW(priceCols);
  const amountCols = t.map((x, i) => (/(amount|금\s*액)\s*\[|^(금액|amount)\s*\(|^금\s*액$/i.test(x) && !priceCols.includes(i) ? i : -1)).filter(i => i >= 0);
  const amount = pickKRW(amountCols);
  const foreignPrice = priceCols.find(i => i !== unitPrice && /usd|cny|rmb|eur|jpy/i.test(t[i]));
  const qty = findCol(t, /^(amount|q'?ty|qty|수\s*량)$/i);
  const uom = findCol(t, /^(unit|단\s*위|uom)$/i);
  const remark = findCol(t, /remark|비\s*고/i);
  return {
    kind: 'quotation',
    section,
    detail,
    // Details 머리글은 B:C 병합이라 C열(소분류)이 바로 옆에 있다.
    sub: detail + 1 < (uom >= 0 ? uom : qty) ? detail + 1 : -1,
    uom,
    qty,
    unitPrice,
    amount,
    remark,
    foreignCurrency: foreignPrice !== undefined ? (t[foreignPrice].match(/usd|cny|rmb|eur|jpy/i) || [''])[0].toUpperCase() : null,
    unitPriceIsKRW: unitPrice >= 0 && !/usd|cny|rmb|eur|jpy/i.test(t[unitPrice]),
  };
}

// 상세 리스트(Detail List) 머리글: No. / Unit / Item / Maker / Spec / Q'ty / Unit Price / Amount Price / Remark
function detectDetailHeader(row) {
  const t = rowTexts(row);
  const item = findCol(t, /^(item|품\s*목\s*명?|품명|part\s*name|description)$/i);
  const qty = findCol(t, /^(q'?ty|qty|수\s*량|ea)$/i);
  const unitPrice = findCol(t, /unit\s*price|단\s*가/i);
  if (item < 0 || qty < 0 || unitPrice < 0) return null;
  const amount = findCol(t, /amount|합\s*계|금\s*액|total/i, [unitPrice]);
  return {
    kind: 'detail',
    no: findCol(t, /^(no\.?|번호|순번)$/i),
    unit: findCol(t, /^(unit|유닛|unit\s*name|ass'?y)$/i),
    item,
    maker: findCol(t, /maker|mat'?l|material|재질|제조사|메이커/i),
    spec: findCol(t, /spec|treatment|규격|사양|후처리/i),
    qty,
    unitPrice,
    amount,
    remark: findCol(t, /remark|비\s*고/i),
  };
}

// ───────────────────────── 머리글 없는 붙여넣기: 숫자 앵커 추론 ─────────────────────────

// 모든 행에서 (수량 q, 단가 u, 금액 a) 열 3개 조합 중 q×u≈a 가 가장 많이 성립하는 것을 고른다.
// 같은 점수면 금액 규모가 큰 쪽(KRW가 USD/CNY보다 크다)을 고른다.
export function inferNumericTriple(grid) {
  const width = Math.max(0, ...grid.map(r => r.length));
  const score = new Map();
  for (const row of grid) {
    const nums = [];
    for (let c = 0; c < Math.min(row.length, width); c++) {
      const n = toNumber(row[c]);
      if (n !== null) nums.push([c, n]);
    }
    if (nums.length < 3 || nums.length > 14) continue;
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        for (let k = j + 1; k < nums.length; k++) {
          const [qc, q] = nums[i], [uc, u] = nums[j], [ac, a] = nums[k];
          if (a === 0 || q === 0 || u === 0) continue;
          if (!approxEqual(Math.abs(q * u), Math.abs(a))) continue;
          // q와 u가 둘 다 작은 정수인 조합(인원×일수)은 단가로 보기 어렵다
          if (Math.abs(u) < 100 && Math.abs(q) < 100 && Number.isInteger(u) && Number.isInteger(q) && Math.abs(a) < 1000) continue;
          const key = `${qc},${uc},${ac}`;
          const s = score.get(key) || { qc, uc, ac, hits: 0, mag: 0 };
          s.hits += 1;
          s.mag += Math.log10(Math.abs(a) + 1);
          score.set(key, s);
        }
      }
    }
  }
  let best = null;
  for (const s of score.values()) {
    if (!best || s.hits > best.hits || (s.hits === best.hits && s.mag > best.mag)) best = s;
  }
  if (!best) return null;
  // 같은 수량 열을 쓰면서 금액 규모가 더 큰 조합(=KRW)이 비슷한 횟수로 있으면 그쪽을 쓴다
  for (const s of score.values()) {
    if (s.qc === best.qc && s.hits >= best.hits * 0.6 && s.mag / s.hits > best.mag / best.hits + 0.5) best = s;
  }
  return best.hits >= 1 ? { qty: best.qc, unitPrice: best.uc, amount: best.ac, hits: best.hits } : null;
}

function inferColumns(grid) {
  const triple = inferNumericTriple(grid);
  if (!triple) return null;
  const { qty, unitPrice, amount } = triple;
  // 수량 바로 왼쪽 열이 SET/EA/MD 같은 단위면 견적서(Quotation), 아니면 상세 리스트
  let uomHits = 0, rowsWithQty = 0;
  for (const row of grid) {
    if (toQty(row[qty]) === null || toNumber(row[unitPrice]) === null) continue;
    rowsWithQty++;
    if (UOM_RE.test(cellText(row[qty - 1]))) uomHits++;
  }
  const isQuotation = rowsWithQty > 0 && uomHits / rowsWithQty >= 0.5;
  if (isQuotation) {
    return {
      kind: 'quotation', inferred: true,
      uom: qty - 1, sub: qty - 2, detail: qty - 3, section: qty - 4,
      qty, unitPrice, amount, remark: amount + 1, unitPriceIsKRW: true, foreignCurrency: null,
    };
  }
  return {
    kind: 'detail', inferred: true,
    spec: qty - 1, maker: qty - 2, item: qty - 3, unit: qty - 4, no: qty - 5,
    qty, unitPrice, amount, remark: amount + 1,
  };
}

// ───────────────────────── 문서 정보(메타) ─────────────────────────

function valueRightOf(row, idx) {
  for (let c = idx + 1; c < row.length; c++) {
    const t = cellText(row[c]);
    if (t) return row[c];
  }
  return '';
}

export function extractMeta(grid) {
  const meta = {};
  for (const row of grid) {
    for (let c = 0; c < row.length; c++) {
      const t = cellText(row[c]);
      if (!t) continue;
      const inline = t.includes(':') ? cellText(t.split(':').slice(1).join(':')) : '';
      if (!meta.projectName && /프로젝트\s*명|project\s*name/i.test(t)) {
        meta.projectName = inline || cellText(valueRightOf(row, c));
      } else if (!meta.quoteNo && /견적\s*번호|no\.?\s*of\s*quotation|quotation\s*no/i.test(t)) {
        meta.quoteNo = inline || cellText(valueRightOf(row, c));
      } else if (!meta.rfqNo && /접수\s*번호|no\.?\s*of\s*rfq/i.test(t)) {
        meta.rfqNo = inline || cellText(valueRightOf(row, c));
      } else if (!meta.quoteDate && /견적\s*일자|date\s*of\s*quotation/i.test(t)) {
        meta.quoteDate = parseDateValue(inline || valueRightOf(row, c));
      } else if (!meta.client && /고\s*객\s*사|client/i.test(t)) {
        meta.client = inline || cellText(valueRightOf(row, c));
      } else if (meta.exchangeRate === undefined && /환\s*율|exchange\s*rate/i.test(t)) {
        const n = toNumber(valueRightOf(row, c));
        if (n !== null) meta.exchangeRate = n;
      } else if (!meta.quoteNo && /^TQ-[\w()가-힣-]+$/i.test(t)) {
        meta.quoteNo = t;
      }
    }
  }
  for (const k of Object.keys(meta)) if (meta[k] === '' || meta[k] === null) delete meta[k];
  return meta;
}

// 파일명 규칙: TQ-BA-SMO-2608101107_TW_R12_261008_Priced.xlsx
export function parseFileName(fileName) {
  const base = cellText(fileName).replace(/\.(xlsx|xlsm|xls)$/i, '');
  const out = { baseName: base };
  const rev = base.match(/_R(\d+)(?:_|$)/i);
  if (rev) out.revision = `R${rev[1]}`;
  const q = base.match(/^(TQ-[^_]+)/i);
  if (q) out.quoteNo = q[1];
  const d = base.match(/_(\d{2})(\d{2})(\d{2})(?:_|$)/);
  if (d) out.fileDate = `20${d[1]}-${d[2]}-${d[3]}`;
  return out;
}

// ───────────────────────── 견적서(Quotation) 시트 ─────────────────────────

function disciplineOf(row, fromCol) {
  for (let c = fromCol; c < row.length; c++) {
    const t = cellText(row[c]);
    if (!t) continue;
    for (const [re, ko] of DISCIPLINES) if (re.test(t)) return ko;
  }
  return null;
}

function parseQuotationRows(grid, map, headerRow) {
  const lines = [];
  const sections = [];
  const totals = {};
  let section = '';
  let group = null; // { label, numbering, rows: [line] }
  let parent = null; // 금액 없는 상위 항목 (예: "1) Processed and Product_Job Change")
  let currentSection = null;
  let segment = [];
  let started = false;
  const at = (row, i) => (i >= 0 ? row[i] : '');

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const secT = cellText(at(row, map.section));
    const detT = cellText(at(row, map.detail));
    const subT = map.sub >= 0 ? cellText(at(row, map.sub)) : '';
    const uomT = cellText(at(row, map.uom));
    const q = toQty(at(row, map.qty));
    const u = toNumber(at(row, map.unitPrice));
    const a = toNumber(at(row, map.amount));
    const leftText = row.slice(0, Math.max(0, map.qty)).map(cellText).filter(Boolean).join(' ');

    if (!leftText && q === null && u === null && a === null) continue;

    // 합계/총 견적 행: 품목이 시작된 뒤에만 종료로 본다
    if (secT && TOTAL_ROW_RE.test(secT) && !SUBTOTAL_RE.test(secT)) {
      if (!started) continue;
      if (/총\s*견적|final\s*price/i.test(secT) && a !== null) totals.final = a;
      else if (/nego/i.test(secT) && a !== null) totals.nego = a;
      else if (/합\s*계\s*금\s*액|^total|\(total\)/i.test(secT) && a !== null && totals.grand === undefined) totals.grand = a;
      continue;
    }
    if (/^note\b/i.test(secT) || /^note\b/i.test(leftText)) continue;

    // 소계 행: 직전 소계 이후 품목들의 금액 합과 비교하기 위해 기록 (한 소계가 섹션 두 개를 묶기도 한다)
    if (SUBTOTAL_RE.test(detT) || SUBTOTAL_RE.test(subT) || (!secT && SUBTOTAL_RE.test(leftText))) {
      if (a !== null) sections.push({ name: currentSection ? currentSection.name : section, subtotal: a, lineIdx: segment });
      // 첫 소계 행 비고에는 보통 프로젝트명이 적혀 있다 → 상단(프로젝트 명)을 복사하지 않았을 때 제목 후보
      if (totals.titleHint === undefined) {
        const rm = row.slice(Math.max(map.amount, map.unitPrice) + 1).map(cellText).find(t => t && toNumber(t) === null);
        totals.titleHint = rm && !/calend|calander|기준|별도|n\/?a/i.test(rm) ? rm : '';
      }
      segment = [];
      group = null;
      parent = null;
      continue;
    }

    if (secT) {
      section = secT;
      currentSection = { name: section, category: classifySection(section) };
      group = null;
      parent = null;
    }

    const num = numberingOf(detT);
    if (detT) {
      // 같은 섹션 안에서 새 항목(B열)이 시작됨
      if (parent && !(num && num.startsWith(parent.numbering + '.'))) parent = null;
      group = { label: stripNumbering(detT) || detT, numbering: num, rows: [] };
    }

    const isPercent = uomT === '%';
    const hasPrice = u !== null && u !== 0;
    if (!hasPrice) {
      // 금액 없는 번호 항목은 하위 항목들의 상위 묶음이 된다
      if (detT && num && !num.includes('.') && q === null && a === null) parent = { label: group.label, numbering: num };
      continue;
    }
    if (isPercent) continue;
    // 품목 글자도 없고 이어지는 항목 묶음도 없는 숫자 행 = 총액/Tool Amount 같은 요약 행 (A열을 복사하지 않은 경우)
    if (!detT && !subT && !secT && !group) continue;

    started = true;
    const line = {
      source: 'quotation',
      section,
      category: currentSection ? currentSection.category : classifySection(section),
      group: group ? group.label : '',
      sub: subT ? stripNumbering(subT) || subT : '',
      discipline: disciplineOf(row, Math.max(map.amount, map.unitPrice) + 1),
      unit_name: parent ? parent.label : '',
      uom: uomT,
      quantity: q,
      unit_price: u,
      total_price: a,
      remark: '',
      row: r + 1,
    };
    if (map.remark >= 0) {
      const rm = cellText(at(row, map.remark));
      if (rm && toNumber(rm) === null) line.remark = rm;
    }
    if (group) group.rows.push(line);
    lines.push(line);
    segment.push(lines.length - 1);
  }

  // 품목명 만들기: "그룹 - 소분류" / 같은 그룹 여러 행이면 공종(기구/제어/비전)으로 구분
  const groupSizes = new Map();
  for (const l of lines) {
    const key = `${l.section}|${l.group}`;
    groupSizes.set(key, (groupSizes.get(key) || 0) + 1);
  }
  const seen = new Map();
  for (const l of lines) {
    const multi = groupSizes.get(`${l.section}|${l.group}`) > 1;
    let name = l.group || l.sub || stripNumbering(l.section);
    if (l.sub && l.group) name = `${l.group} - ${l.sub}`;
    else if (multi && l.discipline && !name.includes(l.discipline)) name = `${name} - ${l.discipline}`;
    if (multi) {
      const key = `${l.section}|${name}`;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      if (n > 1) name = `${name} (${n})`;
    }
    l.item_name = name;
  }
  return { lines, sections, totals };
}

// ───────────────────────── 상세 리스트(Detail List) 시트 ─────────────────────────

function parseDetailRows(grid, map, startRow, isHeaderRow) {
  const items = [];
  const blocks = [];
  let unit = '';
  let label = '';
  let block = { label: '', units: [], itemIdx: [], total: null, row: null };
  const at = (row, i) => (i >= 0 ? row[i] : '');
  const closeBlock = (total, r) => {
    if (block.itemIdx.length || total !== null) {
      block.total = total;
      block.row = r;
      blocks.push(block);
    }
    block = { label, units: [], itemIdx: [], total: null, row: null };
    unit = '';
  };

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r] || [];
    if (isHeaderRow(row)) continue;
    const texts = row.slice(0, Math.max(0, map.qty)).map(cellText);
    const q = toQty(at(row, map.qty));
    const u = toNumber(at(row, map.unitPrice));
    const a = toNumber(at(row, map.amount));
    const anyText = texts.filter(Boolean);
    if (!anyText.length && q === null && u === null && a === null) continue;

    // 블록 합계 행 (재료비 총계 / 합계(Total) / JIG 총계)
    if (anyText.some(t => TOTAL_ROW_RE.test(t)) && (u === null || u === 0) && (q === null || q === 0)) {
      closeBlock(a, r + 1);
      continue;
    }

    const itemT = cellText(at(row, map.item));
    const unitT = cellText(at(row, map.unit));
    if (unitT && !(toNumber(unitT) !== null)) unit = unitT;

    // 숫자 없는 한 칸짜리 제목 행 ("SSD 교체", "Setting JIG List")
    if (q === null && u === null && a === null) {
      if (anyText.length === 1 && !itemT) { label = anyText[0]; block.label = label; }
      continue;
    }
    if (u === null) continue;

    const name = itemT || unitT || unit;
    if (!name) continue;
    if (unit && !block.units.includes(unit)) block.units.push(unit);
    const maker = cellText(at(row, map.maker));
    const spec = cellText(at(row, map.spec));
    const remarkRaw = map.remark >= 0 ? cellText(at(row, map.remark)) : '';
    items.push({
      source: 'detail',
      section: label || '상세 내역',
      unit_name: unit || '',
      item_name: name,
      maker,
      spec,
      quantity: q,
      unit_price: u,
      total_price: a,
      remark: remarkRaw && toNumber(remarkRaw) === null ? remarkRaw : '',
      category: classifyDetailItem({ name, maker, spec }),
      row: r + 1,
    });
    block.itemIdx.push(items.length - 1);
  }
  closeBlock(null, grid.length);
  return { items, blocks };
}

// ───────────────────────── 시트 하나 분석 ─────────────────────────

export function analyzeGrid(grid, { sheetName = '' } = {}) {
  const meta = extractMeta(grid);
  let map = null;
  let headerRow = -1;
  for (let r = 0; r < grid.length && !map; r++) {
    const row = grid[r] || [];
    map = detectDetailHeader(row) || detectQuotationHeader(row);
    if (map) headerRow = r;
  }
  if (!map) {
    map = inferColumns(grid);
    if (!map) return { kind: 'unknown', sheetName, meta, warnings: ['품목 표(수량·단가·금액)를 찾지 못했습니다.'] };
  }

  if (map.kind === 'quotation') {
    if (!map.unitPriceIsKRW && map.foreignCurrency && !meta.exchangeRate) {
      return { kind: 'unknown', sheetName, meta, warnings: ['KRW 단가 열이 없고 환율도 찾지 못했습니다.'] };
    }
    const { lines, sections, totals } = parseQuotationRows(grid, map, headerRow);
    if (!map.unitPriceIsKRW && meta.exchangeRate) {
      for (const l of lines) {
        l.unit_price *= meta.exchangeRate;
        if (l.total_price !== null) l.total_price *= meta.exchangeRate;
        l.convertedFrom = map.foreignCurrency;
      }
    }
    return { kind: 'quotation', sheetName, meta, map, lines, sections, totals, warnings: [] };
  }

  // 첫 머리글 위에 이미 품목 행이 있으면(중간부터 드래그해 두 번째 블록의 머리글이 처음 잡힌 경우) 처음부터 읽는다
  const isItemRow = (row) => {
    const q = toQty(row[map.qty]), u = toNumber(row[map.unitPrice]), a = toNumber(row[map.amount]);
    return q !== null && u !== null && a !== null && approxEqual(Math.abs(q * u), Math.abs(a));
  };
  const itemsAboveHeader = headerRow > 0 && grid.slice(0, headerRow).some(isItemRow);

  // 상세 리스트: 머리글 위의 첫 글자가 제목(프로젝트명)이다
  let title = '';
  for (let r = 0; r < (headerRow >= 0 && !itemsAboveHeader ? headerRow : 0) && !title; r++) {
    for (const c of grid[r] || []) {
      const t = cellText(c);
      if (t && !/detail\s*list|상세|^no\.?$/i.test(t)) { title = t; break; }
    }
  }
  if (title) meta.detailTitle = title;
  const isHeaderRow = (row) => !!detectDetailHeader(row);
  const { items, blocks } = parseDetailRows(grid, map, itemsAboveHeader ? 0 : headerRow + 1, isHeaderRow);
  return { kind: 'detail', sheetName, meta, map, items, blocks, warnings: [] };
}

// ───────────────────────── 검증 + 상세 ↔ 견적 라인 연결 ─────────────────────────

function lineCheck(it) {
  const { quantity: q, unit_price: u, total_price: a } = it;
  if (u === null) return 'no-price';
  if (a === null) return q === null ? 'ok' : 'no-amount';
  const qq = q === null ? 1 : q;
  return approxEqual(qq * u, a) ? 'ok' : 'mismatch';
}

// 상세 블록 합계가 어떤 견적 라인의 단가와 같은지 찾는다. 한 라인이 여러 블록 합일 수도 있다(부분합).
function linkBlocks(lines, blocks) {
  const links = [];
  const usable = blocks.map((b, i) => ({ i, total: b.total ?? b.sum })).filter(b => b.total);
  for (const line of lines) {
    if (!line.unit_price || line.unit_price <= 0) continue;
    // 상세 리스트는 기구/자재 라인의 내역이다. 프로그램·인건비 라인과 금액이 우연히 같아도 연결하지 않는다
    if (!['기구 SET', '기타'].includes(line.category)) continue;
    const single = usable.filter(b => approxEqual(b.total, line.unit_price));
    if (single.length) { links.push({ line, blocks: [single[0].i] }); continue; }
    if (usable.length > 1 && usable.length <= 16) {
      let found = null;
      for (let mask = 1; mask < (1 << usable.length) && !found; mask++) {
        if ((mask & (mask - 1)) === 0) continue; // 1개짜리는 위에서 확인
        let s = 0;
        const pick = [];
        for (let k = 0; k < usable.length; k++) if (mask & (1 << k)) { s += usable[k].total; pick.push(usable[k].i); }
        if (approxEqual(s, line.unit_price)) found = pick;
      }
      if (found) links.push({ line, blocks: found });
    }
  }
  return links;
}

// 여러 시트(또는 여러 번의 붙여넣기) 분석 결과를 견적서 단위로 묶는다.
export function buildQuotations(sourceAnalyses, { fileName = '' } = {}) {
  // 검증 단계가 품목 객체에 표시를 남기므로, 화면에서 여러 번 다시 계산해도 섞이지 않게 복사본으로 작업한다
  const analyses = structuredClone(sourceAnalyses);
  const fileInfo = fileName ? parseFileName(fileName) : {};
  const quotSheets = analyses.filter(a => a.kind === 'quotation');
  const detailSheets = analyses.filter(a => a.kind === 'detail');
  const warnings = analyses.flatMap(a => (a.kind === 'unknown' && a.sheetName ? [] : a.warnings || []));

  const drafts = quotSheets.map(a => ({
    title: a.meta.projectName || a.totals.titleHint || '',
    meta: { ...a.meta },
    sheetNames: [a.sheetName].filter(Boolean),
    lines: a.lines,
    sections: a.sections,
    totals: a.totals,
    details: [],
    blocks: [],
  }));
  if (!drafts.length && detailSheets.length) {
    drafts.push({ title: '', meta: {}, sheetNames: [], lines: [], sections: [], totals: {}, details: [], blocks: [] });
  }

  // 상세 시트는 제목이 같은 견적서에, 없으면 블록 합계가 단가와 맞는 견적서에, 그래도 없으면 첫 견적서에 붙인다
  for (const d of detailSheets) {
    const norm = (s) => cellText(s).toLowerCase().replace(/\s/g, '');
    let target = drafts.find(q => q.title && d.meta.detailTitle && norm(q.title) === norm(d.meta.detailTitle));
    if (!target) target = drafts.find(q => linkBlocks(q.lines, d.blocks).length > 0);
    if (!target) target = drafts[0];
    const offset = target.details.length;
    target.details.push(...d.items);
    target.blocks.push(...d.blocks.map(b => ({ ...b, itemIdx: b.itemIdx.map(i => i + offset) })));
    if (d.sheetName) target.sheetNames.push(d.sheetName);
    if (!target.title && d.meta.detailTitle) target.title = d.meta.detailTitle;
    for (const [k, v] of Object.entries(d.meta)) if (target.meta[k] === undefined) target.meta[k] = v;
  }

  return { quotations: drafts.map(q => finalizeQuotation(q, fileInfo)), warnings };
}

export function finalizeQuotation(q, fileInfo = {}) {
  const checks = [];
  // 1) 행 단위: 수량 × 단가 = 금액
  for (const it of [...q.lines, ...q.details]) {
    it.check = lineCheck(it);
    if (it.check === 'mismatch') checks.push({ level: 'error', type: 'row', message: `${it.item_name}: 수량×단가(${(it.quantity ?? 1) * it.unit_price}) ≠ 금액(${it.total_price})`, row: it.row });
  }
  // 2) 상세 블록 합계
  for (const b of q.blocks) {
    b.sum = b.itemIdx.reduce((s, i) => s + (q.details[i].total_price ?? 0), 0);
    if (b.total !== null && !approxEqual(b.sum, b.total)) {
      checks.push({ level: 'error', type: 'block', message: `상세 블록(${b.units.join(', ') || b.label}) 품목 합 ${roundKRW(b.sum)} ≠ 총계 ${b.total}`, row: b.row });
    }
  }
  // 3) 견적 섹션 소계
  for (const s of q.sections) {
    if (s.subtotal === null || !s.lineIdx.length) continue; // 일반관리비·이윤·관세(%)는 단가 품목이 아니라 검증 제외
    const sum = s.lineIdx.reduce((acc, i) => acc + (q.lines[i].total_price ?? 0), 0);
    if (!approxEqual(sum, s.subtotal)) checks.push({ level: 'error', type: 'section', message: `${s.name} 소계 ${s.subtotal} ≠ 품목 합 ${roundKRW(sum)}` });
  }
  // 4) 상세 블록 ↔ 견적 라인 단가
  const links = linkBlocks(q.lines, q.blocks);
  const linkedBlocks = new Set();
  for (const { line, blocks } of links) {
    line.detailLinked = true;
    for (const bi of blocks) {
      linkedBlocks.add(bi);
      for (const ii of q.blocks[bi].itemIdx) {
        const d = q.details[ii];
        d.parent_items = d.parent_items || [];
        if (!d.parent_items.includes(line.item_name)) d.parent_items.push(line.item_name);
      }
    }
  }
  if (q.lines.length && q.blocks.length) {
    q.blocks.forEach((b, i) => {
      if (!linkedBlocks.has(i)) checks.push({ level: 'warn', type: 'link', message: `상세 블록(${b.units.join(', ') || b.label || i + 1}) 총계 ${b.total ?? roundKRW(b.sum)}와 같은 견적 단가가 없습니다.`, row: b.row });
    });
  }

  const items = [
    ...q.lines.map((l, i) => ({
      source: 'quotation',
      line_no: i + 1,
      section: stripNumbering(l.section),
      item_category: l.category,
      item_name: l.item_name,
      unit_name: l.unit_name || '',
      parent_item: '',
      maker: '',
      spec: l.discipline || '',
      uom: l.uom || '',
      quantity: l.quantity ?? 1,
      unit_price: roundKRW(l.unit_price),
      total_price: roundKRW(l.total_price ?? (l.quantity ?? 1) * l.unit_price),
      remark: l.remark || '',
      check_status: l.check,
      detail_linked: !!l.detailLinked,
    })),
    ...q.details.map((d, i) => ({
      source: 'detail',
      line_no: q.lines.length + i + 1,
      section: d.section,
      item_category: d.category,
      item_name: d.item_name,
      unit_name: d.unit_name,
      parent_item: (d.parent_items || []).join(', '),
      maker: d.maker,
      spec: d.spec,
      uom: 'EA',
      quantity: d.quantity ?? 1,
      unit_price: roundKRW(d.unit_price),
      total_price: roundKRW(d.total_price ?? (d.quantity ?? 1) * d.unit_price),
      remark: d.remark,
      check_status: d.check,
    })),
  ];

  const meta = { ...q.meta };
  const title = cellText(q.title) || meta.quoteNo || fileInfo.quoteNo || fileInfo.baseName || '견적서';
  const sumLines = q.lines.reduce((s, l) => s + (l.total_price ?? 0), 0);
  const total = q.totals.final ?? q.totals.grand ?? (q.lines.length ? sumLines : q.details.reduce((s, d) => s + (d.total_price ?? 0), 0));
  const errors = checks.filter(c => c.level === 'error').length;
  return {
    title,
    // 시트 안 번호가 덜 적힌 경우("TQ-RS-NJC-")에는 파일명 번호를 쓴다
    quote_no: (meta.quoteNo && !/-$/.test(meta.quoteNo) ? meta.quoteNo : fileInfo.quoteNo || meta.quoteNo) || '',
    revision: fileInfo.revision || '',
    quote_date: meta.quoteDate || fileInfo.fileDate || null,
    rfq_no: meta.rfqNo && !/^tbd$/i.test(meta.rfqNo) ? meta.rfqNo : '',
    client: meta.client || '',
    sheet_names: q.sheetNames,
    total_amount: roundKRW(total),
    items,
    checks,
    summary: {
      lines: q.lines.length,
      details: q.details.length,
      blocks: q.blocks.length,
      linkedBlocks: linkedBlocks.size,
      errors,
      warnings: checks.length - errors,
      ok: errors === 0,
    },
  };
}

// ───────────────────────── 진입점 ─────────────────────────

// 엑셀 파일(SheetJS workbook)의 시트별 분석. Schedule 같은 무관한 시트는 건너뛴다.
export function analyzeWorkbook(XLSX, wb) {
  const hidden = new Set((wb.Workbook?.Sheets || []).filter(s => s.Hidden).map(s => s.name));
  const analyses = [];
  for (const name of wb.SheetNames) {
    if (hidden.has(name)) continue;
    const grid = gridFromSheet(XLSX, wb.Sheets[name]);
    const a = analyzeGrid(grid, { sheetName: name });
    if (a.kind === 'unknown') continue;
    // 머리글 없이 숫자 추론만으로 잡힌 시트는 이름이 견적/상세일 때만 인정한다 (Schedule 등 제외)
    if (a.map?.inferred && !/quot|견적|detail|list|상세|내역/i.test(name)) continue;
    analyses.push(a);
  }
  return analyses;
}

export function parseQuotationWorkbook(XLSX, wb, { fileName = '' } = {}) {
  const res = buildQuotations(analyzeWorkbook(XLSX, wb), { fileName });
  if (!res.quotations.length) res.warnings.push('견적서 시트(Item/Details/Unit Price) 또는 상세 리스트 시트(Item/Q\'ty/Unit Price)를 찾지 못했습니다.');
  return res;
}

// 붙여넣기 한 번 = 시트 하나. 여러 번 붙여넣은 결과를 모아 buildQuotations에 넘긴다.
export function analyzePastedText(text, label = '붙여넣기') {
  return analyzeGrid(gridFromText(text), { sheetName: label });
}
