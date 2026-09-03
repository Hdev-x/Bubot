import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatPriceWithDecimals, formatRate, formatDisplaySymbol, getOfficialLogo } from '../../../../utils/coinFormatters';
import type { ProductFilter } from '../../../../utils/coinFormatters';

interface WatchlistBottomSheetProps {
  activeSheet: string | null;
  watchlistSheetSize: 'half' | 'full';
  watchlistDragEnabled: boolean;
  watchlistTickers: any[];
  logoMap: Record<string, string>;
  productFilter: ProductFilter;
  getDecimals: (ticker: any) => number;
  openDetail: (symbol: string) => void;
  setActiveSheet: (val: any) => void;
  setWatchlistSheetSize: (val: 'half' | 'full') => void;
  setWatchlistDragEnabled: (val: boolean) => void;
}

export const WatchlistBottomSheet = ({
  activeSheet,
  watchlistSheetSize,
  watchlistDragEnabled,
  watchlistTickers,
  logoMap,
  productFilter,
  getDecimals,
  openDetail,
  setActiveSheet,
  setWatchlistSheetSize,
  setWatchlistDragEnabled
}: WatchlistBottomSheetProps) => {
  return (
    <AnimatePresence>
      {activeSheet === 'WATCHLIST' && (
        <>
          <motion.div
            className="bottom-sheet-overlay open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => setActiveSheet(null)}
          />
          <motion.div
            className={`draggable-watchlist-sheet ${watchlistSheetSize}`}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{
              y: 0,
              opacity: 1,
              height: watchlistSheetSize === 'full' ? '100dvh' : '48dvh',
              borderTopLeftRadius: watchlistSheetSize === 'full' ? 0 : 18,
              borderTopRightRadius: watchlistSheetSize === 'full' ? 0 : 18
            }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag={watchlistDragEnabled ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.12 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -80 || info.velocity.y < -650) {
                setWatchlistSheetSize('full');
                return;
              }
              if (info.offset.y > 100 || info.velocity.y > 700) {
                if (watchlistSheetSize === 'full') {
                  setWatchlistDragEnabled(false);
                  setWatchlistSheetSize('half');
                } else {
                  setActiveSheet(null);
                }
              }
            }}
            onAnimationComplete={() => {
              if (activeSheet === 'WATCHLIST') setWatchlistDragEnabled(true);
            }}
          >
            <div className="sheet-drag-zone">
              <div className="sheet-handle" />
            </div>
            <h3 className="sheet-title">관심 종목 상세</h3>
            <div className="sheet-content-scrollable" style={{ padding: '0' }}>
              {watchlistTickers.length > 0 ? (
                watchlistTickers.map(t => (
                  <button key={t.symbol} className="watchlist-detail-item" onClick={() => openDetail(t.symbol)}>
                    <span className="coin-logo">
                      <img
                        src={getOfficialLogo(t.baseSymbol) || logoMap[t.baseSymbol] || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${t.baseSymbol.toLowerCase()}.png`}
                        alt={t.baseSymbol}
                        style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                      />
                    </span>
                    <div className="coin-info">
                      <strong>{formatDisplaySymbol(t.symbol, productFilter)}</strong>
                      <span>{t.name}</span>
                    </div>
                    <div className="coin-values">
                      <strong>{formatPriceWithDecimals(t.last, getDecimals(t))}</strong>
                      <span className={t.changeRate >= 0 ? 'up' : 'down'}>
                        {t.change >= 0 ? '+' : '-'}{formatPriceWithDecimals(Math.abs(t.change), getDecimals(t))}<span style={{marginLeft:'5px'}}>{formatRate(t.changeRate)}</span>
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="no-data"><p>관심 종목이 없습니다.</p></div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
