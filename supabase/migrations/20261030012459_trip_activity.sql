-- 출장자 관리 작업 기록(누가·언제·무엇을). 4개 테이블의 변경을 트리거가 자동으로 남긴다.
create table if not exists public.trip_activity (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  actor_team text,
  entity text not null check (entity in ('assignment', 'member', 'absence', 'note')),
  action text not null check (action in ('insert', 'update', 'delete')),
  project_id text,
  project_name text,
  dept text,
  member_name text,
  summary text not null default '',
  before jsonb,
  after jsonb
);
create index if not exists trip_activity_at_idx on public.trip_activity (at desc);

alter table public.trip_activity enable row level security;
drop policy if exists trip_activity_select on public.trip_activity;
create policy trip_activity_select on public.trip_activity for select to authenticated using (public.trip_can_view());
-- insert/update/delete 정책은 만들지 않는다: 기록은 아래 트리거(security definer)만 쓰고 아무도 고치거나 지울 수 없다.
revoke all on public.trip_activity from anon, authenticated;
grant select on public.trip_activity to authenticated;

create or replace function public.trip_log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; o jsonb; n jsonb;
  v_actor uuid := auth.uid();
  v_name text; v_team text;
  v_entity text; v_proj text; v_pname text; v_dept text; v_mname text; v_sum text; v_mid uuid;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); o := r; n := null;
  else
    r := to_jsonb(new); n := r;
    o := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    if tg_op = 'UPDATE' and o = n then return new; end if; -- 바뀐 것이 없으면 남기지 않는다
  end if;

  select p.name, p.team into v_name, v_team from public.profiles p where p.id = v_actor;
  v_entity := case tg_table_name
    when 'trip_assignments' then 'assignment' when 'trip_members' then 'member'
    when 'trip_absences' then 'absence' else 'note' end;
  v_proj := r->>'project_id';
  v_dept := r->>'dept';
  if v_proj is not null then select pr.name into v_pname from public.projects pr where pr.id = v_proj; end if;

  if v_entity = 'member' then
    v_mname := r->>'name';
  else
    v_mid := nullif(r->>'member_id', '')::uuid;
    if v_mid is not null then
      select m.name, coalesce(v_dept, m.dept) into v_mname, v_dept from public.trip_members m where m.id = v_mid;
    end if;
    v_mname := coalesce(v_mname, nullif(r->>'label', ''));
  end if;

  v_sum := case v_entity
    when 'assignment' then coalesce(v_mname, '(이름 없음)') || ' · ' || to_char((r->>'start_date')::date, 'MM/DD') || '~' || to_char((r->>'end_date')::date, 'MM/DD')
    when 'absence' then coalesce(v_mname, '-') || ' · ' || coalesce(r->>'kind', '') || coalesce(' ' || nullif(r->>'location', ''), '') || ' · ' || to_char((r->>'start_date')::date, 'MM/DD') || '~' || to_char((r->>'end_date')::date, 'MM/DD')
    when 'member' then coalesce(v_mname, '-') || case when tg_op = 'UPDATE' and (o->>'active') is distinct from (n->>'active') then (case when (n->>'active')::boolean then ' · 복귀' else ' · 퇴사 처리' end) else '' end
    else left(coalesce(r->>'note', ''), 60)
  end;

  insert into public.trip_activity (actor_id, actor_name, actor_team, entity, action, project_id, project_name, dept, member_name, summary, before, after)
  values (v_actor, v_name, v_team, v_entity, lower(tg_op), v_proj, v_pname, v_dept, v_mname, v_sum, o, n);
  return coalesce(new, old);
end $$;
revoke all on function public.trip_log_activity() from public, anon, authenticated;

drop trigger if exists trip_assignments_log on public.trip_assignments;
create trigger trip_assignments_log after insert or update or delete on public.trip_assignments for each row execute function public.trip_log_activity();
drop trigger if exists trip_members_log on public.trip_members;
create trigger trip_members_log after insert or update or delete on public.trip_members for each row execute function public.trip_log_activity();
drop trigger if exists trip_absences_log on public.trip_absences;
create trigger trip_absences_log after insert or update or delete on public.trip_absences for each row execute function public.trip_log_activity();
drop trigger if exists trip_project_notes_log on public.trip_project_notes;
create trigger trip_project_notes_log after insert or update or delete on public.trip_project_notes for each row execute function public.trip_log_activity();
