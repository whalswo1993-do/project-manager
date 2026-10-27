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
npm run lint      # eslint — 오류 0건 유지(경고 20건: React 훅 권고)
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
- **시스템별 머리말 배경**(`src/SystemBackdrop.jsx`+`.css`): 헤더 아래 눈금자 + 시스템마다 어울리는 옅은 그림(일정=타임라인, 공수=투입 매트릭스, 이슈=공정 흐름, 공사일보=일력, 견적=원장 표, SPC=분포 곡선)을 `App.jsx`가 `currentView`로 깐다. 순수 장식(`aria-hidden`, `z-index:-1`)이고 색은 토큰이라 라이트/다크가 자동으로 맞는다. 새 시스템을 추가하면 `ARTS`에 그림을 추가한다. **그림 높이는 170 안쪽**(머리말만 있는 화면에서도 아래 상자에 안 가려지게), 글자·값은 장식이므로 가짜/오늘 날짜만 쓴다. 각 시스템 머리말은 같은 구조(`.system-sticky-header`: 영문 소제목·제목·설명·오른쪽 작업)를 쓴다.
- 로그인 전 화면(`Login`)에는 내부 프로젝트 이름을 넣지 않는다(왼쪽 장식은 가짜 막대/코드).
- 인라인 `style={{}}`의 색도 같은 규칙이다. `Chart.js`/canvas처럼 CSS 변수를 못 읽는 곳만 실제 색 값을 쓴다.
- 화면 점검(로그인 없이): 가짜 Supabase를 끼운 로컬 데모 환경을 쓴다. 저장소에는 올리지 않는 `ui-demo/`(`.git/info/exclude`)에 Vite 설정(`./supabase` 별칭 교체)과 헤드리스 Edge 캡처 도구가 있었다. 필요하면 같은 방식으로 다시 만든다.

## 구조
- `src/App.jsx`(약 200KB) — 메인 앱 셸/프로젝트·일정 관리. 매우 크니 필요한 구간만 읽을 것
- `src/icons.jsx`(선 아이콘), `src/HeaderUserMenu.jsx`(상단 사용자 메뉴), `src/SystemBackdrop.jsx`(시스템별 머리말 배경) — 공통 UI 부품
- `src/PasteZone.jsx`(+`.css`) — 표 붙여넣기 칸/파일 첨부 배치 공통 컴포넌트
- `src/IssueManagement.jsx`(공사일보), `IntegratedIssueCenter.jsx`(이슈 센터), `ManpowerManagement.jsx`(공수), `Quotations.jsx`, `VisionSPC.jsx`, `SmartProjectSelector.jsx`
- `src/authService.js`, `Login.jsx` — 인증/권한. `issueService.js`, `masterPlanParser.js`, `reportExports.js`, `export*.js` — 서비스/파서/내보내기
- `src/ai.js` — AI 단일 진입점. `api/` — Vercel 서버 함수. `tests/` — 회귀 테스트. `supabase/` — 연결 설정과 마이그레이션
- 권한별 기능 가이드 pptx는 `generate_permissions_presentation.js`로 생성

