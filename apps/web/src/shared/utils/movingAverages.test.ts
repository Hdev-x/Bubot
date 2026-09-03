import { describe, it, expect } from 'vitest';
import { computeMA } from './movingAverages';

describe('computeMA', () => {
  const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('데이터가 period 미만이면 전부 null', () => {
    expect(computeMA([1, 2], 5, 'SMA')).toEqual([null, null]);
  });

  it('SMA — 워밍업 null + 최근 period 평균', () => {
    const out = computeMA(vals, 3, 'SMA');
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 6);   // (1+2+3)/3
    expect(out[9]).toBeCloseTo(9, 6);   // (8+9+10)/3
  });

  it('WMA — 선형가중(최근 봉 가중 큼)', () => {
    // period3, 마지막: (3*1 + 4*2 + 5*3)/(1+2+3) = (3+8+15)/6 = 26/6
    const out = computeMA([3, 4, 5], 3, 'WMA');
    expect(out[2]).toBeCloseTo(26 / 6, 6);
  });

  it('EMA — 시드=첫 period SMA, 이후 지수가중', () => {
    const out = computeMA([1, 2, 3, 4], 3, 'EMA');
    expect(out[2]).toBeCloseTo(2, 6);          // seed SMA(1,2,3)=2
    // k=2/4=0.5, ema[3]=4*0.5 + 2*0.5 = 3
    expect(out[3]).toBeCloseTo(3, 6);
  });

  it('상수 입력이면 종류 무관 그 상수', () => {
    const c = new Array(10).fill(7);
    for (const t of ['SMA', 'EMA', 'WMA'] as const) {
      expect(computeMA(c, 4, t)[9]).toBeCloseTo(7, 6);
    }
  });

  it('반환 길이 = 입력 길이', () => {
    expect(computeMA(vals, 4, 'EMA')).toHaveLength(vals.length);
  });
});
