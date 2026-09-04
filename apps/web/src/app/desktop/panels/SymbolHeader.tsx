import { EXCHANGES } from '../../../shared/constants/exchanges';
import type { useHeaderSnapshot } from '../hooks/useHeaderSnapshot';
import type { ChartSel } from './chartProps';
import { HeaderLogo, HdSk } from './SidebarBits';

// 종목 헤더 — 거래탭 종목 헤더 디자인 이식. H(통합 스냅샷)가 준비되면 좌·우 전부 통째 교체. DesktopApp에서 JSX만 옮김 (wp-06 d04b).
export function SymbolHeader({ H, symbol, chartSel, base, isFutures, coinLogos }: {
  H: ReturnType<typeof useHeaderSnapshot>['H'];
  symbol: string;
  chartSel: ChartSel;
  base: string;
  isFutures: boolean;
  coinLogos: Record<string, string>;
}) {
  const CHART_SYMBOL = symbol;
  const chartBase = base;
  const chartIsFutures = isFutures;
  return (
          <div className="sub-header trade-symbol-row">
            <div className="sh-left">
              <HeaderLogo base={H ? H.base : chartBase} logoUrl={coinLogos[H ? H.base : chartBase]} />
              <div className="symbol-info">
                <div className="symbol-selector">
                  <h1>{H ? H.title : (chartIsFutures ? `${CHART_SYMBOL}.P` : CHART_SYMBOL)}</h1>
                  {(H ? H.isFutures : chartIsFutures) && <span className="sh-perp-badge">Perpetual</span>}
                  {(() => { const ex = H ? H.exchange : chartSel.exchange; return (
                    <span className="trade-exchange-badge" style={{ color: EXCHANGES[ex].color }}>
                      <img className="trade-exchange-logo" src={EXCHANGES[ex].logo} alt="" aria-hidden="true" />
                      <span className="trade-exchange-name">{EXCHANGES[ex].label}</span>
                    </span>
                  ); })()}
                </div>
                <div className="sh-price-row">
                  <span className="sh-px">{H ? H.px : <HdSk w={120} h={20} />}</span>
                  {H?.chg && (
                    <span className="sh-chg" style={{ color: H.chg.up ? 'var(--up)' : 'var(--down)' }}>
                      {H.chg.up ? '+' : ''}{H.chg.abs} ({H.chg.up ? '+' : ''}{H.chg.pct}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="ph-right">
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">전날 종가</span><span className="ph-value">{H ? H.prevClose : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">당일 시가</span><span className="ph-value">{H ? H.todayOpen : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">24h 고가</span><span className="ph-value">{H ? H.high : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">24h 저가</span><span className="ph-value">{H ? H.low : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">24h 거래량 ({H ? H.baseLabel : chartBase})</span><span className="ph-value">{H ? H.baseVol : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">24h 거래대금 ({H ? H.quoteLabel : EXCHANGES[chartSel.exchange].quote})</span><span className="ph-value">{H ? H.quoteVol : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">시가총액</span><span className="ph-value">{H ? H.cap : <HdSk />}</span></div>
              </div>
            </div>
          </div>
  );
}
