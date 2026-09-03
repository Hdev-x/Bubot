/**
 * SMC (OB / FVG / CE / EQ) 감지 — 공유 엔진 (단일 소스)
 *
 * frontend/src/utils/chartIndicators.ts 원본을 이동 + 스케일 옵션화한 것.
 * 기준 스케일은 로그(기하)이며 logScale=false 시 선형(산술) 계산 — 차트의
 * 로그/선형 토글과 동일하게 동작하기 위함. 백테스트·실전 워커는 로그 고정.
 *
 * ⚠️ 차트(frontend)·백테스트·실전 워커(trader)가 전부 이 파일 하나를 쓴다.
 *    여기를 수정하면 세 곳의 신호가 동시에 바뀐다.
 */

export type SmcCandle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FVG = {
  type: 'bull' | 'bear';
  startTime: number;   // 갭 시작 캔들(첫 캔들) — 박스 표시 기준
  confirmTime: number; // 갭 확정 캔들(셋째 캔들) — 매매 가용 시점 기준 (lookahead 방지)
  high: number;
  low: number;
  ce: number;
  filled: boolean;
  // 밴드(상한~하한)를 종가가 반대편 바깥으로 횡단한 각 시점 — 소진 판정 (DECISIONS 2026-07-15).
  // 길이가 횡단 횟수. 컷(몇 회째에 소진으로 볼지)은 표시 계층이 정한다.
  bandPassTimes: number[];
  bandFaded: boolean; // 평생 밴드 무터치 + 나이 10봉↑ → 한 번도 안 쓰인 존 (DECISIONS 2026-07-15)
  eqPasses: number;  // EQ 박스(0.382~0.618)를 종가가 완전 관통(횡단)한 횟수
  ceCrosses: number; // CE 선을 종가가 좌우로 넘나든 횟수
  eqFaded: boolean;  // 평생 EQ 박스 무터치 + 나이 10봉↑ (측정값 — 숨김 판정은 bandFaded가 한다)
  ceFaded: boolean;  // 평생 CE 선 무터치 + 나이 10봉↑ (측정값)
};

export type OB = {
  type: 'bull' | 'bear';
  time: number;        // 원천 캔들
  confirmTime: number; // 돌파(확정) 캔들 — 매매 가용 시점 기준
  high: number;
  low: number;
  mid: number;
  traceCount: number;
  bandPassTimes: number[]; // FVG와 동일 — 밴드 횡단 시점 목록 (DECISIONS 2026-07-15)
  bandFaded: boolean;      // FVG와 동일 — 평생 밴드 무터치 + 나이 10봉↑
  eqPasses: number;
  obCrosses: number;
  eqFaded: boolean;        // 측정값 — 숨김 판정은 bandFaded가 한다
  obFaded: boolean;
};

// 중간값: 로그(기하평균) / 선형(산술평균)
export const midPrice = (a: number, b: number, logScale = true) =>
  logScale ? Math.sqrt(a * b) : (a + b) / 2;

// 피보나치 레벨: low~high 구간의 비율 r 자리 가격
export const fibLevel = (low: number, high: number, r: number, logScale = true) =>
  logScale ? low * Math.pow(high / low, r) : low + (high - low) * r;

// EQ 박스: 0.382~0.618 평형 구간
export const eqBox = (low: number, high: number, logScale = true) => ({
  low: fibLevel(low, high, 0.382, logScale),
  high: fibLevel(low, high, 0.618, logScale),
});

// 방향 캔들 판정 — 도지(시가=종가)는 양봉도 음봉도 아니다
export const isBearCandle = (c: SmcCandle) => c.close < c.open;
export const isBullCandle = (c: SmcCandle) => c.close > c.open;

// 생성 후 이 캔들 수를 넘기도록 무터치면 숨김(흐림) 처리
export const UNTOUCHED_HIDE_BARS = 10;

