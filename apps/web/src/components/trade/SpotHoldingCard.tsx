// 현물 보유자산 상세 카드 (하단 Holdings 탭) — 선물 PositionCard와 동일 스타일(.position-card).
// 한국거래소 기준 필드: 평가손익·수익률·평가금액·매수금액·현재가·매수평균가·보유수량·비중.
// 매입가(avgCost)는 체결내역 재구성값. 없거나 신뢰불가면 사용자가 직접 입력 가능(costSource='manual').
import type { SpotHolding } from '../../api/server/spotTradeApi';
import { useSettings, currencyLabel } from '../../contexts/CurrencyContext';
import { useUsdKrw } from '../../hooks/market/useUsdKrw';

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export default function SpotHoldingCard({
  holding: h,
  price,
  weight,
  onOpen,
  onEditCost,
}: {
  holding: SpotHolding;
  price: number; // 현재가(USDT). 현금(USDT/USDC)은 1
  weight?: number; // 전체 현물 자산 대비 비중(%)
  onOpen?: () => void;
  onEditCost?: () => void; // 매수평균가 직접 입력 시트 열기
}) {
  const { displayCurrency, isHideBalance } = useSettings();
  const usdKrw = useUsdKrw();

  const cash = h.coin === 'USDT' || h.coin === 'USDC';
  const amount = h.available + h.frozen;
  const value = amount * price;               // 평가금액
  const costOk = h.avgCost != null && h.costReliable === true;
  const isManual = costOk && h.costSource === 'manual';
  const cost = costOk ? (h.avgCost as number) * amount : null; // 매수금액
  const pnl = costOk ? value - (cost as number) : null;        // 평가손익
  const pct = costOk ? (price / (h.avgCost as number) - 1) * 100 : null;
  const up = (pnl ?? 0) >= 0;

  // 금액(평가금액·매수금액·손익) — 통화 토글
  const money = (usdt: number | null): string => {
    if (usdt == null) return '—';
    if (isHideBalance) return '••••';
    return displayCurrency === 'KRW'
      ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
      : usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const signed = (usdt: number | null): string => {
    if (usdt == null) return '—';
    if (isHideBalance) return '••••';
    return `${usdt >= 0 ? '+' : '-'}${money(Math.abs(usdt))}`;
  };
  const mask = (v: string) => (isHideBalance ? '••••' : v);

  return (
    <div className="position-card">
      <div className="poscard-head">
        <button type="button" className="poscard-symbol" onClick={onOpen}>
          {h.coin}<span className="chev">›</span>
        </button>
        <span className="pc-badge">현물</span>
      </div>

      <div className="poscard-grid">
        <div className="pc-cell span2">
          <span className="k">평가손익 ({currencyLabel(displayCurrency)})</span>
          <span className={`v big ${pnl == null ? '' : up ? 'up' : 'down'}`}>{signed(pnl)}</span>
        </div>
        <div className="pc-cell right">
          <span className="k">수익률</span>
          <span className={`v ${pct == null ? '' : pct >= 0 ? 'up' : 'down'}`}>
            {pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}
          </span>
        </div>

        <div className="pc-cell">
          <span className="k">보유수량</span>
          <span className="v">{mask(amount.toLocaleString('en-US', { maximumFractionDigits: 6 }))}</span>
        </div>
        <div className="pc-cell nudge">
          <span className="k">현재가</span>
          <span className="v">{cash ? '—' : mask(fmtPrice(price))}</span>
        </div>
        <div className="pc-cell right">
          <span className="k">평가금액 ({currencyLabel(displayCurrency)})</span>
          <span className="v">{money(value)}</span>
        </div>

        <div className="pc-cell">
          <span className="k">비중</span>
          <span className="v">{weight == null ? '—' : `${weight.toFixed(1)}%`}</span>
        </div>
        <div className="pc-cell nudge">
          <span className="k">매수평균가</span>
          {cash ? (
            <span className="v">—</span>
          ) : costOk && !isManual ? (
            <span className="v">{mask(fmtPrice(h.avgCost as number))}</span>
          ) : (
            // 수동 입력값 또는 조회불가(직접입력) — 펜슬 탭하면 하단 시트로 편집
            <span className="pc-cost-row">
              <span className={`v ${isManual ? '' : 'pc-cost-prompt'}`}>
                {isManual ? mask(fmtPrice(h.avgCost as number)) : '직접입력'}
              </span>
              <button type="button" className="pc-edit-ico" onClick={onEditCost} aria-label="매수평균가 입력">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            </span>
          )}
        </div>
        <div className="pc-cell right">
          <span className="k">매수금액 ({currencyLabel(displayCurrency)})</span>
          <span className="v">{money(cost)}</span>
        </div>
      </div>
    </div>
  );
}
