// 이동평균 종류
export type MAType = 'SMA' | 'EMA' | 'WMA';

/**
 * 이동평균 계산 — values(보통 종가) → 각 인덱스의 MA값(워밍업 구간은 null).
 * 반환 길이 = 입력 길이(정렬 유지). period 이전 구간은 null.
 * - SMA: 단순평균(최근 period개 평균)
 * - EMA: 지수가중(k=2/(period+1), 시드=첫 period개 SMA)
 * - WMA: 선형가중(최근 봉일수록 큰 가중치)
 */
export function computeMA(values: number[], period: number, type: MAType = 'SMA'): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;

  if (type === 'EMA') {
    const k = 2 / (period + 1);
    let seed = 0;
    for (let i = 0; i < period; i++) seed += values[i];
    let ema = seed / period;
    out[period - 1] = ema;
    for (let i = period; i < n; i++) {
      ema = values[i] * k + ema * (1 - k);
      out[i] = ema;
    }
  } else if (type === 'WMA') {
    const denom = (period * (period + 1)) / 2;
    for (let i = period - 1; i < n; i++) {
      let s = 0;
      for (let j = 0; j < period; j++) s += values[i - period + 1 + j] * (j + 1);
      out[i] = s / denom;
    }
  } else {
    // SMA
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
  }
  return out;
}
