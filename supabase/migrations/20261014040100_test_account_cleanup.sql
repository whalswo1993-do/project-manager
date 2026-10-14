-- [적용 완료: 2026-10-14 사용자가 Supabase SQL Editor 에서 실행 — 서버의 migrations 기록에는 남지 않음]
-- 테스트 계정은 test3 하나만 남기고, 실제 서버 계정으로 운영 (⚠ 계정 삭제 포함 — 010 적용·앱 배포 후 실행)
--
-- 왜: 앱의 테스트 계정(test1~3)은 비밀번호가 공개 소스에 하드코딩된 "브라우저 안의 가짜 로그인"이었다.
--     서버 세션이 없어 DB 에 접근할 수 없었고, 누구나 화면에서 grade3 로 "로그인"할 수 있었다.
--     앱에서 가짜 로그인 코드를 제거했으므로, test3 는 일반 계정과 똑같이 Supabase 로그인으로만 들어간다.
--
-- 이 파일이 하는 일
--   * test1, test2 계정 삭제 (프로필은 FK cascade)
--   * test3: 이메일 인증 완료 처리, 역할 grade3(앱에서 정의하던 PM 권한), 이름/팀 설정
--   * test3 의 기존 비밀번호 무효화 (코드에 공개돼 있던 값 사용 불가). 아래 "비밀번호 설정"을 직접 실행해야 로그인할 수 있다.
--
-- 롤백: 삭제된 계정은 복구되지 않는다(테스트 계정이라 데이터 없음). test3 역할을 낮추려면
--   update public.profiles set role = 'grade1' where lower(email) = 'test3@twgroup.co.kr';

delete from auth.users where lower(email) in ('test1@twgroup.co.kr', 'test2@twgroup.co.kr');

update auth.users
   set encrypted_password = extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
       email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) = 'test3@twgroup.co.kr';

update public.profiles
   set role = 'grade3', name = '테스트3', team = 'PM팀', active = true
 where lower(email) = 'test3@twgroup.co.kr';

-- ─────────────────────────────────────────────────────────────────────────────
-- 비밀번호 설정 (직접 실행): 아래 줄의 '원하는비밀번호'를 강한 비밀번호로 바꿔서 SQL Editor 에서 실행한다.
-- 채팅/코드/저장소에는 절대 적지 말 것.
--
--   update auth.users
--      set encrypted_password = extensions.crypt('원하는비밀번호', extensions.gen_salt('bf'))
--    where lower(email) = 'test3@twgroup.co.kr';
-- ─────────────────────────────────────────────────────────────────────────────
