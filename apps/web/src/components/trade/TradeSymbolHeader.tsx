// Trade 페이지 종목 헤더 — 선물/현물 공유. 스티키/스냅(.trade-symbol-row) 보존 위해
// 루트를 그대로 <section className="trade-symbol-row">로 반환(추가 래퍼 없음).
import { EXCHANGES, type ExchangeId } from '../../constants/exchanges';

type Props = {
  symbol: string;
  market: 'spot' | 'futures';  // 라벨 결정(마켓 선택은 톱 탭)
  changePct: string;           // 등락 표기(현재 정적 목업)
  exchange?: ExchangeId;       // 현재 거래소 — 배지/스위처
  onSymbolClick?: () => void;  // 종목명 탭 → 종목 선택 시트
  onExchangeClick?: () => void; // 거래소 배지(▾) 탭 → 거래소 선택 시트
  mmr?: number;                // 유지증거금률(비율). 현재 종목 포지션 있을 때만 표시
};

export default function TradeSymbolHeader({ symbol, market, changePct, exchange = 'BITGET', onSymbolClick, onExchangeClick, mmr }: Props) {
  const marketLabel = market === 'futures' ? 'Perpetual' : 'Spot';
  const ex = EXCHANGES[exchange];
  return (
    <section className="trade-symbol-row">
      <div className="symbol-info">
        <div className="symbol-selector">
          {/* 종목명 탭 → 종목 선택 바텀시트 (Bitget Trade 동작) */}
          <button
            type="button"
            onClick={onSymbolClick}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <h1>{market === 'futures' ? `${symbol}.P` : symbol}</h1>
            <span className="dropdown-arrow">▾</span>
          </button>
          {/* 거래소 배지 — ▾ 눌러 거래소 선택 시트 오픈(거래소 전환) */}
          <button
            type="button"
            className="trade-exchange-badge"
            onClick={onExchangeClick}
            style={{ background: 'none', border: 'none', padding: 0, cursor: onExchangeClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', color: ex.color }}
          >
            <img className="trade-exchange-logo" src={ex.logo} alt="" aria-hidden="true" />
            <span className="trade-exchange-name">{ex.label}</span>
            {onExchangeClick && <span className="dropdown-arrow" style={{ marginLeft: '2px' }}>▾</span>}
          </button>
        </div>
        <p className="perpetual-label">{marketLabel} <span className="down-pct">{changePct}</span></p>
      </div>
      <div className="trade-symbol-actions">
        {/* 유지증거금률(MMR) — 현재 종목 포지션 있을 때만. 표시 전용(클릭 동작 없음) */}
        {mmr != null && mmr > 0 && (
          <div className="gauge-badge">
            <span className="gauge-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <path d="M3.4 11.8a6.2 6.2 0 1 1 11.2-.2" stroke="#36d794" strokeWidth="2.2" strokeLinecap="round" />
                <path d="M3.4 11.8a6.2 6.2 0 0 1 2.4-7.4" stroke="#f5c84b" strokeWidth="2.2" strokeLinecap="round" />
                {/* 바늘(침) — 중심에서 위쪽으로 */}
                <line x1="9" y1="9" x2="6.4" y2="5.6" stroke="#eaecef" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="9" cy="9" r="2" fill="#111318" />
                <circle cx="9" cy="9" r="0.9" fill="#eaecef" />
              </svg>
            </span>
            <span className="gauge-text">{(mmr * 100).toFixed(2)}%</span>
          </div>
        )}
        <button className="action-icon-btn more-action-btn" aria-label="더보기">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="2" y="6.5" width="3" height="3" rx="0.6" />
            <rect x="6.5" y="6.5" width="3" height="3" rx="0.6" />
            <rect x="11" y="6.5" width="3" height="3" rx="0.6" />
          </svg>
        </button>
      </div>
    </section>
  );
}
