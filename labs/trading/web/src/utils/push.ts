import { authHeader } from '@web/api/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('이 브라우저는 웹 푸시를 지원하지 않습니다.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('알림 권한이 거부되었습니다.');
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      alert('이미 알림이 설정되어 있습니다.');
      registration.showNotification('알림 설정 완료', {
        icon: '/mobile/favicon.ico'
      } as any);
      return true;
    }

    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      alert('서버 VAPID 키가 설정되지 않았습니다.');
      return false;
    }

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });

    const subJson = subscription.toJSON();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...authHeader()
    };

    const res = await fetch('/api/user/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth
      })
    });

    if (!res.ok) {
      throw new Error('서버에 구독 정보를 저장하는데 실패했습니다.');
    }

    registration.showNotification('알림 설정 완료', {
      icon: '/mobile/favicon.ico'
    } as any);

    // 사용자가 요청한 예시 신호 알림 띄워주기
    setTimeout(() => {
      registration.showNotification('BTCUSDT.P', {
        body: 'Bullish Bat $64500.0',
        icon: '/mobile/favicon.ico'
      } as any);
    }, 500);

    return true;

  } catch (error: any) {
    console.error('푸시 구독 중 오류 발생:', error);
    alert('푸시 알림 설정 중 오류가 발생했습니다: ' + error.message);
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      await existingSubscription.unsubscribe();
      alert('앱 푸시 알림이 해제되었습니다.');
      registration.showNotification('알림 해제', {
        icon: '/mobile/favicon.ico'
      } as any);
      return true;
    }
    return true;
  } catch (error: any) {
    console.error('푸시 구독 해제 중 오류 발생:', error);
    alert('푸시 알림 해제 중 오류가 발생했습니다: ' + error.message);
    return false;
  }
}
