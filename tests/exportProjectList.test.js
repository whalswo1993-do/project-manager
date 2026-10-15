import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildProjectListWorkbook, summarizeManpower } from '../src/exportProjectList.js';

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
