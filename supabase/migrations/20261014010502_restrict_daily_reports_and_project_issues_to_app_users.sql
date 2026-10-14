-- Applied to production via the Supabase connector on 2026-10-14.
-- daily_reports / project_issues were open to role `public` (anonymous) with USING (true).
-- Restrict them to signed-in, active app users.
--
-- Rollback (restores the old, insecure state — only use in an emergency):
--   drop policy daily_reports_app_users on public.daily_reports;
--   create policy "Enable all actions for all users" on public.daily_reports for all to public using (true) with check (true);
--   drop policy project_issues_app_users on public.project_issues;
--   create policy "Enable all actions for all users" on public.project_issues for all to public using (true) with check (true);

drop policy "Enable all actions for all users" on public.daily_reports;
create policy daily_reports_app_users on public.daily_reports for all to authenticated
  using (public.current_app_role() is not null) with check (public.current_app_role() is not null);

drop policy "Enable all actions for all users" on public.project_issues;
create policy project_issues_app_users on public.project_issues for all to authenticated
  using (public.current_app_role() is not null) with check (public.current_app_role() is not null);
