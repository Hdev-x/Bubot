import { DEFAULT_STRATEGY_PARAMS } from '../utils/backtestEngine';
import type { StrategyParams } from '../utils/backtestEngine';

export const SYMBOLS_MAIN = [
  'BTCUSDT', 'ETHUSDT', 'ZECUSDT', 'SOLUSDT', 'HYPEUSDT', 'WLDUSDT', 'ALLOUSDT', 'DOGEUSDT', 'NEARUSDT', 'SIRENUSDT',
  'FIDAUSDT', 'HOMEUSDT', 'LABUSDT', 'ADAUSDT', 'PEPEUSDT', 'SUIUSDT', 'XLMUSDT', 'TAOUSDT', 'SKYAIUSDT', 'AVAXUSDT',
  'LINKUSDT', 'BLESSUSDT', 'TONUSDT', 'BCHUSDT', 'ONDOUSDT', 'OPNUSDT', 'JTOUSDT', 'FILUSDT', 'LTCUSDT', 'EDENUSDT',
  'DASHUSDT', 'ESPORTSUSDT', 'VVVUSDT', 'AAVEUSDT', 'DOTUSDT', 'BANKUSDT', 'PUMPUSDT', 'TRXUSDT', 'INJUSDT', 'ASTERUSDT',
  'LITUSDT', 'PORTALUSDT', 'FETUSDT', 'HEIUSDT', 'PIPPINUSDT', 'OPGUSDT', 'XPLUSDT', 'FARTCOINUSDT', 'WIFUSDT', 'HOLOUSDT'
];

// 비트겟(Bitget) 상장 및 리스크 정책에 따른 레버리지 강제 조정 맵 (기본 20배를 지원하지 않는 예외 종목들)
export const LEVERAGE_OVERRIDES: Record<string, number> = {
  'SIRENUSDT': 10,
  'LABUSDT': 10,
  'SKYAIUSDT': 10,
  'BLESSUSDT': 10,
  'ESPORTSUSDT': 10,
  'PIPPINUSDT': 10
};

export const SYMBOLS_4H_TOP5 = [
  'SOLUSDT', 'NEARUSDT', 'INJUSDT', 'FILUSDT', 'ATOMUSDT'
];

export const SYMBOLS = [...SYMBOLS_MAIN, ...SYMBOLS_4H_TOP5];

export const OB_TF_OPTIONS: { label: string; granularity: string }[] = [
  { label: '4h',  granularity: '4h'    },
  { label: '1D',  granularity: '1Dutc' },
  { label: '1W',  granularity: '1Wutc' },
];

export const ENTRY_TF_OPTIONS: { label: string; granularity: string }[] = [
  { label: '15m', granularity: '15m'   },
  { label: '1h',  granularity: '1h'    },
  { label: '4h',  granularity: '4h'    },
  { label: '1D',  granularity: '1Dutc' },
];

export type StrategyConfig = {
  name: string;
  obGranularity: string;
  entryGranularity: string;
  initialCapital: number;
  params: StrategyParams;
};

export const DEFAULT_STRATEGY: StrategyConfig = {
  name: '날봉 OB → 4h 진입',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: DEFAULT_STRATEGY_PARAMS,
};

export const DEFAULT_STRATEGY_18: StrategyConfig = {
  name: '날봉 FVG → 4h 진입 (종가 신호 & 딥경계 진입 & 종가마감 손절 + 5/20이평)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: { 
    ...DEFAULT_STRATEGY_PARAMS, 
    useFvgStrategy: true,
    fvgSignalDeep: false,
    fvgEntryAtLowAfterSignal: true,
    sl2Tf: 'obTf',
    useSl3: true,
    filterMa5Ma20: true,
    slPercent: 99, 
  },
};

export const DEFAULT_STRATEGY_20: StrategyConfig = {
  name: '날봉 OB → 4h 진입 (Mid 첫 터치, 종가손절, 4H 240MA 박스내부)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: { 
    ...DEFAULT_STRATEGY_PARAMS, 
    entryOnFirstTouch: true,
    sl2Tf: 'obTf',
    useSl3: true,
    slPercent: 99,
    filterMa240InBox: true,
  },
};

export const DEFAULT_STRATEGY_21: StrategyConfig = {
  name: '날봉 OB → 4h 진입 (Mid 첫 터치, 종가손절, 4H RSI 역매매)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: { 
    ...DEFAULT_STRATEGY_PARAMS, 
    entryOnFirstTouch: true,
    sl2Tf: 'obTf',
    useSl3: true,
    slPercent: 99,
    filterRsi: true,
  },
};

