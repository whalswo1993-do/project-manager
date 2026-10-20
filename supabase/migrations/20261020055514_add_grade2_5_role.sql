-- 서버 적용 버전: 20261020055514 (apply_migration 으로 적용, 롤백되는 시뮬레이션으로 grade2/grade2_5/grade1 검증 완료)
-- Grade 2.5 (팀장) 역할 추가: DB 스키마/정책 변경
-- 목적: 새 역할 'grade2_5' 를 만들고 현재 grade2 가 가진 DB 권한을 그대로 준다.
--       (AI 호출 제한은 DB가 아니라 서버 함수 api/_lib/handler.js 에서 한다)
-- 영향: 기존 사용자의 role 은 바꾸지 않는다. 새 값이 추가될 뿐이라 되돌리기 쉽다.
-- 되돌리기: 아래 "롤백" 구간 참고.


-- 1) profiles.role 허용 값에 grade2_5 추가
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin','grade3','grade2_5','grade2','grade1']));

-- 2) projects 수정 정책: grade2_5 도 grade2 와 같이 수정 가능
drop policy projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using      (public.current_app_role() = any (array['admin','grade3','grade2_5','grade2']))
  with check (public.current_app_role() = any (array['admin','grade3','grade2_5','grade2']));

-- 3) grade2 가 상태·진척 외에는 못 바꾸는 트리거: grade2_5 도 같은 제한을 받는다
create or replace function public.restrict_grade2_project_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if public.current_app_role() in ('grade2', 'grade2_5') and (
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

