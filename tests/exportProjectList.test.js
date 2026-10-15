import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildProjectListWorkbook, summarizeManpower, detectWorkStart } from '../src/exportProjectList.js';

const days = (obj) => obj; // 가독성용: { '날짜': 인원 }
const withMp = (extra) => ({
  name: '', milestones: [], ...extra,
  manpower: { departments: { 기구: { total: 1, peak: 1, daily: days(extra.daily) } } },
});

describe('공사 시작일 판단', () => {
  it('J/C: 자재 수령(현장 반입) 인원이 먼저 잡혀도 J/C 일정부터가 공사 시작', () => {
    const p = withMp({
      name: 'SKOH2 - 9Line - E1127 J/C Stacker (9대)',
      milestones: [
        { name: '현장 반입', startDate: '2026-06-29', endDate: '2026-06-29' },
        { name: 'J/C', startDate: '2026-07-06', endDate: '2026-07-26' },
      ],
      daily: { '2026-06-29': 3, '2026-07-06': 9, '2026-07-07': 9 },
    });
    const r = detectWorkStart(p, summarizeManpower(p));
    expect(r.date).toBe('2026-07-06');
    expect(r.basis).toContain('J/C');
  });

  it('J/C: "고객사 형교환 툴 부칙"은 준비 일정이라 공사 시작으로 보지 않는다', () => {
    const p = withMp({
      name: 'SKOH2 - 9Line - E1127 J/C Notcher (6대)',
      milestones: [
        { name: '현장 반입', startDate: '2026-07-06', endDate: '2026-07-08' },
        { name: '고객사 형교환 툴 부칙', startDate: '2026-07-06', endDate: '2026-07-11' },
        { name: 'J/C', startDate: '2026-07-15', endDate: '2026-07-26' },
      ],
      daily: { '2026-07-06': 1, '2026-07-07': 1, '2026-07-13': 3, '2026-07-15': 5, '2026-07-16': 5 },
    });
    expect(detectWorkStart(p, summarizeManpower(p)).date).toBe('2026-07-15');
  });

  it('J/C: 해체 작업이 있으면 해체 첫 투입일부터', () => {
    const p = withMp({
      name: 'SKOY - 12Line - E1540 J/C Stacker(11대)',
      milestones: [
        { name: '해체(OY 내재화 시 검수)', startDate: '2026-04-28', endDate: '2026-05-13' },
        { name: '현장 반입', startDate: '2026-05-15', endDate: '2026-05-17' },
        { name: '기구세팅+공정세팅', startDate: '2026-06-05', endDate: '2026-06-19' },
      ],
      daily: { '2026-04-28': 1, '2026-04-29': 1, '2026-05-21': 2, '2026-06-05': 10 },
    });
    expect(detectWorkStart(p, summarizeManpower(p)).date).toBe('2026-04-28');
  });

  it('신규 셋업: 장비 도착 전 라인마킹·하역의 소수 인원부터가 공사 시작', () => {
    const p = withMp({
      name: 'SKBA - 5Line - 신규 Stacker(20대)',
      milestones: [
        { name: '사전 현장 방문', startDate: '2026-08-01', endDate: '2026-08-03' },
        { name: '라인마킹', startDate: '2026-08-10', endDate: '2026-08-12' },
        { name: '하역/반입', startDate: '2026-08-13', endDate: '2026-08-15' },
        { name: '기구세팅', startDate: '2026-08-17', endDate: '2026-09-10' },
      ],
      daily: { '2026-08-01': 1, '2026-08-11': 2, '2026-08-13': 4, '2026-08-17': 12 },
    });
    const r = detectWorkStart(p, summarizeManpower(p));
    expect(r.date).toBe('2026-08-11'); // 사전 방문(8/1)은 제외
    expect(r.basis).toContain('라인마킹');
  });

  it('일정에서 근거를 못 찾으면 공수 최초 투입일, 근거 칸에 그 사실을 적는다', () => {
    const p = withMp({ name: '기타', milestones: [{ name: '검토', startDate: '2026-01-01', endDate: '2026-01-05' }], daily: { '2026-01-03': 2 } });
    const r = detectWorkStart(p, summarizeManpower(p));
    expect(r.date).toBe('2026-01-03');
    expect(r.basis).toContain('찾지 못함');
  });

  it('상세 공수에 "공사 전 준비"/"공사 시작" 구분이 표시된다', () => {
    const p = withMp({
      name: 'X J/C Stacker',
      milestones: [
        { name: '현장 반입', startDate: '2026-06-29', endDate: '2026-06-29' },
        { name: 'J/C', startDate: '2026-07-06', endDate: '2026-07-26' },
      ],
      daily: { '2026-06-29': 3, '2026-07-06': 9 },
    });
    const rows = XLSX.utils.sheet_to_json(buildProjectListWorkbook([p]).Sheets['상세 공수'], { header: 1 });
    const flagCol = rows[0].indexOf('구분');
    expect(rows[1][flagCol]).toBe('공사 전 준비');
    expect(rows[2][flagCol]).toBe('공사 시작');
  });
});

