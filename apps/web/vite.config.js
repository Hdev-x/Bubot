import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// SPRING_TARGET env로 프록시 대상 교체 가능 (예: 프로드 API 대상 UI 단독 점검)
const springTarget = process.env.SPRING_TARGET ?? 'http://localhost:8081';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt: 새 버전 감지 시 UpdateToast(배너)로 사용자 확인 후 갱신 — 주문 입력 중 강제 리로드 방지.
      registerType: 'prompt',
      injectRegister: null, // 등록은 UpdateToast(virtual:pwa-register)가 수행 — 이중 등록 방지
      strategies: 'injectManifest',
      srcDir: 'src/app/mobile',
      filename: 'sw.js',
      devOptions: {
        // 개발 모드에선 서비스워커 비활성 — dev 중 SW가 옛 번들을 캐시해
        // 코드 변경이 화면에 안 뜨는 문제 방지. 프로드 빌드 PWA는 영향 없음.
        enabled: false,
        type: 'module'
      },
      manifest: {
        name: 'Botz Mobile',
        short_name: 'Botz',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon'
          }
        ]
      }
    })
  ],
  base: '/mobile/',
  cacheDir: './.vite',
  server: {
    port: 5173,
    proxy: {
      '/api/bot-ws': {
        target: 'ws://localhost:8081',
        ws: true
      },
      '/stock': springTarget,
      '/asset': springTarget,
      '/coin': springTarget,
      '/api': springTarget,
      '/ws-coin': {
        target: 'ws://localhost:8081',
        ws: true
      }
    }
  }
});
