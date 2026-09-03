import type { Candle } from '@web/shared/types/market';
import { predictHarmonicPatterns, harmonicEntryPrice } from '@web/chart/analysis/harmonicPattern';
import type { EmergingHarmonicResult } from '@web/chart/analysis/harmonicPattern';
import { detectOBs as detectOBsShared, detectFVGs as detectFVGsShared, classifyCandle as classifyCandleShared, eqBox as eqBoxShared } from '../../../../../shared/smc';

export const HARMONIC_PRICE_LOSS_CAP_PCT = 10.0; // SL 캡 기본값 (harmonicSlCapPct 미지정 시 폴백)

export type StrategyParams = {
  tpPercent: number;       // TP % (ob.mid 기준)
  slPercent: number;       // SL1 경성손절 %
  useZoneRiskReward?: boolean; // SL=존 반대편 끝, TP=진입가 기준 targetR
  zoneStopAtMid?: boolean; // useZoneRiskReward일 때 SL을 존 반대편 끝 대신 CE(mid)로 (타이트 손절)
  zoneStopToMidFrac?: number; // SL = 진입가 + frac*(mid-진입가). 0.5=진입↔CE 중간, 1=CE. (zoneStopAtMid보다 우선)
  targetR?: number;        // useZoneRiskReward일 때 목표 R 배수
  maxZoneAgeDays?: number; // 존 확정 이후 첫 진입까지 허용 일수
  useConfirmTimeEntry?: boolean; // origin+2 대기 대신 shared confirmTime부터 관측
  maxZoneRiskPct?: number; // entry→zone stop 위험폭 상한
  avoidHighVolumeEntry?: boolean; // 진입봉 거래량 과열 회피
  entryVolumeLookback?: number; // 진입봉 거래량 평균 기준봉 수
  entryVolumeMaxMultiple?: number; // 평균 대비 이 배수 이상이면 회피
  acceptanceStopBars?: number; // mid/CE 손절방향 종가 acceptance N봉이면 조기 종료
  useBrokenZoneContinuation?: boolean; // 존 손절쪽 종가이탈 이후 원래 반대방향 continuation
  brokenEntrySignal?: 'breakClose' | 'rebreakClose'; // 첫 이탈 or 재진입 후 재이탈
  brokenTargetZoneWidths?: number; // TP: 존 폭 배수
  brokenStopZoneWidths?: number; // SL: 존 폭 배수
  brokenStopOnReclaimClose?: boolean; // 깨진 경계 종가 회복 시 조기 종료
  maxWaitCandles: number;  // 신호 이후 풀백 대기 최대 캔들 수 (entry TF 기준)
  maxHoldCandles: number;  // 안전 타임아웃 (entry TF 기준)
  leverage: number;
  positionPct: number;
  capitalMode?: 'fixed' | 'compound'; // fixed=매 거래 초기자산 기준, compound=현재 잔고 기준
  fixedEntryMargin?: number; // 고정시드 모드일 때 1회 진입 금액 (이 값이 있으면 positionPct 무시)
  maxOBTouches: number;    // OB 최대 터치 횟수 초과 시 무효화 (미사용 - 원본에 없음)
  filterMixed4h: boolean;  // 진입 TF MA 혼합 구간 진입 제외
  sl2Tf: 'entryTf' | 'obTf'; // SL2 종가이탈 기준 TF
  closeDepth: number;      // 신호 종가 위치 필터 (0~1, 1=전체허용, 0.5=mid에서 절반까지)
  volumeFilter: boolean;         // OB 캔들 거래량 필터 (OB TF 기준)
  volumeTrigger: boolean;        // 진입 TF 거래량 급등 캔들 → 다음 캔들 mid 진입 모드
  volumeTriggerBullish: boolean; // 거래량 급등 캔들이 양봉(bull) / 음봉(bear) 이어야 함
  volumeTriggerWick: boolean;    // 거래량 급등 캔들 wick이 ob.mid에 닿아야 함 (low<=mid for bull)
  volumeMultiplier: number;      // 평균 거래량 대비 배수 (e.g. 1.5 = 150%)
  volumeLookback: number;        // 평균 기준 직전 캔들 수 (e.g. 20)
  switching: boolean;            // OB 첫 터치 실패 시 반대 방향 진입 (bull OB → short)
  switchAfterSL: boolean;        // SL2 이탈 후 반대 방향 재진입 (원래 진입 없이 스위칭만)
  combinedSwitch: boolean;       // 원래 진입 실행 후 SL2 발동 시 반대 방향 추가 진입 (1번 + 8번)
  swTpPercent: number;           // 스위칭 숏 TP%
  swSlPercent: number;           // 스위칭 숏 SL1%
  swMaxWaitCandles: number;      // 스위칭 숏 트리거/진입 대기 캔들 수
  useSl3?: boolean;              // SL3 진입 TF OB 완전 이탈마감 시 손절 여부
  useDataFilter?: boolean;       // 1D 데이터 부족 필터
  filterReverseBull1d?: boolean; // 1D 역배열 BULL 진입 금지 필터
  filterPriceAboveMa20Bear1d?: boolean; // 1D MA20 위 BEAR 진입 금지 필터
  useBbStrategy?: boolean;       // OB 돌파 시 BB 역매매
  useFvgStrategy?: boolean;      // FVG 전략 사용
  fvgEntryAtBorder?: boolean;    // FVG 경계선 터치 즉시 진입
  fvgEntryAtLow?: boolean;       // FVG 딥(deep) 경계 터치 즉시 진입 (bull=low, bear=high)
  sl2Threshold?: 'mid' | 'border'; // SL2 판단 기준선 (mid 종가 이탈 vs border 종가 이탈)
  fvgSignalDeep?: boolean;       // 신호 조건을 딥(deep) 영역 종가로 설정 (bull: close_below_mid)
  fvgEntryAtLowAfterSignal?: boolean; // 신호 이후 딥 경계(bull=low) 풀백 시 진입
  entryOnFirstTouch?: boolean;   // OB 생성 이후 첫 터치 즉시 진입 (종가마감 대기 X)
  obEntryLevel?: 'mid' | 'eqNear' | 'eqFar'; // OB 첫터치 진입 레벨
  slAtDeepBorder?: boolean;      // 딥 경계(OB low/high) 터치 시 즉시 칼손절 (퍼센트 무시)
  filterMa5Ma20?: boolean;       // 롱(MA5 > MA20), 숏(MA5 < MA20) 타임프레임 2개 모두 만족 시 진입
  filterMa240InBox?: boolean;    // 진입 TF 기준 240일선이 OB 박스 내부(low~high)에 위치할 때만 진입
  filterRsi?: boolean;           // 롱 진입 시 RSI <= 35, 숏 진입 시 RSI >= 65 조건 만족 시 진입
  useEqStrategy?: boolean;       // EQ 전략: OB 존의 EQ 박스(0.382~0.618) 첫 꼬리터치 → 다음 캔들 mid 진입
  filterEntryMa20?: boolean;     // 진입 TF(4H) 기준 MA20 역추세 진입 금지 (롱: price>=MA20, 숏: price<=MA20)

  // ── 하모닉 예측 전략 (예측 PRZ + 상위TF EQ 컨플루언스) ──
  // 설계 명세: docs/plans/하모닉-예측-진입트리거-설계.txt
  useHarmonicStrategy?: boolean; // 하모닉 예측 PRZ ∩ 상위TF EQ 컨플루언스 전략 사용
  harmonicUseEqFilter?: boolean; // false면 EQ 컨플루언스 없이 PRZ 단독 진입
  harmonicEntryMode?: 'immediate' | 'close'; // [D] 신호(arming) 트리거: PRZ터치 / 존안 종가. 실제 체결은 항상 D~SL 0.5 라인.
  eqAlivePasses?: number;        // 매매용 EQ 살아있음 판정 (종가 관통 N회 미만, 기본 3)
  harmonicTp1Pct?: number;       // TP1 도달 시 익절 비율 % (기본 50)
  harmonicTp2Pct?: number;       // TP2 도달 시 익절 비율 % (나머지, 기본 50)
  harmonicMoveStopToBreakeven?: boolean; // TP1 도달 후 잔여 물량 SL을 진입가로 이동
  harmonicSlCapPct?: number;     // 가격 손절 하드캡 % (기본 1.0, 패턴 SL이 더 가까우면 패턴 SL 사용)
  harmonicEnabledPatterns?: string[]; // 비어 있거나 undefined면 전체 패턴 허용
  harmonicLogScale?: boolean;    // 피보나치 투영을 로그(기하) 기준으로 계산 (기본 false=선형)
  harmonicPredictMode?: 'entry' | 'display'; // 패턴 탐지 모드. 기본 entry(거래/백테스트), display=차트·모니터링 표시 기준
  harmonicNoSlCap?: boolean;     // true면 SL폭 15% 캡 해제(분석 전용: 손절폭 넓은 패턴도 수집)
  harmonicSlCloseBasis?: boolean; // true면 SL을 "종가 이탈" 기준으로 판정(꼬리 헌팅 무시) — anatomy 분석 전용
  harmonicEntryDepth?: number;   // 진입 깊이 0~1 (0=D점 즉시, 0.5=D~SL 중간, SL 방향 보간. 기본 0)
  // ── 진입 필터 (SL anatomy 분석 결과: 유리마감+추세정렬+고변동) ──
  harmonicMinClosePosition?: number; // 신호봉 유리마감 하한(0~1). undefined면 미적용
  harmonicRequireHtfAlign?: boolean; // true면 상위TF 추세 정렬된 진입만 (htfCandles 필요)
  harmonicMinTouchAtr?: number;      // 신호봉 range/ATR 하한(변동성). undefined면 미적용

  // ── AB=CD 실시간 모니터링 전략 ──
  useAbcdStrategy?: boolean;
  abcdEntryMode?: 'immediate' | 'close';
  abcdTp1Pct?: number;
  abcdTp2Pct?: number;
  abcdEnabledRatios?: string[];
  abcdLogScale?: boolean;

  // ── 비용 모델 (가격% 공간에서 차감, 레버리지 곱하기 전) ──
  feePct?: number;          // 체결(fill)당 수수료 % (기본 0.04 = 시장가 taker)
  slippagePct?: number;     // 체결당 슬리피지 % (기본 0.02)
  fundingPctPer8h?: number; // 8시간당 펀딩비 % (기본 0.01, 보유시간 비례)
};

export const DEFAULT_FEE_PCT = 0.04;
export const DEFAULT_SLIPPAGE_PCT = 0.02;
export const DEFAULT_FUNDING_PCT_8H = 0.01;

/** 거래 1건의 총 비용(가격%). fills=체결 횟수, 펀딩은 보유시간 비례 */
function tradeCostPct(params: StrategyParams, fills: number, entrySec: number, exitSec: number): number {
  const fee = params.feePct ?? DEFAULT_FEE_PCT;
  const slip = params.slippagePct ?? DEFAULT_SLIPPAGE_PCT;
  const funding = params.fundingPctPer8h ?? DEFAULT_FUNDING_PCT_8H;
  const holdHours = Math.max(0, exitSec - entrySec) / 3600;
  return fills * (fee + slip) + funding * (holdHours / 8);
}

export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  tpPercent: 2.0,
  slPercent: 3.0,
  useZoneRiskReward: false,
  targetR: 2.0,
  useConfirmTimeEntry: false,
  entryVolumeLookback: 20,
  entryVolumeMaxMultiple: 2.0,
  acceptanceStopBars: 0,
  useBrokenZoneContinuation: false,
  brokenEntrySignal: 'breakClose',
  brokenTargetZoneWidths: 1.0,
  brokenStopZoneWidths: 1.0,
  brokenStopOnReclaimClose: true,
  maxWaitCandles: 40,
  maxHoldCandles: 100,
  leverage: 20,
  positionPct: 10,
  capitalMode: 'fixed',
  maxOBTouches: 5,
  filterMixed4h: false,
  sl2Tf: 'entryTf',
  closeDepth: 1.0,
  volumeFilter: false,
  volumeTrigger: false,
  volumeTriggerBullish: false,
  volumeTriggerWick: false,
  volumeMultiplier: 1.5,
  volumeLookback: 20,
  switching: false,
  switchAfterSL: false,
  combinedSwitch: false,
  swTpPercent: 2.0,
  swSlPercent: 3.0,
  swMaxWaitCandles: 40,
  useSl3: false,
  useDataFilter: false,
  filterReverseBull1d: false,
  filterPriceAboveMa20Bear1d: false,
  useBbStrategy: false,
  useFvgStrategy: false,
  fvgEntryAtBorder: false,
  fvgEntryAtLow: false,
  sl2Threshold: 'mid',
  fvgSignalDeep: false,
  fvgEntryAtLowAfterSignal: false,
  entryOnFirstTouch: false,
  obEntryLevel: 'mid',
  slAtDeepBorder: false,
  filterMa5Ma20: false,
  filterMa240InBox: false,
  filterRsi: false,
  useEqStrategy: false,
  filterEntryMa20: false,
  useHarmonicStrategy: false,
  harmonicUseEqFilter: true,
  harmonicEntryMode: 'close',
  eqAlivePasses: 3,
  harmonicTp1Pct: 50,
  harmonicTp2Pct: 50,
  harmonicSlCapPct: 10.0,
  harmonicMoveStopToBreakeven: false,
  harmonicEnabledPatterns: [],
  harmonicLogScale: false,
  harmonicEntryDepth: 0.5,
  useAbcdStrategy: false,
  abcdEntryMode: 'immediate',
  abcdTp1Pct: 50,
  abcdTp2Pct: 50,
  abcdEnabledRatios: [],
  abcdLogScale: true,
  feePct: DEFAULT_FEE_PCT,
  slippagePct: DEFAULT_SLIPPAGE_PCT,
  fundingPctPer8h: DEFAULT_FUNDING_PCT_8H,
};

export type OB = {
  time: number;   // seconds
  confirmTime?: number;
  high: number;
  low: number;
  mid: number;    // geometric mean: sqrt(high * low)
  type: 'bull' | 'bear';
  bbStartTime?: number; // BB인 경우 스캔 시작 시간
};

