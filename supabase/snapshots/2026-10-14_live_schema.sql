-- ============================================================================
-- Live schema SNAPSHOT of Supabase project "Project-manager" (tebtuzxafkymlplmlhzu)
-- Captured 2026-10-14 via the Supabase connector (read-only queries).
--
-- ⚠ 이 스냅샷은 보안 수정 "이전"의 상태를 기록한 것이다. 이후 변경은 supabase/migrations/ 의 4개 파일이 정본이다:
--   20261014010502 daily_reports / project_issues 를 로그인한 활성 사용자로 제한
--   20261014032933 projects 의 무조건 허용 정책 4개 삭제 (grade 제한이 DB 에서 실제로 적용됨)
--   20261014033030 SECURITY DEFINER 함수의 anon/authenticated 직접 호출 권한 회수
--   20261014033129 project_history 구조 정리 + projects 변경 이력 트리거(admin 만 열람)
-- 아래 policies / functions / triggers 섹션은 그 변경 전 모습이다.
--
-- This is a REFERENCE document, NOT a migration. It lives outside supabase/migrations
-- on purpose so `supabase db push` never runs it. Table DDL below is reconstructed from
-- catalog metadata; policies, functions, triggers and indexes are verbatim from the DB.
-- The server has 0 registered migrations, so this is the only record of the schema.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables (all have RLS enabled)
-- ---------------------------------------------------------------------------
create table public.projects (
  id text primary key,
  name text,
  manager text,
  start_date date,
  end_date date,
  status text,
  progress integer,
  auto_progress boolean,
  milestones jsonb,
  created_at timestamp without time zone default now(),
  manufacturing_no text,
  site text,
  pm text,
  design text,
  facility_technology text,
  control text,
  vision text,
  line text
);

create table public.profiles (
  id uuid primary key references auth.users(id),
  email text not null unique,
  role text not null default 'grade1' check (role = any (array['admin','grade3','grade2','grade1'])),
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create table public.sites (
  id bigint generated always as identity primary key,
  name text not null,
  normalized_name text generated always as (lower(trim(both from name))) stored unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.personnel (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  department text default '기타'
);

create table public.daily_backups (
  id bigint generated always as identity primary key,
  backup_date date not null unique default current_date,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table public.spc_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  data jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.project_issues (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  date date not null,
  issue_content text not null,
  category text not null,
  future_notes text,
  created_at timestamptz default now()
);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  report_date date not null,
  content text not null,
  created_at timestamptz default now(),
  work_details text,
  special_notes text,
  issues text,
  personnel_count integer,
  pm_count integer default 0,
  design_count integer default 0,
  facility_count integer default 0,
  control_count integer default 0,
  vision_count integer default 0
  -- NOTE: electrical_count, *_outsource and custom_depts are NOT columns. The app packs them as JSON into
  -- `content` (see extraData in IssueManagement.jsx) and unpacks them on read (ManpowerManagement.jsx).
);

create table public.project_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  changed_at timestamptz default now(),
  details text
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id),
  title text not null,
  total_amount numeric default 0,
  created_at timestamptz default now(),
  project_name text
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid references public.quotations(id),
  item_name text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  total_price numeric default 0,
  created_at timestamptz default now(),
  item_category text default '구매품',
  unit_name text
);

-- ---------------------------------------------------------------------------
-- Indexes (non-primary-key)
-- ---------------------------------------------------------------------------
create unique index projects_manufacturing_no_unique on public.projects using btree (lower(trim(both from manufacturing_no)))
  where ((manufacturing_no is not null) and (trim(both from manufacturing_no) <> ''::text));

-- ---------------------------------------------------------------------------
-- Functions (verbatim)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select role from public.profiles where id=auth.uid() and active=true; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if lower(new.email) !~ '^[^@]+@twgroup[.]co[.]kr$' then
    raise exception 'Only @twgroup.co.kr email addresses are allowed';
  end if;
  insert into public.profiles(id,email,role)
  values(new.id,lower(new.email),case when lower(new.email)='cmj1012@twgroup.co.kr' then 'admin' else 'grade1' end)
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.log_project_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 insert into public.project_history(project_id,action,before_data,after_data,changed_by,changed_email)
 values(coalesce(new.id,old.id),tg_op,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,auth.uid(),auth.jwt()->>'email');
 return coalesce(new,old); end; $function$;

CREATE OR REPLACE FUNCTION public.make_daily_backup()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin
 insert into public.daily_backups(backup_date,data) select current_date,jsonb_build_object('projects',coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb)) from public.projects p on conflict(backup_date) do update set data=excluded.data,created_at=now();
 delete from public.daily_backups where backup_date < current_date-90; end; $function$;

CREATE OR REPLACE FUNCTION public.restrict_grade2_project_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role()='grade2' and (
    new.id is distinct from old.id or
    new.manufacturing_no is distinct from old.manufacturing_no or
    new.site is distinct from old.site or
    new.name is distinct from old.name or
    new.manager is distinct from old.manager or
    new.pm is distinct from old.pm or
    new.design is distinct from old.design or
    new.facility_technology is distinct from old.facility_technology or
    new.control is distinct from old.control or
    new.vision is distinct from old.vision or
    new.start_date is distinct from old.start_date or
    new.end_date is distinct from old.end_date or
    new.milestones is distinct from old.milestones
  ) then
    raise exception 'Grade2 can update only status and progress';
  end if;
  return new;
