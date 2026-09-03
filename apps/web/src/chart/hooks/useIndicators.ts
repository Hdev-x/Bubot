import { useEffect } from 'react';
import type { IChartApi, ISeriesApi, Time, LineData } from 'lightweight-charts';
import { LineSeries } from 'lightweight-charts';
import type { Candle } from '../../types/market';
import type { MASetting, BBSetting } from '../indicators/IndicatorSheet';
import { hexToRgba } from '../indicators/IndicatorSheet';
import { computeMA } from '../../utils/movingAverages';
import type { IndicatorSettings, IndicatorLayer, OBOptions } from '../overlays/ChartOverlay';
import type { ChartOverlay } from '../overlays/ChartOverlay';
import type { BBOverlay, BBData } from '../overlays/BBOverlay';

// MarketChart.tsx 내부에 선언되어 있던 헬퍼 함수
function toLineWidth(value: number) {
  if (value <= 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return 4;
}

interface UseIndicatorsProps {
  chartRef: React.MutableRefObject<IChartApi | null>;
  maSeriesMapRef: React.MutableRefObject<Record<number, ISeriesApi<'Line'>>>;
  bbSeriesRef: React.MutableRefObject<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; middle: ISeriesApi<'Line'>; overlay: BBOverlay } | null>;
  overlayRef: React.MutableRefObject<ChartOverlay | null>;
  candles: Candle[];
  period?: string;
  locked?: boolean;
  tickDecimals: number;
  currentTfSeconds: number;
  maSettings?: MASetting[];
  bbSetting?: BBSetting;
  indicatorSettings?: IndicatorSettings;
  indicatorLayers?: IndicatorLayer[];
  obOptions?: OBOptions;
  isLogScale?: boolean;
  toChartTime: (time: string | number) => Time;
  drawingStorageKey?: string;
  variant?: string;
  chartType?: string;
}

