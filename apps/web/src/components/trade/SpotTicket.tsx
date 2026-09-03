import { useState } from 'react';

// 현물 주문 티켓(보기 전용 목업) — 선물과 달리 레버리지·마진·Open/Close 없음.
// 매수/매도 + 가격·수량. className은 선물 티켓 스타일을 재사용한다.

type Props = {
  baseCoin: string;       // 예: BTC (symbol에서 USDT 제거)
  usdtAvailable: number;  // 현물 USDT 주문가능
};

export default function SpotTicket({ baseCoin, usdtAvailable }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const isBuy = side === 'buy';

  return (
    <form className="futures-ticket" onSubmit={(e) => e.preventDefault()}>
      <div className="open-close-toggle">
        <button type="button" className={isBuy ? 'active' : ''} onClick={() => setSide('buy')}>
          Buy
        </button>
        <button type="button" className={!isBuy ? 'active' : ''} onClick={() => setSide('sell')}>
          Sell
        </button>
      </div>

      <button type="button" className="trade-select">
        <span><span className="info-circle">ⓘ</span> Limit</span>
        <span className="arrow-down">▾</span>
      </button>

      <div className="trade-input-wrapper">
        <span className="input-label">Price</span>
        <input inputMode="decimal" className="val-input" aria-label="Price" />
        <button type="button" className="currency-selector">
          <span>USDT</span>
        </button>
      </div>

      <div className="trade-input-wrapper">
        <span className="input-label">Amount</span>
        <input inputMode="decimal" className="val-input" aria-label="Amount" />
        <button type="button" className="currency-selector">
          <span>{baseCoin}</span>
        </button>
      </div>

      <div className="percent-row">
        <button type="button" className="pct-btn">25%</button>
        <button type="button" className="pct-btn">50%</button>
        <button type="button" className="pct-btn">75%</button>
        <button type="button" className="pct-btn">100%</button>
      </div>

      <div className="balance-lines">
        <div className="balance-line">
          <span className="label">Available</span>
          <span className="value">
            {usdtAvailable.toFixed(4)} USDT
            <button type="button" className="add-funds-btn">+</button>
          </span>
        </div>
      </div>

      <button type="button" className={isBuy ? 'long-button' : 'short-button'}>
        <strong>{isBuy ? 'Buy' : 'Sell'} {baseCoin}</strong>
        <span>0.00 USDT</span>
      </button>
    </form>
  );
}
