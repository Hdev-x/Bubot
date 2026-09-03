/**
 * 하모닉 패턴 탐지 유틸리티 — 공유 엔진 (단일 소스)
 *
 * Scott M. Carney의 하모닉 트레이딩(1~3권) 기준으로 작성.
 * 각 패턴의 피보나치 비율은 docs/reference/하모닉 자료에 근거함.
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

/** 완성된 하모닉 패턴 (detectHarmonicPatterns 반환) — D점과 TP/SL이 확정된다. */
export type HarmonicPatternResult = {
  name: string;
  isBullish: boolean;
  points: {
    X: PivotPoint;
    A: PivotPoint;
    B: PivotPoint;
    C: PivotPoint;
    D: PivotPoint;
  };
  error: number;
  abcdMatch?: boolean;
  abcdType?: string;
  closestAbcd?: string;
  abcdRatio?: number; // 실제 CD/AB 비율 (라벨 단계 표시·체크용)
  tp1: number;
  tp2: number;
  sl: number;
  przPrice?: number;
};

/** 미완성(예측) 하모닉 패턴 (predictHarmonicPatterns 반환) — D는 아직 없고 PRZ로 예측한다. */
export type EmergingHarmonicResult = {
  name: string;
  isBullish: boolean;
  points: {
    X: PivotPoint;
    A: PivotPoint;
    B: PivotPoint;
    C: PivotPoint;
  };
  error: number;
  przPrice: number;
  przMin: number;
  przMax: number;
  slPrice: number;
  bcAbRatio?: number;
  bcAbTier?: string;
  bcProjectionRatio?: number;
  bcProjectionRange?: string;
  bcProjectionMatch?: boolean;
  abcdRatio?: number;
  abcdTier?: string;
  abcdMatch?: boolean;
  abXaRatio?: number; // AB/XA (B점 깊이)
  xcXaRatio?: number; // XC/XA (C점 위치, 가틀리 자유 변수)
  isPrzTouched?: boolean; // PRZ 터치 여부 (진입 신호 잡힘)
  przTouchedTime?: number | string; // PRZ 터치한 캔들의 시간
  przTouchedPrice?: number; // PRZ 터치 시 캔들의 고점/저점 (D점 그리기용)
  // ── display 모드 전용 생애주기 분류 ──
  // 탐색(미터치)/신호(터치,0.5미체결)/체결(0.5터치)/완성(체결후 SL·TP·시간)/폐기(0.5전 TP1 선도달)
  lifecycle?: 'scanning' | 'signal' | 'active' | 'completed' | 'cancelled';
  endReason?: 'sl' | 'tp' | 'timeout'; // 완성(종료) 사유
  slHunted?: boolean; // 종료 전 꼬리만 SL 관통(종가는 SL 안) — 완성+SL헌팅 라벨용
  slBroken?: boolean; // 종가가 SL 넘김 — SL 이탈(= endReason 'sl')
  tp1?: number; // 완성 렌더용 TP1 가격(detect 공식, expected_D 기준)
  tp2?: number; // 완성 렌더용 TP2 가격
  entryPrice?: number; // display: 0.5 진입가 (D→SL 0.5 보간)
  filled?: boolean; // display: 0.5 진입라인 체결 여부 (active/completed=true)
  entryTime?: number | string; // display: 0.5 체결 캔들 시간 (active/completed)
  exitPrice?: number; // display: 종료/폐기 가격 (완성=SL/TP/종가, 폐기=TP1)
  exitTime?: number | string; // display: 종료/폐기 캔들 시간
};

const DISPLAY_MAX_HOLD = 300; // display 완성 판정: 터치 후 이 캔들 수 지나면 시간만료 종료
// display 캔들폭 밴드: 패턴 X→C 폭이 이 범위 밖이면 표시 제외(너무 짧음=노이즈 / 너무 김=상위 TF).
// 매매(entry) 무관 — isDisplay에서만 적용. 같은 밴드를 전 TF에 걸어 중복도 자연 감소.
const DISPLAY_MIN_SPAN = 15;
const DISPLAY_MAX_SPAN = 200;

const TOLERANCE_RATIO = 0.01; // 1% 오차 (B점 등 단일 비율)
const TOLERANCE_RANGE = 0.0;  // 0% 오차 (C점 등 범위 비율)

function checkRatio(value: number, target: number, tolerance = TOLERANCE_RATIO): boolean {
  return Math.abs(value - target) <= tolerance;
}

function checkRange(value: number, min: number, max: number, tolerance = TOLERANCE_RANGE): boolean {
  return value >= min - tolerance && value <= max + tolerance;
}

/**
 * AB=CD 보정 검증
 */
function checkAbcd(cd_ab: number, allowedRatios: number[]): [boolean, string] {
  for (const ratio of allowedRatios) {
    if (checkRatio(cd_ab, ratio)) {
      if (ratio === 1.0) return [true, '1:1'];
      return [true, ratio.toString()];
    }
  }
  return [false, ''];
}

function findClosestAbcd(cd_ab: number): string {
  const standards = [1.0, 1.272, 1.618];
  let closest = standards[0];
  let minDiff = Math.abs(cd_ab - closest);
  for (let i = 1; i < standards.length; i++) {
    const diff = Math.abs(cd_ab - standards[i]);
    if (diff < minDiff) {
      closest = standards[i];
      minDiff = diff;
    }
  }
  return closest === 1.0 ? '1:1' : closest.toString();
}

function getAbcdTier(cd_ab: number): string | null {
  if (cd_ab >= 1.618) return '1.618';
  if (cd_ab >= 1.272) return '1.272';
  if (cd_ab >= 1.0) return '1:1';
  return null;
}

