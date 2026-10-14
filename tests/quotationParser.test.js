import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  analyzePastedText,
  buildQuotations,
  classifyDetailItem,
  parseDateValue,
  parseFileName,
  parseQuotationWorkbook,
  toNumber,
  toQty,
} from '../src/quotationParser.js'

// 회사 견적서 양식을 흉내 낸 가짜 데이터 (실제 견적 금액은 공개 저장소에 넣지 않는다)
const QUOTE = [
  [],
  ['Quotation '],
  [],
  ['고 객 사(Client) : TEST'],
  [],
  ['프로젝트 명 (Project Name)', '', '테스트 라인 비전 개조', '', '', '', '', '', '', 'Supplier', 'TW'],
  ['견적일자 (Date of Quotation)', '', 46302],
  ['견적번호 (NO.of Quotation)', '', 'TQ-AA-BBB-0000000001'],
  ['환율(Exchange Rate)', '', 1400, '', 'KRW'],
  [' 합계 금액 (Total Amount)', '', '', '1,000USD(VAT 별도)'],
  ['Item', 'Details', '', 'Unit', 'Amount', 'Unit Price [KRW]', 'Amount [KRW]', 'Unit Price [USD]', 'Amount [USD]', 'Remark '],
  [],
  ['기구 Mechanism Part', '1) 카메라 개조 부품', '', 'SET', 4, 150000, 600000, 107.14, 428.57, '라인별 2대'],
  ['', '2) 세팅 지그', '', 'SET', 1, 30000, 30000, 21.43, 21.43],
  ['', '기구부 소계 (Sub-Total)', '', '', '', '', 630000, 450, '테스트 라인 비전 개조'],
  ['인건비 Labor', '1) 기구설계 (Engineering)', '', 'MD', 2, 300000, 600000, 214.29, 428.57, 1, 2],
  ['', '2) 품질세팅', '', 'MD', 4, 330000, 1320000, 235.71, 942.86, 2, 2, 'Mechanical'],
  ['', '', '', 'MD', 2, 440000, 880000, 314.29, 628.57, 1, 2, 'Control'],
  ['', '3) 전개', '3.1)제어', 'MD', 0, 560000, 0, 400, 0, 0, 0, 'Control'],
  ['', '', '3.2)비전', 'MD', 3, 700000, 2100000, 500, 1500, 1, 3, 'Vision'],
  ['', '인건비 소계 (Sub-Total)', '', '', 11, '', 4900000, 3500],
  ['공통 (Expense)', '1) 비자비용 (VISA Fee)', '', 'SET', 0, '', '', '', '', 'N/A'],
  ['', '2) 체류비 (Accommodation)', '', 'MD', 10, 120000, 1200000, 85.71, 857.14],
  ['', '공통 소계 (Sub-Total)', '', '', '', '', 1200000, 857.14],
  ['기타 (Others)', '1) 일반 관리비 (General Expenses)', '', '%', 5, '', 336500, 240.36, '', 0.05],
  ['', '기타 소계 (Sub-Total)', '', '', '', '', 336500, 240.36],
  ['합계 금액 (Total)', '', '', '', '', '', 7066500, 5047.5],
  ['총 견적 Total Amount (USD) ', '', '', '식', 1, '', 7000000, 5000],
  ['Note. 1) 테스트용'],
]

const DETAIL = [
  [],
  ['테스트 라인 비전 개조'],
  ['개조 상세 IMPROVEMENT DETAIL LIST'],
  ['No.', 'Unit', 'Item', "Maker / Mat'l", 'Specification / Treatment', "Q'ty", 'Unit Price', 'Amount Price', 'Remark'],
  [1, 'CAMERA UNIT', 'CAMERA BKT', 'A6061', 'B-ANO', 2, 40000, 80000],
  ['', '', 'CAMERA', 'TESTCAM', 'CAM-1000', 1, 50000, 50000],
  ['', '', '잡자재류', '', '', 1, 20000, 20000],
  ['합계(Total)', '', '', '', '', '', '', 150000, '1대 기준'],
  ['No.', 'Unit', 'Item', "Maker / Mat'l", 'Specification / Treatment', "Q'ty", 'Unit Price', 'Amount Price', 'Remark'],
  [2, 'JIG', 'Master Jig', 'PC', '', 1, 30000, 30000],
  ['재료비 총계', '', '', '', '', '', '', 30000],
]

