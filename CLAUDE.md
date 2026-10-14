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
npm run lint      # eslint — 현재 오류 0건, 경고 44건(미사용 변수, React 훅 권고). 오류가 생기면 고치고, 경고는 건드린 코드에서만 줄인다
npm test          # vitest — 분석 함수/마스터플랜 파서/AI 라우팅/서버 API 회귀 테스트(68개). 리팩터링 전후로 반드시 실행
npm run preview   # 빌드 결과 미리보기
```
**리팩터링 검증 순서:** `npm run lint`(오류 0 필수, 특히 `no-undef`) → `npm test` → `npm run build` → 필요하면 화면 확인.
빌드와 테스트는 "정의되지 않은 변수"를 잡지 못한다(함수가 호출될 때만 터짐). 변수/state를 지울 때는 그 setter·참조가 다른 곳에서 쓰이는지 린트의 `no-undef`로 반드시 확인한다.
화면 확인은 Claude Code 앱의 `vite-dev` 프리뷰(`.claude/launch.json`)로 하고, 로컬 개발 서버에서만 `DEFAULT_TEST_ACCOUNTS`(authService.js)의 테스트 계정으로 로그인한다. 이 계정은 서버 세션이 없어 DB 데이터는 비어 보이고 401이 두 건 찍히는 것이 정상이다.

빌드 시 PowerShell에서 `NativeCommandError`가 보여도 Vite 경고(stderr)일 뿐이다. 마지막에 `✓ built` 가 나오면 성공.

## 환경변수 (`.env.local`, git 제외)
`.env.example` 참고.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` — 미설정 시 `src/supabase.js`의 하드코딩 기본값(publishable key)으로 동작
- `VITE_GEMINI_API_KEY` — Gemini 키 (브라우저에서 직접 호출)
- `VITE_AI_PROVIDER` — `auto`(기본: Gemini 먼저, 실패 시 Claude) | `gemini` | `claude`
- `ANTHROPIC_API_KEY`(서버 전용), `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` — Claude 설정. Vercel 환경변수에만 등록한다

`VITE_` 접두사 변수는 번들에 그대로 포함되어 브라우저에 노출된다. 비밀 키(service_role, Anthropic 키 등)는 절대 `VITE_`로 넣지 않는다.

## AI 호출 구조 (Gemini + Claude)
- 앱의 모든 AI 분석(마스터플랜 판독, 일보 구조화, 견적서 추출, 이슈 통합분석 PPT)은 `src/ai.js`의 `generateAIText()` 하나를 거친다. 새 AI 기능도 반드시 이걸 쓰고, `@google/generative-ai`나 Anthropic을 컴포넌트에서 직접 부르지 않는다.
- `auto`: Gemini 성공 시 그대로 사용. Gemini 실패 시 `/api/claude`(Vercel 서버 함수)로 재시도. Claude가 미설정/비로그인/개발서버이면 Gemini의 원래 오류를 그대로 보여준다(호출부의 429·403 안내 문구 유지).
- `api/claude.js`(엔드포인트) → `api/_lib/auth.js`(Supabase 로그인 검증: `current_app_role()`이 null이 아니어야 통과) → `api/_lib/claude.js`(Anthropic SDK 호출). 기본 모델 `claude-opus-5-5`, 스트리밍, refusal 서버 fallback 사용(Haiku 제외).
- 서버 함수는 `npm run dev`(vite)에서는 동작하지 않는다. 로컬에서 시험하려면 `vercel dev`를 쓴다.
- 요청 본문 한도 약 4.5MB(Vercel). Claude 경로에서 큰 PDF/이미지(base64 약 3MB 초과)는 413이 날 수 있다.

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
- `gh-pages` 브랜치: 예전 `npm run deploy` 결과물로 `https://whalswo1993-do.github.io/project-manager/`에 아직 서비스 중이다. 그 브랜치에 `vercel.json`(`git.deploymentEnabled: false`)을 넣어 Vercel이 빌드하지 않게 해 두었다. 이 브랜치는 더 이상 갱신하지 않는다(건드릴 일이 없으면 그대로 둔다)
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
- DB 스키마/RLS 변경은 적용 전에 SQL을 먼저 보여주고 확인받는다. Supabase 커넥터(MCP)로 스키마 조회(`list_tables`, `execute_sql`)와 적용(`apply_migration`)이 가능하다. DB를 바꾸면 적용한 버전 번호와 같은 이름으로 `supabase/migrations/<version>_<name>.sql` 파일을 저장소에 남겨 서버와 맞춘다(`list_migrations`로 버전 확인). 변경 후에는 `get_advisors`(security)로 RLS 경고를 점검한다.
