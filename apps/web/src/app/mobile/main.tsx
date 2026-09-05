import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import './styles/mobile.css'; // 앱 셸 CSS를 화면 컴포넌트보다 먼저 로드 — 컴포넌트 옆 CSS가 뒤에 와서 원본 cascade(셸 → 화면) 유지 (리뷰 P0 수정)
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateToast from './components/UpdateToast';

// iOS 핀치/더블탭 줌 차단 (홈화면 웹앱 뷰포트 줌 풀림 방지)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

// 개발 모드: 과거에 등록된 PWA 서비스워커가 옛 번들을 캐시해 코드 변경이
// 화면에 안 뜨는 문제를 막기 위해, dev에선 기존 SW를 해제하고 캐시를 비운다.
// (프로드 빌드에선 동작 안 함 — import.meta.env.DEV 가드)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

import { CurrencyProvider } from '../../shared/contexts/CurrencyContext';

// dev HMR로 main.tsx가 다시 실행돼도 React 루트는 하나만 재사용한다(Desktop main.tsx와 같은 이유 — 중복 createRoot 방지).
declare global { interface Window { __bubitMobileRoot?: Root } }
const root = (window.__bubitMobileRoot ??= createRoot(document.getElementById('root')!));
root.render(
  <StrictMode>
    <ErrorBoundary>
      <CurrencyProvider>
        <App />
        <UpdateToast />
      </CurrencyProvider>
    </ErrorBoundary>
  </StrictMode>
);