function workbook() {
  const wb = XLSX.utils.book_new()
  const q = XLSX.utils.aoa_to_sheet(QUOTE)
  // 회사 양식처럼 수량을 "(4)" 로 보이게 하는 서식
  for (let r = 12; r < QUOTE.length; r++) {
    const cell = q[XLSX.utils.encode_cell({ r, c: 4 })]
    if (cell && typeof cell.v === 'number') cell.z = '\\(General\\)'
  }
  XLSX.utils.book_append_sheet(wb, q, 'Quotation')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(DETAIL), 'IMP Detail List')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['일정'], [1, 2, 3, 6]]), 'Schedule')
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// 엑셀에서 드래그 복사한 것과 같은 TSV (서식 적용된 문자열)
function toTSV(ws, { r0 = 0, c0 = 0, c1 } = {}) {
  const range = XLSX.utils.decode_range(ws['!ref'])
  const out = []
  for (let r = r0; r <= range.e.r; r++) {
    const row = []
    for (let c = c0; c <= Math.min(c1 ?? range.e.c, range.e.c); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      row.push(cell ? (cell.w ?? String(cell.v)) : '')
    }
    out.push(row.join('\t'))
  }
  return out.join('\n')
}

const priceKey = (it) => `${it.source}|${it.unit_name}|${it.quantity}|${it.unit_price}|${it.total_price}`

describe('숫자/날짜/파일명', () => {
  it('toNumber: 쉼표·통화·회계 서식', () => {
    expect(toNumber(' 3,000,000 ')).toBe(3000000)
    expect(toNumber('₩1,234')).toBe(1234)
    expect(toNumber('1,234원')).toBe(1234)
    expect(toNumber(' - ')).toBe(0)
    expect(toNumber('(500)')).toBe(-500)
    expect(toNumber('△500')).toBe(-500)
    expect(toNumber('5%')).toBe(5)
    expect(toNumber('1) 카메라')).toBeNull()
    expect(toNumber('')).toBeNull()
  })

  it('수량은 "(4)"를 음수로 보지 않는다', () => {
    expect(toQty('(4)')).toBe(4)
    expect(toQty('(0)')).toBe(0)
  })

  it('견적일자: 엑셀 일련번호, m/d/yy, yyyy-mm-dd', () => {
    expect(parseDateValue(46302)).toBe('2026-10-07')
    expect(parseDateValue('10/7/26')).toBe('2026-10-07')
    expect(parseDateValue('2026.10.07')).toBe('2026-10-07')
    expect(parseDateValue('2026년 10월 7일')).toBe('2026-10-07')
  })

  it('파일명 규칙에서 견적번호/리비전', () => {
    expect(parseFileName('TQ-BA-SMO-2608101107_TW_R12_261008_Priced.xlsx')).toMatchObject({ quoteNo: 'TQ-BA-SMO-2608101107', revision: 'R12', fileDate: '2026-10-08' })
  })

  it('품목 구분: 재질=가공품, 메이커=구매품, 잡자재', () => {
    expect(classifyDetailItem({ name: 'BKT', maker: 'A6061' })).toBe('가공품')
    expect(classifyDetailItem({ name: 'SHAFT', maker: 'SUS304 2B' })).toBe('가공품')
    expect(classifyDetailItem({ name: 'ALIGN BAR', maker: 'ACETAL(Black)' })).toBe('가공품')
    expect(classifyDetailItem({ name: 'FITTING', maker: 'SMC', spec: 'KQ2L06' })).toBe('구매품')
    expect(classifyDetailItem({ name: 'Cable 및 잡자재류', maker: '' })).toBe('잡자재')
  })
})

