import type { TradeLog } from '../../../../shared/types/bot';

function fmt(sec: number) {
  return new Date(sec * 1000).toLocaleString('ko-KR', {
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
  return { tp: 'TP', sl1: 'SL1', sl2: 'SL2', sl3: 'SL3', timeout: '타임아웃', '취소': '취소', '진입': '진입' }[o] ?? o;
}

// 거래 내역 우측 사이드 드로어(필터 + 목록). OrderPage에서 JSX와 표기 헬퍼 3개를 옮김 (wp-07 d03).
export default function TradeHistoryDrawer({ isOpen, onClose, trades, displayTrades, loadingTrades, outcomeFilter, setOutcomeFilter }: {
  isOpen: boolean;
  onClose: () => void;
  trades: TradeLog[];
  displayTrades: TradeLog[];
  loadingTrades: boolean;
  outcomeFilter: string;
  setOutcomeFilter: (v: string) => void;
}) {
  return (
    <>
      <div
        className={`side-drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`side-drawer ${isOpen ? 'open' : ''}`}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: '800' }}>
            거래내역
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8e929a',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {([
            {
              value: outcomeFilter,
              onChange: (v: string) => setOutcomeFilter(v),
              isActive: outcomeFilter !== 'ALL',
              options: [
                { value: 'ALL', label: '전체 결과' },
                { value: '진입', label: '진입' },
                { value: '취소', label: '취소' },
                { value: 'tp', label: 'TP' },
                { value: 'sl1', label: 'SL1' },
                { value: 'sl2', label: 'SL2' },
                { value: 'timeout', label: '타임아웃' },
              ],
            },
          ] as const).map((f, i) => (
            <div key={i} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                style={{
                  appearance: 'none', WebkitAppearance: 'none',
                  background: f.isActive ? 'rgba(49,130,246,0.08)' : '#16181d',
                  color: f.isActive ? '#3182f6' : '#8b95a1',
                  border: f.isActive ? '1px solid rgba(49,130,246,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '20px', padding: '5px 28px 5px 12px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', outline: 'none',
                }}
              >
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <svg
                style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                width="8" height="5" viewBox="0 0 8 5" fill="none"
              >
                <path d="M1 1L4 4L7 1" stroke={f.isActive ? '#3182f6' : '#8b95a1'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>

        {/* 목록 스크롤 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {loadingTrades && trades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e929a' }}>
              내역을 불러오는 중...
            </div>
          ) : displayTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#58606c', fontSize: '14px' }}>
              최근 체결 내역이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayTrades.map((t, i) => {
                const isWin = t.pnlPct >= 0;
                const isEntry = t.outcome === '진입';
                const isCancel = t.outcome === '취소';
                const isNoResult = isEntry || isCancel;

                return (
                  <div
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      padding: '12px 2px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    {/* 상단: 봇 이름 + 종목 + 방향 + PnL */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="sub-account-badge bot3" style={{ fontSize: '9px', padding: '1px 4px' }}>
                          {t.botName || 'Worker'}
                        </span>
                        <strong style={{ fontWeight: '700', color: '#fff', fontSize: '14px' }}>
                          {t.symbol.replace('USDT', '')}
                        </strong>
                        <span style={{
                          fontSize: '9px', fontWeight: '700',
                          color: t.direction === 'long' ? '#0ecb81' : '#f6465d',
                          background: t.direction === 'long' ? 'rgba(14, 203, 129, 0.1)' : 'rgba(246, 70, 93, 0.1)',
                          padding: '2px 4px', borderRadius: '2px', marginLeft: '4px'
                        }}>
                          {t.direction === 'long' ? 'Long' : 'Short'}
                        </span>
                      </div>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: isNoResult ? '#8e929a' : (isWin ? '#0ecb81' : '#f6465d') }}>
                        {isNoResult ? '—' : `${isWin ? '+' : ''}${t.pnlPct.toFixed(3)}%`}
                      </div>
                    </div>

                    {/* 중간 가격 정보 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#8e929a', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '8px' }}>
                      <div>
                        <span style={{ color: '#58606c', marginRight: '4px' }}>{isCancel ? '주문가:' : '진입가:'}</span>
                        <span style={{ color: '#edf1f7', fontWeight: '500' }}>{t.entryPrice.toFixed(4)}</span>
                      </div>
                      {!isNoResult && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#58606c', marginRight: '4px' }}>청산가:</span>
                          <span style={{ color: '#edf1f7', fontWeight: '500' }}>{t.exitPrice.toFixed(4)}</span>
                        </div>
                      )}
                    </div>

                    {/* 하단: 결과 라벨 + 시간 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#58606c', marginTop: '2px' }}>
                      <span style={{
                        color: isEntry ? '#0ecb81' : isCancel ? '#8e929a' : t.outcome === 'tp' ? '#0ecb81' : t.outcome?.startsWith('sl') ? '#f6465d' : '#8e929a',
                        fontWeight: '600'
                      }}>
                        {outcomeLabel(t.outcome)}
                      </span>
                      <span>{fmt(t.exitTime)} ({ago(t.exitTime)})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
