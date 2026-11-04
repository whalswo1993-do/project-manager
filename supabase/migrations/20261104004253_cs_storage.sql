-- CS 통합 관리 시스템: 저장소를 브라우저(IndexedDB)에서 Supabase 로 옮긴다. 새 테이블 1개 + 파일 버킷 1개. 기존 테이블은 건드리지 않는다.
-- 권한: 조회 = 로그인한 활성 사용자 전원(current_app_role() 이 null 이 아닌 사람)
--       수정 = admin · grade3 · grade2_5 · grade2

create or replace function public.cs_can_view()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.current_app_role() is not null $$;

create or replace function public.cs_can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin','grade3','grade2_5','grade2'), false) $$;

revoke execute on function public.cs_can_view(), public.cs_can_edit() from public, anon;
grant  execute on function public.cs_can_view(), public.cs_can_edit() to authenticated;

-- 프로그램의 데이터(프로젝트·업무·일보·Site·자재현황 …)를 "항목 1개 = 1행"으로 저장한다.
--   doc       : main(CS 프로그램) | material(자재현황)
--   container : 목록 이름(projects, tasks, …) 또는 자재 프로젝트 번호
--   kind      : item(목록의 항목) | entry(맵의 항목) | value(단일 값) | shape(문서 구조 정보)
-- 화면은 바뀐 항목만 저장하므로 서로 다른 항목을 동시에 고쳐도 덮어쓰지 않는다.
create table public.cs_records (
  doc        text    not null check (doc in ('main','material')),
  container  text    not null,
  id         text    not null,
  kind       text    not null check (kind in ('item','entry','value','shape')),
  sort       integer not null default 0,
  data       jsonb   not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (doc, container, id)
);
create index cs_records_doc_idx on public.cs_records (doc);

create or replace function public.cs_records_touch()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger cs_records_touch before insert or update on public.cs_records
  for each row execute function public.cs_records_touch();

alter table public.cs_records enable row level security;
create policy cs_records_select on public.cs_records for select to authenticated using (public.cs_can_view());
create policy cs_records_insert on public.cs_records for insert to authenticated with check (public.cs_can_edit());
create policy cs_records_update on public.cs_records for update to authenticated using (public.cs_can_edit()) with check (public.cs_can_edit());
create policy cs_records_delete on public.cs_records for delete to authenticated using (public.cs_can_edit());
revoke all on public.cs_records from anon;
grant select, insert, update, delete on public.cs_records to authenticated;

-- 첨부자료(PPT·엑셀 원본 등) 파일 버킷: 비공개, 파일당 50MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('cs-files', 'cs-files', false, 52428800)
on conflict (id) do nothing;

create policy cs_files_select on storage.objects for select to authenticated
  using (bucket_id = 'cs-files' and public.cs_can_view());
create policy cs_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cs-files' and public.cs_can_edit());
create policy cs_files_update on storage.objects for update to authenticated
  using (bucket_id = 'cs-files' and public.cs_can_edit()) with check (bucket_id = 'cs-files' and public.cs_can_edit());
create policy cs_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cs-files' and public.cs_can_edit());

-- 롤백:
--   drop table public.cs_records; drop function public.cs_can_edit(), public.cs_can_view();
--   delete from storage.buckets where id = 'cs-files';  (파일이 있으면 먼저 비워야 함) / drop policy cs_files_* on storage.objects;
