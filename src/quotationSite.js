// 견적이 어느 Site(사이트)의 것인지 이름·견적번호의 단서로 알아낸다.
// 원칙: 단서가 하나뿐이고 분명할 때만 Site를 돌려준다. 단서가 없거나 서로 다른 Site를 가리키면 null →
// 호출한 쪽(견적 등록 미리보기)이 사용자에게 Site를 직접 고르게 한다. 임의로 배정하지 않는다.
//
// 규칙의 정본은 사용자 지정(2026-10-20)이다. 규칙을 바꾸면 supabase/migrations의 사이트 분류 SQL도 같이 확인한다.
export const SITE_UNASSIGNED = '미확인';

// 영문 코드는 앞뒤가 영문자가 아닐 때만 인정한다 (BA2동, OJ 9L 은 되고 "OJECT" 같은 단어는 아니다)
const code = (body) => new RegExp(`(?<![A-Za-z])(?:${body})(?![A-Za-z])`, 'i');

const SITE_RULES = [
  { site: 'SKO 대전', patterns: [code('PP[45]'), /단방향\s*각형/, /양방향\s*각형/, /대전/] },
  { site: 'SKO 서산', patterns: [code('DP3'), /서산\s*2동/, /서산/] },
  { site: 'SKBA', patterns: [code('SKBA'), code('BA[12]동'), /BA[12]동/i] },
  { site: 'SKOJ', patterns: [code('SKOJ'), code('OJ[12]?동?')] },
  { site: 'SKOY', patterns: [code('SKOY')] },
  { site: 'SKBM', patterns: [code('SKBM')] },
  { site: 'HSBMA', patterns: [code('HSBMA')] },
  { site: 'SKOH2', patterns: [code('SKOH2')] },
  { site: 'SKOH', patterns: [/(?<![A-Za-z])SKOH(?![A-Za-z2])/i] },
  { site: 'SKOT (TN1)', patterns: [code('SKOT'), code('TN1')] },
];

// 견적번호 접두 (TQ-OY-NMO-... 의 두 번째 칸)
const QUOTE_NO_PREFIX = {
  OY: 'SKOY', BA: 'SKBA', HS: 'HSBMA', OJ: 'SKOJ',
  PP4: 'SKO 대전', PP5: 'SKO 대전', RS: 'SKO 대전',
  DP3: 'SKO 서산', SS2: 'SKO 서산',
};

function ruleHits(text) {
  const hits = [];
  for (const rule of SITE_RULES) {
    for (const re of rule.patterns) {
      const m = String(text || '').match(re);
      if (m) { hits.push({ site: rule.site, matched: m[0] }); break; }
    }
  }
  return hits;
}

// fields: { title, projectName, quoteNo, fileName }  /  siteNames: 고를 수 있는 Site 이름 목록
// 반환: { site, reason } 또는 null
export function detectQuotationSite(fields = {}, siteNames = []) {
  const allowed = new Set((siteNames || []).map(n => String(n).trim()));
  const found = [];
  const add = (site, label, matched) => { if (allowed.has(site)) found.push({ site, label, matched }); };

  [['제목', fields.title], ['프로젝트명', fields.projectName], ['파일명', fields.fileName]].forEach(([label, text]) => {
    ruleHits(text).forEach(h => add(h.site, label, h.matched));
  });
  const qn = String(fields.quoteNo || '').match(/^TQ-([A-Z0-9]+)-/i);
  if (qn && QUOTE_NO_PREFIX[qn[1].toUpperCase()]) add(QUOTE_NO_PREFIX[qn[1].toUpperCase()], '견적번호', qn[0].replace(/-$/, ''));

  const sites = [...new Set(found.map(f => f.site))];
  if (sites.length !== 1) return null;
  const first = found[0];
  return { site: first.site, reason: `${first.label}에서 '${first.matched}' 인식` };
}
