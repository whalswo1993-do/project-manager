# TW Project Manager — 공용 에이전트 규칙

TW 프로젝트 관리 웹앱. **Claude Code**(`CLAUDE.md`)와 **Antigravity/Gemini**(`GEMINI.md`)가 같은 폴더·같은 저장소에서 함께 작업한다.
이 파일이 두 도구의 **공통 규칙 원본**이다. 규칙을 바꿀 때는 여기만 고친다. 사용자 응답은 한국어로 한다.

## 스택
- React 19 + Vite 8 (JavaScript, `.jsx`), PWA(`vite-plugin-pwa`)
- 백엔드: Supabase (`@supabase/supabase-js`) — 클라이언트는 `src/supabase.js`
- AI: Gemini(브라우저 직접 호출) + Claude(Vercel 서버 함수 경유) — `src/ai.js`가 단일 진입점
- 내보내기: `exceljs`, `xlsx`, `pptxgenjs` / 차트: `chart.js`
- 배포: Vercel (GitHub `main` push 시 자동 배포)

## 여러 도구가 함께 작업하는 규칙 (중요)
같은 작업 폴더를 공유하므로 서로의 작업을 덮어쓰지 않도록 지킨다.
1. **작업 시작 전** `git status`와 `git pull --rebase origin main`으로 상태를 확인한다. 내가 만들지 않은 미커밋 변경이 있으면 다른 도구가 하던 작업이니 **되돌리거나 덮어쓰지 말고** 사용자에게 알린다.
2. **같은 파일을 두 도구가 동시에 수정하지 않는다.** 도구를 바꾸기 전에 하던 작업을 커밋(또는 사용자에게 상태 보고)한다.
3. 작업은 **작은 단위로 커밋**한다. 커밋 메시지는 기존 스타일(`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:` + 영문 요약).
4. 커밋 전 `git status`로 의도하지 않은 파일(`.env*`, 대용량 pptx/xlsx, `supabase/pending/`, `supabase/snapshots/`)이 섞이지 않았는지 확인하고, `git add .`/`git add -A` 대신 **파일을 지정해서** 추가한다.
5. 줄바꿈(CRLF/LF) 경고는 `.gitattributes`가 정리한다. 줄바꿈만 바꾸는 대량 diff를 만들지 않는다.

## 명령어
```
npm run dev       # 개발 서버 (vite). 서버 함수(api/)는 동작하지 않는다 — 시험은 `vercel dev`
npm run lint      # eslint — 오류 0건 유지(경고 19건: React 훅 권고)
npm test          # vitest — 분석 함수/마스터플랜 파서/AI 라우팅/서버 API 회귀 테스트
npm run build     # 프로덕션 빌드 → dist/
```
**검증 순서:** `npm run lint`(오류 0, 특히 `no-undef`) → `npm test` → `npm run build` → 필요하면 화면 확인.
- 빌드와 테스트는 **"정의되지 않은 변수"를 잡지 못한다**(함수가 호출될 때만 터진다). 변수·state를 지울 때는 그 setter/참조가 다른 곳에서 쓰이는지 린트의 `no-undef`로 반드시 확인한다. (실제로 `setCollapsedSections` 삭제 사고를 린트가 잡았다.)
- 분석/파서 로직(`utils.js`, `masterPlanParser.js`)을 바꾸면 `tests/`의 스냅샷이 달라진다. **의도한 변경인지 diff를 리뷰한 뒤에만** `npx vitest run -u`로 갱신한다.
- PowerShell에서 CLI의 stderr 경고가 `NativeCommandError`로 보여도 실제 실패가 아닌 경우가 많다. 결과 메시지를 확인한다. 빌드는 `✓ built`가 나오면 성공.

## 환경변수 (`.env.local`은 git 제외, 견본은 `.env.example`)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` — 미설정 시 `src/supabase.js`의 기본값(publishable key)으로 동작
- `GEMINI_API_KEY`(서버 전용, Secret), `GEMINI_MODEL` — Gemini 서버 경유 호출용. **이게 운영의 정식 경로다.**
- `VITE_GEMINI_API_KEY` — 브라우저용 Gemini 키. 번들에 노출되므로 **안전망/로컬 개발 전용**이다. 서버 경로가 검증되면 Vercel에서 제거하고 키를 교체(rotate)한다.
- `VITE_AI_PROVIDER` — `auto`(기본: Gemini 먼저, 실패 시 Claude) | `gemini` | `claude`
- `ANTHROPIC_API_KEY`(서버 전용), `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` — Claude 설정. **Vercel 환경변수에만** 등록한다