end;
$function$;

-- rls_auto_enable(): event trigger function that enables RLS on every new table in schema public
-- (definition omitted here; fetch with pg_get_functiondef if needed)

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER restrict_grade2_project_update BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION restrict_grade2_project_update();
CREATE TRIGGER on_auth_user_created AFTER INSERT OR UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- NOTE: log_project_change() exists but NO trigger uses it, and project_history lacks the columns it inserts into.

-- ---------------------------------------------------------------------------
-- RLS policies (verbatim) — see the review notes at the bottom
-- ---------------------------------------------------------------------------
create policy daily_backups_admin_read on public.daily_backups for select to authenticated using (current_app_role() = 'admin');

create policy "Enable all actions for all users" on public.daily_reports for all to public using (true) with check (true);

create policy personnel_delete on public.personnel for delete to authenticated using (current_app_role() = any (array['admin','grade3']));
create policy personnel_insert on public.personnel for insert to authenticated with check ((current_app_role() = any (array['admin','grade3'])) and (created_by = auth.uid()));
create policy personnel_read   on public.personnel for select to authenticated using (current_app_role() is not null);
create policy personnel_update on public.personnel for update to authenticated using (current_app_role() = any (array['admin','grade3'])) with check (current_app_role() = any (array['admin','grade3']));

create policy profiles_admin_update on public.profiles for update to authenticated using (lower(auth.jwt() ->> 'email') = 'cmj1012@twgroup.co.kr') with check (lower(auth.jwt() ->> 'email') = 'cmj1012@twgroup.co.kr');
create policy profiles_read on public.profiles for select to authenticated using ((id = auth.uid()) or (lower(auth.jwt() ->> 'email') = 'cmj1012@twgroup.co.kr'));

create policy "Enable all actions for all users" on public.project_issues for all to public using (true) with check (true);

create policy projects_delete on public.projects for delete to authenticated using (current_app_role() = any (array['admin','grade3']));
create policy projects_insert on public.projects for insert to authenticated with check (current_app_role() = any (array['admin','grade3']));
create policy projects_read   on public.projects for select to authenticated using (current_app_role() is not null);
create policy projects_update on public.projects for update to authenticated using (current_app_role() = any (array['admin','grade3','grade2'])) with check (current_app_role() = any (array['admin','grade3','grade2']));
create policy "team members can add projects"    on public.projects for insert to authenticated with check (true);
create policy "team members can delete projects" on public.projects for delete to authenticated using (true);
create policy "team members can read projects"   on public.projects for select to authenticated using (true);
create policy "team members can update projects" on public.projects for update to authenticated using (true) with check (true);

create policy "Allow grade3 and admin access to items" on public.quotation_items for all to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'admin' or profiles.role = 'grade3')))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'admin' or profiles.role = 'grade3')));
create policy "Allow grade3 and admin access to quotations" on public.quotations for all to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'admin' or profiles.role = 'grade3')))
  with check (exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'admin' or profiles.role = 'grade3')));

create policy sites_delete on public.sites for delete to authenticated using (current_app_role() = any (array['admin','grade3']));
create policy sites_insert on public.sites for insert to authenticated with check ((current_app_role() = any (array['admin','grade3'])) and (created_by = auth.uid()));
create policy sites_read   on public.sites for select to authenticated using (current_app_role() is not null);

create policy "인증된 사용자 삭제 허용" on public.spc_presets for delete to authenticated using (true);
create policy "인증된 사용자 수정 허용" on public.spc_presets for update to authenticated using (true);
create policy "인증된 사용자 조회 허용" on public.spc_presets for select to authenticated using (true);
create policy "인증된 사용자 추가 허용" on public.spc_presets for insert to authenticated with check (true);

-- ============================================================================
-- REVIEW NOTES (2026-10-14) — 해결 현황: 1~3, 5 모두 마이그레이션으로 해결 / 4 는 Supabase 요금제 설정이라 미해결 / 6 은 의도적 유지
--   (함수 6건 경고는 5건 해소, current_app_role 1건은 RLS 와 서버 로그인 검증이 쓰므로 의도적으로 로그인 사용자에게 유지)
-- 1. [FIXED later the same day by migration 20261014010502 — the policies shown above for these two tables are the
--    PRE-FIX state; they are now daily_reports_app_users / project_issues_app_users, role authenticated]
--    daily_reports and project_issues: policy "Enable all actions for all users" is granted to role `public`
--    with USING (true) — anyone holding the (publicly committed) publishable key can read/write/delete without
--    logging in. Verified: anonymous HEAD request returned all 212 daily_reports rows.
-- 2. projects: the four permissive "team members can ..." policies (true) are OR-ed with the role-based
--    projects_* policies, so ANY authenticated user (including grade1) can insert/update/delete projects,
--    defeating the grade model at the DB level.
-- 3. SECURITY DEFINER functions are executable by anon/authenticated through /rest/v1/rpc/* (advisor lints 0028/0029).
-- 4. Leaked-password protection is disabled in Supabase Auth.
-- 5. project_history has no policies, no trigger feeding it, and a schema that doesn't match log_project_change().
-- 6. The admin email is hard-coded in profiles policies and handle_new_user().
-- ============================================================================
