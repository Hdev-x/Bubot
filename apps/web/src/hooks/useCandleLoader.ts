import { useCallback } from 'react';
import { fetchBinanceCandles, fetchCoinCandles } from '../api/marketApi';
import { fetchUpbitCandles, fetchBithumbCandles } from '../api/krwTickers';

type Params = {
  symbol: string;
  productType?: string;
  exchange: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
};

export function useCandleLoader({ symbol, productType, exchange }: Params) {
  const isFutures = !!productType;

  return useCallback(
    (granularity: string, limit: number, endTime?: string) => {
      switch (exchange) {
        case 'BINANCE': return fetchBinanceCandles(symbol, granularity, limit, endTime, isFutures);
        case 'UPBIT':   return fetchUpbitCandles(symbol, granularity, limit, endTime);
        case 'BITHUMB': return fetchBithumbCandles(symbol, granularity, limit, endTime);
        default:        return fetchCoinCandles(symbol, granularity, limit, endTime, productType);
      }
    },
    [exchange, isFutures, productType, symbol],
  );
}
