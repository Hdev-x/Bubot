// 플랜(TP/SL 트리거) 미체결 주문 카드 — Bitget 미체결 디자인 정합.
import type { MainPlanOrder } from '../../api/mainTradeApi';

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

function fmtTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function PlanOrderCard({
  order: o,
  leverage,
  marginMode,
  onOpen,
}: {
  order: MainPlanOrder;
  leverage?: number;    // 같은 종목 포지션의 레버리지(있으면 배지 표시)
  marginMode?: string;  // 플랜 주문 응답에 marginMode가 비어 포지션에서 보정
  onOpen?: () => void;
}) {
  const mode = marginMode || o.marginMode;
  const isTP = /profit/.test(o.planType);
  const isSL = /loss/.test(o.planType);
  const planLabel = isTP ? 'Position TP' : isSL ? 'Position SL' : 'Trigger';
  // posSide 우선, 없으면 close long=sell 규칙으로 추정
  const posLong = o.posSide ? o.posSide === 'long' : o.side === 'sell';
  const isClose = o.tradeSide === 'close' || isTP || isSL;
  const sideLabel = `${isClose ? 'Close' : 'Open'} ${posLong ? 'long' : 'short'}`;
  const cmp = isTP ? (posLong ? '≥' : '≤') : isSL ? (posLong ? '≤' : '≥') : '';
  const reduceOnly = isClose;
  const base = o.symbol.replace(/USDT$|USDC$/, '');
  const qty = reduceOnly ? 'All closable' : String(o.size);
  const exec = o.executePrice > 0 ? fmtPrice(o.executePrice) : 'Market price';
  const triggerTypeLabel = o.orderType === 'market' || o.executePrice <= 0 ? 'Market price' : 'Limit';

  return (
    <div className="position-card">
      <div className="poscard-head">
        <button type="button" className="poscard-symbol" onClick={onOpen}>
          {o.symbol}<span className="chev">›</span>
        </button>
        <span className="ordcard-time">{fmtTime(o.cTime)}</span>
      </div>

      <div className="poscard-badges">
        <span className="pc-badge close">{sideLabel}</span>
        {leverage ? <span className="pc-badge">{Math.round(leverage)}x</span> : null}
        <span className="pc-badge">{mode === 'crossed' ? 'Cross' : 'Isolated'}</span>
        <span className="pc-badge">{planLabel}</span>
        <span className="pc-badge">USDT</span>
      </div>

      <div className="poscard-grid">
        <div className="pc-cell">
          <span className="k">Trigger price(USDT)</span>
          <span className="v">{cmp}{fmtPrice(o.triggerPrice)}</span>
        </div>
        <div className="pc-cell">
          <span className="k">Order quantity ({base})</span>
          <span className="v">{qty}</span>
        </div>
        <div className="pc-cell right">
          <span className="k">Trigger types</span>
          <span className="v">{triggerTypeLabel}</span>
        </div>
        <div className="pc-cell">
          <span className="k">Execute price(USDT)</span>
          <span className="v">{exec}</span>
        </div>
        <div className="pc-cell">
          <span className="k">Reduce-only</span>
          <span className="v">{reduceOnly ? 'Yes' : 'No'}</span>
        </div>
      </div>
    </div>
  );
}
