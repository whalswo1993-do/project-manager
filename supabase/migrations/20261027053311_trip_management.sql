-- 출장자 관리 시스템: 새 테이블 4개 + RLS (기존 테이블은 건드리지 않는다)
-- 상태: 2026-10-27 운영 DB에 적용함(서버 기록 버전 20261027053311, 이름 trip_management). 사용자가 SQL 확인 후 직접 적용 지시.
-- 영향: 새 테이블만 추가한다(projects 는 FK 로 참조만 한다). 기존 화면·데이터는 변하지 않는다.
-- 되돌리기: 맨 아래 "롤백" 구간.
--
-- 프로젝트 = 프로젝트 일정에 등록된 projects 행을 그대로 쓴다(별도 PJT 등록 없음).
--   계획 공수는 projects 의 마스터 플랜 공수(앱이 계산)를 그대로 쓰며 따로 고치지 않는다.
--   B1 비자 확인 대상(미국 사이트 HSBMA·SKBA·SKOT)은 프로젝트의 Site 로 앱이 판단한다.
--
-- 권한 모델
--   조회·수정 모두 : admin · grade3 · grade2_5 (grade2·grade1 은 못 본다. 비자·인사 정보가 있다)
--   grade2_5(각 부서 팀장)는 모든 부서를 조회·수정할 수 있다. 자기 부서가 아닌 것을 고칠 때의 확인(경고)은 화면이 한다.
--   부서별 DB 제한이 없으므로 "팀장 지정" 테이블은 두지 않는다.

-- 부서 값은 공수 화면(manpowerDepts.js)과 같은 키를 쓴다
--   mechanical(기구/설비기술) · vision · control · electrical · manager(소장/PM)

create table public.trip_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  rank        text,                                   -- 직위(책임/선임/주임/사원 …) 선택
  dept        text not null check (dept in ('mechanical','vision','control','electrical','manager')),
  team        text,                                   -- 소속 팀(설비기술 1팀 …) 선택
  grade       text,                                   -- 등급(TL/PL/PS/QS …) 선택
  b1_visa     boolean not null default false,         -- B1 비자 보유
  active      boolean not null default true,          -- false = 퇴사 등으로 더는 배정하지 않음
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
-- 같은 부서·팀에 같은 이름이 두 번 들어가는 실수를 막는다(동명이인은 팀이 다르면 허용)
create unique index trip_members_dept_team_name_uidx
  on public.trip_members (dept, coalesce(team, ''), lower(btrim(name)));

-- 출장자 배정: member_id 가 없으면 label(외주1, 중국법인 …)만 있는 자리
create table public.trip_assignments (
  id          uuid primary key default gen_random_uuid(),
  project_id  text not null references public.projects(id) on delete cascade,
  dept        text not null check (dept in ('mechanical','vision','control','electrical','manager')),
  member_id   uuid references public.trip_members(id) on delete restrict,
  label       text,
  start_date  date not null,
  end_date    date not null,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  check (end_date >= start_date),
  check (member_id is not null or btrim(coalesce(label, '')) <> '')
);
create index trip_assignments_project_idx on public.trip_assignments (project_id);
create index trip_assignments_member_idx  on public.trip_assignments (member_id);

-- 부서별 특이사항: 프로젝트 × 부서 당 한 줄
create table public.trip_project_notes (
  project_id  text not null references public.projects(id) on delete cascade,
  dept        text not null check (dept in ('mechanical','vision','control','electrical','manager')),
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (project_id, dept)
);

-- 부재(출장 불가) 기간: 육아휴직·타 출장·교육 등. end_date 가 비면 "계속".
create table public.trip_absences (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.trip_members(id) on delete cascade,
  kind        text not null default 'other' check (kind in ('trip','leave','training','other')),
  start_date  date not null,
  end_date    date,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  check (end_date is null or end_date >= start_date)
);
create index trip_absences_member_idx on public.trip_absences (member_id);

-- 권한 판정 함수: 정책이 로그인 사용자 권한으로 호출한다
create or replace function public.trip_can_view()
returns boolean
language sql stable security definer set search_path to ''
as $$ select coalesce(public.current_app_role() in ('admin','grade3','grade2_5'), false) $$;

revoke execute on function public.trip_can_view() from public, anon;
grant  execute on function public.trip_can_view() to authenticated;

-- 배정한 사람은 그 배정의 부서 소속이어야 한다 (기구 자리에 비전 인원을 넣는 실수 방지)
create or replace function public.trip_assignment_check()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_dept text; v_active boolean;
begin
  -- 이미 있는 배정의 기간·메모만 고칠 때는(담당자가 그 뒤에 비활성이 됐더라도) 막지 않는다
  if tg_op = 'UPDATE' and new.member_id is not distinct from old.member_id and new.dept = old.dept then
    return new;
  end if;
  if new.member_id is not null then
    select dept, active into v_dept, v_active from public.trip_members where id = new.member_id;
    if v_dept is distinct from new.dept then
      raise exception 'trip_member_dept_mismatch' using errcode = 'P0001';
    end if;
    if not v_active then
      raise exception 'trip_member_inactive' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.trip_assignment_check() from public, anon, authenticated;
create trigger trip_assignment_check_trg
  before insert or update on public.trip_assignments
  for each row execute function public.trip_assignment_check();

-- 배정이 있는 인원의 부서는 바꿀 수 없다(배정이 엉킨다). 먼저 배정을 정리한다.
create or replace function public.trip_member_dept_guard()
returns trigger
language plpgsql security definer set search_path to ''
as $$
begin
  if new.dept is distinct from old.dept
     and exists (select 1 from public.trip_assignments a where a.member_id = old.id) then
    raise exception 'trip_member_has_assignments' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.trip_member_dept_guard() from public, anon, authenticated;
create trigger trip_member_dept_guard_trg
  before update on public.trip_members
  for each row execute function public.trip_member_dept_guard();

-- RLS
alter table public.trip_members       enable row level security;
alter table public.trip_assignments   enable row level security;
alter table public.trip_project_notes enable row level security;
alter table public.trip_absences      enable row level security;

-- 조회·수정: admin · grade3 · grade2_5
create policy trip_members_all       on public.trip_members       for all to authenticated using (public.trip_can_view()) with check (public.trip_can_view());
create policy trip_assignments_all   on public.trip_assignments   for all to authenticated using (public.trip_can_view()) with check (public.trip_can_view());
create policy trip_project_notes_all on public.trip_project_notes for all to authenticated using (public.trip_can_view()) with check (public.trip_can_view());
create policy trip_absences_all      on public.trip_absences      for all to authenticated using (public.trip_can_view()) with check (public.trip_can_view());

-- 롤백:
--   drop table public.trip_project_notes, public.trip_absences,
--              public.trip_assignments, public.trip_members;
--   drop function public.trip_member_dept_guard(), public.trip_assignment_check(), public.trip_can_view();
