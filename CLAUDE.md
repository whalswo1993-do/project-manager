# TW Project Manager (project-manager)

TW 프로젝트 관리 웹앱. 이전에 Antigravity(Gemini)로 개발했고 이후 Claude Code로 이어서 작업한다. 사용자 응답은 한국어로 한다.

## 스택
- React 19 + Vite 8 (JavaScript, `.jsx`), PWA(`vite-plugin-pwa`)
- 백엔드: Supabase (`@supabase/supabase-js`) — 클라이언트는 `src/supabase.js`
- AI: Google Gemini (`@google/generative-ai`) — `App.jsx`, `IssueManagement.jsx`, `Quotations.jsx`에서 클라이언트 직접 호출
- 내보내기: `exceljs`, `xlsx`, `pptxgenjs` / 차트: `chart.js`
- 배포: Vercel (GitHub `main` push 연동). `vercel.json`에서 `gh-pages` 브랜치 자동 배포는 꺼져 있음

## 명령어
```
npm run dev       # 개발 서버 (vite)
npm run build     # 프로덕션 빌드 → dist/  (코드 수정 후 반드시 실행해 확인)
npm run lint      # eslint — 기존 오류가 많이 쌓여 있음(약 240건). 새로 건드린 파일에서 오류를 늘리지 않는 것을 기준으로 한다
npm run preview   # 빌드 결과 미리보기
```
빌드 시 PowerShell에서 `NativeCommandError`가 보여도 Vite 경고(stderr)일 뿐이다. 마지막에 `✓ built` 가 나오면 성공.

## 환경변수 (`.env.local`, git 제외)
`.env.example` 참고.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` — 미설정 시 `src/supabase.js`의 하드코딩 기본값(publishable key)으로 동작
- `VITE_GEMINI_API_KEY` — 미설정 시 AI 기능(일일보고/이슈/견적 분석)만 동작 안 함

`VITE_` 접두사 변수는 번들에 그대로 포함되어 브라우저에 노출된다. 비밀 키(service_role 등)는 절대 `VITE_`로 넣지 않는다.

## 구조 (src/)
- `App.jsx`(약 200KB) — 메인 앱 셸/프로젝트·일정 관리. 매우 큼, 수정 시 필요한 구간만 읽을 것
- `IssueManagement.jsx`, `IntegratedIssueCenter.jsx` — 이슈 관리/통합 이슈 센터
- `ManpowerManagement.jsx` — 인력/공사일보
- `Quotations.jsx`, `VisionSPC.jsx`, `SmartProjectSelector.jsx`
- `authService.js`, `Login.jsx`, `PasswordChangeModal.jsx` — 인증/권한
- `issueService.js`, `masterPlanParser.js`, `reportExports.js`, `export*.js` — 서비스/파서/내보내기
- 권한별 기능 가이드 pptx는 `generate_permissions_presentation.js`로 생성

## 연결된 서비스 (로그인/연결 완료)
- GitHub: `https://github.com/whalswo1993-do/project-manager` (public, 브랜치 `main`). `gh` CLI 로그인됨(계정 `whalswo1993-do`)
- Vercel: 팀 `whalswo1993-5770`, 프로젝트 `project-manager`, 프로덕션 `https://project-manager-rho-nine.vercel.app`. GitHub `main` push 시 자동 배포. 폴더는 `vercel link`로 연결됨(`.vercel/`, git 제외)
- Supabase: 프로젝트 `Project-manager`, ref `tebtuzxafkymlplmlhzu`, 리전 ap-northeast-2. `supabase/`는 `supabase link`로 연결됨

## CLI 사용 시 주의 (Windows)
- Supabase CLI는 전역 설치가 안 되므로 `npx supabase ...`로 실행한다.
- 이 PC 이름에 한글이 있어 **Vercel CLI가 `Cannot convert argument to a ByteString` 오류**를 낸다. 실행 전에 `os.hostname()`을 영문으로 바꾸는 Node 프리로드를 걸어야 한다:
  1. `ascii-hostname.cjs` 파일에 `require('os').hostname = () => 'tw-pc';` 작성
  2. `$env:NODE_OPTIONS = '--require "C:/경로/ascii-hostname.cjs"'` 설정 후 `vercel ...` 실행
- `vercel env pull`은 실행할 때마다 `.gitignore` 끝에 `.env*`를 덧붙인다. 그러면 `.env.example`이 다시 제외되므로, `.gitignore` 맨 끝의 `!.env.example` 줄이 `.env*` 뒤에 오도록 유지한다.
- `.env.local`에는 Vercel 프로덕션 환경변수(Gemini 키 포함)가 들어 있다. 절대 커밋하지 않는다.
- PowerShell에서 CLI의 stderr 경고가 `NativeCommandError`로 보여도 실제 실패가 아닌 경우가 많다. 결과 메시지를 확인할 것.
- Docker가 없어 `supabase db pull/dump`는 사용 불가. 스키마 확인은 Supabase 커넥터(MCP)나 대시보드의 SQL Editor를 쓴다.

## 작업 원칙
- 코드 수정 후 `npm run build`로 검증하고, 실패하면 보고 전에 원인을 고친다.
- 커밋 메시지는 기존 스타일(`feat:`, `fix:` 접두사 + 영문 요약)을 따른다.
- 작업이 끝나고 빌드가 통과하면 커밋 후 `main`에 push한다(사용자가 "로컬로만"이라고 하지 않는 한). Vercel이 push를 감지해 자동 배포하므로 별도 `npm run deploy`(gh-pages)는 하지 않는다 — `vercel.json`에서 gh-pages 배포는 꺼져 있고 `vite.config.js`의 `base`가 `/`라 서브경로 Pages 배포와 맞지 않는다.
- push 전에 `git status`로 의도하지 않은 파일(.env, 대용량 pptx/xlsx 등)이 섞이지 않았는지 확인한다.
- 배포 후에는 Vercel 배포 URL/상태를 확인해 함께 보고한다.
- DB 스키마/RLS 변경은 적용 전에 SQL을 먼저 보여주고 확인받는다. 스키마(테이블/RLS 정의)는 아직 저장소에 없다. `supabase/`에는 연결 설정(`config.toml`)만 있고 migrations는 비어 있다.
