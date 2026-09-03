import { precacheAndRoute } from 'workbox-precaching';

// Inject precache manifest
precacheAndRoute(self.__WB_MANIFEST || []);

// Web Push 알림 수신 이벤트
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'Bullum 알림';
      const options = {
        body: data.body || '새로운 신호가 포착되었습니다.',
        icon: '/mobile/favicon.ico',
        badge: '/mobile/favicon.ico',
        vibrate: [200, 100, 200],
        data: {
          url: '/mobile/' // 클릭 시 이동할 URL
        }
      };
      
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      console.error('Push data parsing failed:', e);
      // JSON 파싱 실패 시 일반 텍스트로 처리
      event.waitUntil(
        self.registration.showNotification('Bullum', {
          body: event.data.text(),
          icon: '/mobile/favicon.ico',
          data: { url: '/mobile/' }
        })
      );
    }
  }
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = new URL(event.notification.data.url || '/mobile/', self.location.origin).href;

  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    let matchingClient = null;
    for (let i = 0; i < windowClients.length; i++) {
      const windowClient = windowClients[i];
      if (windowClient.url === urlToOpen) {
        matchingClient = windowClient;
        break;
      }
    }
    if (matchingClient) {
      return matchingClient.focus();
    } else {
      return clients.openWindow(urlToOpen);
    }
  });

  event.waitUntil(promiseChain);
});

// ── 앱 업데이트 배너 연동 ─────────────────────────────────
// 새 버전 SW는 기본적으로 "대기" 상태로 머문다(열린 탭이 전부 닫혀야 활성화).
// 프론트 UpdateToast가 사용자 확인 후 SKIP_WAITING을 보내면 즉시 활성화 → 페이지 리로드로 새 번들 적용.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
