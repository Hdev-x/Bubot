import type { Dispatch, SetStateAction } from 'react';
import type { MainPosition } from '../../../api/server/mainTradeApi';
import type { SpotHolding } from '../../../api/server/spotTradeApi';
import type { useMainTrade } from '../../../hooks/account/useMainTrade';
import type { useSpotTrade } from '../../../hooks/account/useSpotTrade';
import { fmtAsset, logoClass, calcRoe } from '../lib/format';
import { INVEST_TABS, type InvestTab } from '../lib/sections';
import { SidebarAssetSkeleton } from './SidebarBits';

// 사이드바 "내 투자" 섹션 — 선물/현물 자산·포지션 목록. DesktopApp에서 JSX만 옮김 (wp-06 d02).
// props는 성격별 묶음 5개(main·spot·currency·view·actions). 값·핸들러는 전부 DesktopApp이 계산·소유한다.
export type InvestSectionProps = {
  main: {
    trade: ReturnType<typeof useMainTrade>['data'];
    hasKey: boolean;
    positions: MainPosition[];
    available: number;
    unrealTotal: number;
    mainVal: string;
    approx: string;
    mainSkeleton: boolean;
    selPos: MainPosition | undefined;
  };
  spot: {
    spot: ReturnType<typeof useSpotTrade>['data'];
    spotSorted: SpotHolding[];
    spotTotal: number;
    spotValueOf: (h: SpotHolding) => number;
    spotPriceOf: (coin: string) => number;
    spotSkeleton: boolean;
  };
  currency: {
    krw: boolean;
    usdKrw: number;
    curLabel: string;
    fmtCur: (usdt: number) => string;
    approxCur: (usdt: number) => string;
  };
  view: {
    investTab: InvestTab;
    setInvestTab: Dispatch<SetStateAction<InvestTab>>;
    portfolioOn: boolean;
    positionsOn: boolean;
    togglePortfolio: () => void;
    togglePositions: () => void;
    bothOn: boolean;
    walletOpen: boolean;
    setWalletOpen: Dispatch<SetStateAction<boolean>>;
  };
  actions: {
    handleSelectChart: (symbol: string, market: string, exchange: string) => void;
    setSelPosIdx: Dispatch<SetStateAction<number>>;
  };
};

