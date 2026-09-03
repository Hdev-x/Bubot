/**
 * 전략 설정 스키마 — 공유 엔진 (단일 소스)
 *
 * 원칙: "전략 = 코드가 아니라 설정(JSON)". 이 스키마 하나로
 *   차트 관찰 → 백테스트 → 실전 워커 가동까지 같은 설정 객체가 흘러간다.
 *
 * ⚠️ 직렬화 가능해야 한다 (DB trade_configs.params, 실험 이력 저장, API 전달).
 *    함수·클래스 인스턴스 금지, 순수 JSON 값만.
 */

export const STRATEGY_SCHEMA_VERSION = 1;

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

/** 신호를 만드는 감지기 종류 (shared/ 감지기와 1:1 대응) */
export type StrategyKind = 'HARMONIC' | 'ABCD' | 'OB' | 'FVG' | 'BB';

/** 하모닉 10종 패턴 이름 (harmonicEnabledPatterns 후보값) */
export const HARMONIC_PATTERN_NAMES = [
  'Gartley', 'Deep Gartley', 'Bat', 'Alt Bat', 'Butterfly',
  'Crab', 'Deep Crab', 'Cypher', 'Shark', '5-0',
] as const;
export type HarmonicPatternName = typeof HARMONIC_PATTERN_NAMES[number];

// ─────────────────────────────────────────────
// 공통 블록
// ─────────────────────────────────────────────

/** 리스크·사이징 — 실전 워커와 백테스트 비용 모델이 함께 사용 */
export interface RiskConfig {
  investUsdt: number;   // 1회 진입 증거금 (USDT)
  leverage: number;
  maxLossPct: number;   // 누적 손실 한도 % (0 = 무제한). 판정은 Spring(DB)에서 수행
  capitalMode?: 'fixed' | 'compound'; // 백테스트 자금 모드 (fixed=investUsdt 고정, compound=잔고 비율)
  positionPct?: number; // compound 모드일 때 잔고 대비 진입 비율 %
  initialCapital?: number; // 백테스트 시작 자산 (실전에선 무시)
}

/** 비용 모델 — 백테스트 손익 차감용 (가격% 공간, 레버리지 곱하기 전) */
export interface CostConfig {
  feePct: number;          // 체결(fill)당 수수료 %
  slippagePct: number;     // 체결당 슬리피지 %
  fundingPctPer8h: number; // 8시간당 펀딩비 % (보유시간 비례)
}

/** 진입·청산 실행 규칙 — 감지기와 무관한 주문 실행 계층 */
export interface ExecutionConfig {
  entryMode: 'immediate' | 'close'; // 신호(arming) 트리거: PRZ터치 즉시 / 존안 종가
  longOnly: boolean;
  tp1Pct: number;                   // TP1 도달 시 익절 비율 % (기본 50)
  tp2Pct: number;                   // TP2 도달 시 익절 비율 % (나머지)
  moveStopToBreakeven: boolean;     // TP1 후 잔여 SL을 진입가로
  slCapPct: number;                 // 가격 손절 하드캡 % (패턴 SL이 더 가까우면 패턴 SL)
  maxWaitCandles: number;           // 신호 후 진입 대기 한도 (entry TF 캔들 수)
  maxHoldCandles: number;           // 진입 후 보유 한도 (entry TF 캔들 수)
  tpPricePct?: number;              // OB 계열 가격 기준 TP % (하모닉/ABCD는 패턴 TP 사용)
  slPricePct?: number;              // OB 계열 가격 기준 SL %
  useZoneRiskReward?: boolean;      // OB/FVG: SL=존 반대편 끝, TP=targetR
  targetR?: number;                 // useZoneRiskReward일 때 목표 R 배수
  maxZoneAgeDays?: number;          // 존 확정 후 첫 진입까지 허용 일수
  useConfirmTimeEntry?: boolean;    // shared confirmTime부터 관측 시작
  maxZoneRiskPct?: number;          // entry→zone stop 위험폭 상한
  avoidHighVolumeEntry?: boolean;   // 진입봉 거래량 과열 회피
  entryVolumeLookback?: number;     // 진입 거래량 평균 기준봉 수
  entryVolumeMaxMultiple?: number;  // 평균 대비 이 배수 이상이면 회피
  acceptanceStopBars?: number;      // mid/CE 손절방향 acceptance N봉 조기 종료
  useBrokenZoneContinuation?: boolean; // 손절쪽 종가이탈 이후 반대방향 continuation
  brokenEntrySignal?: 'breakClose' | 'rebreakClose';
  brokenTargetZoneWidths?: number;  // TP: 존 폭 배수
  brokenStopZoneWidths?: number;    // SL: 존 폭 배수
  brokenStopOnReclaimClose?: boolean; // 깨진 경계 종가 회복 시 조기 종료
}

