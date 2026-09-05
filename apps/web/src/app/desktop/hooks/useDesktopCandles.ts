import { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import { useCoinCandles } from '../../../chart/hooks/useCoinCandles';
import { DESKTOP_TIMEFRAMES, CHART_FALLBACK, getBucketTime } from '../lib/timeframes';

export type DesktopExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

// Desktop 차트 캔들 — 타임프레임 맵 조회 + 거래소별 로더 + 실시간 캔들 구독. DesktopApp에서 옮김 (wp-06 d03).
// 옵션 값(initialLimit 600·priceFromTicker·liveCandle)은 Desktop 고유 설정이라 여기 고정.
export function useDesktopCandles({ activeTf, symbol, productType, exchange, isBinance, isFutures }: {
  activeTf: string;
  symbol: string;
  productType: string | undefined;
  exchange: DesktopExchange;
  isBinance: boolean;
  isFutures: boolean;
}) {
  const timeframe = DESKTOP_TIMEFRAMES[activeTf] ?? DESKTOP_TIMEFRAMES['1H'];
  const loadCandles = useCandleLoader({ symbol, productType, exchange });
  const { candles, livePrice, dailyOpenPrice, loadedSymbol, handleVisibleRangeChange } = useCoinCandles({
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
    priceFromTicker: true, // 현재가(헤더·호가중앙)는 캔들이 아닌 거래소 티커(last)에서 — 차트 TF 무관
    liveCandle: true, // 현재 캔들 거래량 실시간(Binance/Bitget=kline WS, 업비트/빗썸=REST 폴링)
  });
  return { timeframe, loadCandles, candles, livePrice, dailyOpenPrice, loadedSymbol, handleVisibleRangeChange };
}
