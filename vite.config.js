import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
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
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-network-only' }
          }
        ]
      }
    })
  ]
})