// ─────────────────────────────────────────────
// 감지기별 파라미터 (kind로 구분되는 합집합)
// ─────────────────────────────────────────────

export interface HarmonicParams {
  kind: 'HARMONIC';
  enabledPatterns: HarmonicPatternName[]; // 빈 배열 = 전체 허용
  useEqFilter: boolean;                   // 상위TF EQ 컨플루언스 필터
  eqAlivePasses: number;                  // EQ 살아있음 판정 (종가 관통 N회 미만)
  logScale: boolean;                      // 피보나치 투영 로그(기하) 기준
  entryDepth: number;                     // 진입 깊이 0~1 (0=D점 즉시, 0.5=D~SL 중간, SL 방향 보간)
}

export interface AbcdParams {
  kind: 'ABCD';
  enabledRatios: ('1:1' | '1:1.272' | '1:1.618')[]; // 빈 배열 = 전체 허용
  logScale: boolean;
}

export interface ObParams {
  kind: 'OB';
  useSl3: boolean;            // OB 완전 이탈마감 손절
  sl2Threshold: 'mid' | 'border';
  closeDepth: number;         // 신호 종가 위치 필터 (0~1)
  useEqEntry: boolean;        // EQ 박스(0.382~0.618) 첫 꼬리터치 → 다음 캔들 mid 진입
  entryOnFirstTouch: boolean; // mid 첫 꼬리터치 즉시 진입
  entryLevel: 'mid' | 'eqNear' | 'eqFar';
}

export interface FvgParams {
  kind: 'FVG';
  entryAtBorder: boolean;     // 경계 터치 즉시 진입
  entryAtLow: boolean;        // 딥 경계 터치 즉시 진입
  signalDeep: boolean;        // 딥 영역 종가를 신호 조건으로
}

export interface BbParams {
  kind: 'BB';                 // OB 돌파 시 Breaker Block 역매매
}

export type DetectorParams = HarmonicParams | AbcdParams | ObParams | FvgParams | BbParams;

// ─────────────────────────────────────────────
// 전략 설정 본체
// ─────────────────────────────────────────────

export interface StrategyConfig {
  schemaVersion: typeof STRATEGY_SCHEMA_VERSION;
  name?: string;              // 사람용 라벨 (실험 이력 표시)
  symbol: string;             // 'BTCUSDT'
  timeframe: Timeframe;       // 신호 TF (현 워커 기준 '4h')
  zoneTimeframe?: Timeframe;  // 상위 존/EQ TF (OB·EQ 컨플루언스 기준, 미지정 시 timeframe과 동일)
  risk: RiskConfig;
  execution: ExecutionConfig;
  cost: CostConfig;
  detector: DetectorParams;   // kind로 구분
}

// ─────────────────────────────────────────────
// 기본값 + 정규화 + 검증
// ─────────────────────────────────────────────

export const DEFAULT_EXECUTION: ExecutionConfig = {
  entryMode: 'immediate',
  longOnly: false,
  tp1Pct: 50,
  tp2Pct: 50,
  moveStopToBreakeven: true,
  slCapPct: 10.0,
  maxWaitCandles: 40,
  maxHoldCandles: 100,
};

export const DEFAULT_RISK: RiskConfig = {
  investUsdt: 0,
  leverage: 5,
  maxLossPct: 0,
};

