import React from 'react';
import { useCurrency } from '@web/contexts/CurrencyContext';

export interface LiveAssetSummaryProps {
  totalAssets: number;
  usdKrw: number;
  showCurrencyDropdown: boolean;
  setShowCurrencyDropdown: (val: boolean) => void;
  onOpenHistory?: () => void;
}

export default function LiveAssetSummary({
  totalAssets, usdKrw,
  showCurrencyDropdown, setShowCurrencyDropdown,
  onOpenHistory
}: LiveAssetSummaryProps) {
  const { displayCurrency, setDisplayCurrency, isHideBalance, toggleHideBalance } = useCurrency();
  const formatUsdt = (value: number) => Math.abs(value) < 1 ? value.toFixed(4) : value.toFixed(1);

  return (
    <div className="assets-summary" style={{ background: '#000', padding: '20px 20px 0', borderBottom: 'none' }}>
      <div className="summary-head" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#8e9197', fontSize: '14px', fontWeight: '500' }}>총 자산</span>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleHideBalance(); }}
            style={{
              background: 'none', border: 'none', color: '#8e9197', cursor: 'pointer', padding: '0 4px',
              display: 'inline-flex', alignItems: 'center', outline: 'none'
            }}
          >
            {isHideBalance ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <button 
          type="button" 
          onClick={() => onOpenHistory?.()}
          style={{ color: '#8e9197', display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v4l3 3" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </button>
      </div>

      <div className="asset-balance-container" style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
        <div>
          <div className="asset-balance" style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <strong style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.5px', color: '#fff', lineHeight: 1.1 }}>
              {isHideBalance ? '••••' : (displayCurrency === 'USDT' ? formatUsdt(totalAssets) : Math.round(totalAssets * usdKrw).toLocaleString())}
            </strong>
            <div style={{ position: 'relative' }}>
              <span 
                onClick={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                style={{ cursor: 'pointer', fontSize: '16px', fontWeight: '600', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                {displayCurrency}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
              {showCurrencyDropdown && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: '#1e2329', borderRadius: '8px', padding: '4px', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '80px' }}>
                  <div onClick={() => { setDisplayCurrency('USDT'); setShowCurrencyDropdown(false); }} style={{ padding: '8px 12px', cursor: 'pointer', color: displayCurrency === 'USDT' ? '#fff' : '#8b95a1', fontSize: '14px', fontWeight: '500', borderRadius: '4px' }} onMouseEnter={(e) => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.currentTarget.style.background='transparent'}>USDT</div>
                  <div onClick={() => { setDisplayCurrency('KRW'); setShowCurrencyDropdown(false); }} style={{ padding: '8px 12px', cursor: 'pointer', color: displayCurrency === 'KRW' ? '#fff' : '#8b95a1', fontSize: '14px', fontWeight: '500', borderRadius: '4px' }} onMouseEnter={(e) => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseLeave={(e) => e.currentTarget.style.background='transparent'}>KRW</div>
                </div>
              )}
            </div>
          </div>
          <div className="approx" style={{ fontSize: '13px', color: '#8b95a1', marginTop: '6px' }}>
            {isHideBalance ? '≈ ••••' : (displayCurrency === 'USDT' ? `≈ ${Math.round(totalAssets * usdKrw).toLocaleString()} KRW` : `≈ ${totalAssets.toFixed(2)} USDT`)}
          </div>
        </div>
      </div>
    </div>
  );
}