`VITE_` 접두사 변수는 번들에 그대로 포함되어 브라우저에 노출된다. 비밀 키(service_role, Anthropic 키 등)는 절대 `VITE_`로 넣지 않는다. `.env.local`에는 Vercel 프로덕션 환경변수가 들어 있으니 커밋하지 않는다.

## AI 호출 구조 (Gemini + Claude)
- 앱의 모든 AI 분석(마스터플랜 판독, 일보 구조화, 이슈 통합분석 PPT)은 `src/ai.js`의 `generateAIText()` 하나를 거친다. (견적서는 AI를 쓰지 않는다 — 아래 "견적서 파서" 참고) **새 AI 기능도 반드시 이걸 쓰고**, `@google/generative-ai`나 Anthropic SDK를 컴포넌트에서 직접 부르지 않는다.
- Gemini 경로: ① `/api/gemini`(서버, 키가 브라우저에 없음) → ② 서버를 쓸 수 없을 때만(키 미설정·서버 로그인 없음·개발 서버·413) 브라우저 키(`VITE_GEMINI_API_KEY`)로 직접 호출. 서버가 429 등 실제 Gemini 오류를 주면 같은 키/한도이므로 직접 재시도하지 않는다.
- `auto`: Gemini 성공 시 그대로 사용. Gemini 실패 시 `/api/claude`(Vercel 서버 함수)로 재시도. Claude가 미설정/비로그인/개발서버이면 Gemini의 원래 오류를 그대로 보여준다(호출부의 429·403 안내 문구 유지).
- `api/gemini.js`·`api/claude.js`(엔드포인트, 골격은 `api/_lib/handler.js`) → `api/_lib/auth.js`(Supabase 로그인 검증: `current_app_role()`이 null이 아니어야 통과) → `api/_lib/gemini.js` / `api/_lib/claude.js`(각 SDK). 기본 모델 `claude-sonnet-5-5`(`ANTHROPIC_MODEL`로 변경), 스트리밍, refusal 서버 fallback(Haiku 제외).
- Gemini 구독이 끝나면 `VITE_AI_PROVIDER=claude`로 바꾼다.
- Gemini 서버 모듈 점검: `node --env-file=.env.local scripts/gemini-smoke.js` (로컬 `.env.local`의 키 사용, 값은 출력하지 않음)
- Claude 연결 점검: `$env:ANTHROPIC_API_KEY = '...'; node scripts/claude-smoke.js` (실제 API를 한 번 호출해 키/모델/요청 형태를 확인. 끝나면 `Remove-Item Env:ANTHROPIC_API_KEY`). Vercel 환경변수는 `vercel env add ANTHROPIC_API_KEY production`으로 등록하고 **재배포해야 반영된다.**
- 요청 본문 한도 약 4.5MB(Vercel). Claude 경로에서 큰 PDF/이미지(base64 약 3MB 초과)는 413이 날 수 있다.

