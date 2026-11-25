import { describe, it, expect } from 'vitest';
import { projectProcesses, matchesProcess } from '../src/projectProcess.js';
import { siteCountry, matchesCountries, countriesOf } from '../src/siteCountry.js';

describe('공정(NC/ST) 구분', () => {
  const cases = [
    ['SKOY - 12Line - E1540 J/C Notcher(8대)', ['NC']],
    ['SKOY - 7Line - BPD2→1 J/C - NOTCHING - 7Line(8대)', ['NC']],
    ['SKOH2-NC C/H 하부비전 추가 개조 - 9Line (NC 양극3대)', ['NC']],
    ['탑립동-> DP Notching 이설 - 3Line - 탑립동 (NC 1대)', ['NC']],
    ['SKOY - 10Line - E1144 J/C Stacker(9대)', ['ST']],
    ['SKOY - 7Line - BPD2→1 J/C - STACKING - 7Line(12대)', ['ST']],
    ['삼성SDI 울산M라인 Stack 설비 Bonding 공정 추가', ['ST']],
    ['SK 대전연구소 PP4 ST E1250 형교환', ['ST']],
    ['알파 라인 노칭, 스택 셋업/SAT', ['NC', 'ST']],
    ['SKOH2 - 9Line 4Cam 및 자가진단 개조(9대)', []],
    ['SYNC TEST BEST 개조', []],
  ];
  it.each(cases)('%s', (name, expected) => {
    expect(projectProcesses({ name })).toEqual(expected);
  });

  it('Site 칸의 글자도 본다', () => {
    expect(projectProcesses({ name: 'SKOT - 3,4Line - SKOT 이설', site: 'SKOT NC 3,4 라인 설비 이설 (10대)' })).toEqual(['NC']);
  });

  it('필터: 전체·NC·ST·기타', () => {
    const both = { name: '노칭, 스택 셋업' };
    const none = { name: '4Cam 개조' };
    expect(matchesProcess('전체', none)).toBe(true);
    expect(matchesProcess('NC', both)).toBe(true);
    expect(matchesProcess('ST', both)).toBe(true);
    expect(matchesProcess('기타', both)).toBe(false);
    expect(matchesProcess('기타', none)).toBe(true);
    expect(matchesProcess('NC', none)).toBe(false);
  });
});

describe('Site 국가 분류', () => {
  it('현재 Site를 국가로 나눈다', () => {
    expect(siteCountry('HSBMA')).toBe('미국');
    expect(siteCountry('SKBA')).toBe('미국');
    expect(siteCountry('SKOT (TN1)')).toBe('미국');
    expect(siteCountry('SKBM')).toBe('헝가리');
    expect(siteCountry('SKOH')).toBe('헝가리');
    expect(siteCountry('SKOH2')).toBe('헝가리');
    expect(siteCountry('SKOJ')).toBe('중국');
    expect(siteCountry('SKOY')).toBe('중국');
    expect(siteCountry('SDI 시안')).toBe('중국');
    expect(siteCountry('SKO 대전')).toBe('한국');
    expect(siteCountry('SKO 서산')).toBe('한국');
    expect(siteCountry('SDI 울산')).toBe('한국');
    expect(siteCountry('현대 안성')).toBe('한국');
    expect(siteCountry('SK 대전연구소 PP4 ST QVBJ(E1178) 형교환')).toBe('한국');
    expect(siteCountry('')).toBe('기타');
  });

  it('국가를 안 고르면 전체, 고르면 그 국가만', () => {
    expect(matchesCountries([], 'SKOY')).toBe(true);
    expect(matchesCountries(['미국'], 'SKBA')).toBe(true);
    expect(matchesCountries(['미국'], 'SKOY')).toBe(false);
    expect(matchesCountries(['미국', '중국'], 'SKOY')).toBe(true);
  });

  it('목록에 있는 국가만 정해진 순서로', () => {
    expect(countriesOf(['SKOY', 'SKBA', 'SKO 서산'])).toEqual(['한국', '미국', '중국']);
  });
});