/**
 * 존 소진 컷 — 밴드(FVG 상한~하한 / OB 원천 캔들 고가~저가)를 종가가 이 횟수만큼
 * 반대편으로 횡단하면 "할일을 다한" 존으로 본다. FVG·OB 공용. (DECISIONS 2026-07-15)
 *
 * ⚠️ 차트(ChartOverlay)와 낭독(smc_reading.ts)이 **반드시 이 값 하나를** 써야 한다.
 *    각자 상수를 두면 한쪽만 바뀌었을 때 차트와 낭독이 다른 선을 보게 된다.
 *    (2026-07-15에 실제로 그렇게 시작했다가 이리로 올림.)
 *
 * 엔진은 횡단 **시점 목록**(bandPassTimes)만 기록하고 컷 적용은 소비자가 한다 —
 * 소진 여부뿐 아니라 "언제 죽었나"가 필요해서(선을 그 캔들에서 끊는다).
 */
export const ZONE_SPENT_PASSES = 3;

/** 존이 소진된 시각 = 컷을 채운 그 캔들. 아직 살아있으면 null. */
export const spentAt = (bandPassTimes: number[]): number | null =>
  bandPassTimes.length >= ZONE_SPENT_PASSES ? bandPassTimes[ZONE_SPENT_PASSES - 1] : null;

function toSec(t: string | number): number {
  if (typeof t === 'number') return t;
  const s = t.includes(' ') ? t.replace(' ', 'T') : t;
  return Math.floor(new Date(s).getTime() / 1000);
}

export type SmcOptions = { logScale?: boolean };

export function detectFVGs(candles: SmcCandle[], opts: SmcOptions = {}): FVG[] {
  const logScale = opts.logScale !== false;
  const result: FVG[] = [];

  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];

    if (a.high < c.low) {
      result.push({ type: 'bull', startTime: toSec(a.time), confirmTime: toSec(c.time), high: c.low, low: a.high, ce: midPrice(c.low, a.high, logScale), filled: false, bandPassTimes: [], bandFaded: false, eqPasses: 0, ceCrosses: 0, eqFaded: false, ceFaded: false });
    }
    if (a.low > c.high) {
      result.push({ type: 'bear', startTime: toSec(a.time), confirmTime: toSec(c.time), high: a.low, low: c.high, ce: midPrice(a.low, c.high, logScale), filled: false, bandPassTimes: [], bandFaded: false, eqPasses: 0, ceCrosses: 0, eqFaded: false, ceFaded: false });
    }
  }

  for (const fvg of result) {
    const eq = eqBox(fvg.low, fvg.high, logScale);
    const si = candles.findIndex(c => toSec(c.time) === fvg.startTime);
    let filledSet = false;
    // 초기 진영 = 생성 캔들(si+2) 종가 위치. 시딩하지 않으면 생성 직후의 첫 횡단이 누락된다
    // (bear FVG는 갭다운이라 밴드 아래에서 출발 → 되돌림이 상한 위로 나가도 카운트 안 됨).
    const fc = candles[si + 2];
    let eqSide: 'above' | 'below' | null =
      fc.close > eq.high ? 'above' : fc.close < eq.low ? 'below' : null;
    let ceSide: 'above' | 'below' | null = fc.close >= fvg.ce ? 'above' : 'below';
    let bandSide: 'above' | 'below' | null =
      fc.close > fvg.high ? 'above' : fc.close < fvg.low ? 'below' : null;
    let bandTouched = false;
    let eqTouched = false;
    let ceTouched = false;
    for (let j = si + 3; j < candles.length; j++) {
      const c = candles[j];
      if (!filledSet) {
        const filled = fvg.type === 'bull' ? c.close < fvg.low : c.close > fvg.high;
        if (filled) { fvg.filled = true; filledSet = true; }
      }
      // 밴드(상한~하한) 종가 횡단 — 소진 판정용. 직전 이탈 방향의 반대쪽 바깥으로 나가
      // 마감해야 1회. 밴드 안 마감(null)은 진영 미변경, 같은 쪽 재이탈도 카운트 없음.
      const bs = c.close > fvg.high ? 'above' : c.close < fvg.low ? 'below' : null;
      if (bs) {
        if (bandSide && bs !== bandSide) fvg.bandPassTimes.push(toSec(c.time));
        bandSide = bs;
      }
      // EQ 박스 종가 관통(crossing): 한쪽→반대쪽으로 건너가면 1회 (중간 캔들 수 무관)
      const side = c.close > eq.high ? 'above' : c.close < eq.low ? 'below' : null;
      if (side) {
        if (eqSide && side !== eqSide) fvg.eqPasses++;
        eqSide = side;
      }
      // CE 선 종가 횡단: 종가가 선을 좌우로 넘나든 횟수
      const cs: 'above' | 'below' = c.close >= fvg.ce ? 'above' : 'below';
      if (ceSide && cs !== ceSide) fvg.ceCrosses++;
      ceSide = cs;
      // 터치 여부 (꼬리 포함): 캔들 범위가 닿으면 터치
      if (c.high >= fvg.low && c.low <= fvg.high) bandTouched = true;
      if (c.high >= eq.low && c.low <= eq.high) eqTouched = true;
      if (c.low <= fvg.ce && c.high >= fvg.ce) ceTouched = true;
    }
    // 평생 무터치 + 나이 하한 → 한 번도 안 쓰인 존. 10봉은 신생 존 유예(마감 기한이 아니다).
    const fvgBars = candles.length - (si + 3);
    fvg.bandFaded = !bandTouched && fvgBars >= UNTOUCHED_HIDE_BARS;
    fvg.eqFaded = !eqTouched && fvgBars >= UNTOUCHED_HIDE_BARS;
    fvg.ceFaded = !ceTouched && fvgBars >= UNTOUCHED_HIDE_BARS;
  }

  return result;
}

