import type { Dispatch, SetStateAction } from 'react';
import TradeOrderbook from '../../mobile/components/trade/TradeOrderbook';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import type { useOrderbookSnapshot } from '../hooks/useOrderbookSnapshot';
import type { DesktopExchange } from '../hooks/useDesktopCandles';

// 호가 패널 — Mobile TradeOrderbook 재사용 + 자릿수(묶음) 드롭다운. DesktopApp에서 JSX만 옮김 (wp-06 d05).
// ob는 useOrderbookSnapshot 반환 객체 그대로, depthOpen은 드롭다운 UI 상태(DesktopApp 소유).
export function OrderbookPanel({ ob, depthOpen, setDepthOpen, exchange }: {
  ob: ReturnType<typeof useOrderbookSnapshot>;
  depthOpen: boolean;
  setDepthOpen: Dispatch<SetStateAction<boolean>>;
  exchange: DesktopExchange;
}) {
  const { OB, obFmtPrice, obFmtMid, depthLabel, depthSelectable, depthOptions, depthScale, setDepthScale, funding } = ob;
  return (
                <aside className="panel-orderbook">
                  <TradeOrderbook
                    askRows={OB ? OB.asks : []}
                    bidRows={OB ? OB.bids : []}
                    maxLevelSize={OB ? OB.maxLevelSize : 1}
                    fmtPrice={obFmtPrice}
                    fmtMid={obFmtMid}
                    centerPrice={OB ? OB.center : null}
                    priceDir="flat"
                    buyPct={OB ? OB.buyPct : 50}
                    depthLabel={OB ? OB.depthLabel : depthLabel}
                    showDepth={depthSelectable}
                    onOpenDepthSheet={() => setDepthOpen((v) => !v)}
                    funding={OB ? OB.funding : funding}
                    quoteLabel={OB ? OB.quoteLabel : EXCHANGES[exchange].quote}
                  />
                  {/* 자릿수(묶음) 선택 드롭다운 — Bitget 전용. 버튼(우하단) 위로 펼침 */}
                  {depthOpen && depthSelectable && (
                    <>
                      <div className="ob-depth-backdrop" onClick={() => setDepthOpen(false)} />
                      <div className="ob-depth-dd" role="listbox">
                        {depthOptions.map((o) => (
                          <button
                            key={o.scale}
                            type="button"
                            className={`ob-depth-dd-item${depthScale === o.scale ? ' active' : ''}`}
                            onClick={() => { setDepthScale(o.scale); setDepthOpen(false); }}
                          >
                            <span>{o.label}</span>
                            {depthScale === o.scale && <span className="ob-depth-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
  );
}
