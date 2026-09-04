import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Desktop 전용 Vite 설정 — Mobile(vite.config.js, /mobile/)과 완전 분리.
// base '/web/'(URL은 배포 경로와 함께 T-05에서 결정) · 포트 5174 · 진입 desktop.html. API 프록시는 모바일과 동일하게 8081로.
// 포트 5174는 백엔드 CORS 허용 목록(app.cors.allowed-origins)에 포함된 값 →
// 프록시가 Origin: localhost:5174를 전달해도 백엔드가 통과시킴(5176은 미허용이라 403).
const springTarget = process.env.SPRING_TARGET ?? 'http://localhost:8081';

const proxy = {
  '/api/bot-ws': { target: 'ws://localhost:8081', ws: true },
  '/stock': springTarget,
  '/asset': springTarget,
  '/coin': springTarget,
  '/api': springTarget,
  '/ws-coin': { target: 'ws://localhost:8081', ws: true },
};

// dev 서버는 base 루트(/web/)에서 기본 index.html(=모바일 진입점)을 서빙한다.
// Desktop 진입점은 desktop.html 이므로, dev에서 /web/ 접속 시 desktop.html 로 강제 리라이트해
// Mobile이 아닌 Desktop만 열리게 한다. (쿼리스트링이 붙어도 동일) (build 때는 rollupOptions.input 이 처리)
const serveDesktopHtmlInDev = {
  name: 'serve-desktop-html-in-dev',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = req.url.split('?')[0];
      if (path === '/web/' || path === '/web/index.html') {
        req.url = '/web/desktop.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), serveDesktopHtmlInDev],
  base: '/web/',
  cacheDir: './.vite-desktop',
  build: {
    outDir: 'dist-desktop',
    rollupOptions: {
      input: new URL('./desktop.html', import.meta.url).pathname,
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy,
  },
});