export const DEFAULT_STRATEGY_19: StrategyConfig = {
  name: '날봉 OB → 4h 진입 (Mid 첫 터치 & 2% 칼손절)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: { 
    ...DEFAULT_STRATEGY_PARAMS, 
    entryOnFirstTouch: true,
    slPercent: 2.0,
    tpPercent: 5.0,
  },
};

export const DEFAULT_STRATEGY_EQ: StrategyConfig = {
  name: 'EQ 전략 (mid 첫터치 진입, EQ 손절)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: {
    ...DEFAULT_STRATEGY_PARAMS,
    useEqStrategy: true,
    tpPercent: 2.0,
    slPercent: 3.0,
  },
};

// 하모닉 예측 전략: 일봉 하모닉 PRZ + 주봉 EQ 컨플루언스
// 설계 명세: docs/plans/하모닉-예측-진입트리거-설계.txt
export const DEFAULT_STRATEGY_HARMONIC: StrategyConfig = {
  name: '하모닉 예측 (일봉 PRZ + 주봉 EQ 컨플루언스)',
  obGranularity: '1Wutc',   // 주봉 = 상위TF EQ 감지용
  entryGranularity: '1Dutc', // 일봉 = 하모닉 PRZ 계산 + 진입
  initialCapital: 100,
  params: {
    ...DEFAULT_STRATEGY_PARAMS,
    useHarmonicStrategy: true,
    harmonicUseEqFilter: true,
    harmonicEntryMode: 'close', // 백테스트로 immediate와 비교 예정
    eqAlivePasses: 3,
    harmonicTp1Pct: 50,
    harmonicTp2Pct: 50,
    harmonicLogScale: true, // 피보나치 로그(기하) 투영
  },
};

// 순수 하모닉 예측 전략: EQ 컨플루언스 없이 PRZ 단독 진입
export const DEFAULT_STRATEGY_HARMONIC_PURE: StrategyConfig = {
  name: '하모닉 예측 (로그스케일 / PRZ 단독)',
  obGranularity: '1Dutc',    // 순수 하모닉에서는 사용하지 않음
  entryGranularity: '4h',    // 하모닉 PRZ 계산 + 진입
  initialCapital: 100,
  params: {
    ...DEFAULT_STRATEGY_PARAMS,
    useHarmonicStrategy: true,
    harmonicUseEqFilter: false,
    harmonicEntryMode: 'immediate', // 꼬리 터치 즉시 진입 (리포트 튜닝값)
    positionPct: 25,                // 진입 비중 25%
    capitalMode: 'compound',        // 복리
    harmonicMoveStopToBreakeven: true, // TP1 후 본절스탑 ON
    harmonicTp1Pct: 50,
    harmonicTp2Pct: 50,
    harmonicLogScale: true, // 피보나치 로그(기하) 투영
  },
};

export const DEFAULT_STRATEGY_ABCD: StrategyConfig = {
  name: 'AB=CD 예측 (로그스케일 / 4h)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: {
    ...DEFAULT_STRATEGY_PARAMS,
    useAbcdStrategy: true,
    abcdEntryMode: 'immediate',
    abcdTp1Pct: 50,
    abcdTp2Pct: 50,
    abcdEnabledRatios: [],
    abcdLogScale: true,
    positionPct: 25,
    capitalMode: 'compound',
  },
};

export const DEFAULT_STRATEGY_CE: StrategyConfig = {
  name: 'CE 전략 (FVG CE 첫터치 진입, CE 손절)',
  obGranularity: '1Dutc',
  entryGranularity: '4h',
  initialCapital: 100,
  params: {
    ...DEFAULT_STRATEGY_PARAMS,
    useFvgStrategy: true,
    useEqStrategy: true,
    tpPercent: 2.0,
    slPercent: 3.0,
  },
};

export const DEFAULT_STRATEGY_HARMONIC_PURE_LINEAR: StrategyConfig = {
  ...DEFAULT_STRATEGY_HARMONIC_PURE,
  name: '하모닉 예측 (선형스케일 / PRZ 단독)',
  params: {
    ...DEFAULT_STRATEGY_HARMONIC_PURE.params,
    harmonicLogScale: false,
  },
};
