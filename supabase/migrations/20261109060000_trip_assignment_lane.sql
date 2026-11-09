-- 출장자 배정의 칸(줄) 번호: 막대를 끌어다 놓은 칸을 기억한다. null 이면 자동 배치(앞칸부터).
alter table public.trip_assignments add column if not exists lane smallint check (lane is null or lane >= 0);
