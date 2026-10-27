-- 출장자 관리: grade2 는 조회만, 수정은 admin·grade3·grade2_5
create or replace function public.trip_can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin','grade3','grade2_5'), false) $$;

create or replace function public.trip_can_view()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(public.current_app_role() in ('admin','grade3','grade2_5','grade2'), false) $$;

do $$
declare t text;
begin
  foreach t in array array['trip_members','trip_assignments','trip_project_notes','trip_absences'] loop
    execute format('drop policy %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.trip_can_view())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.trip_can_edit())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.trip_can_edit()) with check (public.trip_can_edit())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.trip_can_edit())', t || '_delete', t);
  end loop;
end $$;

grant execute on function public.trip_can_edit() to authenticated;
