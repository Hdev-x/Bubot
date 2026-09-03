/**
 * 엘리어트 임펄스 + AB=CD 패턴 탐지 — 공유 엔진 (단일 소스)
 *
 * ⚠️ 차트(frontend)·백테스트·실전 워커(trader)가 전부 이 파일 하나를 쓴다.
 *    여기를 수정하면 세 곳의 신호가 동시에 바뀐다.
 */
export type PivotPoint = {
  type: 'high' | 'low';
  i: number;
  price: number;
  time: any;
};

export type ElliottWaveResult = {
  isBullish: boolean;
  points: {
    P0: PivotPoint;
    P1: PivotPoint; // Wave 1 end
    P2: PivotPoint; // Wave 2 end
    P3: PivotPoint; // Wave 3 end
    P4: PivotPoint; // Wave 4 end
    P5: PivotPoint; // Wave 5 end
  };
};

export type AbcWaveResult = {
  isBullish: boolean; // true = 하락 조정 (Bullish AB=CD), false = 상승 조정
  ratio: number;
  label: string;
  points: {
    A: PivotPoint;
    B: PivotPoint;
    C: PivotPoint;
    D: PivotPoint;
  };
  przPrice?: number;
  slPrice?: number;
  slRatio?: number;
};

function calcLength(startPrice: number, endPrice: number, isLogScale: boolean) {
  if (isLogScale) {
    return Math.abs(Math.log(endPrice) - Math.log(startPrice));
  }
  return Math.abs(endPrice - startPrice);
}

export function detectElliottWave(pivots: PivotPoint[], isLogScale = false): ElliottWaveResult[] {
  const results: ElliottWaveResult[] = [];
  if (pivots.length < 6) return results;

  // 가장 최근에 완성된 파동을 찾기 위해 역순 탐색
  for (let i = pivots.length - 6; i >= 0; i--) {
    const P0 = pivots[i];
    const P1 = pivots[i + 1];
    const P2 = pivots[i + 2];
    const P3 = pivots[i + 3];
    const P4 = pivots[i + 4];
    const P5 = pivots[i + 5];

    const isBullish = P0.type === 'low';

    if (isBullish) {
      // 상승(Bullish) 임펄스 (L -> H -> L -> H -> L -> H)
      if (
        P1.type !== 'high' || P2.type !== 'low' || 
        P3.type !== 'high' || P4.type !== 'low' || P5.type !== 'high'
      ) continue;

      // 1파 상승, 3파 상승, 5파 상승
      if (P1.price <= P0.price) continue;
      if (P3.price <= P1.price) continue; // 3파는 통상 1파 고점을 넘음
      if (P5.price <= P3.price) continue; // 5파는 통상 3파 고점을 넘음

      // 규칙 1: 2파는 1파의 시작점(P0)을 깨지 않는다
      if (P2.price <= P0.price) continue;

      // 규칙 3: 4파는 1파의 고점(P1)과 겹치지 않는다 (다이아고날 제외 엄격한 임펄스)
      if (P4.price <= P1.price) continue;

      const len1 = calcLength(P0.price, P1.price, isLogScale);
      const len3 = calcLength(P2.price, P3.price, isLogScale);
      const len5 = calcLength(P4.price, P5.price, isLogScale);

      // 규칙 2: 3파는 1, 3, 5파 중 가장 짧을 수 없다
      if (len3 < len1 && len3 < len5) continue;

      results.push({ isBullish: true, points: { P0, P1, P2, P3, P4, P5 } });

    } else {
      // 하락(Bearish) 임펄스 (H -> L -> H -> L -> H -> L)
      if (
        P1.type !== 'low' || P2.type !== 'high' || 
        P3.type !== 'low' || P4.type !== 'high' || P5.type !== 'low'
      ) continue;

      // 1파 하락, 3파 하락, 5파 하락
      if (P1.price >= P0.price) continue;
      if (P3.price >= P1.price) continue; // 3파는 통상 1파 저점을 깸
      if (P5.price >= P3.price) continue; // 5파는 통상 3파 저점을 깸

      // 규칙 1: 2파는 1파의 시작점(P0)을 깨지 않는다
      if (P2.price >= P0.price) continue;

      // 규칙 3: 4파는 1파의 저점(P1)과 겹치지 않는다
      if (P4.price >= P1.price) continue;

      const len1 = calcLength(P1.price, P0.price, isLogScale);
      const len3 = calcLength(P3.price, P2.price, isLogScale);
      const len5 = calcLength(P5.price, P4.price, isLogScale);

      // 규칙 2: 3파는 1, 3, 5파 중 가장 짧을 수 없다
      if (len3 < len1 && len3 < len5) continue;

      results.push({ isBullish: false, points: { P0, P1, P2, P3, P4, P5 } });
    }
  }

  return results;
}

