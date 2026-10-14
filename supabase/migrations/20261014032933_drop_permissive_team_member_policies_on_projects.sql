-- Applied to production via the Supabase connector on 2026-10-14.
-- projects 에는 역할 기반 정책(projects_read/insert/update/delete)과 별개로 `true` 조건의 정책 4개가 있어
-- permissive 정책끼리 OR 로 합쳐지며 등급 제한(grade1 읽기 전용 등)을 DB 수준에서 무력화하고 있었다.
-- 앱의 권한 모델(등록/삭제: admin·grade3, 수정: admin·grade3·grade2, 조회: 활성 사용자)은 역할 기반 정책과 일치한다.
--
-- 적용 후 검증(실제 사용자 권한 시뮬레이션, 롤백됨): grade1 update=0/delete=0/insert=BLOCKED,
--   grade2 update=1/delete=0/insert=BLOCKED, grade3·admin 전부 가능, 전원 조회 15행. (적용 전 grade1 은 update=1/delete=1/insert=ok)
--
-- Rollback (원래의 무제한 상태로 되돌림 — 비상시에만):
--   create policy "team members can add projects"    on public.projects for insert to authenticated with check (true);
--   create policy "team members can delete projects" on public.projects for delete to authenticated using (true);
--   create policy "team members can read projects"   on public.projects for select to authenticated using (true);
--   create policy "team members can update projects" on public.projects for update to authenticated using (true) with check (true);

drop policy "team members can add projects" on public.projects;
drop policy "team members can delete projects" on public.projects;
drop policy "team members can read projects" on public.projects;
drop policy "team members can update projects" on public.projects;
