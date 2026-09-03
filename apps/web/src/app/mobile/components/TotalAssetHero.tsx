import type { ReactNode } from 'react';
import { useCurrency, currencyLabel } from '../../../contexts/CurrencyContext';
import { useUsdKrw } from '../../../hooks/market/useUsdKrw';

// 자산 표기 규칙(거래탭 총자산과 동일): 1 미만 4자리, 그 외 1자리
function fmtAsset(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 1,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 1,
  });
}

// 거래탭 총자산(.tas-hero) 디자인을 마켓·자산에서 공유하는 컴포넌트(사이즈업 + 눈 아이콘).
// 라벨+눈 / 큰 숫자+통화토글(⇄) / 근사치. 데이터 도착 전(ready=false)엔 스켈레톤.
export function TotalAssetHero({ totalUsdt, ready, label, rightSlot }: {
  totalUsdt: number;
  ready: boolean;
  label: string;
  rightSlot?: ReactNode; // 라벨 줄 우측(예: 자산 탭 내역 시계 버튼)
}) {
  const { displayCurrency, setDisplayCurrency, isHideBalance, toggleHideBalance } = useCurrency();
  const usdKrw = useUsdKrw();
  const mask = (v: string) => (isHideBalance ? '••••' : v);
  const mainVal = displayCurrency === 'USDT'
    ? fmtAsset(totalUsdt)
    : Math.round(totalUsdt * usdKrw).toLocaleString();
  const approx = displayCurrency === 'USDT'
    ? `≈ ${Math.round(totalUsdt * usdKrw).toLocaleString()}원`
    : `≈ ${totalUsdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;

  return (
    <div className="tas-hero tas-hero-lg">
      <div className="tas-hero-toprow">
        <span className="tas-hero-label">{label}</span>
        <button type="button" className="tas-hero-eye" onClick={toggleHideBalance} aria-label="잔고 숨김">
          {isHideBalance ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
        {rightSlot && <span className="tas-hero-right">{rightSlot}</span>}
      </div>
      <div className="tas-hero-row">
        {ready
          ? <strong className="tas-hero-val">{mask(mainVal)}</strong>
          : <span className="tas-hero-val tas-hero-skeleton skeleton-shimmer" aria-label="불러오는 중" />}
        {ready && (
          <button type="button" className="tas-cur" onClick={() => setDisplayCurrency(displayCurrency === 'USDT' ? 'KRW' : 'USDT')} aria-label="통화 전환">
            {currencyLabel(displayCurrency)}
            <svg className="tas-cur-ico" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 3 20 7 16 11" />
              <line x1="20" y1="7" x2="5" y2="7" />
              <polyline points="8 21 4 17 8 13" />
              <line x1="4" y1="17" x2="19" y2="17" />
            </svg>
          </button>
        )}
      </div>
      {ready
        ? <span className="tas-hero-approx">{isHideBalance ? '≈ ••••' : approx}</span>
        : <span className="tas-hero-approx tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />}
    </div>
  );
}
