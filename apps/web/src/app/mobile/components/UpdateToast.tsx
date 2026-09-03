import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * PWA 업데이트 배너 — 새 버전이 배포되면 하단에 "새 버전 → 업데이트" 토스트를 띄운다.
 * 탭하면 대기 중인 SW를 활성화(SKIP_WAITING)하고 리로드해 새 번들을 적용.
 * 강제 자동 리로드는 주문 입력 중 위험해서 쓰지 않는다(사용자 확인 방식).
 */
export default function UpdateToast() {
  const [doUpdate, setDoUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    // dev에선 SW 비활성(vite devOptions.enabled=false) — registerSW가 no-op이라 안전.
    const updateSW = registerSW({
      onNeedRefresh() {
        setDoUpdate(() => () => { void updateSW(true); });
      },
    });
  }, []);

  if (!doUpdate) return null;
  return (
    <div
      style={{
        position: 'fixed', left: 12, right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)', // 하단 탭바 위
        zIndex: 9999, display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--panel-2, #1b2230)', color: 'var(--text, #edf1f7)',
        borderRadius: 12, padding: '12px 14px', fontSize: 13,
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
      }}
    >
      <span style={{ flex: 1 }}>새 버전이 준비됐어요</span>
      <button
        onClick={doUpdate}
        style={{
          border: 'none', borderRadius: 8, padding: '8px 14px',
          background: 'var(--blue, #3182f6)', color: '#fff', fontWeight: 700, fontSize: 12,
        }}
      >
        업데이트
      </button>
      <button
        onClick={() => setDoUpdate(null)}
        style={{ border: 'none', background: 'transparent', color: 'var(--muted, #8b96a8)', fontSize: 12 }}
      >
        나중에
      </button>
    </div>
  );
}
