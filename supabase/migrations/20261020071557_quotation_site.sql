-- 견적조회: 견적이 어느 Site 것인지 구분하는 컬럼
-- site 는 sites.name 과 같은 글자(예: 'SKOY', 'SKO 대전'). 비어 있으면 "사이트 미확인"으로, 화면에서 사람이 지정한다.
-- 기존 견적은 아래 규칙(src/quotationSite.js 와 동일, 사용자 지정 2026-10-20)으로 단서가 하나뿐이고 분명한 것만 채운다.
-- 단서가 없거나 서로 다른 Site를 가리키면 비워 둔다 (임의 배정 금지).
-- RLS 정책(admin·grade3 전용 ALL)은 그대로 적용된다.

alter table public.quotations
  add column if not exists site text;

create index if not exists quotations_site_idx on public.quotations (site);

with src as (
  select id,
         concat_ws(' ', title, project_name, source_name) as txt,
         upper(coalesce(substring(quote_no from '^TQ-([A-Za-z0-9]+)-'), '')) as qn
    from public.quotations
   where site is null
), hits as (
  select id, 'SKO 대전' as site from src where txt ~* '(^|[^a-z])pp[45]($|[^a-z])|단방향\s*각형|양방향\s*각형|대전' or qn in ('PP4','PP5','RS')
  union all
  select id, 'SKO 서산' from src where txt ~* '(^|[^a-z])dp3($|[^a-z])|서산' or qn in ('DP3','SS2')
  union all
  select id, 'SKBA' from src where txt ~* '(^|[^a-z])skba($|[^a-z])|(^|[^a-z])ba[12]동' or qn = 'BA'
  union all
  select id, 'SKOJ' from src where txt ~* '(^|[^a-z])skoj($|[^a-z])|(^|[^a-z])oj[12]?동?($|[^a-z])' or qn = 'OJ'
  union all
  select id, 'SKOY' from src where txt ~* '(^|[^a-z])skoy($|[^a-z])' or qn = 'OY'
  union all
  select id, 'SKBM' from src where txt ~* '(^|[^a-z])skbm($|[^a-z])'
  union all
  select id, 'HSBMA' from src where txt ~* '(^|[^a-z])hsbma($|[^a-z])' or qn = 'HS'
  union all
  select id, 'SKOH2' from src where txt ~* '(^|[^a-z])skoh2($|[^a-z])'
  union all
  select id, 'SKOH' from src where txt ~* '(^|[^a-z])skoh($|[^a-z2])'
  union all
  select id, 'SKOT (TN1)' from src where txt ~* '(^|[^a-z])skot($|[^a-z])|(^|[^a-z])tn1($|[^a-z])'
), unique_hit as (
  select id, min(site) as site from hits group by id having count(distinct site) = 1
)
update public.quotations q
   set site = u.site
  from unique_hit u
 where q.id = u.id
   and q.site is null
   and exists (select 1 from public.sites s where s.name = u.site);