export type OBTouchType = 'wick' | 'close';

export type OBOptions = {
  touchType: OBTouchType;
  logScale?: boolean;
};

export const DEFAULT_OB_OPTIONS: OBOptions = {
  touchType: 'wick',
};

export function detectOBs(candles: SmcCandle[], options: OBOptions = DEFAULT_OB_OPTIONS): OB[] {
  const logScale = options.logScale !== false;
  const result: OB[] = [];
  const added = new Set<number>();

  // OB = 원천 캔들의 꼬리까지 잡아먹힌 것. 확정 캔들의 **종가**가 원천의 고가/저가를 넘어야 하며,
  // 확정은 원천의 **바로 다음** 캔들이 한다. 앞뒤 캔들의 방향 문맥은 보지 않는다.
  // (DECISIONS 2026-07-15 — H 정의. 구 버전은 "양/음 3연속" 문맥을 추가로 요구했으나 근거가 없었고,
  //  실측상 품질과 무관했다: 그 조건이 3달러 적중과 240달러짜리를 함께 남기고 5달러 적중을 버렸다.)
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];  // OB 원천 캔들
    const curr = candles[i];      // 확정 캔들 (원천 바로 다음)
    const pt = toSec(prev.time);
    if (added.has(pt)) continue;

    // Bear OB — 원천 양봉의 저가(꼬리)를 다음 종가가 밑돌면 확정
    if (isBullCandle(prev) && curr.close < prev.low) {
      added.add(pt);
      result.push({ type: 'bear', time: pt, confirmTime: toSec(curr.time), high: prev.high, low: prev.low, mid: midPrice(prev.high, prev.low, logScale), traceCount: 0, bandPassTimes: [], bandFaded: false, eqPasses: 0, obCrosses: 0, eqFaded: false, obFaded: false });
    }
    // Bull OB — 원천 음봉의 고가(꼬리)를 다음 종가가 넘으면 확정
    else if (isBearCandle(prev) && curr.close > prev.high) {
      added.add(pt);
      result.push({ type: 'bull', time: pt, confirmTime: toSec(curr.time), high: prev.high, low: prev.low, mid: midPrice(prev.high, prev.low, logScale), traceCount: 0, bandPassTimes: [], bandFaded: false, eqPasses: 0, obCrosses: 0, eqFaded: false, obFaded: false });
    }
  }

  for (const ob of result) {
    const eq = eqBox(ob.low, ob.high, logScale);
    const si = candles.findIndex(c => toSec(c.time) === ob.time);
    // 초기 진영 = 확정(돌파) 캔들(si+1) 종가 위치. bear OB는 close < ob.low, bull OB는
    // close > ob.high 가 확정 조건이므로 생성 시점 진영이 항상 밴드 바깥에 있다.
    const oc = candles[si + 1];
    let eqSide: 'above' | 'below' | null =
      oc.close > eq.high ? 'above' : oc.close < eq.low ? 'below' : null;
    let obSide: 'above' | 'below' | null = oc.close >= ob.mid ? 'above' : 'below';
    let bandSide: 'above' | 'below' | null =
      oc.close > ob.high ? 'above' : oc.close < ob.low ? 'below' : null;
    let bandTouched = false;
    let eqTouched = false;
    let obTouched = false;
    for (let j = si + 2; j < candles.length; j++) {
      const c = candles[j];
      // 밴드(상한~하한) 종가 횡단 — 소진 판정용 (FVG와 동일 규칙)
      const bs = c.close > ob.high ? 'above' : c.close < ob.low ? 'below' : null;
      if (bs) {
        if (bandSide && bs !== bandSide) ob.bandPassTimes.push(toSec(c.time));
        bandSide = bs;
      }
      // EQ 박스 종가 관통(crossing): 한쪽→반대쪽으로 건너가면 1회 (중간 캔들 수 무관)
      const side = c.close > eq.high ? 'above' : c.close < eq.low ? 'below' : null;
      if (side) {
        if (eqSide && side !== eqSide) ob.eqPasses++;
        eqSide = side;
      }
      // OB mid 선 종가 횡단: 종가가 선을 좌우로 넘나든 횟수
      const os: 'above' | 'below' = c.close >= ob.mid ? 'above' : 'below';
      if (obSide && os !== obSide) ob.obCrosses++;
      obSide = os;
      // 터치 여부 (꼬리 포함)
      if (c.high >= ob.low && c.low <= ob.high) bandTouched = true;
      if (c.high >= eq.low && c.low <= eq.high) eqTouched = true;
      if (c.low <= ob.mid && c.high >= ob.mid) obTouched = true;
      if (options.touchType === 'wick') {
        if (c.low > ob.high || c.high < ob.low) continue;
        const bodyTop = Math.max(c.open, c.close);
        const bodyBot = Math.min(c.open, c.close);
        if (bodyBot < ob.low && bodyTop > ob.high) continue;
      } else {
        if (c.close < ob.low || c.close > ob.high) continue;
      }
      ob.traceCount++;
    }
    // 평생 무터치 + 나이 하한 → 한 번도 안 쓰인 존. 10봉은 신생 존 유예(마감 기한이 아니다).
    const obBars = candles.length - (si + 2);
    ob.bandFaded = !bandTouched && obBars >= UNTOUCHED_HIDE_BARS;
    ob.eqFaded = !eqTouched && obBars >= UNTOUCHED_HIDE_BARS;
    ob.obFaded = !obTouched && obBars >= UNTOUCHED_HIDE_BARS;
  }

  return result;
}

