import { describe, it, expect } from 'vitest';
import { detectQuotationSite } from '../src/quotationSite';

const SITES = ['HSBMA', 'SKBA', 'SKBM', 'SKO 대전', 'SKO 서산', 'SKOH', 'SKOH2', 'SKOJ', 'SKOT (TN1)', 'SKOY'];
const site = (fields) => detectQuotationSite(fields, SITES)?.site ?? null;

describe('견적 Site 자동 인식', () => {
  it('사이트 이름이 제목에 있으면 그 Site', () => {
    expect(site({ title: 'SKOY Notching 8L 개조' })).toBe('SKOY');
    expect(site({ title: 'SKBA STK 데이터 온라인화' })).toBe('SKBA');
    expect(site({ title: 'SKBM Stacking 개선' })).toBe('SKBM');
    expect(site({ title: 'HSBMA 2L 장폭형교환' })).toBe('HSBMA');
  });

  it('지정된 별칭 규칙: PP4/PP5/단방향·양방향 각형 = SKO 대전', () => {
    expect(site({ title: 'PP4 E1250 STK JC Tool Only' })).toBe('SKO 대전');
    expect(site({ title: 'PP5 설비 개조' })).toBe('SKO 대전');
    expect(site({ title: '단방향 각형 Cell J/C' })).toBe('SKO 대전');
    expect(site({ title: '양방향 각형 400*150*45 Cell J/C' })).toBe('SKO 대전');
  });

  it('지정된 별칭 규칙: DP3/서산2동 = SKO 서산, BA1·BA2동 = SKBA, OJ = SKOJ', () => {
    expect(site({ title: 'DP3 Stacking S012A JC' })).toBe('SKO 서산');
    expect(site({ title: '서산2동 4,5L Stacking 설비 개조' })).toBe('SKO 서산');
    expect(site({ title: 'BA1동 검사 고도화' })).toBe('SKBA');
    expect(site({ title: 'BA2동 4CAM 고도화' })).toBe('SKBA');
    expect(site({ title: 'OJ 9,12,14,15 ST Align Vision 개조' })).toBe('SKOJ');
    expect(site({ title: 'OJ1동 개조' })).toBe('SKOJ');
    expect(site({ title: 'OJ2동 개조' })).toBe('SKOJ');
  });

  it('견적번호 접두로도 인식한다', () => {
    expect(site({ title: '이름 없는 견적', quoteNo: 'TQ-OY-NMO-2608261051' })).toBe('SKOY');
    expect(site({ title: '이름 없는 견적', quoteNo: 'TQ-PP4-SJC-2609171458' })).toBe('SKO 대전');
    expect(site({ title: '이름 없는 견적', quoteNo: 'TQ-SS2-SMO-2610081830' })).toBe('SKO 서산');
  });

  it('단서가 없으면 null (임의 배정하지 않는다)', () => {
    expect(site({ title: '형교환 상세 JOB CHANGE DETAIL LIST' })).toBeNull();
    expect(site({ title: '', quoteNo: '' })).toBeNull();
    expect(site({})).toBeNull();
  });

  it('서로 다른 Site를 가리키면 null', () => {
    expect(site({ title: 'SKOY 개조', quoteNo: 'TQ-BA-SMO-2608101107' })).toBeNull();
    expect(site({ title: 'PP4 와 DP3 공통' })).toBeNull();
  });

  it('고를 수 있는 Site 목록에 없는 곳은 인식하지 않는다', () => {
    expect(detectQuotationSite({ title: 'SKOY 개조' }, ['SKBA'])).toBeNull();
  });

  it('SKOH2 와 SKOH 를 구분한다', () => {
    expect(site({ title: 'SKOH2 개조' })).toBe('SKOH2');
    expect(site({ title: 'SKOH 개조' })).toBe('SKOH');
  });

  it('근거 문구를 돌려준다', () => {
    expect(detectQuotationSite({ title: 'SKOY 개조' }, SITES).reason).toContain('SKOY');
  });
});
