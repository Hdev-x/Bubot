// 통합 워커 상태 패널 — 운영자(admin) 전용.
// 워커가 Spring에 push한 스냅샷을 5초마다 조회해 표시한다.
import { useState, useEffect, useCallback } from 'react';
import { fetchMe } from '@web/api/authApi';
import { getWorkerStatus, type WorkerStatus } from '../../api/adminApi';

export default function WorkerStatusPanel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await getWorkerStatus());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    fetchMe().then(u => {
      const admin = u?.role === 'ADMIN';
      setIsAdmin(admin);
      if (admin) load();
    }).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [isAdmin, load]);

  if (!isAdmin) return null;

  const alive = status?.alive ?? false;
  const snap = status?.snapshot ?? null;
  const ago = status?.updatedAt ? Math.round((Date.now() - status.updatedAt) / 1000) : null;

  return (
    <div className="premium-panel" style={{ padding: '20px' }}>
      <div className="premium-panel-header" style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>⚙️ 통합 워커 상태</h3>
        <span className={`badge-neon ${alive ? 'active' : ''}`}>
          {alive ? '● 워커 실행 중' : '○ 오프라인'}
        </span>
      </div>

      {error && <div style={{ color: '#f6465d', fontSize: 13, background: 'rgba(246, 70, 93, 0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px' }}>⚠️ {error}</div>}

      {!alive && (
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          워커가 상태를 보고하지 않습니다. <br/>
          <span style={{ fontSize: 11, opacity: 0.8 }}>(worker.sh 미실행이거나 중단됨{ago !== null ? `, 마지막 보고 ${ago}초 전` : ''})</span>
        </div>
      )}

      {alive && snap && (
        <>
          <div className="dashboard-grid">
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">활성 엔진 / 설정</span>
              <span className="dashboard-stat-value">{snap.engineCount} / {snap.configs.length}</span>
            </div>
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">감시 심볼</span>
              <span className="dashboard-stat-value">{snap.symbols.length} <span style={{fontSize: 11, fontWeight: 500, color: 'var(--muted)'}}>개</span></span>
            </div>
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">활성 포지션</span>
              <span className="dashboard-stat-value" style={{ color: snap.configs.some(c => c.hasPosition) ? 'var(--up)' : 'inherit' }}>
                {snap.configs.filter(c => c.hasPosition).length}
              </span>
            </div>
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">킬스위치 (비상 정지)</span>
              <span className="dashboard-stat-value" style={{ color: snap.killed ? 'var(--down)' : 'var(--up)' }}>
                {snap.killed ? '🚨 작동 중' : '안전'}
              </span>
            </div>
          </div>

          {snap.configs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '16px 0', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              현재 활성화된 매매설정이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>현재 동작 중인 봇 목록</div>
              {snap.configs.map(c => (
                <div key={c.id} className="premium-list-item" style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{c.symbol}</strong>
                      <span className="badge-neon" style={{ fontSize: 10 }}>{c.strategy}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6 }}>
                      <span>User: {c.memberId}</span>
                      <span style={{ opacity: 0.5 }}>|</span>
                      <span>{c.investUsdt} USDT / {c.leverage}x</span>
                    </div>
                  </div>
                  <div>
                    {c.hasPosition
                      ? <span className={`badge-neon ${c.direction === 'long' ? 'active' : 'danger'}`}>
                          {c.direction?.toUpperCase()} {c.size} @ {c.entryPrice?.toFixed(4)}
                        </span>
                      : <span className="badge-neon" style={{ opacity: 0.7 }}>대기 중</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
