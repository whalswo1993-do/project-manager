-- sites에 고객사 컬럼 추가 (앱은 이 컬럼이 없어도 이름 규칙으로 동작한다)
alter table public.sites
  add column if not exists customer text not null default 'SK on'
  check (customer in ('SK on', 'Samsung SDI', 'Hyundai'));

update public.sites set customer = 'Samsung SDI' where name like 'SDI %';
update public.sites set customer = 'Hyundai'     where name like '현대 %';
