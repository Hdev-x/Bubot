import React from 'react';
import './coin-list.css';

export function CoinListSkeleton() {
  return (
    <div className="coin-list-loading" aria-label="시세 목록을 불러오는 중">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="coin-skeleton-row" key={index} aria-hidden="true">
          <span className="coin-skeleton-logo skeleton-shimmer" />
          <span className="coin-skeleton-main">
            <span className="coin-skeleton-symbol skeleton-shimmer" />
            <span className="coin-skeleton-name skeleton-shimmer" />
          </span>
          <span className="coin-skeleton-price">
            <span className="coin-skeleton-value skeleton-shimmer" />
            <span className="coin-skeleton-change skeleton-shimmer" />
          </span>
        </div>
      ))}
    </div>
  );
}