export const DEFAULT_COST: CostConfig = {
  feePct: 0.04,
  slippagePct: 0.02,
  fundingPctPer8h: 0.01,
};

export function defaultDetector(kind: StrategyKind): DetectorParams {
  switch (kind) {
    case 'HARMONIC': return { kind, enabledPatterns: [], useEqFilter: false, eqAlivePasses: 3, logScale: true, entryDepth: 0 };
    case 'ABCD':     return { kind, enabledRatios: [], logScale: true };
    case 'OB':       return { kind, useSl3: false, sl2Threshold: 'mid', closeDepth: 1.0, useEqEntry: false, entryOnFirstTouch: false, entryLevel: 'mid' };
    case 'FVG':      return { kind, entryAtBorder: false, entryAtLow: false, signalDeep: false };
    case 'BB':       return { kind };
  }
}

/** normalizeConfig 입력: symbol과 detector.kind만 필수, 나머지는 기본값으로 채움 */
export interface StrategyConfigInput {
  name?: string;
  symbol: string;
  timeframe?: Timeframe;
  zoneTimeframe?: Timeframe;
  risk?: Partial<RiskConfig>;
  execution?: Partial<ExecutionConfig>;
  cost?: Partial<CostConfig>;
  detector: DetectorParams | ({ kind: StrategyKind } & Record<string, unknown>);
}

/** 부분 입력(JSON 파싱 결과 등)을 기본값으로 채워 완전한 설정으로 만든다 */
export function normalizeConfig(input: StrategyConfigInput): StrategyConfig {
  const kind = input.detector.kind;
  return {
    schemaVersion: STRATEGY_SCHEMA_VERSION,
    name: input.name,
    symbol: input.symbol,
    timeframe: input.timeframe ?? '4h',
    zoneTimeframe: input.zoneTimeframe,
    risk: { ...DEFAULT_RISK, ...(input.risk ?? {}) },
    execution: { ...DEFAULT_EXECUTION, ...(input.execution ?? {}) },
    cost: { ...DEFAULT_COST, ...(input.cost ?? {}) },
    detector: { ...defaultDetector(kind), ...input.detector } as DetectorParams,
  };
}

