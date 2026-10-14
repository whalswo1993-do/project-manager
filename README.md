# TW Project Manager

TW 프로젝트(설비/라인 구축) 일정·공수·공사일보·이슈·견적을 관리하는 웹앱입니다. 마스터플랜 엑셀을 읽어 일정과 부서별 공수를 자동 집계하고, 공사일보와 견적서는 AI로 구조화합니다.

- 운영: https://project-manager-rho-nine.vercel.app (GitHub `main` push 시 Vercel 자동 배포)
- 스택: React 19 · Vite · Supabase · PWA · Gemini + Claude(AI)

## 시작하기

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local — 값을 채운다
npm run dev                  # http://localhost:5173
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (서버 함수 `api/`는 동작하지 않음 — `vercel dev` 사용) |
| `npm run lint` | ESLint (오류 0건 유지) |
| `npm test` | 회귀 테스트 (분석 함수, 마스터플랜 파서, AI 라우팅, 서버 API) |
| `npm run build` | 프로덕션 빌드 |

## 구성

```
src/        앱 코드 (App.jsx, IssueManagement.jsx, ManpowerManagement.jsx, Quotations.jsx ...)
src/ai.js   AI 단일 진입점 — Gemini 먼저, 실패 시 Claude 로 자동 전환
api/        Vercel 서버 함수 (Claude 프록시, 로그인 검증)
tests/      vitest 회귀 테스트
supabase/   Supabase 연결 설정과 마이그레이션
```

## AI 설정

`.env.example` 의 `VITE_AI_PROVIDER` 로 제공자를 고릅니다. `auto`(기본)는 Gemini를 먼저 쓰고 실패하면 Claude로 넘어갑니다.
Claude 키(`ANTHROPIC_API_KEY`)는 브라우저가 아니라 Vercel 환경변수에만 등록합니다.

## 개발 규칙

Claude Code, Antigravity 등 에이전트와 함께 작업하는 규칙은 [`AGENTS.md`](AGENTS.md)에 있습니다.
