import { useEffect, useState } from 'react';
import { subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers } from '../api/coinRealtime';
import type { RealtimeTicker } from '../api/coinRealtime';

// isFutures=true → 선물 티커(/topic/coin-futures), false → 현물 티커(/topic/coin).
// 현물/선물은 베이시스로 가격이 달라서 탭에 맞는 채널을 구독해야 현재가·평가가 정확하다.
export function useRealtimePrices(symbols: string[], isFutures = true) {
  const [realtimePrices, setRealtimePrices] = useState<Record<string, number>>({});
  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (symbols.length === 0) return;

    const subscribe = isFutures ? subscribeBitgetFuturesTickers : subscribeBitgetSpotTickers;
    const sub = subscribe(symbols, (ticker) => {
      setRealtimePrices(prev => {
        if (prev[ticker.symbol] === ticker.price) return prev;
        return { ...prev, [ticker.symbol]: ticker.price };
      });
    });

    return () => {
      sub.close();
    };
  }, [symbolsKey, isFutures]);

  return realtimePrices;
}

export function useRealtimeTickers(symbols: string[], isFutures = true) {
  const [realtimeTickers, setRealtimeTickers] = useState<Record<string, RealtimeTicker>>({});
  const symbolsKey = symbols.join(',');

  useEffect(() => {
    if (symbols.length === 0) return;

    const subscribe = isFutures ? subscribeBitgetFuturesTickers : subscribeBitgetSpotTickers;
    const sub = subscribe(symbols, (ticker) => {
      setRealtimeTickers(prev => {
        return { ...prev, [ticker.symbol]: ticker };
      });
    });

    return () => {
      sub.close();
    };
  }, [symbolsKey, isFutures]);

  return realtimeTickers;
}