/** 설정 검증 — 문제 목록 반환 (빈 배열 = 통과). 실전 가동 전 게이트로 사용 */
export function validateConfig(cfg: StrategyConfig): string[] {
  const errors: string[] = [];
  if (cfg.schemaVersion !== STRATEGY_SCHEMA_VERSION) errors.push(`지원하지 않는 schemaVersion: ${cfg.schemaVersion}`);
  if (!cfg.symbol) errors.push('symbol 누락');
  if (cfg.risk.investUsdt < 0) errors.push('investUsdt는 0 이상');
  if (cfg.risk.leverage < 1 || cfg.risk.leverage > 125) errors.push('leverage는 1~125');
  if (cfg.execution.tp1Pct < 0 || cfg.execution.tp1Pct > 100) errors.push('tp1Pct는 0~100');
  if (cfg.execution.tp2Pct < 0 || cfg.execution.tp2Pct > 100) errors.push('tp2Pct는 0~100');
  if (cfg.execution.tp1Pct + cfg.execution.tp2Pct > 100) errors.push('tp1Pct + tp2Pct는 100 이하');
  if (cfg.execution.slCapPct <= 0) errors.push('slCapPct는 양수');
  if (cfg.execution.maxWaitCandles < 1) errors.push('maxWaitCandles는 1 이상');
  if (cfg.execution.maxHoldCandles < 1) errors.push('maxHoldCandles는 1 이상');
  if (cfg.execution.targetR !== undefined && cfg.execution.targetR <= 0) errors.push('targetR은 양수');
  if (cfg.execution.maxZoneAgeDays !== undefined && cfg.execution.maxZoneAgeDays <= 0) errors.push('maxZoneAgeDays는 양수');
  if (cfg.execution.maxZoneRiskPct !== undefined && cfg.execution.maxZoneRiskPct <= 0) errors.push('maxZoneRiskPct는 양수');
  if (cfg.execution.entryVolumeLookback !== undefined && cfg.execution.entryVolumeLookback < 1) errors.push('entryVolumeLookback은 1 이상');
  if (cfg.execution.entryVolumeMaxMultiple !== undefined && cfg.execution.entryVolumeMaxMultiple <= 0) errors.push('entryVolumeMaxMultiple은 양수');
  if (cfg.execution.acceptanceStopBars !== undefined && cfg.execution.acceptanceStopBars < 0) errors.push('acceptanceStopBars는 0 이상');
  if (cfg.execution.brokenEntrySignal !== undefined && !['breakClose', 'rebreakClose'].includes(cfg.execution.brokenEntrySignal)) errors.push('brokenEntrySignal은 breakClose/rebreakClose 중 하나');
  if (cfg.execution.brokenTargetZoneWidths !== undefined && cfg.execution.brokenTargetZoneWidths <= 0) errors.push('brokenTargetZoneWidths는 양수');
  if (cfg.execution.brokenStopZoneWidths !== undefined && cfg.execution.brokenStopZoneWidths <= 0) errors.push('brokenStopZoneWidths는 양수');
  if (cfg.cost.feePct < 0 || cfg.cost.slippagePct < 0 || cfg.cost.fundingPctPer8h < 0) errors.push('비용(cost) 항목은 0 이상');
  if (cfg.detector.kind === 'HARMONIC') {
    for (const p of cfg.detector.enabledPatterns) {
      if (!(HARMONIC_PATTERN_NAMES as readonly string[]).includes(p)) errors.push(`알 수 없는 하모닉 패턴: ${p}`);
    }
    if (cfg.detector.eqAlivePasses < 1) errors.push('eqAlivePasses는 1 이상');
    if (cfg.detector.entryDepth < 0 || cfg.detector.entryDepth > 1) errors.push('entryDepth는 0~1');
  }
  return errors;
}

// ─────────────────────────────────────────────
// 기존 형식과의 브리지 (점진 이행용)
// ─────────────────────────────────────────────

/**
 * 워커 TradeConfig(DB row: strategy enum + params 자유 JSON) → StrategyConfig.
 * 기존 params 필드명(harmonic* 접두사)을 그대로 읽는다.
 */
export function fromLegacyTradeConfig(raw: {
  symbol: string;
  strategy: string;
  params: Record<string, unknown>;
  investUsdt?: number;
  leverage?: number;
  maxLossPct?: number;
}): StrategyConfig {
  const p = raw.params as any;
  const kind = (['HARMONIC', 'ABCD', 'OB', 'FVG', 'BB'].includes(raw.strategy) ? raw.strategy : 'OB') as StrategyKind;

  const detector: DetectorParams = kind === 'HARMONIC'
    ? {
        kind,
        enabledPatterns: Array.isArray(p.harmonicEnabledPatterns) ? p.harmonicEnabledPatterns : [],
        useEqFilter: Boolean(p.harmonicUseEqFilter ?? false),
        eqAlivePasses: Number(p.eqAlivePasses ?? 3),
        logScale: p.harmonicLogScale !== undefined ? Boolean(p.harmonicLogScale) : true,
        entryDepth: Number(p.harmonicEntryDepth ?? 0),
      }
    : defaultDetector(kind);

  return normalizeConfig({
    symbol: raw.symbol,
    timeframe: '4h',
    risk: {
      investUsdt: Number(raw.investUsdt ?? 0),
      leverage: Number(raw.leverage ?? 5),
      maxLossPct: Number(raw.maxLossPct ?? 0),
    },
    execution: {
      ...DEFAULT_EXECUTION,
      entryMode: (p.harmonicEntryMode === 'close' ? 'close' : 'immediate'),
      longOnly: Boolean(p.longOnly ?? false),
      tp1Pct: Number(p.harmonicTp1Pct ?? p.tpPercent ?? 50),
      tp2Pct: Number(p.harmonicTp2Pct ?? 50),
      moveStopToBreakeven: Boolean(p.harmonicMoveStopToBreakeven ?? true),
      slCapPct: Number(p.harmonicSlCapPct ?? 10.0),
      maxWaitCandles: Number(p.maxWaitCandles ?? 40),
      maxHoldCandles: Number(p.maxHoldCandles ?? 100),
    },
    detector,
  });
}