export function detectAbcWave(pivots: PivotPoint[], isLogScale = false, candles?: { time: any; high: number; low: number; }[]): AbcWaveResult[] {
  const results: AbcWaveResult[] = [];
  if (pivots.length < 4) return results;

  for (let i = pivots.length - 4; i >= 0; i--) {
    const A = pivots[i];
    const B = pivots[i + 1];
    const C = pivots[i + 2];
    const D = pivots[i + 3];

    // Bullish AB=CD (A: High -> B: Low -> C: High -> D: Low)
    const isBullishAbcd = A.type === 'high' && B.type === 'low' && C.type === 'high' && D.type === 'low';
    // Bearish AB=CD (A: Low -> B: High -> C: Low -> D: High)
    const isBearishAbcd = A.type === 'low' && B.type === 'high' && C.type === 'low' && D.type === 'high';

    if (!isBullishAbcd && !isBearishAbcd) continue;

    if (isBullishAbcd) {
      if (C.price >= A.price) continue; // C는 A보다 낮아야 함
      if (D.price >= B.price) continue; // D는 B보다 낮아야 함 (AB=CD의 기본)
    } else {
      if (C.price <= A.price) continue; // C는 A보다 높아야 함
      if (D.price <= B.price) continue; // D는 B보다 높아야 함
    }

    // 극점(Extreme Point) 검증: B는 A~C 구간의 극점, C는 B~D 구간의 극점이어야 함
    if (candles && candles.length > 0 && typeof A.i === 'number' && typeof B.i === 'number' && typeof C.i === 'number' && typeof D.i === 'number') {
      let isValidExtreme = true;
      for (let k = A.i; k <= C.i; k++) {
        const cnd = candles[k];
        if (isBullishAbcd) {
          if (cnd.low < B.price) { isValidExtreme = false; break; }
        } else {
          if (cnd.high > B.price) { isValidExtreme = false; break; }
        }
      }
      if (!isValidExtreme) continue;
      for (let k = B.i; k <= D.i; k++) {
        const cnd = candles[k];
        if (isBullishAbcd) {
          if (cnd.high > C.price) { isValidExtreme = false; break; }
        } else {
          if (cnd.low < C.price) { isValidExtreme = false; break; }
        }
      }
      if (!isValidExtreme) continue;
    }

    const lenAB = calcLength(A.price, B.price, isLogScale);
    const lenCD = calcLength(C.price, D.price, isLogScale);

    if (lenAB === 0) continue;

    const ratio = lenCD / lenAB;
    let label = '';

    // 비율 판별 (피보나치 주요 비율 기준 범위)
    let upperRatio = 0;
    if (ratio >= 1.0 && ratio < 1.272) {
      label = '1:1';
      upperRatio = 1.272;
    } else if (ratio >= 1.272 && ratio < 1.618) {
      label = '1:1.272';
      upperRatio = 1.618;
    } else if (ratio >= 1.618 && ratio < 1.886) {
      label = '1:1.618';
      upperRatio = 1.886;
    } else {
      continue; // 비율이 범위를 벗어나면 표시하지 않음
    }

    let slPrice = 0;
    let przPrice = 0;
    
    // 타겟(PRZ) 비율 정의
    const targetRatio = label === '1:1' ? 1.0 : (label === '1:1.272' ? 1.272 : 1.618);

    if (isLogScale) {
      if (isBullishAbcd) {
        przPrice = Math.exp(Math.log(C.price) - lenAB * targetRatio);
        slPrice = Math.exp(Math.log(C.price) - lenAB * upperRatio);
      } else {
        przPrice = Math.exp(Math.log(C.price) + lenAB * targetRatio);
        slPrice = Math.exp(Math.log(C.price) + lenAB * upperRatio);
      }
    } else {
      if (isBullishAbcd) {
        przPrice = C.price - lenAB * targetRatio;
        slPrice = C.price - lenAB * upperRatio;
      } else {
        przPrice = C.price + lenAB * targetRatio;
        slPrice = C.price + lenAB * upperRatio;
      }
    }

    results.push({
      isBullish: isBullishAbcd,
      ratio,
      label,
      points: { A, B, C, D },
      przPrice,
      slPrice,
      slRatio: upperRatio
    });
  }

  return results;
}