export function useIndicators({
  chartRef,
  maSeriesMapRef,
  bbSeriesRef,
  overlayRef,
  candles,
  period,
  locked = false,
  tickDecimals,
  currentTfSeconds,
  maSettings,
  bbSetting,
  indicatorSettings,
  indicatorLayers,
  obOptions,
  isLogScale = true,
  toChartTime,
  drawingStorageKey,
  variant,
  chartType
}: UseIndicatorsProps) {
  // trick to keep tickDecimalsRef.current access inside useEffect valid
  const tickDecimalsRef = { current: tickDecimals };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !maSettings) return;

    const currentMap = maSeriesMapRef.current;
    const initDecimals = tickDecimalsRef.current;
    const initMinMove = Math.pow(10, -initDecimals);
    const scaleId = locked ? 'left' : 'right';
    const closes = candles.map(c => c.close);

    // 인덱스(슬롯)로 키잉 — 기간 편집 시에도 슬롯이 고정돼 옛 선이 유령으로 남거나
    // 같은 기간끼리 충돌하지 않는다. 종류(SMA/EMA/WMA)·기간 변경 시 데이터 재계산.
    maSettings.forEach((ma, idx) => {
      let series = currentMap[idx];
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: hexToRgba(ma.color, ma.opacity ?? 100),
          lineWidth: toLineWidth(ma.lineWidth),
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          visible: ma.show,
          priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove },
          priceScaleId: scaleId
        });
        currentMap[idx] = series;
      } else {
        series.applyOptions({
          color: hexToRgba(ma.color, ma.opacity ?? 100),
          lineWidth: toLineWidth(ma.lineWidth),
          visible: ma.show,
        });
      }
      // 종류/기간 변경 반영 — 설정 바뀔 때마다 전체 재계산(실시간 캔들 갱신은 MarketChart가 담당)
      if (candles.length > 0) {
        const vals = computeMA(closes, ma.period, ma.type ?? 'SMA');
        const data: LineData<Time>[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (vals[i] != null) data.push({ time: toChartTime(candles[i].time), value: vals[i] as number });
        }
        series.setData(data);
      }
    });

    // 슬롯 수가 줄면(설정 축소) 남는 시리즈 제거
    Object.keys(currentMap).map(Number).forEach(k => {
      if (k >= maSettings.length) {
        try { chart.removeSeries(currentMap[k]); } catch { /* 무시 */ }
        delete currentMap[k];
      }
    });
    // candles는 deps에서 제외 — 매 틱 전체 setData 방지(실시간 갱신은 MarketChart 담당).
    // 설정(maSettings=종류/기간/색) 변경 시에만 재계산. eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maSettings, locked, drawingStorageKey, variant, chartType]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bbSetting || !bbSeriesRef.current) return;
    
    const { upper, middle, lower, overlay } = bbSeriesRef.current;
    const lineColor = hexToRgba(bbSetting.lineColor, bbSetting.lineOpacity ?? 100);
    
    upper.applyOptions({ color: lineColor, lineWidth: toLineWidth(bbSetting.lineWidth), visible: bbSetting.show });
    middle.applyOptions({ color: lineColor, lineWidth: 1, lineStyle: 1, visible: bbSetting.show }); // dashed middle line
    lower.applyOptions({ color: lineColor, lineWidth: toLineWidth(bbSetting.lineWidth), visible: bbSetting.show });
    
    if (bbSetting.show && candles.length > 0) {
      const pLower = period ? period.toLowerCase() : '';
      const isDailyOrAbove = pLower.endsWith('d') || pLower.endsWith('w') || pLower.endsWith('mo');
      const { period: bbPeriod, multiplier } = bbSetting;
      const up: LineData<Time>[] = [];
      const mid: LineData<Time>[] = [];
      const low: LineData<Time>[] = [];
      const ov: BBData[] = [];
      let sum = 0;
      let logSum = 0;
      for (let i = 0; i < candles.length; i++) {
        const cPrice = candles[i].close;
        sum += cPrice;
        if (isDailyOrAbove) logSum += Math.log(cPrice);
        
        if (i >= bbPeriod) {
          sum -= candles[i - bbPeriod].close;
          if (isDailyOrAbove) logSum -= Math.log(candles[i - bbPeriod].close);
        }
        
        if (i >= bbPeriod - 1) {
          const sma = sum / bbPeriod;
          let u = 0;
          let l = 0;
          
          if (isDailyOrAbove) {
            const logSma = logSum / bbPeriod;
            let logVarSum = 0;
            for (let j = 0; j < bbPeriod; j++) {
              logVarSum += Math.pow(Math.log(candles[i - j].close) - logSma, 2);
            }
            const logStdDev = Math.sqrt(logVarSum / bbPeriod);
            u = sma * Math.exp(multiplier * logStdDev);
            l = sma / Math.exp(multiplier * logStdDev);
          } else {
            let varianceSum = 0;
            for (let j = 0; j < bbPeriod; j++) {
              varianceSum += Math.pow(candles[i - j].close - sma, 2);
            }
            const stdDev = Math.sqrt(varianceSum / bbPeriod);
            u = sma + (multiplier * stdDev);
            l = sma - (multiplier * stdDev);
          }
          const t = toChartTime(candles[i].time);
          
          up.push({ time: t, value: u });
          mid.push({ time: t, value: sma });
          low.push({ time: t, value: l });
          ov.push({ time: t, upper: u, lower: l });
        }
      }
      if (up.length > 0) {
        upper.setData(up);
        middle.setData(mid);
        lower.setData(low);
        const fillBase = bbSetting.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting.fillColor;
        overlay.update(ov, hexToRgba(fillBase, bbSetting.fillOpacity ?? 10));
      }
    } else if (!bbSetting.show) {
      overlay.update([], 'transparent');
    }
  }, [bbSetting, locked, drawingStorageKey, variant, chartType]);

  // SMC(OB/FVG 등) 오버레이는 currentTfSeconds로 박스 폭/스케일을 잡는다. 단, currentTfSeconds는 TF 버튼을
  // 누르는 즉시 바뀌는데 차트 캔들은 새 데이터 도착 전까지 옛 TF라, currentTfSeconds를 deps로 쓰면 새 TF
  // 스케일로 옛 캔들 위에 SMC가 한 번 다시 그려졌다 넘어가는 깜빡임이 생긴다. 그래서 캔들 데이터가 실제로
  // 바뀌는 시점(첫/마지막 캔들 시각)에 맞춰 갱신 — currentTfSeconds 값은 그때 클로저로 최신값을 읽는다.
  // (캔들 시각 키는 진행 캔들의 매 틱 갱신엔 안 바뀌어 매 틱 재계산도 피한다.)
  const firstCandleTime = candles.length ? candles[0].time : null;
  const lastCandleTime = candles.length ? candles[candles.length - 1].time : null;
  useEffect(() => {
    if (!overlayRef.current || !indicatorSettings) return;
    overlayRef.current.update(indicatorLayers ?? [], indicatorSettings, currentTfSeconds, obOptions, isLogScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorLayers, indicatorSettings, firstCandleTime, lastCandleTime, obOptions, isLogScale, drawingStorageKey, variant, chartType]);

}
