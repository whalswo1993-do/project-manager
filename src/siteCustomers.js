// Site를 고객사별로 나누는 규칙.
// 정본은 DB `sites.customer` 컬럼이고, 값이 없으면(컬럼 미적용·미지정) 이름 규칙으로 판단한다.
//   SK on:       HSBMA, SKBA, SKBM, SKO 대전, SKO 서산, SKOH, SKOH2, SKOJ, SKOT, SKOY ...
//   Samsung SDI: SDI 기흥, SDI 시안, SDI 울산, SDI 천안 ...
//   Hyundai:     현대 안성 ...
export const DEFAULT_SITE_CUSTOMER = 'SK on';

export function inferSiteCustomer(name) {
  const key = String(name || '').trim().toLowerCase();
  if (/^(sdi|samsung|삼성)/.test(key)) return 'Samsung SDI';
  if (/^(현대|hyundai)/.test(key)) return 'Hyundai';
  return DEFAULT_SITE_CUSTOMER;
}

export function siteCustomer(site) {
  const saved = site && typeof site === 'object' ? site.customer : '';
  return saved || inferSiteCustomer(site && typeof site === 'object' ? site.name : site);
}

// 해당 고객사의 Site만 남긴다. sites 항목은 { name, customer? } 객체.
export function filterSitesByCustomer(sites, customer) {
  return (sites || []).filter(s => siteCustomer(s) === customer);
}