export type AbcEmergingResult = {
  isBullish: boolean;
  points: {
    A: PivotPoint;
    B: PivotPoint;
    C: PivotPoint;
  };
  targetLabel: string;
  przPrice: number;
  slPrice: number;
  slRatio?: number;
  isPrzTouched: boolean;
  przTouchedPrice?: number;
  przTouchedTime?: number | string;
};

export function predictAbcWave(pivots: PivotPoint[], currentPrice: number, isLogScale = false, candles?: { time: number | string; high: number; low: number; close?: number }[]): AbcEmergingResult[] {
  const results: AbcEmergingResult[] = [];
  if (pivots.length < 3) return results;

  const startIndex = Math.max(0, pivots.length - 8);
  for (let i = startIndex; i <= pivots.length - 3; i++) {
    const A = pivots[i];
    const B = pivots[i+1];
    const C = pivots[i+2];

    if (A.type === B.type || B.type === C.type) continue;
    
    // A=high, B=low, C=lower high -> D will be lower low -> Bullish (Buy at D)
    const isBullishAbcd = A.type === 'high';

    if (isBullishAbcd) {
      if (C.price >= A.price) continue;
      if (currentPrice > C.price) continue; // Broken above C
    } else {
      if (C.price <= A.price) continue;
      if (currentPrice < C.price) continue; // Broken below C
    }

    // 극점(Extreme Point) 검증: B는 A~C 구간의 극점, C는 B~마지막 캔들 구간의 극점이어야 함 (D는 아직 없음)
    if (candles && candles.length > 0 && typeof A.i === 'number' && typeof B.i === 'number' && typeof C.i === 'number') {
      let isValidExtreme = true;
      for (let k = A.i; k <= C.i; k++) {
        const cnd = candles[k];
        if (isBullishAbcd) {
          if (cnd.low < B.price) { isValidExtreme = false; break; }
        } else {
          if (cnd.high > B.price) { isValidExtreme = false; break; }
        }
      }
      if (!isValidExtreme) continue;
      for (let k = B.i; k < candles.length; k++) {
        const cnd = candles[k];
        if (isBullishAbcd) {
          if (cnd.high > C.price) { isValidExtreme = false; break; }
        } else {
          if (cnd.low < C.price) { isValidExtreme = false; break; }
        }
      }
      if (!isValidExtreme) continue;
    }

    const lenAB = calcLength(A.price, B.price, isLogScale);
    if (lenAB === 0) continue;

    const getTarget = (ratio: number) => {
      if (isLogScale) {
        return isBullishAbcd ? Math.exp(Math.log(C.price) - lenAB * ratio) : Math.exp(Math.log(C.price) + lenAB * ratio);
      } else {
        return isBullishAbcd ? C.price - lenAB * ratio : C.price + lenAB * ratio;
      }
    };

    const target1 = getTarget(1.0);
    const target1272 = getTarget(1.272);
    const target1618 = getTarget(1.618);
    const sl1618 = getTarget(2.0); // 1.618의 SL은 임의로 2.0으로 설정

    // 현재 액티브 타겟 결정 (릴레이): 현재가가 아닌 C 이후 극값 기준 —
    // 과거 꼬리가 하위 단계 SL을 찍고 반등해도 무효가 아니라 다음 단계로 넘어간 것으로 처리
    let relayExtreme = currentPrice;
    if (candles && candles.length > 0 && typeof C.i === 'number') {
      for (let k = C.i + 1; k < candles.length; k++) {
        relayExtreme = isBullishAbcd ? Math.min(relayExtreme, candles[k].low) : Math.max(relayExtreme, candles[k].high);
      }
    } else {
      for (let j = i + 3; j < pivots.length; j++) {
        relayExtreme = isBullishAbcd ? Math.min(relayExtreme, pivots[j].price) : Math.max(relayExtreme, pivots[j].price);
      }
    }

    let activeLabel = '1:1';
    let przPrice = target1;
    let slPrice = target1272;
    let activeSlRatio = 1.272;

    if (isBullishAbcd) {
      if (relayExtreme <= target1618) {
        activeLabel = '1:1.618';
        przPrice = target1618;
        slPrice = sl1618;
        activeSlRatio = 2.0;
      } else if (relayExtreme <= target1272) {
        activeLabel = '1:1.272';
        przPrice = target1272;
        slPrice = target1618;
        activeSlRatio = 1.618;
      }
    } else {
      if (relayExtreme >= target1618) {
        activeLabel = '1:1.618';
        przPrice = target1618;
        slPrice = sl1618;
        activeSlRatio = 2.0;
      } else if (relayExtreme >= target1272) {
        activeLabel = '1:1.272';
        przPrice = target1272;
        slPrice = target1618;
        activeSlRatio = 1.618;
      }
    }

    let isValid = true;
    let isPrzTouched = false;
    let przTouchedTime: number | string | undefined;
    let przTouchedPrice: number | undefined;
    let extremePrice = currentPrice;
    let isBBrokenByClose = false;

    // C점 이후 형성된 피벗 검사
    for (let j = i + 3; j < pivots.length; j++) {
      const p = pivots[j];
      if (isBullishAbcd) {
        extremePrice = Math.min(extremePrice, p.price);
        if (p.price > C.price) isValid = false; // C점 역돌파(완전 무효화)
        if (p.price <= slPrice) isValid = false; // 현재 액티브 타겟의 SL도 돌파(무효화 혹은 다음 단계로 넘어가야 하는데 이미 지난 피벗임)
        if (p.price <= przPrice) { isPrzTouched = true; if (!przTouchedTime) przTouchedTime = p.time; } // 최초 터치만 기록 (하모닉과 통일, 박스 폭 확보)
      } else {
        extremePrice = Math.max(extremePrice, p.price);
        if (p.price < C.price) isValid = false;
        if (p.price >= slPrice) isValid = false;
        if (p.price >= przPrice) { isPrzTouched = true; if (!przTouchedTime) przTouchedTime = p.time; } // 최초 터치만 기록 (하모닉과 통일, 박스 폭 확보)
      }
    }

    // 캔들이 제공된 경우 C점 이후의 캔들 고/저점 정밀 체크
    if (candles && candles.length > 0 && typeof C.i === 'number') {
      isValid = true;
      isPrzTouched = false;
      przTouchedTime = undefined;
      przTouchedPrice = undefined;
      extremePrice = currentPrice;

      for (let k = C.i + 1; k < candles.length; k++) {
        const cnd = candles[k];
        const cndClose = cnd.close ?? cnd.low;

        if (isBullishAbcd) {
          extremePrice = Math.min(extremePrice, cnd.low);
          if (cndClose < B.price) isBBrokenByClose = true;
          if (cnd.high > C.price) { isValid = false; break; }
          if (cnd.low <= slPrice) { isValid = false; break; }
          if (cnd.low <= przPrice) {
            if (!isPrzTouched) {
              isPrzTouched = true;
              przTouchedTime = cnd.time;
              przTouchedPrice = cnd.low; // 최초 터치 캔들의 꼬리(low)에 스냅 고정
            }
          }
        } else {
          extremePrice = Math.max(extremePrice, cnd.high);
          const cndCloseBear = cnd.close ?? cnd.high;
          if (cndCloseBear > B.price) isBBrokenByClose = true;
          if (cnd.low < C.price) { isValid = false; break; }
          if (cnd.high >= slPrice) { isValid = false; break; }
          if (cnd.high >= przPrice) {
            if (!isPrzTouched) {
              isPrzTouched = true;
              przTouchedTime = cnd.time;
              przTouchedPrice = cnd.high; // 최초 터치 캔들의 꼬리(high)에 스냅 고정
            }
          }
        }
      }
    }

    if (!candles || candles.length === 0 || typeof C.i !== 'number') {
      if (isBullishAbcd) {
        if (currentPrice < B.price) isBBrokenByClose = true;
      } else {
        if (currentPrice > B.price) isBBrokenByClose = true;
      }
    }

    if (!isBBrokenByClose) isValid = false;

    // 현재가 기준 SL 돌파 및 PRZ 터치 검사
    if (isBullishAbcd) {
      if (currentPrice <= slPrice) isValid = false;
      if (currentPrice <= przPrice) isPrzTouched = true;
    } else {
      if (currentPrice >= slPrice) isValid = false;
      if (currentPrice >= przPrice) isPrzTouched = true;
    }

    if (!isValid) continue;

    results.push({
      isBullish: isBullishAbcd,
      points: { A, B, C },
      targetLabel: activeLabel,
      przPrice,
      slPrice,
      isPrzTouched,
      przTouchedTime,
      przTouchedPrice,
      slRatio: activeSlRatio
    });
  }

  return results;
}
