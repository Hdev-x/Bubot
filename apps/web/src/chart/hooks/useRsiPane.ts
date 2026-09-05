import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, IPriceLine, ISeriesApi, Time } from 'lightweight-charts';
import type { Candle } from '../../shared/types/market';
import { computeRsiCandles } from '../../shared/utils/rsiCandles';
import type { RsiSettings } from '../../shared/utils/rsiCandles';

// MarketChart 전용 — RSI 캔들(하단 페인1) 시리즈 생성·제거·데이터·기준선. MarketChart.tsx에서 옮김 (wp-07 d04).
// ref들은 MarketChart가 소유한다(차트 재생성 effect가 showRsiCandlesRef·rsiSeriesRef를 같이 씀).
// candles 변경 시 그리는 effect는 순서 때문에 MarketChart에 남아 있다(초기화·거래량 effect 뒤).
export function useRsiPane({ chartRef, candlesRef, rsiSettings, showRsiCandles, toChartTime, rsiSeriesRef, rsiPriceLinesRef, rsiSettingsRef, showRsiCandlesRef, rsiLastCountRef, rsiLastTimeRef }: {
  chartRef: RefObject<IChartApi | null>;
  candlesRef: RefObject<Candle[]>;
  rsiSettings: RsiSettings;
  showRsiCandles: boolean;
  toChartTime: (time: string | number) => Time;
  rsiSeriesRef: RefObject<ISeriesApi<'Candlestick'> | null>;
  rsiPriceLinesRef: RefObject<IPriceLine[]>;
  rsiSettingsRef: RefObject<RsiSettings>;
  showRsiCandlesRef: RefObject<boolean>;
  rsiLastCountRef: RefObject<number>;
  rsiLastTimeRef: RefObject<Time | null>;
}) {
  // ── RSI 캔들(하단 페인1) ── 색·기간·기준선은 rsiSettings로 제어. toChartTime으로 시간축 공유.
  useEffect(() => { rsiSettingsRef.current = rsiSettings; }, [rsiSettings]);

  // 기준선(70/50/30) 재적용 — 기존 라인 제거 후 설정대로 재생성
  const applyRsiLines = useCallback((s: ISeriesApi<'Candlestick'>) => {
    for (const pl of rsiPriceLinesRef.current) { try { s.removePriceLine(pl); } catch { /* 무시 */ } }
    rsiPriceLinesRef.current = [];
    for (const ln of rsiSettingsRef.current.lines) {
      if (!ln.visible) continue;
      rsiPriceLinesRef.current.push(s.createPriceLine({
        price: ln.value, color: ln.color, lineWidth: Math.max(1, Math.min(4, ln.width)) as 1 | 2 | 3 | 4,
        lineStyle: ln.style, axisLabelVisible: true, title: '',
      }));
    }
  }, []);

  const rsiCandleColorOpts = () => {
    const { upColor: up, downColor: down } = rsiSettingsRef.current;
    return { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down };
  };

  // RSI 시리즈 생성(페인1). 이미 있으면 그대로 반환. 기준선 포함.
  const ensureRsiSeries = useCallback((): ISeriesApi<'Candlestick'> | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    if (rsiSeriesRef.current) return rsiSeriesRef.current;
    const s = chart.addSeries(CandlestickSeries, {
      ...rsiCandleColorOpts(),
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: true, priceLineVisible: false,
    }, 1); // paneIndex 1 = 하단 별도 페인(시간축 공유)
    rsiSeriesRef.current = s;
    applyRsiLines(s);
    try { s.priceScale().applyOptions({ mode: rsiSettingsRef.current.logScale ? 1 : 0 }); } catch { /* 무시 */ }
    try { chart.panes()[1]?.setHeight(130); } catch { /* 페인 크기 실패 무시 */ }
    return s;
  }, [applyRsiLines]);

  const destroyRsiSeries = useCallback(() => {
    const chart = chartRef.current;
    if (chart && rsiSeriesRef.current) {
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* 이미 제거됨 */ }
    }
    rsiSeriesRef.current = null;
    rsiPriceLinesRef.current = [];
    rsiLastCountRef.current = 0;
    rsiLastTimeRef.current = null;
  }, []);

  // RSI 데이터 그리기 — 거래량 히스토그램과 동일한 전체 setData / 마지막봉 update 분기.
  const drawRsi = useCallback((cs: Candle[]) => {
    const s = rsiSeriesRef.current;
    if (!s) return;
    const rsi = computeRsiCandles(cs, rsiSettingsRef.current.period);
    if (!rsi.length) {
      s.setData([]);
      rsiLastCountRef.current = 0;
      rsiLastTimeRef.current = null;
      return;
    }
    const toBar = (r: (typeof rsi)[number]) => ({ time: toChartTime(r.time), open: r.open, high: r.high, low: r.low, close: r.close });
    const newCount = rsi.length;
    const prevCount = rsiLastCountRef.current;
    const addedCount = newCount - prevCount;
    const lastTime = toChartTime(rsi[newCount - 1].time);
    const isAppendingSingle = addedCount === 1 && (newCount < 2 || toChartTime(rsi[newCount - 2].time) === rsiLastTimeRef.current);
    const isUpdatingLast = addedCount === 0 && lastTime === rsiLastTimeRef.current;
    if (prevCount > 0 && (isAppendingSingle || isUpdatingLast)) {
      // ref-시리즈 불일치 시 update가 throw → 전체 setData 폴백(거래량과 동일)
      try { s.update(toBar(rsi[newCount - 1])); }
      catch { s.setData(rsi.map(toBar)); }
    } else {
      s.setData(rsi.map(toBar));
    }
    rsiLastCountRef.current = newCount;
    rsiLastTimeRef.current = lastTime;
  }, []);

  // RSI 토글 — 런타임에 페인 시리즈 추가/제거(차트 재생성 없이). 켤 때 즉시 그린다.
  useEffect(() => {
    showRsiCandlesRef.current = showRsiCandles;
    if (!chartRef.current) return;
    if (showRsiCandles) {
      ensureRsiSeries();
      drawRsi(candlesRef.current);
    } else {
      destroyRsiSeries();
    }
  }, [showRsiCandles, ensureRsiSeries, destroyRsiSeries, drawRsi]);

  // RSI 설정 변경(색/기간/기준선) — 시리즈 있으면 색·기준선 갱신 + 전체 재계산(기간 반영).
  useEffect(() => {
    const s = rsiSeriesRef.current;
    if (!s) return;
    s.applyOptions(rsiCandleColorOpts());
    applyRsiLines(s);
    try { s.priceScale().applyOptions({ mode: rsiSettings.logScale ? 1 : 0 }); } catch { /* 무시 */ }
    rsiLastCountRef.current = 0; // 기간이 바뀌면 봉 개수가 달라짐 → 전체 setData 강제
    rsiLastTimeRef.current = null;
    drawRsi(candlesRef.current);

  }, [rsiSettings, applyRsiLines, drawRsi]);

  return { ensureRsiSeries, destroyRsiSeries, drawRsi };
}
