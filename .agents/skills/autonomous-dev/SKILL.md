---
name: autonomous-dev
description: >-
  Use this skill whenever performing end-to-end feature development, bug fixes, or refactoring autonomously without intermediate manual approvals. Automatically handles implementation, lint/test/build verification, self-correction, and deployment by pushing to main.
---

# Autonomous Development & Self-Verification Skill

## Overview
사용자가 작업 단계마다 일일이 'Submit'이나 승인을 누를 필요 없이, 요구사항 분석부터 코드 수정, 검증, 에러 자가 수정, 배포까지 한 번에 완결합니다.
이 프로젝트는 Claude Code와 Antigravity가 같은 폴더에서 번갈아 작업하므로, 공통 규칙은 저장소 루트의 `AGENTS.md`를 따릅니다.

## Autonomous Workflow Loop

1. **분석 및 컨텍스트 파악**
   - `AGENTS.md`를 읽고, `git status`/`git pull --rebase origin main`으로 상태를 확인합니다.
   - 내가 만들지 않은 미커밋 변경이 있으면 되돌리지 말고 사용자에게 알립니다(다른 도구의 작업일 수 있음).

2. **직접 구현 및 수정**
   - 중간 단계마다 멈추지 않고 필요한 소스 코드 변경을 완료합니다.
   - AI 호출은 `src/ai.js`의 `generateAIText()`만 사용합니다.

3. **검증 (순서 고정)**
   - `npm run lint`(오류 0, 특히 `no-undef`) → `npm test` → `npm run build`
   - 빌드/테스트는 "정의되지 않은 변수"를 잡지 못하므로 린트 결과를 반드시 확인합니다.

4. **에러 자가 수정**
   - 실패하면 로그를 분석해 고치고, 모두 통과할 때까지 반복합니다.

5. **배포 (main push만)**
   - 검증이 통과하면 파일을 지정해 커밋하고 `main`에 push합니다. Vercel이 자동 배포합니다.
   - ⚠️ `npm run deploy`(gh-pages)는 사용하지 않습니다(`AGENTS.md` 참고).
   - 사용자가 "로컬로만 확인하겠다"고 하면 push하지 않습니다.

6. **반드시 멈추고 확인할 것**
   - DB(Supabase) 스키마/RLS/데이터 변경, 삭제, 강제 push, 비밀 값 처리

7. **완료 보고**
   - 변경 요약, 검증 결과, Vercel 배포 상태와 URL을 한 번에 보고합니다.
