import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { ErrorBoundary } from './ErrorBoundary.jsx'
import { ConfirmDialogHost } from './ConfirmDialog.jsx'

// 서비스워커는 등록하지 않는다 (vite.config.js 의 selfDestroying 설명 참고).
// 예전에 설치된 서비스워커는 index.html 의 정리 스크립트와 해제용 sw.js 가 지운다.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <ConfirmDialogHost />
    </ErrorBoundary>
  </StrictMode>,
)
