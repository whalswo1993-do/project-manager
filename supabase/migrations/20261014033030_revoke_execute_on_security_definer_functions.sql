-- Applied to production via the Supabase connector on 2026-10-14.
-- public 스키마의 SECURITY DEFINER 함수를 비로그인(anon)/로그인 사용자가 /rest/v1/rpc/* 로 직접 호출할 수 없게 한다.
-- 트리거/이벤트 트리거 함수는 CREATE TRIGGER 시점에만 EXECUTE 권한을 확인하므로 회수해도 트리거는 계속 동작한다.
--
-- 적용 후 검증: advisor 0028(anon 호출 가능) 6건 → 0건, 0029(로그인 사용자 호출 가능) 6건 → 1건(current_app_role, 의도적 유지).
--   anon 의 rpc 호출은 401/404, 로그인 사용자의 조회(projects 15행, daily_reports 212행)는 그대로 정상.
--
-- Rollback:
--   grant execute on function public.handle_new_user(), public.log_project_change(), public.restrict_grade2_project_update(),
--     public.make_daily_backup(), public.rls_auto_enable(), public.current_app_role() to anon, authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_project_change() from public, anon, authenticated;
revoke execute on function public.restrict_grade2_project_update() from public, anon, authenticated;
revoke execute on function public.make_daily_backup() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- current_app_role() 은 RLS 정책과 api/_lib/auth.js 가 로그인 사용자 권한으로 호출하므로 authenticated 는 유지, 비로그인만 차단
revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;