describe('엑셀 파일 분석', () => {
  const res = parseQuotationWorkbook(XLSX, workbook(), { fileName: 'TQ-AA-BBB-0000000001_TW_R3_261007_Priced.xlsx' })
  const q = res.quotations[0]

  it('제목은 파일명이 아니라 내용의 프로젝트명', () => {
    expect(res.quotations).toHaveLength(1)
    expect(q.title).toBe('테스트 라인 비전 개조')
    expect(q).toMatchObject({ quote_no: 'TQ-AA-BBB-0000000001', revision: 'R3', quote_date: '2026-10-07', total_amount: 7000000 })
    expect(q.sheet_names).toEqual(['Quotation', 'IMP Detail List']) // Schedule 시트는 무시
  })

  it('견적 라인: KRW 단가만, % 행·소계·합계 제외, 공종으로 이름 구분', () => {
    const lines = q.items.filter(i => i.source === 'quotation')
    expect(lines.map(l => [l.item_category, l.item_name, l.uom, l.quantity, l.unit_price, l.total_price])).toEqual([
      ['기구 SET', '카메라 개조 부품', 'SET', 4, 150000, 600000],
      ['기구 SET', '세팅 지그', 'SET', 1, 30000, 30000],
      ['인건비', '기구설계 (Engineering)', 'MD', 2, 300000, 600000],
      ['인건비', '품질세팅 - 기구', 'MD', 4, 330000, 1320000],
      ['인건비', '품질세팅 - 제어', 'MD', 2, 440000, 880000],
      ['인건비', '전개 - 제어', 'MD', 0, 560000, 0],
      ['인건비', '전개 - 비전', 'MD', 3, 700000, 2100000],
      ['경비', '체류비 (Accommodation)', 'MD', 10, 120000, 1200000],
    ])
  })

  it('상세 품목: 유닛 이어받기, 재질/메이커, 블록 합계 ↔ 견적 단가 연결', () => {
    const details = q.items.filter(i => i.source === 'detail')
    expect(details.map(d => [d.unit_name, d.item_name, d.item_category, d.maker, d.unit_price, d.parent_item])).toEqual([
      ['CAMERA UNIT', 'CAMERA BKT', '가공품', 'A6061', 40000, '카메라 개조 부품'],
      ['CAMERA UNIT', 'CAMERA', '구매품', 'TESTCAM', 50000, '카메라 개조 부품'],
      ['CAMERA UNIT', '잡자재류', '잡자재', '', 20000, '카메라 개조 부품'],
      ['JIG', 'Master Jig', '가공품', 'PC', 30000, '세팅 지그'],
    ])
  })

  it('검증: 오류 없음', () => {
    expect(q.summary).toMatchObject({ lines: 8, details: 4, blocks: 2, linkedBlocks: 2, errors: 0, ok: true })
    expect(q.items.every(i => i.check_status === 'ok')).toBe(true)
  })

  it('수량×단가≠금액이면 오류로 잡는다', () => {
    const wb = workbook()
    wb.Sheets.Quotation.G13.v = 999 // 카메라 개조 부품 금액을 틀리게
    const bad = parseQuotationWorkbook(XLSX, wb).quotations[0]
    expect(bad.summary.errors).toBeGreaterThan(0)
    expect(bad.items.find(i => i.item_name === '카메라 개조 부품').check_status).toBe('mismatch')
  })
})

describe('시트별 표 붙여넣기 (드래그 범위와 무관)', () => {
  const wb = workbook()
  const reference = parseQuotationWorkbook(XLSX, wb).quotations[0].items.map(priceKey).sort()
  const paste = (opts) => buildQuotations([
    analyzePastedText(toTSV(wb.Sheets.Quotation, opts.q || {}), 'Quotation'),
    analyzePastedText(toTSV(wb.Sheets['IMP Detail List'], opts.d || {}), 'IMP Detail List'),
  ]).quotations

  it.each([
    ['시트 전체', {}],
    ['머리글 아래만', { q: { r0: 11 }, d: { r0: 4 } }],
    ['A열 제외', { q: { c0: 1 }, d: { c0: 1 } }],
    ['KRW 금액 열까지만', { q: { c1: 6 } }],
  ])('%s', (_name, opts) => {
    const qs = paste(opts)
    expect(qs).toHaveLength(1)
    expect(qs[0].summary.errors).toBe(0)
    expect(qs[0].items.map(priceKey).sort()).toEqual(reference)
  })

  it('상단을 포함해 복사하면 제목도 내용에서 가져온다', () => {
    expect(paste({})[0].title).toBe('테스트 라인 비전 개조')
  })

  it('상세 리스트만 붙여넣어도 품목을 읽는다', () => {
    const qs = buildQuotations([analyzePastedText(toTSV(wb.Sheets['IMP Detail List']))]).quotations
    expect(qs[0].title).toBe('테스트 라인 비전 개조')
    expect(qs[0].items).toHaveLength(4)
  })
})
