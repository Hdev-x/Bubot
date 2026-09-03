import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBinanceCandles, fetchCoinCandles } from '../api/server/marketApi';
import type { Candle } from '../types/market';
import type { ExchangeId } from '../constants/exchanges';

type ExchangeFilter = ExchangeId;
type ProductFilter = 'SPOT' | 'FUTURES';
type ChartPeriod = '4H' | '1D' | '1W' | '1M';
type ChartType = 'candle' | 'line';

type UseCoinDetailChartParams = {
  detailOpen: boolean;
  selectedSymbol?: string;
  exchangeFilter: ExchangeFilter;
  productFilter: ProductFilter;
};

const PERIOD_GRANULARITY: Record<ChartPeriod, string> = {
  '4H': '4h',
  '1D': '1Dutc',
  '1W': '1Wutc',
  '1M': '1Mutc',
};

export function useCoinDetailChart({
  detailOpen,
  selectedSymbol,
  exchangeFilter,
  productFilter,
}: UseCoinDetailChartParams) {
  const [miniCandles, setMiniCandles] = useState<Candle[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1W');
  const [chartType, setChartType] = useState<ChartType>('candle');

  const chartExchange: 'BITGET' | 'BINANCE' = exchangeFilter === 'BINANCE' ? 'BINANCE' : 'BITGET';
  const chartIsFutures = productFilter === 'FUTURES';
  const chartProductType = useMemo(() => {
    if (!chartIsFutures || exchangeFilter === 'BITHUMB') return undefined;
    if (chartExchange === 'BITGET' && (chartPeriod === '1W' || chartPeriod === '1M')) return undefined;
    return 'USDT-FUTURES';
  }, [chartExchange, chartIsFutures, chartPeriod, exchangeFilter]);

  useEffect(() => {
    if (!detailOpen || !selectedSymbol) return;
    setMiniCandles([]);
    let cancelled = false;
    const limit = chartExchange === 'BINANCE' ? 120 : 90;
    const loader = chartExchange === 'BINANCE'
      ? fetchBinanceCandles(selectedSymbol, PERIOD_GRANULARITY[chartPeriod], limit, undefined, chartIsFutures)
      : fetchCoinCandles(selectedSymbol, PERIOD_GRANULARITY[chartPeriod], limit, undefined, chartProductType);

    loader
      .then(candles => { if (!cancelled && candles.length) setMiniCandles(candles); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [detailOpen, selectedSymbol, chartPeriod, chartExchange, chartIsFutures, chartProductType]);

  const resetDetailChart = useCallback(() => {
    setMiniCandles([]);
    setChartPeriod('1W');
  }, []);

  const selectChartPeriod = useCallback((period: ChartPeriod) => {
    setMiniCandles([]);
    setChartPeriod(period);
  }, []);

  const toggleChartType = useCallback(() => {
    setChartType(type => type === 'candle' ? 'line' : 'candle');
  }, []);

  return {
    miniCandles,
    chartPeriod,
    chartType,
    chartExchange,
    chartProductType,
    resetDetailChart,
    selectChartPeriod,
    toggleChartType,
  };
}
