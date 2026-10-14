import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  adjustProjectDates,
  computeAutoStatus,
  extractProjectTags,
  isSameProjectIdentity,
  normalizeDeptName,
  parseExcelMasterPlan,
  parseNum,
  parseTSVWithQuotes,
  resolveMilestoneDates,
} from '../src/masterPlanParser.js'

// 이 파일의 스냅샷은 "현재 동작"을 기록한 것이다(정답 보증이 아니라 회귀 감지용).
// 의도적으로 파서를 바꿨다면 `npx vitest run -u` 로 스냅샷을 갱신하고 diff를 리뷰한다.

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-15T09:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('parseNum / normalizeDeptName', () => {
  it('parseNum', () => {
    const inputs = [5, '5', '1,234', '12.5', '', null, undefined, 'abc', ' 7 ']
    expect(inputs.map(parseNum)).toMatchSnapshot()
  })

  it('normalizeDeptName', () => {
    const inputs = ['Mechanical', 'mechanical', '기구', 'Vision', '비전 외주', 'Vision Sub', 'Control', '제어', 'Electrical', '전장', 'Electrical Sub', '전장외주', 'Supervisor', '슈퍼바이저', 'Safety', '안전', '소장', 'PM', 'Manager', '통역', '']
    expect(inputs.map(i => [i, normalizeDeptName(i)])).toMatchSnapshot()
  })
})

describe('parseTSVWithQuotes', () => {
  it('탭 구분, 따옴표 안의 줄바꿈/탭 보존', () => {
    const text = 'a\tb\tc\n1\t"x\ty"\t3\n"multi\nline"\t5\t6'
    expect(parseTSVWithQuotes(text)).toMatchSnapshot()
  })
})

describe('resolveMilestoneDates (연도 전환)', () => {
  it('연말→연초로 넘어가는 공정은 연도 +1', () => {
    const state = { currentYear: 2026, lastStartYear: 2026, lastStartMonth: 7, lastStartDay: 20, lastStartDate: '2026-07-20' }
    const a = resolveMilestoneDates('10월 24일', '01월 13일', '', { ...state })
    const b = resolveMilestoneDates('2026-07-28', '2026-08-10', '', { ...state })
    expect([a, b]).toMatchSnapshot()
  })
})

describe('adjustProjectDates / computeAutoStatus', () => {
  const project = {
    projectName: 'SKOH 10Line - Stacker 1호기',
    startDate: '2026-02-10',
    endDate: '2026-08-30',
    milestones: [
      { name: '기구 셋팅', startDate: '2026-07-06', endDate: '2026-07-19' },
      { name: '시운전', startDate: '2026-08-01', endDate: '2026-08-20' },
    ],
  }

  it('adjustProjectDates', () => {
    expect(adjustProjectDates(JSON.parse(JSON.stringify(project)))).toMatchSnapshot()
  })

  it('computeAutoStatus (오늘 고정)', () => {
    const today = '2026-08-15'
    const cases = {
      진행중: computeAutoStatus({ startDate: '2026-08-01', endDate: '2026-08-31', milestones: [] }, today),
      시작전: computeAutoStatus({ startDate: '2026-09-01', endDate: '2026-09-30', milestones: [] }, today),
      종료후: computeAutoStatus({ startDate: '2026-06-01', endDate: '2026-07-31', milestones: [] }, today),
      마일스톤: computeAutoStatus(project, today),
    }
    expect(cases).toMatchSnapshot()
  })
})

describe('프로젝트 식별', () => {
  const sites = ['SKO 대전', 'SKBM', 'HSBMA']
  it('extractProjectTags', () => {
    const out = [
      { name: 'SKOH 10Line - Stacker 1호기', site: 'SKOH', manufacturing_no: '91144' },
      { name: 'HSBMA 3L Notcher', site: 'HSBMA', manufacturing_no: 'E1234' },
      { name: '북미JV 라인 ESS', site: '북미', manufacturing_no: '' },
    ].map(p => extractProjectTags(p, sites))
    expect(out).toMatchSnapshot()
  })

  it('isSameProjectIdentity', () => {
    const a = { name: 'SKOH 10Line - Stacker 1호기', site: 'SKOH', manufacturingNo: '91144' }
    const sameMfg = { projectName: 'SKOH 10Line Stacker 1호기', site: 'SKOH', manufacturingNo: '91144' }
    const other = { projectName: 'SKBM 2Line Notcher', site: 'SKBM', manufacturingNo: '77777' }
    expect([isSameProjectIdentity(a, sameMfg, sites), isSameProjectIdentity(a, other, sites)]).toMatchSnapshot()
  })
})

