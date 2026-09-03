import webpush from 'web-push';
import axios from 'axios';

// 환경 변수 검증 (worker.sh에서 전달됨)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const internalToken = process.env.BOT_API_TOKEN;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:admin@autotradev.duckdns.org',
    vapidPublicKey,
    vapidPrivateKey
  );
}

export async function sendWebPush(title: string, message: string) {
  if (!vapidPublicKey || !vapidPrivateKey) return;

  try {
    // 내부 API 호출해서 모든 구독 정보 가져오기
    // (지금은 전체 회원의 모든 활성 기기로 전송)
    const response = await axios.get('http://localhost:8081/api/internal/push-subscriptions', {
      headers: {
        'X-Internal-Token': internalToken
      }
    });

    const subscriptions = response.data.subscriptions;
    if (!subscriptions || subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body: message });

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err: any) {
        console.warn(`[web-push] 발송 실패 (endpoint: ${sub.endpoint.slice(0, 20)}...):`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[web-push] 구독 목록 조회 실패:`, err.message);
  }
}
