import type { BitgetTicker } from '../../api/exchange/bitget/bitgetTicker';

// useLivePrice의 순수 상태 전이 — React 없이 테스트하기 위해 훅과 분리한다 (wp-08 d01).
// 스테이지드 스왑 규칙: 종목이 바뀌어도 값은 옛 종목 것을 유지하다가 새 종목의 seed(REST 티커)가 오면
// 한 번에 바뀐다. seed 전에 오는 WS 틱은 무시해 옛 값이 흔들리지 않게 한다(useCoinCandles의 loadedKeyRef와 같은 목적).

export type LivePriceExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

export type LivePriceState = {
  price: number | null;
  dailyOpen: number | null;   // 등락 기준(티커 openUtc). 0이면 null
  readyKey: string | null;    // seed가 끝난 "거래소|심볼|선물여부" 키
};

export const EMPTY_LIVE_PRICE: LivePriceState = { price: null, dailyOpen: null, readyKey: null };

export function livePriceKey(exchange: LivePriceExchange, symbol: string, isFutures: boolean): string {
  return `${exchange}|${symbol}|${isFutures}`;
}

/** readyKey에서 심볼만 — 헤더·호가의 "준비된 종목만 표시" 판정용 */
export function readySymbolOf(state: LivePriceState): string | null {
  if (!state.readyKey) return null;
  return state.readyKey.split('|')[1] ?? null;
}

/** REST seed 도착. 요청한 키가 현재 키와 다르면(전환 중 늦은 응답) 버린다. last가 없으면 변화 없음. */
export function applySeed(state: LivePriceState, currentKey: string, seedKey: string, ticker: BitgetTicker | null): LivePriceState {
  if (seedKey !== currentKey || !ticker || !ticker.last) return state;
  return { price: ticker.last, dailyOpen: ticker.openUtc || null, readyKey: currentKey };
}

/** WS 틱. 현재 키의 seed가 끝난 뒤에만 반영한다. 같은 값이면 같은 객체를 돌려 렌더를 아낀다. */
export function applyTick(state: LivePriceState, currentKey: string, price: number): LivePriceState {
  if (state.readyKey !== currentKey || !price) return state;
  if (state.price === price) return state;
  return { ...state, price };
}
