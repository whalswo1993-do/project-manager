import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildTimestamp = Date.now()

const versionPlugin = () => ({
  name: 'version-plugin',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({
        version: buildTimestamp,
        buildTime: new Date(buildTimestamp).toISOString()
      }, null, 2)
    })
  }
})

export default defineConfig({
  base: '/',
  define: {
    __APP_BUILD_TIME__: buildTimestamp
  },
  plugins: [
    react(),
    versionPlugin(),
    VitePWA({
      // 서비스워커는 쓰지 않는다. 예전에는 index.html 이 매 로드마다 서비스워커를 해제하고 main.jsx 가 다시 등록하면서
      // (autoUpdate 는 새 서비스워커가 켜질 때마다 페이지를 새로고침한다) iPad(Safari)에서 첫 접속부터 무한 새로고침이 났다.
      // selfDestroying: 이미 설치된 서비스워커는 스스로 해제하고 캐시를 지운다.
      // injectRegister: false: 어디서도 서비스워커를 등록하지 않는다. (자동 주입을 두면 해제용 서비스워커를 매번 다시 등록해 또 반복된다)
      // 매니페스트는 그대로라서 "홈 화면에 추가"/설치는 계속 된다. 새 버전 알림은 version.json 확인(App.jsx)이 맡는다.
      selfDestroying: true,
      injectRegister: false,
      manifest: {
        name: 'Project 관리',
        short_name: 'Project 관리',
        description: 'TW 프로젝트 관리',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#eef3f8',
        theme_color: '#075ca8',
        lang: 'ko-KR',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
