/**
 * 스윙 하이/로우(피벗) 검출 + ZigZag 필터 — 공유 엔진 버전.
 *
 * frontend/src/utils/pivots.ts 원본을 차트 의존성(lightweight-charts Time) 없이 이동한 것.
 * 로직은 원본과 동일해야 한다. 수정 시 차트·백테스트·워커가 동시에 영향받는다.
 *
 * @param toTime 캔들 time을 원하는 형으로 변환 (생략 시 원본 time 그대로)
 */
export type PivotType = 'high' | 'low';

export type Pivot<TTime = number | string> = {
  type: PivotType;
  i: number;
  price: number;
  time: TTime;
};

export type PivotCandle = {
  time: string | number;
  high: number;
  low: number;
  close: number;
};

export function getPivots<TTime = number | string>(
  candles: PivotCandle[],
  len: number,
  basis: string,
  toTime: (time: string | number) => TTime = (t) => t as unknown as TTime,
): Pivot<TTime>[] {
  const rawPivots: Pivot<TTime>[] = [];
  for (let i = len; i < candles.length - len; i++) {
    let isHigh = true;
    let isLow = true;

    const currentHigh = basis === 'wick' ? candles[i].high : candles[i].close;
    const currentLow = basis === 'wick' ? candles[i].low : candles[i].close;

    for (let j = 1; j <= len; j++) {
      const leftHigh = basis === 'wick' ? candles[i - j].high : candles[i - j].close;
      const rightHigh = basis === 'wick' ? candles[i + j].high : candles[i + j].close;
      const leftLow = basis === 'wick' ? candles[i - j].low : candles[i - j].close;
      const rightLow = basis === 'wick' ? candles[i + j].low : candles[i + j].close;

      if (leftHigh > currentHigh || rightHigh > currentHigh) isHigh = false;
      if (leftLow < currentLow || rightLow < currentLow) isLow = false;
    }

    if (isHigh) {
      rawPivots.push({ type: 'high', i, price: currentHigh, time: toTime(candles[i].time) });
    } else if (isLow) {
      rawPivots.push({ type: 'low', i, price: currentLow, time: toTime(candles[i].time) });
    }
  }

  // ZigZag Filter
  const filtered: Pivot<TTime>[] = [];
  let lastType: PivotType | null = null;
  let lastPivot: Pivot<TTime> | null = null;

  for (const p of rawPivots) {
    if (lastType === null) {
      filtered.push(p);
      lastType = p.type;
      lastPivot = p;
    } else if (p.type === lastType) {
      if (p.type === 'high' && lastPivot && p.price > lastPivot.price) {
        filtered[filtered.length - 1] = p;
        lastPivot = p;
      } else if (p.type === 'low' && lastPivot && p.price < lastPivot.price) {
        filtered[filtered.length - 1] = p;
        lastPivot = p;
      }
    } else {
      filtered.push(p);
      lastType = p.type;
      lastPivot = p;
    }
  }
  return filtered;
}