// ─────────────────────────────────────────────
// 백테스트(프론트 StrategyParams) 브리지
// ─────────────────────────────────────────────
//
// HARMONIC / ABCD는 완전 매핑, OB 계열(OB/FVG/BB)은 스키마에 정의된 핵심 필드만.
// 스키마에 없는 백테스트 전용 필터(volume*, switching, MA/RSI 필터 등)는
// 의도적으로 제외 — JSON으로 내보내면 그 필드들은 기본값으로 돌아간다.

const TF_FROM_LEGACY: Record<string, Timeframe> = {
  '1Dutc': '1d', '1Wutc': '1w', '1m': '1m', '5m': '5m', '15m': '15m',
  '30m': '30m', '1h': '1h', '4h': '4h',
};
const TF_TO_LEGACY: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1Dutc', '1w': '1Wutc',
};

/** 백테스트 레거시 설정 (frontend strategyConstants.StrategyConfig와 구조 동일) */
export interface LegacyBacktestConfig {
  name: string;
  obGranularity: string;     // 상위 존/EQ TF ('1Dutc' 등)
  entryGranularity: string;  // 신호·진입 TF
  initialCapital: number;
  params: Record<string, unknown>;
}

/** 백테스트 폼 상태 → 스키마 설정 */
export function fromLegacyBacktest(legacy: LegacyBacktestConfig, symbol: string): StrategyConfig {
  const p = legacy.params as any;
  const kind: StrategyKind = p.useHarmonicStrategy ? 'HARMONIC'
    : p.useAbcdStrategy ? 'ABCD'
    : p.useFvgStrategy ? 'FVG'
    : p.useBbStrategy ? 'BB'
    : 'OB';

  const detector: DetectorParams =
    kind === 'HARMONIC' ? {
      kind,
      enabledPatterns: Array.isArray(p.harmonicEnabledPatterns) ? p.harmonicEnabledPatterns : [],
      useEqFilter: Boolean(p.harmonicUseEqFilter ?? true),
      eqAlivePasses: Number(p.eqAlivePasses ?? 3),
      logScale: Boolean(p.harmonicLogScale ?? false),
      entryDepth: Number(p.harmonicEntryDepth ?? 0),
    } : kind === 'ABCD' ? {
      kind,
      enabledRatios: Array.isArray(p.abcdEnabledRatios) ? p.abcdEnabledRatios : [],
      logScale: Boolean(p.abcdLogScale ?? true),
    } : kind === 'FVG' ? {
      kind,
      entryAtBorder: Boolean(p.fvgEntryAtBorder ?? false),
      entryAtLow: Boolean(p.fvgEntryAtLow ?? false),
      signalDeep: Boolean(p.fvgSignalDeep ?? false),
    } : kind === 'BB' ? { kind } : {
      kind: 'OB',
      useSl3: Boolean(p.useSl3 ?? false),
      sl2Threshold: p.sl2Threshold === 'border' ? 'border' : 'mid',
      closeDepth: Number(p.closeDepth ?? 1.0),
      useEqEntry: Boolean(p.useEqStrategy ?? false),
      entryOnFirstTouch: Boolean(p.entryOnFirstTouch ?? false),
      entryLevel: ['eqNear', 'eqFar'].includes(p.obEntryLevel) ? p.obEntryLevel : 'mid',
    };

  const isPattern = kind === 'HARMONIC' || kind === 'ABCD';
  return normalizeConfig({
    name: legacy.name,
    symbol,
    timeframe: TF_FROM_LEGACY[legacy.entryGranularity] ?? '4h',
    zoneTimeframe: TF_FROM_LEGACY[legacy.obGranularity],
    risk: {
      investUsdt: Number(p.fixedEntryMargin ?? 100),
      leverage: Number(p.leverage ?? 5),
      maxLossPct: 0,
      capitalMode: p.capitalMode === 'compound' ? 'compound' : 'fixed',
      positionPct: Number(p.positionPct ?? 10),
      initialCapital: legacy.initialCapital,
    },
    execution: {
      entryMode: (kind === 'ABCD' ? p.abcdEntryMode : p.harmonicEntryMode) === 'close' ? 'close' : 'immediate',
      longOnly: false,
      tp1Pct: Number((kind === 'ABCD' ? p.abcdTp1Pct : p.harmonicTp1Pct) ?? 50),
      tp2Pct: Number((kind === 'ABCD' ? p.abcdTp2Pct : p.harmonicTp2Pct) ?? 50),
      moveStopToBreakeven: Boolean(p.harmonicMoveStopToBreakeven ?? false),
      slCapPct: Number(p.harmonicSlCapPct ?? 10.0),
      maxWaitCandles: Number(p.maxWaitCandles ?? 40),
      maxHoldCandles: Number(p.maxHoldCandles ?? 100),
      useZoneRiskReward: Boolean(p.useZoneRiskReward ?? false),
      targetR: Number(p.targetR ?? 2.0),
      maxZoneAgeDays: p.maxZoneAgeDays === undefined ? undefined : Number(p.maxZoneAgeDays),
      useConfirmTimeEntry: Boolean(p.useConfirmTimeEntry ?? false),
      maxZoneRiskPct: p.maxZoneRiskPct === undefined ? undefined : Number(p.maxZoneRiskPct),
      avoidHighVolumeEntry: Boolean(p.avoidHighVolumeEntry ?? false),
      entryVolumeLookback: Number(p.entryVolumeLookback ?? 20),
      entryVolumeMaxMultiple: Number(p.entryVolumeMaxMultiple ?? 2.0),
      acceptanceStopBars: Number(p.acceptanceStopBars ?? 0),
      useBrokenZoneContinuation: Boolean(p.useBrokenZoneContinuation ?? false),
      brokenEntrySignal: p.brokenEntrySignal === 'rebreakClose' ? 'rebreakClose' : 'breakClose',
      brokenTargetZoneWidths: Number(p.brokenTargetZoneWidths ?? 1.0),
      brokenStopZoneWidths: Number(p.brokenStopZoneWidths ?? 1.0),
      brokenStopOnReclaimClose: Boolean(p.brokenStopOnReclaimClose ?? true),
      ...(isPattern ? {} : {
        tpPricePct: Number(p.tpPercent ?? 2.0),
        slPricePct: Number(p.slPercent ?? 3.0),
      }),
    },
    cost: {
      feePct: Number(p.feePct ?? DEFAULT_COST.feePct),
      slippagePct: Number(p.slippagePct ?? DEFAULT_COST.slippagePct),
      fundingPctPer8h: Number(p.fundingPctPer8h ?? DEFAULT_COST.fundingPctPer8h),
    },
    detector,
  });
}

