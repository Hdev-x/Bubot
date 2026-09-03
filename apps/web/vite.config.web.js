import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 데스크톱 웹 전용 Vite 설정 — 모바일(vite.config.js, /mobile/)과 완전 분리.
// base '/web/' · 포트 5174 · 진입 web.html. API 프록시는 모바일과 동일하게 8081로.
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
// 웹 진입점은 web.html 이므로, dev에서 /web/ 접속 시 web.html 로 강제 리라이트해
// 모바일이 아닌 웹 콘솔만 열리게 한다. (build 때는 rollupOptions.input 이 처리)
const serveWebHtmlInDev = {
  name: 'serve-web-html-in-dev',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/web/' || req.url === '/web/index.html') {
        req.url = '/web/web.html';
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), serveWebHtmlInDev],
  base: '/web/',
  cacheDir: './.vite-web',
  build: {
    outDir: 'dist-web',
    rollupOptions: {
      input: new URL('./web.html', import.meta.url).pathname,
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy,
  },
});
