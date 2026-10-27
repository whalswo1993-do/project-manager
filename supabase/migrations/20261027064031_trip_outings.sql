-- 출장자 관리: 프로젝트 외 일정(CS 대응·고객사 대응·테스트 등 어디에 가 있는지) 지원
-- 상태: 2026-10-27 운영 DB에 적용함(서버 기록 버전 20261027064031, 이름 trip_outings). 사용자가 SQL 확인 후 직접 적용 지시.
-- 영향: trip_absences 에 장소 칸(location)을 더하고, 종류(kind) 허용 값에 cs·customer·test 를 추가한다.
--       기존 행·정책은 그대로이며 기존 종류(trip·leave·training·other)도 그대로 쓴다.
-- 되돌리기: 맨 아래 "롤백" 구간 (cs·customer·test 행이 있으면 먼저 지워야 한다).

alter table public.trip_absences add column if not exists location text;

alter table public.trip_absences drop constraint if exists trip_absences_kind_check;
alter table public.trip_absences add constraint trip_absences_kind_check
  check (kind in ('trip','leave','training','other','cs','customer','test'));

-- 롤백:
--   delete from public.trip_absences where kind in ('cs','customer','test');
--   alter table public.trip_absences drop constraint trip_absences_kind_check;
--   alter table public.trip_absences add constraint trip_absences_kind_check check (kind in ('trip','leave','training','other'));
--   alter table public.trip_absences drop column location;
