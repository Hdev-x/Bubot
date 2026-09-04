import type { Dispatch, SetStateAction } from 'react';
import type { SpotHolding } from '../../../../api/server/spotTradeApi';
import type { useMainTrade } from '../../../../hooks/account/useMainTrade';
import type { useSpotTrade } from '../../../../hooks/account/useSpotTrade';
import PositionCard from './PositionCard';
import PlanOrderCard from './PlanOrderCard';
import SpotHoldingCard from './SpotHoldingCard';

type MainTradeData = ReturnType<typeof useMainTrade>['data'];
type SpotTradeData = ReturnType<typeof useSpotTrade>['data'];

// 포지션·미체결(계정) 가격 표기 — 큰 값은 천단위, 작은 값은 소수 유지.
// (호가용 fmtPrice는 호가 훅에 따로 있음 — 단위 묶음에 종속이라 계정 표시엔 부적합)
function fmtAcctPrice(n: number) {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export type PositionsPanelProps = {
  trade: {
    mainTrade: MainTradeData;
    spotTrade: SpotTradeData;
    visiblePositions: MainTradeData['positions'];
    visibleOrders: MainTradeData['orders'];
    visiblePlanOrders: MainTradeData['planOrders'];
    visibleSpotOrders: SpotTradeData['orders'];
    spotCoinHoldings: SpotHolding[];
    spotPriceOf: (coin: string) => number;
  };
  view: {
    isFuturesMarket: boolean;
    positionActiveTab: 'positions' | 'orders';
    setPositionActiveTab: Dispatch<SetStateAction<'positions' | 'orders'>>;
    showCurrentOnly: boolean;
    setShowCurrentOnly: Dispatch<SetStateAction<boolean>>;
  };
  actions: {
    onOpenChart?: () => void;
    onSelectSymbol?: (symbol: string) => void;
    setCostEditHolding: Dispatch<SetStateAction<SpotHolding | null>>;
    setIsHistoryOpen: Dispatch<SetStateAction<boolean>>;
  };
};

// 하단 포지션/주문 현황 영역 — Positions·Holdings·Orders 탭. OrderPage에서 JSX만 옮김 (wp-07 d03).
export default function PositionsPanel({ trade, view, actions }: PositionsPanelProps) {
  const { mainTrade, spotTrade, visiblePositions, visibleOrders, visiblePlanOrders, visibleSpotOrders, spotCoinHoldings, spotPriceOf } = trade;
  const { isFuturesMarket, positionActiveTab, setPositionActiveTab, showCurrentOnly, setShowCurrentOnly } = view;
  const { onOpenChart, onSelectSymbol, setCostEditHolding, setIsHistoryOpen } = actions;
  return (
          <section className="positions-panel">
            {/* 종목 헤더 아래에 함께 고정되는 헤더 스택(탭줄 + Show current/Close all). 그 밑으로 목록만 스크롤 */}
            <div className="positions-header">
            <div className="position-tabs">
              <button
                className={positionActiveTab === 'positions' ? 'active' : ''}
                onClick={() => setPositionActiveTab('positions')}
              >
                {isFuturesMarket ? 'Positions' : 'Holdings'}({isFuturesMarket ? visiblePositions.length : spotCoinHoldings.length})
              </button>
              <button
                className={positionActiveTab === 'orders' ? 'active' : ''}
                onClick={() => setPositionActiveTab('orders')}
              >
                Orders({isFuturesMarket ? visibleOrders.length + visiblePlanOrders.length : visibleSpotOrders.length}) <span className="tab-arrow-down">▾</span>
              </button>
              {/* 거래내역 — 채운 시계(바늘만 공백). 탭 줄 우측 끝(거터)에 정렬 */}
              <button className="tabs-history-btn" aria-label="거래내역" onClick={() => setIsHistoryOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M10.8 7 H13.2 V10.8 H16.8 V13.2 H10.8 Z" />
                </svg>
              </button>
            </div>

            <div className="position-tools">
              <label className="show-current-label">
                <input
                  type="checkbox"
                  checked={showCurrentOnly}
                  onChange={(e) => setShowCurrentOnly(e.target.checked)}
                />
                <span className="checkbox-dummy" />
                Show current
              </label>
            </div>
            </div>

            {/* 헤더(스냅 고정) 아래 콘텐츠만 영역 내부 스크롤 — 포지션 많을 때만 스크롤 */}
            <div className="positions-scroll">
            {/* Positions 탭 (선물) — 실데이터 있으면 행, 없으면 빈 상태 */}
            {positionActiveTab === 'positions' && isFuturesMarket && (
              visiblePositions.length > 0 ? (
                <div className="position-list">
                  {visiblePositions.map((p) => (
                    <PositionCard key={p.symbol + p.direction} position={p} onOpen={() => onSelectSymbol?.(p.symbol)} />
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    {/* 입체적인 다크 폴더/서류철 아이콘 */}
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                      <rect x="22" y="32" width="20" height="2" rx="1" fill="#2C313C" />
                      <rect x="26" y="38" width="12" height="2" rx="1" fill="#2C313C" />
                    </svg>
                  </div>
                  <p className="available-balance-text">Available: {mainTrade.available.toFixed(4)} USDT</p>
                  <p className="description-text">
                    {mainTrade.hasKey ? 'No open positions' : 'MAIN 키를 등록하면 실시간 포지션이 표시됩니다.'}
                  </p>

                  <div className="empty-action-buttons">
                    <button type="button" className="empty-action-btn">Copy/Bot</button>
                    <button type="button" className="empty-action-btn">Demo trading</button>
                    <button type="button" className="empty-action-btn">Futures Kickoff</button>
                  </div>
                </div>
              )
            )}

            {/* Holdings 탭 (현물 보유자산) */}
            {positionActiveTab === 'positions' && !isFuturesMarket && (
              spotCoinHoldings.length > 0 ? (
                <div className="position-list">
                  {(() => {
                    const totalValue = spotTrade.holdings.reduce(
                      (s, h) => s + (h.available + h.frozen) * spotPriceOf(h.coin), 0);
                    return [...spotCoinHoldings]
                      .sort((a, b) => (b.available + b.frozen) * spotPriceOf(b.coin) - (a.available + a.frozen) * spotPriceOf(a.coin))
                      .map((h) => (
                        <SpotHoldingCard
                          key={h.coin}
                          holding={h}
                          price={spotPriceOf(h.coin)}
                          weight={totalValue > 0 ? ((h.available + h.frozen) * spotPriceOf(h.coin)) / totalValue * 100 : 0}
                          onOpen={() => onSelectSymbol?.(`${h.coin}USDT`)}
                          onEditCost={() => setCostEditHolding(h)}
                        />
                      ));
                  })()}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="available-balance-text">Available: {spotTrade.usdtAvailable.toFixed(4)} USDT</p>
                  <p className="description-text">
                    {spotTrade.hasKey ? 'No spot holdings' : 'MAIN 키를 등록하면 현물 보유자산이 표시됩니다.'}
                  </p>
                </div>
              )
            )}

            {/* Orders 탭 (선물) — 미체결 주문 */}
            {positionActiveTab === 'orders' && isFuturesMarket && (
              (visiblePlanOrders.length + visibleOrders.length) > 0 ? (
                <div className="order-list">
                  {/* TP/SL 플랜(트리거) 주문 — Bitget 미체결 카드 디자인 */}
                  {visiblePlanOrders.map((o) => (
                    <PlanOrderCard
                      key={o.orderId}
                      order={o}
                      leverage={mainTrade.positions.find((p) => p.symbol === o.symbol)?.leverage}
                      marginMode={mainTrade.positions.find((p) => p.symbol === o.symbol)?.marginMode}
                      onOpen={onOpenChart}
                    />
                  ))}
                  {/* 일반 지정가·시장가 미체결 */}
                  {visibleOrders.map((o) => (
                    <div className="position-row" key={o.orderId}>
                      <div className="pos-row-top">
                        <span className={`pos-side ${o.side === 'buy' ? 'long' : 'short'}`}>
                          {o.side === 'buy' ? 'Buy' : 'Sell'}{o.tradeSide ? ` · ${o.tradeSide}` : ''}
                        </span>
                        <span className="pos-symbol">{o.symbol}</span>
                        <span className="pos-lev">{o.orderType}</span>
                      </div>
                      <div className="pos-row-grid">
                        <div className="pos-cell">
                          <span className="k">Price</span><span className="v">{fmtAcctPrice(o.price)}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Amount</span><span className="v">{o.size}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Filled</span><span className="v">{o.filledQty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="description-text">No open orders</p>
                </div>
              )
            )}

            {/* Orders 탭 (현물) — 미체결 주문 */}
            {positionActiveTab === 'orders' && !isFuturesMarket && (
              visibleSpotOrders.length > 0 ? (
                <div className="order-list">
                  {visibleSpotOrders.map((o) => (
                    <div className="position-row" key={o.orderId}>
                      <div className="pos-row-top">
                        <span className={`pos-side ${o.side === 'buy' ? 'long' : 'short'}`}>
                          {o.side === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                        <span className="pos-symbol">{o.symbol}</span>
                        <span className="pos-lev">{o.orderType}</span>
                      </div>
                      <div className="pos-row-grid">
                        <div className="pos-cell">
                          <span className="k">Price</span><span className="v">{fmtAcctPrice(o.price)}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Amount</span><span className="v">{o.size}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Filled</span><span className="v">{o.filledQty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="description-text">No open orders</p>
                </div>
              )
            )}
            </div>
          </section>
  );
}
