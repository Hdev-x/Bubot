import React from 'react';
import { SUB_ACCOUNT_NAMES } from '../../config/bots';

export interface LiveTradesModalProps {
  isTradesModalOpen: boolean;
  setIsTradesModalOpen: (val: boolean) => void;
  tradeFilter: string;
  setTradeFilter: (val: string) => void;
  selectedBot: string;
  displayTrades: any[];
  getTickDecimals: (symbol: string) => number;
}

function fmt(sec: number) {
  return new Date(sec * 1000).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ago(sec: number) {
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60)  return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

function outcomeLabel(o: string) {
  return { tp: '✅ TP', sl1: '❌ SL1', sl2: '🛑 SL2', sl3: '🛑 SL3', timeout: '⏱ 타임아웃', '취소': '🚫 취소', '진입': '🟢 진입' }[o] ?? o;
}

export default function LiveTradesModal({
  isTradesModalOpen, setIsTradesModalOpen,
  tradeFilter, setTradeFilter,
  selectedBot, displayTrades, getTickDecimals
}: LiveTradesModalProps) {
  if (!isTradesModalOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setIsTradesModalOpen(false)}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ width: '40px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', alignSelf: 'center', marginBottom: '16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: '800' }}>통합 최근 거래 내역</h3>
          <button onClick={() => setIsTradesModalOpen(false)} style={{ background: 'none', border: 'none', color: '#8e929a', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>✕</button>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <select
            value={tradeFilter}
            onChange={e => setTradeFilter(e.target.value)}
            style={{ background: '#1a1d23', color: '#c5c8ce', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', outline: 'none' }}
          >
            <option value="ALL">전체</option>
            <option value="진입">🟢 진입</option>
            <option value="취소">🚫 취소</option>
            <option value="tp">✅ TP</option>
            <option value="sl1">❌ SL1</option>
            <option value="sl2">🛑 SL2</option>
            <option value="timeout">⏱ 타임아웃</option>
          </select>
        </div>
        {selectedBot !== 'ALL' && (
          <div style={{ fontSize: '11px', color: '#3182f6', background: 'rgba(49, 130, 246, 0.08)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', alignSelf: 'flex-start', marginBottom: '12px' }}>
            필터: {SUB_ACCOUNT_NAMES[selectedBot] || selectedBot}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {displayTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#58606c', fontSize: '14px' }}>최근 체결 내역이 없습니다.</div>
          ) : (
            <div className="live-trades" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayTrades.map((t, i) => (
                <div key={i} className="live-trade-row" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '10px', padding: '10px 12px' }}>
                  <div className="live-trade-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="sub-account-badge bot3">{SUB_ACCOUNT_NAMES[t.botName || ''] || t.botName}</span>
                      <span style={{ fontWeight: '800', color: '#fff', fontSize: '13px' }}>{t.symbol.replace('USDT', '')}</span>
                      <span style={{ fontSize: '9px', fontWeight: '800', color: '#3182f6', background: 'rgba(49, 130, 246, 0.08)', border: '1px solid rgba(49, 130, 246, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>실거래</span>
                      <span style={{ fontSize: '9px', fontWeight: '800', color: t.direction === 'long' ? '#0ecb81' : '#f6465d', background: t.direction === 'long' ? 'rgba(14, 203, 129, 0.08)' : 'rgba(246, 70, 93, 0.08)', border: t.direction === 'long' ? '1px solid rgba(14, 203, 129, 0.15)' : '1px solid rgba(246, 70, 93, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                        {t.direction?.toUpperCase() || 'LONG'}
                      </span>
                    </div>
                    <div className={`live-trade-pnl ${(t.outcome === '진입' || t.outcome === '취소') ? 'muted' : (t.pnlPct >= 0 ? 'green' : 'red')}`} style={{ fontWeight: '800', fontSize: '14px' }}>
                      {(t.outcome === '진입' || t.outcome === '취소') ? '—' : `${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(3)}%`}
                    </div>
                  </div>
                  <div className="live-trade-footer" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#58606c' }}>
                    <span>
                      {outcomeLabel(t.outcome)}
                      {t.outcome === '진입' && ` · 체결가: ${t.entryPrice.toFixed(getTickDecimals(t.symbol))}`}
                      {t.outcome === '취소' && ` · 주문가: ${t.entryPrice.toFixed(getTickDecimals(t.symbol))}`}
                      {t.outcome !== '진입' && t.outcome !== '취소' && ` · ${t.entryPrice.toFixed(getTickDecimals(t.symbol))} ➔ ${t.exitPrice.toFixed(getTickDecimals(t.symbol))}`}
                    </span>
                    <span>{fmt(t.exitTime)} ({ago(t.exitTime)})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