function getBcAbTier(bc_ab: number): string {
  if (bc_ab >= 0.786) return '0.786~1.0';
  if (bc_ab >= 0.618) return '0.618~0.786';
  if (bc_ab >= 0.5) return '0.5~0.618';
  if (bc_ab >= 0.382) return '0.382~0.5';
  return '<0.382';
}

function getBcProjectionRange(patternName: string): { label: string; min: number; max: number } | null {
  const ranges: Record<string, { label: string; min: number; max: number }> = {
    'Gartley': { label: '1.13~1.618', min: 1.13, max: 1.618 },
    'Deep Gartley': { label: '1.414~3.14', min: 1.414, max: 3.14 },
    'Bat': { label: '>=1.618', min: 1.618, max: Infinity },
    'Alt Bat': { label: '2.0~4.236', min: 2.0, max: 4.236 },
    'Butterfly': { label: '1.618~2.618', min: 1.618, max: 2.618 },
    'Crab': { label: '2.0~4.236', min: 2.0, max: 4.236 },
    'Deep Crab': { label: '2.0~3.618', min: 2.0, max: 3.618 },
    'Shark': { label: '1.618~2.618', min: 1.618, max: 2.618 },
    '5-0': { label: '0.5~0.618', min: 0.5, max: 0.618 },
  };
  return ranges[patternName] ?? null;
}

/**
 * 과거 데이터에서 완성된 하모닉 패턴 10종 탐지
 */