export function InvestSection({ main, spot: sp, currency, view, actions }: InvestSectionProps) {
  const { trade, hasKey, positions, available, unrealTotal, mainVal, approx, mainSkeleton, selPos } = main;
  const { spot, spotSorted, spotTotal, spotValueOf, spotPriceOf, spotSkeleton } = sp;
  const { krw, usdKrw, curLabel, fmtCur, approxCur } = currency;
  const { investTab, setInvestTab, portfolioOn, positionsOn, togglePortfolio, togglePositions, bothOn, walletOpen, setWalletOpen } = view;
  const { handleSelectChart, setSelPosIdx } = actions;
  return (
            <div className={`sidebar-section${bothOn ? ' both-on' : ''}`} id="sidebar-invest">
              <div className="invest-tabs">
                {INVEST_TABS.map((t) => (
                  <button key={t} className={`invest-tab${investTab === t ? ' active' : ''}`} onClick={() => setInvestTab(t)}>{t}</button>
                ))}
              </div>

              {(investTab === '현물') ? (
                spotSkeleton ? <SidebarAssetSkeleton /> : (
                <div className="assets-scroll">
                  <div className="tas-hero">
                    <span className="tas-hero-label">총자산</span>
                    <div className="tas-hero-row">
                      <strong className="tas-hero-val">{spot.hasKey ? (krw ? Math.round(spotTotal * usdKrw).toLocaleString() : fmtAsset(spotTotal)) : '—'}</strong>
                      <span className="tas-cur">{curLabel}</span>
                    </div>
                    {spot.hasKey && (
                      <span className="tas-hero-approx">{krw ? `≈ ${fmtAsset(spotTotal)} USDT` : `≈ ${Math.round(spotTotal * usdKrw).toLocaleString()}원`}</span>
                    )}
                  </div>
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="tas-pos-title"><span>보유자산</span><span className="cnt">{spot.holdings.length}개</span></div>
                    <div className="tas-mkt-list">
                      {spotSorted.length === 0 && (
                        <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                          {spot.hasKey ? '보유 자산 없음' : 'API 키를 등록하면 표시됩니다.'}
                        </div>
                      )}
                      {spotSorted.map((h) => {
                        const cash = h.coin === 'USDT' || h.coin === 'USDC';
                        const costOk = h.avgCost != null && h.costReliable === true;
                        const price = spotPriceOf(h.coin);
                        const pnlPct = costOk ? (price / (h.avgCost as number) - 1) * 100 : null;
                        const pnlAmount = costOk ? (price - (h.avgCost as number)) * (h.available + h.frozen) : null;
                        const valStr = pnlAmount != null ? `${pnlAmount >= 0 ? '+' : '-'}${fmtCur(Math.abs(pnlAmount))}` : '—';
                        return (
                          <div
                            key={h.coin}
                            className="tas-mkt-row"
                            onClick={cash ? undefined : () => handleSelectChart(`${h.coin}USDT`, 'spot', 'BITGET')}
                            style={cash ? undefined : { cursor: 'pointer' }}
                          >
                            <span className={`tas-mkt-logo ${logoClass(h.coin)}`}>{h.coin.slice(0, 1)}</span>
                            <strong className="tas-mkt-sym">{h.coin}</strong>
                            <span className="tas-mkt-pnlval">{valStr}</span>
                            <span className="tas-mkt-amount">{fmtCur(spotValueOf(h))}</span>
                            <span className={`tas-mkt-roe-spot ${pnlPct != null ? (pnlPct >= 0 ? 'up' : 'down') : 'na'}`}>
                              {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : cash ? '' : '원가 조회불가'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )
              ) : (
                <>
              <div className="view-filters">
                <button className={`view-chip${portfolioOn ? ' on' : ''}`} onClick={togglePortfolio}>포트폴리오</button>
                <button className={`view-chip${positionsOn ? ' on' : ''}`} onClick={togglePositions}>포지션</button>
              </div>

              {mainSkeleton ? <SidebarAssetSkeleton /> : (
              <div className="assets-scroll">
                <div className="tas-hero">
                  <span className="tas-hero-label">총자산</span>
                  <div className="tas-hero-row">
                    <strong className={`tas-hero-val${mainVal.length > 11 ? ' tas-hero-val--compact' : ''}`}>{mainVal}</strong>
                    <span className="tas-cur">{curLabel}
                      <svg className="tas-cur-ico" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 3 20 7 16 11" />
                        <line x1="20" y1="7" x2="5" y2="7" />
                        <polyline points="8 21 4 17 8 13" />
                        <line x1="4" y1="17" x2="19" y2="17" />
                      </svg>
                    </span>
                    {hasKey && (
                      <button type="button" className={`tas-wallet-toggle${walletOpen ? ' open' : ''}`} aria-label="지갑 상세" onClick={() => setWalletOpen((v) => !v)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {hasKey && <span className="tas-hero-approx">{approx}</span>}
                  <div className={`tas-wallet-wrap${walletOpen ? ' open' : ''}`}>
                    <div className="tas-wallet-detail">
                      <div className="tas-wallet-col">
                        <span className="tas-wallet-k">지갑 잔고</span>
                        <span className="tas-wallet-v">{fmtCur(available)}</span>
                        <span className="tas-wallet-approx">{approxCur(available)}</span>
                      </div>
                      <div className="tas-wallet-col">
                        <span className="tas-wallet-k">미실현 손익</span>
                        <span className={`tas-wallet-v ${unrealTotal >= 0 ? 'up' : 'down'}`}>{unrealTotal >= 0 ? '+' : '-'}{fmtCur(Math.abs(unrealTotal))}</span>
                        <span className="tas-wallet-approx">{approxCur(unrealTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {portfolioOn && (
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="tas-pos-title">
                      <span>포트폴리오</span>
                      <span className="cnt">{positions.length}개</span>
                    </div>
                    <div className="tas-mkt-list">
                      {positions.length === 0 && (
                        <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                          {hasKey ? '보유 포지션 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
                        </div>
                      )}
                      {positions.map((p, i) => {
                        const base = p.symbol.replace(/USDT$|USDC$/, '');
                        const up = p.unrealizedPl >= 0;
                        const roe = calcRoe(p);
                        return (
                          <div key={p.symbol + p.direction} className="tas-mkt-row" onClick={() => { setSelPosIdx(i); handleSelectChart(p.symbol, 'futures', 'BITGET'); }}>
                            <span className={`tas-mkt-logo ${logoClass(base)}`}>{base.slice(0, 1)}</span>
                            <span className="tas-mkt-sym">{base}</span>
                            <span className={`tas-mkt-pnlval ${up ? 'up' : 'down'}`}>{up ? '+' : '-'}{fmtCur(Math.abs(p.unrealizedPl))}</span>
                            <span className="tas-mkt-badges">
                              <span className={`tas-mkt-badge dir ${p.direction}`}>{p.direction === 'long' ? 'Long' : 'Short'}</span>
                              <span className="tas-mkt-badge lev">{Math.round(p.leverage)}x</span>
                            </span>
                            <span className={`tas-mkt-roe ${roe >= 0 ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {positionsOn && (
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="pos-tabs">
                      <span className="pos-tab active">Positions <span className="cnt">({positions.length})</span></span>
                      <span className="pos-tab">Orders <span className="cnt">({trade.orders.length})</span></span>
                      <span className="pos-show"><input type="checkbox" /> Show current</span>
                    </div>
                    {selPos ? (() => {
                      const up = selPos.unrealizedPl >= 0;
                      const roe = calcRoe(selPos);
                      return (
                        <div className="pos-card">
                          <div className="pos-sym">{selPos.symbol} &nbsp;›</div>
                          <div className="pos-badges">
                            <span className={`tas-mkt-badge dir ${selPos.direction}`}>{selPos.direction === 'long' ? 'Long' : 'Short'}</span>
                            <span className="tas-mkt-badge lev">{Math.round(selPos.leverage)}x</span>
                            <span className="tas-mkt-badge lev">{selPos.marginMode === 'isolated' ? 'Isolated' : 'Cross'}</span>
                            <span className="tas-mkt-badge lev">USDT</span>
                          </div>
                          <div className="pos-row">
                            <div>
                              <div className="pos-k">Unrealized PnL ({curLabel})</div>
                              <div className={`pos-v ${up ? 'up' : 'down'}`}>{up ? '+' : '-'}{fmtCur(Math.abs(selPos.unrealizedPl))}</div>
                              <div className="pos-vsub">≈ ${selPos.unrealizedPl.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="pos-k">ROE</div>
                              <div className={`pos-v ${roe >= 0 ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</div>
                            </div>
                          </div>
                          <div className="pos-grid3">
                            <div><div className="pos-k">Size (USDT)</div><div className="pos-v2">{selPos.size.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div></div>
                            <div><div className="pos-k">Margin (USDT)</div><div className="pos-v2">{selPos.margin.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div></div>
                            <div style={{ textAlign: 'right' }}><div className="pos-k">MMR</div><div className="pos-v2">{(selPos.mmr * 100).toFixed(2)}%</div></div>
                          </div>
                          <div className="pos-grid3">
                            <div><div className="pos-k">Entry price</div><div className="pos-v2">{selPos.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
                            <div><div className="pos-k">Mark price</div><div className="pos-v2">{selPos.markPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
                            <div style={{ textAlign: 'right' }}><div className="pos-k">Est. liq. price</div><div className="pos-v2" style={{ color: '#f0a030' }}>{selPos.liqPrice > 0 ? selPos.liqPrice.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</div></div>
                          </div>
                          <div className="pos-realized">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Realized PnL ({curLabel})</span>
                              <span className="v" style={{ color: selPos.realizedPl >= 0 ? 'var(--up)' : 'var(--down)' }}>{selPos.realizedPl >= 0 ? '+' : '-'}{fmtCur(Math.abs(selPos.realizedPl))}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                              <span>Entire TP/SL</span>
                              <span className="v">
                                <span style={{ color: 'var(--up)' }}>{selPos.takeProfit > 0 ? selPos.takeProfit.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                                {' / '}
                                <span style={{ color: 'var(--down)' }}>{selPos.stopLoss > 0 ? selPos.stopLoss.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                        {hasKey ? '보유 포지션 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
                </>
              )}

              <div className="tas-notice">조회 전용 · 주문은 거래소 앱에서</div>
            </div>
  );
}
