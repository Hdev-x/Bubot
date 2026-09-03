import type { Candle } from '../types/market';

// RSI 기준선(70/50/30) 스타일. style: 0=실선 1=점선 2=대시(lightweight-charts LineStyle).
export type RsiGuideLine = { value: number; color: string; width: number; style: number; visible: boolean };

// RSI 지표 설정(캔들 색 + 기간 + 기준선들)
export type RsiSettings = {
  period: number;
  upColor: string;
  downColor: string;
  logScale: boolean; // RSI 페인 가격축 로그(true)/선형(false)
  lines: RsiGuideLine[];
};

export const DEFAULT_RSI_SETTINGS: RsiSettings = {
  period: 14,
  upColor: '#0ecb81',
  downColor: '#f6465d',
  logScale: false,
  lines: [
    { value: 70, color: 'rgba(150, 150, 150, 0.5)', width: 1, style: 2, visible: true },
    { value: 50, color: 'rgba(150, 150, 150, 0.3)', width: 1, style: 0, visible: true },
    { value: 30, color: 'rgba(150, 150, 150, 0.5)', width: 1, style: 2, visible: true },
  ],
};

// RSI 캔들 한 봉 — 시/고/저/종이 각각 RSI 값(0~100). time은 원본 캔들 time(변환 전).
export type RsiCandle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
};

function rsiFromAvg(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100; // 손실 0 → 100(둘 다 0이면 중립 50)
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Wilder RSI 시퀀스. 앞 period개는 미정의(null). values 길이만큼 반환.
function wilderRsi(values: number[], period: number): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < period + 1) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFromAvg(avgGain, avgLoss);
  for (let i = period + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFromAvg(avgGain, avgLoss);
  }
  return out;
}

/**
 * 가격 캔들 → RSI 캔들. O/H/L/C 각각에 독립 Wilder RSI를 돌리고,
 * RSI 캔들의 high/low는 4개 RSI값의 max/min(RSI는 비단조라 rsiHigh가 최댓값이란 보장 없음).
 * 워밍업(앞 period개)은 결과에서 제외 → 반환 배열이 입력보다 짧을 수 있음(정상).
 */
export function computeRsiCandles(candles: Candle[], period = 14): RsiCandle[] {
  const n = candles.length;
  if (n < period + 1) return [];
  const rO = wilderRsi(candles.map(c => c.open), period);
  const rH = wilderRsi(candles.map(c => c.high), period);
  const rL = wilderRsi(candles.map(c => c.low), period);
  const rC = wilderRsi(candles.map(c => c.close), period);
  const out: RsiCandle[] = [];
  for (let i = period; i < n; i++) {
    const vo = rO[i], vh = rH[i], vl = rL[i], vc = rC[i];
    if (vo == null || vh == null || vl == null || vc == null) continue;
    out.push({
      time: candles[i].time,
      open: vo,
      close: vc,
      high: Math.max(vo, vh, vl, vc),
      low: Math.min(vo, vh, vl, vc),
    });
  }
  return out;
}
