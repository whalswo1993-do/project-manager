import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  planMasterScheduleFill, fillMasterScheduleTemplate, base64ToBytes, isoToSerial, colName,
  splitProjectName, masterScheduleFileName, patchSheetXml,
} from '../src/masterScheduleExport.js';
import { parseExcelMasterPlan } from '../src/masterPlanParser.js';

const templateBytes = () => base64ToBytes(fs.readFileSync(path.resolve(__dirname, '../public/master-schedule-fill.b64'), 'utf8'));

// 가짜 프로젝트 (실제 일정/공수가 아님)
const project = {
  name: 'SKBA - 3Line - 테스트 설비 이설 - Notcher(6대)',
  manufacturingNo: 'E9999',
  site: 'SKBA',
  line: '3Line',
  startDate: '2026-02-02',
  milestones: [
    { name: '설계 및 내부 DR', startDate: '2026-02-02', endDate: '2026-02-20' },
    { name: '발주/제작', startDate: '2026-02-23', endDate: '2026-04-10' },
    { name: '현장 반입', startDate: '2026-04-13', endDate: '2026-04-17' },
    { name: '기구세팅', startDate: '2026-04-20', endDate: '2026-05-08' },
    { name: '양산 대응', startDate: '2026-12-28', endDate: '2027-01-15' },
  ],
  manpower: {
    departments: {
      기구: { daily: { '2026-04-20': 3, '2026-04-21': 4, '2026-05-02': 2 } },
      비전: { daily: { '2026-04-21': 2, '2026-04-22': 2 } },
      전장: { daily: { '2026-04-20': 1 } },
      소장: { daily: { '2026-04-20': 1, '2026-04-21': 1 } },
      '기구 외주': { daily: { '2026-04-22': 5 } },
      'Total Manday': { daily: { '2026-04-20': 99 } },
    },
  },
};

describe('날짜/열 변환', () => {
  it('엑셀 일련번호와 열 이름', () => {
    expect(isoToSerial('2026-01-13')).toBe(46035); // 양식 Edit!H3 의 값
    expect(isoToSerial('x')).toBeNull();
    expect(colName(10)).toBe('J');
    expect(colName(374)).toBe('NJ');
  });
  it('프로젝트 이름 → 제목/설비', () => {
    expect(splitProjectName('SKBA - 3Line - 이설 - Notcher')).toEqual({ title: 'SKBA - 3Line - 이설', equipment: 'Notcher' });
    expect(splitProjectName('단독 이름').equipment).toBe('단독 이름');
  });
  it('파일 이름에 금지 문자가 없다', () => {
    expect(masterScheduleFileName({ manufacturingNo: 'E1-ab12', name: 'A/B:C' })).toBe('E1 A B C Master Schedule.xlsx');
  });
});

describe('planMasterScheduleFill', () => {
  const plan = planMasterScheduleFill(project);
  it('시작일은 가장 빠른 일정 날짜, 기간은 끝-시작+1', () => {
    expect(plan.startSerial).toBe(isoToSerial('2026-02-02'));
    expect(plan.activities[0]).toMatchObject({ name: '설계 및 내부 DR', duration: 19 });
    expect(plan.line).toBe(3);
    expect(plan.equipment).toBe('Notcher(6대)');
  });
  it('부서는 양식 이름 줄 + 여분 줄에, Total Manday 는 제외', () => {
    expect(plan.depts.map((d) => d.label).slice(0, 8)).toEqual(['Mechanical', 'Vision', 'Control', 'Electronical', 'Safety', '비전 외주', 'Supervisor', '소장']);
    expect(plan.depts[8]).toMatchObject({ label: '기구 외주', spare: true, total: 5, peak: 5 });
    expect(plan.depts[0]).toMatchObject({ total: 9, peak: 4 });
  });
  it('마일스톤이 20개를 넘으면 경고', () => {
    const many = { ...project, milestones: Array.from({ length: 22 }, (_, i) => ({ name: `a${i}`, startDate: '2026-02-02', endDate: '2026-02-03' })) };
    const p = planMasterScheduleFill(many);
    expect(p.activities).toHaveLength(20);
    expect(p.warnings.join()).toContain('20개');
  });
});

describe('양식 채우기 (수식·서식 유지 + 다시 읽기)', () => {
  it('patchSheetXml 은 없는 셀이면 오류', () => {
    expect(() => patchSheetXml('<row r="1" a="b"><c r="A1"/></row>', { 1: { B1: { num: 1 } } })).toThrow();
  });

  it('수식·병합·조건부 서식은 그대로이고, 다시 파싱하면 같은 일정/공수가 나온다', async () => {
    const tpl = templateBytes();
    const { bytes, warnings } = await fillMasterScheduleTemplate(tpl, project);
    expect(warnings).toEqual([]);

    // 1) 수식 / 병합 / 조건부 서식 / 서식 정의는 원본과 동일
    const [a, b] = [await JSZip.loadAsync(tpl), await JSZip.loadAsync(bytes)];
    expect(Object.keys(b.files).sort()).toEqual(Object.keys(a.files).sort());
    for (const sheet of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const [x, y] = [await a.file(sheet).async('string'), await b.file(sheet).async('string')];
      const formulas = (s) => (s.match(/<f(?:\s[^>]*)?\/>|<f(?:\s[^>]*)?>[\s\S]*?<\/f>/g) || []).join('|');
      expect(formulas(y)).toBe(formulas(x));
      const tail = (s) => s.slice(s.indexOf('</sheetData>'));
      expect(tail(y)).toBe(tail(x));
    }
    expect(await b.file('xl/styles.xml').async('string')).toBe(await a.file('xl/styles.xml').async('string'));
    expect(await b.file('xl/workbook.xml').async('string')).toContain('fullCalcOnLoad="1"');

    // 2) 앱의 마스터 플랜 파서로 다시 읽으면 입력한 값이 그대로 나온다
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
    const parsed = parseExcelMasterPlan(wb, { fileName: 'x.xlsx' });
    expect(parsed).toHaveLength(1);
    const p = parsed[0];
    expect(p.milestones.map((m) => [m.name, m.startDate, m.endDate])).toEqual(
      project.milestones.map((m) => [m.name, m.startDate, m.endDate]),
    );
    const mp = p.manpower.departments;
    expect(mp['기구'].daily).toEqual({ '2026-04-20': 3, '2026-04-21': 4, '2026-05-02': 2 });
    expect(mp['기구'].total).toBe(9);
    expect(mp['비전'].daily).toEqual({ '2026-04-21': 2, '2026-04-22': 2 });
    expect(mp['전장'].daily).toEqual({ '2026-04-20': 1 });
    expect(mp['소장'].daily).toEqual({ '2026-04-20': 1, '2026-04-21': 1 });
    expect(mp['기구 외주'].daily).toEqual({ '2026-04-22': 5 });
  });

  it('공수가 없는 프로젝트도 만들어진다 (남은 기본 공정명이 없다)', async () => {
    const { bytes } = await fillMasterScheduleTemplate(templateBytes(), { ...project, manpower: null, milestones: project.milestones.slice(0, 2) });
    const wb = XLSX.read(bytes, { type: 'array' });
    const p = parseExcelMasterPlan(wb, {})[0];
    expect(p.milestones).toHaveLength(2);
    expect(p.manpower).toBeUndefined();
  });
});
