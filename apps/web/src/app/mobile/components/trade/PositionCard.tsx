// 포지션 카드 (Bitget 정합) — Trade 탭과 Bot 탭이 공유하는 단일 컴포넌트.
// 일부 필드(margin/mmr/realizedPl/liqPrice/tp/sl)는 출처에 따라 없을 수 있어 방어적으로 '—' 표시.
import { useSettings, currencyLabel } from '../../../../shared/contexts/CurrencyContext';
import { useUsdKrw } from '../../../../hooks/market/useUsdKrw';
import './trade.css';

export type PositionCardData = {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  markPrice: number;
  unrealizedPl: number;
  leverage: number;
  marginMode: string;
  liqPrice?: number;
  mmr?: number;        // 비율(×100 = %)
  margin?: number;
  realizedPl?: number;
  takeProfit?: number;
  stopLoss?: number;
};

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export default function PositionCard({
  position: p,
  sourceLabel,
  onOpen,
}: {
  position: PositionCardData;
  sourceLabel?: string; // 'MAIN'/'메인'/봇이름 등 출처 태그 (없으면 미표시)
  onOpen?: () => void;  // 종목/차트 아이콘 클릭
}) {
  const { displayCurrency, isHideBalance } = useSettings();
  const usdKrw = useUsdKrw();
  // PnL 통화 표기 — 토글(USDT/KRW) 연동. 부호 포함 문자열.
  const pnlText = (usdt: number): string => {
    if (isHideBalance) return '••••';
    const sign = usdt >= 0 ? '+' : '';
    return displayCurrency === 'KRW'
      ? `${sign}${Math.round(usdt * usdKrw).toLocaleString()}원`
      : `${sign}${usdt.toFixed(4)}`;
  };
  // 보조(≈) 줄 — 메인의 반대 통화로 환산.
  const pnlApprox = (usdt: number): string => {
    if (isHideBalance) return '≈ ••••';
    return displayCurrency === 'USDT'
      ? `≈ ${Math.round(Math.abs(usdt) * usdKrw).toLocaleString()}원`
      : `≈ $${Math.abs(usdt).toFixed(2)}`;
  };

  const up = p.unrealizedPl >= 0;
  // ROE(증거금 기준 수익률) 근사 = 가격변화율 × 레버리지 × 방향
  const roe = p.entryPrice > 0
    ? ((p.markPrice - p.entryPrice) / p.entryPrice) * 100 * p.leverage * (p.direction === 'long' ? 1 : -1)
    : 0;
  const sizeUsdt = p.size * p.markPrice;
  const hasMargin = Number.isFinite(p.margin as number);
  const hasMmr = Number.isFinite(p.mmr as number);
  const hasRealized = Number.isFinite(p.realizedPl as number);
  const liq = p.liqPrice ?? 0;
  const tp = p.takeProfit ?? 0;
  const sl = p.stopLoss ?? 0;

  return (
    <div className="position-card">
      <div className="poscard-head">
        <button type="button" className="poscard-symbol" onClick={onOpen}>
          {sourceLabel ? <span className="pc-badge src">{sourceLabel}</span> : null}
          {p.symbol}<span className="chev">›</span>
        </button>
      </div>

      <div className="poscard-badges">
        <span className={`pc-badge side ${p.direction}`}>{p.direction === 'long' ? 'Long' : 'Short'}</span>
        <span className="pc-badge">{Math.round(p.leverage)}x</span>
        <span className="pc-badge">{p.marginMode === 'crossed' ? 'Cross' : 'Isolated'}</span>
        <span className="pc-badge">USDT</span>
      </div>

      <div className="poscard-grid">
        <div className="pc-cell span2">
          <span className="k">Unrealized PnL ({currencyLabel(displayCurrency)})</span>
          <span className={`v big ${up ? 'up' : 'down'}`}>
            {pnlText(p.unrealizedPl)}
            <em>{pnlApprox(p.unrealizedPl)}</em>
          </span>
        </div>
        <div className="pc-cell right">
          <span className="k">ROE</span>
          <span className={`v big ${up ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</span>
        </div>

        <div className="pc-cell">
          <span className="k">Size (USDT)</span>
          <span className="v">{sizeUsdt.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
        </div>
        <div className="pc-cell">
          <span className="k">Margin (USDT)</span>
          <span className="v">{hasMargin ? p.margin!.toFixed(4) : '—'}</span>
        </div>
        <div className="pc-cell right">
          <span className="k">MMR</span>
          <span className="v">{hasMmr ? (p.mmr! * 100).toFixed(2) + '%' : '—'}</span>
        </div>

        <div className="pc-cell">
          <span className="k">Entry price</span>
          <span className="v">{fmtPrice(p.entryPrice)}</span>
        </div>
        <div className="pc-cell">
          <span className="k">Mark price</span>
          <span className="v">{fmtPrice(p.markPrice)}</span>
        </div>
        <div className="pc-cell right">
          <span className="k">Est. liq. price</span>
          <span className="v liq">{liq > 0 ? fmtPrice(liq) : '—'}</span>
        </div>
      </div>

      <div className="poscard-sub">
        <div className="sub-row">
          <span className="k">Realized PnL ({currencyLabel(displayCurrency)})</span>
          <span className={`v ${hasRealized && p.realizedPl! < 0 ? 'down' : 'up'}`}>
            {hasRealized ? pnlText(p.realizedPl!) : '—'}
          </span>
        </div>
        <div className="sub-row">
          <span className="k">Entire TP/SL</span>
          <span className="v">
            <span className="up">{tp > 0 ? fmtPrice(tp) : '—'}</span>
            <span className="tpsl-sep">/</span>
            <span className="down">{sl > 0 ? fmtPrice(sl) : '—'}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
