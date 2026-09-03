import { describe, it, expect } from 'vitest';
import type { Time } from 'lightweight-charts';
import type { Candle } from '../types/market';
import { getPivots } from '../chart/analysis/pivots';

// 테스트용 time 변환: candle.time을 그대로 Time으로 사용
const identityTime = (t: string | number): Time => t as unknown as Time;

// close만 지정하면 나머지를 채워주는 캔들 팩토리 (time = 1000 + index)
function candle(i: number, close: number, high = close, low = close): Candle {
  return { time: 1000 + i, open: close, high, low, close, volume: 0 };
}

describe('getPivots', () => {
  it('close 기준으로 지그재그 고/저점을 검출한다', () => {
    const closes = [10, 20, 15, 18, 5];
    const candles = closes.map((c, i) => candle(i, c));

    const pivots = getPivots(candles, 1, 'close', identityTime);

    expect(pivots).toEqual([
      { type: 'high', i: 1, price: 20, time: 1001 },
      { type: 'low', i: 2, price: 15, time: 1002 },
      { type: 'high', i: 3, price: 18, time: 1003 },
    ]);
  });

  it('가장자리 len개 구간은 피벗 후보에서 제외한다', () => {
    const closes = [10, 20, 30, 20, 10];
    const candles = closes.map((c, i) => candle(i, c));

    // len=2 → i는 2..(5-2-1)=2 한 곳만 스캔
    const pivots = getPivots(candles, 2, 'close', identityTime);

    expect(pivots).toEqual([{ type: 'high', i: 2, price: 30, time: 1002 }]);
  });

  it('ZigZag 필터: 연속 동일 방향 피벗은 하나로 합친다', () => {
    // close가 모두 같으면 모든 내부 지점이 high 후보가 되어 연속 high가 발생
    const closes = [9, 9, 9, 9, 9];
    const candles = closes.map((c, i) => candle(i, c));

    const pivots = getPivots(candles, 1, 'close', identityTime);

    // 첫 high만 남아야 한다 (뒤따르는 동일 가격은 더 극단적이지 않으므로 교체 안 됨)
    expect(pivots).toEqual([{ type: 'high', i: 1, price: 9, time: 1001 }]);
  });

  it('wick 기준은 고가/저가를, close 기준은 종가를 사용한다', () => {
    // 종가는 평평(9)하지만 고가/저가에 뚜렷한 스윙이 있는 캔들
    const candles: Candle[] = [
      candle(0, 9, 10, 8),
      candle(1, 9, 20, 9),
      candle(2, 9, 12, 2),
      candle(3, 9, 15, 9),
      candle(4, 9, 10, 9),
    ];

    const wick = getPivots(candles, 1, 'wick', identityTime);
    expect(wick).toEqual([
      { type: 'high', i: 1, price: 20, time: 1001 },
      { type: 'low', i: 2, price: 2, time: 1002 },
      { type: 'high', i: 3, price: 15, time: 1003 },
    ]);

    // 같은 캔들이라도 close 기준이면 평평해서 high 하나로 수렴
    const close = getPivots(candles, 1, 'close', identityTime);
    expect(close).toEqual([{ type: 'high', i: 1, price: 9, time: 1001 }]);
  });

  it('데이터가 부족하면 빈 배열을 반환한다', () => {
    const candles = [10, 20].map((c, i) => candle(i, c));
    expect(getPivots(candles, 5, 'close', identityTime)).toEqual([]);
  });
});
