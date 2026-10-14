-- [적용 완료: 2026-10-14 사용자가 Supabase SQL Editor 에서 실행 — 서버의 migrations 기록에는 남지 않음. 롤백되는 시뮬레이션으로 검증함]
-- 이름·팀·접속 기록을 DB(profiles)로 옮기고, 회원가입 시 이름·팀을 필수로 강제 (데이터 삭제 없음)
--
-- 왜: 지금까지 이름/팀/마지막 접속/삭제된 계정 목록이 "브라우저 로컬 저장소"에만 있어서 컴퓨터마다 달랐다.
--     profiles 에 name/team 컬럼이 없어서 관리자의 수정과 가입 시 저장이 DB 에 반영된 적이 없었다.
-- 적용 순서: 이 파일 → 앱 배포 → 011(테스트 계정 정리). 이 파일은 현재 앱을 깨뜨리지 않는다(컬럼/함수 추가뿐).
-- 롤백:
--   drop function if exists public.record_my_access(boolean);
--   drop function if exists public.admin_delete_user(uuid);
--   (handle_new_user 는 migrations/20261014*의 이전 정의로 복원, 컬럼은 남겨 둬도 무해)

-- 1) 컬럼 추가
alter table public.profiles
  add column if not exists name text,
  add column if not exists team text,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists last_active_at timestamptz;

-- 2) 백필: 가입 시 저장된 메타데이터, 기존 접속 로그(spc_presets), auth 의 마지막 로그인 시각
update public.profiles p set
  name = coalesce(nullif(btrim(p.name), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), '')),
  team = coalesce(nullif(btrim(p.team), ''), nullif(btrim(coalesce(u.raw_user_meta_data ->> 'team', u.raw_user_meta_data ->> 'department')), '')),
  last_sign_in_at = coalesce(p.last_sign_in_at, u.last_sign_in_at)
from auth.users u
where u.id = p.id;

update public.profiles p set
  last_sign_in_at = greatest(p.last_sign_in_at, (l.value ->> 'last_sign_in_at')::timestamptz),
  last_active_at = greatest(p.last_active_at, (l.value ->> 'last_active_at')::timestamptz)
from public.spc_presets s, lateral jsonb_each(s.data) l
where s.name = '[SYSTEM] USER_ACCESS_LOGS' and lower(p.email) = lower(l.key);

-- 최고 관리자는 기존 화면 표시("조민재 선임 (PM팀)")를 그대로 유지
update public.profiles set name = '조민재 선임', team = 'PM팀' where lower(email) = 'cmj1012@twgroup.co.kr';

-- 3) 회원가입 시 이름과 소속팀을 DB 에서도 필수로 강제 (화면 검증을 우회해도 가입 불가). 최고 관리자 계정 생성만 예외.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text;
  v_team text;
  v_admin boolean;
begin
  if lower(new.email) !~ '^[^@]+@twgroup[.]co[.]kr$' then
    raise exception 'Only @twgroup.co.kr email addresses are allowed';
  end if;

  v_admin := lower(new.email) = 'cmj1012@twgroup.co.kr';
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  v_team := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'team', new.raw_user_meta_data ->> 'department', '')), '');

  if tg_op = 'INSERT' and not v_admin and (v_name is null or v_team is null) then
    raise exception '이름과 소속팀은 필수 입력입니다.';
  end if;

  insert into public.profiles as p (id, email, role, name, team)
  values (new.id, lower(new.email), case when v_admin then 'admin' else 'grade1' end, v_name, v_team)
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(p.name, excluded.name),
    team = coalesce(p.team, excluded.team);
  return new;
end;
$function$;

-- 4) 본인의 접속 시각만 기록하는 함수 (로컬 저장소/공용 설정 행 대신 사용)
create or replace function public.record_my_access(p_signed_in boolean default false)
 returns void
 language sql
 security definer
 set search_path to ''
as $function$
  update public.profiles
     set last_active_at = now(),
         last_sign_in_at = case when p_signed_in then now() else last_sign_in_at end
   where id = auth.uid();
$function$;
revoke execute on function public.record_my_access(boolean) from public, anon;
grant execute on function public.record_my_access(boolean) to authenticated;

-- 5) 계정 영구 삭제: 최고 관리자만, 서버(auth)에서 실제로 삭제한다.
--    (profiles 는 FK cascade, sites/personnel.created_by 는 set null 이라 별도 처리 불필요)
create or replace function public.admin_delete_user(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'cmj1012@twgroup.co.kr' then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null then
    return;
  end if;
  if v_email = 'cmj1012@twgroup.co.kr' then
    raise exception 'cannot delete the super admin';
  end if;
  delete from auth.users where id = p_user_id;
end;
$function$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
