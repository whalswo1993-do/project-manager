-- Applied to production via the Supabase connector on 2026-10-14.
-- log_project_change() 가 기대하는 구조로 project_history 를 맞추고(0행 테이블이라 안전), projects 변경 이력을 기록한다.
-- 이력 기록이 실패해도 프로젝트 저장(INSERT/UPDATE/DELETE)이 막히지 않도록 함수 안에서 예외를 삼키고 경고만 남긴다.
--
-- 적용 후 검증(롤백되는 시뮬레이션): grade3 수정 → 저장 성공 + 이력 1건(action=UPDATE, 변경 전/후 데이터, 수정자 ID),
--   grade1 수정은 여전히 차단되고 이력 없음, 이력 열람은 admin 만 가능.
-- 주의: 프로젝트를 저장할 때마다 변경 전/후 전체 행(milestones 포함)이 기록되어 테이블이 커진다. 필요하면 보존 기간 정리를 추가한다.
--
-- Rollback:
--   drop trigger if exists log_project_change on public.projects;
--   drop policy if exists project_history_admin_read on public.project_history;

alter table public.project_history
  alter column project_id type text using project_id::text,
  add column if not exists action text,
  add column if not exists before_data jsonb,
  add column if not exists after_data jsonb,
  add column if not exists changed_by uuid,
  add column if not exists changed_email text;

-- 열람은 admin 만. 쓰기는 SECURITY DEFINER 트리거 함수만 수행하므로 클라이언트용 쓰기 정책은 만들지 않는다.
create policy project_history_admin_read on public.project_history
  for select to authenticated
  using (public.current_app_role() = 'admin');

create or replace function public.log_project_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  begin
    insert into public.project_history(project_id, action, before_data, after_data, changed_by, changed_email)
    values (
      coalesce(new.id, old.id),
      tg_op,
      case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
      case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
      auth.uid(),
      auth.jwt() ->> 'email'
    );
  exception when others then
    raise warning 'log_project_change failed: %', sqlerrm;
  end;
  return coalesce(new, old);
end;
$function$;

create trigger log_project_change
  after insert or update or delete on public.projects
  for each row execute function public.log_project_change();
