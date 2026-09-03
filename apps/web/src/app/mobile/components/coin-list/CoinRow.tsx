import React, { memo, useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import type { CoinTicker } from '../../../../shared/types/market';
import { formatPriceWithDecimals, getOfficialLogo } from '../../../../shared/utils/coinFormatters';
import { CoinLogo } from './CoinLogo';

interface CoinRowProps {
  ticker: CoinTicker;
  isWatched: boolean;
  onToggleWatch: (symbol: string) => void;
  onClick: (symbol: string) => void;
  decimals: number;
  formatRate: (r: number) => string;
  coinColor: (s: string) => string;
  logoUrl?: string;
  displaySymbol: string;
}

export const CoinRow = memo(({
  ticker,
  isWatched,
  onToggleWatch,
  onClick,
  decimals,
  formatRate,
  coinColor,
  logoUrl,
  displaySymbol
}: CoinRowProps) => {
  const x = useMotionValue(0);
  const suppressNextClickRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const isWatchedRef = useRef(isWatched);
  const isSwipingRef = useRef(false);
  const [swipeActionWasWatched, setSwipeActionWasWatched] = useState(isWatched);

  useEffect(() => {
    isWatchedRef.current = isWatched;
    if (!isSwipingRef.current) {
      setSwipeActionWasWatched(isWatched);
    }
  }, [isWatched]);
  
  // Swipe right (positive X) reveals Favorite action
  const bgColor = useTransform(x, [0, 80], ["#000", "#1e1e20"]);
  const iconScale = useTransform(x, [0, 50, 80], [0.5, 1, 1.2]);
  const iconOpacity = useTransform(x, [0, 20], [0, 1]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    dragOffsetRef.current = info.offset.x;

    // If swiped right more than 80px, toggle favorite
    if (info.offset.x > 80) {
      suppressNextClickRef.current = true;
      onToggleWatch(ticker.symbol);
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
        dragOffsetRef.current = 0;
        isSwipingRef.current = false;
        setSwipeActionWasWatched(isWatchedRef.current);
      }, 180);
      return;
    }

    window.setTimeout(() => {
      dragOffsetRef.current = 0;
      isSwipingRef.current = false;
      setSwipeActionWasWatched(isWatchedRef.current);
    }, 120);
  };

  const finalLogoUrl = getOfficialLogo(ticker.baseSymbol) 
    || logoUrl 
    || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${ticker.baseSymbol.toLowerCase()}.png`;

  return (
    <div className="coin-row-container">
      {/* Swipe Background Action */}
      <motion.div 
        className="swipe-action-bg right-action"
        style={{ backgroundColor: bgColor }}
      >
        <motion.div 
          className={`swipe-action-icon ${swipeActionWasWatched ? '' : 'favorite'}`}
          style={{ scale: iconScale, opacity: iconOpacity }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span>{swipeActionWasWatched ? '해제' : '관심'}</span>
        </motion.div>
        <div /> {/* Spacer for left side action placeholder */}
      </motion.div>

      {/* Foreground Row */}
      <motion.button
        className="coin-row"
        drag="x"
        dragConstraints={{ left: -50, right: 100 }}
        dragSnapToOrigin={true}
        dragElastic={0.1}
        onDragStart={() => {
          isSwipingRef.current = true;
          setSwipeActionWasWatched(isWatched);
        }}
        onDragEnd={handleDragEnd}
        style={{ x }}
        whileTap={{ backgroundColor: "#161618" }}
        onClickCapture={(event) => {
          if (suppressNextClickRef.current || Math.abs(dragOffsetRef.current) > 12) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onTap={() => {
          if (suppressNextClickRef.current || Math.abs(dragOffsetRef.current) > 12) {
            suppressNextClickRef.current = false;
            dragOffsetRef.current = 0;
            return;
          }
          onClick(ticker.symbol);
        }}
      >
        <span className="coin-logo">
          <CoinLogo 
            symbol={ticker.baseSymbol}
            logoUrl={finalLogoUrl}
            style={{ width: '100%', height: '100%', borderRadius: '999px', objectFit: 'cover' }}
            color={coinColor(ticker.baseSymbol)}
          />
        </span>
        <span className="coin-main">
          <strong>{displaySymbol}</strong>
          <span>{ticker.name}</span>
        </span>
        <span className="coin-price">
          <strong>{formatPriceWithDecimals(ticker.last, decimals)}</strong>
          <span className={ticker.changeRate >= 0 ? 'up' : 'down'}>
            {ticker.change >= 0 ? '+' : '-'}{formatPriceWithDecimals(Math.abs(ticker.change), decimals)}<span style={{marginLeft:'5px'}}>{formatRate(ticker.changeRate)}</span>
          </span>
        </span>
      </motion.button>
    </div>
  );
}, (prev, next) => {
  return prev.ticker.last === next.ticker.last &&
         prev.ticker.changeRate === next.ticker.changeRate &&
         prev.ticker.volume === next.ticker.volume &&
         prev.isWatched === next.isWatched &&
         prev.decimals === next.decimals &&
         prev.displaySymbol === next.displaySymbol;
});
