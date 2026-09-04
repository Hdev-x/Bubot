import React from 'react';
import { DropdownFilter } from './DropdownFilter';
import type { ProductFilter } from '../../../../shared/utils/coinFormatters';
import './coin-list.css';

interface CoinListFilterBarProps {
  exchangeFilter: string;
  productFilter: ProductFilter;
  marketFilter: string;
  sortFilter: string;
  activeSheet: string | null;
  exchangeOptions: { label: string; value: string; logo: string }[];
  isKrwExchange?: boolean; // 업비트/빗썸 = KRW 현물 전용(선물 세그먼트 숨김, 마켓=KRW)
  setActiveSheet: (val: any) => void;
  setProductFilter: (val: ProductFilter) => void;
  setMarketFilter: (val: any) => void;
  setSortFilter: (val: any) => void;
  setDisplayCount: (val: number) => void;
  setDetailOpen: (val: boolean) => void;
}

export const CoinListFilterBar = ({
  exchangeFilter,
  productFilter,
  marketFilter,
  sortFilter,
  activeSheet,
  exchangeOptions,
  isKrwExchange = false,
  setActiveSheet,
  setProductFilter,
  setMarketFilter,
  setSortFilter,
  setDisplayCount,
  setDetailOpen
}: CoinListFilterBarProps) => {
  return (
    <div className="filter-bar">
      {/* Left: Exchange Selector */}
      <div className="filter-left-group">
        <button
          className="exchange-btn"
          type="button"
          aria-expanded={activeSheet === 'EXCHANGE'}
          onClick={(event) => {
            event.stopPropagation();
            setDetailOpen(false);
            setActiveSheet(activeSheet === 'EXCHANGE' ? null : 'EXCHANGE');
          }}
        >
          {(() => {
            const selectedExchange = exchangeOptions.find((option) => option.value === exchangeFilter) ?? exchangeOptions[0];
            return (
              <>
                <img className="exchange-btn-logo" src={selectedExchange.logo} alt={`${selectedExchange.label} 로고`} />
                <span className="exchange-btn-label">{selectedExchange.label}</span>
              </>
            );
          })()}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
            <path d="M6 9l6 6 6-6"></path>
          </svg>
        </button>
        {/* KRW 거래소(업비트/빗썸)는 현물만 → 세그먼트 토글 숨기고 Spot 고정 칩 표시 */}
        {isKrwExchange ? (
          <div className="product-segment spot" aria-label="상품 유형">
            <span className="product-segment-thumb" aria-hidden="true" />
            <button className="active" type="button" disabled><span>Spot</span></button>
          </div>
        ) : (
          <div className={`product-segment ${productFilter === 'FUTURES' ? 'futures' : 'spot'}`} aria-label="상품 유형">
            <span className="product-segment-thumb" aria-hidden="true" />
            {[
              { label: 'Spot', value: 'SPOT' },
              { label: 'Futures', value: 'FUTURES' }
            ].map((option) => (
              <button
                key={option.value}
                className={productFilter === option.value ? 'active' : ''}
                type="button"
                onClick={() => {
                  setProductFilter(option.value as ProductFilter);
                  setMarketFilter('USDT');
                  setDisplayCount(25);
                }}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Filters Group */}
      <div className="filter-right-group">
        <DropdownFilter
          isOpen={activeSheet === 'MARKET'}
          onToggle={() => setActiveSheet(activeSheet === 'MARKET' ? null : 'MARKET')}
          label={isKrwExchange ? 'KRW' : 'USDT'}
          selectedValue={marketFilter}
          onSelect={setMarketFilter}
          options={isKrwExchange
            ? [{ label: 'KRW', value: 'KRW' }]
            : [
                { label: 'USDT', value: 'USDT' },
                { label: 'USDC', value: 'USDC' },
              ]}
        />
        <DropdownFilter 
          isOpen={activeSheet === 'SORT'}
          onToggle={() => setActiveSheet(activeSheet === 'SORT' ? null : 'SORT')}
          label="거래대금"
          selectedValue={sortFilter}
          onSelect={setSortFilter}
          options={[
            { label: '거래대금', value: 'VOLUME' },
            { label: '급상승', value: 'TOP' },
            { label: '급하락', value: 'BOTTOM' },
          ]}
        />
      </div>
    </div>
  );
};
