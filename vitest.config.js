import { defineConfig } from 'vitest/config'

// 순수 함수(분석/파서) 회귀 테스트 전용 설정 — 앱 빌드용 vite.config.js(PWA 플러그인 등)와 분리한다.
export default defineConfig({
  define: { __APP_BUILD_TIME__: 0 },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
})
