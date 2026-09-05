import type { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import { useCoinCandles } from '../../../chart/hooks/useCoinCandles';
import { DESKTOP_TIMEFRAMES, CHART_FALLBACK, getBucketTime } from '../lib/timeframes';

export type DesktopExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

// Desktop 차트 캔들 — 타임프레임 맵 조회 + 거래소별 로더 + 실시간 캔들 구독. DesktopApp에서 옮김 (wp-06 d03).
// 옵션 값(initialLimit 600·liveCandle)은 Desktop 고유 설정이라 여기 고정.
// 현재가·등락 기준·준비 판정은 useLivePrice가 담당한다(wp-08 d02) — 이 훅은 캔들만 돌려준다.
// loadCandles는 DesktopApp이 useCandleLoader로 만들어 넘긴다 — useLivePrice(일봉 시가)와 공유하기 위해(wp-08 d02).
export function useDesktopCandles({ activeTf, symbol, productType, exchange, isBinance, isFutures, loadCandles }: {
  activeTf: string;
  symbol: string;
  productType: string | undefined;
  exchange: DesktopExchange;
  isBinance: boolean;
  isFutures: boolean;
  loadCandles: ReturnType<typeof useCandleLoader>;
}) {
  const timeframe = DESKTOP_TIMEFRAMES[activeTf] ?? DESKTOP_TIMEFRAMES['1H'];
  const { candles, candlesKey, handleVisibleRangeChange } = useCoinCandles({
    symbol,
    productType,
    isBinance,
    isFutures,
    timeframe,
    loadCandles,
    fallbackCandles: CHART_FALLBACK,
    getBucketTime,
    initialLimit: 600,
    active: true,
    clearOnSymbolChange: false,
    exchange,
    liveCandle: true, // 현재 캔들 거래량 실시간(Binance/Bitget=kline WS, 업비트/빗썸=REST 폴링)
  });
  return { timeframe, candles, candlesKey, handleVisibleRangeChange };
}
