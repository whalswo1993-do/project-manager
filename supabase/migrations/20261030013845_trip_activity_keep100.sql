-- 작업 기록을 최근 100건만 남긴다: 새 기록이 들어올 때마다 오래된 것부터 지운다.
create or replace function public.trip_activity_trim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.trip_activity
  where id in (select id from public.trip_activity order by at desc, id desc offset 100);
  return null;
end $$;
revoke all on function public.trip_activity_trim() from public, anon, authenticated;

drop trigger if exists trip_activity_trim on public.trip_activity;
create trigger trip_activity_trim after insert on public.trip_activity
for each statement execute function public.trip_activity_trim();
