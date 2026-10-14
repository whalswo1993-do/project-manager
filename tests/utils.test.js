import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateConstructionProgress,
  getConstructionPeriod,
  getDailyDepartmentManpower,
  getMonthDailyDeptMatrix,
  normalizeJVName,
} from '../src/utils.js'

// 진행률 계산은 "오늘"에 의존하므로 시간을 고정한다.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-15T09:00:00'))
})
afterEach(() => vi.useRealTimers())

describe('normalizeJVName', () => {
  it.each([
    ['북미JV', 'HSBMA'],
    ['북미 JV', 'HSBMA'],
    ['북미-JV', 'HSBMA'],
    ['북미_jv', 'HSBMA'],
    ['북미', 'HSBMA'],
    ['북미 10Line', 'HSBMA 10Line'],
    ['SKOH 10Line', 'SKOH 10Line'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeJVName(input)).toBe(expected)
  })

  it('문자열이 아니면 빈 문자열/원본을 돌려준다', () => {
    expect(normalizeJVName(undefined)).toBe('')
    expect(normalizeJVName(null)).toBe('')
    expect(normalizeJVName(0)).toBe('')
  })
})

describe('getConstructionPeriod', () => {
  it('프로젝트가 없으면 none', () => {
    expect(getConstructionPeriod(null)).toEqual({
      startDate: '', endDate: '', hasConstructionData: false, scheduleType: 'none', reason: '',
    })
  })

  it('공수도 공사 마일스톤도 없으면 전체 기간(full)', () => {
    const r = getConstructionPeriod({ startDate: '2026-02-01', endDate: '2026-09-30', milestones: [{ name: '설계', startDate: '2026-02-01', endDate: '2026-03-01' }] })
    expect(r).toMatchObject({ startDate: '2026-02-01', endDate: '2026-09-30', hasConstructionData: false, scheduleType: 'full', reason: '프로젝트 전체 기간' })
  })

  it('공사 키워드 마일스톤만 있으면 그 기간', () => {
    const r = getConstructionPeriod({
      startDate: '2026-02-01', endDate: '2026-09-30',
      milestones: [
        { name: '설계', startDate: '2026-02-01', endDate: '2026-03-01' },
        { name: '기구 셋업', startDate: '2026-07-06', endDate: '2026-07-19' },
        { name: 'J/C 이설', startDate: '2026-07-20', endDate: '2026-08-30' },
      ],
    })
    expect(r).toMatchObject({ startDate: '2026-07-06', endDate: '2026-08-30', hasConstructionData: true, scheduleType: 'construction', msStartDate: '2026-07-06', msEndDate: '2026-08-30' })
    expect(r.constrMilestones).toHaveLength(2)
  })

  it('공수만 있으면 첫/마지막 투입일 (0은 무시)', () => {
    const r = getConstructionPeriod({
      startDate: '2026-02-01', endDate: '2026-09-30',
      manpower: { dailyTotal: { '2026-07-01': 0, '2026-07-10': 3, '2026-07-20': 5 }, departments: { Mechanical: { daily: { '2026-07-05': 2 } } } },
    })
    expect(r).toMatchObject({ startDate: '2026-07-05', endDate: '2026-07-20', firstMpDate: '2026-07-05', lastMpDate: '2026-07-20', scheduleType: 'construction' })
  })

  it('공수 + 마일스톤이 모두 있으면 더 넓은 범위', () => {
    const r = getConstructionPeriod({
      startDate: '2026-02-01', endDate: '2026-09-30',
      manpower: { dailyTotal: { '2026-07-10': 3, '2026-09-01': 4 } },
      milestones: [{ name: '설치', startDate: '2026-07-06', endDate: '2026-08-20' }],
    })
    expect(r).toMatchObject({ startDate: '2026-07-06', endDate: '2026-09-01', scheduleType: 'construction' })
  })
})

describe('calculateConstructionProgress', () => {
  const p = { startDate: '2026-08-01', endDate: '2026-08-31' }

  it('완료 상태는 100', () => {
    expect(calculateConstructionProgress({ ...p, status: '완료' })).toBe(100)
    expect(calculateConstructionProgress({ ...p, status: 'done' })).toBe(100)
  })

  it('시작 전 0 / 종료 후 100', () => {
    expect(calculateConstructionProgress({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe(0)
    expect(calculateConstructionProgress({ startDate: '2026-07-01', endDate: '2026-08-01' })).toBe(100)
  })

  it('진행 중이면 경과율 (8/15 → 14/30 ≈ 47)', () => {
    expect(calculateConstructionProgress(p)).toBe(47)
  })

  it('날짜가 없으면 value/progress 값을 쓴다', () => {
    expect(calculateConstructionProgress({ value: 30 })).toBe(30)
    expect(calculateConstructionProgress({ progress: 55 })).toBe(55)
    expect(calculateConstructionProgress({})).toBe(0)
    expect(calculateConstructionProgress(null)).toBe(0)
  })

  it('cpInfo의 기간이 프로젝트 기간보다 우선', () => {
    expect(calculateConstructionProgress(p, { startDate: '2026-08-10', endDate: '2026-08-20' })).toBe(50)
  })
})

describe('getDailyDepartmentManpower', () => {
  const projects = [
    { id: 'a', manpower: { departments: { Mechanical: { daily: { '2026-07-10': 3 } }, Vision: { daily: { '2026-07-10': 2, '2026-07-11': 1 } } } } },
    { id: 'b', manpower: { dailyTotal: { '2026-07-10': 4 } } },
    { id: 'c', manpower: { departments: { Mechanical: { daily: { '2026-07-10': 0 } } } } },
  ]

  it('부서별 합산 + 부서 정보가 없으면 공통으로 집계', () => {
    const r = getDailyDepartmentManpower(projects, '2026-07-10')
    expect(r.total).toBe(9)
    expect(r.depts).toEqual({ Mechanical: 3, Vision: 2, 공통: 4 })
    expect(r.projectBreakdown.map(b => [b.project.id, b.total])).toEqual([['a', 5], ['b', 4]])
  })

  it('데이터가 없는 날은 0', () => {
    const r = getDailyDepartmentManpower(projects, '2026-12-25')
    expect(r).toMatchObject({ date: '2026-12-25', total: 0, depts: {}, projectBreakdown: [] })
  })

  it('프로젝트 목록이 비어 있어도 안전', () => {
    expect(getDailyDepartmentManpower(undefined, '2026-07-10').total).toBe(0)
  })
})

describe('getMonthDailyDeptMatrix', () => {
  it('월 일수/부서 정렬 우선순위', () => {
    const projects = [
      { manpower: { departments: { Zeta: { daily: { '2026-02-03': 1 } }, 기구: { daily: { '2026-02-03': 2 } }, 비전: { daily: { '2026-02-04': 1 } }, Alpha: { daily: { '2026-02-05': 1 } } } } },
    ]
    const m = getMonthDailyDeptMatrix(projects, 2026, 1)
    expect(m.month).toBe(2)
    expect(m.days).toHaveLength(28)
    expect(m.days[0]).toBe('2026-02-01')
    expect(m.sortedDepts).toEqual(['기구', '비전', 'Alpha', 'Zeta'])
    expect(m.dayDataMap['2026-02-03'].total).toBe(3)
  })

  it('윤년 2월은 29일', () => {
    expect(getMonthDailyDeptMatrix([], 2028, 1).days).toHaveLength(29)
  })
})