export function detectHarmonicPatterns(pivots: PivotPoint[], isLogScale = false, candles?: { time: any; high: number; low: number; }[]): HarmonicPatternResult[] {
  const results: HarmonicPatternResult[] = [];
  
  const calcDiff = (p1: number, p2: number) => isLogScale ? Math.log(p1) - Math.log(p2) : p1 - p2;
  const calcAbsDiff = (p1: number, p2: number) => Math.abs(calcDiff(p1, p2));
  const calcTarget = (basePrice: number, diffSigned: number, ratio: number) => {
    if (isLogScale) return Math.exp(Math.log(basePrice) + ratio * diffSigned);
    return basePrice + ratio * diffSigned;
  };
  
  for (let i = 0; i <= pivots.length - 5; i++) {
    const X = pivots[i];
    const A = pivots[i+1];
    const B = pivots[i+2];
    const C = pivots[i+3];
    const D = pivots[i+4];

    if (X.type === A.type || B.type !== X.type || C.type !== A.type || D.type !== X.type) continue;
    const isBullish = X.type === 'low';

    // 극점(Extreme Point) 검증: C는 B와 D 사이에서 가장 높거나(Bullish) 낮아야(Bearish) 함
    if (candles && candles.length > 0 && typeof B.i === 'number' && typeof C.i === 'number' && typeof D.i === 'number') {
      let isCValid = true;
      const startIdx = Math.min(B.i, D.i);
      const endIdx = Math.max(B.i, D.i);
      for(let k = startIdx; k <= endIdx; k++) {
        const cnd = candles[k];
        if (isBullish) {
          if (cnd.high > C.price) { isCValid = false; break; }
        } else {
          if (cnd.low < C.price) { isCValid = false; break; }
        }
      }
      if (!isCValid) continue;
    }

    const XA = calcAbsDiff(A.price, X.price);
    const AB = calcAbsDiff(B.price, A.price);
    const BC = calcAbsDiff(C.price, B.price);
    const CD = calcAbsDiff(D.price, C.price);
    const XC = calcAbsDiff(C.price, X.price);

    if (XA === 0 || AB === 0 || BC === 0 || XC === 0) continue;

    const ab_xa  = AB / XA;
    const bc_ab  = BC / AB;
    const cd_bc  = CD / BC;
    const ad_xa  = calcAbsDiff(D.price, A.price) / XA;
    const xc_xa  = XC / XA;
    const cd_xc  = CD / XC;
    const cd_ab  = CD / AB;

    // 여러 패턴 동시 매칭 시 D점 결정 비율의 이상값과 가장 가까운 패턴을 선택 (err = |실제 - 이상비율|)
    let matchedPattern = '';
    let minError = Infinity;
    let abcdMatch = false;
    let abcdType = '';
    let isNoAbcd = false;

    // 1. Gartley
    {
      if (cd_ab >= 1.0 && ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 1.13 && cd_bc < 1.618 && ad_xa >= 0.786 && ad_xa < 0.886) {
        const err = Math.abs(ad_xa - 0.786);
        if (err < minError) { matchedPattern = 'Gartley'; minError = err; abcdMatch = true; abcdType = "1:1"; }
      }
    }
    // 2. Deep Gartley
    if (cd_ab >= 1.0 && ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 1.414 && cd_bc < 3.14 && ad_xa >= 0.886 && ad_xa < 1.13) {
      const err = Math.abs(ad_xa - 0.886);
      if (err <= minError) { // 경계값(ad_xa=0.886)에서는 딥가틀리를 우선시함
        matchedPattern = 'Deep Gartley'; minError = err; abcdMatch = true; abcdType = "1:1";
      }
    }
    // 3. Bat
    if (cd_ab >= 1.0 && ab_xa >= 0.382 && ab_xa < 0.5 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 1.618 && ad_xa >= 0.886 && ad_xa < 1.0) {
      const err = Math.abs(ad_xa - 0.886);
      if (err < minError) {
        matchedPattern = 'Bat'; minError = err; abcdMatch = true; abcdType = ">=1.0";
      }
    }
    // 4. Alt Bat
    if (cd_ab >= 1.0 && ab_xa >= 0.236 && ab_xa < 0.382 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 2.0 && cd_bc < 4.236 && ad_xa >= 1.13 && ad_xa < 1.272) {
      const err = Math.abs(ad_xa - 1.13);
      if (err < minError) {
        matchedPattern = 'Alt Bat'; minError = err; abcdMatch = true; abcdType = ">=1.0";
      }
    }
    // 5. Butterfly
    if (cd_ab >= 1.0 && ab_xa >= 0.786 && ab_xa < 0.886 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 1.618 && cd_bc < 2.618 && ad_xa >= 1.272 && ad_xa < 1.414) {
      const err = Math.abs(ad_xa - 1.272);
      if (err < minError) {
        matchedPattern = 'Butterfly'; minError = err; abcdMatch = true; abcdType = ">=1.0";
      }
    }
    // 6. Crab
    if (cd_ab >= 1.0 && ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 2.618 && cd_bc < 4.236 && ad_xa >= 1.618 && ad_xa < 2.0) {
      const err = Math.abs(ad_xa - 1.618);
      if (err < minError) {
        matchedPattern = 'Crab'; minError = err; abcdMatch = true; abcdType = ">=1.0";
      }
    }
    // 7. Deep Crab
    if (cd_ab >= 1.0 && ab_xa >= 0.886 && ab_xa < 1.0 && bc_ab >= 0.382 && bc_ab < 1.0 && cd_bc >= 2.0 && cd_bc < 3.618 && ad_xa >= 1.618 && ad_xa < 2.0) {
      const err = Math.abs(ad_xa - 1.618);
      if (err < minError) {
        matchedPattern = 'Deep Crab'; minError = err; abcdMatch = true; abcdType = ">=1.0";
      }
    }
    // 8. Cypher
    if (ab_xa >= 0.382 && ab_xa < 0.786 && xc_xa >= 1.272 && xc_xa < 1.414 && cd_xc >= 0.786 && cd_xc < 0.886) {
      const err = Math.abs(cd_xc - 0.786);
      if (err < minError) {
        matchedPattern = 'Cypher'; minError = err; abcdMatch = true; abcdType = 'N/A'; isNoAbcd = true;
      }
    }
    // 9. Shark
    if (ab_xa >= 0.382 && ab_xa < 0.786 && checkRange(bc_ab, 1.13, 1.618) && cd_xc >= 0.886 && cd_xc < 1.13 && cd_bc >= 1.618 && cd_bc < 2.618) {
      const err = Math.abs(cd_xc - 0.886);
      if (err < minError) {
        matchedPattern = 'Shark'; minError = err; abcdMatch = true; abcdType = 'N/A'; isNoAbcd = true;
      }
    }
    // 10. 5-0 Pattern
    if (ab_xa >= 1.13 && ab_xa < 1.886 && bc_ab >= 1.618 && bc_ab < 2.382 && cd_bc >= 0.5 && cd_bc < 0.618) {
      const err = Math.abs(cd_bc - 0.5);
      if (err < minError) {
        matchedPattern = '5-0'; minError = err; abcdMatch = true; abcdType = 'N/A'; isNoAbcd = true;
      }
    }

    if (matchedPattern) {
      let tp1 = 0, tp2 = 0, sl = 0, przPrice = 0;
      if (matchedPattern === 'Cypher') {
        const CD_signed = calcDiff(C.price, D.price);
        tp1 = calcTarget(D.price, CD_signed, 0.382);
        tp2 = calcTarget(D.price, CD_signed, 0.618);
        const XC_signed = calcDiff(C.price, X.price);
        sl = calcTarget(C.price, XC_signed, -0.886);
        przPrice = calcTarget(C.price, XC_signed, -0.786);
      } else if (matchedPattern === 'Shark') {
        const CD_signed = calcDiff(C.price, D.price);
        tp1 = calcTarget(D.price, CD_signed, 0.5);
        tp2 = calcTarget(D.price, CD_signed, 0.886);
        const XC_signed = calcDiff(C.price, X.price);
        sl = calcTarget(C.price, XC_signed, -1.13);
        przPrice = calcTarget(C.price, XC_signed, -0.886);
      } else if (matchedPattern === '5-0') {
        const CD_signed = calcDiff(C.price, D.price);
        tp1 = C.price;
        tp2 = calcTarget(D.price, CD_signed, 1.272);
        const BC_signed = calcDiff(C.price, B.price);
        sl = calcTarget(C.price, BC_signed, -0.618);
        przPrice = calcTarget(C.price, BC_signed, -0.5);
      } else {
        const AD_signed = calcDiff(A.price, D.price);
        tp1 = calcTarget(D.price, AD_signed, 0.382);
        tp2 = calcTarget(D.price, AD_signed, 0.618);
        const slRatios: Record<string, number> = {
          'Gartley': 0.886, 'Deep Gartley': 1.13, 'Bat': 1.0,
          'Alt Bat': 1.272, 'Butterfly': 1.414, 'Crab': 2.0, 'Deep Crab': 2.0,
        };
        const dRatios: Record<string, number> = {
          'Gartley': 0.786, 'Deep Gartley': 0.886, 'Bat': 0.886,
          'Alt Bat': 1.13, 'Butterfly': 1.272, 'Crab': 1.618, 'Deep Crab': 1.618,
        };
        const slRatio = slRatios[matchedPattern] || 1.0;
        const dRatio = dRatios[matchedPattern] || 0.786;
        const XA_signed = calcDiff(A.price, X.price);
        sl = calcTarget(A.price, XA_signed, -slRatio);
        przPrice = calcTarget(A.price, XA_signed, -dRatio);
      }

      let isSlBroken = false;
      if (tp1 <= 0 || tp2 <= 0 || sl <= 0) isSlBroken = true;
      if (isBullish && D.price <= sl) isSlBroken = true;
      if (!isBullish && D.price >= sl) isSlBroken = true;

      if (!isSlBroken) {
        results.push({
          name: `${isBullish ? 'Bullish' : 'Bearish'} ${matchedPattern}`,
          isBullish, points: { X, A, B, C, D }, error: minError,
          abcdMatch, abcdType, closestAbcd: isNoAbcd ? '' : findClosestAbcd(cd_ab),
          abcdRatio: cd_ab,
          tp1, tp2, sl, przPrice
        });
      }
    }
  }
  return results;
}

