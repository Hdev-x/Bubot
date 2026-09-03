import { useMemo, useState } from 'react';
import type { OrderSide } from '../types/market';

type Props = {
  code: string;
  currentPrice?: number;
};

export default function OrderTicket({ code, currentPrice }: Props) {
  const [side, setSide] = useState<OrderSide>('buy');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');

  const orderPrice = Number(price || currentPrice || 0);
  const orderQuantity = Number(quantity || 0);
  const estimated = useMemo(() => orderPrice * orderQuantity, [orderPrice, orderQuantity]);

  return (
    <section className="panel order-ticket">
      <div className="panel-header">
        <div>
          <p className="eyebrow">주문</p>
          <h2>{code}</h2>
        </div>
        <div className="side-toggle" aria-label="매수 매도 선택">
          <button className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>
            매수
          </button>
          <button className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>
            매도
          </button>
        </div>
      </div>

      <label className="field">
        <span>수량</span>
        <input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </label>

      <label className="field">
        <span>지정가</span>
        <input
          inputMode="numeric"
          placeholder={currentPrice ? currentPrice.toLocaleString() : '가격 입력'}
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </label>

      <div className="order-summary">
        <span>예상 금액</span>
        <strong>{Number.isFinite(estimated) ? estimated.toLocaleString() : 0}원</strong>
      </div>

      <button className={`primary-action ${side}`}>
        {side === 'buy' ? '매수 준비' : '매도 준비'}
      </button>
    </section>
  );
}
