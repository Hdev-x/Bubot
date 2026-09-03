import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MarketChart from '../../../../chart/MarketChart';
import { formatPriceWithDecimals, formatRate, formatDisplaySymbol, getOfficialLogo, coinColor } from '../../../../utils/coinFormatters';
import { CoinLogo } from './CoinLogo';
import type { ProductFilter } from '../../../../utils/coinFormatters';

interface CoinDetailPanelProps {
  detailOpen: boolean;
  selected: any;
  detailDragEnabled: boolean;
  isWatched: (symbol: string) => boolean;
  logoMap: Record<string, string>;
  productFilter: ProductFilter;
  getDecimals: (ticker: any) => number;
  chartType: 'candle' | 'line';
  chartPeriod: string;
  miniCandles: any[];
  toggleWatchlist: (symbol: string, e?: React.MouseEvent) => void;
  toggleChartType: () => void;
  selectChartPeriod: (period: any) => void;
  setDetailOpen: (val: boolean) => void;
  setDetailDragEnabled: (val: boolean) => void;
  onTickDecimalsChange?: (decimals: number) => void;
  onOpenChart: () => void;
  onOpenTrade?: () => void;
}

export const CoinDetailPanel = ({
  detailOpen,
  selected,
  detailDragEnabled,
  isWatched,
  logoMap,
  productFilter,
  getDecimals,
  chartType,
  chartPeriod,
  miniCandles,
  toggleWatchlist,
  toggleChartType,
  selectChartPeriod,
  setDetailOpen,
  setDetailDragEnabled,
  onTickDecimalsChange,
  onOpenChart,
  onOpenTrade
}: CoinDetailPanelProps) => {
  return (
    <AnimatePresence>
      {detailOpen && selected && (
      <motion.div
        className="detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={() => setDetailOpen(false)}
      >
        <motion.section
          className="coin-detail-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
          drag={detailDragEnabled ? 'y' : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.02, bottom: 0.35 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100 || info.velocity.y > 700) {
              setDetailOpen(false);
            }
          }}
          onAnimationComplete={() => {
            if (detailOpen) setDetailDragEnabled(true);
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="panel-handle" />

          {/* Header */}
          <div className="coin-detail-header">
            <span className="coin-logo detail-logo">
                  <CoinLogo 
                    symbol={selected.baseSymbol}
                    logoUrl={getOfficialLogo(selected.baseSymbol) || logoMap[selected.baseSymbol] || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${selected.baseSymbol.toLowerCase()}.png`}
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                    color={coinColor(selected.baseSymbol)}
                  />
            </span>
            <div className="detail-header-text">
              <strong>{formatDisplaySymbol(selected.symbol, productFilter)}</strong>
              <span>{selected.name}</span>
            </div>
            <button
              className={`detail-heart-btn ${isWatched(selected.symbol) ? 'active' : ''}`}
              onClick={(e) => toggleWatchlist(selected.symbol, e)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={isWatched(selected.symbol) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>

          {/* Price */}
          <div className="coin-detail-price-block">
            <div className="detail-price-row">
              <strong className="detail-price-main">{formatPriceWithDecimals(selected.last, getDecimals(selected))}</strong>
              <span className="detail-price-currency">{selected.quoteSymbol}</span>
              <div className="detail-header-icons">
                <button className="detail-icon-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </button>
                <button
                  className="detail-icon-btn"
                  onClick={toggleChartType}
                >
                  {chartType === 'candle' ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="4" x2="8" y2="20"/><rect x="5" y="7" width="6" height="9" rx="1"/><line x1="16" y1="2" x2="16" y2="22"/><rect x="13" y="6" width="6" height="10" rx="1"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 17 8 12 13 15 21 7"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <span className={`detail-price-change ${selected.changeRate >= 0 ? 'up' : 'down'}`}>
              {selected.change >= 0 ? '+' : '-'}{formatPriceWithDecimals(Math.abs(selected.change), getDecimals(selected))}
              <span className="detail-rate-badge">{formatRate(selected.changeRate)}</span>
            </span>
          </div>

          {/* Chart — fills remaining space */}
          <div className="detail-chart-wrap">
            <MarketChart key={`${selected.symbol}-${chartType}`} symbol={selected.symbol} period={chartPeriod} candles={miniCandles} chartType={chartType} isLogScale locked className="detail-chart" />
          </div>

          {/* Period tabs + fullscreen button */}
          <div className="period-tabs">
            {(['4H', '1D', '1W', '1M'] as const).map(p => (
              <button
                key={p}
                className={`period-tab ${chartPeriod === p ? 'active' : ''}`}
                onClick={() => selectChartPeriod(p)}
              >
                {{ '4H': '4시간', '1D': '1일', '1W': '1주', '1M': '1달' }[p]}
              </button>
            ))}
            <button className="period-tab-fullscreen" onClick={() => { if (selected) onTickDecimalsChange?.(getDecimals(selected)); setDetailOpen(false); onOpenChart(); }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H6a3 3 0 0 0-3 3v3"/>
                <path d="M21 9V6a3 3 0 0 0-3-3h-3"/>
                <path d="M3 15v3a3 3 0 0 0 3 3h3"/>
                <path d="M15 21h3a3 3 0 0 0 3-3v-3"/>
              </svg>
            </button>
          </div>

          <div className="detail-divider" />

          {/* Trade button — 누르면 선택 종목으로 트레이드 페이지 이동 */}
          <button
            className="detail-trade-btn"
            onClick={() => { setDetailOpen(false); onOpenTrade?.(); }}
          >
            트레이드
          </button>
        </motion.section>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