// 가짜 데이터로 프로젝트 목록 엑셀의 열 구성과 공수 계산을 확인한다.
const project = {
  customer: 'SK on',
  manufacturingNo: 'A1-ab12',
  site: 'TEST',
  line: '1Line',
  name: '시험 프로젝트',
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  status: '진행중',
  milestones: [
    { name: '설계', startDate: '2026-01-01', endDate: '2026-01-31' },
    { name: '세팅', startDate: '2026-02-01', endDate: '2026-02-10' },
    { name: '운송', startDate: '2026-02-11', endDate: '2026-02-20' },
  ],
  manpower: {
    departments: {
      '기구(소장포함)': { total: 7, peak: 3, daily: { '2026-02-02': 2, '2026-02-03': 3, '2026-02-05': 2 } },
      '제어': { total: 4, peak: 2, daily: { '2026-02-03': 2, '2026-02-04': 2, '2026-03-02': 1 } },
    },
  },
};

describe('프로젝트 목록 엑셀', () => {
  it('공사 시작·종료일과 전체 Total/Peak를 일자별 인원에서 계산한다', () => {
    const s = summarizeManpower(project);
    expect(s.workStart).toBe('2026-02-02');
    expect(s.workEnd).toBe('2026-03-02');
    expect(s.depts.mechanical.total).toBe(7);
    expect(s.depts.mechanical.peak).toBe(3);
    expect(s.peak).toBe(5); // 2/3: 기구 3 + 제어 2
  });

  it('시트 구성: 프로젝트 목록 + 상세 공수, 담당자 열 없음', () => {
    const wb = buildProjectListWorkbook([project]);
    expect(wb.SheetNames).toEqual(['프로젝트 목록', '상세 공수']);
    const list = XLSX.utils.sheet_to_json(wb.Sheets['프로젝트 목록'], { header: 1 });
    expect(list[0].slice(0, 10)).toEqual(['고객사', '제조번호', 'Site', 'Line', '프로젝트', '프로젝트 시작일', '프로젝트 종료일', '상태', '공사 시작일', '공사 종료일']);
    expect(list[0]).toContain('기구 Total(M/D)');
    expect(list[0]).toContain('제어 Peak(명)');
    expect(list[0]).not.toContain('소장');
    expect(list[1][1]).toBe('A1');
    expect(list[1][8]).toBe('2026-02-02');
  });

  it('상세 공수: 공수가 있는 액티비티만, 마일스톤 밖 투입은 따로 표시', () => {
    const wb = buildProjectListWorkbook([project]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['상세 공수'], { header: 1 });
    const names = rows.slice(1).map((r) => r[2]);
    expect(names).toEqual(['세팅', '(마일스톤 밖 기간)']);
    const setting = rows[1];
    const head = rows[0];
    expect(setting[head.indexOf('기구 인원(명)')]).toBe(3);
    expect(setting[head.indexOf('제어 인원(명)')]).toBe(2);
    expect(setting[head.indexOf('투입 M/D 합계')]).toBe(11);
  });
});
