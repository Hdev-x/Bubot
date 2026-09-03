import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchBinanceFuturesTickers,
  fetchBinanceSpotTickers,
  fetchCoinFuturesTickers,
  fetchCoinTickers,
} from '../api/server/marketApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../api/exchange/krw/krwTickers';
import {
  subscribeBinanceFuturesTickers,
  subscribeBinanceSpotTickers,
  subscribeBitgetFuturesTickers,
  subscribeBitgetSpotTickers,
} from '../api/server/coinRealtime';
import type { RealtimeTicker } from '../api/server/coinRealtime';
import type { CoinTicker } from '../types/market';
import type { ExchangeId } from '../constants/exchanges';

type ExchangeFilter = ExchangeId;
type ProductFilter = 'SPOT' | 'FUTURES';

type UseMarketTickersParams = {
  exchangeFilter: ExchangeFilter;
  productFilter: ProductFilter;
  realtimeSymbols: string[];
  active?: boolean; // 화면 밖이면 실시간 flush·WS 구독 중단
};

// 업비트/빗썸은 KRW 현물뿐이라 productFilter 무시(항상 현물)
const KRW_EXCHANGES: ExchangeFilter[] = ['UPBIT', 'BITHUMB'];
const isKrwExchange = (ex: ExchangeFilter) => KRW_EXCHANGES.includes(ex);

function getTickerLoader(exchangeFilter: ExchangeFilter, productFilter: ProductFilter) {
  if (exchangeFilter === 'BINANCE') {
    return productFilter === 'FUTURES' ? fetchBinanceFuturesTickers : fetchBinanceSpotTickers;
  }

  if (exchangeFilter === 'BITGET') {
    return productFilter === 'FUTURES' ? fetchCoinFuturesTickers : fetchCoinTickers;
  }

  if (exchangeFilter === 'UPBIT') return fetchUpbitSpotTickers;
  if (exchangeFilter === 'BITHUMB') return fetchBithumbSpotTickers;

  return async () => [];
}

export function useMarketTickers({ exchangeFilter, productFilter, realtimeSymbols, active = true }: UseMarketTickersParams) {
  const [allTickers, setAllTickers] = useState<CoinTicker[]>([]);
  const [sortSnapshot, setSortSnapshot] = useState<CoinTicker[]>([]);
  const [isTickerLoading, setIsTickerLoading] = useState(true);
  const pendingRef = useRef<Map<string, RealtimeTicker>>(new Map());

  useEffect(() => {
    if (!active) return; // 화면 밖이면 실시간 반영 flush 중단(숨은 리스트 재렌더 방지)
    const id = setInterval(() => {
      if (pendingRef.current.size === 0) return;
      const updates = pendingRef.current;
      pendingRef.current = new Map();
      setAllTickers(prev => prev.map(t => {
        const live = updates.get(t.symbol);
        if (!live) return t;
        const changeRate = live.changeRate ?? t.changeRate;
        return { ...t, last: live.price, changeRate, change: live.change ?? live.price * changeRate, volume: live.volume ?? t.volume };
      }));
    }, 800);

    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    let ignoreRequest = false;
    setIsTickerLoading(true);

    async function load() {
      const tickersData = await getTickerLoader(exchangeFilter, productFilter)();
      if (!ignoreRequest) {
        setAllTickers(tickersData);
        setSortSnapshot(tickersData);
        setIsTickerLoading(false);
      }
    }

    load().catch(() => {
      if (!ignoreRequest) {
        setAllTickers([]);
        setSortSnapshot([]);
        setIsTickerLoading(false);
      }
    });

    return () => { ignoreRequest = true; };
  }, [exchangeFilter, productFilter]);

  const queueTickerUpdate = useCallback((live: RealtimeTicker) => {
    pendingRef.current.set(live.symbol, live);
  }, []);

  // 업비트/빗썸은 백엔드 WS가 없어 REST를 주기 폴링해 실시간성 유지(순서는 sortSnapshot 고정).
  useEffect(() => {
    if (!active || !isKrwExchange(exchangeFilter)) return;
    const loader = getTickerLoader(exchangeFilter, productFilter);
    const id = setInterval(async () => {
      const data = await loader().catch(() => null);
      if (data && data.length) setAllTickers(data);
    }, 3000);
    return () => clearInterval(id);
  }, [active, exchangeFilter, productFilter]);

  useEffect(() => {
    pendingRef.current.clear();
    if (!active) return; // 화면 밖이면 티커 WS 구독 안 함(열린 소켓 정리)
    if (isKrwExchange(exchangeFilter)) return; // KRW 거래소는 위 REST 폴링이 담당
    if (!realtimeSymbols.length) return;

    if (exchangeFilter === 'BINANCE') {
      const subscribe = productFilter === 'FUTURES'
        ? subscribeBinanceFuturesTickers
        : subscribeBinanceSpotTickers;
      const sub = subscribe(realtimeSymbols, queueTickerUpdate);
      return () => sub.close();
    }

    const subscribe = productFilter === 'FUTURES'
      ? subscribeBitgetFuturesTickers
      : subscribeBitgetSpotTickers;
    const sub = subscribe(realtimeSymbols, queueTickerUpdate);
    return () => sub.close();
  }, [active, exchangeFilter, productFilter, queueTickerUpdate, realtimeSymbols]);

  return {
    allTickers,
    sortSnapshot,
    isTickerLoading,
  };
}
