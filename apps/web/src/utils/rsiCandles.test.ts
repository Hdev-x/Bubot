import { describe, it, expect } from 'vitest';
import { computeRsiCandles } from './rsiCandles';
import type { Candle } from '../types/market';

// close 값 배열 → OHLC 동일한 캔들(검증 단순화: rsiClose가 곧 표준 RSI)
function flatCandles(closes: number[]): Candle[] {
  return closes.map((v, i) => ({ time: 1000 + i * 60, open: v, high: v, low: v, close: v, volume: 0 }));
}

describe('computeRsiCandles', () => {
  it('데이터가 period+1 미만이면 빈 배열', () => {
    expect(computeRsiCandles(flatCandles([1, 2, 3]), 14)).toEqual([]);
  });

  it('워밍업(period개) 제외 → 길이 = n - period', () => {
    const cs = flatCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(computeRsiCandles(cs, 14)).toHaveLength(30 - 14);
  });

  it('계속 상승하면 close RSI = 100', () => {
    const out = computeRsiCandles(flatCandles(Array.from({ length: 20 }, (_, i) => i + 1)), 14);
    expect(out[out.length - 1].close).toBeCloseTo(100, 5);
  });

  it('계속 하락하면 close RSI = 0', () => {
    const out = computeRsiCandles(flatCandles(Array.from({ length: 20 }, (_, i) => 100 - i)), 14);
    expect(out[out.length - 1].close).toBeCloseTo(0, 5);
  });

  it('StockCharts 표준 예제 첫 RSI ≈ 70.46', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28,
    ];
    const out = computeRsiCandles(flatCandles(closes), 14);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBeCloseTo(70.46, 1);
  });

  it('OHLC 모두 같으면 high/low도 close와 동일, 값은 0~100', () => {
    const out = computeRsiCandles(flatCandles(Array.from({ length: 25 }, (_, i) => 50 + Math.sin(i))), 14);
    for (const r of out) {
      expect(r.high).toBeGreaterThanOrEqual(r.low);
      expect(r.high).toBeGreaterThanOrEqual(Math.max(r.open, r.close));
      expect(r.low).toBeLessThanOrEqual(Math.min(r.open, r.close));
      for (const v of [r.open, r.high, r.low, r.close]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