describe('parseExcelMasterPlan (합성 시트)', () => {
  const ctx = { formName: '', formLine: '', formSite: '', formMfg: '', formStartDate: '', editingProjectName: '', fileName: 'sample' }

  function workbookFrom(aoa) {
    return { SheetNames: ['Master Schedule'], Sheets: { 'Master Schedule': XLSX.utils.aoa_to_sheet(aoa) } }
  }

  it('일정표 + 공수표', () => {
    const dates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25']
    const aoa = [
      ['Project Name: SKOH 10Line - Stacker 1호기'],
      ['Project Start Date: 2026-07-20'],
      [],
      ['Item', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dates],
      [1, 'Stacker 1호기', '기구 셋팅', '2026-07-20', '2026-07-24', 5],
      [2, 'Stacker 1호기', '전장 배선', '2026-07-22', '2026-07-25', 4],
      [],
      ['', '', 'Personnel', 'Total', 'Peak', '', '', '', '', '', '', ''],
      ['', '', 'Mechanical', 16, 4, '', 3, 3, 4, 4, 2, 0],
      ['', '', 'Vision', 7, 2, '', 0, 1, 1, 2, 2, 1],
      ['', '', 'Electrical', 10, 3, '', 0, 0, 2, 2, 3, 3],
      ['', '', 'Total Manday', 33, 9, '', 3, 4, 7, 8, 7, 4],
    ]
    const result = parseExcelMasterPlan(workbookFrom(aoa), ctx)
    // 핵심 분석값은 스냅샷과 별개로 명시적으로도 고정한다.
    expect(result).toHaveLength(1)
    expect(result[0].manpower.totalManday).toBe(33)
    expect(result[0].manpower.dailyPeak).toBe(9)
    expect(result[0].manpower.byDepartment).toEqual({ 기구: 16, 비전: 7, 전장: 10 })
    expect(result[0].manpower.dailyTotal['2026-07-22']).toBe(7)
    expect(result[0].milestones.map(m => m.name)).toEqual(['기구 셋팅', '전장 배선'])
    expect(result).toMatchSnapshot()
  })

  it('장비 2대가 한 시트에 있으면 프로젝트 2개로 분할', () => {
    const dates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25']
    const aoa = [
      ['Project Name: SKOH 10Line - Stacker'],
      ['Project Start Date: 2026-07-20'],
      [],
      ['Item', 'Equipment', 'Activity', 'Start', 'End', 'Duration', ...dates],
      [1, 'Stacker 1호기', '기구 셋팅', '2026-07-20', '2026-07-22', 3],
      [],
      ['', '', 'Personnel', 'Total', 'Peak', '', '', '', '', '', '', ''],
      ['', '', 'Mechanical', 6, 3, '', 3, 3, 0, 0, 0, 0],
      ['', '', 'Total Manday', 6, 3, '', 3, 3, 0, 0, 0, 0],
      [2, 'Stacker 2호기', '기구 셋팅', '2026-07-23', '2026-07-25', 3],
      [],
      ['', '', 'Personnel', 'Total', 'Peak', '', '', '', '', '', '', ''],
      ['', '', 'Control', 6, 2, '', 0, 0, 0, 2, 2, 2],
      ['', '', 'Total Manday', 6, 2, '', 0, 0, 0, 2, 2, 2],
    ]
    const result = parseExcelMasterPlan(workbookFrom(aoa), ctx)
    expect(result.map(p => p.equipment)).toEqual(['Stacker 1호기', 'Stacker 2호기'])
    expect(result.map(p => p.manpower?.totalManday)).toEqual([6, 6])
    expect(result).toMatchSnapshot()
  })

  it('달력 열 없이 합계만 있는 부분 표 → 마일스톤 기간에 공수 자동 배분', () => {
    const aoa = [
      ['Project Name: SKOH 10Line - Stacker 1호기'],
      ['Project Start Date: 2026-07-20'],
      [],
      ['Item', 'Equipment', 'Activity', 'Start', 'End', 'Duration'],
      [1, 'Stacker 1호기', '기구 셋팅', '2026-07-20', '2026-07-25', 6],
      [],
      ['', '', 'Personnel', 'Total', 'Peak'],
      ['', '', 'Mechanical', 12, 3],
      ['', '', 'Total Manday', 12, 3],
    ]
    const result = parseExcelMasterPlan(workbookFrom(aoa), ctx)
    const sum = Object.values(result[0].manpower.dailyTotal).reduce((a, b) => a + b, 0)
    expect(sum).toBe(12) // 배분 후에도 총 공수는 보존된다
    expect(result).toMatchSnapshot()
  })

  it('빈 시트는 null 또는 빈 결과 (예외 없음)', () => {
    const empty = { SheetNames: ['Sheet1'], Sheets: { Sheet1: XLSX.utils.aoa_to_sheet([]) } }
    expect(() => parseExcelMasterPlan(empty, ctx)).not.toThrow()
    expect(parseExcelMasterPlan(empty, ctx)).toMatchSnapshot()
  })
})