## 견적서 파서 (`src/quotationParser.js`)
- 견적조회 등록은 AI 없이 규칙으로 분석한다. 엑셀 파일 첨부 또는 **시트별 표 붙여넣기**(견적서 시트, 상세 리스트 시트를 각각)를 받아 저장 전 미리보기 → 저장. 원본 파일은 브라우저에서만 읽고 서버에 올리지 않는다.
- **특정 셀 주소에 의존하지 않는다.** 머리글(Item / Q'ty / Unit Price [KRW] …)이 있으면 그걸로, 없으면 `수량×단가=금액`이 성립하는 숫자 열 3개를 앵커로 잡고 글자 열은 상대 위치로 찾는다. 금액은 KRW 열만 쓴다.
- 회사 양식의 수량은 서식 `\(General\)` 때문에 "(4)"로 보인다 → 수량은 괄호를 음수로 보지 않는다(`toQty`).
- 검증: 행별 수량×단가=금액, 상세 블록 품목 합=총계, 견적 소계, 상세 블록 총계 ↔ 견적 라인 단가(여러 블록 합 포함). 제목은 파일명이 아니라 내용의 "프로젝트 명".
- 실제 견적서로 점검: `node scripts/quotation-check.js "<견적서 폴더>" [--items]` — 파일 첨부와 4가지 드래그 범위 붙여넣기 결과가 같은지까지 확인한다. **실제 견적서/금액은 공개 저장소에 넣지 않는다**(테스트는 가짜 데이터).

## 표 붙여넣기 / 파일 첨부 입력 (`src/PasteZone.jsx`)
- DRM 보안 때문에 파일 첨부가 안 되는 문서가 많아서 **표 붙여넣기가 주된 입력 방법**이다. 그래서 작은 입력칸이 아니라 색이 있는 큰 칸(`PasteZone`)으로 눈에 띄게 하고(키캡 `Ctrl` `V`가 보이는 점선 칸), 파일 첨부는 옆의 보조 버튼으로 둔다(`PasteEntry`로 한 줄/세로 배치).
- 마스터 스케줄·공사일보(작업표/공수표)·견적·Vision SPC가 모두 이걸 쓴다. **새 업로드/붙여넣기 화면도 일반 `<textarea>`를 직접 만들지 말고 `PasteEntry` + `PasteZone`을 쓴다.** 붙여넣기 처리는 화면마다 달라서 기존 핸들러를 `onPaste`/`onInput`으로 그대로 넘긴다.
- 구현 주의: 눈에 보이는 영역 위에 **투명한 textarea**를 덮어서 클릭 → Ctrl+V, 마우스 오른쪽 → 붙여넣기가 되게 했다. `index.css`가 모든 textarea의 배경·테두리·포커스 링을 `!important`로 덮으므로 투명 처리는 `PasteZone.css`의 더 구체적인 선택자로 한다. 붙여넣기 직전에 textarea 값을 비우고(Vision SPC는 값을 읽는다), 타이핑은 무시한다.
- 비활성(프로젝트 미선택·권한 없음)일 때는 `disabledReason`으로 이유를 칸 안에 보여준다. 줄바꿈이 문제되는 좁은 헤더 안에서는 `PasteEntry wrap={false}`.
- 화면을 로그인 없이 점검하는 방법은 위 "디자인 시스템"의 마지막 항목 참고(헤드리스 Edge로 라이트/다크 캡처).

## 디자인 시스템 (2026-10 개편: 라이트 = Atelier, 다크 = Obsidian)
- **색·반경·글꼴은 `src/index.css`의 토큰이 정의한다.** 라이트(종이 톤 `#F6F5F2` · 브랜드 블루 `#0B57A4`)와 다크(그라파이트 `#09090A` · 샴페인 골드 `#CDAE72`)는 같은 토큰 이름을 다른 값으로 가진다. 새 화면은 **색을 직접 쓰지 말고** `var(--ink)`, `var(--surface)`, `var(--line)`, `var(--brand)`, `var(--ok|warn|bad|signal|teal)`와 그 연한 배경(`--brand-wash` 등)을 쓴다. 예전 이름(`--bg-card`, `--text-primary`, `--accent` …)은 별칭으로 남아 있다.
- **단 하나의 강조색**(라이트 파랑/다크 골드)만 쓴다. 주 버튼은 `var(--btn-bg)`/`var(--btn-ink)`(라이트 잉크, 다크 골드), 색 채운 면 위의 글자는 `var(--on-brand)`. 그라데이션·네온·그림자·hover 때 떠오르는 효과를 쓰지 않는다. 그림자는 모달/팝오버만(`--shadow-lg/xl`).
- **둥근 사각형을 줄인다.** 반경 토큰: 배지·막대 `--radius-xs`(2px), 칩 `--radius-sm`(3px), 버튼·입력·카드·표 `--radius-md`(4px), 팝오버·붙여넣기 칸 `--radius-lg`(6px), 모달 `--radius-xl`(8px). 진짜 원형(점·아바타·스위치)만 `--radius-pill`. 상자 안에 상자를 겹치지 말고 선(`--line`)과 여백으로 나눈다. 선택 탭은 알약 대신 **밑줄**, 필터 묶음은 **선으로 나눈 한 줄**(활성은 `--btn-bg`).
- **이모지를 쓰지 않는다.** `src/icons.jsx`의 `<Icon name="calendar" size={16} />`(선 아이콘)을 쓰고, 없으면 거기에 추가한다. 글자 안에 넣을 때는 `size="1.1em"`. `<option>` 안에는 아이콘/요소를 넣을 수 없다(글자만).
- 글꼴: 본문 Pretendard Variable, 숫자·코드·영문 소제목은 `var(--font-mono)`, 큰 숫자는 `var(--font-display)`(다크는 세리프). 영문 소제목은 `.eyebrow`. 숫자는 기본으로 같은 폭(tabular).
- 화면 구조: 상단 한 줄(로고·시스템 메뉴·테마·사용자 메뉴) + 고객사 줄 + 조회 연도 줄 + 화면 머리말(`.system-sticky-header`: 영문 소제목·제목·설명·작업 버튼) + 밑줄 하위 메뉴(`.system-sub-nav`). 사용자 메뉴(`HeaderUserMenu`)에 캐시 새로고침·비밀번호 변경·로그아웃·사용자 권한 관리가 모여 있다.
- 로그인 전 화면(`Login`)에는 내부 프로젝트 이름을 넣지 않는다(왼쪽 장식은 가짜 막대/코드).
- 인라인 `style={{}}`의 색도 같은 규칙이다. `Chart.js`/canvas처럼 CSS 변수를 못 읽는 곳만 실제 색 값을 쓴다.
- 화면 점검(로그인 없이): 가짜 Supabase를 끼운 로컬 데모 환경을 쓴다. 저장소에는 올리지 않는 `ui-demo/`(`.git/info/exclude`)에 Vite 설정(`./supabase` 별칭 교체)과 헤드리스 Edge 캡처 도구가 있었다. 필요하면 같은 방식으로 다시 만든다.

## 구조
- `src/App.jsx`(약 200KB) — 메인 앱 셸/프로젝트·일정 관리. 매우 크니 필요한 구간만 읽을 것
- `src/icons.jsx`(선 아이콘), `src/HeaderUserMenu.jsx`(상단 사용자 메뉴) — 공통 UI 부품
- `src/PasteZone.jsx`(+`.css`) — 표 붙여넣기 칸/파일 첨부 배치 공통 컴포넌트
- `src/IssueManagement.jsx`(공사일보), `IntegratedIssueCenter.jsx`(이슈 센터), `ManpowerManagement.jsx`(공수), `Quotations.jsx`, `VisionSPC.jsx`, `SmartProjectSelector.jsx`
- `src/authService.js`, `Login.jsx` — 인증/권한. `issueService.js`, `masterPlanParser.js`, `reportExports.js`, `export*.js` — 서비스/파서/내보내기
- `src/ai.js` — AI 단일 진입점. `api/` — Vercel 서버 함수. `tests/` — 회귀 테스트. `supabase/` — 연결 설정과 마이그레이션
- 권한별 기능 가이드 pptx는 `generate_permissions_presentation.js`로 생성

## 배포 (GitHub `main` push → Vercel 자동 배포)
- 작업이 끝나고 검증이 통과하면 커밋 후 `main`에 push한다(사용자가 "로컬로만"이라고 하지 않는 한). 배포 후 Vercel 배포 상태와 URL을 함께 보고한다.
- **`npm run deploy`(gh-pages)는 쓰지 않는다.** `vite.config.js`의 `base`가 `/`라 GitHub Pages 하위 경로(`/project-manager/`)에서는 JS가 404로 깨진다. `gh-pages` 브랜치에는 Vercel 빌드를 끄는 `vercel.json`이 들어 있다. 건드리지 않는다.
- 프로덕션: `https://project-manager-rho-nine.vercel.app` (Vercel 팀 `whalswo1993-5770`, 프로젝트 `project-manager`)

## 연결된 서비스
- GitHub: `https://github.com/whalswo1993-do/project-manager` (public). `gh` CLI 로그인됨(`whalswo1993-do`)
- Vercel: 폴더는 `vercel link`로 연결됨(`.vercel/`, git 제외)
- Supabase: 프로젝트 `Project-manager`, ref `tebtuzxafkymlplmlhzu`, ap-northeast-2. `supabase/`는 `supabase link`로 연결됨

## CLI 사용 시 주의 (Windows)
- Supabase CLI는 전역 설치가 안 되므로 `npx supabase ...`로 실행한다.
- 이 PC 이름에 한글이 있어 **Vercel CLI가 `Cannot convert argument to a ByteString` 오류**를 낸다. 프로젝트 루트에서 `$env:NODE_OPTIONS = '--require ./scripts/ascii-hostname.cjs'`를 설정한 뒤 `vercel ...`을 실행한다.
- 사용자 폴더 이름의 `(주)` 괄호 때문에 `cmd`를 거치는 실행(`npm`을 `runtimeExecutable`로 지정 등)이 실패할 수 있다. 개발 서버는 `node node_modules/vite/bin/vite.js`로 직접 실행한다(`.claude/launch.json` 참고).
- `vercel env pull`은 실행할 때마다 `.gitignore` 끝에 `.env*`를 덧붙인다. 그러면 `.env.example`이 다시 제외되므로 `.gitignore` 맨 끝의 `!.env.example` 줄이 `.env*` 뒤에 오도록 유지한다.
- Docker가 없어 `supabase db pull/dump`는 쓸 수 없다. 스키마 확인은 Supabase 커넥터(MCP) 또는 대시보드 SQL Editor를 쓴다.

## 데이터베이스(Supabase) 작업 규칙
- **DB 스키마/RLS 변경은 적용 전에 SQL을 사용자에게 보여주고 확인받는다.** 운영 DB이며 되돌리기 어렵다.
- 적용한 변경은 서버에 기록된 버전 번호와 같은 이름으로 `supabase/migrations/<version>_<name>.sql` 파일을 저장소에 남겨 서버와 맞춘다.
- 변경 후에는 Supabase advisor(security)로 RLS 경고를 점검한다.
- `supabase/snapshots/`는 특정 시점의 스키마 기록(수정 전 상태 포함)일 뿐이고, **현재 스키마의 정본은 `supabase/migrations/`다.** 공개 저장소이므로 **아직 고치지 않은 취약점 정보는 커밋하지 않는다**(적용 전 SQL은 로컬 `supabase/pending/` 같은 곳에 두고 `.git/info/exclude`로 제외).
- 현재 권한 모델(DB RLS 기준): 조회=활성 사용자 전원 / `projects` 등록·삭제=admin·grade3 / 수정=admin·grade3·grade2(grade2는 트리거로 status·progress 등만) / `project_history`는 admin만 열람. `daily_reports`·`project_issues`는 로그인한 활성 사용자만.
- 남은 알려진 경고(Supabase advisor): `current_app_role()`을 로그인 사용자가 호출 가능(RLS·서버 로그인 검증이 쓰므로 의도적), 유출 비밀번호 보호 꺼짐(요금제 설정).
- **모든 로그인은 Supabase Auth뿐이다.** 예전의 "가짜 테스트 계정" 코드(비밀번호 하드코딩, 브라우저 로컬 세션)는 제거했다. 테스트 계정은 `test3@twgroup.co.kr` 하나만 실제 서버 계정으로 운영하며(역할 grade3), 비밀번호는 저장소·채팅에 적지 않고 관리자가 SQL Editor로 직접 설정한다. 데이터 보호는 화면이 아니라 DB의 RLS 정책이 담당한다.
- 사용자 정보의 정본은 DB `profiles`다: `name`, `team`, `role`, `active`, `last_sign_in_at`, `last_active_at`. 브라우저 로컬 저장소에 이름/팀/삭제 목록/접속 기록을 두지 않는다(컴퓨터마다 달라지는 원인이었다).
- 회원가입의 이름·소속팀은 **필수**이며 두 겹으로 강제한다: 화면(`validateSignupProfile`)과 DB 트리거(`handle_new_user`, 최고 관리자 생성만 예외). 접속 기록은 `record_my_access` RPC, 계정 영구 삭제는 `admin_delete_user` RPC(최고 관리자만)로 한다.
- 위 구조는 `supabase/migrations/20261014040000_*`, `20261014040100_*`로 적용돼 있다(사용자가 SQL Editor로 실행했기 때문에 서버의 migrations 기록에는 없다). **앱 코드가 새 컬럼·RPC에 의존하므로 DB 변경은 항상 앱 배포보다 먼저 적용한다.**
- 사용자가 SQL Editor로 직접 적용하는 방식은 자동 권한 검사기가 `apply_migration`을 막을 때의 대안이다. Claude Code의 권한 규칙은 사용자가 직접 설정해야 한다(에이전트는 자신의 권한 설정을 바꾸지 않는다).
