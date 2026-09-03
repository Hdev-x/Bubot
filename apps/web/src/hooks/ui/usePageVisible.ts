import { useEffect, useState } from 'react';

// 앱이 백그라운드(브라우저 탭 숨김, 홈 화면으로 나감 등)면 false.
// App에서 각 라우트의 active 판정(route === X)에 AND로 곱해, 화면이 안 보일 땐
// 모든 페이지의 폴링·WS 구독을 멈추는 데 쓴다.
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return visible;
}
