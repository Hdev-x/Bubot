import React from 'react';
import { getOfficialLogo, coinColor } from '../../../../shared/utils/coinFormatters';
import { CoinLogo } from './CoinLogo';

interface WatchlistStorySectionProps {
  watchlistTickers: any[];
  logoMap: Record<string, string>;
  openDetail: (symbol: string) => void;
  onOpenAll: () => void;
}

export const WatchlistStorySection = ({
  watchlistTickers,
  logoMap,
  openDetail,
  onOpenAll
}: WatchlistStorySectionProps) => {
  return (
    <section className="watchlist-section">
      <div className="watchlist-scroll-container">
        <div className="watchlist-scroll">
          {watchlistTickers.length > 0 ? (
            watchlistTickers.map(t => (
              <button key={t.symbol} className="watchlist-story-item" onClick={() => openDetail(t.symbol)}>
                <div className={`story-circle-wrapper ${t.changeRate >= 0 ? 'up' : 'down'}`}>
                  <div className="story-inner-circle">
                    <CoinLogo 
                      symbol={t.baseSymbol}
                      logoUrl={getOfficialLogo(t.baseSymbol) || logoMap[t.baseSymbol] || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${t.baseSymbol.toLowerCase()}.png`}
                      className="story-logo"
                      color={coinColor(t.baseSymbol)}
                    />
                  </div>
                </div>
                <span className="story-symbol">{t.baseSymbol}</span>
              </button>
            ))
          ) : (
            <div className="watchlist-empty">
              관심 종목을 추가해보세요
            </div>
          )}
        </div>
        
        {/* Fixed 'View All' Item on the right */}
        <button className="fixed-more-item" onClick={onOpenAll}>
          <div className="more-circle-glass">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <span className="story-symbol more-label">전체보기</span>
        </button>
      </div>
    </section>
  );
};
