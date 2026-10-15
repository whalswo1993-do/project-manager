import { describe, it, expect } from 'vitest';
import { filterSitesByCustomer, inferSiteCustomer, siteCustomer } from '../src/siteCustomers.js';

const names = [
  'HSBMA', 'SKBA', 'SKBM', 'SKO 대전', 'SKO 서산', 'SKOH', 'SKOH2', 'SKOJ', 'SKOT (TN1)', 'SKOY',
  'SDI 기흥', 'SDI 시안', 'SDI 울산', 'SDI 천안', '현대 안성'
];
const sites = names.map((name, i) => ({ id: i + 1, name }));

describe('Site 고객사 분류', () => {
  it('이름 규칙으로 고객사를 판단한다', () => {
    expect(inferSiteCustomer('SKOH2')).toBe('SK on');
    expect(inferSiteCustomer('SDI 울산')).toBe('Samsung SDI');
    expect(inferSiteCustomer('현대 안성')).toBe('Hyundai');
  });

  it('DB에 저장된 customer 값이 이름 규칙보다 우선한다', () => {
    expect(siteCustomer({ name: 'SDI 울산', customer: 'Hyundai' })).toBe('Hyundai');
  });

  it('고객사별로 해당 Site만 남긴다', () => {
    expect(filterSitesByCustomer(sites, 'SK on').map(s => s.name)).toHaveLength(10);
    expect(filterSitesByCustomer(sites, 'Samsung SDI').map(s => s.name)).toEqual(['SDI 기흥', 'SDI 시안', 'SDI 울산', 'SDI 천안']);
    expect(filterSitesByCustomer(sites, 'Hyundai').map(s => s.name)).toEqual(['현대 안성']);
  });
});