// ── 캔들 반응 분류 (OB/FVG 존에 대한 캔들 위치) — 백테스트·워커 공용 ──────
export type TouchType =
  | 'no_touch' | 'wick_high' | 'wick_mid' | 'wick_low'
  | 'close_above_mid' | 'close_below_mid' | 'breakout';

export type Zone = { type: 'bull' | 'bear'; high: number; low: number; mid: number };

export function classifyCandle(ob: Zone, c: SmcCandle): TouchType {
  if (ob.type === 'bull') {
    if (c.low > ob.high) return 'no_touch';
    if (c.close > ob.high) {
      if (c.low <= ob.low) return 'wick_low';
      if (c.low <= ob.mid) return 'wick_mid';
      return 'wick_high';
    }
    if (c.close >= ob.low) return c.close >= ob.mid ? 'close_above_mid' : 'close_below_mid';
    return 'breakout';
  } else {
    if (c.high < ob.low) return 'no_touch';
    if (c.close < ob.low) {
      if (c.high >= ob.high) return 'wick_low';
      if (c.high >= ob.mid) return 'wick_mid';
      return 'wick_high';
    }
    if (c.close <= ob.high) return c.close <= ob.mid ? 'close_below_mid' : 'close_above_mid';
    return 'breakout';
  }
}