/**
 * 스키마 설정 → 백테스트 폼 패치.
 * params는 매핑된 필드만 담은 부분 객체 — 호출 쪽에서 DEFAULT_STRATEGY_PARAMS 위에 머지해서 사용.
 */
export function toLegacyBacktest(cfg: StrategyConfig): LegacyBacktestConfig {
  const d = cfg.detector;
  const params: Record<string, unknown> = {
    useHarmonicStrategy: d.kind === 'HARMONIC',
    useAbcdStrategy: d.kind === 'ABCD',
    useFvgStrategy: d.kind === 'FVG',
    useBbStrategy: d.kind === 'BB',
    useEqStrategy: d.kind === 'OB' && d.useEqEntry,
    leverage: cfg.risk.leverage,
    capitalMode: cfg.risk.capitalMode ?? 'fixed',
    fixedEntryMargin: cfg.risk.investUsdt,
    positionPct: cfg.risk.positionPct ?? 10,
    maxWaitCandles: cfg.execution.maxWaitCandles,
    maxHoldCandles: cfg.execution.maxHoldCandles,
    useZoneRiskReward: Boolean(cfg.execution.useZoneRiskReward ?? false),
    targetR: Number(cfg.execution.targetR ?? 2.0),
    ...(cfg.execution.maxZoneAgeDays !== undefined ? { maxZoneAgeDays: cfg.execution.maxZoneAgeDays } : {}),
    useConfirmTimeEntry: Boolean(cfg.execution.useConfirmTimeEntry ?? false),
    ...(cfg.execution.maxZoneRiskPct !== undefined ? { maxZoneRiskPct: cfg.execution.maxZoneRiskPct } : {}),
    avoidHighVolumeEntry: Boolean(cfg.execution.avoidHighVolumeEntry ?? false),
    entryVolumeLookback: Number(cfg.execution.entryVolumeLookback ?? 20),
    entryVolumeMaxMultiple: Number(cfg.execution.entryVolumeMaxMultiple ?? 2.0),
    acceptanceStopBars: Number(cfg.execution.acceptanceStopBars ?? 0),
    useBrokenZoneContinuation: Boolean(cfg.execution.useBrokenZoneContinuation ?? false),
    brokenEntrySignal: cfg.execution.brokenEntrySignal ?? 'breakClose',
    brokenTargetZoneWidths: Number(cfg.execution.brokenTargetZoneWidths ?? 1.0),
    brokenStopZoneWidths: Number(cfg.execution.brokenStopZoneWidths ?? 1.0),
    brokenStopOnReclaimClose: Boolean(cfg.execution.brokenStopOnReclaimClose ?? true),
    feePct: cfg.cost.feePct,
    slippagePct: cfg.cost.slippagePct,
    fundingPctPer8h: cfg.cost.fundingPctPer8h,
  };
  if (d.kind === 'HARMONIC') {
    Object.assign(params, {
      harmonicEnabledPatterns: d.enabledPatterns,
      harmonicUseEqFilter: d.useEqFilter,
      eqAlivePasses: d.eqAlivePasses,
      harmonicLogScale: d.logScale,
      harmonicEntryDepth: d.entryDepth,
      harmonicEntryMode: cfg.execution.entryMode,
      harmonicTp1Pct: cfg.execution.tp1Pct,
      harmonicTp2Pct: cfg.execution.tp2Pct,
      harmonicMoveStopToBreakeven: cfg.execution.moveStopToBreakeven,
      harmonicSlCapPct: cfg.execution.slCapPct,
    });
  } else if (d.kind === 'ABCD') {
    Object.assign(params, {
      abcdEnabledRatios: d.enabledRatios,
      abcdLogScale: d.logScale,
      abcdEntryMode: cfg.execution.entryMode,
      abcdTp1Pct: cfg.execution.tp1Pct,
      abcdTp2Pct: cfg.execution.tp2Pct,
    });
  } else {
    Object.assign(params, {
      tpPercent: cfg.execution.tpPricePct ?? 2.0,
      slPercent: cfg.execution.slPricePct ?? 3.0,
    });
    if (d.kind === 'OB') {
      Object.assign(params, {
        useSl3: d.useSl3,
        sl2Threshold: d.sl2Threshold,
        closeDepth: d.closeDepth,
        entryOnFirstTouch: d.entryOnFirstTouch,
        obEntryLevel: d.entryLevel,
      });
    } else if (d.kind === 'FVG') {
      Object.assign(params, {
        fvgEntryAtBorder: d.entryAtBorder,
        fvgEntryAtLow: d.entryAtLow,
        fvgSignalDeep: d.signalDeep,
      });
    }
  }
  const entryTf = TF_TO_LEGACY[cfg.timeframe];
  return {
    name: cfg.name ?? `${d.kind} 전략`,
    obGranularity: cfg.zoneTimeframe ? TF_TO_LEGACY[cfg.zoneTimeframe] : entryTf,
    entryGranularity: entryTf,
    initialCapital: cfg.risk.initialCapital ?? 100,
    params,
  };
}
