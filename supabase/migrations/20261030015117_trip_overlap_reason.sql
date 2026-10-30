-- 출장자 배정 겹침 규칙: 다른 사이트·같은 프로젝트와 겹치면 저장 불가,
-- 동일 사이트 겹침과 부재 겹침은 사유(overlap_reason)를 적어야 저장 가능.
alter table public.trip_assignments add column if not exists overlap_reason text;

create or replace function public.trip_assignment_overlap_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_site text; v_osite text;
  v_reason text := nullif(btrim(coalesce(new.overlap_reason, '')), '');
begin
  if new.member_id is null then return new; end if;
  -- 사람·프로젝트가 그대로이고 기간이 줄거나 같으면(= 새 겹침이 생기지 않으면) 예전 겹침 때문에 막지 않는다
  if tg_op = 'UPDATE' and new.member_id = old.member_id and new.project_id = old.project_id
     and new.start_date >= old.start_date and new.end_date <= old.end_date then
    return new;
  end if;

  select lower(btrim(coalesce(site, ''))) into v_site from public.projects where id = new.project_id;
  for o in
    select a.id, a.project_id, a.overlap_reason from public.trip_assignments a
    where a.member_id = new.member_id and a.id <> new.id
      and a.start_date <= new.end_date and a.end_date >= new.start_date
  loop
    if o.project_id = new.project_id then raise exception 'trip_overlap_blocked' using errcode = 'P0001'; end if;
    select lower(btrim(coalesce(site, ''))) into v_osite from public.projects where id = o.project_id;
    if v_site = '' or v_site is distinct from v_osite then raise exception 'trip_overlap_blocked' using errcode = 'P0001'; end if;
    if v_reason is null and nullif(btrim(coalesce(o.overlap_reason, '')), '') is null then
      raise exception 'trip_overlap_reason_required' using errcode = 'P0001';
    end if;
  end loop;

  if v_reason is null and exists (
    select 1 from public.trip_absences b
    where b.member_id = new.member_id and b.start_date <= new.end_date and b.end_date >= new.start_date
  ) then
    raise exception 'trip_overlap_reason_required' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.trip_assignment_overlap_check() from public, anon, authenticated;

drop trigger if exists trip_assignment_overlap on public.trip_assignments;
create trigger trip_assignment_overlap before insert or update on public.trip_assignments
for each row execute function public.trip_assignment_overlap_check();

-- 작업 기록 요약에 겹침 예외 사유를 덧붙인다 (trip_log_activity 에서 배정 요약만 바뀜)
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
    if tg_op = 'UPDATE' and o = n then return new; end if;
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
      || coalesce(' · 겹침 예외: ' || nullif(btrim(coalesce(r->>'overlap_reason', '')), ''), '')
    when 'absence' then coalesce(v_mname, '-') || ' · ' || coalesce(r->>'kind', '') || coalesce(' ' || nullif(r->>'location', ''), '') || ' · ' || to_char((r->>'start_date')::date, 'MM/DD') || '~' || to_char((r->>'end_date')::date, 'MM/DD')
    when 'member' then coalesce(v_mname, '-') || case when tg_op = 'UPDATE' and (o->>'active') is distinct from (n->>'active') then (case when (n->>'active')::boolean then ' · 복귀' else ' · 퇴사 처리' end) else '' end
    else left(coalesce(r->>'note', ''), 60)
  end;

  insert into public.trip_activity (actor_id, actor_name, actor_team, entity, action, project_id, project_name, dept, member_name, summary, before, after)
  values (v_actor, v_name, v_team, v_entity, lower(tg_op), v_proj, v_pname, v_dept, v_mname, v_sum, o, n);
  return coalesce(new, old);
end $$;
revoke all on function public.trip_log_activity() from public, anon, authenticated;
