import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import UpdateToast from './components/UpdateToast';
import './styles/mobile.css';

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

import { CurrencyProvider } from '../../contexts/CurrencyContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <CurrencyProvider>
        <App />
        <UpdateToast />
      </CurrencyProvider>
    </ErrorBoundary>
  </StrictMode>
);
