-- 제조번호 중복 등록 허용: 유일 제한을 풀고, 검색용 일반 인덱스로 바꾼다.
drop index if exists public.projects_manufacturing_no_unique;
create index if not exists projects_manufacturing_no_idx
  on public.projects using btree (lower(trim(both from manufacturing_no)))
  where manufacturing_no is not null and trim(both from manufacturing_no) <> '';
