---
name: autonomous-dev
description: >-
  Use this skill whenever performing end-to-end feature development, bug fixes, or refactoring autonomously without intermediate manual approvals. Automatically handles implementation, local builds, testing, self-correction, and final verification.
---

# Autonomous Development & Self-Verification Skill

## Overview
사용자가 작업 단계마다 일일이 'Submit'이나 승인을 누를 필요 없이, AI 에이전트가 요구사항 분석부터 코드 수정, 빌드 검증, 에러 자가 수정, 최종 테스트까지 모든 과정을 한 번에 완결합니다.

## Autonomous Workflow Loop

1. **분석 및 컨텍스트 파악 (Analyze Context)**
   - 관련 파일, 기존 컴포넌트, 프로젝트 환경(`package.json`, 의존성 등)을 신속하게 파악합니다.

2. **직접 구현 및 수정 (Implement Changes)**
   - 중간 단계마다 멈추거나 사용자에게 질문하지 않고, 필요한 소스 코드 변경을 직접 완료합니다.

3. **자동 빌드 및 검증 (Automated Build & Verify)**
   - 코드 변경 후 터미널 명령어(예: `npm run build`)를 자체 실행하여 컴파일 및 번들링 에러가 없는지 검증합니다.
   - 필요 시 브라우저 또는 테스트 도구를 통해 직접 동작을 확인합니다.

4. **에러 자가 수정 (Self-Correction Loop)**
   - 빌드 또는 런타임 에러 발생 시 사용자에게 묻지 않고 즉각 에러 로그를 분석하여 코드를 수정하고, 빌드가 정상 통과할 때까지 반복 해결합니다.

5. **완료 보고 (Final Delivery)**
   - 검증이 100% 완료된 시점에 변경 사항 요약, 빌드/테스트 성공 결과, 주요 수정 사항을 한 번에 명확히 보고합니다.
