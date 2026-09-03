// 글로벌 kill switch 패널 — 운영자(admin) 전용.
// ON 시 통합 워커가 다음 폴링에서 전 설정 정지·전 포지션 시장가 청산.
import { useState, useEffect, useCallback } from 'react';
import { fetchMe } from '../../api/authApi';
import { getKillSwitch, setKillSwitch } from '../../api/adminApi';

export default function KillSwitchPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const state = await getKillSwitch();
      setActive(state);
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
    const next = !active;
    if (next && !window.confirm('정말 KILL SWITCH를 켤까요?\n전 사용자의 매매가 정지되고 보유 포지션이 시장가 청산됩니다.')) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setKillSwitch(next);
      setActive(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin || loading) return null;

  return (
    <div className="premium-panel" style={{ 
      borderColor: active ? 'rgba(246, 70, 93, 0.4)' : 'rgba(255, 255, 255, 0.06)',
      background: active ? 'rgba(246, 70, 93, 0.05)' : 'rgba(21, 26, 35, 0.6)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: active ? '#f6465d' : '#fff' }}>
            🛑 비상정지 (전량 시장가 청산)
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            상태: <strong style={{ color: active ? '#f6465d' : '#0ecb81' }}>{active ? 'ON — 작동 중' : 'OFF — 안전'}</strong>
            <span style={{ display: 'block', marginTop: 4, opacity: 0.8 }}>전 설정 강제 정지 및 보유 포지션 즉시 시장가 청산. 신규진입만 막으려면 자동매매 토글을 끄세요.</span>
          </div>
        </div>
        
        <label style={{ display: 'flex', alignItems: 'center', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          <div className="premium-switch danger">
            <input type="checkbox" checked={active} onChange={toggle} disabled={busy} />
            <span className="premium-switch-slider"></span>
          </div>
        </label>
      </div>
      {error && <div style={{ color: '#f6465d', fontSize: 13, marginTop: 12, background: 'rgba(246, 70, 93, 0.1)', padding: '6px 10px', borderRadius: '4px' }}>⚠️ {error}</div>}
    </div>
  );
}
