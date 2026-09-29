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
      registerType: 'autoUpdate',
      includeAssets: ['tw-logo.png', 'pwa-192.png', 'pwa-512.png'],
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
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-network-only' }
          },
          {
            urlPattern: /version\.json/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
})