export type MASnapshot = {
  ma5: number; ma20: number; ma50: number; ma100: number; ma200: number; ma240: number;
  rsi: number;
  slopes:      { ma20: '↑'|'↓'; ma50: '↑'|'↓'; ma100: '↑'|'↓'; ma200: '↑'|'↓' };
  alignment:   '정배열' | '역배열' | '혼합';
  cross50v200: '골든크로스' | '데스크로스';
  priceAbove:  { ma20: boolean; ma50: boolean; ma100: boolean; ma200: boolean };
};

export type TradeResult = {
  maxDepthRatio?: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  capitalPnl: number;
  outcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' | 'missed';
  obType: 'bull' | 'bear';
  maEntry: { obTf: MASnapshot | null; entryTf: MASnapshot | null };
  tp1Hit?: boolean;
  tpExitLevel?: 1 | 2;
  stopLossPct?: number;
  tp1ProfitPct?: number;
  tp2ProfitPct?: number;
  stopMovedToBreakeven?: boolean;
  tp1RealizedCapitalPnl?: number;
  remainderCapitalPnl?: number;
  tp1RealizedDelta?: number;
  remainderDelta?: number;
  remainderExitLabel?: 'TP2' | 'SL' | '본절스탑' | 'TIMEOUT';
  bcAbRatio?: number;
  bcAbTier?: string;
  bcProjectionRatio?: number;
  bcProjectionRange?: string;
  bcProjectionMatch?: boolean;
  abcdRatio?: number;
  abcdTier?: string;
  abcdMatch?: boolean;
  patternName?: string;
  confluenceCount?: number;
  confluencePatterns?: string[];
  abXaRatio?: number;       // AB/XA (B점 깊이)
  xcXaRatio?: number;       // XC/XA (C점 위치)
  abCdTimeRatio?: number;   // 시간 대칭 = CD봉수/AB봉수 (이상 ~1)
  entryPrecision?: number;  // 진입 정밀도: |진입가-D|/(D~SL 폭), 0=D에 정확, 1=SL쪽 끝
  balanceBefore?: number;
  capitalDelta?: number;
  balanceAfter?: number;
};

/**
 * SL 패턴 해부(anatomy) 한 행 = 하모닉 패턴 1개의 PRZ 첫터치 이후 양상.
 * 전략 백테스트(진입→손익)가 아니라 순수 관측용. 컬럼은 3구역으로 물리 분리:
 *   meta(학습제외) / X 피처(t0=첫터치 시점 관측가능) / y 라벨(결과).
 * 리키지 방지를 위해 X에는 t0 시점에 알 수 없는 값(결과)을 절대 넣지 않는다.
 */
/** 경로(path) 한 봉 = 첫터치 전후 raw 캔들. phase로 형성/관측 구간 구분. */
export type AnatomyPathCandle = {
  t: number; o: number; h: number; l: number; c: number; v: number;
  phase: 'pre' | 'form' | 'post'; // pre=X이전 패딩 / form=X~t0 형성 / post=t0이후 결과경로
};

export type HarmonicAnatomyRow = {
  // ── meta (추적·시간분할용, 학습 제외) ──
  symbol: string;
  tf: string;            // 스크립트에서 픽스처 파일명으로 채움
  signalTime: number;    // t0 = PRZ 첫 터치봉 시각(sec)
  patternName: string;
  dir: 'bull' | 'bear';
  // ── X 피처 (t0 시점 관측가능) ──
  touchBody: number;            // 첫터치봉 몸통비율 |close-open|/(high-low)
  touchWickZoneSide: number;    // 터치 방향 꼬리 길이/range (bull=아랫꼬리, bear=윗꼬리)
  closeInsideZone: 0 | 1;       // 첫터치봉 종가가 PRZ 존 안인가
  touchRangeAtr: number | null; // 첫터치봉 range / ATR(14) — 변동성 스파이크 여부
  touchVolRel: number | null;   // 첫터치봉 거래량 / 직전20봉 평균
  penetrationDepth: number;     // PRZ 존 관통 깊이 비율 (>1=존 관통)
  abXaRatio: number | null;     // B점 깊이
  xcXaRatio: number | null;     // C점 위치
  abCdTimeRatio: number | null; // 시간대칭 CD봉수/AB봉수
  patternError: number | null;  // 패턴 피보 매칭 오차(품질, 작을수록 정밀)
  tpSlRatio: number | null;     // 보상위험비 (TP거리/SL거리, PRZ 기준)
  slDistPct: number | null;     // 진입가(PRZ)~SL 거리 %
  przWidth: number | null;      // PRZ 존 폭 % (예측 불확실성)
  closePosition: number;        // 첫터치봉 종가 위치(패턴방향 보정) 0=불리마감 1=유리마감
  takerBuyRatio: number | null; // 첫터치봉 시장가 매수 비율(매수세, 확장필드 있을 때)
  htfTrendAligned: 0 | 1 | null;// 상위TF 추세 정렬(1=정렬 0=역추세) — collect 단계에서 채움
  approachReturn: number | null;// 첫터치 직전 6봉 누적 수익률 % (급락 후 터치 vs 완만)
  precedingConsec: number;      // 첫터치 직전 연속 역행(접근방향) 봉 수
  atrTrend: number | null;      // ATR(t0)/ATR(t0-10) — 변동성 확대(>1)/축소(<1)
  hourOfDay: number;            // 첫터치 UTC 시각(0~23)
  dayOfWeek: number;            // 첫터치 UTC 요일(0=일~6=토)
  htf2Aligned: 0 | 1 | null;    // 2단계 위 TF 추세 정렬 — collect 단계에서 채움
  btcAligned: 0 | 1 | null;     // BTC 1d 추세와 패턴방향 정렬 — collect 단계에서 채움
  // ── y 라벨 (결과) ──
  outcome: 'SL' | 'TP' | 'open'; // open=데이터 끝까지 SL/TP 미도달(통계·ML 제외)
  barsToEnd: number | null;      // t0 → SL/TP 도달 봉 수 (open이면 null)
  straightToSL: 0 | 1;           // SL이면서 t0 이후 순행(반등) 한번도 없이 직행
  slMode: 'broken' | 'hunted' | null; // SL시 종가이탈/꼬리만헌팅
  mae: number;                   // 최대 역행 % (PRZ가 기준)
  mfe: number;                   // 최대 순행 %
  nextBarDir: 'fav' | 'adv' | 'flat'; // t0 다음봉이 순행/역행/도지
  // ── y 라벨: 결과경로(post) 봉 카운트 ──
  upBars: number;        // 양봉 수
  downBars: number;      // 음봉 수
  dojiBars: number;      // 도지 수
  favBars: number;       // 순행봉 수(패턴방향 수익쪽)
  advBars: number;       // 역행봉 수
  maxConsecAdv: number;  // 최대 연속 역행봉
  reversals: number;     // 순↔역 방향 전환 횟수
  // ── 경로 원천 (jsonl용, CSV 직렬화에서는 제외) ──
  przPrice: number;
  slPrice: number;
  tp1: number;
  pointsTime: { X: number; A: number; B: number; C: number }; // 패턴 5점 시각(D=t0)
  touchIdx: number;      // path 배열 내 t0(첫터치) 위치
  endIdx: number;        // path 배열 내 종료(SL/TP/끝) 위치
  path: AnatomyPathCandle[];
};

/** 경로(path)에서 패턴 X점 이전으로 더 담는 여유 패딩 봉 수(맥락용). 픽스처 앞에 안 닿는 한. */
const ANATOMY_PRE_PAD = 50;

/** 상위TF 캔들에서 t0 시점 SMA 대비 종가 추세가 패턴방향과 정렬됐는지 (1=정렬 0=역 null=판정불가). */
function htfAlignInline(htf: Candle[], t0: number, dir: 'bull' | 'bear', period = 20): 0 | 1 | null {
  let idx = -1;
  for (let i = htf.length - 1; i >= 0; i--) {
    if (toSec(htf[i].time) <= t0) { idx = i; break; }
  }
  if (idx < period) return null;
  let sma = 0;
  for (let i = idx - period + 1; i <= idx; i++) sma += htf[i].close;
  sma /= period;
  return ((htf[idx].close > sma) === (dir === 'bull')) ? 1 : 0;
}

/** 직전 period봉 평균 True Range. idx 이전 데이터가 부족하면 가능한 만큼. */
function computeATR(candles: Candle[], idx: number, period = 14): number | null {
  const start = Math.max(1, idx - period + 1);
  if (idx < 1 || start > idx) return null;
  let sum = 0, n = 0;
  for (let i = start; i <= idx; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    n++;
  }
  return n > 0 ? sum / n : null;
}

/**
 * t0(PRZ 첫터치봉) 기준으로 패턴의 첫터치 형태 + 이후 SL/TP 경로를 관측해 한 행 생성.
 * 진입 체결(0.5)·손익·비용 없이 패턴 원래 SL/tp1 라인에 무엇이 먼저 닿는지만 본다.
 */
function computeHarmonicAnatomy(
  symbol: string,
  candles: Candle[],
  t0Idx: number,
  cand: { pattern: EmergingHarmonicResult; tradeType: 'bull' | 'bear'; tp1: number; slPrice: number; zoneLow: number; zoneHigh: number },
  barSec: number,
  slCloseBasis = false,
): HarmonicAnatomyRow | null {
  const { pattern, tradeType, tp1, slPrice, zoneLow, zoneHigh } = cand;
  const isBull = tradeType === 'bull';
  const c0 = candles[t0Idx];
  const prz = pattern.przPrice;
  if (prz <= 0) return null;

  // ── X: 첫터치봉 형태 ──
  const range = c0.high - c0.low;
  const body = Math.abs(c0.close - c0.open);
  const touchBody = range > 0 ? body / range : 0;
  const wick = isBull
    ? Math.min(c0.open, c0.close) - c0.low   // 아랫꼬리
    : c0.high - Math.max(c0.open, c0.close); // 윗꼬리
  const touchWickZoneSide = range > 0 ? Math.max(0, wick) / range : 0;
  const closeInsideZone: 0 | 1 = (c0.close >= zoneLow && c0.close <= zoneHigh) ? 1 : 0;
  const atr = computeATR(candles, t0Idx, 14);
  const touchRangeAtr = atr && atr > 0 ? range / atr : null;
  const touchVolRel = volumeMultipleAt(candles, t0Idx, 20);
  const zoneSpan = zoneHigh - zoneLow;
  const penetrationDepth = zoneSpan > 0
    ? (isBull ? (zoneHigh - c0.low) : (c0.high - zoneLow)) / zoneSpan
    : 0;

  // ── meta: 시간대칭 ──
  const abBars = (toSec(pattern.points.B.time) - toSec(pattern.points.A.time)) / barSec;
  const cdBars = (toSec(c0.time) - toSec(pattern.points.C.time)) / barSec;
  const abCdTimeRatio = abBars > 0 ? cdBars / abBars : null;

  // ── y: t0 이후 경로 추적 + 봉 카운트 ──
  let outcome: 'SL' | 'TP' | 'open' = 'open';
  let barsToEnd: number | null = null;
  let slMode: 'broken' | 'hunted' | null = null;
  let mae = 0, mfe = 0;          // 전 구간 최대 역행/순행 %
  let mfeBeforeSL = 0;           // SL 직전까지의 최대 순행 (straightToSL 판정)
  let endIdx = -1;
  let upBars = 0, downBars = 0, dojiBars = 0, favBars = 0, advBars = 0, maxConsecAdv = 0, reversals = 0;
  let advRun = 0, lastDir = 0;   // lastDir: 1=순행 -1=역행 (도지는 유지)
  for (let j = t0Idx + 1; j < candles.length; j++) {
    const k = candles[j];
    const fav = isBull ? (k.high - prz) / prz * 100 : (prz - k.low) / prz * 100;
    const adv = isBull ? (prz - k.low) / prz * 100 : (k.high - prz) / prz * 100;
    if (fav > mfe) mfe = fav;
    if (adv > mae) mae = adv;
    // 봉 카운트(종료봉 포함) — post 구간
    const d = k.close - k.open;
    if (d > 0) upBars++; else if (d < 0) downBars++; else dojiBars++;
    const favBar = isBull ? d > 0 : d < 0;
    const advBar = isBull ? d < 0 : d > 0;
    if (favBar) { favBars++; advRun = 0; if (lastDir === -1) reversals++; lastDir = 1; }
    else if (advBar) { advBars++; advRun++; if (advRun > maxConsecAdv) maxConsecAdv = advRun; if (lastDir === 1) reversals++; lastDir = -1; }
    // slCloseBasis=true: 종가가 SL 이탈해야 손절(꼬리 헌팅 무시). 장중 TP(꼬리) 먼저 인정.
    const slHit = slCloseBasis
      ? (isBull ? k.close <= slPrice : k.close >= slPrice)
      : (isBull ? k.low <= slPrice : k.high >= slPrice);
    const tpTouch = isBull ? k.high >= tp1 : k.low <= tp1;
    if (slCloseBasis && tpTouch) {   // 종가기준 모드는 장중 TP 우선(꼬리 SL은 손절 아님)
      outcome = 'TP';
      endIdx = j;
      break;
    }
    if (slHit) {            // (꼬리기준) 같은 봉 SL·TP 동시 도달 시 SL 우선(보수적)
      outcome = 'SL';
      endIdx = j;
      slMode = (isBull ? k.close <= slPrice : k.close >= slPrice) ? 'broken' : 'hunted';
      break;
    }
    if (tpTouch) {
      outcome = 'TP';
      endIdx = j;
      break;
    }
    if (fav > mfeBeforeSL) mfeBeforeSL = fav; // SL 안 닿은 봉까지 누적
  }
  if (endIdx >= 0) barsToEnd = endIdx - t0Idx;
  const straightToSL: 0 | 1 = (outcome === 'SL' && mfeBeforeSL <= 0) ? 1 : 0;

  // 다음봉 방향
  let nextBarDir: 'fav' | 'adv' | 'flat' = 'flat';
  const c1 = candles[t0Idx + 1];
  if (c1) {
    const d = c1.close - c1.open;
    const favBar = isBull ? d > 0 : d < 0;
    nextBarDir = d === 0 ? 'flat' : (favBar ? 'fav' : 'adv');
  }

  // ── 경로(path): X점 - 패딩 ~ 종료까지 raw 캔들 + phase 라벨 ──
  const xTime = toSec(pattern.points.X.time);
  let xIdx = candles.findIndex(c => toSec(c.time) === xTime);
  if (xIdx < 0) xIdx = Math.max(0, t0Idx - ANATOMY_PRE_PAD); // 피벗 시각 매칭 실패시 fallback
  const startIdx = Math.max(0, xIdx - ANATOMY_PRE_PAD);
  const lastIdx = endIdx >= 0 ? endIdx : candles.length - 1; // open이면 데이터 끝까지
  const t0Time = toSec(c0.time);
  const path: AnatomyPathCandle[] = [];
  for (let j = startIdx; j <= lastIdx; j++) {
    const k = candles[j];
    const t = toSec(k.time);
    const phase: 'pre' | 'form' | 'post' = t < xTime ? 'pre' : (t <= t0Time ? 'form' : 'post');
    path.push({ t, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume, phase });
  }

  // ── 추가 X 피처 (진입시점 관측가능) ──
  const patternErr = Number.isFinite(pattern.error) ? pattern.error : null;
  const slDist = Math.abs(prz - slPrice);
  const slDistPct = prz > 0 ? slDist / prz * 100 : null;
  const tpDist = isBull ? tp1 - prz : prz - tp1;
  const tpSlRatio = slDist > 0 ? tpDist / slDist : null;
  const przWidth = (Number.isFinite(pattern.przMax) && Number.isFinite(pattern.przMin) && prz > 0)
    ? Math.abs(pattern.przMax - pattern.przMin) / prz * 100 : null;
  const favClose = isBull ? (c0.close - c0.low) : (c0.high - c0.close); // 패턴방향 유리 마감폭
  const closePosition = range > 0 ? Math.max(0, Math.min(1, favClose / range)) : 0.5;
  const tbv = (c0 as { takerBuyVolume?: number }).takerBuyVolume;
  const takerBuyRatio = (typeof tbv === 'number' && c0.volume > 0) ? tbv / c0.volume : null;

  // ── 축2 새 피처: 진입 직전 맥락·변동성·시간대 ──
  const apIdx = Math.max(0, t0Idx - 6);
  const apBase = candles[apIdx].close;
  const approachReturn = apBase > 0 ? (c0.close - apBase) / apBase * 100 : null;
  let precedingConsec = 0; // 직전 연속 역행(PRZ 접근방향) 봉 수
  for (let j = t0Idx - 1; j >= 0; j--) {
    const d = candles[j].close - candles[j].open;
    if (isBull ? d < 0 : d > 0) precedingConsec++; else break;
  }
  const atrNow = computeATR(candles, t0Idx, 14);
  const atrPrev = computeATR(candles, Math.max(14, t0Idx - 10), 14);
  const atrTrend = (atrNow && atrPrev && atrPrev > 0) ? atrNow / atrPrev : null;
  const dt = new Date(t0Time * 1000);
  const hourOfDay = dt.getUTCHours();
  const dayOfWeek = dt.getUTCDay();

  return {
    symbol, tf: '', signalTime: t0Time, patternName: pattern.name, dir: tradeType,
    touchBody, touchWickZoneSide, closeInsideZone, touchRangeAtr, touchVolRel, penetrationDepth,
    abXaRatio: pattern.abXaRatio ?? null,
    xcXaRatio: pattern.xcXaRatio ?? null,
    abCdTimeRatio,
    patternError: patternErr, tpSlRatio, slDistPct, przWidth, closePosition, takerBuyRatio,
    htfTrendAligned: null,
    approachReturn, precedingConsec, atrTrend, hourOfDay, dayOfWeek,
    htf2Aligned: null, btcAligned: null,
    outcome, barsToEnd, straightToSL, slMode, mae, mfe, nextBarDir,
    upBars, downBars, dojiBars, favBars, advBars, maxConsecAdv, reversals,
    przPrice: prz, slPrice, tp1,
    pointsTime: { X: xTime, A: toSec(pattern.points.A.time), B: toSec(pattern.points.B.time), C: toSec(pattern.points.C.time) },
    touchIdx: t0Idx - startIdx,
    endIdx: lastIdx - startIdx,
    path,
  };
}