/**
 * 실시간 마지막 캔들 기준으로 미완성 패턴 예측
 */


export function predictHarmonicPatterns(pivots: PivotPoint[], currentPrice: number, isLogScale = false, candles?: { time: number | string; high: number; low: number; close?: number }[], opts?: { mode?: 'entry' | 'display'; scanLimit?: number }): EmergingHarmonicResult[] {
  const results: EmergingHarmonicResult[] = [];
  if (pivots.length < 4) return results;
  // display = 차트/모니터링 표시용(전체 스캔 + 생애주기 분류 + SL헌팅/이탈 보존). 기본 entry = 진입/백테스트(현행).
  const isDisplay = opts?.mode === 'display';

  const calcDiff = (p1: number, p2: number) => isLogScale ? Math.log(p1) - Math.log(p2) : p1 - p2;
  const calcAbsDiff = (p1: number, p2: number) => Math.abs(calcDiff(p1, p2));
  const calcTarget = (basePrice: number, diffSigned: number, ratio: number) => {
    if (isLogScale) return Math.exp(Math.log(basePrice) + ratio * diffSigned);
    return basePrice + ratio * diffSigned;
  };

  // scanLimit: 패턴 시작점(X) 스캔을 최근 N피벗으로 제한. 백테스트(시간순 재생)는 매 캔들 호출되므로
  // 전체 재스캔(display 기본 0) 없이도 전 기간 패턴이 각자 생성 시점에 잡힌다 → O(n²)→O(n).
  // 차트 단일 호출은 opts 미전달이라 기존(display=0/entry=last-8) 유지.
  const startIndex = typeof opts?.scanLimit === 'number'
    ? Math.max(0, pivots.length - opts.scanLimit)
    : (isDisplay ? 0 : Math.max(0, pivots.length - 8));

  for (let i = startIndex; i <= pivots.length - 4; i++) {
    const X = pivots[i];
    const A = pivots[i+1];
    const B = pivots[i+2];
    const C = pivots[i+3];

    if (X.type === A.type || B.type !== X.type || C.type !== A.type) continue;
    const isBullish = X.type === 'low';

    // 기하 검증: C(되돌림 고/저)는 B의 올바른 쪽이어야 함 — bull은 C>B, bear는 C<B.
    // 하락/상승 계단에서 "고점 C가 저점 B보다 낮은" 깨진 패턴(폴리곤 찌그러짐) 제외.
    // (entry는 C 극점검증으로 이미 제외 → 거래 무영향, display 정리용)
    if (isBullish ? C.price <= B.price : C.price >= B.price) continue;

    const XA = calcAbsDiff(A.price, X.price);
    const AB = calcAbsDiff(B.price, A.price);
    const BC = calcAbsDiff(C.price, B.price);
    if (XA === 0 || AB === 0 || BC === 0) continue;

    // 극점(Extreme Point) 검증: D가 아직 없으므로 B 이후 마지막 캔들까지 C를 넘는 캔들이 있으면 폐기
    if (candles && candles.length > 0 && typeof B.i === 'number' && typeof C.i === 'number') {
      let isCValid = true;
      for (let k = B.i; k < candles.length; k++) {
        const cnd = candles[k];
        if (isBullish) {
          if (cnd.high > C.price) { isCValid = false; break; }
        } else {
          if (cnd.low < C.price) { isCValid = false; break; }
        }
      }
      // display 모드에선 윈도우 단위로 폐기하지 않고, 패턴별(터치 여부)로 아래에서 판정한다.
      if (!isCValid && !isDisplay) continue;
    }

  const ab_xa = AB / XA;
  const bc_ab = BC / AB;
  const xc_xa = calcAbsDiff(C.price, X.price) / XA;

  const XA_signed = calcDiff(A.price, X.price);
  const XC_signed = calcDiff(C.price, X.price);
  const BC_signed = calcDiff(C.price, B.price);

  // if (process.env.NODE_ENV === 'development') console.log(`Predict Check (LogScale: ${isLogScale}) -> ab_xa: ${ab_xa.toFixed(3)}, bc_ab: ${bc_ab.toFixed(3)}, xc_xa: ${xc_xa.toFixed(3)}, X: ${X.price}, A: ${A.price}, B: ${B.price}, C: ${C.price}`);

  // 패턴별 조건을 검사하고 만족하는 모든 예상 패턴을 수집합니다.
  const candidates: { name: string, base: string, ratio: number, slRatio: number }[] = [
    { name: 'Gartley', base: 'XA', ratio: 0.786, slRatio: 0.886 },
    { name: 'Deep Gartley', base: 'XA', ratio: 0.886, slRatio: 1.13 },
    { name: 'Bat', base: 'XA', ratio: 0.886, slRatio: 1.0 },
    { name: 'Alt Bat', base: 'XA', ratio: 1.13, slRatio: 1.272 },
    { name: 'Butterfly', base: 'XA', ratio: 1.272, slRatio: 1.414 },
    { name: 'Crab', base: 'XA', ratio: 1.618, slRatio: 2.0 },
    { name: 'Deep Crab', base: 'XA', ratio: 1.618, slRatio: 2.0 },
    { name: 'Shark', base: 'XC', ratio: 0.886, slRatio: 1.13 },
    { name: 'Cypher', base: 'XC', ratio: 0.786, slRatio: 0.886 },
    { name: '5-0', base: 'BC', ratio: 0.5, slRatio: 0.618 }
  ];

  // C 이후~C돌파 전 구간의 실제 캔들 극점만 추적. 현재가로 시드하면(과거 버그) 현재가가
  // expected_D 아래라는 이유만으로 거짓 터치 판정 → C 선이탈 패턴이 완성으로 그려짐.
  let candleExtremePrice = isBullish ? Infinity : -Infinity;
  let candleExtremeTime: number | string | null = candles && candles.length > 0 ? (candles[candles.length - 1]?.time ?? null) : null;
  let isCBrokenByCandle = false;

  if (candles && candles.length > 0 && typeof C.i === 'number') {
    for (let k = C.i + 1; k < candles.length; k++) {
      const cnd = candles[k];
      if (isBullish) {
        if (cnd.low < candleExtremePrice) { candleExtremePrice = cnd.low; candleExtremeTime = cnd.time; }
        if (cnd.high > C.price) { isCBrokenByCandle = true; break; }
      } else {
        if (cnd.high > candleExtremePrice) { candleExtremePrice = cnd.high; candleExtremeTime = cnd.time; }
        if (cnd.low < C.price) { isCBrokenByCandle = true; break; }
      }
    }
  }

  for (const cand of candidates) {
    let expected_D = 0;
    let expected_sl = 0;

    if (cand.base === 'XA') {
      expected_D = calcTarget(A.price, XA_signed, -cand.ratio);
      expected_sl = calcTarget(A.price, XA_signed, -cand.slRatio);
    } else if (cand.base === 'XC') {
      expected_D = calcTarget(C.price, XC_signed, -cand.ratio);
      expected_sl = calcTarget(C.price, XC_signed, -cand.slRatio);
    } else if (cand.base === 'BC') {
      expected_D = calcTarget(C.price, BC_signed, -cand.ratio);
      expected_sl = calcTarget(C.price, BC_signed, -cand.slRatio);
    }

    let match = false;

    if (cand.name === 'Gartley') {
      if (ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Deep Gartley') {
      if (ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Bat') {
      if (ab_xa >= 0.382 && ab_xa < 0.5 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Alt Bat') {
      if (ab_xa >= 0.236 && ab_xa < 0.382 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Butterfly') {
      if (ab_xa >= 0.786 && ab_xa < 0.886 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Crab') {
      if (ab_xa >= 0.618 && ab_xa < 0.786 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Deep Crab') {
      if (ab_xa >= 0.886 && ab_xa < 1.0 && bc_ab >= 0.382 && bc_ab < 1.0) match = true;
    } else if (cand.name === 'Shark') {
      if (ab_xa >= 0.382 && ab_xa < 0.786 && bc_ab >= 1.13 && bc_ab <= 1.618) match = true;
    } else if (cand.name === 'Cypher') {
      if (ab_xa >= 0.382 && ab_xa < 0.786 && xc_xa >= 1.272 && xc_xa < 1.414) match = true;
    } else if (cand.name === '5-0') {
      if (ab_xa >= 1.13 && ab_xa < 1.886 && bc_ab >= 1.618 && bc_ab < 2.382) match = true;
    }

    if (match) {
      let isValid = true;
      if (expected_D <= 0 || expected_sl <= 0) isValid = false;
      // D(PRZ) 터치 선판정 — 터치 후의 C 돌파는 TP로 가는 정상 움직임이라 무효화하지 않기 위함
      const preTouched = candles && candles.length > 0
        ? (isBullish ? candleExtremePrice <= expected_D : candleExtremePrice >= expected_D)
        : false;
      // SL 이탈 체크 (현재가가 SL을 깼는지) — entry 모드만. display는 SL이탈도 표시(채도)하므로 폐기 안 함.
      if (!isDisplay && isBullish && currentPrice <= expected_sl) isValid = false;
      if (!isDisplay && !isBullish && currentPrice >= expected_sl) isValid = false;

      // C점 역진행 체크 — D 터치 "전"에만 무효 (미터치=탐색 단계 전용 필터)
      if (isBullish && currentPrice > C.price && !preTouched) isValid = false;
      if (!isBullish && currentPrice < C.price && !preTouched) isValid = false;

      if (isValid) {
        // C점 이후에 형성된 피벗들이 패턴을 무효화(SL 터치)했거나 이미 목표(PRZ)를 달성했는지 체크
        let isAlreadyCompletedOrBroken = false;
        let isPrzTouched = false;
        let przTouchedTime: number | string | null = null;
        let extremePrice = currentPrice;
        let extremeTime: number | string | null = null;
        
        for (let j = i + 4; j < pivots.length; j++) {
          const futurePivot = pivots[j];
          if (isBullish) {
            if (futurePivot.price < extremePrice) {
              extremePrice = futurePivot.price;
              extremeTime = (candles && typeof futurePivot.i === 'number' && candles[futurePivot.i]) ? candles[futurePivot.i].time : futurePivot.time;
            }
            if (futurePivot.price <= expected_sl || futurePivot.price > C.price) isAlreadyCompletedOrBroken = true;
            if (futurePivot.price <= expected_D) {
              isPrzTouched = true; // PRZ 도달
            }
          } else {
            if (futurePivot.price > extremePrice) {
              extremePrice = futurePivot.price;
              extremeTime = (candles && typeof futurePivot.i === 'number' && candles[futurePivot.i]) ? candles[futurePivot.i].time : futurePivot.time;
            }
            if (futurePivot.price >= expected_sl || futurePivot.price < C.price) isAlreadyCompletedOrBroken = true;
            if (futurePivot.price >= expected_D) {
              isPrzTouched = true; // PRZ 도달
            }
          }
        }

        // 캔들이 제공된 경우 C점 이후의 캔들 고/저점도 정밀 체크 (아직 피벗이 형성되지 않은 최근 봉에서 이미 터치했을 수 있음)
        if (candles && candles.length > 0 && typeof C.i === 'number') {
          isAlreadyCompletedOrBroken = false;
          isPrzTouched = false;
          przTouchedTime = null;
          extremePrice = candleExtremePrice;
          extremeTime = candleExtremeTime;

          // 1) D(PRZ) 터치 판정 먼저
          if (isBullish) {
            if (candleExtremePrice <= expected_D) isPrzTouched = true;
          } else {
            if (candleExtremePrice >= expected_D) isPrzTouched = true;
          }
          // 2) SL 이탈 — entry 모드만 무효 처리. display는 SL이탈도 보존(아래서 slBroken/slHunted로 분류).
          if (!isDisplay && (isBullish ? candleExtremePrice <= expected_sl : candleExtremePrice >= expected_sl)) {
            isAlreadyCompletedOrBroken = true;
          }
          // 3) C 돌파는 "D 터치 전"에만 무효 (터치 후 C 돌파는 TP로 가는 정상 움직임)
          if (isCBrokenByCandle && !isPrzTouched) {
            isAlreadyCompletedOrBroken = true;
          }
        }
        
        // 터치되었다면, 가장 깊은 꼬리의 시간을 D점의 X좌표로 사용
        if (isPrzTouched && extremeTime) {
          przTouchedTime = extremeTime;
        }

        // 탐색(Emerging) 노이즈 필터링: C점 이후 한 번이라도 기준선을 넘었는지 검사
        if (!isAlreadyCompletedOrBroken) {
          let passedThreshold = false;
          if (cand.name === '5-0') {
            const cb_diff = isLogScale ? Math.log(B.price) - Math.log(C.price) : B.price - C.price;
            const threshold = isLogScale
              ? Math.exp(Math.log(C.price) + 0.382 * cb_diff)
              : C.price + 0.382 * cb_diff;
            passedThreshold = isBullish ? extremePrice <= threshold : extremePrice >= threshold;
          } else if (cand.name === 'Crab' || cand.name === 'Deep Crab') {
            // Crab 패턴의 경우 돌파 기준(Threshold)을 X점(1.0)이 아닌 1.13 확장 레벨로 늦춤
            const threshold_113 = calcTarget(A.price, XA_signed, -1.13);
            passedThreshold = isBullish ? extremePrice <= threshold_113 : extremePrice >= threshold_113;
          } else {
            const isExternal = isBullish ? (expected_D < X.price) : (expected_D > X.price);
            passedThreshold = isExternal
              ? (isBullish ? extremePrice <= X.price : extremePrice >= X.price)
              : (isBullish ? extremePrice <= B.price : extremePrice >= B.price);
          }
          if (!passedThreshold) isAlreadyCompletedOrBroken = true;
        }

        if (!isAlreadyCompletedOrBroken) {
          const projectedCD = calcAbsDiff(expected_D, C.price);
          const abcdRatio = projectedCD / AB;
          const abcdTier = getAbcdTier(abcdRatio);
          const bcProjectionRatio = projectedCD / BC;
          const bcProjectionRange = getBcProjectionRange(cand.name);
          const bcProjectionMatch = bcProjectionRange
            ? bcProjectionRatio >= bcProjectionRange.min && bcProjectionRatio < bcProjectionRange.max
            : undefined;

          // 가틀리·딥가틀리는 BC 투영·AB=CD 보정을 모두 충족해야 유효(필수). 둘 중 하나라도 미달이면 제외.
          // (터치 면제 없음 — 보정 미달 가틀리류는 차트·매매 모두에서 그리지/잡지 않음)
          const isInvalidGartley = (cand.name === 'Gartley' || cand.name === 'Deep Gartley')
            && (bcProjectionMatch !== true || abcdTier === null);

          // ── display 생애주기: 탐색(미터치)/신호(터치,진행중)/완성(터치 후 SL·TP·시간만료 종료) ──
          let lifecycle: 'scanning' | 'signal' | 'active' | 'completed' | 'cancelled' | undefined;
          let endReason: 'sl' | 'tp' | 'timeout' | undefined;
          let slHunted: boolean | undefined;
          let slBroken: boolean | undefined;
          // 완성 패턴 D 렌더 좌표: 전역 극점이 아니라 expected_D '첫 터치' 캔들로 고정.
          // (SL 이탈은 D를 뚫고 더 깊이 가므로 극점을 쓰면 D가 멀리 끌려가 폭주)
          // 가격은 그 첫 터치 캔들의 실제 꼬리(low/high)에 스냅 — detect처럼 가격에 딱 붙게.
          let firstTouchTime: number | string | null = null;
          let firstTouchPrice: number | null = null;
          // D 첫 터치가 C로부터 XABC 전체폭보다 더 늦게 오면(우연 터치) display에서 제외.
          // 폴리곤이 길게 찌그러지고 D 박스만 멀리 떠버리는 것 방지. (display 전용 — 매매 무관)
          let lateTouch = false;
          let tp1Out: number | undefined; // 완성 렌더용 TP1/TP2 (detect 공식, expected_D 기준)
          let tp2Out: number | undefined;
          let entryOut: number | undefined; // 0.5 진입가 (D→SL 0.5 보간)
          let cancelled = false;             // 0.5 체결 전 TP1 선도달 = 폐기
          let fillIdx = -1;                  // 0.5 진입라인 체결 캔들 인덱스
          let entryTimeOut: number | string | undefined; // 0.5 체결 시간
          let exitPriceOut: number | undefined;          // 종료/폐기 가격
          let exitTimeOut: number | string | undefined;  // 종료/폐기 시간
          if (isDisplay) {
            if (!isPrzTouched) {
              lifecycle = 'scanning';
            } else {
              // TP1 가격 (harmonicTargets와 동일 공식: D에서 A(또는 C) 방향 되돌림)
              const tgt = (base: number, from: number, ratio: number) =>
                isLogScale ? Math.exp(Math.log(base) + (Math.log(from) - Math.log(expected_D)) * ratio) : base + (from - expected_D) * ratio;
              const tp1 = cand.name === 'Cypher' ? tgt(expected_D, C.price, 0.382)
                : cand.name === 'Shark' ? tgt(expected_D, C.price, 0.5)
                : cand.name === '5-0' ? C.price
                : tgt(expected_D, A.price, 0.382);
              // TP2 (detect 공식과 동일 — 같은 방향 더 먼 비율)
              const tp2 = cand.name === 'Cypher' ? tgt(expected_D, C.price, 0.618)
                : cand.name === 'Shark' ? tgt(expected_D, C.price, 0.886)
                : cand.name === '5-0' ? tgt(expected_D, C.price, 1.272)
                : tgt(expected_D, A.price, 0.618);
              tp1Out = tp1; tp2Out = tp2;
              entryOut = harmonicEntryPrice(expected_D, expected_sl, 0.5, isLogScale); // 0.5 진입가
              // 터치 캔들 인덱스 찾기 → 그 이후 시간순으로 먼저 닿은 종료 사유 판정
              let touchIdx = -1;
              if (candles && typeof C.i === 'number') {
                for (let k = C.i + 1; k < candles.length; k++) {
                  const cnd = candles[k];
                  if (isBullish ? cnd.low <= expected_D : cnd.high >= expected_D) { touchIdx = k; break; }
                }
              }
              // 우연 터치 컷: 첫 터치 gap(C→D)이 XABC 전체폭(X→C)보다 크면 제외.
              if (touchIdx >= 0 && typeof C.i === 'number' && typeof X.i === 'number'
                && (touchIdx - C.i) > (C.i - X.i)) {
                lateTouch = true;
              }
              if (touchIdx >= 0 && candles && candles[touchIdx]) {
                // D 스냅: 첫 터치 봉~5캔들 윈도우의 패턴방향 극점(bullish=최저low / bearish=최고high).
                // 종가 SL 이탈 봉을 만나면 그 직전까지만(이탈 후 폭락은 D가 아님). 꼬리가 PRZ/SL 밖이어도
                // 종가이탈만 아니면(=SL 헌팅) 그 바깥 극점에 스냅.
                const windowEnd = Math.min(touchIdx + 5, candles.length - 1);
                let extP = isBullish ? candles[touchIdx].low : candles[touchIdx].high;
                let extT: number | string = candles[touchIdx].time;
                for (let k = touchIdx; k <= windowEnd; k++) {
                  const cnd = candles[k];
                  const close = cnd.close ?? (isBullish ? cnd.low : cnd.high);
                  if (k > touchIdx && (isBullish ? close < expected_sl : close > expected_sl)) break; // SL 종가이탈 → 직전까지만
                  if (isBullish ? cnd.low < extP : cnd.high > extP) { extP = isBullish ? cnd.low : cnd.high; extT = cnd.time; }
                }
                firstTouchTime = extT;
                firstTouchPrice = extP;
              }
              // ── 생애주기 리플레이: 터치 → 0.5 체결 → SL/TP/시간만료 ──
              // 0.5 미체결 상태에서 TP1 먼저 닿으면 '폐기'(거래 미발생). 체결 후 SL/TP/시간만료면 '완성'.
              // 완성 SL/TP/시간만료는 '체결(0.5) 기준'으로 측정 — 모니터링 거래 의미와 일치.
              // PRZ 밴드 안에 H/L/C가 한 점이라도 들어왔는지 — 밴드를 한 봉에 통째 관통(전부 밴드 밖)만
              // 한 경우는 실제 PRZ 반응이 아니므로 완성 아님(폐기).
              const przLo = Math.min(expected_D, expected_sl);
              const przHi = Math.max(expected_D, expected_sl);
              const inBand = (v: number) => v >= przLo && v <= przHi;
              const entryLine = entryOut as number;
              let przInteracted = false;
              if (touchIdx >= 0 && candles) {
                // Phase 1: 0.5 진입라인 체결 vs TP1 선도달(폐기)
                for (let k = touchIdx; k < candles.length; k++) {
                  const cnd = candles[k];
                  const close = cnd.close ?? (isBullish ? cnd.low : cnd.high);
                  if (inBand(cnd.high) || inBand(cnd.low) || inBand(close)) przInteracted = true;
                  const fillHit = isBullish ? cnd.low <= entryLine : cnd.high >= entryLine;
                  const tp1First = isBullish ? cnd.high >= tp1 : cnd.low <= tp1;
                  if (fillHit) { fillIdx = k; entryTimeOut = cnd.time; break; }       // 0.5 체결
                  // 폐기(0.5 전 TP1 선도달)는 터치 '다음' 봉부터만 — 터치 봉의 반대쪽 꼬리는
                  // PRZ 터치와 동시 발생이라 순서 불명. 거대 캔들 오분류 방지(M-H7 TP 보호와 동일 규약).
                  if (k > touchIdx && tp1First) { cancelled = true; exitPriceOut = tp1; exitTimeOut = cnd.time; break; }
                }
                // Phase 2: 체결 이후 SL이탈/헌팅/TP/시간만료
                if (fillIdx >= 0) {
                  for (let k = fillIdx; k < candles.length; k++) {
                    const cnd = candles[k];
                    const close = cnd.close ?? (isBullish ? cnd.low : cnd.high);
                    if (isBullish ? close < expected_sl : close > expected_sl) { slBroken = true; endReason = 'sl'; exitPriceOut = expected_sl; exitTimeOut = cnd.time; break; }  // 종가이탈 → SL 이탈
                    if (isBullish ? cnd.low < expected_sl : cnd.high > expected_sl) { slHunted = true; endReason = 'sl'; exitPriceOut = expected_sl; exitTimeOut = cnd.time; break; } // 꼬리이탈=헌팅
                    // TP는 체결 '다음' 캔들부터만 — 체결 캔들의 저/고점은 체결 전에 발생했을 수 있어(거대 캔들 오분류 방지).
                    // 매매 엔진과 동일 규약(진입 캔들엔 SL만, TP는 다음 봉부터). (M-H7)
                    if (k > fillIdx && (isBullish ? cnd.high >= tp1 : cnd.low <= tp1)) { endReason = 'tp'; exitPriceOut = tp1; exitTimeOut = cnd.time; break; } // TP 도달
                    if (k - fillIdx >= DISPLAY_MAX_HOLD) { endReason = 'timeout'; exitPriceOut = close; exitTimeOut = cnd.time; break; }                                  // 시간만료
                  }
                }
              }
              lifecycle = cancelled ? 'cancelled' : fillIdx >= 0 ? (endReason ? 'completed' : 'active') : 'signal';
              // 완성인데 PRZ 밴드 안 OHLC가 전혀 없으면(통째 관통) 폐기성 — 렌더 안 함.
              if (lifecycle === 'completed' && !przInteracted) lateTouch = true;
            }
          }

          // display: 미터치(탐색)는 최근 윈도우(last-8)만 — 과거 전체 미터치가 현재가로 쏟아지는 폭주 방지.
          // 터치(신호/완성)는 과거까지 보존(자기위치 렌더).
          const skipStaleScanning = isDisplay && lifecycle === 'scanning' && i < pivots.length - 8;

          // 캔들폭 밴드: X→C 폭이 [DISPLAY_MIN_SPAN, DISPLAY_MAX_SPAN] 밖이면 표시 제외 (display 전용).
          const xcSpan = (typeof C.i === 'number' && typeof X.i === 'number') ? C.i - X.i : null;
          const outOfSpanBand = isDisplay && xcSpan != null && (xcSpan < DISPLAY_MIN_SPAN || xcSpan > DISPLAY_MAX_SPAN);

          if (!isInvalidGartley && !skipStaleScanning && !lateTouch && !outOfSpanBand) {
            results.push({
              name: `${isBullish ? 'Bullish' : 'Bearish'} ${cand.name} (Emerging)`,
              isBullish, points: { X, A, B, C }, przPrice: expected_D,
              przMin: Math.min(expected_D, expected_sl),
              przMax: Math.max(expected_D, expected_sl),
              slPrice: expected_sl,
              bcAbRatio: bc_ab,
              bcAbTier: getBcAbTier(bc_ab),
              bcProjectionRatio,
              bcProjectionRange: bcProjectionRange?.label,
              bcProjectionMatch,
              abcdRatio,
              abcdTier: abcdTier ?? undefined,
              abcdMatch: abcdTier !== null,
              abXaRatio: ab_xa,
              xcXaRatio: xc_xa,
              isPrzTouched,
              // 터치된 생애주기(신호/체결/완성/폐기): D를 첫 터치 캔들 시간·그 봉 꼬리 가격에 스냅
              // (전역 극점 쓰면 PRZ 터치 후 더 흘러내린 곳으로 D가 끌려감). 탐색 등 그 외: 극점 유지.
              przTouchedTime: ((lifecycle && lifecycle !== 'scanning') && firstTouchTime != null ? firstTouchTime : przTouchedTime) || undefined,
              przTouchedPrice: (lifecycle && lifecycle !== 'scanning') && firstTouchPrice != null ? firstTouchPrice : (isPrzTouched ? extremePrice : undefined),
              lifecycle,
              endReason,
              slHunted,
              slBroken,
              tp1: tp1Out,
              tp2: tp2Out,
              entryPrice: entryOut,
              filled: fillIdx >= 0,
              entryTime: entryTimeOut,
              exitPrice: exitPriceOut,
              exitTime: exitTimeOut,
              error: 0
            });
          }
        }
      }
    }
  }
  } // end of for loop over pivots

  // 터치된(신호) 패턴은 항상 보존하고, 미터치(탐색)는 현재가에서 가까운 PRZ 순 상위 10개만.
  // (터치 후 TP로 진행해 PRZ가 멀어진 패턴이 근접순 컷에 잘려 사라지지 않도록)
  const touchedResults = results.filter(r => r.isPrzTouched);
  const untouchedResults = results
    .filter(r => !r.isPrzTouched)
    .sort((a, b) => Math.abs(currentPrice - a.przPrice) - Math.abs(currentPrice - b.przPrice));
  return [...touchedResults, ...untouchedResults.slice(0, 10)];
}

/**
 * 하모닉 진입가 — D점(przPrice)에서 SL 방향으로 entryDepth(0~1)만큼 보간.
 * 백테스트·워커가 같은 체결 규칙을 쓰기 위한 단일 정의.
 */
export function harmonicEntryPrice(przPrice: number, slPrice: number, entryDepth: number, isLogScale = false): number {
  const depth = Math.min(1, Math.max(0, entryDepth));
  if (depth === 0) return przPrice;
  return isLogScale
    ? Math.exp(Math.log(przPrice) + depth * (Math.log(slPrice) - Math.log(przPrice)))
    : przPrice + depth * (slPrice - przPrice);
}
