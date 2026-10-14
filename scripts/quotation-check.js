// 견적서 파서 정합성 점검 — 실제 견적서 폴더를 넣어 "파일 첨부"와 "시트별 붙여넣기"가
// 같은 품목/단가를 뽑는지, 수량×단가=금액·상세 블록 합계·견적 라인 연결이 모두 맞는지 확인한다.
//
//   node scripts/quotation-check.js "<견적서 폴더>"            요약
//   node scripts/quotation-check.js "<견적서 폴더>" --items    품목까지 출력
//
// 견적서 원본과 결과는 저장소(공개)에 넣지 않는다. 이 스크립트는 데이터를 저장하지 않고 화면에만 출력한다.
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseQuotationWorkbook, analyzePastedText, buildQuotations } from '../src/quotationParser.js'

const dir = process.argv[2]
const showItems = process.argv.includes('--items')
if (!dir || !fs.existsSync(dir)) {
  console.error('사용법: node scripts/quotation-check.js "<견적서 폴더>" [--items]')
  process.exit(2)
}

// 엑셀에서 범위를 드래그해 복사한 것과 같은 TSV (화면에 보이는 서식 문자열, 병합 셀은 첫 칸만 값)
function sheetToTSV(ws, { r0 = 0, c0 = 0, r1, c1 } = {}) {
  const range = XLSX.utils.decode_range(ws['!ref'])
  const R1 = Math.min(r1 ?? range.e.r, range.e.r)
  const C1 = Math.min(c1 ?? range.e.c, range.e.c)
  const lines = []
  for (let r = r0; r <= R1; r++) {
    const cells = []
    for (let c = c0; c <= C1; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      let t = cell ? (cell.w ?? String(cell.v ?? '')) : ''
      if (/[\t\n"]/.test(t)) t = `"${t.replace(/"/g, '""')}"`
      cells.push(t)
    }
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

// 판정 기준은 단가 데이터(출처·유닛·수량·단가·금액). 품목명 차이는 따로 센다
// (예: Mechanical/Control 열을 복사하지 않으면 "품질세팅 - 기구" 대신 "품질세팅 (2)"가 된다).
const key = (it) => `${it.source}|${it.unit_name}|${it.quantity}|${Math.round(it.unit_price)}|${Math.round(it.total_price)}`
const nameKey = (it) => `${key(it)}|${it.item_name}`
const multiset = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map())
const diff = (a, b) => [...a].flatMap(([k, n]) => Array(Math.max(0, n - (b.get(k) || 0))).fill(k))
const fmt = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('ko-KR'))

let failures = 0
for (const f of fs.readdirSync(dir).filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~$'))) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { cellDates: false })
  const res = parseQuotationWorkbook(XLSX, wb, { fileName: f })
  console.log(`\n■ ${f}`)
  for (const w of res.warnings) console.log(`  ⚠ ${w}`)
  for (const q of res.quotations) {
    const s = q.summary
    console.log(`  └ [${q.title}] ${q.quote_no} ${q.revision} ${q.quote_date || ''} 시트=${q.sheet_names.join('+')}`)
    console.log(`    견적라인 ${s.lines} / 상세품목 ${s.details} / 상세블록 ${s.blocks}(연결 ${s.linkedBlocks}) / 총액 ₩${fmt(q.total_amount)} / 오류 ${s.errors} 경고 ${s.warnings}`)
    for (const c of q.checks) console.log(`    ${c.level === 'error' ? '✗' : '△'} ${c.message}${c.row ? ` (행 ${c.row})` : ''}`)
    if (s.errors) failures++
    if (showItems) {
      for (const it of q.items) {
        console.log(`      ${it.source === 'detail' ? '  ·' : '•'} [${it.item_category}] ${it.section ? it.section + ' > ' : ''}${it.unit_name ? it.unit_name + ' > ' : ''}${it.item_name}${it.maker ? ` (${it.maker}${it.spec ? ' / ' + it.spec : ''})` : it.spec ? ` (${it.spec})` : ''} | ${fmt(it.quantity)} ${it.uom} × ₩${fmt(it.unit_price)} = ₩${fmt(it.total_price)}${it.parent_item ? `  ⇐ ${it.parent_item}` : ''}${it.check_status !== 'ok' ? `  [${it.check_status}]` : ''}`)
      }
    }
  }

  // 붙여넣기 시뮬레이션: 시트 전체 / 머리글 아래만 / 왼쪽 열 빼고 / 오른쪽(외화) 열 빼고
  const visible = wb.SheetNames.filter(n => !/schedule/i.test(n))
  const variants = {
    '시트 전체': () => ({}),
    '머리글 제외': (ws) => ({ r0: headerRowOf(ws) + 1 }),
    'A열 제외': () => ({ c0: 1 }),
    'KRW까지만': (ws) => ({ c1: krwAmountCol(ws) }),
  }
  const refItems = res.quotations.flatMap(q => q.items)
  const reference = multiset(refItems.map(key))
  const refNames = multiset(refItems.map(nameKey))
  for (const [vname, mk] of Object.entries(variants)) {
    const analyses = visible.map(n => analyzePastedText(sheetToTSV(wb.Sheets[n], mk(wb.Sheets[n], n)), n))
    const pasted = buildQuotations(analyses)
    const gotItems = pasted.quotations.flatMap(q => q.items)
    const got = multiset(gotItems.map(key))
    const missing = diff(reference, got)
    const extra = diff(got, reference)
    const nameDiff = diff(refNames, multiset(gotItems.map(nameKey))).length - missing.length
    const errs = pasted.quotations.reduce((s, q) => s + q.summary.errors, 0)
    const titles = pasted.quotations.map(q => q.title).join(' / ')
    const ok = !missing.length && !extra.length && !errs
    if (!ok) failures++
    console.log(`    붙여넣기(${vname}): ${ok ? '일치' : '불일치'} — 누락 ${missing.length}, 추가 ${extra.length}, 오류 ${errs}${nameDiff ? `, 품목명만 다름 ${nameDiff}` : ''}, 제목 "${titles}"`)
    for (const k of missing.slice(0, 5)) console.log(`      - 누락 ${k}`)
    for (const k of extra.slice(0, 5)) console.log(`      + 추가 ${k}`)
  }
}

function headerRowOf(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true })
  const i = rows.findIndex(r => r.some(c => /unit\s*price|단\s*가/i.test(String(c))))
  return Math.max(0, i)
}
function krwAmountCol(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true })
  for (const r of rows) {
    const i = r.findIndex(c => /amount\s*\[krw\]/i.test(String(c)))
    if (i >= 0) return i
  }
  return undefined
}

console.log(`\n${failures ? `✗ 문제 ${failures}건` : '✓ 모든 견적서 정합성 통과'}`)
process.exit(failures ? 1 : 0)
