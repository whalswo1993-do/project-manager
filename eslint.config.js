import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, __APP_BUILD_TIME__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 예전 기능 제거 후 남은 미사용 변수(드래그앤드롭 핸들러 등) — 경고로 두고 점진적으로 정리
      'no-unused-vars': ['warn', { caughtErrors: 'none', varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      // React 19 컴파일러 계열 권고 규칙 — 동작에는 문제 없는 패턴이라 경고 수준
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // 서버 함수(Vercel)와 테스트는 Node 환경
    files: ['api/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', 'vitest.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['generate_permissions_presentation.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
])
