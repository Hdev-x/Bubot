import { SUB_ACCOUNT_NAMES } from '../../config/bots';
import { useCurrency } from '@web/shared/contexts/CurrencyContext';

export interface LivePositionTabProps {
  mainStatus: any;
  displayPositions: any[];
  realtimePrices: Record<string, number>;
  botResults: Record<string, any>;
  usdKrw: number;
  getTickDecimals: (symbol: string) => number;
  onSelectSymbol?: (symbol: string) => void;
  onProductTypeChange?: (type: 'spot' | 'futures') => void;
  onOpenChart?: () => void;
}

export default function LivePositionTab({
  mainStatus, displayPositions, realtimePrices,
  botResults, usdKrw, getTickDecimals,
  onSelectSymbol, onProductTypeChange, onOpenChart
}: LivePositionTabProps) {
  const { displayCurrency } = useCurrency();
  return (
    <div style={{ paddingBottom: '24px' }}>
      {/* 메인(수동) 포지션은 Trade 탭 전용 — Bot 탭은 봇 포지션만 표시(자동매매 모니터링 전용) */}

      {/* 서브 계정 봇 포지션 */}
      {displayPositions.length === 0 ? (
        <div className="live-no-pos" style={{ paddingLeft: '2px', fontSize: '12px', color: '#58606c', paddingTop: '20px' }}>
          현재 진입 중인 포지션이 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 2px' }}>
          {displayPositions.map((pos, i) => {
            const res = botResults[pos.botName || ''];
            const price = realtimePrices[pos.symbol] ?? (res?.success && res.data ? (res.data.lastPrice[pos.symbol] ?? pos.entryPrice) : pos.entryPrice);
            const unrealized = (pos.direction === 'long' ? 1 : -1) * (price - pos.entryPrice) / pos.entryPrice * 100;
            const leverage = 5;
            const sizeUsdt = pos.size * price;
            const marginUsdt = sizeUsdt / leverage;
            const unrealizedUsdt = sizeUsdt * (unrealized / 100);
            return (
              <div key={i} className="bitget-position-card" style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px 14px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#8e929a' }} />
                    <span style={{ fontSize: '10px', color: '#8e929a', fontWeight: '600' }}>
                      {pos.botName === 'Worker' ? 'Worker' : (SUB_ACCOUNT_NAMES[pos.botName || ''] || pos.botName)}
                    </span>
                  </div>
                  <strong 
                    style={{ color: '#fff', fontSize: '16px', fontWeight: '800', marginLeft: '2px', marginRight: '2px', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.3)', textUnderlineOffset: '3px' }}
                    onClick={() => {
                      if (onSelectSymbol) onSelectSymbol(pos.symbol);
                      if (onProductTypeChange) onProductTypeChange('futures');
                      if (onOpenChart) onOpenChart();
                    }}
                  >
                    {pos.symbol.replace('USDT', '')}
                  </strong>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: pos.direction === 'long' ? '#0ecb81' : '#f6465d', background: pos.direction === 'long' ? 'rgba(14, 203, 129, 0.1)' : 'rgba(246, 70, 93, 0.1)', border: pos.direction === 'long' ? '1px solid rgba(14,203,129,0.18)' : '1px solid rgba(246,70,93,0.18)', padding: '2px 6px', borderRadius: '4px' }}>
                    {pos.direction === 'long' ? 'LONG' : 'SHORT'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#8e929a', background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{leverage}x</span>
                  <span style={{ fontSize: '10px', color: '#8e929a', background: 'rgba(255, 255, 255, 0.045)', border: '1px solid rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Isolated</span>
                </div>
                <div className="live-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px 8px', marginBottom: '16px', background: 'rgba(255,255,255,0.015)', borderRadius: '10px', padding: '12px 8px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#8b95a1', marginBottom: '3px', fontWeight: 600 }}>PnL</div>
                    <div style={{ fontSize: '17px', color: unrealized >= 0 ? '#0ecb81' : '#f6465d', fontWeight: '800', letterSpacing: '-0.2px' }}>
                      {unrealized >= 0 ? '+' : ''}{displayCurrency === 'USDT' ? unrealizedUsdt.toFixed(2) : `${Math.round(unrealizedUsdt * usdKrw).toLocaleString()}원`}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#8b95a1', marginBottom: '3px', fontWeight: 600 }}>Margin</div>
                    <div style={{ fontSize: '15px', color: '#fff', fontWeight: '750' }}>{marginUsdt.toFixed(4)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#8b95a1', marginBottom: '3px', fontWeight: 600 }}>ROE %</div>
                    <div style={{ fontSize: '17px', color: unrealized >= 0 ? '#0ecb81' : '#f6465d', fontWeight: '800', letterSpacing: '-0.2px' }}>
                      {unrealized >= 0 ? '+' : ''}{(unrealized * leverage).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px', fontWeight: 600 }}>Size</div>
                    <div style={{ fontSize: '14px', color: '#fff', fontWeight: '700' }}>{pos.size}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px', fontWeight: 600 }}>Entry Price</div>
                    <div style={{ fontSize: '14px', color: '#fff', fontWeight: '700' }}>{pos.entryPrice.toFixed(getTickDecimals(pos.symbol))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#58606c', marginBottom: '3px', fontWeight: 600 }}>Liq. Price</div>
                    <div style={{ fontSize: '14px', color: '#f3ba2f', fontWeight: '700' }}>
                      {pos.direction === 'long' ? (pos.entryPrice * 0.955).toFixed(2) : (pos.entryPrice * 1.045).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