## 출장자 관리 (`src/TripManagement.jsx` 외, 2026-10-27 추가)
- 프로젝트 일정에 등록된 프로젝트를 **그대로 가져와서**(별도 PJT 등록 없음) 부서 팀장이 출장자를 배정하고, 부서 인원 상황판과 부족·충돌 경고를 보는 화면. 엑셀 "동시 여러 PJT 발생 시 대응 방안" 관리장표를 대체한다.
- 계획 공수 = 프로젝트의 마스터 플랜 공수(`manpower.departments[부서].daily`)를 주 단위로 바꾼 값(`tripLogic.autoDemands`)이고 **화면에서 고치지 않는다**(공수 조정·수동 공수 기능은 2026-10-27에 뺐다). 기구·비전·제어·전장·소장만 쓰고 외주·안전·SV는 제외한다.
- **B1 비자 확인은 미국 사이트만**: 프로젝트의 Site가 `HSBMA`·`SKBA`·`SKOT`이면(`tripLogic.isUsSite`, 영문·숫자 경계로 비교) 출장자의 B1 보유를 확인해 경고한다. 다른 해외 사이트는 해당 없고, 프로젝트별 "해외 표시" 설정은 없다. 미국 사이트가 늘면 `US_SITES`에 추가한다.
- 완료 시점(`endDate`)이 오늘보다 앞선 프로젝트는 기본으로 숨기고 "지난 프로젝트도 보기"로만 본다. 아무도 배정 안 된 프로젝트는 배정 화면 맨 위 붉은 띠에 띄운다(`assignmentState`).
- **배정 방식(2026-10-27 개편)**: 부서마다 계획 공수의 최대 인원만큼 **칸(줄)**을 만들고, 빈 칸(점선)을 눌러 그 기간에 출장 가능한 사람(가용/비자 없음/충돌 표시)을 고른다. 칸 위치는 DB에 저장하지 않고 배정들을 `layoutLanes`가 계산한다(시작일 → 등록순으로 앞칸부터 채움, 교대 인원은 같은 칸 뒤에 이어짐). 교대는 칸 옆 교대 버튼, 막대 수정창의 "이 출장자 교대", 부서 머리의 "출장자 +"에서 한다(`rotate`: 새 사람 먼저 넣고 나가는 사람 종료일을 줄이며, 실패하면 되돌린다).
- **프로젝트 전체 일 단위**: 일 단위 보기의 "표시"에서 "프로젝트 전체"를 고르면(기본) 일별 칸을 아주 좁혀(`.tr-compact`) 프로젝트 전체를 옆으로 넘겨 본다. 열 때 오늘 칸으로 자동 이동하고 "오늘로 이동" 버튼이 있다. 2~12주 단위 창으로도 볼 수 있다. **마일스톤**은 단계마다 꽉 찬 색(`phaseColors`, 8색, 라이트·다크 별도)으로 머리글에 띠로 나오고 표 위에 범례가 있다.
- **일/주 단위**: 배정은 날짜(일) 단위로 저장하고, 화면 오른쪽 위의 "일 단위/주 단위" 전환이 모든 탭(배정·인원 현황·종합)의 칸을 바꾼다(`buildColumns`). 주 단위의 필요·배정 인원은 그 주에서 하루 기준 가장 큰 값이라(`needForWeek`/`haveForWeek`) 교대로 이어진 두 사람은 1명으로 센다.
- **팀원 관리 탭**: 부서·팀·상태(재직/퇴사) 필터, 오늘 상황, 한 명씩 수정·퇴사/복귀·삭제와 일괄 처리. 배정 기록이 있는 사람은 삭제가 막히므로 퇴사(`active=false`)를 쓴다.
- **엑셀 양식(`tripTemplate.js`)**: "빈 양식 내려받기"와 "현재 명단 내려받기"(**부서별 시트**로 나뉜 같은 양식: 기구·비전·제어·전장·소장 중 인원이 있는 부서만, 시트마다 고쳐서 다시 붙여넣기용. 내 부서가 정해진 팀장은 그 부서 시트만). 머리글이 첫 줄(부서(분야)·소속 팀·이름·직위·등급·B1 비자·상태·비고), 부서/B1/상태는 목록 선택, "(예시)"로 시작하는 이름은 붙여넣을 때 건너뛴다. 붙여넣기는 `planMemberSync`가 기존 명단과 비교해 새로 추가·갱신·팀 이동·퇴사 처리를 미리보기로 보여 주고(표에 없는 재직 인원은 퇴사 후보로만 제시, 기본 체크 해제), 표에 열이 없으면 기존 값을 지키고 열이 있는데 비면 비운다.
- 파일: `TripManagement.jsx`(화면·탭 4개·다른 부서 수정 경고), `TripProjectPicker.jsx`(검색·Site·상태 드롭다운), `TripModals.jsx`(배정·교대·인원·붙여넣기), `tripLogic.js`(주/일 칸·칸 배치·충돌·프로젝트 연동·명단 비교 — 순수 함수, `tests/tripLogic.test.js`·`tests/tripSlots.test.js`), `tripTemplate.js`(엑셀 양식), `tripService.js`(DB 접근·오류 문구, `tests/tripService.test.js`), `TripManagement.css`.
- **부서 시그니처 색**(`TripManagement.css` 맨 아래): `--dept-mechanical|vision|control|electrical|manager` 토큰(라이트/다크 따로)을 `data-dept="키"` 속성으로 `--dc`에 연결한다. 부서를 알아보는 표식(점·띠·이름·요약 띠)에만 쓰고, 충돌·부족 같은 상태는 의미색(`--bad|warn|ok`)을 그대로 쓴다. 새 부서 표시는 `data-dept`만 달면 된다.
- 알려진 한계: 앱 머리말(`.system-header-row`)은 최소 너비 1216px(App.css)이라 좁은 화면에서는 모든 시스템이 가로로 스크롤된다. 출장자 화면만의 문제가 아니다.
- **CSS 주의**: 이 화면의 클래스는 `tr-` 접두사를 붙인다. `board`·`grid`·`day`처럼 흔한 이름을 그대로 쓰면 다른 화면의 전역 CSS(`display:grid` 등)와 겹쳐 표가 깨진다(실제로 겪음). 글자가 있는 영역은 불투명한 면(`--surface`)을 깔아 머리말 배경 그림과 겹치지 않게 한다. 출장자 배경 그림(`TripsArt`)은 1400px 이하에서 숨긴다.
- DB: `trip_members`·`trip_assignments`·`trip_project_notes`·`trip_absences` 4개. 프로젝트와는 `project_id text → projects(id) on delete cascade`로 잇는다(프로젝트를 지우면 배정도 지워진다). **조회·수정 모두 admin·grade3·grade2_5**(`trip_can_view()` 하나로 판정). 팀장(grade2_5)은 모든 부서를 볼 수 있고 DB에서도 부서 제한이 없다(예전의 "팀장 지정"·"해외 표시"·"수동 공수" 테이블은 없앴다). 부서 키는 `mechanical|vision|control|electrical|manager`.
- **다른 부서 수정 경고**: 화면의 `guard()`가 팀장(grade2_5)이 "내 부서"가 아닌 부서의 배정·공수·인원·특이사항·퇴사·삭제·교대·붙여넣기를 저장하려 할 때 "내 부서가 아닙니다" 확인을 띄우고, 취소하면 저장하지 않는다(`{ cancelled: true }`). 내 부서 = 화면 위 "내 부서" 선택값(브라우저 저장), 없으면 계정 소속 팀 이름에서 추정(`guessDept(profile.team)`). PM·관리자는 경고 없이 전부 수정한다. 보는 것에는 제한이 없다.
- 앱 코드가 이 테이블들에 의존하므로 **마이그레이션을 앱 배포보다 먼저 적용**한다. 적용 전에는 화면이 "DB가 아직 준비되지 않았습니다"를 보여 준다(앱의 다른 기능은 영향 없음).
- 로컬 점검: 저장소에 올리지 않는 `ui-demo/`(가짜 Supabase + 가짜 프로젝트로 이 화면만 띄움). `node node_modules/vite/bin/vite.js --config ui-demo/vite.config.js` → `http://localhost:5199/?role=grade3|grade2_5|grade2&theme=dark`. SQL/RLS는 운영 DB가 아니라 PGlite(`@electric-sql/pglite`)로 로컬 검증했다.

