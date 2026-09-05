import { useEffect, useState } from 'react';
import { fetchHeaderTicker } from '../../api/exchange/headerTicker';
import {
  subscribeBinanceFuturesTickers, subscribeBinanceSpotTickers,
  subscribeBitgetFuturesTickers, subscribeBitgetSpotTickers,
} from '../../api/server/coinRealtime';
import type { RealtimeTicker, Subscription } from '../../api/server/coinRealtime';
import { subscribeKrwTickers } from '../../api/exchange/krw/krwRealtime';
import { EMPTY_LIVE_PRICE, applySeed, applyTick, livePriceKey, readySymbolOf } from './livePriceState';
import type { LivePriceExchange, LivePriceState } from './livePriceState';

// 현재가 전용 훅 (wp-08 d01, T-04f). 차트 TF·캔들 로드와 무관하게 거래소 티커에서 현재가를 받는다.
//  - seed: fetchHeaderTicker(REST) → last·openUtc
//  - 갱신: 서버 STOMP 중계(Bitget·Binance) 또는 업비트·빗썸 직결 WS의 티커 price
//  - 전환 직후엔 옛 종목 값을 유지하다 새 seed가 오면 한 번에 교체(스테이지드 스왑). 규칙은 livePriceState.ts.
// Mobile 차트는 이 훅을 쓰지 않는다(현재가 = 차트 TF 종가, useCoinCandles).
export function useLivePrice({ symbol, exchange, isFutures, enabled = true }: {
  symbol: string;
  exchange: LivePriceExchange;
  isFutures: boolean;
  enabled?: boolean;
}): { price: number | null; dailyOpen: number | null; readySymbol: string | null } {
  const [state, setState] = useState<LivePriceState>(EMPTY_LIVE_PRICE);

  useEffect(() => {
    if (!enabled || !symbol) return;
    const key = livePriceKey(exchange, symbol, isFutures);
    let cancelled = false;

    fetchHeaderTicker(exchange, symbol, isFutures).then((ticker) => {
      if (cancelled) return; // 전환 중 늦은 응답
      setState((s) => applySeed(s, key, key, ticker));
    }).catch(() => { /* seed 실패 — 옛 값 유지, WS 틱은 readyKey 가드로 막힘 */ });

    const onTicker = (t: RealtimeTicker) => {
      if (t.symbol !== symbol) return;
      setState((s) => applyTick(s, key, t.price));
    };
    const sub = subscribeTickers(exchange, isFutures, symbol, onTicker);
    return () => { cancelled = true; sub.close(); };
  }, [symbol, exchange, isFutures, enabled]);

  return { price: state.price, dailyOpen: state.dailyOpen, readySymbol: readySymbolOf(state) };
}

function subscribeTickers(exchange: LivePriceExchange, isFutures: boolean, symbol: string, onTicker: (t: RealtimeTicker) => void): Subscription {
  switch (exchange) {
    case 'UPBIT':
    case 'BITHUMB':
      return subscribeKrwTickers(exchange, [symbol], onTicker);
    case 'BINANCE':
      return isFutures ? subscribeBinanceFuturesTickers([symbol], onTicker) : subscribeBinanceSpotTickers([symbol], onTicker);
    default:
      return isFutures ? subscribeBitgetFuturesTickers([symbol], onTicker) : subscribeBitgetSpotTickers([symbol], onTicker);
  }
}
