// 자동매매 ON/OFF 패널 — 운영자(admin) 전용.
// OFF 시 통합 워커가 신규 진입만 차단한다(기존 포지션·청산관리는 유지).
// 포지션 정리(청산)는 별도 Kill Switch 패널에서 수행한다.
import { useState, useEffect, useCallback } from 'react';
import { fetchMe } from '@web/api/authApi';
import { getTradingEnabled, setTradingEnabled } from '../../api/adminApi';

export default function TradingTogglePanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEnabled(await getTradingEnabled());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe().then(u => {
      const admin = u?.role === 'ADMIN';
      setIsAdmin(admin);
      if (admin) load();
      else setLoading(false);
    }).catch(() => setLoading(false));
  }, [load]);

  async function toggle() {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      setEnabled(await setTradingEnabled(next));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin || loading) return null;

  return (
    <div className="premium-panel" style={{ 
      borderColor: enabled ? 'rgba(14, 203, 129, 0.4)' : 'rgba(255, 255, 255, 0.06)',
      background: enabled ? 'rgba(14, 203, 129, 0.05)' : 'rgba(21, 26, 35, 0.6)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: enabled ? '#0ecb81' : '#fff' }}>🤖 글로벌 자동매매 허용</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            상태: <strong style={{ color: enabled ? '#0ecb81' : 'var(--muted)' }}>{enabled ? 'ON — 가동 중' : 'OFF — 신규 진입 정지'}</strong>
            <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>OFF여도 보유 중인 포지션은 유지·청산 관리됩니다. (전량 청산은 아래 비상정지 버튼)</span>
          </div>
        </div>
        
        <label style={{ display: 'flex', alignItems: 'center', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <div className="premium-switch success">
            <input type="checkbox" checked={enabled} onChange={toggle} disabled={busy} />
            <span className="premium-switch-slider"></span>
          </div>
        </label>
      </div>
      {error && <div style={{ color: '#f6465d', fontSize: 13, marginTop: 12, background: 'rgba(246, 70, 93, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>⚠️ {error}</div>}
    </div>
  );
}
