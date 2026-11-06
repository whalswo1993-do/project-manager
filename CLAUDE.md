@AGENTS.md

# Claude Code 전용 메모

공통 규칙(스택, 명령어, 배포, DB 규칙, 협업 규칙)은 위 `AGENTS.md`가 원본이다. 여기에는 Claude Code에만 해당하는 내용만 둔다.

## 화면 점검
- Claude Code 앱의 `vite-dev` 프리뷰(`.claude/launch.json`, 5173 포트)로 개발 서버를 띄우고 내장 브라우저로 확인한다.
- 로그인 이후 화면은 실제 서버 계정이 있어야 볼 수 있다(가짜 테스트 계정은 제거됨). 로그인·회원가입·비밀번호 재설정 화면은 내장 브라우저로 비로그인 상태에서 확인한다(비밀번호를 채팅에서 받지 않는다).
- **로그인 후 화면은 ego lite(`ego-browser` 스킬)로 점검한다.** 사용자가 ego lite에서 로그인해 둔 세션으로 운영 앱(`https://project-manager-rho-nine.vercel.app`)을 열어 본다. 배포 후 운영 URL에서 확인하며, `localhost`는 origin이 달라 세션이 없다. 세션이 만료되면 사용자에게 다시 로그인을 부탁한다.
  - 실행: `ego-browser skill`로 가이드 확인 → Git Bash에서 `ego-browser nodejs <<'EOF' ... EOF`(PowerShell은 따옴표 문제). 작업 공간은 `taskSpace("project-manager check")` 하나를 재사용하고 끝나면 `task.finish({ keep: [] })`.
  - **운영 데이터이므로 읽기·레이아웃 확인만 한다.** 저장·삭제·배정 같은 쓰기 클릭은 하지 않는다.
  - 표가 큰 화면(출장자 일 단위 등)은 `snapshot()` 출력이 매우 길다. `screenshot({ path })` 또는 `page.evaluate`로 필요한 값만 뽑는다.
- 창이 가려져 있으면 스크린샷이 실패한다. 그때는 `get_page_text`, `javascript_exec`, 콘솔 오류 수집으로 점검한다.

## 커넥터(MCP)와 권한
- Supabase 커넥터: 스키마 조회(`list_tables`, `execute_sql` 읽기), `get_advisors`는 사용 가능. **운영 DB를 바꾸는 호출(`apply_migration`, 쓰기 SQL)은 자동 권한 검사기가 막을 수 있다.** 사용자가 대화에서 "직접 적용해줘"라고 명시하면 허용됐다(2026-10-14 확인). 그래도 막히면 우회하지 말고 `supabase/pending/`(로컬 전용)에 SQL을 준비해 두고 사용자에게 적용 방법을 안내한다.
- 쓰기를 검증할 때는 `do $$ ... raise exception ... $$` 블록으로 롤백되는 시뮬레이션을 쓴다(역할마다 서브트랜잭션, `set local role authenticated` + `request.jwt.claims`). 적용 전후로 같은 시뮬레이션을 돌려 비교한다.
- Vercel 커넥터: 현재 팀 `whalswo1993-5770`에 대해 403이 난다(연결 시 승인 범위 문제). 대신 CLI(`vercel ls`, `vercel inspect`, `vercel env ...`)를 쓴다. 실행 방법은 `AGENTS.md`의 "CLI 사용 시 주의" 참고.
- Claude 응답/사용자 응답은 한국어로 한다.
