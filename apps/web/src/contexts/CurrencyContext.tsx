import { createContext, useContext, useState, ReactNode } from 'react';

export type CurrencyType = 'USDT' | 'KRW';

/** 표시용 통화 단위 라벨 — 내부 값은 'KRW' 유지하되 화면엔 '원'으로. USDT는 그대로. */
export const currencyLabel = (c: CurrencyType): string => (c === 'KRW' ? '원' : 'USDT');

interface SettingsContextType {
  displayCurrency: CurrencyType;
  setDisplayCurrency: (val: CurrencyType) => void;
  isHideBalance: boolean;
  toggleHideBalance: () => void;
}

export const SettingsContext = createContext<SettingsContextType>({
  displayCurrency: 'KRW',
  setDisplayCurrency: () => {},
  isHideBalance: false,
  toggleHideBalance: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 디폴트 = 원(KRW). 사용자가 바꾼 통화는 localStorage에 저장해 유지.
  const [displayCurrency, setDisplayCurrencyState] = useState<CurrencyType>(
    () => (localStorage.getItem('displayCurrency') === 'USDT' ? 'USDT' : 'KRW')
  );
  const setDisplayCurrency = (val: CurrencyType) => {
    localStorage.setItem('displayCurrency', val);
    setDisplayCurrencyState(val);
  };
  const [isHideBalance, setIsHideBalance] = useState<boolean>(() => localStorage.getItem('hideBalance') === 'true');

  const toggleHideBalance = () => {
    setIsHideBalance(prev => {
      const next = !prev;
      localStorage.setItem('hideBalance', String(next));
      return next;
    });
  };
  
  return (
    <SettingsContext.Provider value={{ displayCurrency, setDisplayCurrency, isHideBalance, toggleHideBalance }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

// 기존 CurrencyContext 하위호환
export const CurrencyContext = SettingsContext;
export const CurrencyProvider = SettingsProvider;
export const useCurrency = useSettings;
