import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { subscribeToPush, unsubscribeFromPush } from '../utils/push';
import { getHarmonicAlerts, setHarmonicAlerts, type HarmonicAlertTfs } from '../api/adminApi';

type Props = { isOpen: boolean; onClose: () => void };

const TF_ROWS: { key: keyof HarmonicAlertTfs; label: string }[] = [
  { key: 'm30', label: '30분' },
  { key: 'h4', label: '4시간' },
  { key: 'd1', label: '1일' },
];

async function checkSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

export default function AlertSheet({ isOpen, onClose }: Props) {
  const [subscribed, setSubscribed] = useState(false);
  const [tfs, setTfs] = useState<HarmonicAlertTfs>({ m30: false, h4: false, d1: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void checkSubscribed().then(setSubscribed);
    void getHarmonicAlerts().then(setTfs).catch(() => {});
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  async function togglePush() {
    setBusy(true);
    try {
      const ok = subscribed ? await unsubscribeFromPush() : await subscribeToPush();
      if (ok) setSubscribed(!subscribed);
    } finally { setBusy(false); }
  }

  async function toggleTf(key: keyof HarmonicAlertTfs) {
    const next = { ...tfs, [key]: !tfs[key] };
    setTfs(next); // 낙관적 반영
    try { setTfs(await setHarmonicAlerts(next)); }
    catch { setTfs(tfs); } // 실패 시 롤백
  }

  const anyTf = tfs.m30 || tfs.h4 || tfs.d1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000,
              background: '#15191f', borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: '8px 18px max(24px, env(safe-area-inset-bottom))', color: '#fff',
              boxShadow: '0 -8px 30px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', margin: '6px auto 16px' }} />
            <strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>알림 설정</strong>
            <p style={{ fontSize: 12, color: '#8b95a1', margin: '0 0 16px' }}>모니터링 하모닉 신호(PRZ 터치)를 푸시로 받습니다.</p>

            {/* 푸시 on/off */}
            <button
              onClick={togglePush} disabled={busy}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '13px 14px', borderRadius: 12, marginBottom: 20,
                border: '1px solid rgba(255,255,255,0.08)', background: '#181a20',
                color: busy ? '#8b95a1' : '#eaecef', fontSize: 14, fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
              }}>
              <span>{busy ? '처리 중…' : '이 기기에서 알림 받기'}</span>
              <span style={{ width: 42, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0, background: subscribed ? 'var(--up)' : 'rgba(255,255,255,0.15)', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: 2, left: subscribed ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </span>
            </button>

            {/* TF 토글 */}
            <div style={{ fontSize: 12, color: '#8b95a1', marginBottom: 8 }}>받을 타임프레임</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: subscribed ? 1 : 0.5, pointerEvents: subscribed ? 'auto' : 'none' }}>
              {TF_ROWS.map(({ key, label }) => (
                <button key={key} onClick={() => toggleTf(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
                    background: tfs[key] ? 'rgba(14,203,129,0.10)' : 'rgba(255,255,255,0.03)',
                    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <span>{label}</span>
                  <span style={{
                    width: 42, height: 24, borderRadius: 12, position: 'relative',
                    background: tfs[key] ? 'var(--up)' : 'rgba(255,255,255,0.15)', transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', top: 2, left: tfs[key] ? 20 : 2, width: 20, height: 20,
                      borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                    }} />
                  </span>
                </button>
              ))}
            </div>
            {subscribed && !anyTf && (
              <p style={{ fontSize: 11, color: '#f59e0b', margin: '12px 0 0' }}>받을 타임프레임을 하나 이상 켜야 알림이 옵니다.</p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