export type BacktestResult = {
  symbol: string;
  trades: TradeResult[];
  n: number;
  winRate: number;
  ev: number;
  finalBalance: number;
  mdd: number;
  maxLoseStreak: number;
  hit10kCount?: number;
  tp1Count?: number;
  tp2Count?: number;
  sl1Count: number;
  sl2Count: number;
  sl3Count: number;
  tpDepths?: number[];
  cancelledDepths?: number[];
};

function toSec(t: string | number): number {
  if (typeof t === 'number') return t;
  return Math.floor(new Date(t.includes(' ') ? t.replace(' ', 'T') : t).getTime() / 1000);
}

function candleStepSec(candles: Candle[], idx: number): number {
  if (idx >= 0 && idx + 1 < candles.length) {
    return Math.max(1, toSec(candles[idx + 1].time) - toSec(candles[idx].time));
  }
  if (idx > 0) {
    return Math.max(1, toSec(candles[idx].time) - toSec(candles[idx - 1].time));
  }
  return 0;
}

function candleContainsPrice(c: Candle, price: number): boolean {
  return c.low <= price && c.high >= price;
}

function zoneFibLevel(ob: OB, r: number): number {
  return ob.low * Math.pow(ob.high / ob.low, r);
}

function obEntryPriceForLevel(ob: OB, tradeType: 'bull' | 'bear', level: StrategyParams['obEntryLevel']): number {
  if (level === 'eqNear') return tradeType === 'bull' ? zoneFibLevel(ob, 0.618) : zoneFibLevel(ob, 0.382);
  if (level === 'eqFar') return tradeType === 'bull' ? zoneFibLevel(ob, 0.382) : zoneFibLevel(ob, 0.618);
  return ob.mid;
}

function volumeMultipleAt(candles: Candle[], idx: number, lookback: number): number | null {
  if (idx < lookback || lookback <= 0) return null;
  let avg = 0;
  for (let i = idx - lookback; i < idx; i++) avg += candles[i].volume;
  avg /= lookback;
  return avg > 0 ? candles[idx].volume / avg : null;
}

function brokenContinuationType(ob: OB): 'bull' | 'bear' {
  return ob.type === 'bull' ? 'bear' : 'bull';
}

function brokenBreakClose(ob: OB, c: Candle): boolean {
  return ob.type === 'bull' ? c.close < ob.low : c.close > ob.high;
}

function brokenReentryClose(ob: OB, c: Candle): boolean {
  return c.close >= ob.low && c.close <= ob.high;
}

function brokenReclaimClose(ob: OB, c: Candle): boolean {
  return ob.type === 'bull' ? c.close >= ob.low : c.close <= ob.high;
}

function findBrokenSignalIndex(
  ob: OB,
  candles: Candle[],
  firstIdx: number,
  signal: NonNullable<StrategyParams['brokenEntrySignal']>,
  maxWaitCandles: number,
): number {
  let breakIdx = -1;
  for (let i = firstIdx; i < candles.length; i++) {
    if (brokenBreakClose(ob, candles[i])) {
      breakIdx = i;
      break;
    }
  }
  if (breakIdx < 0 || signal === 'breakClose') return breakIdx;

  let reentryIdx = -1;
  const reentryEnd = Math.min(breakIdx + 1 + maxWaitCandles, candles.length);
  for (let i = breakIdx + 1; i < reentryEnd; i++) {
    if (brokenReentryClose(ob, candles[i])) {
      reentryIdx = i;
      break;
    }
  }
  if (reentryIdx < 0) return -1;

  const rebreakEnd = Math.min(reentryIdx + 1 + maxWaitCandles, candles.length);
  for (let i = reentryIdx + 1; i < rebreakEnd; i++) {
    if (brokenBreakClose(ob, candles[i])) return i;
  }
  return -1;
}

// ── 보조지표 계산 ────────────────────────────────────────────────
function calcSMA(candles: Candle[], endIdx: number, period: number): number {
  if (endIdx < period - 1) return 0;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += candles[i].close;
  return sum / period;
}