## 배포 (GitHub `main` push → Vercel 자동 배포)
- 작업이 끝나고 검증이 통과하면 커밋 후 `main`에 push한다(사용자가 "로컬로만"이라고 하지 않는 한). 배포 후 Vercel 배포 상태와 URL을 함께 보고한다.
- **`npm run deploy`(gh-pages)는 쓰지 않는다.** `vite.config.js`의 `base`가 `/`라 GitHub Pages 하위 경로(`/project-manager/`)에서는 JS가 404로 깨진다. `gh-pages` 브랜치에는 Vercel 빌드를 끄는 `vercel.json`이 들어 있다. 건드리지 않는다.
- 프로덕션: `https://project-manager-rho-nine.vercel.app` (Vercel 팀 `whalswo1993-5770`, 프로젝트 `project-manager`)

## 서비스워커(PWA 캐시)는 쓰지 않는다
- **2026-10-15 iPad(Safari)에서 첫 접속부터 무한 새로고침이 났다.** 원인: `index.html`의 정리 스크립트가 매 로드마다 서비스워커를 해제하는데 `main.jsx`가 `registerSW`(autoUpdate)로 다시 등록했고, autoUpdate 서비스워커는 새로 켜질 때마다 페이지를 새로고침한다 → 로드마다 해제·재등록·새로고침이 반복. 데스크톱 Chrome/Edge에서는 재현되지 않아서 오래 못 잡았다.
- 그래서 지금은 `vite.config.js`에서 `selfDestroying: true`(남아 있는 서비스워커는 스스로 해제·캐시 삭제) + `injectRegister: false`(어디서도 등록하지 않음)이고, `main.jsx`에는 등록 코드가 없다. 매니페스트는 그대로라 "홈 화면에 추가"는 된다. 새 버전 알림은 `version.json` 확인(`App.jsx`)이 맡는다.
- **서비스워커를 다시 쓰려면** `index.html`의 정리 스크립트를 먼저 없애고, `autoUpdate`처럼 자동 새로고침하는 방식은 피한다(iOS에서 반복될 수 있다). `tests/serviceWorkerPolicy.test.js`가 이 조합이 돌아오는 것을 막는다.
- 확인: 배포된 `/sw.js`가 해제용(`self.registration.unregister`)인지, `index.html`에 `registerSW.js`가 없는지 본다. 이 문제는 데스크톱 Chrome/Edge에서 재현되지 않고 iPad(WebKit) 실기기에서만 나타났으니, 서비스워커를 건드리면 iPad로도 확인한다.

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
- 현재 권한 모델(DB RLS 기준): 조회=활성 사용자 전원 / `projects` 등록·삭제=admin·grade3 / 수정=admin·grade3·grade2_5·grade2(grade2_5·grade2는 트리거로 status·progress 등만)
- **AI(API) 호출 권한(2026-10-20)**: `grade2_5`(각 부서 팀장)는 `grade2`와 같은 화면·DB 권한이고, AI 호출은 admin·grade3·grade2_5만 된다. grade2는 서버(`api/_lib/handler.js`의 `AI_ALLOWED_ROLES`)에서 `403 ai_not_allowed`로 막히며, `src/ai.js`는 이 코드를 받으면 브라우저 키·Claude로 우회하지 않는다. 화면은 공사일보 AI 분석 PPT(`IssueManagement.jsx`)만 grade2에게 잠겨 있고 나머지 내보내기는 AI를 쓰지 않아 grade2도 된다. **새 AI 기능은 `generateAIText`를 쓰면 서버가 자동으로 막아 주지만, 화면에도 `canRunAIAnalysis` 같은 잠금 표시를 달 것.** 역할 값은 `grade2_5`(소수점 없음). / `project_history`는 admin만 열람. `daily_reports`·`project_issues`는 로그인한 활성 사용자만.
- 남은 알려진 경고(Supabase advisor): `current_app_role()`을 로그인 사용자가 호출 가능(RLS·서버 로그인 검증이 쓰므로 의도적), 유출 비밀번호 보호 꺼짐(요금제 설정).
- **모든 로그인은 Supabase Auth뿐이다.** 예전의 "가짜 테스트 계정" 코드(비밀번호 하드코딩, 브라우저 로컬 세션)는 제거했다. 테스트 계정은 `test3@twgroup.co.kr` 하나만 실제 서버 계정으로 운영하며(역할 grade3), 비밀번호는 저장소·채팅에 적지 않고 관리자가 SQL Editor로 직접 설정한다. 데이터 보호는 화면이 아니라 DB의 RLS 정책이 담당한다.
- 사용자 정보의 정본은 DB `profiles`다: `name`, `team`, `role`, `active`, `last_sign_in_at`, `last_active_at`. 브라우저 로컬 저장소에 이름/팀/삭제 목록/접속 기록을 두지 않는다(컴퓨터마다 달라지는 원인이었다).
- 회원가입의 이름·소속팀은 **필수**이며 두 겹으로 강제한다: 화면(`validateSignupProfile`)과 DB 트리거(`handle_new_user`, 최고 관리자 생성만 예외). 접속 기록은 `record_my_access` RPC, 계정 영구 삭제는 `admin_delete_user` RPC(최고 관리자만)로 한다.
- **로그인 직후 "권한 확인 중... 계정 정보를 불러오지 못했습니다"**(2026-10-15 원인 확인): 토큰을 막 발급받은 뒤 1초 안팎에 Supabase API가 정상 토큰을 `401 PGRST303`("JWT issued at future", 서버 사이 시계 차이)로 거절한다. 로그인/토큰 갱신 직후 첫 요청(내 프로필 조회)이 여기에 걸렸다. 대응: `src/supabase.js`의 fetch 가 이 401 만 잠깐 뒤 다시 보내고(`createJwtSkewRetryFetch`, 테스트 `tests/supabaseFetchRetry.test.js`), `App.jsx` 의 `boot()`는 프로필 조회를 몇 번 재시도하며 끝내 실패하면 원인과 "다시 시도" 버튼을 보여 준다. 비슷한 증상을 조사할 때는 Supabase 로그(`edge_logs`의 `response.headers.proxy_status`, `request.sb.jwt.authorization.payload.issued_at`)를 본다.
- 위 구조는 `supabase/migrations/20261014040000_*`, `20261014040100_*`로 적용돼 있다(사용자가 SQL Editor로 실행했기 때문에 서버의 migrations 기록에는 없다). **앱 코드가 새 컬럼·RPC에 의존하므로 DB 변경은 항상 앱 배포보다 먼저 적용한다.**
- 사용자가 SQL Editor로 직접 적용하는 방식은 자동 권한 검사기가 `apply_migration`을 막을 때의 대안이다. Claude Code의 권한 규칙은 사용자가 직접 설정해야 한다(에이전트는 자신의 권한 설정을 바꾸지 않는다).