function calcRSI(candles: Candle[], endIdx: number, period: number = 14): number {
  const startIdx = Math.max(1, endIdx - 150);
  if (endIdx - startIdx < period) return 50;
  let gains = 0, losses = 0;
  for (let i = startIdx; i < startIdx + period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = startIdx + period; i <= endIdx; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcMASnapshot(candles: Candle[], idx: number, price: number): MASnapshot | null {
  if (idx < 239) return null; // MA240 최소 필요
  const ma5   = calcSMA(candles, idx, 5);
  const ma20  = calcSMA(candles, idx, 20);
  const ma50  = calcSMA(candles, idx, 50);
  const ma100 = calcSMA(candles, idx, 100);
  const ma200 = calcSMA(candles, idx, 200);
  const ma240 = calcSMA(candles, idx, 240);
  const rsi   = calcRSI(candles, idx, 14);
  const slopeOf = (period: number): '↑'|'↓' => {
    const lb = 5;
    if (idx - lb < period - 1) return '↑';
    return calcSMA(candles, idx, period) >= calcSMA(candles, idx - lb, period) ? '↑' : '↓';
  };
  return {
    ma5, ma20, ma50, ma100, ma200, ma240, rsi,
    slopes: { ma20: slopeOf(20), ma50: slopeOf(50), ma100: slopeOf(100), ma200: slopeOf(200) },
    alignment: (ma20 > ma50 && ma50 > ma100 && ma100 > ma200) ? '정배열'
             : (ma20 < ma50 && ma50 < ma100 && ma100 < ma200) ? '역배열' : '혼합',
    cross50v200: ma50 >= ma200 ? '골든크로스' : '데스크로스',
    priceAbove: {
      ma20:  price >= ma20,
      ma50:  price >= ma50,
      ma100: price >= ma100,
      ma200: price >= ma200,
    },
  };
}

type EqSource = {
  type: 'bull' | 'bear';
  source: 'ob' | 'fvg';
  time: number;
  high: number;
  low: number;
  eqLow: number;
  eqHigh: number;
};

function getEqBox(low: number, high: number): { eqLow: number; eqHigh: number } {
  const eq = eqBoxShared(low, high, true); // 백테스트는 로그 스케일 고정
  return { eqLow: eq.low, eqHigh: eq.high };
}

function rangesOverlap(aLow: number, aHigh: number, bLow: number, bHigh: number): boolean {
  return Math.max(aLow, bLow) <= Math.min(aHigh, bHigh);
}

/**
 * EQ 통과 횟수 계산기 — untilTime이 단조 증가하는 백테스트 루프 전제의 증분 버전.
 * eq마다 마지막으로 본 캔들 인덱스·side·passes를 캐시해 매 호출 전체 재스캔(O(N))을 피한다.
 */
function makeEqPassCounter(candles: Candle[]): (eq: EqSource, untilTime: number) => number {
  const times = candles.map(c => toSec(c.time));
  const state = new Map<EqSource, { idx: number; side: 'above' | 'below' | null; passes: number }>();
  return (eq, untilTime) => {
    let s = state.get(eq);
    if (!s) {
      s = { idx: 0, side: null, passes: 0 };
      state.set(eq, s);
    }
    while (s.idx < candles.length && times[s.idx] <= untilTime) {
      if (times[s.idx] > eq.time) {
        const c = candles[s.idx];
        const nextSide = c.close > eq.eqHigh ? 'above' : c.close < eq.eqLow ? 'below' : null;
        if (nextSide) {
          if (s.side && nextSide !== s.side) s.passes++;
          s.side = nextSide;
        }
      }
      s.idx++;
    }
    return s.passes;
  };
}

/**
 * 증분 피벗 트래커 — getPivots(slice, len, 'wick')를 캔들마다 전체 재계산(O(N²·len))하는 대신,
 * 새 캔들이 들어올 때 확정되는 피벗 후보(p = L-1-len)만 O(len)으로 검사해 raw 목록에 누적한다.
 * zigzag()는 shared/pivots.ts의 ZigZag 필터와 동일한 규칙을 raw 목록에 적용 — 출력이
 * getPivots와 정확히 같아야 한다(검증: 동일 입력 → 동일 거래 결과).
 */
class IncrementalWickPivots {
  private raw: { type: 'high' | 'low'; i: number; price: number; time: number }[] = [];
  private nextP: number;

  constructor(private candles: Candle[], private len: number) {
    this.nextP = len; // 첫 피벗 후보 인덱스 (왼쪽 len개 확보 시점)
  }

  /** slice 길이 L까지 반영 — 오른쪽 len개가 확보된 후보 p <= L-1-len 전부 처리 */
  advance(L: number): void {
    const { candles, len } = this;
    const maxP = L - 1 - len;
    for (let p = this.nextP; p <= maxP; p++) {
      const currentHigh = candles[p].high;
      const currentLow = candles[p].low;
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= len; j++) {
        if (candles[p - j].high > currentHigh || candles[p + j].high > currentHigh) isHigh = false;
        if (candles[p - j].low < currentLow || candles[p + j].low < currentLow) isLow = false;
        if (!isHigh && !isLow) break;
      }
      if (isHigh) {
        this.raw.push({ type: 'high', i: p, price: currentHigh, time: toSec(candles[p].time) });
      } else if (isLow) {
        this.raw.push({ type: 'low', i: p, price: currentLow, time: toSec(candles[p].time) });
      }
    }
    if (maxP >= this.nextP) this.nextP = maxP + 1;
  }

  /** shared getPivots의 ZigZag 필터와 동일 — raw 피벗 수(P)만큼만 순회 */
  zigzag(): { type: 'high' | 'low'; i: number; price: number; time: number }[] {
    const filtered: typeof this.raw = [];
    let lastType: 'high' | 'low' | null = null;
    let lastPivot: (typeof this.raw)[number] | null = null;
    for (const p of this.raw) {
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
}

function buildEqPool(obCandles: Candle[]): EqSource[] {
  const obBoxes = detectOBs(obCandles).map((ob): EqSource => {
    const { eqLow, eqHigh } = getEqBox(ob.low, ob.high);
    return { ...ob, source: 'ob', eqLow, eqHigh };
  });
  const fvgBoxes = detectFVGs(obCandles).map((fvg): EqSource => {
    const { eqLow, eqHigh } = getEqBox(fvg.low, fvg.high);
    return { ...fvg, source: 'fvg', eqLow, eqHigh };
  });
  return [...obBoxes, ...fvgBoxes].sort((a, b) => a.time - b.time);
}

function getPatternFamilyName(pattern: EmergingHarmonicResult): string {
  return pattern.name
    .replace(/^Bullish\s+|^Bearish\s+/, '')
    .replace(/\s+\(Emerging\)$/, '');
}

function harmonicTargets(pattern: EmergingHarmonicResult, isLog = false): { tp1: number; tp2: number } {
  const { A, B, C } = pattern.points;
  const d = pattern.przPrice;
  const family = getPatternFamilyName(pattern);
  // base=d 에서 from 방향으로 ratio 만큼 투영. 로그 모드면 기하(로그) 투영.
  const target = (base: number, from: number, ratio: number) =>
    isLog ? Math.exp(Math.log(base) + (Math.log(from) - Math.log(d)) * ratio) : base + (from - d) * ratio;

  if (family === 'Cypher') {
    return { tp1: target(d, C.price, 0.382), tp2: target(d, C.price, 0.618) };
  }
  if (family === 'Shark') {
    return { tp1: target(d, C.price, 0.5), tp2: target(d, C.price, 0.886) };
  }
  if (family === '5-0') {
    return { tp1: C.price, tp2: target(d, C.price, 1.272) };
  }
  return { tp1: target(d, A.price, 0.382), tp2: target(d, A.price, 0.618) };
}

function harmonicXabcKey(pattern: EmergingHarmonicResult): string {
  const { X, A, B, C } = pattern.points;
  return `${X.time}_${A.time}_${B.time}_${C.time}_${pattern.isBullish}`;
}

function harmonicAttemptKey(pattern: EmergingHarmonicResult): string {
  const priceKey = pattern.przPrice.toPrecision(8);
  return `${harmonicXabcKey(pattern)}_${pattern.name}_${priceKey}`;
}

function runHarmonicBacktest(
  symbol: string,
  obCandles: Candle[],
  entryCandles: Candle[],
  params: StrategyParams,
  initialCapital: number,
  anatomyOut?: HarmonicAnatomyRow[],
  htfCandles?: Candle[],
): BacktestResult {
  const effPosPct = (params.capitalMode === 'fixed' && params.fixedEntryMargin !== undefined) 
    ? (params.fixedEntryMargin / initialCapital) * 100 
    : params.positionPct;

  const trades: TradeResult[] = [];
  const cancelledTrades: any[] = [];
  const useEqFilter = params.harmonicUseEqFilter !== false;
  const eqPool = useEqFilter ? buildEqPool(obCandles) : [];
  const tradedKeys = new Set<string>();
  const closedXabcKeys = new Set<string>();
  const scanLengths = [55, 34, 21, 13, 8, 5];
  const eqAlivePasses = params.eqAlivePasses ?? 3;
  const entryMode = params.harmonicEntryMode ?? 'close';
  const tp1Weight = Math.max(0, Math.min(1, (params.harmonicTp1Pct ?? 50) / 100));
  const tp2Weight = Math.max(0, Math.min(1, (params.harmonicTp2Pct ?? 50) / 100));
  const weightTotal = tp1Weight + tp2Weight || 1;
  const normalizedTp1Weight = tp1Weight / weightTotal;
  const normalizedTp2Weight = tp2Weight / weightTotal;
  const enabledPatterns = new Set(params.harmonicEnabledPatterns ?? []);
  const usePatternFilter = enabledPatterns.size > 0;
  const moveStopToBreakeven = params.harmonicMoveStopToBreakeven === true;
  const isLog = params.harmonicLogScale === true; // 피보나치 투영을 로그(기하) 기준으로 계산
  const entryDepth = params.harmonicEntryDepth ?? 0.5; // 진입 깊이 (0=D점, 0.5=D~SL 중간)
  const MAX_CONCURRENT = 4; // 동시 보유 가능한 최대 포지션 수 (심볼당)
  const barSec = entryCandles.length > 1
    ? toSec(entryCandles[1].time) - toSec(entryCandles[0].time)
    : 14400;

  const countEqPasses = makeEqPassCounter(obCandles);
  const pivotTrackers = new Map(scanLengths.map(len => [len, new IncrementalWickPivots(entryCandles, len)]));

  const oldLog = console.log;
  console.log = () => undefined;
  try {
    for (let i = 0; i < entryCandles.length; i++) {
      const c = entryCandles[i];
      const currentTime = toSec(c.time);
      const currentPrice = c.close;
      const slice = entryCandles.slice(0, i + 1);
      const predictions: EmergingHarmonicResult[] = [];

      for (const len of scanLengths) {
        if (slice.length <= len * 2) continue;
        const tracker = pivotTrackers.get(len)!;
        tracker.advance(slice.length);
        const pivots = tracker.zigzag() as any;
        // candles(slice)를 전달해 차트·워커와 동일한 꼬리 단위 PRZ 터치/무효화 판정을 쓴다
        // display 모드도 백테스트에선 scanLimit으로 전체 재스캔 방지(O(n²)→O(n)). entry는 내부 기본 last-8.
        predictions.push(...predictHarmonicPatterns(pivots, currentPrice, isLog, slice, params.harmonicPredictMode ? { mode: params.harmonicPredictMode, scanLimit: 8 } : undefined));
      }

      const seenAtCandle = new Set<string>();
      const entryCandidates: Array<{
        pattern: EmergingHarmonicResult;
        attemptKey: string;
        xabcKey: string;
        tradeType: 'bull' | 'bear';
        entryPrice: number;
        tp1: number;
        tp2: number;
        slPrice: number;
        zoneLow: number;
        zoneHigh: number;
      }> = [];

      for (const pattern of predictions) {
        const family = getPatternFamilyName(pattern);
        if (usePatternFilter && !enabledPatterns.has(family)) continue;

        const xabcKey = harmonicXabcKey(pattern);
        const attemptKey = harmonicAttemptKey(pattern);
        if (closedXabcKeys.has(xabcKey) || seenAtCandle.has(attemptKey) || tradedKeys.has(attemptKey)) continue;
        seenAtCandle.add(attemptKey);

        const activeEq = useEqFilter
          ? eqPool.find(eq => {
              if (eq.time > currentTime) return false;
              if (countEqPasses(eq, currentTime) >= eqAlivePasses) return false;
              return rangesOverlap(pattern.przMin, pattern.przMax, eq.eqLow, eq.eqHigh);
            })
          : null;
        if (useEqFilter && !activeEq) continue;

        const zoneLow = useEqFilter && activeEq ? Math.max(pattern.przMin, activeEq.eqLow) : pattern.przMin;
        const zoneHigh = useEqFilter && activeEq ? Math.min(pattern.przMax, activeEq.eqHigh) : pattern.przMax;
        const touchedZone = c.high >= zoneLow && c.low <= zoneHigh;
        const closedInZone = c.close >= zoneLow && c.close <= zoneHigh;
        const shouldEnter = entryMode === 'immediate' ? touchedZone : closedInZone; // 신호(arming) 트리거
        if (!shouldEnter) continue;

        // ── 진입 필터 (SL anatomy 분석: 유리마감 + 상위TF 추세정렬) — anatomy 수집 모드는 제외 ──
        if (!anatomyOut && (params.harmonicMinClosePosition !== undefined || params.harmonicRequireHtfAlign || params.harmonicMinTouchAtr !== undefined)) {
          const ft: 'bull' | 'bear' = pattern.isBullish ? 'bull' : 'bear';
          if (params.harmonicMinClosePosition !== undefined) {
            const rng = c.high - c.low;
            const favC = ft === 'bull' ? c.close - c.low : c.high - c.close;
            if ((rng > 0 ? favC / rng : 0.5) < params.harmonicMinClosePosition) continue;
          }
          if (params.harmonicMinTouchAtr !== undefined) {
            const atr = computeATR(entryCandles, i, 14);
            if (!atr || atr <= 0 || (c.high - c.low) / atr < params.harmonicMinTouchAtr) continue;
          }
          if (params.harmonicRequireHtfAlign && htfCandles && htfCandles.length) {
            if (htfAlignInline(htfCandles, currentTime, ft) !== 1) continue;
          }
        }

        // ── Gartley 전용 품질 필터 (AB=CD만, BC 미사용) ──────
        if (family === 'Gartley') {
          // ① 시간 대칭: CD봉수/AB봉수 >= 0.8 (CD가 AB 대비 너무 빨리 끝난 패턴 제외)
          const abBars = (toSec(pattern.points.B.time) - toSec(pattern.points.A.time)) / barSec;
          const cdBars = (currentTime - toSec(pattern.points.C.time)) / barSec;
          if (abBars > 0 && cdBars / abBars < 0.8) continue;
          // ② XC/XA 0.5~0.6 구간 제외 (해당 C점 위치가 단독 마이너스)
          if (pattern.xcXaRatio !== undefined && pattern.xcXaRatio >= 0.5 && pattern.xcXaRatio < 0.6) continue;
          // ③ AB=CD(CD/AB) 0.5~1.1 범위만 허용 (양극 제거)
          if (pattern.abcdRatio !== undefined && (pattern.abcdRatio < 0.5 || pattern.abcdRatio > 1.1)) continue;
        }

        // ── Crab 전용 필수 조건: AB=CD 1.272 이상 (BC 미사용) ──────
        if (family === 'Crab') {
          if (pattern.abcdRatio === undefined || pattern.abcdRatio < 1.272) continue;
        }

        // 그 외 패턴(Deep Gartley/Butterfly/Bat/Alt Bat/Deep Crab/Shark/Cypher/5-0):
        // 추가 필수조건 없음 — 비율 매칭 + C<A + SL 미이탈 + SL폭 15% 캡만 적용.

        const tradeType: 'bull' | 'bear' = pattern.isBullish ? 'bull' : 'bear';
        const slPrice = pattern.slPrice;
        // 진입 깊이: D점(0)에서 SL(1) 방향으로 entryDepth만큼 보간 (워커와 동일 규칙)
        const entryPrice = harmonicEntryPrice(pattern.przPrice, slPrice, entryDepth, isLog);
        const { tp1, tp2 } = harmonicTargets(pattern, isLog);

        if (entryPrice <= 0 || tp1 <= 0 || tp2 <= 0 || slPrice <= 0) continue;
        if (tradeType === 'bull' && (tp1 <= entryPrice || tp2 <= entryPrice || slPrice >= entryPrice)) continue;
        if (tradeType === 'bear' && (tp1 >= entryPrice || tp2 >= entryPrice || slPrice <= entryPrice)) continue;

        // SL폭 상한: 진입가↔X 거리(=손절폭) 15% 이상 셋업 제외 (대형 꼬리손실 방어, 전 패턴 공통)
        // harmonicNoSlCap=true(분석 전용)면 캡 해제 — 손절폭 넓은 패턴까지 전수 수집.
        const slPctAbs = Math.abs(entryPrice - slPrice) / entryPrice * 100;
        if (!params.harmonicNoSlCap && slPctAbs >= 15) continue;

        entryCandidates.push({ pattern, attemptKey, xabcKey, tradeType, entryPrice, tp1, tp2, slPrice, zoneLow, zoneHigh });
      }

      // ── anatomy 수집 모드: 손익/진입 로직을 타지 않고 신호 패턴의 첫터치 양상만 기록 ──
      // entryCandidates는 이미 attemptKey 중복(seenAtCandle·tradedKeys)이 걸러진 신규 신호만 담는다.
      if (anatomyOut) {
        for (const cand of entryCandidates) {
          tradedKeys.add(cand.attemptKey); // 다음 캔들에서 같은 패턴 재기록 방지(648줄 필터)
          const row = computeHarmonicAnatomy(symbol, entryCandles, i, cand, barSec, params.harmonicSlCloseBasis === true);
          if (row) anatomyOut.push(row);
        }
        continue;
      }

      // ── 다중 포지션: 현재 캔들 시점에 열려있는 거래 수를 세서 빈 슬롯만큼만 진입 ──
      const activeCount = trades.filter(t => t.entryTime <= currentTime && t.exitTime >= currentTime).length;
      const available = MAX_CONCURRENT - activeCount;
      if (available <= 0) continue;

      const ranked = entryCandidates.sort((a, b) =>
        Math.abs(currentPrice - a.pattern.przPrice) - Math.abs(currentPrice - b.pattern.przPrice)
      );

      for (const selected of ranked.slice(0, available)) {
        const confluenceMatches = entryCandidates
          .filter(cand =>
            cand !== selected &&
            cand.tradeType === selected.tradeType &&
            cand.xabcKey !== selected.xabcKey &&
            rangesOverlap(selected.zoneLow, selected.zoneHigh, cand.zoneLow, cand.zoneHigh)
          );
        const uniqueConfluencePatterns = Array.from(new Set(confluenceMatches.map(cand => cand.pattern.name)));

        const { pattern, attemptKey, xabcKey, tradeType, tp1, tp2, slPrice } = selected;
        const entryPrice = selected.entryPrice; // 체결가(0.5 라인) 고정
        const signalIdx = i;                    // D(PRZ) 터치 = 신호 캔들

      let obIdxAtEntry = -1;
      for (let oi = obCandles.length - 1; oi >= 0; oi--) {
        if (toSec(obCandles[oi].time) <= currentTime) { obIdxAtEntry = oi; break; }
      }
      const maEntry = {
        obTf: obIdxAtEntry >= 0 ? calcMASnapshot(obCandles, obIdxAtEntry, entryPrice) : null,
        entryTf: calcMASnapshot(entryCandles, signalIdx, entryPrice),
      };

      let outcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' = 'timeout';
      let exitIdx = signalIdx;
      let exitPrice = entryPrice;
      let rawPnlPct = 0;
      let maxDepthRatio = 0;
      const zoneLow = Math.min(pattern.przPrice, pattern.slPrice);
      const zoneHigh = Math.max(pattern.przPrice, pattern.slPrice);
      let tp1Hit = false;
      let tpExitLevel: 1 | 2 | undefined;
      const sizeMultiplier = 1.0;        // 단일 진입(split 폐기)
      let filled = false;                // 0.5 라인 터치 여부(신호→체결)
      let fillIdx = signalIdx;           // 체결 캔들
      let cancelled = false;             // 0.5 닿기 전 TP1 도달 → 폐기

      const initialSlPct = tradeType === 'bull'
        ? (slPrice - entryPrice) / entryPrice * 100
        : (entryPrice - slPrice) / entryPrice * 100;
      // 거래당 가격 손절 하드캡: 패턴 SL이 0.8%보다 멀면 가격 기준 0.8% 위치로 손절선을 당김.
      const slCapPct = params.harmonicSlCapPct ?? HARMONIC_PRICE_LOSS_CAP_PCT;
      const cappedSlPct = Math.min(Math.abs(initialSlPct), slCapPct); // 적용 손절폭(가격%, 양수)
      const cappedSlPrice = tradeType === 'bull'
        ? entryPrice * (1 - cappedSlPct / 100)
        : entryPrice * (1 + cappedSlPct / 100);

      const tp1Pct = tradeType === 'bull'
        ? (tp1 - entryPrice) / entryPrice * 100
        : (entryPrice - tp1) / entryPrice * 100;
      const tp2Pct = tradeType === 'bull'
        ? (tp2 - entryPrice) / entryPrice * 100
        : (entryPrice - tp2) / entryPrice * 100;
      const activeSlPct = -cappedSlPct;

      let stopMovedToBreakeven = false;
      let tp1RealizedRawPct = 0;
      let remainderRawPct = 0;
      let remainderExitLabel: TradeResult['remainderExitLabel'];

      for (let j = signalIdx; j < entryCandles.length; j++) {
        const ec = entryCandles[j];
        const lowRatio = (zoneHigh - ec.low) / (zoneHigh - zoneLow);
        const highRatio = (ec.high - zoneLow) / (zoneHigh - zoneLow);
        const curRatio = tradeType === 'bull' ? lowRatio : highRatio;
        if (curRatio > maxDepthRatio) maxDepthRatio = curRatio;

        // --- 신호(미체결): 0.5 진입라인 터치 대기 ---
        if (!filled) {
          const fillHit = tradeType === 'bull' ? ec.low <= entryPrice : ec.high >= entryPrice;
          if (fillHit) {
            filled = true;
            fillIdx = j;
            // 체결 캔들에서 바로 청산까지 갈 수 있으므로 아래 청산 판정 계속 진행
          } else {
            // 0.5 닿기 전 TP1 먼저 도달 → 폐기(거래 미발생)
            const tp1Pre = tradeType === 'bull' ? ec.high >= tp1 : ec.low <= tp1;
            if (tp1Pre) { cancelled = true; break; }
            continue; // 아직 신호 상태(시간만료 없음)
          }
        }

        const activeSlPrice = moveStopToBreakeven && tp1Hit ? entryPrice : cappedSlPrice;
        const slHit = tradeType === 'bull' ? ec.low <= activeSlPrice : ec.high >= activeSlPrice;
        const tp1Reached = tradeType === 'bull' ? ec.high >= tp1 : ec.low <= tp1;
        const tp2Reached = tradeType === 'bull' ? ec.high >= tp2 : ec.low <= tp2;

        if (slHit) {
          outcome = 'sl1';
          exitIdx = j;
          exitPrice = activeSlPrice;
          const slPct = moveStopToBreakeven && tp1Hit ? 0 : activeSlPct;
          rawPnlPct = tp1Hit
            ? normalizedTp1Weight * tp1Pct + normalizedTp2Weight * slPct
            : slPct;
          tp1RealizedRawPct = tp1Hit ? normalizedTp1Weight * tp1Pct : 0;
          remainderRawPct = tp1Hit ? normalizedTp2Weight * slPct : slPct;
          remainderExitLabel = moveStopToBreakeven && tp1Hit ? '본절스탑' : 'SL';
          break;
        }
        if (j > fillIdx && !tp1Hit && tp1Reached) {
          tp1Hit = normalizedTp1Weight > 0;
          stopMovedToBreakeven = tp1Hit && normalizedTp2Weight > 0 && moveStopToBreakeven;
          if (normalizedTp2Weight === 0) {
            outcome = 'tp';
            exitIdx = j;
            exitPrice = tp1;
            rawPnlPct = tp1Pct;
            tp1RealizedRawPct = tp1Pct;
            remainderRawPct = 0;
            tpExitLevel = 1;
            break;
          }
        }
        if (j > fillIdx && normalizedTp2Weight > 0 && tp2Reached) {
          outcome = 'tp';
          exitIdx = j;
          exitPrice = tp2;
          rawPnlPct = normalizedTp1Weight * tp1Pct + normalizedTp2Weight * tp2Pct;
          tp1RealizedRawPct = tp1Hit ? normalizedTp1Weight * tp1Pct : 0;
          remainderRawPct = tp1Hit ? normalizedTp2Weight * tp2Pct : tp2Pct;
          remainderExitLabel = 'TP2';
          tpExitLevel = 2;
          break;
        }
        if (j >= fillIdx + params.maxHoldCandles) {
          outcome = 'timeout';
          exitIdx = j;
          exitPrice = ec.close;
          const closePct = tradeType === 'bull'
            ? (ec.close - entryPrice) / entryPrice * 100
            : (entryPrice - ec.close) / entryPrice * 100;
          rawPnlPct = tp1Hit
            ? normalizedTp1Weight * tp1Pct + normalizedTp2Weight * closePct
            : closePct;
          tp1RealizedRawPct = tp1Hit ? normalizedTp1Weight * tp1Pct : 0;
          remainderRawPct = tp1Hit ? normalizedTp2Weight * closePct : closePct;
          remainderExitLabel = 'TIMEOUT';
          break;
        }
      }
      // 0.5 라인 미체결(신호만 발생 후 TP1 폐기 또는 데이터 종료) → 거래 미기록
      if (!filled || cancelled) continue;
      if (remainderExitLabel === undefined) {
        remainderExitLabel = 'TIMEOUT';
      }

      // 비용: 진입 1 + 청산 1 (+TP1 분할 청산 1) 체결 + 보유시간 펀딩
      const costPct = tradeCostPct(
        params,
        tp1Hit ? 3 : 2,
        toSec(entryCandles[fillIdx].time),
        toSec(entryCandles[exitIdx].time),
      );
      rawPnlPct -= costPct;
      if (tp1Hit) {
        tp1RealizedRawPct -= costPct * normalizedTp1Weight;
        remainderRawPct -= costPct * normalizedTp2Weight;
      } else {
        remainderRawPct -= costPct;
      }

      trades.push({
        maxDepthRatio,
        entryTime: toSec(entryCandles[fillIdx].time),
        exitTime: toSec(entryCandles[exitIdx].time),
        entryPrice,
        exitPrice,
        capitalPnl: rawPnlPct * params.leverage * (effPosPct / 100) * sizeMultiplier,
        outcome,
        obType: tradeType,
        maEntry,
        tp1Hit,
        tpExitLevel,
        stopLossPct: -activeSlPct, // 손절 퍼센트는 양수
        tp1ProfitPct: tp1Pct,
        tp2ProfitPct: tp2Pct,
        stopMovedToBreakeven,
        tp1RealizedCapitalPnl: tp1RealizedRawPct * params.leverage * (effPosPct / 100) * sizeMultiplier,
        remainderCapitalPnl: remainderRawPct * params.leverage * (effPosPct / 100) * sizeMultiplier,
        remainderExitLabel,
        bcAbRatio: pattern.bcAbRatio,
        bcAbTier: pattern.bcAbTier,
        bcProjectionRatio: pattern.bcProjectionRatio,
        bcProjectionRange: pattern.bcProjectionRange,
        bcProjectionMatch: pattern.bcProjectionMatch,
        abcdRatio: pattern.abcdRatio,
        abcdTier: pattern.abcdTier,
        abcdMatch: pattern.abcdMatch,
        patternName: pattern.name,
        confluenceCount: 1 + confluenceMatches.length,
        confluencePatterns: uniqueConfluencePatterns,
        abXaRatio: pattern.abXaRatio,
        xcXaRatio: pattern.xcXaRatio,
        abCdTimeRatio: (() => {
          const abBars = (toSec(pattern.points.B.time) - toSec(pattern.points.A.time)) / barSec;
          const cdBars = (currentTime - toSec(pattern.points.C.time)) / barSec;
          return abBars > 0 ? cdBars / abBars : undefined;
        })(),
        entryPrecision: (() => {
          const span = Math.abs(pattern.przMax - pattern.przMin);
          return span > 0 ? Math.abs(entryPrice - pattern.przPrice) / span : undefined;
        })(),
      });
      tradedKeys.add(attemptKey);
      if (outcome === 'tp' || outcome === 'timeout') {
        closedXabcKeys.add(xabcKey);
      }
      } // end for (selected) — 다중 포지션 admission
    }
  } finally {
    console.log = oldLog;
  }

  trades.sort((a, b) => a.entryTime - b.entryTime);
  return summarizeBacktest(symbol, trades, initialCapital, params.capitalMode ?? 'fixed');
}

function summarizeBacktest(
  symbol: string,
  trades: TradeResult[],
  initialCapital: number,
  capitalMode: StrategyParams['capitalMode'] = 'fixed',
): BacktestResult {
  const n = trades.length;
  // 배타적 버킷: TP2는 TP2만, TP1은 TP2 미도달 & TP1 도달만(본절스탑 포함)
  const tp2Count = trades.filter(t => t.tpExitLevel === 2).length;
  const tp1Count = trades.filter(t => t.tpExitLevel === 1 || (t.tp1Hit && t.tpExitLevel !== 2)).length;
  
  // 전체 거래 기준 승률: (TP1 + TP2) / 전체완료거래(n)
  const wins = tp1Count + tp2Count;
  
  const sl1Count = trades.filter(t => t.outcome === 'sl1' && !t.tp1Hit).length;
  const sl2Count = trades.filter(t => t.outcome === 'sl2').length;
  const sl3Count = trades.filter(t => t.outcome === 'sl3').length;
  
  const winRate = n > 0 ? +((wins / n) * 100).toFixed(1) : 0;
  const ev = n > 0 ? +(trades.reduce((s, t) => s + t.capitalPnl, 0) / n).toFixed(3) : 0;

  let balance = initialCapital;
  let peak = initialCapital;
  let mdd = 0;
  let loseStreak = 0;
  let maxLoseStreak = 0;
  let hit10kCount = 0;

  // ── 다중 포지션 복리: 청산(실현) 순서로 현재 실현잔고에 손익 반영 ──
  // 손익을 '청산 시점의 현재 잔고' 기준 승수로 적용해 1만불 리셋과 무관하게 음수 잔고가 안 나오도록 함.
  // (진입시점 절대금액 고정 방식은 리셋이 끼면 큰 절대손실이 리셋된 소액 잔고에 적용돼 음수가 되는 버그가 있었음)
  const byExit = [...trades].sort((a, b) => (a.exitTime - b.exitTime) || (a.entryTime - b.entryTime));
  for (const t of byExit) {
    const capitalBase = capitalMode === 'compound' ? balance : initialCapital;
    t.balanceBefore = +capitalBase.toFixed(2);
    t.capitalDelta = +(capitalBase * (t.capitalPnl / 100)).toFixed(2);
    if (t.tp1RealizedCapitalPnl !== undefined) {
      t.tp1RealizedDelta = +(capitalBase * (t.tp1RealizedCapitalPnl / 100)).toFixed(2);
    }
    if (t.remainderCapitalPnl !== undefined) {
      t.remainderDelta = +(capitalBase * (t.remainderCapitalPnl / 100)).toFixed(2);
    }
    balance += t.capitalDelta;
    t.balanceAfter = +(capitalBase + t.capitalDelta).toFixed(2);

    if (balance >= 10000) {
      hit10kCount++;
      balance = initialCapital;
      peak = initialCapital;
    }
    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > mdd) mdd = dd;

    if (t.outcome === 'tp') {
      loseStreak = 0;
    } else {
      loseStreak++;
      if (loseStreak > maxLoseStreak) maxLoseStreak = loseStreak;
    }
  }

  return {
    symbol, trades, n, winRate, ev,
    finalBalance: +balance.toFixed(2),
    mdd: +mdd.toFixed(1),
    maxLoseStreak,
    hit10kCount,
    tp1Count,
    tp2Count,
    sl1Count,
    sl2Count,
    sl3Count,
    tpDepths: trades.filter(t => t.outcome === 'tp').map(t => t.maxDepthRatio ?? 0),
    cancelledDepths: trades.filter(t => t.outcome === 'missed').map(t => t.maxDepthRatio ?? 0)
  };
}

// ── FVG 감지 — 공유 엔진(shared/smc.ts) 위임. 로그 스케일 고정 ─────
// (구 복사본은 산술 중간값을 썼으나 차트·워커와 정합되도록 로그(CE)로 교정됨)
function detectFVGs(candles: Candle[]): OB[] {
  return detectFVGsShared(candles, { logScale: true }).map(fvg => ({
    type: fvg.type,
    time: fvg.confirmTime, // 갭 확정 캔들 — 기존 백테스트와 동일한 가용 시점
    confirmTime: fvg.confirmTime,
    high: fvg.high,
    low: fvg.low,
    mid: fvg.ce,
  }));
}

// ── OB 감지 — 공유 엔진(shared/smc.ts) 위임. 로그 스케일 고정 ──────
// (구 복사본은 도지(시가=종가)를 양봉 취급했으나 차트와 동일하게 무방향으로 교정됨)
export function detectOBs(candles: Candle[]): OB[] {
  return detectOBsShared(candles, { touchType: 'wick', logScale: true })
    .map(ob => ({ type: ob.type, time: ob.time, confirmTime: ob.confirmTime, high: ob.high, low: ob.low, mid: ob.mid }));
}

// ── 캔들 반응 분류 — 공유 엔진(shared/smc.ts) 위임 ────────────────
export type TouchType =
  | 'no_touch' | 'wick_high' | 'wick_mid' | 'wick_low'
  | 'close_above_mid' | 'close_below_mid' | 'breakout';

export function classifyCandle(ob: OB, c: Candle): TouchType {
  return classifyCandleShared(ob, c);
}

// ── 백테스트 메인 ───────────────────────────────────────────
// obCandles : OB 감지용 (날봉 등 상위 TF)
// entryCandles : 진입/청산용 (4H 등 하위 TF)
export function runBacktest(
  symbol: string,
  obCandles: Candle[],
  entryCandles: Candle[],
  params: StrategyParams,
  initialCapital = 100,
  anatomyOut?: HarmonicAnatomyRow[],
  htfCandles?: Candle[],
): BacktestResult {
  if (params.useHarmonicStrategy) {
    return runHarmonicBacktest(symbol, obCandles, entryCandles, params, initialCapital, anatomyOut, htfCandles);
  }

  const effPosPct = (params.capitalMode === 'fixed' && params.fixedEntryMargin !== undefined) 
    ? (params.fixedEntryMargin / initialCapital) * 100 
    : params.positionPct;

  const obCandlesMap = new Map<number, Candle>(obCandles.map(c => [toSec(c.time), c]));
  const obs = params.useFvgStrategy ? detectFVGs(obCandles) : detectOBs(obCandles);
  const trades: TradeResult[] = [];
  const cancelledTrades: any[] = [];

  // ── DEBUG ──────────────────────────────────────────────
  let dbgNoIdx = 0, dbgNoFirst = 0, dbgWrongSignal = 0, dbgNoEntry = 0;
  const dbgSignalTypes: Record<string, number> = {};
  // ───────────────────────────────────────────────────────

  for (const ob of obs) {
    // switching: bull OB → short 트레이드 (ob.type 반전)
    const effectiveType = params.switching
      ? (ob.type === 'bull' ? 'bear' : 'bull')
      : ob.type;
      
    const signalType: TouchType = params.fvgSignalDeep
      ? (effectiveType === 'bull' ? 'close_below_mid' : 'close_above_mid')
      : (effectiveType === 'bull' ? 'close_above_mid' : 'close_below_mid');

    // 기존 백테스트는 OB 원천봉 이후 2캔들부터 관측했다.
    // EQ 연구 전환 실험은 shared confirmTime부터 관측하도록 옵션으로 분리한다.
    const obCandleIdx = obCandles.findIndex(c => toSec(c.time) === ob.time);
    if (obCandleIdx < 0) { dbgNoIdx++; continue; }

    // 거래량 필터: OB 캔들 거래량 >= 직전 N캔들 평균 * 배수
    if (params.volumeFilter && obCandleIdx >= params.volumeLookback) {
      let avgVol = 0;
      for (let k = obCandleIdx - params.volumeLookback; k < obCandleIdx; k++) {
        avgVol += obCandles[k].volume;
      }
      avgVol /= params.volumeLookback;
      if (obCandles[obCandleIdx].volume < avgVol * params.volumeMultiplier) continue;
    }

    const legacyLookAfterTime = obCandleIdx + 2 < obCandles.length
      ? toSec(obCandles[obCandleIdx + 2].time)
      : undefined;
    const confirmIdx = ob.confirmTime === undefined
      ? -1
      : obCandles.findIndex(c => toSec(c.time) === ob.confirmTime);
    const confirmLookAfterTime = ob.confirmTime === undefined
      ? undefined
      : ob.confirmTime + candleStepSec(obCandles, confirmIdx >= 0 ? confirmIdx : obCandleIdx);
    const lookAfterTime = ob.bbStartTime
      || (params.useConfirmTimeEntry ? confirmLookAfterTime : undefined)
      || legacyLookAfterTime;
    if (!lookAfterTime) { dbgNoIdx++; continue; }

    // entry TF에서 lookAfterTime 이후 첫 캔들 인덱스
    const firstIdx = entryCandles.findIndex(c => toSec(c.time) >= lookAfterTime);
    if (firstIdx < 0) { dbgNoFirst++; continue; }

    // ── Broken-zone continuation (독립 경로) ───────────────
    // bull 존이 손절쪽(아래) 종가이탈하면 short, bear 존이 위로 종가이탈하면 long.
    // rebreakClose는 이탈→존 안 종가 재진입→재이탈까지 모두 관측된 뒤 다음 봉 시가에 진입한다.
    if (params.useBrokenZoneContinuation) {
      const signalIdx = findBrokenSignalIndex(
        ob,
        entryCandles,
        firstIdx,
        params.brokenEntrySignal ?? 'breakClose',
        params.maxWaitCandles,
      );
      if (signalIdx < 0) { dbgWrongSignal++; continue; }

      const entryIdx = signalIdx + 1;
      if (entryIdx >= entryCandles.length) { dbgNoEntry++; continue; }

      const zoneWidth = ob.high - ob.low;
      if (!Number.isFinite(zoneWidth) || zoneWidth <= 0) continue;

      const tradeType = brokenContinuationType(ob);
      const entryPrice = entryCandles[entryIdx].open;
      const entryTimeSec = toSec(entryCandles[entryIdx].time);

      if (params.maxZoneAgeDays !== undefined) {
        const ageDays = (entryTimeSec - lookAfterTime) / 86400;
        if (ageDays < 0 || ageDays > params.maxZoneAgeDays) continue;
      }

      if (params.avoidHighVolumeEntry) {
        const mult = volumeMultipleAt(entryCandles, entryIdx, params.entryVolumeLookback ?? 20);
        if (mult !== null && mult >= (params.entryVolumeMaxMultiple ?? 2.0)) continue;
      }

      const targetWidths = params.brokenTargetZoneWidths ?? 1.0;
      const stopWidths = params.brokenStopZoneWidths ?? 1.0;
      const stopRiskPct = zoneWidth * stopWidths / entryPrice * 100;
      if (!Number.isFinite(stopRiskPct) || stopRiskPct <= 0) continue;
      if (params.maxZoneRiskPct !== undefined && stopRiskPct > params.maxZoneRiskPct) continue;

      const dir = tradeType === 'bull' ? 1 : -1;
      const tpPrice = entryPrice + dir * zoneWidth * targetWidths;
      const sl1Price = entryPrice - dir * zoneWidth * stopWidths;
      if (tpPrice <= 0 || sl1Price <= 0) continue;
      const tpPnlPct = Math.abs((tpPrice - entryPrice) / entryPrice * 100);
      const sl1PnlPct = -stopRiskPct;

      let obIdxAtEntry = -1;
      for (let oi = obCandles.length - 1; oi >= 0; oi--) {
        if (toSec(obCandles[oi].time) <= entryTimeSec) { obIdxAtEntry = oi; break; }
      }
      const maEntry = {
        obTf:    obIdxAtEntry >= 0 ? calcMASnapshot(obCandles, obIdxAtEntry, entryPrice) : null,
        entryTf: calcMASnapshot(entryCandles, entryIdx, entryPrice),
      };

      let outcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' = 'timeout';
      let exitIdx = entryIdx;
      let rawPnlPct = 0;
      let exitPrice = entryCandles[entryIdx].close;

      for (let i = entryIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (tradeType === 'bull') {
          if (c.low <= sl1Price) {
            outcome = 'sl1'; rawPnlPct = sl1PnlPct; exitIdx = i; exitPrice = sl1Price; break;
          }
          if (c.high >= tpPrice) {
            outcome = 'tp'; rawPnlPct = tpPnlPct; exitIdx = i; exitPrice = tpPrice; break;
          }
        } else {
          if (c.high >= sl1Price) {
            outcome = 'sl1'; rawPnlPct = sl1PnlPct; exitIdx = i; exitPrice = sl1Price; break;
          }
          if (c.low <= tpPrice) {
            outcome = 'tp'; rawPnlPct = tpPnlPct; exitIdx = i; exitPrice = tpPrice; break;
          }
        }

        if (params.brokenStopOnReclaimClose ?? true) {
          if (brokenReclaimClose(ob, c)) {
            outcome = 'sl2';
            rawPnlPct = dir * (c.close - entryPrice) / entryPrice * 100;
            exitIdx = i;
            exitPrice = c.close;
            break;
          }
        }

        if (i >= entryIdx + params.maxHoldCandles) {
          outcome = 'timeout';
          rawPnlPct = dir * (c.close - entryPrice) / entryPrice * 100;
          exitIdx = i;
          exitPrice = c.close;
          break;
        }
      }

      rawPnlPct -= tradeCostPct(params, 2, entryTimeSec, toSec(entryCandles[exitIdx].time));
      trades.push({
        entryTime: entryTimeSec,
        exitTime: toSec(entryCandles[exitIdx].time),
        entryPrice,
        exitPrice,
        capitalPnl: rawPnlPct * params.leverage * (effPosPct / 100),
        outcome,
        obType: tradeType,
        maEntry,
      });
      continue;
    }

    // ── EQ 전략 (독립 경로) ──────────────────────────────
    // OB mid 첫 터치 시 즉시 mid 시장가 진입 (트리거/다음캔들 대기 없음)
    // 손절: 진입캔들 포함 EQ 박스 종가 이탈 or -slPercent%
    if (params.useEqStrategy) {
      const isBull = ob.type === 'bull';
      const eqLow  = ob.low * Math.pow(ob.high / ob.low, 0.382);
      const eqHigh = ob.low * Math.pow(ob.high / ob.low, 0.618);
      const mid    = ob.mid;

      // 진입: OB mid에 처음 닿는 캔들에서 즉시 mid 진입
      let entryIdx = -1;
      for (let i = firstIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (candleContainsPrice(c, mid)) { entryIdx = i; break; }
      }
      if (entryIdx < 0) { dbgNoEntry++; continue; }
      const entryPrice = mid;

      // 진입 시점 MA 스냅샷
      const entryTimeSec = toSec(entryCandles[entryIdx].time);
      let obIdxAtEntry = -1;
      for (let oi = obCandles.length - 1; oi >= 0; oi--) {
        if (toSec(obCandles[oi].time) <= entryTimeSec) { obIdxAtEntry = oi; break; }
      }
      const maEntry = {
        obTf:    obIdxAtEntry >= 0 ? calcMASnapshot(obCandles, obIdxAtEntry, mid) : null,
        entryTf: calcMASnapshot(entryCandles, entryIdx, mid),
      };

      const sl1Price = isBull ? entryPrice * (1 - params.slPercent / 100) : entryPrice * (1 + params.slPercent / 100);
      const tpPrice  = isBull ? entryPrice * (1 + params.tpPercent / 100) : entryPrice * (1 - params.tpPercent / 100);

      let outcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' = 'timeout';
      let exitIdx = entryIdx;
      let rawPnlPct = 0;

      // 진입 캔들은 종가 기준(SL2)만, TP/SL1 장중평가는 다음 캔들부터
      for (let i = entryIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (isBull) {
          if (c.low <= sl1Price) { outcome = 'sl1'; rawPnlPct = -params.slPercent; exitIdx = i; break; }
          if (i > entryIdx && c.high >= tpPrice) { outcome = 'tp'; rawPnlPct = +params.tpPercent; exitIdx = i; break; }
          // SL2: EQ 박스 하단 종가 이탈
          if (c.close < eqLow) { outcome = 'sl2'; rawPnlPct = (c.close - entryPrice) / entryPrice * 100; exitIdx = i; break; }
        } else {
          if (c.high >= sl1Price) { outcome = 'sl1'; rawPnlPct = -params.slPercent; exitIdx = i; break; }
          if (i > entryIdx && c.low <= tpPrice) { outcome = 'tp'; rawPnlPct = +params.tpPercent; exitIdx = i; break; }
          // SL2: EQ 박스 상단 종가 이탈
          if (c.close > eqHigh) { outcome = 'sl2'; rawPnlPct = -(c.close - entryPrice) / entryPrice * 100; exitIdx = i; break; }
        }
        if (i >= entryIdx + params.maxHoldCandles) {
          outcome = 'timeout';
          rawPnlPct = (isBull ? 1 : -1) * (c.close - entryPrice) / entryPrice * 100;
          exitIdx = i; break;
        }
      }

      rawPnlPct -= tradeCostPct(params, 2, toSec(entryCandles[entryIdx].time), toSec(entryCandles[exitIdx].time));

      trades.push({
        entryTime:  toSec(entryCandles[entryIdx].time),
        exitTime:   toSec(entryCandles[exitIdx].time),
        entryPrice,
        exitPrice:  outcome === 'tp' ? tpPrice : outcome === 'sl1' ? sl1Price : entryCandles[exitIdx].close,
        capitalPnl: rawPnlPct * params.leverage * (effPosPct / 100),
        outcome,
        obType: ob.type,
        maEntry,
      });
      continue;
    }

    // BB 온리 모드 (원본 OB인 경우)
    if (params.useBbStrategy && !ob.bbStartTime) {
      let boIdx = -1;
      for (let i = firstIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (ob.type === 'bull' && c.close < ob.low) { boIdx = i; break; }
        if (ob.type === 'bear' && c.close > ob.high) { boIdx = i; break; }
      }
      if (boIdx >= 0 && boIdx + 1 < entryCandles.length) {
        obs.push({ ...ob, type: ob.type === 'bull' ? 'bear' : 'bull', bbStartTime: toSec(entryCandles[boIdx + 1].time) });
      }
      continue; // 원본 OB 매매는 건너뜀
    }

    // 첫 터치 캔들 탐색
    let signalIdx = -1;
    let breakoutIdx = -1;
    let entryIdx = -1;
    let entryPrice = ob.mid;

    if (params.entryOnFirstTouch) {
      // 신호 마감 대기 없이 OB 지정 레벨 첫 터치 즉시 진입
      const obEntryPrice = obEntryPriceForLevel(ob, effectiveType, params.obEntryLevel ?? 'mid');
      for (let i = firstIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (effectiveType === 'bull') {
          if (candleContainsPrice(c, obEntryPrice)) { signalIdx = i; entryIdx = i; entryPrice = obEntryPrice; break; }
        } else {
          if (candleContainsPrice(c, obEntryPrice)) { signalIdx = i; entryIdx = i; entryPrice = obEntryPrice; break; }
        }
      }
    } else if (params.useFvgStrategy && (params.fvgEntryAtBorder || params.fvgEntryAtLow)) {
      for (let i = firstIdx; i < entryCandles.length; i++) {
        const c = entryCandles[i];
        if (effectiveType === 'bull') {
          const entryThresh = params.fvgEntryAtLow ? ob.low : ob.high;
          if (candleContainsPrice(c, entryThresh)) {
            signalIdx = i; entryIdx = i; entryPrice = entryThresh; break;
          }
        } else {
          const entryThresh = params.fvgEntryAtLow ? ob.high : ob.low;
          if (candleContainsPrice(c, entryThresh)) {
            signalIdx = i; entryIdx = i; entryPrice = entryThresh; break;
          }
        }
      }
    } else {
      for (let i = firstIdx; i < entryCandles.length; i++) {
        const type = classifyCandle(ob, entryCandles[i]);
        if (type !== 'no_touch') {
          dbgSignalTypes[type] = (dbgSignalTypes[type] ?? 0) + 1;
          if (type === signalType) signalIdx = i;
          else if (type === 'breakout') breakoutIdx = i;
          break; // 첫 터치만 체크
        }
      }
    }
    if (signalIdx < 0) { 
      dbgWrongSignal++; continue; 
    }

    // closeDepth 필터: 신호 종가가 mid에서 (high-mid)*depth 이내여야 함
    if (params.closeDepth < 1.0) {
      const sc = entryCandles[signalIdx];
      if (effectiveType === 'bull') {
        const maxClose = ob.mid + (ob.high - ob.mid) * params.closeDepth;
        if (sc.close > maxClose) { dbgWrongSignal++; continue; }
      } else {
        const minClose = ob.mid - (ob.mid - ob.low) * params.closeDepth;
        if (sc.close < minClose) { dbgWrongSignal++; continue; }
      }
    }

    // 신호 다음 캔들부터 maxWaitCandles 내에 진입 탐색 (이미 entryIdx가 구해지지 않은 경우에만)
    if (entryIdx < 0) {
      if (params.switchAfterSL) {
      // 스위칭(SL2이탈 후): effectiveType 방향으로 close 이탈 캔들 탐색
      let sl2TrigIdx = -1;
      const sl2End = Math.min(signalIdx + 1 + params.maxWaitCandles, entryCandles.length);
      for (let i = signalIdx + 1; i < sl2End; i++) {
        const c = entryCandles[i];
        if (effectiveType === 'bull' && c.close < ob.mid) { sl2TrigIdx = i; break; }
        if (effectiveType === 'bear' && c.close > ob.mid) { sl2TrigIdx = i; break; }
      }
      if (sl2TrigIdx >= 0) {
        // 이탈 이후 반대 방향 mid 터치 대기 (maxWaitCandles 내)
        const swType = effectiveType === 'bull' ? 'bear' : 'bull';
        const swEnd = Math.min(sl2TrigIdx + 1 + params.maxWaitCandles, entryCandles.length);
        for (let i = sl2TrigIdx + 1; i < swEnd; i++) {
          const c = entryCandles[i];
          if (candleContainsPrice(c, ob.mid)) { entryIdx = i; break; }
        }
      }
    } else if (params.volumeTrigger) {
      // 거래량 트리거 모드: OB존 내 거래량 급등 캔들 → 다음 캔들 mid 터치 시 진입
      const scanEnd = Math.min(signalIdx + 1 + params.maxWaitCandles, entryCandles.length - 1);
      for (let i = signalIdx + 1; i < scanEnd; i++) {
        const c = entryCandles[i];
        // OB 존 내부 캔들인지 확인 (wick 기준 overlap)
        if (c.low > ob.high || c.high < ob.low) continue;
        // 거래량 체크: 직전 N캔들 평균 대비
        if (i < params.volumeLookback) continue;
        let avgVol = 0;
        for (let k = i - params.volumeLookback; k < i; k++) avgVol += entryCandles[k].volume;
        avgVol /= params.volumeLookback;
        if (c.volume < avgVol * params.volumeMultiplier) continue;
        // 공통: 종가가 mid를 깨면 안 됨 (bull=close>=mid, bear=close<=mid)
        if (effectiveType === 'bull' && c.close < ob.mid) continue;
        if (effectiveType === 'bear' && c.close > ob.mid) continue;
        // B (전략5): 추가로 방향성 캔들이어야 함 (bull=양봉, bear=음봉)
        if (params.volumeTriggerBullish) {
          if (effectiveType === 'bull' && c.close < c.open) continue;
          if (effectiveType === 'bear' && c.close > c.open) continue;
        }
        // Wick (전략6): wick이 ob.mid에 닿아야 함 (bull=low<=mid, bear=high>=mid)
        if (params.volumeTriggerWick) {
          if (effectiveType === 'bull' && c.low > ob.mid) continue;
          if (effectiveType === 'bear' && c.high < ob.mid) continue;
        }
        // 거래량 급등 캔들 발견 → 다음 캔들에서 ob.mid 터치 확인
        const next = entryCandles[i + 1];
        if (candleContainsPrice(next, ob.mid)) { entryIdx = i + 1; break; }
        break; // 다음 캔들 mid 미터치 → 포기
      }
    } else {
      // 기본 모드: mid 풀백 대기
      const searchEnd = Math.min(signalIdx + 1 + params.maxWaitCandles, entryCandles.length);
      for (let i = signalIdx + 1; i < searchEnd; i++) {
        const c = entryCandles[i];
        if (effectiveType === 'bull') {
          const entryThresh = params.fvgEntryAtLowAfterSignal ? ob.low : ob.mid;
          if (candleContainsPrice(c, entryThresh)) { entryIdx = i; entryPrice = entryThresh; break; }
        } else {
          const entryThresh = params.fvgEntryAtLowAfterSignal ? ob.high : ob.mid;
          if (candleContainsPrice(c, entryThresh)) { entryIdx = i; entryPrice = entryThresh; break; }
        }
      }
      }
    }

    if (entryIdx < 0) { dbgNoEntry++; continue; }

    // 실제 트레이드 방향 (switchAfterSL이면 effectiveType 반전)
    const tradeType: 'bull' | 'bear' = params.switchAfterSL
      ? (effectiveType === 'bull' ? 'bear' : 'bull')
      : effectiveType;

    const entryTimeSec = toSec(entryCandles[entryIdx].time);
    if (params.maxZoneAgeDays !== undefined) {
      const ageDays = (entryTimeSec - lookAfterTime) / 86400;
      if (ageDays < 0 || ageDays > params.maxZoneAgeDays) continue;
    }

    if (params.avoidHighVolumeEntry) {
      const mult = volumeMultipleAt(entryCandles, entryIdx, params.entryVolumeLookback ?? 20);
      if (mult !== null && mult >= (params.entryVolumeMaxMultiple ?? 2.0)) continue;
    }

    // 진입 시점 MA 스냅샷
    let obIdxAtEntry = -1;
    for (let oi = obCandles.length - 1; oi >= 0; oi--) {
      if (toSec(obCandles[oi].time) <= entryTimeSec) { obIdxAtEntry = oi; break; }
    }
    const maEntry = {
      obTf:    obIdxAtEntry >= 0 ? calcMASnapshot(obCandles, obIdxAtEntry, ob.mid) : null,
      entryTf: calcMASnapshot(entryCandles, entryIdx, ob.mid),
    };

    // ── 신규 3대 필터 적용 ──
    // 1. 데이터 부족 필터
    if (params.useDataFilter && maEntry.obTf === null) continue;

    // 2. 역배열 BULL 필터 (BULL 진입 시 1D가 역배열이면 진입 금지)
    if (params.filterReverseBull1d && tradeType === 'bull' && maEntry.obTf?.alignment === '역배열') continue;

    // 3. MA20 위 BEAR 필터 (BEAR 진입 시 가격이 1D MA20 위에 있으면 진입 금지)
    if (params.filterPriceAboveMa20Bear1d && tradeType === 'bear' && maEntry.obTf && maEntry.obTf.priceAbove.ma20) continue;

    // 4. MA 5/20 이평선 필터 (OB TF, 진입 TF 모두 확인)
    if (params.filterMa5Ma20) {
      if (!maEntry.obTf || !maEntry.entryTf) continue;
      if (tradeType === 'bull') {
        if (maEntry.obTf.ma5 <= maEntry.obTf.ma20 || maEntry.entryTf.ma5 <= maEntry.entryTf.ma20) continue;
      } else {
        if (maEntry.obTf.ma5 >= maEntry.obTf.ma20 || maEntry.entryTf.ma5 >= maEntry.entryTf.ma20) continue;
      }
    }

    // 5. MA240 박스 내부 필터 (진입 TF 기준)
    if (params.filterMa240InBox) {
      if (!maEntry.entryTf) continue;
      // 240일선이 OB 박스(low ~ high) 내부에 존재하지 않으면 진입 금지
      if (maEntry.entryTf.ma240 < ob.low || maEntry.entryTf.ma240 > ob.high) continue;
    }

    // 6. RSI 역매매 필터 (진입 TF 기준)
    if (params.filterRsi) {
      if (!maEntry.entryTf) continue;
      if (tradeType === 'bull' && maEntry.entryTf.rsi > 35) continue; // 롱일 때 35 이하가 아니면 스킵
      if (tradeType === 'bear' && maEntry.entryTf.rsi < 65) continue; // 숏일 때 65 이상이 아니면 스킵
    }

    // 7. 진입 TF 20일선 역추세 진입 금지 필터
    if (params.filterEntryMa20 && maEntry.entryTf) {
      if (tradeType === 'bull' && !maEntry.entryTf.priceAbove.ma20) continue;
      if (tradeType === 'bear' && maEntry.entryTf.priceAbove.ma20) continue;
    }

    // 4H 혼합 구간 필터
    if (params.filterMixed4h && maEntry.entryTf?.alignment === '혼합') continue;

    // 청산 조건: SL1(경성) → TP → SL2(종가이탈) 순서 체크.
    // EQ 연구 후보는 SL=존 반대편 끝, TP=위험폭의 R배수로 검증한다.
    const useZoneRiskReward = Boolean(params.useZoneRiskReward);
    const targetR = params.targetR ?? 2.0;
    const zoneStopFrac = params.zoneStopToMidFrac;
    const hasZoneStopFrac = typeof zoneStopFrac === 'number' && Number.isFinite(zoneStopFrac);
    const zoneStopPrice = hasZoneStopFrac
      ? entryPrice + (ob.mid - entryPrice) * Math.min(Math.max(zoneStopFrac, 0), 1)
      : params.zoneStopAtMid
        ? ob.mid                                        // CE(mid) 손절 — 타이트
        : (tradeType === 'bull' ? ob.low : ob.high);    // 존 반대편 끝(기본)
    const zoneRiskPct = Math.abs((entryPrice - zoneStopPrice) / entryPrice * 100);
    if (useZoneRiskReward && (!Number.isFinite(zoneRiskPct) || zoneRiskPct <= 0)) continue;
    if (params.maxZoneRiskPct !== undefined && zoneRiskPct > params.maxZoneRiskPct) continue;

    const sl1Price = useZoneRiskReward
      ? zoneStopPrice
      : params.slAtDeepBorder
        ? (tradeType === 'bull' ? ob.low : ob.high)
        : (tradeType === 'bull' ? entryPrice * (1 - params.slPercent / 100) : entryPrice * (1 + params.slPercent / 100));
    const sl1PnlPct = useZoneRiskReward ? -zoneRiskPct : -params.slPercent;

    const tpPnlPct = useZoneRiskReward ? zoneRiskPct * targetR : params.tpPercent;
    const tpPrice = tradeType === 'bull'
      ? entryPrice * (1 + tpPnlPct / 100)
      : entryPrice * (1 - tpPnlPct / 100);

    let outcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' = 'timeout';
    let exitIdx = entryIdx;
    let rawPnlPct = 0;
    let sl2ExitPrice: number | null = null;  // SL2 obTf 모드일 때 ob 종가 저장
    let lastObIdxSL2 = obIdxAtEntry - 1;     // SL2 obTf: 마지막으로 체크한 ob 캔들 인덱스
    let acceptanceCount = 0;

    // 진입 캔들(entryIdx)은 장중 진입이므로 고가/저가 기준의 TP/SL1 평가는 생략하고, 종가 기준인 SL2/SL3만 평가합니다.
    for (let i = entryIdx; i < entryCandles.length; i++) {
      const c = entryCandles[i];

      // SL1은 진입 캔들부터 평가(보수적 접근), TP는 진입 캔들 이후부터 평가
      if (tradeType === 'bull') {
        if (c.low  <= sl1Price) { outcome = 'sl1'; rawPnlPct = sl1PnlPct; exitIdx = i; break; }
        if (i > entryIdx && c.high >= tpPrice) { outcome = 'tp'; rawPnlPct = tpPnlPct; exitIdx = i; break; }
      } else {
        if (c.high >= sl1Price) { outcome = 'sl1'; rawPnlPct = sl1PnlPct; exitIdx = i; break; }
        if (i > entryIdx && c.low  <= tpPrice) { outcome = 'tp'; rawPnlPct = tpPnlPct; exitIdx = i; break; }
      }

      if ((params.acceptanceStopBars ?? 0) > 0) {
        const acceptedAgainst = tradeType === 'bull' ? c.close < ob.mid : c.close > ob.mid;
        acceptanceCount = acceptedAgainst ? acceptanceCount + 1 : 0;
        if (acceptanceCount >= (params.acceptanceStopBars ?? 0)) {
          outcome = 'sl2';
          rawPnlPct = (tradeType === 'bull' ? 1 : -1) * (c.close - entryPrice) / entryPrice * 100;
          sl2ExitPrice = c.close;
          exitIdx = i;
          break;
        }
      }

      // SL2: 선택한 TF 종가 기준 이탈
      if (!params.slAtDeepBorder && !useZoneRiskReward) {
        if (params.sl2Tf === 'obTf' && obIdxAtEntry >= 0) {
        // OB TF 봉이 새로 닫힐 때마다 체크
        const cTime = toSec(c.time);
        let sl2Hit = false;
        for (let oi = lastObIdxSL2 + 1; oi < obCandles.length - 1; oi++) {
          if (toSec(obCandles[oi + 1].time) > cTime) break; // 아직 닫히지 않은 봉
          lastObIdxSL2 = oi;
          const obClose = obCandles[oi].close;
          
          const sl2ThreshBull = params.sl2Threshold === 'border' ? ob.low : ob.mid;
          const sl2ThreshBear = params.sl2Threshold === 'border' ? ob.high : ob.mid;

          if (tradeType === 'bull' && obClose < sl2ThreshBull) {
            outcome = 'sl2'; rawPnlPct = (obClose - entryPrice) / entryPrice * 100;
            sl2ExitPrice = obClose; exitIdx = i; sl2Hit = true; break;
          }
          if (tradeType === 'bear' && obClose > sl2ThreshBear) {
            outcome = 'sl2'; rawPnlPct = -(obClose - entryPrice) / entryPrice * 100;
            sl2ExitPrice = obClose; exitIdx = i; sl2Hit = true; break;
          }
        }
        if (sl2Hit) break;
      } else {
        // 진입 TF 종가 기준 (기본값)
        const sl2ThreshBull = params.sl2Threshold === 'border' ? ob.low : ob.mid;
        const sl2ThreshBear = params.sl2Threshold === 'border' ? ob.high : ob.mid;
        
        if (tradeType === 'bull' && c.close < sl2ThreshBull) { outcome = 'sl2'; rawPnlPct = (c.close - entryPrice) / entryPrice * 100; exitIdx = i; break; }
        if (tradeType === 'bear' && c.close > sl2ThreshBear) { outcome = 'sl2'; rawPnlPct = -(c.close - entryPrice) / entryPrice * 100; exitIdx = i; break; }
        }
      }

      // SL3: 진입 TF OB 완전 이탈마감 시 (종가 기준)
      if (params.useSl3 && !params.slAtDeepBorder && !useZoneRiskReward) {
        if (tradeType === 'bull' && c.close < ob.low) {
          outcome = 'sl3'; rawPnlPct = (c.close - entryPrice) / entryPrice * 100; exitIdx = i; 
          if (params.useBbStrategy) obs.push({ ...ob, type: 'bear', bbStartTime: toSec(c.time) });
          break;
        }
        if (tradeType === 'bear' && c.close > ob.high) {
          outcome = 'sl3'; rawPnlPct = -(c.close - entryPrice) / entryPrice * 100; exitIdx = i; 
          if (params.useBbStrategy) obs.push({ ...ob, type: 'bull', bbStartTime: toSec(c.time) });
          break;
        }
      }

      if (i >= entryIdx + params.maxHoldCandles) {
        outcome = 'timeout';
        const dir = tradeType === 'bull' ? 1 : -1;
        rawPnlPct = dir * (c.close - entryPrice) / entryPrice * 100;
        exitIdx = i;
        break;
      }
    }

    rawPnlPct -= tradeCostPct(params, 2, toSec(entryCandles[entryIdx].time), toSec(entryCandles[exitIdx].time));
    const capitalPnl = rawPnlPct * params.leverage * (effPosPct / 100);

    trades.push({
      entryTime:  toSec(entryCandles[entryIdx].time),
      exitTime:   toSec(entryCandles[exitIdx].time),
      entryPrice: entryPrice,
      exitPrice:  outcome === 'tp' ? tpPrice : outcome === 'sl1' ? sl1Price : sl2ExitPrice ?? entryCandles[exitIdx].close,
      capitalPnl,
      outcome,
      obType: tradeType,
      maEntry,
    });

    // combinedSwitch: 1번 롱 + 8번 숏을 같은 OB에서 독립적으로 실행
    if (params.combinedSwitch) {
      const swType: 'bull' | 'bear' = tradeType === 'bull' ? 'bear' : 'bull';

      // 8번과 동일: signalIdx 이후 close < mid 트리거 탐색 (독립적, 롱 결과 무관)
      let swSl2TrigIdx = -1;
      const swTrigEnd = Math.min(signalIdx + 1 + params.swMaxWaitCandles, entryCandles.length);
      for (let i = signalIdx + 1; i < swTrigEnd; i++) {
        const c = entryCandles[i];
        if (tradeType === 'bull' && c.close < ob.mid) { swSl2TrigIdx = i; break; }
        if (tradeType === 'bear' && c.close > ob.mid) { swSl2TrigIdx = i; break; }
      }

      // 트리거 이후 반대 방향 mid 터치 대기 (swMaxWaitCandles 내)
      let swEntryIdx = -1;
      if (swSl2TrigIdx >= 0) {
        const swSearchEnd = Math.min(swSl2TrigIdx + 1 + params.swMaxWaitCandles, entryCandles.length);
        for (let i = swSl2TrigIdx + 1; i < swSearchEnd; i++) {
          const c = entryCandles[i];
          if (candleContainsPrice(c, ob.mid)) { swEntryIdx = i; break; }
        }
      }

      if (swEntryIdx >= 0) {
        const swSl1 = params.slAtDeepBorder
          ? (swType === 'bull' ? ob.low : ob.high)
          : (swType === 'bull' ? ob.mid * (1 - params.swSlPercent / 100) : ob.mid * (1 + params.swSlPercent / 100));
          
        const swTp = swType === 'bull'
          ? ob.mid * (1 + params.swTpPercent / 100)
          : ob.mid * (1 - params.swTpPercent / 100);

        let swOutcome: 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' = 'timeout';
        let swExitIdx = swEntryIdx;
        let swRawPnl = 0;
        let swSl2Price: number | null = null;
        let swLastObIdx = lastObIdxSL2;

        // 진입 캔들(swEntryIdx)은 장중 진입이므로 고가/저가 기준의 TP/SL1 평가는 생략하고, 종가 기준인 SL2/SL3만 평가합니다.
        for (let i = swEntryIdx; i < entryCandles.length; i++) {
          const c = entryCandles[i];

          // SL1은 진입 캔들부터 평가, TP는 진입 캔들 이후부터 평가
          if (swType === 'bull') {
            if (c.low  <= swSl1) { swOutcome = 'sl1'; swRawPnl = -params.swSlPercent; swExitIdx = i; break; }
            if (i > swEntryIdx && c.high >= swTp) { swOutcome = 'tp'; swRawPnl = +params.swTpPercent; swExitIdx = i; break; }
          } else {
            if (c.high >= swSl1) { swOutcome = 'sl1'; swRawPnl = -params.swSlPercent; swExitIdx = i; break; }
            if (i > swEntryIdx && c.low  <= swTp) { swOutcome = 'tp'; swRawPnl = +params.swTpPercent; swExitIdx = i; break; }
          }

          if (!params.slAtDeepBorder) {
            if (params.sl2Tf === 'obTf' && obIdxAtEntry >= 0) {
            const cTime = toSec(c.time);
            let sl2Hit = false;
            for (let oi = swLastObIdx + 1; oi < obCandles.length - 1; oi++) {
              if (toSec(obCandles[oi + 1].time) > cTime) break;
              swLastObIdx = oi;
              const obClose = obCandles[oi].close;
              if (swType === 'bull' && obClose < ob.mid) {
                swOutcome = 'sl2'; swRawPnl = -(ob.mid - obClose) / ob.mid * 100;
                swSl2Price = obClose; swExitIdx = i; sl2Hit = true; break;
              }
              if (swType === 'bear' && obClose > ob.mid) {
                swOutcome = 'sl2'; swRawPnl = -(obClose - ob.mid) / ob.mid * 100;
                swSl2Price = obClose; swExitIdx = i; sl2Hit = true; break;
              }
            }
            if (sl2Hit) break;
          } else {
              if (swType === 'bull' && c.close < ob.mid) { swOutcome = 'sl2'; swRawPnl = -(ob.mid - c.close) / ob.mid * 100; swExitIdx = i; break; }
              if (swType === 'bear' && c.close > ob.mid) { swOutcome = 'sl2'; swRawPnl = -(c.close - ob.mid) / ob.mid * 100; swExitIdx = i; break; }
            }
          }

          // SL3: 진입 TF OB 완전 이탈마감 시 (종가 기준)
          if (params.useSl3 && !params.slAtDeepBorder) {
            if (swType === 'bull' && c.close < ob.low) {
              swOutcome = 'sl3'; swRawPnl = -(ob.mid - c.close) / ob.mid * 100; swExitIdx = i;
              if (params.useBbStrategy) obs.push({ ...ob, type: 'bear', bbStartTime: toSec(c.time) });
              break;
            }
            if (swType === 'bear' && c.close > ob.high) {
              swOutcome = 'sl3'; swRawPnl = -(c.close - ob.mid) / ob.mid * 100; swExitIdx = i;
              if (params.useBbStrategy) obs.push({ ...ob, type: 'bull', bbStartTime: toSec(c.time) });
              break;
            }
          }

          if (i >= swEntryIdx + params.maxHoldCandles) {
            swOutcome = 'timeout';
            swRawPnl = (swType === 'bull' ? 1 : -1) * (c.close - ob.mid) / ob.mid * 100;
            swExitIdx = i; break;
          }
        }

        swRawPnl -= tradeCostPct(params, 2, toSec(entryCandles[swEntryIdx].time), toSec(entryCandles[swExitIdx].time));

        trades.push({
          entryTime:  toSec(entryCandles[swEntryIdx].time),
          exitTime:   toSec(entryCandles[swExitIdx].time),
          entryPrice: ob.mid,
          exitPrice:  swSl2Price ?? entryCandles[swExitIdx].close,
          capitalPnl: swRawPnl * params.leverage * (params.positionPct / 100),
          outcome:    swOutcome,
          obType:     swType,
          maEntry,
        });
      }
    }
  }

  trades.sort((a, b) => a.entryTime - b.entryTime);

  // ── DEBUG 출력 ──────────────────────────────────────────
  console.log(`[${symbol}] OB:${obs.length} obCandles:${obCandles.length} entryCandles:${entryCandles.length}`);
  console.log(`  noIdx:${dbgNoIdx} noFirst:${dbgNoFirst} wrongSignal:${dbgWrongSignal} noEntry:${dbgNoEntry} trades:${trades.length}`);
  console.log(`  firstTouchTypes:`, dbgSignalTypes);

  const fmt = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');
  trades.slice(0, 3).forEach((t, i) => {
    console.log(`  [trade ${i + 1}] ${t.obType.toUpperCase()} | ${t.outcome.toUpperCase()}`
      + ` | 진입 ${fmt(t.entryTime)} @ ${t.entryPrice.toFixed(2)}`
      + ` | 청산 ${fmt(t.exitTime)} @ ${t.exitPrice.toFixed(2)}`
      + ` | PnL ${t.capitalPnl >= 0 ? '+' : ''}${t.capitalPnl.toFixed(2)}%`);
  });
  // ───────────────────────────────────────────────────────

  const n         = trades.length;
  const wins      = trades.filter(t => t.outcome === 'tp').length;
  const sl1Count  = trades.filter(t => t.outcome === 'sl1').length;
  const sl2Count  = trades.filter(t => t.outcome === 'sl2').length;
  const sl3Count  = trades.filter(t => t.outcome === 'sl3').length;
  const winRate   = n > 0 ? +((wins / n) * 100).toFixed(1) : 0;
  const ev        = n > 0 ? +(trades.reduce((s, t) => s + t.capitalPnl, 0) / n).toFixed(3) : 0;

  let balance = initialCapital;
  let peak    = initialCapital;
  let mdd     = 0;
  let loseStreak = 0;
  let maxLoseStreak = 0;
  let hit10kCount = 0;

  for (const t of trades) {
    const capitalBase = params.capitalMode === 'compound' ? balance : initialCapital;
    t.balanceBefore = +capitalBase.toFixed(2);
    t.capitalDelta = +(capitalBase * (t.capitalPnl / 100)).toFixed(2);
    if (t.tp1RealizedCapitalPnl !== undefined) {
      t.tp1RealizedDelta = +(capitalBase * (t.tp1RealizedCapitalPnl / 100)).toFixed(2);
    }
    if (t.remainderCapitalPnl !== undefined) {
      t.remainderDelta = +(capitalBase * (t.remainderCapitalPnl / 100)).toFixed(2);
    }
    balance += t.capitalDelta;
    t.balanceAfter = +(capitalBase + t.capitalDelta).toFixed(2);
    
    if (balance >= 10000) {
      hit10kCount++;
      balance = initialCapital;
      peak = initialCapital;
    }

    if (balance > peak) peak = balance;
    const dd = ((peak - balance) / peak) * 100;
    if (dd > mdd) mdd = dd;
    if (t.outcome === 'tp') { loseStreak = 0; }
    else { loseStreak++; if (loseStreak > maxLoseStreak) maxLoseStreak = loseStreak; }
  }

  return {
    symbol, trades, n, winRate, ev,
    finalBalance: +balance.toFixed(2),
    mdd: +mdd.toFixed(1),
    maxLoseStreak,
    hit10kCount,
    sl1Count,
    sl2Count,
    sl3Count,
    tpDepths: trades.filter(t => t.outcome === 'tp').map(t => t.maxDepthRatio ?? 0),
    cancelledDepths: trades.filter(t => t.outcome === 'missed').map(t => t.maxDepthRatio ?? 0)
  };
}
