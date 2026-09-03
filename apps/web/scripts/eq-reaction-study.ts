/**
 * EQ 존 반응 연구 (SMC 디텍터 연구 1번) — 탐색적 데이터 분석.
 * 설계: docs/plans/eq-zone-reaction-study.md
 *
 * 실행: cd frontend && npx vite-node scripts/eq-reaction-study.ts
 *   - SYMBOLS 일봉 장기 데이터 수집(캐시) → 1d/1W/1M 존 감지 →
 *     일봉 단위로 EQ 박스 터치 이벤트를 모아 raw JSON + 요약 REPORT.md 생성.
 *
 * 백테스트(수익 검증)가 아니라 "가격이 EQ/OB mid/FVG CE 레벨에 어떻게 반응하는지"의 통계.
 * 존 기하(high/low/mid)·confirmTime만 사용 — eqPasses 등 사후 계산 필드는 lookahead라 미사용.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detectOBs, detectFVGs, eqBox } from '../../shared/smc';
import type { SmcCandle } from '../../shared/smc';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'docs/research/eq-reaction');
const CACHE_DIR = resolve(OUT_DIR, 'candles');

// 백테스트 전 EDA 스냅샷 고정. open time이 cutoff 이상인 캔들은 제외한다.
// 1W/1M 리샘플은 마지막 미완성 HTF 버킷도 제외해 미확정 HTF 존 감지를 막는다.
const ANALYSIS_CUTOFF_ISO = '2026-06-13T00:00:00.000Z';
const ANALYSIS_CUTOFF_SEC = Math.floor(Date.parse(ANALYSIS_CUTOFF_ISO) / 1000);
const ANALYSIS_DATE = ANALYSIS_CUTOFF_ISO.slice(0, 10);
const CONTROL_SEED = 20260613;

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT',
];
const ZONE_TFS = ['1d', '1W', '1M'] as const;
type ZoneTf = (typeof ZONE_TFS)[number];

const FWD_NS = [10, 20, 40];          // 전방 관측 봉 수 (일봉)
const TARGETS_PCT = [2, 5, 10];       // 반전 성공 임계 = 유리 이동 가격 % (가격 정규화)
const MIN_WIDTH_PCT = 1.0;            // 존폭 < 1% 는 노이즈 갭으로 제외
const DAILY_BARS = 1500;              // 일봉 수집량 (~4년)

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

function applyAnalysisCutoff(candles: Candle[], totalBars: number): Candle[] {
  return candles
    .filter(c => c.time < ANALYSIS_CUTOFF_SEC)
    .slice(-totalBars);
}

// ── Binance 캔들 수집 (TF 범용, 캐시) ─────────────────────────────
async function fetchKlines(symbol: string, interval: string, totalBars: number): Promise<Candle[]> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = resolve(CACHE_DIR, `${symbol}-${interval}.json`);
  if (existsSync(cacheFile)) {
    return applyAnalysisCutoff(JSON.parse(readFileSync(cacheFile, 'utf8')), totalBars);
  }
  const out: Candle[] = [];
  let endTime: number | undefined;
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));
    if (endTime) url.searchParams.set('endTime', String(endTime));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${symbol} ${interval} HTTP ${res.status}`);
    const rows = (await res.json()) as any[];
    if (!rows.length) break;
    const page: Candle[] = rows.map(r => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
    }));
    out.unshift(...page);
    endTime = Number(rows[0][0]) - 1;
    if (rows.length < limit) break;
  }
  out.sort((a, b) => a.time - b.time);
  writeFileSync(cacheFile, JSON.stringify(out));
  console.log(`  ${symbol} ${interval}: ${out.length}봉 (${new Date(out[0].time * 1000).toISOString().slice(0, 10)} ~ ${new Date(out[out.length - 1].time * 1000).toISOString().slice(0, 10)})`);
  return applyAnalysisCutoff(out, totalBars);
}

// ── 일봉 → 주봉/월봉 리샘플 (UTC 기준) ─────────────────────────────
function bucketKey(timeSec: number, tf: ZoneTf): string {
  const d = new Date(timeSec * 1000);
  if (tf === '1d') return String(timeSec);
  if (tf === '1W') {
    // ISO 주: 목요일 기준 주차
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3) / 7);
    return `${t.getUTCFullYear()}-W${week}`;
  }
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`; // 1M
}

function resample(daily: Candle[], tf: ZoneTf): Candle[] {
  if (tf === '1d') return daily;
  const buckets = new Map<string, Candle[]>();
  const order: string[] = [];
  for (const c of daily) {
    const k = bucketKey(c.time, tf);
    if (!buckets.has(k)) { buckets.set(k, []); order.push(k); }
    buckets.get(k)!.push(c);
  }
  const completeOrder = order.slice(0, -1);
  return completeOrder.map(k => {
    const g = buckets.get(k)!;
    return {
      time: g[0].time,
      open: g[0].open,
      high: Math.max(...g.map(x => x.high)),
      low: Math.min(...g.map(x => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0),
    };
  });
}

// ── 존 정의 (OB/FVG 공통) ─────────────────────────────────────────
type Zone = {
  zoneType: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  high: number;
  low: number;
  mid: number;       // OB mid 또는 FVG CE(0.5)
  originTime: number;
  confirmTime: number;
};

function zonesFor(candles: SmcCandle[]): Zone[] {
  const obs = detectOBs(candles).map((o): Zone => ({
    zoneType: 'OB', direction: o.type, high: o.high, low: o.low, mid: o.mid, originTime: o.time, confirmTime: o.confirmTime,
  }));
  const fvgs = detectFVGs(candles).map((f): Zone => ({
    zoneType: 'FVG', direction: f.type, high: f.high, low: f.low, mid: f.ce, originTime: f.startTime, confirmTime: f.confirmTime,
  }));
  return [...obs, ...fvgs];
}

// ── 이벤트 레코드 ─────────────────────────────────────────────────
type Event = {
  symbol: string;
  zoneTf: ZoneTf;
  zoneType: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  touchOrdinal: number;
  t0Kind: 'wick' | 'close';
  entryFib: number;           // 반응 시작점(최대 침투)의 존 내 fib 위치 (0=low,1=high; 0.5=OB mid/FVG CE, EQ밴드 0.382~0.618)
  widthPct: number;           // 존폭 (가격 %)
  priorWickPokes: number;     // t0 전까지 존을 꼬리로 찔렀지만 종가 밖이던 에피소드 수
  crossedMid: boolean;        // t0 캔들 종가가 유리 방향으로 중심값을 넘었나
  favPctByN: Record<number, number>; // 전방 N봉 유리 최대이동 (가격 %)
  advPctByN: Record<number, number>; // 전방 N봉 불리 최대역행 (가격 %)
  barsToMaxFav: number;       // 40봉 창에서 유리 최대까지 봉 수
  invalidatedByBar: number | null; // far edge 종가 돌파(무효화) 첫 봉 (없으면 null)
};

/** 존 1개에 대해 일봉을 훑어 EQ밴드 터치 이벤트들을 만든다 (lookahead 없음: 관측은 t0 다음 봉부터) */
function eventsForZone(symbol: string, zoneTf: ZoneTf, zone: Zone, daily: Candle[]): Event[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];          // 노이즈 갭 제외 (fix 2)
  const favorUp = zone.direction === 'bull'; // 지지(bull)면 위로 반등이 유리
  const farEdge = favorUp ? zone.low : zone.high; // 무효화 기준 = 반대편 끝

  // 관측 시작: confirmTime 다음 일봉부터
  const startIdx = daily.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];

  const events: Event[] = [];
  let touchOrdinal = 0;
  let priorWickPokes = 0;
  let prevTouching = false;
  let episodeHadClose = false;

  // 터치 = 존 전체 진입 (fix 3: EQ밴드 한정 폐기 → 반응 위치를 0~1 전 구간에서 관찰)
  const zoneTouch = (c: Candle) => c.high >= zone.low && c.low <= zone.high;
  const closeInZone = (c: Candle) => c.close >= zone.low && c.close <= zone.high;

  const fibOf = (price: number) => (price - zone.low) / width; // 존 내 fib 위치

  for (let i = startIdx; i < daily.length; i++) {
    const c = daily[i];
    const touching = zoneTouch(c);

    if (touching && !prevTouching) {
      // 새 터치 에피소드 시작
      touchOrdinal++;
      episodeHadClose = false;
    }

    if (touching) {
      // wick 이벤트: 에피소드 첫 캔들에서 1회 (최대 침투점 fib 기록)
      if (!prevTouching) {
        const ext = favorUp ? c.low : c.high;
        events.push(makeEvent(symbol, zoneTf, zone, 'wick', touchOrdinal, fibOf(ext), widthPct, priorWickPokes, c, daily, i, favorUp, farEdge));
      }
      // close 이벤트: 에피소드 내 첫 종가-안착 캔들에서 1회
      if (!episodeHadClose && closeInZone(c)) {
        episodeHadClose = true;
        events.push(makeEvent(symbol, zoneTf, zone, 'close', touchOrdinal, fibOf(c.close), widthPct, priorWickPokes, c, daily, i, favorUp, farEdge));
      }
    } else if (prevTouching && !episodeHadClose) {
      // 종가 안착 없이 꼬리로만 찌르고 나간 에피소드 → 노이즈 카운트
      priorWickPokes++;
    }
    prevTouching = touching;
  }
  return events;
}

function makeEvent(
  symbol: string, zoneTf: ZoneTf, zone: Zone, t0Kind: 'wick' | 'close',
  touchOrdinal: number, entryFib: number, widthPct: number, priorWickPokes: number,
  t0Candle: Candle, daily: Candle[], t0Idx: number,
  favorUp: boolean, farEdge: number,
): Event {
  const favPctByN: Record<number, number> = {};
  const advPctByN: Record<number, number> = {};
  let runMaxFav = -Infinity, runMaxAdv = -Infinity, barsToMaxFav = 0;
  let invalidatedByBar: number | null = null;
  const base = t0Candle.close;

  const maxN = Math.max(...FWD_NS);
  for (let k = 1; k <= maxN; k++) {
    const c = daily[t0Idx + k];
    if (c) {
      // 유리/불리 최대이동 (가격 % — fix 1: 존폭 배수 폐기)
      const favMove = favorUp ? (c.high - base) : (base - c.low);
      const advMove = favorUp ? (base - c.low) : (c.high - base);
      if (favMove > runMaxFav) { runMaxFav = favMove; barsToMaxFav = k; }
      if (advMove > runMaxAdv) runMaxAdv = advMove;
      // 무효화: 종가가 far edge를 반대로 돌파
      if (invalidatedByBar === null) {
        const broke = favorUp ? c.close < farEdge : c.close > farEdge;
        if (broke) invalidatedByBar = k;
      }
    }
    if (FWD_NS.includes(k)) {
      favPctByN[k] = runMaxFav === -Infinity ? 0 : (runMaxFav / base) * 100;
      advPctByN[k] = runMaxAdv === -Infinity ? 0 : (runMaxAdv / base) * 100;
    }
  }
  // 중심값 횡단: t0 종가가 유리 방향으로 OB mid/FVG CE를 넘었나
  const crossedMid = favorUp ? t0Candle.close >= zone.mid : t0Candle.close <= zone.mid;

  return {
    symbol, zoneTf, zoneType: zone.zoneType, direction: zone.direction,
    touchOrdinal, t0Kind, entryFib, widthPct, priorWickPokes, crossedMid,
    favPctByN, advPctByN, barsToMaxFav, invalidatedByBar,
  };
}

// ── RR 트레이드 시뮬레이션 (진입 타이밍 immediate vs close-confirm) ──────────
const RR_TARGETS = [1, 2, 3];   // TP = 진입 위험(R)의 배수
const RR_FWD_BARS = 40;          // (timing 섹션 전용) 체결 후 관측 봉 수
const FILL_WAIT_BARS = 20;       // (timing 섹션 전용) 체결 대기 한도

// 멀티TF 레벨 분석: 시간 지평 고정(공정 비교) → 관측 TF별 봉 수로 환산
const FWD_DAYS = 40;             // 체결 후 결과 관측 (일)
const FILL_DAYS = 20;            // 체결 대기 한도 (일)
const CONFLUENCE_PCT = 1.0;      // 레벨 군집 판정: 기준 가격 대비 ±1%
const OBSERVE_TFS = ['4H', '1D', '1W', '1M'] as const;
type ObserveTf = (typeof OBSERVE_TFS)[number];
const BAR_DAYS: Record<ObserveTf, number> = { '4H': 4 / 24, '1D': 1, '1W': 7, '1M': 30.4375 };
const FOURH_BARS = 9000;         // 4H 수집량 (~4년)
const LIQUIDITY_SWEEP_LOOKBACK = 20; // 터치 직전 유동성 sweep 확인 봉 수
const STRUCTURE_PIVOT = 2;       // LTF swing high/low 확정 좌우 봉 수
const PRE_TOUCH_LOOKBACKS = [5, 10, 20] as const;
const FIRST_TOUCH_FORWARD_DAYS = [40, 80, 120] as const;
const FIRST_TOUCH_PRE_LOOKBACKS = [1, 3, 6, 12] as const;
const POST_FIRST_TOUCH_BARS = [1, 2, 3, 4, 5] as const;
const POST_FIRST_TOUCH_TOUCH_ORDINALS = [2, 3, 4, 5] as const;
// 존 TF별 관측 가능한 하위 TF (자기 자신 포함, 상위는 제외)
const OBSERVE_OPTIONS: Record<ZoneTf, ObserveTf[]> = {
  '1d': ['4H', '1D'],
  '1W': ['4H', '1D', '1W'],
  '1M': ['4H', '1D', '1W', '1M'],
};
const SAME_OBSERVE_TF: Record<ZoneTf, ObserveTf> = {
  '1d': '1D',
  '1W': '1W',
  '1M': '1M',
};

type EntryModel = 'immediate' | 'close_confirm';

type TradeRec = {
  symbol: string;
  zoneTf: ZoneTf;
  zoneType: 'OB' | 'FVG';
  model: EntryModel;
  riskPct: number;          // R = |진입 - SL| / 진입 * 100
  mfeR: number;             // 체결 후 유리 최대(R 배수)
  winByTarget: Record<number, 0 | 1>; // 각 target R 도달(SL -1R보다 먼저)이면 1
};

/**
 * 존 1개에 대해 두 진입 모델의 첫 셋업을 시뮬레이션.
 * - 진입 = 중심값(OB mid/FVG CE). SL = 존 반대편 끝(고정). bull은 위로/bear는 아래로 유리.
 * - immediate: 중심값 지정가 — 가격이 중심값에 닿는 첫 봉 체결.
 * - close_confirm: 존 터치 후 종가가 중심값을 유리하게 회복하는 첫 봉의 종가에 체결.
 * - 체결 전 무효화(종가가 SL 끝 돌파)되면 셋업 폐기(미체결).
 */
function tradesForZone(symbol: string, zoneTf: ZoneTf, zone: Zone, daily: Candle[]): TradeRec[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];
  const favorUp = zone.direction === 'bull';
  const ce = zone.mid;
  const sl = favorUp ? zone.low : zone.high;     // 반대편 끝
  const startIdx = daily.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];

  // 존 첫 터치 봉
  let touchIdx = -1;
  for (let i = startIdx; i < daily.length; i++) {
    if (daily[i].high >= zone.low && daily[i].low <= zone.high) { touchIdx = i; break; }
  }
  if (touchIdx < 0) return [];

  const invalidated = (c: Candle) => favorUp ? c.close < sl : c.close > sl;

  const sim = (model: EntryModel): TradeRec | null => {
    let entryIdx = -1, entryPrice = NaN;
    for (let i = touchIdx; i < Math.min(daily.length, touchIdx + FILL_WAIT_BARS + 1); i++) {
      const c = daily[i];
      if (invalidated(c)) return null; // 체결 전 무효화 → 셋업 폐기
      if (model === 'immediate') {
        const hitCE = favorUp ? c.low <= ce : c.high >= ce;
        if (hitCE) { entryIdx = i; entryPrice = ce; break; }
      } else {
        const closedFavor = favorUp ? c.close >= ce : c.close <= ce;
        const touched = c.high >= zone.low && c.low <= zone.high;
        if (touched && closedFavor) { entryIdx = i; entryPrice = c.close; break; }
      }
    }
    if (entryIdx < 0) return null;

    const risk = Math.abs(entryPrice - sl);
    if (risk <= 0) return null;
    const tp = (r: number) => favorUp ? entryPrice + r * risk : entryPrice - r * risk;

    let mfeR = 0;
    const winByTarget: Record<number, 0 | 1> = {};
    const hit: Record<number, boolean> = {};
    let stopped = false;
    for (let k = 1; k <= RR_FWD_BARS; k++) {
      const c = daily[entryIdx + k];
      if (!c) break;
      const favExc = favorUp ? (c.high - entryPrice) : (entryPrice - c.low);
      if (favExc / risk > mfeR) mfeR = favExc / risk;
      // SL 우선(보수적): 같은 봉서 SL·TP 동시면 손절 처리
      const slHit = favorUp ? c.low <= sl : c.high >= sl;
      if (slHit) { stopped = true; break; }
      for (const t of RR_TARGETS) {
        if (!hit[t] && (favorUp ? c.high >= tp(t) : c.low <= tp(t))) hit[t] = true;
      }
    }
    // SL 우선 break 덕에 손절 전 도달분만 hit=true. (stopped는 미사용이지만 가독성 위해 둠)
    void stopped;
    for (const t of RR_TARGETS) winByTarget[t] = hit[t] ? 1 : 0;
    return { symbol, zoneTf, zoneType: zone.zoneType, model, riskPct: (risk / entryPrice) * 100, mfeR, winByTarget };
  };

  return (['immediate', 'close_confirm'] as EntryModel[])
    .map(sim)
    .filter((t): t is TradeRec => t !== null);
}

// ── 레벨별(진입 깊이) RR 분석 — OB/FVG × edge/eqNear/mid50/eqFar ─────────
type DepthLevel = 'edge' | 'eqNear' | 'mid50' | 'eqFar';
type EntrySignal = 'wick' | 'close';
const DEPTH_LEVELS: DepthLevel[] = ['edge', 'eqNear', 'mid50', 'eqFar'];
const ENTRY_SIGNALS: EntrySignal[] = ['wick', 'close'];

type LevelTrade = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  depth: DepthLevel;
  entrySignal: EntrySignal;
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  ageDays: number;            // 존 confirm → 첫터치 경과일 (묵은 존 가설)
  sameBarConflict: boolean;   // SL·2R 동봉 충돌(해상도 아티팩트 진단)
  riskPct: number;
  mfeR: number;
  winByTarget: Record<number, 0 | 1>;
};

type ControlExcessRow = {
  section: string;
  label: string;
  source: 'OB' | 'FVG';
  zoneTf: ZoneTf | 'ALL';
  observeTf: ObserveTf | 'ALL';
  depth: DepthLevel | 'mixed';
  entrySignal: EntrySignal;
  realN: number;
  controlN: number;
  realWinPct: number;
  controlWinPct: number;
  realExp: number;
  controlExp: number;
  excessExp: number;
  avgRiskPct: number;
};

type CloseState = 'nearOutside' | 'nearInside' | 'eqInside' | 'farInside' | 'farOutside';
type DeepestZone = 'edgeOnly' | 'eqOnly' | 'mid50' | 'farHalf' | 'farEdge';
type PathOutcome = 'wickReject' | 'favorExit' | 'invalidated' | 'open';
type CloseEntrySection = 'near' | 'eqNear' | 'eqFar' | 'far';
type CloseEntryOutcome = 'nearExit' | 'invalidated' | 'open';
type CloseEntryFrom = 'nearOutside' | 'farOutside' | 'unknown';
type CloseReentryKind = 'firstCloseIn' | 'afterNearExit' | 'afterFarExit' | 'afterOpen';
type CoarseState = 'N' | 'I' | 'F'; // near/favor outside, inside, far/invalid outside
type RawState = 'ABOVE' | 'INSIDE' | 'BELOW';
type TrendRegime = 'withTrend' | 'againstTrend' | 'range' | 'unknown';
type SequenceBucket =
  | 'wickRejectOnly'
  | 'cleanReject'
  | 'multiInsideNoBreak'
  | 'insideDrift'
  | 'through'
  | 'deviationReject'
  | 'failedReentry'
  | 'multiDeviation'
  | 'mixed';
type ConfluenceBucket = 'none' | 'boxOnly' | 'levelOnly' | 'boxAndLevel';
type ConfluenceCombo = 'obBoxFvgEq' | 'obMidFvgCe' | 'obMidFvgEdge' | 'htfMidCluster';

type MetaZone = Zone & {
  symbol: string;
  zoneTf: ZoneTf;
  zoneId: string;
};

type ConfluenceInfo = {
  bucket: ConfluenceBucket;
  boxOverlapCount: number;
  levelClusterCount: number;
  combos: Record<ConfluenceCombo, boolean>;
  hasAny: boolean;
  hasHtf: boolean;
  hasObFvg: boolean;
};

type PathRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  firstTouchKind: 'wick' | 'close';
  firstCloseState: CloseState;
  deepest: DeepestZone;
  outcome: PathOutcome;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarHalf: boolean;
  closeBarsInZone: number;
  barsToOutcome: number | null;
};

type FirstTouchClosePosition = 'favorOutside' | 'nearInside' | 'eqInside' | 'farInside' | 'invalidOutside';
type FirstTouchBody = 'favorClose' | 'againstClose' | 'doji';
type FirstTouchForwardStats = {
  days: number;
  bars: number;
  observedBars: number;
  complete: boolean;
  nearExit: boolean;
  invalidated: boolean;
  reenteredZone: boolean;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarHalf: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
  maxFavorPct: number;
  maxAdversePct: number;
  maxFavorZone: number;
  maxAdverseZone: number;
  barsToNearExit: number | null;
  barsToInvalidation: number | null;
  barsToReentry: number | null;
  barsToMaxFavor: number | null;
  barsToMaxAdverse: number | null;
};
type FirstTouchPreWindowStats = {
  lookback: number;
  bars: number;
  startClose: number;
  endClose: number;
  closeMovePct: number;
  towardZonePct: number;
  avgRangePct: number;
  avgTrueRangePct: number;
  towardAtr: number;
  speedAtr: number;
  bodyRatio: number;
  wickRatio: number;
  rangeCompression: number;
  towardBars: number;
  oppositeBars: number;
  maxConsecutiveToward: number;
  lastClosePenetration: number;
  lastCloseState: CloseState;
  lastDistanceToZone: number;
  lastRangePct: number;
  lastBodyRatio: number;
  lastWickRatio: number;
};
type FirstTouchCloseDistribution = Record<FirstTouchClosePosition, number>;
type FirstTouchRevisitKind = 'none' | 'nearRetouch' | 'midTouch' | 'farEdgeTouch';
type FirstTouchRevisitStats = {
  days: number;
  bars: number;
  observedBars: number;
  complete: boolean;
  firstRevisitKind: FirstTouchRevisitKind;
  barsToFirstRevisit: number | null;
  firstRevisitClosePosition: FirstTouchClosePosition | null;
  nearRetouchEpisodes: number;
  midTouchEpisodes: number;
  farEdgeTouchEpisodes: number;
  nearTouchBars: number;
  midTouchBars: number;
  farEdgeTouchBars: number;
  barsToFirstNearRetouch: number | null;
  barsToFirstMidTouch: number | null;
  barsToFirstFarEdgeTouch: number | null;
  firstNearRetouchClosePosition: FirstTouchClosePosition | null;
  firstMidTouchClosePosition: FirstTouchClosePosition | null;
  firstFarEdgeTouchClosePosition: FirstTouchClosePosition | null;
  nearRetouchCloseDistribution: FirstTouchCloseDistribution;
  midTouchCloseDistribution: FirstTouchCloseDistribution;
  farEdgeTouchCloseDistribution: FirstTouchCloseDistribution;
};
type FirstTouchAnatomyRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  touchTime: number;
  zoneLow: number;
  zoneHigh: number;
  zoneMid: number;
  widthPct: number;
  firstTouchKind: 'wick' | 'close';
  wickPrice: number;
  closePrice: number;
  wickPenetration: number;
  closePenetration: number;
  wickDepth: DeepestZone;
  closePosition: FirstTouchClosePosition;
  body: FirstTouchBody;
  closeInZone: boolean;
  wickReject: boolean;
  invalidClose: boolean;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarHalf: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
  outcome: CloseEntryOutcome;
  barsToOutcome: number | null;
  forwardByDays: Record<number, FirstTouchForwardStats>;
  preTouchByLookback: Record<number, FirstTouchPreWindowStats | null>;
  revisitByDays: Record<number, FirstTouchRevisitStats>;
};

type PostTouchPathKind = 'nextBar' | 'levelTouch';
type PostTouchRegion =
  | 'mirrorFarOutside'
  | 'mirrorFarToCe'
  | 'mirrorCeToNear'
  | 'nearToCe'
  | 'ceToFar'
  | 'farOutside';
type PostTouchNearestLevel = 'mirrorFar' | 'mirrorCe' | 'near' | 'ce' | 'far';
type CandleBodyDirection = 'bullish' | 'bearish' | 'doji';
type PostFirstTouchPathRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  pathKind: PostTouchPathKind;
  sequenceOrdinal: number;
  barsFromFirst: number;
  daysFromFirst: number;
  time: number;
  firstTouchTime: number;
  firstTouchKind: 'wick' | 'close';
  firstClosePosition: FirstTouchClosePosition;
  firstWickDepth: DeepestZone;
  wickMinPenetration: number;
  wickMaxPenetration: number;
  closePenetration: number;
  wickMinRegion: PostTouchRegion;
  wickMaxRegion: PostTouchRegion;
  closeRegion: PostTouchRegion;
  closeNearestLevel: PostTouchNearestLevel;
  closeDistanceToNearest: number;
  closeCeDistance: number;
  closeNearCeBand: boolean;
  closeInActualZone: boolean;
  closeInMirrorZone: boolean;
  touchesMirrorFar: boolean;
  touchesMirrorCe: boolean;
  touchesNear: boolean;
  touchesCe: boolean;
  touchesFar: boolean;
  bodyDirection: CandleBodyDirection;
  favorBody: FirstTouchBody;
};

type CloseEntryRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  closeEntryOrdinal: number;
  entryFrom: CloseEntryFrom;
  reentryKind: CloseReentryKind;
  time: number;
  entryClose: number;
  entryPenetration: number;
  entrySection: CloseEntrySection;
  priorWickPokes: number;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarHalf: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
  outcome: CloseEntryOutcome;
  barsToOutcome: number | null;
  riskPct: number;
  mfeR: number;
  winByTarget: Record<number, 0 | 1>;
};

type SequenceRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  firstTouchKind: 'wick' | 'close';
  bucket: SequenceBucket;
  compressed: string;
  insideEpisodes: number;
  farBreaks: number;
  farReentries: number;
  finalState: CoarseState;
  bars: number;
};

type TransitionRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  ordinal: number;
  time: number;
  barsFromConfirm: number;
  state: RawState;
  normalizedState: CoarseState;
  close: number;
  penetration: number;
};

type ZoneResolution = {
  outcome: CloseEntryOutcome;
  barsToOutcome: number | null;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarHalf: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
};

type InvalidationBreachKind = 'noFarBreach' | 'wickSweepOnly' | 'closeBreak';
type ReclaimSpeed = 'noReclaim' | '1bar' | '2to3' | '4to8' | '9plus';
type MidAcceptanceBucket = 'noMidTouch' | 'midWickReject' | 'singleCloseBeyond' | 'accepted2Plus';
type LiquiditySweepKind = 'noLevel' | 'none' | 'wickSweep' | 'closeBreak' | 'closeBreakReclaimed';
type StructureBreakKind = 'favorableBreak' | 'adverseBreak' | 'none';
type PreTouchApproachBucket =
  | 'insufficientData'
  | 'fromFarSide'
  | 'impulseIntoZone'
  | 'steadyGrindIntoZone'
  | 'compressedDrift'
  | 'wickyNoise'
  | 'sideways'
  | 'mixed';
type PreTouchSpeedBucket = 'slow' | 'normal' | 'fast';
type PreTouchVolBucket = 'compressed' | 'neutral' | 'expanding';
type PreTouchBodyBucket = 'bodyDriven' | 'balanced' | 'wickDriven';
type ZoneQualityBucket = 'strongDisplacement' | 'wideVolatile' | 'thinClean' | 'wickyOrigin' | 'normal' | 'unknown';
type WidthAtrBucket = 'thin' | 'normal' | 'wide' | 'veryWide' | 'unknown';
type PremiumDiscountBucket = 'deepDiscount' | 'discount' | 'equilibrium' | 'premium' | 'deepPremium' | 'unknown';
type DecayBucket = 'sameWeek' | 'freshMonth' | 'agedQuarter' | 'old' | 'noTouch';
type DwellBucket = 'none' | 'oneBar' | 'twoToThree' | 'fourToEight' | 'ninePlus';
type NestedTimingBucket = 'none' | 'beforeTouch' | 'afterTouch' | 'both';
type NestedDirectionBucket = 'none' | 'sameDirection' | 'oppositeDirection' | 'mixed';
type TargetLiquidityBucket = 'noLevel' | 'behindPrice' | 'near' | 'normal' | 'far';
type BtcBias = 'up' | 'down' | 'range' | 'unknown' | 'self';
type BtcSync = 'aligned' | 'against' | 'btcRange' | 'unknown' | 'self';
type BrokenZonePath =
  | 'breakNoReentry'
  | 'failedReclaim'
  | 'polarityFlip'
  | 'trueReclaim'
  | 'chopOpen';
type BrokenReclaimDepth = 'none' | 'farHalfOnly' | 'midReached' | 'nearSideReached' | 'nearExit';
type BrokenReentrySpeed = 'noReentry' | 'sameBar' | '1to3' | '4to12' | '13to48' | '49plus';
type BrokenRebreakSpeed = 'noRebreak' | 'sameBar' | '1to3' | '4to12' | '13plus';
type ContinuationOrder = 'noContinuation' | 'beforeReentry' | 'beforeTrueReclaim' | 'afterTrueReclaim' | 'afterFailedReclaim';
type BrokenStrategyCandidate = 'continuationClean' | 'failedReclaimShort' | 'polarityFlipShort' | 'trueReclaimRisky' | 'avoidChop';
type BrokenStrategySignalKind = 'breakClose' | 'rebreakClose' | 'trueReclaimClose' | 'avoidChopSnapshot';
type BrokenForwardOutcome = 'continuation1x' | 'reentry' | 'oppositeReclaim' | 'mixedSameBar' | 'unresolved';
type BrokenAdverseReclaimBucket = 'none' | 'farEdgeOnly' | 'farHalf' | 'midReached' | 'nearSideReached' | 'nearOutside';
type FvgDwellPenaltyBucket = 'notFvg' | 'shortDwell' | 'mediumDwell' | 'longDwell';

type PreTouchWindowStats = {
  bars: number;
  startClose: number;
  endClose: number;
  closeMovePct: number;
  towardZonePct: number;
  avgRangePct: number;
  avgTrueRangePct: number;
  towardAtr: number;
  speedAtr: number;
  bodyRatio: number;
  wickRatio: number;
  rangeCompression: number;
  towardBars: number;
  oppositeBars: number;
  maxConsecutiveToward: number;
};

type InvalidationBehaviorRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  firstTouchKind: 'wick' | 'close';
  firstBreachKind: InvalidationBreachKind;
  barsToFirstBreach: number | null;
  wickCloseState: CloseState | null;
  eventualCloseBreak: boolean;
  barsToCloseBreak: number | null;
  nearExitAfterBreach: boolean;
  barsToNearExit: number | null;
};

type ReclaimBehaviorRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  breakTime: number;
  reclaimed: boolean;
  reclaimSpeed: ReclaimSpeed;
  barsToReclaim: number | null;
  reclaimSection: CloseEntrySection | null;
  outcomeAfterReclaim: CloseEntryOutcome | null;
  barsToOutcome: number | null;
  reachedMid: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
};

type MidAcceptanceRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  closeEntryOrdinal: number;
  reentryKind: CloseReentryKind;
  entrySection: CloseEntrySection;
  bucket: MidAcceptanceBucket;
  midWickTouched: boolean;
  acceptedCloseBars: number;
  maxConsecutiveAccepted: number;
  outcome: CloseEntryOutcome;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
};

type LiquiditySweepRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  level: number | null;
  sweepKind: LiquiditySweepKind;
  barsSweepToTouch: number | null;
  firstTouchKind: 'wick' | 'close';
  outcome: CloseEntryOutcome;
  reachedMid: boolean;
  reachedFarEdge: boolean;
};

type LtfStructureRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: '4H';
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  firstBreak: StructureBreakKind;
  barsToBreak: number | null;
  breakLevel: number | null;
  breakCloseState: CloseState | null;
  outcomeAfterBreak: CloseEntryOutcome;
  reachedMid: boolean;
  reachedFarEdge: boolean;
};

type PreTouchApproachRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  touchTime: number;
  firstTouchKind: 'wick' | 'close';
  approachFrom: CloseState | 'unknown';
  touchPenetration: number;
  bucket: PreTouchApproachBucket;
  speedBucket: PreTouchSpeedBucket;
  volBucket: PreTouchVolBucket;
  bodyBucket: PreTouchBodyBucket;
  statsByLookback: Record<number, PreTouchWindowStats | null>;
  outcome: CloseEntryOutcome;
  barsToOutcome: number | null;
  reachedEq: boolean;
  reachedMid: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
};

type ZoneCreationQuality = {
  bucket: ZoneQualityBucket;
  originBodyRatio: number | null;
  originWickRatio: number | null;
  confirmBodyRatio: number | null;
  confirmBodyAtr: number | null;
  confirmRangeAtr: number | null;
  displacementAtr: number | null;
  zoneWidthAtr: number | null;
};

type PremiumDiscountInfo = {
  bucket: PremiumDiscountBucket;
  rangePos: number | null;
  favorableForDirection: boolean | null;
  swingHigh: number | null;
  swingLow: number | null;
};

type NestedZoneInfo = {
  timing: NestedTimingBucket;
  direction: NestedDirectionBucket;
  childCount: number;
  obCount: number;
  fvgCount: number;
  sameDirectionCount: number;
  oppositeDirectionCount: number;
  firstChildBarsFromTouch: number | null;
};

type TargetLiquidityInfo = {
  bucket: TargetLiquidityBucket;
  level: number | null;
  distanceAtr: number | null;
  reached: boolean | null;
  barsToReach: number | null;
};

type BtcSyncInfo = {
  bias: BtcBias;
  sync: BtcSync;
};

type RemainingSmcBehaviorRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  touchTime: number | null;
  firstTouchKind: 'wick' | 'close' | 'none';
  outcome: CloseEntryOutcome;
  reachedMid: boolean;
  reachedFarEdge: boolean;
  closeBarsInZone: number;
  closeEntryCount: number;
  nearExitEntryCount: number;
  invalidEntryCount: number;
  creation: ZoneCreationQuality;
  premiumDiscount: PremiumDiscountInfo;
  widthAtrBucket: WidthAtrBucket;
  decayBucket: DecayBucket;
  daysToFirstTouch: number | null;
  barsToFirstTouch: number | null;
  dwellBucket: DwellBucket;
  nested: NestedZoneInfo;
  targetLiquidity: TargetLiquidityInfo;
  btc: BtcSyncInfo;
};

type BrokenZoneRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  confluence: ConfluenceInfo;
  regime: TrendRegime;
  breakTime: number;
  barsTouchToBreak: number;
  priorCloseBarsInZone: number;
  priorReachedMid: boolean;
  reentered: boolean;
  barsBreakToReentry: number | null;
  reclaimDepth: BrokenReclaimDepth;
  path: BrokenZonePath;
  midRecovered: boolean;
  nearSideRecovered: boolean;
  trueReclaim: boolean;
  rebreakAfterReentry: boolean;
  continuationHit: boolean;
  barsBreakToContinuation: number | null;
  barsReentryToRebreak: number | null;
  barsReentryToResolution: number | null;
  maxReclaimPenetration: number | null;
};

type BrokenZoneDetailRec = BrokenZoneRec & {
  reentrySpeed: BrokenReentrySpeed;
  rebreakSpeed: BrokenRebreakSpeed;
  continuationOrder: ContinuationOrder;
  strategyCandidate: BrokenStrategyCandidate;
  fastFailedReclaim: boolean;
  slowReclaim: boolean;
  cleanContinuation: boolean;
  trueReclaimBeforeContinuation: boolean;
  fvgFillBucket: string;
};

type BrokenStrategyForwardRec = BrokenZoneDetailRec & {
  signalTime: number;
  signalBarsFromBreak: number;
  signalKind: BrokenStrategySignalKind;
  forwardBars: number;
  continuation05Hit: boolean;
  barsToContinuation05: number | null;
  continuation1Hit: boolean;
  barsToContinuation1: number | null;
  continuation2Hit: boolean;
  barsToContinuation2: number | null;
  reentryAfterSignal: boolean;
  barsToReentryAfterSignal: number | null;
  oppositeReclaimAfterSignal: boolean;
  barsToOppositeReclaim: number | null;
  firstForwardOutcome: BrokenForwardOutcome;
  barsToFirstForwardOutcome: number | null;
  maxContinuationWidth: number;
  maxAdverseReclaimDepth: number;
  adverseReclaimBucket: BrokenAdverseReclaimBucket;
  fvgDwellPenalty: FvgDwellPenaltyBucket;
};

type SelfCheck = {
  name: string;
  checked: number;
  failures: string[];
};

function tfRank(tf: ZoneTf): number {
  return tf === '1M' ? 3 : tf === '1W' ? 2 : 1;
}

function relDiffPct(a: number, b: number): number {
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}

function boxesOverlap(a: Zone, b: Zone): boolean {
  return Math.max(a.low, b.low) <= Math.min(a.high, b.high);
}

function confluenceLevels(z: Zone): number[] {
  const eq = eqBox(z.low, z.high, true);
  return [z.low, eq.low, z.mid, eq.high, z.high];
}

function hasLevelCluster(a: Zone, b: Zone): boolean {
  const al = confluenceLevels(a);
  const bl = confluenceLevels(b);
  return al.some(x => bl.some(y => relDiffPct(x, y) <= CONFLUENCE_PCT));
}

function obFvgPair(a: Zone, b: Zone): { ob: Zone; fvg: Zone } | null {
  if (a.zoneType === 'OB' && b.zoneType === 'FVG') return { ob: a, fvg: b };
  if (a.zoneType === 'FVG' && b.zoneType === 'OB') return { ob: b, fvg: a };
  return null;
}

function fvgEqOverlapsObBox(ob: Zone, fvg: Zone): boolean {
  const eq = eqBox(fvg.low, fvg.high, true);
  return Math.max(ob.low, eq.low) <= Math.min(ob.high, eq.high);
}

function confluenceForZone(target: MetaZone, allZones: MetaZone[]): ConfluenceInfo {
  let boxOverlapCount = 0;
  let levelClusterCount = 0;
  let hasHtf = false;
  let hasObFvg = false;
  const combos: Record<ConfluenceCombo, boolean> = {
    obBoxFvgEq: false,
    obMidFvgCe: false,
    obMidFvgEdge: false,
    htfMidCluster: false,
  };

  for (const other of allZones) {
    if (other.zoneId === target.zoneId) continue;
    if (other.symbol !== target.symbol) continue;
    if (other.confirmTime > target.confirmTime) continue; // lookahead 방지

    const box = boxesOverlap(target, other);
    const level = hasLevelCluster(target, other);
    if (!box && !level) continue;

    if (box) boxOverlapCount++;
    if (level) levelClusterCount++;
    if (tfRank(other.zoneTf) > tfRank(target.zoneTf)) hasHtf = true;
    if (other.zoneType !== target.zoneType) hasObFvg = true;

    const pair = obFvgPair(target, other);
    if (pair) {
      if (fvgEqOverlapsObBox(pair.ob, pair.fvg)) combos.obBoxFvgEq = true;
      if (relDiffPct(pair.ob.mid, pair.fvg.mid) <= CONFLUENCE_PCT) combos.obMidFvgCe = true;
      if (relDiffPct(pair.ob.mid, pair.fvg.low) <= CONFLUENCE_PCT || relDiffPct(pair.ob.mid, pair.fvg.high) <= CONFLUENCE_PCT) {
        combos.obMidFvgEdge = true;
      }
    }
    if (tfRank(target.zoneTf) >= 2 && tfRank(other.zoneTf) >= 2 && target.zoneTf !== other.zoneTf && relDiffPct(target.mid, other.mid) <= CONFLUENCE_PCT) {
      combos.htfMidCluster = true;
    }
  }

  const hasBox = boxOverlapCount > 0;
  const hasLevel = levelClusterCount > 0;
  const bucket: ConfluenceBucket =
    hasBox && hasLevel ? 'boxAndLevel' :
      hasBox ? 'boxOnly' :
        hasLevel ? 'levelOnly' :
          'none';

  return {
    bucket,
    boxOverlapCount,
    levelClusterCount,
    combos,
    hasAny: bucket !== 'none',
    hasHtf,
    hasObFvg,
  };
}

function meanClose(candles: Candle[], start: number, endExclusive: number): number {
  const slice = candles.slice(start, endExclusive);
  return avg(slice.map(c => c.close));
}

function regimeAt(zone: Zone, candles: Candle[], idx: number): TrendRegime {
  if (idx < 70) return 'unknown';
  const ma20 = meanClose(candles, idx - 19, idx + 1);
  const ma60 = meanClose(candles, idx - 59, idx + 1);
  const ma20Prev = meanClose(candles, idx - 29, idx - 9);
  if (!Number.isFinite(ma20) || !Number.isFinite(ma60) || !Number.isFinite(ma20Prev) || ma20Prev <= 0) return 'unknown';

  const slopePct = ((ma20 - ma20Prev) / ma20Prev) * 100;
  const direction = Math.abs(slopePct) < 0.5 || Math.abs(ma20 - ma60) / ma60 * 100 < 0.75
    ? 'range'
    : ma20 > ma60 && slopePct > 0
      ? 'up'
      : ma20 < ma60 && slopePct < 0
        ? 'down'
        : 'range';
  if (direction === 'range') return 'range';
  const zoneLong = zone.direction === 'bull';
  return (zoneLong && direction === 'up') || (!zoneLong && direction === 'down') ? 'withTrend' : 'againstTrend';
}

/** 지정가/종가확인 체결 + RR 시뮬 (관측 캔들·봉 지평 인자화). 체결 전 무효화·미체결이면 null. */
function simEntry(
  entryPrice: number, sl: number, favorUp: boolean,
  candles: Candle[], touchIdx: number, fwdBars: number, fillBars: number, entrySignal: EntrySignal,
): { riskPct: number; mfeR: number; winByTarget: Record<number, 0 | 1>; sameBarConflict: boolean } | null {
  const invalidated = (c: Candle) => favorUp ? c.close < sl : c.close > sl;
  let entryIdx = -1, actualEntry = entryPrice;
  for (let i = touchIdx; i < Math.min(candles.length, touchIdx + fillBars + 1); i++) {
    const c = candles[i];
    if (invalidated(c)) return null;
    const touched = favorUp ? c.low <= entryPrice : c.high >= entryPrice;
    if (entrySignal === 'wick') {
      if (touched) { entryIdx = i; break; }
    } else {
      const closedFavor = favorUp ? c.close >= entryPrice : c.close <= entryPrice;
      if (touched && closedFavor) { entryIdx = i; actualEntry = c.close; break; }
    }
  }
  if (entryIdx < 0) return null;
  const risk = Math.abs(actualEntry - sl);
  if (risk <= 0) return null;
  const tp = (r: number) => favorUp ? actualEntry + r * risk : actualEntry - r * risk;

  let mfeR = 0;
  let sameBarConflict = false; // SL 도달 봉에서 2R TP도 같은 봉 안에 도달 가능했나(보수 처리로 손실 집계)
  const hit: Record<number, boolean> = {};
  for (let k = 1; k <= fwdBars; k++) {
    const c = candles[entryIdx + k];
    if (!c) break;
    const favExc = favorUp ? (c.high - actualEntry) : (actualEntry - c.low);
    if (favExc / risk > mfeR) mfeR = favExc / risk;
    const slHit = favorUp ? c.low <= sl : c.high >= sl;
    if (slHit) {
      const tp2 = tp(2);
      const tp2Hit = favorUp ? c.high >= tp2 : c.low <= tp2;
      if (tp2Hit && !hit[2]) sameBarConflict = true;
      break; // SL 우선
    }
    for (const t of RR_TARGETS) {
      if (!hit[t] && (favorUp ? c.high >= tp(t) : c.low <= tp(t))) hit[t] = true;
    }
  }
  const winByTarget: Record<number, 0 | 1> = {};
  for (const t of RR_TARGETS) winByTarget[t] = hit[t] ? 1 : 0;
  return { riskPct: (risk / actualEntry) * 100, mfeR, winByTarget, sameBarConflict };
}

/** 존 1개를 지정 관측 TF 캔들로 시뮬 (4개 깊이). 시간 지평 고정 → 봉 수 환산. */
function levelTradesForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): LevelTrade[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];
  const favorUp = zone.direction === 'bull';
  const eq = eqBox(zone.low, zone.high, true);
  const sl = favorUp ? zone.low : zone.high;        // 원단 = 손절
  const proximal = favorUp ? zone.high : zone.low;  // 근단 = 첫 터치
  const priceOf: Record<DepthLevel, number> = {
    edge: proximal,
    eqNear: favorUp ? eq.high : eq.low,
    mid50: zone.mid,
    eqFar: favorUp ? eq.low : eq.high,
  };
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const fillBars = Math.max(1, Math.round(FILL_DAYS / BAR_DAYS[observeTf]));

  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];
  let touchIdx = -1;
  for (let i = startIdx; i < observe.length; i++) {
    if (observe[i].high >= zone.low && observe[i].low <= zone.high) { touchIdx = i; break; }
  }
  if (touchIdx < 0) return [];
  const regime = regimeAt(zone, observe, touchIdx);
  const ageDays = (observe[touchIdx].time - zone.confirmTime) / 86400;

  const out: LevelTrade[] = [];
  for (const depth of DEPTH_LEVELS) {
    for (const entrySignal of ENTRY_SIGNALS) {
      const r = simEntry(priceOf[depth], sl, favorUp, observe, touchIdx, fwdBars, fillBars, entrySignal);
      if (r) out.push({ symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, depth, entrySignal, confluence, regime, ageDays, ...r });
    }
  }
  return out;
}

function penetrationOfPrice(zone: Zone, favorUp: boolean, price: number): number {
  const width = zone.high - zone.low;
  return favorUp ? (zone.high - price) / width : (price - zone.low) / width;
}

function deepestPenetrationOfCandle(zone: Zone, favorUp: boolean, c: Candle): number {
  const width = zone.high - zone.low;
  return favorUp ? (zone.high - c.low) / width : (c.high - zone.low) / width;
}

function closeStateOf(zone: Zone, favorUp: boolean, c: Candle): CloseState {
  const p = penetrationOfPrice(zone, favorUp, c.close);
  if (p < 0) return 'nearOutside';
  if (p <= 0.382) return 'nearInside';
  if (p <= 0.618) return 'eqInside';
  if (p <= 1) return 'farInside';
  return 'farOutside';
}

function deepestBucket(p: number): DeepestZone {
  if (p < 0.382) return 'edgeOnly';
  if (p < 0.5) return 'eqOnly';
  if (p < 0.618) return 'mid50';
  if (p < 1) return 'farHalf';
  return 'farEdge';
}

function pathOutcomeForState(state: CloseState, firstTouchKind: 'wick' | 'close', k: number): PathOutcome | null {
  if (state === 'farOutside') return 'invalidated';
  if (state === 'nearOutside') return firstTouchKind === 'wick' && k === 0 ? 'wickReject' : 'favorExit';
  return null;
}

/** 존 내부 경로 분석: 첫터치 이후 edge→EQ→mid50→far로 얼마나 침투하고 어디로 이탈하는지. */
function pathForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): PathRec | null {
  const width = zone.high - zone.low;
  if (width <= 0) return null;
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return null;

  const favorUp = zone.direction === 'bull';
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return null;

  let touchIdx = -1;
  for (let i = startIdx; i < observe.length; i++) {
    if (observe[i].high >= zone.low && observe[i].low <= zone.high) { touchIdx = i; break; }
  }
  if (touchIdx < 0) return null;

  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const first = observe[touchIdx];
  const regime = regimeAt(zone, observe, touchIdx);
  const firstCloseState = closeStateOf(zone, favorUp, first);
  const firstTouchKind: 'wick' | 'close' =
    first.close >= zone.low && first.close <= zone.high ? 'close' : 'wick';

  let maxPenetration = deepestPenetrationOfCandle(zone, favorUp, first);
  let closeBarsInZone = firstCloseState === 'nearInside' || firstCloseState === 'eqInside' || firstCloseState === 'farInside' ? 1 : 0;
  let outcome: PathOutcome = pathOutcomeForState(firstCloseState, firstTouchKind, 0) ?? 'open';
  let barsToOutcome: number | null = outcome === 'open' ? null : 0;

  for (let k = 1; k <= fwdBars && outcome === 'open'; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    const pen = deepestPenetrationOfCandle(zone, favorUp, c);
    if (pen > maxPenetration) maxPenetration = pen;
    const state = closeStateOf(zone, favorUp, c);
    if (state === 'nearInside' || state === 'eqInside' || state === 'farInside') closeBarsInZone++;
    const resolved = pathOutcomeForState(state, firstTouchKind, k);
    if (resolved) {
      outcome = resolved;
      barsToOutcome = k;
    }
  }

  return {
    symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, confluence, regime,
    firstTouchKind, firstCloseState,
    deepest: deepestBucket(maxPenetration),
    outcome,
    reachedEq: maxPenetration >= 0.382,
    reachedMid: maxPenetration >= 0.5,
    reachedFarHalf: maxPenetration >= 0.618,
    closeBarsInZone,
    barsToOutcome,
  };
}

function closeEntrySection(p: number): CloseEntrySection {
  if (p < 0.382) return 'near';
  if (p < 0.5) return 'eqNear';
  if (p <= 0.618) return 'eqFar';
  return 'far';
}

function closeEntrySectionLabel(section: CloseEntrySection): string {
  return ({
    near: 'near',
    eqNear: 'EQ근단',
    eqFar: 'EQ원단',
    far: 'far',
  } as const)[section];
}

function closeEntryFromLabel(from: CloseEntryFrom): string {
  return ({
    nearOutside: '근단 밖',
    farOutside: '손절쪽 밖',
    unknown: '초기/불명',
  } as const)[from];
}

function closeReentryKindLabel(kind: CloseReentryKind): string {
  return ({
    firstCloseIn: '첫 종가진입',
    afterNearExit: '근단이탈 후 재진입',
    afterFarExit: '손절쪽 이탈 후 재진입',
    afterOpen: '미결 이후 재진입',
  } as const)[kind];
}

function closeEntryOutcomeForState(state: CloseState): CloseEntryOutcome | null {
  if (state === 'nearOutside') return 'nearExit';
  if (state === 'farOutside') return 'invalidated';
  return null;
}

function firstTouchIndex(zone: Zone, observe: Candle[]): number {
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return -1;
  for (let i = startIdx; i < observe.length; i++) {
    if (observe[i].high >= zone.low && observe[i].low <= zone.high) return i;
  }
  return -1;
}

function candleTouchesFarEdge(zone: Zone, favorUp: boolean, c: Candle): boolean {
  return favorUp ? c.low <= zone.low : c.high >= zone.high;
}

function closeBreaksFarEdge(zone: Zone, favorUp: boolean, c: Candle): boolean {
  return favorUp ? c.close < zone.low : c.close > zone.high;
}

function closeInZone(zone: Zone, c: Candle): boolean {
  return c.close >= zone.low && c.close <= zone.high;
}

function scanZoneResolution(zone: Zone, favorUp: boolean, observe: Candle[], startIdx: number, fwdBars: number, includeStart = true): ZoneResolution {
  let maxPenetration = -Infinity;
  let closeBarsInZone = 0;
  let outcome: CloseEntryOutcome = 'open';
  let barsToOutcome: number | null = null;
  const firstK = includeStart ? 0 : 1;

  for (let k = firstK; k <= fwdBars; k++) {
    const c = observe[startIdx + k];
    if (!c) break;
    const pen = deepestPenetrationOfCandle(zone, favorUp, c);
    if (pen > maxPenetration) maxPenetration = pen;
    const state = closeStateOf(zone, favorUp, c);
    if (state === 'nearInside' || state === 'eqInside' || state === 'farInside') closeBarsInZone++;
    const resolved = closeEntryOutcomeForState(state);
    if (resolved && outcome === 'open') {
      outcome = resolved;
      barsToOutcome = k;
      break;
    }
  }

  const p = maxPenetration === -Infinity ? 0 : maxPenetration;
  return {
    outcome,
    barsToOutcome,
    reachedEq: p >= 0.382,
    reachedMid: p >= 0.5,
    reachedFarHalf: p >= 0.618,
    reachedFarEdge: p >= 1,
    closeBarsInZone,
  };
}

function firstTouchClosePosition(state: CloseState): FirstTouchClosePosition {
  return ({
    nearOutside: 'favorOutside',
    nearInside: 'nearInside',
    eqInside: 'eqInside',
    farInside: 'farInside',
    farOutside: 'invalidOutside',
  } as const)[state];
}

function firstTouchBody(favorUp: boolean, c: Candle): FirstTouchBody {
  if (c.close === c.open) return 'doji';
  const favorClose = favorUp ? c.close > c.open : c.close < c.open;
  return favorClose ? 'favorClose' : 'againstClose';
}

function firstTouchForwardStats(zone: Zone, favorUp: boolean, observeTf: ObserveTf, observe: Candle[], touchIdx: number, days: number): FirstTouchForwardStats {
  const width = zone.high - zone.low;
  const bars = Math.max(1, Math.round(days / BAR_DAYS[observeTf]));
  const base = observe[touchIdx].close;
  let observedBars = 0;
  let nearExit = false;
  let invalidated = false;
  let reenteredZone = false;
  let reachedEq = false;
  let reachedMid = false;
  let reachedFarHalf = false;
  let reachedFarEdge = false;
  let closeBarsInZone = 0;
  let maxFavorPct = 0;
  let maxAdversePct = 0;
  let maxFavorZone = 0;
  let maxAdverseZone = 0;
  let barsToNearExit: number | null = null;
  let barsToInvalidation: number | null = null;
  let barsToReentry: number | null = null;
  let barsToMaxFavor: number | null = null;
  let barsToMaxAdverse: number | null = null;

  for (let k = 1; k <= bars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    observedBars++;

    const state = closeStateOf(zone, favorUp, c);
    const isInside = state === 'nearInside' || state === 'eqInside' || state === 'farInside';
    if (isInside) {
      closeBarsInZone++;
      if (!reenteredZone) {
        reenteredZone = true;
        barsToReentry = k;
      }
    }
    if (state === 'nearOutside' && !nearExit) {
      nearExit = true;
      barsToNearExit = k;
    }
    if (state === 'farOutside' && !invalidated) {
      invalidated = true;
      barsToInvalidation = k;
    }

    const pen = deepestPenetrationOfCandle(zone, favorUp, c);
    if (pen >= 0.382) reachedEq = true;
    if (pen >= 0.5) reachedMid = true;
    if (pen >= 0.618) reachedFarHalf = true;
    if (pen >= 1) reachedFarEdge = true;

    const favorMove = favorUp ? c.high - base : base - c.low;
    const adverseMove = favorUp ? base - c.low : c.high - base;
    const favorPct = base > 0 ? Math.max(0, favorMove / base * 100) : 0;
    const adversePct = base > 0 ? Math.max(0, adverseMove / base * 100) : 0;
    const favorZone = width > 0 ? Math.max(0, favorMove / width) : 0;
    const adverseZone = width > 0 ? Math.max(0, adverseMove / width) : 0;

    if (favorPct > maxFavorPct) {
      maxFavorPct = favorPct;
      maxFavorZone = favorZone;
      barsToMaxFavor = k;
    }
    if (adversePct > maxAdversePct) {
      maxAdversePct = adversePct;
      maxAdverseZone = adverseZone;
      barsToMaxAdverse = k;
    }
  }

  return {
    days,
    bars,
    observedBars,
    complete: observedBars >= bars,
    nearExit,
    invalidated,
    reenteredZone,
    reachedEq,
    reachedMid,
    reachedFarHalf,
    reachedFarEdge,
    closeBarsInZone,
    maxFavorPct,
    maxAdversePct,
    maxFavorZone,
    maxAdverseZone,
    barsToNearExit,
    barsToInvalidation,
    barsToReentry,
    barsToMaxFavor,
    barsToMaxAdverse,
  };
}

function firstTouchPreWindowStats(zone: Zone, favorUp: boolean, observe: Candle[], touchIdx: number, lookback: number): FirstTouchPreWindowStats | null {
  const startIdx = touchIdx - lookback;
  const endIdx = touchIdx - 1;
  if (startIdx < 1 || endIdx < startIdx) return null;
  const width = zone.high - zone.low;
  const start = observe[startIdx];
  const end = observe[endIdx];
  const movementStart = observe[startIdx - 1] ?? start;
  const bars = observe.slice(startIdx, touchIdx);

  const startPen = penetrationOfPrice(zone, favorUp, movementStart.close);
  const endPen = penetrationOfPrice(zone, favorUp, end.close);
  const startDist = distanceToZoneFromPenetration(startPen) * width;
  const endDist = distanceToZoneFromPenetration(endPen) * width;
  const towardMove = startDist - endDist;

  let rangeSum = 0;
  let trueRangeSum = 0;
  let bodySum = 0;
  let towardBars = 0;
  let oppositeBars = 0;
  let run = 0;
  let maxRun = 0;
  for (let i = startIdx; i < touchIdx; i++) {
    const c = observe[i];
    const prev = observe[i - 1] ?? null;
    const range = c.high - c.low;
    rangeSum += c.close > 0 ? (range / c.close) * 100 : 0;
    trueRangeSum += trueRangePct(c, prev);
    bodySum += range > 0 ? Math.abs(c.close - c.open) / range : 0;

    const prevPen = penetrationOfPrice(zone, favorUp, prev?.close ?? c.open);
    const currPen = penetrationOfPrice(zone, favorUp, c.close);
    const prevDist = distanceToZoneFromPenetration(prevPen);
    const currDist = distanceToZoneFromPenetration(currPen);
    if (currDist < prevDist) {
      towardBars++;
      run++;
      if (run > maxRun) maxRun = run;
    } else if (currDist > prevDist) {
      oppositeBars++;
      run = 0;
    } else {
      run = 0;
    }
  }

  const firstHalf = bars.slice(0, Math.max(1, bars.length - Math.min(3, bars.length)));
  const lastPart = bars.slice(Math.max(0, bars.length - Math.min(3, bars.length)));
  const avgRange = (xs: Candle[]) => avg(xs.map(c => c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0));
  const rangeCompression = avgRange(firstHalf) > 0 ? avgRange(lastPart) / avgRange(firstHalf) : 1;
  const avgTrueRangePct = trueRangeSum / bars.length;
  const avgRangePct = rangeSum / bars.length;
  const bodyRatio = bodySum / bars.length;
  const closeMovePct = movementStart.close > 0 ? ((end.close - movementStart.close) / movementStart.close) * 100 : 0;
  const towardZonePct = movementStart.close > 0 ? (towardMove / movementStart.close) * 100 : 0;
  const avgTrPrice = avgTrueRangePct > 0 ? (avgTrueRangePct / 100) * end.close : 0;
  const lastRange = end.high - end.low;
  const lastRangePct = end.close > 0 ? (lastRange / end.close) * 100 : 0;
  const lastBodyRatio = lastRange > 0 ? Math.abs(end.close - end.open) / lastRange : 0;
  const lastClosePenetration = penetrationOfPrice(zone, favorUp, end.close);

  return {
    lookback,
    bars: bars.length,
    startClose: movementStart.close,
    endClose: end.close,
    closeMovePct,
    towardZonePct,
    avgRangePct,
    avgTrueRangePct,
    towardAtr: avgTrPrice > 0 ? towardMove / avgTrPrice : 0,
    speedAtr: avgTrPrice > 0 ? Math.abs(end.close - movementStart.close) / avgTrPrice : 0,
    bodyRatio,
    wickRatio: 1 - bodyRatio,
    rangeCompression,
    towardBars,
    oppositeBars,
    maxConsecutiveToward: maxRun,
    lastClosePenetration,
    lastCloseState: closeStateOf(zone, favorUp, end),
    lastDistanceToZone: distanceToZoneFromPenetration(lastClosePenetration),
    lastRangePct,
    lastBodyRatio,
    lastWickRatio: 1 - lastBodyRatio,
  };
}

function emptyFirstTouchCloseDistribution(): FirstTouchCloseDistribution {
  return {
    favorOutside: 0,
    nearInside: 0,
    eqInside: 0,
    farInside: 0,
    invalidOutside: 0,
  };
}

function zoneTouchedByCandle(zone: Zone, c: Candle): boolean {
  return c.high >= zone.low && c.low <= zone.high;
}

function firstTouchRevisitStats(zone: Zone, favorUp: boolean, observeTf: ObserveTf, observe: Candle[], touchIdx: number, days: number): FirstTouchRevisitStats {
  const bars = Math.max(1, Math.round(days / BAR_DAYS[observeTf]));
  let observedBars = 0;
  let firstRevisitKind: FirstTouchRevisitKind = 'none';
  let barsToFirstRevisit: number | null = null;
  let firstRevisitClosePosition: FirstTouchClosePosition | null = null;
  let nearRetouchEpisodes = 0;
  let midTouchEpisodes = 0;
  let farEdgeTouchEpisodes = 0;
  let nearTouchBars = 0;
  let midTouchBars = 0;
  let farEdgeTouchBars = 0;
  let barsToFirstNearRetouch: number | null = null;
  let barsToFirstMidTouch: number | null = null;
  let barsToFirstFarEdgeTouch: number | null = null;
  let firstNearRetouchClosePosition: FirstTouchClosePosition | null = null;
  let firstMidTouchClosePosition: FirstTouchClosePosition | null = null;
  let firstFarEdgeTouchClosePosition: FirstTouchClosePosition | null = null;
  const nearRetouchCloseDistribution = emptyFirstTouchCloseDistribution();
  const midTouchCloseDistribution = emptyFirstTouchCloseDistribution();
  const farEdgeTouchCloseDistribution = emptyFirstTouchCloseDistribution();
  let nearActive = false;
  let midActive = false;
  let farActive = false;

  for (let k = 1; k <= bars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    observedBars++;

    const pen = deepestPenetrationOfCandle(zone, favorUp, c);
    const nearTouched = zoneTouchedByCandle(zone, c);
    const midTouched = pen >= 0.5;
    const farTouched = pen >= 1;
    const closePosition = firstTouchClosePosition(closeStateOf(zone, favorUp, c));
    const revisitKind: FirstTouchRevisitKind = farTouched ? 'farEdgeTouch' : midTouched ? 'midTouch' : nearTouched ? 'nearRetouch' : 'none';
    if (firstRevisitKind === 'none' && revisitKind !== 'none') {
      firstRevisitKind = revisitKind;
      barsToFirstRevisit = k;
      firstRevisitClosePosition = closePosition;
    }

    if (nearTouched) {
      nearTouchBars++;
      if (!nearActive) {
        nearRetouchEpisodes++;
        nearRetouchCloseDistribution[closePosition]++;
        if (barsToFirstNearRetouch === null) {
          barsToFirstNearRetouch = k;
          firstNearRetouchClosePosition = closePosition;
        }
      }
    }
    if (midTouched) {
      midTouchBars++;
      if (!midActive) {
        midTouchEpisodes++;
        midTouchCloseDistribution[closePosition]++;
        if (barsToFirstMidTouch === null) {
          barsToFirstMidTouch = k;
          firstMidTouchClosePosition = closePosition;
        }
      }
    }
    if (farTouched) {
      farEdgeTouchBars++;
      if (!farActive) {
        farEdgeTouchEpisodes++;
        farEdgeTouchCloseDistribution[closePosition]++;
        if (barsToFirstFarEdgeTouch === null) {
          barsToFirstFarEdgeTouch = k;
          firstFarEdgeTouchClosePosition = closePosition;
        }
      }
    }

    nearActive = nearTouched;
    midActive = midTouched;
    farActive = farTouched;
  }

  return {
    days,
    bars,
    observedBars,
    complete: observedBars >= bars,
    firstRevisitKind,
    barsToFirstRevisit,
    firstRevisitClosePosition,
    nearRetouchEpisodes,
    midTouchEpisodes,
    farEdgeTouchEpisodes,
    nearTouchBars,
    midTouchBars,
    farEdgeTouchBars,
    barsToFirstNearRetouch,
    barsToFirstMidTouch,
    barsToFirstFarEdgeTouch,
    firstNearRetouchClosePosition,
    firstMidTouchClosePosition,
    firstFarEdgeTouchClosePosition,
    nearRetouchCloseDistribution,
    midTouchCloseDistribution,
    farEdgeTouchCloseDistribution,
  };
}

function firstTouchAnatomyForZone(
  symbol: string,
  zoneId: string,
  confluence: ConfluenceInfo,
  zoneTf: ZoneTf,
  observeTf: ObserveTf,
  zone: Zone,
  observe: Candle[],
): FirstTouchAnatomyRec | null {
  const width = zone.high - zone.low;
  if (width <= 0) return null;
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return null;

  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;

  const favorUp = zone.direction === 'bull';
  const first = observe[touchIdx];
  const closeState = closeStateOf(zone, favorUp, first);
  const closePosition = firstTouchClosePosition(closeState);
  const wickPenetration = deepestPenetrationOfCandle(zone, favorUp, first);
  const closePenetration = penetrationOfPrice(zone, favorUp, first.close);
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const resolution = scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars, false);
  const forwardByDays: Record<number, FirstTouchForwardStats> = {};
  for (const days of FIRST_TOUCH_FORWARD_DAYS) {
    forwardByDays[days] = firstTouchForwardStats(zone, favorUp, observeTf, observe, touchIdx, days);
  }
  const preTouchByLookback: Record<number, FirstTouchPreWindowStats | null> = {};
  for (const lookback of FIRST_TOUCH_PRE_LOOKBACKS) {
    preTouchByLookback[lookback] = firstTouchPreWindowStats(zone, favorUp, observe, touchIdx, lookback);
  }
  const revisitByDays: Record<number, FirstTouchRevisitStats> = {};
  for (const days of FIRST_TOUCH_FORWARD_DAYS) {
    revisitByDays[days] = firstTouchRevisitStats(zone, favorUp, observeTf, observe, touchIdx, days);
  }

  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: regimeAt(zone, observe, touchIdx),
    touchTime: first.time,
    zoneLow: zone.low,
    zoneHigh: zone.high,
    zoneMid: zone.mid,
    widthPct,
    firstTouchKind: closeInZone(zone, first) ? 'close' : 'wick',
    wickPrice: favorUp ? first.low : first.high,
    closePrice: first.close,
    wickPenetration,
    closePenetration,
    wickDepth: deepestBucket(wickPenetration),
    closePosition,
    body: firstTouchBody(favorUp, first),
    closeInZone: closeInZone(zone, first),
    wickReject: closePosition === 'favorOutside',
    invalidClose: closePosition === 'invalidOutside',
    ...resolution,
    forwardByDays,
    preTouchByLookback,
    revisitByDays,
  };
}

function candleBodyDirection(c: Candle): CandleBodyDirection {
  if (c.close === c.open) return 'doji';
  return c.close > c.open ? 'bullish' : 'bearish';
}

function candlePenetrationRange(zone: Zone, favorUp: boolean, c: Candle): { min: number; max: number } {
  const a = penetrationOfPrice(zone, favorUp, c.high);
  const b = penetrationOfPrice(zone, favorUp, c.low);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function postTouchRegion(p: number): PostTouchRegion {
  if (p < -1) return 'mirrorFarOutside';
  if (p < -0.5) return 'mirrorFarToCe';
  if (p < 0) return 'mirrorCeToNear';
  if (p < 0.5) return 'nearToCe';
  if (p <= 1) return 'ceToFar';
  return 'farOutside';
}

function postTouchNearestLevel(p: number): PostTouchNearestLevel {
  const levels: Array<{ level: PostTouchNearestLevel; value: number }> = [
    { level: 'mirrorFar', value: -1 },
    { level: 'mirrorCe', value: -0.5 },
    { level: 'near', value: 0 },
    { level: 'ce', value: 0.5 },
    { level: 'far', value: 1 },
  ];
  let best = levels[0];
  let bestDist = Math.abs(p - best.value);
  for (const item of levels.slice(1)) {
    const dist = Math.abs(p - item.value);
    if (dist < bestDist) {
      best = item;
      bestDist = dist;
    }
  }
  return best.level;
}

function postTouchLevelDistance(level: PostTouchNearestLevel, p: number): number {
  return Math.abs(p - ({
    mirrorFar: -1,
    mirrorCe: -0.5,
    near: 0,
    ce: 0.5,
    far: 1,
  } as const)[level]);
}

function rangeTouchesLevel(range: { min: number; max: number }, level: number): boolean {
  return range.min <= level && range.max >= level;
}

function rangeTouchesStudyBand(range: { min: number; max: number }): boolean {
  return range.max >= -1 && range.min <= 1;
}

function postFirstTouchPathRecord(
  symbol: string,
  zoneId: string,
  confluence: ConfluenceInfo,
  zoneTf: ZoneTf,
  observeTf: ObserveTf,
  zone: Zone,
  observe: Candle[],
  touchIdx: number,
  pathKind: PostTouchPathKind,
  sequenceOrdinal: number,
  barsFromFirst: number,
): PostFirstTouchPathRec | null {
  const c = observe[touchIdx + barsFromFirst];
  if (!c) return null;
  const favorUp = zone.direction === 'bull';
  const first = observe[touchIdx];
  const firstCloseState = closeStateOf(zone, favorUp, first);
  const firstClosePosition = firstTouchClosePosition(firstCloseState);
  const range = candlePenetrationRange(zone, favorUp, c);
  const closePenetration = penetrationOfPrice(zone, favorUp, c.close);
  const nearest = postTouchNearestLevel(closePenetration);

  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: regimeAt(zone, observe, touchIdx),
    pathKind,
    sequenceOrdinal,
    barsFromFirst,
    daysFromFirst: barsFromFirst * BAR_DAYS[observeTf],
    time: c.time,
    firstTouchTime: first.time,
    firstTouchKind: closeInZone(zone, first) ? 'close' : 'wick',
    firstClosePosition,
    firstWickDepth: deepestBucket(deepestPenetrationOfCandle(zone, favorUp, first)),
    wickMinPenetration: range.min,
    wickMaxPenetration: range.max,
    closePenetration,
    wickMinRegion: postTouchRegion(range.min),
    wickMaxRegion: postTouchRegion(range.max),
    closeRegion: postTouchRegion(closePenetration),
    closeNearestLevel: nearest,
    closeDistanceToNearest: postTouchLevelDistance(nearest, closePenetration),
    closeCeDistance: Math.abs(closePenetration - 0.5),
    closeNearCeBand: Math.abs(closePenetration - 0.5) <= 0.05,
    closeInActualZone: closePenetration >= 0 && closePenetration <= 1,
    closeInMirrorZone: closePenetration >= -1 && closePenetration < 0,
    touchesMirrorFar: rangeTouchesLevel(range, -1),
    touchesMirrorCe: rangeTouchesLevel(range, -0.5),
    touchesNear: rangeTouchesLevel(range, 0),
    touchesCe: rangeTouchesLevel(range, 0.5),
    touchesFar: rangeTouchesLevel(range, 1),
    bodyDirection: candleBodyDirection(c),
    favorBody: firstTouchBody(favorUp, c),
  };
}

function postFirstTouchPathForZone(
  symbol: string,
  zoneId: string,
  confluence: ConfluenceInfo,
  zoneTf: ZoneTf,
  observeTf: ObserveTf,
  zone: Zone,
  observe: Candle[],
): PostFirstTouchPathRec[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];

  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return [];

  const out: PostFirstTouchPathRec[] = [];
  for (const barOrdinal of POST_FIRST_TOUCH_BARS) {
    const rec = postFirstTouchPathRecord(symbol, zoneId, confluence, zoneTf, observeTf, zone, observe, touchIdx, 'nextBar', barOrdinal, barOrdinal);
    if (rec) out.push(rec);
  }

  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  let touchOrdinal = 1;
  for (let k = 1; k <= fwdBars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    const favorUp = zone.direction === 'bull';
    const range = candlePenetrationRange(zone, favorUp, c);
    if (!rangeTouchesStudyBand(range)) continue;
    touchOrdinal++;
    const rec = postFirstTouchPathRecord(symbol, zoneId, confluence, zoneTf, observeTf, zone, observe, touchIdx, 'levelTouch', touchOrdinal, k);
    if (rec) out.push(rec);
    if (touchOrdinal >= 5) break;
  }

  return out;
}

type StructureLevelSnapshot = { high: number | null; low: number | null };

function buildStructureLevels(candles: Candle[], pivot = STRUCTURE_PIVOT): StructureLevelSnapshot[] {
  const confirmed = new Map<number, { type: 'high' | 'low'; price: number }[]>();
  for (let i = pivot; i < candles.length - pivot; i++) {
    const c = candles[i];
    let swingHigh = true;
    let swingLow = true;
    for (let j = i - pivot; j <= i + pivot; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) swingHigh = false;
      if (candles[j].low <= c.low) swingLow = false;
    }
    const confirmIdx = i + pivot + 1; // pivot 우측 봉까지 닫힌 다음 봉부터 사용
    if (swingHigh && confirmIdx < candles.length) {
      confirmed.set(confirmIdx, [...(confirmed.get(confirmIdx) ?? []), { type: 'high', price: c.high }]);
    }
    if (swingLow && confirmIdx < candles.length) {
      confirmed.set(confirmIdx, [...(confirmed.get(confirmIdx) ?? []), { type: 'low', price: c.low }]);
    }
  }

  const levels: StructureLevelSnapshot[] = [];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;
  for (let i = 0; i < candles.length; i++) {
    levels[i] = { high: lastHigh, low: lastLow };
    for (const s of confirmed.get(i) ?? []) {
      if (s.type === 'high') lastHigh = s.price;
      else lastLow = s.price;
    }
  }
  return levels;
}

function invalidationBehaviorForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): InvalidationBehaviorRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const regime = regimeAt(zone, observe, touchIdx);
  const firstTouchKind: 'wick' | 'close' = closeInZone(zone, observe[touchIdx]) ? 'close' : 'wick';

  let firstBreachIdx: number | null = null;
  let firstBreachKind: InvalidationBreachKind = 'noFarBreach';
  let wickCloseState: CloseState | null = null;
  let barsToCloseBreak: number | null = null;

  for (let k = 0; k <= fwdBars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    const closeBreak = closeBreaksFarEdge(zone, favorUp, c);
    const wickBreach = candleTouchesFarEdge(zone, favorUp, c);
    if (closeBreak && barsToCloseBreak === null) barsToCloseBreak = k;
    if (firstBreachIdx === null && (closeBreak || wickBreach)) {
      firstBreachIdx = touchIdx + k;
      firstBreachKind = closeBreak ? 'closeBreak' : 'wickSweepOnly';
      wickCloseState = closeBreak ? null : closeStateOf(zone, favorUp, c);
    }
  }

  const scanIdx = firstBreachIdx ?? touchIdx;
  const resolution = scanZoneResolution(zone, favorUp, observe, scanIdx, Math.max(0, touchIdx + fwdBars - scanIdx), true);
  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime,
    firstTouchKind,
    firstBreachKind,
    barsToFirstBreach: firstBreachIdx === null ? null : firstBreachIdx - touchIdx,
    wickCloseState,
    eventualCloseBreak: barsToCloseBreak !== null,
    barsToCloseBreak,
    nearExitAfterBreach: resolution.outcome === 'nearExit',
    barsToNearExit: resolution.outcome === 'nearExit' ? resolution.barsToOutcome : null,
  };
}

function reclaimSpeed(bars: number | null): ReclaimSpeed {
  if (bars === null) return 'noReclaim';
  if (bars <= 1) return '1bar';
  if (bars <= 3) return '2to3';
  if (bars <= 8) return '4to8';
  return '9plus';
}

function reclaimBehaviorForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): ReclaimBehaviorRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));

  let breakIdx = -1;
  for (let k = 0; k <= fwdBars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    if (closeBreaksFarEdge(zone, favorUp, c)) { breakIdx = touchIdx + k; break; }
  }
  if (breakIdx < 0) return null;

  let reclaimIdx: number | null = null;
  for (let i = breakIdx + 1; i <= Math.min(observe.length - 1, touchIdx + fwdBars); i++) {
    if (closeInZone(zone, observe[i])) { reclaimIdx = i; break; }
  }

  const regime = regimeAt(zone, observe, touchIdx);
  if (reclaimIdx === null) {
    return {
      symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, direction: zone.direction, confluence, regime,
      breakTime: observe[breakIdx].time,
      reclaimed: false,
      reclaimSpeed: 'noReclaim',
      barsToReclaim: null,
      reclaimSection: null,
      outcomeAfterReclaim: null,
      barsToOutcome: null,
      reachedMid: false,
      reachedFarEdge: false,
      closeBarsInZone: 0,
    };
  }

  const resolution = scanZoneResolution(zone, favorUp, observe, reclaimIdx, Math.max(0, touchIdx + fwdBars - reclaimIdx), true);
  const pen = penetrationOfPrice(zone, favorUp, observe[reclaimIdx].close);
  const barsToReclaim = reclaimIdx - breakIdx;
  return {
    symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, direction: zone.direction, confluence, regime,
    breakTime: observe[breakIdx].time,
    reclaimed: true,
    reclaimSpeed: reclaimSpeed(barsToReclaim),
    barsToReclaim,
    reclaimSection: closeEntrySection(pen),
    outcomeAfterReclaim: resolution.outcome,
    barsToOutcome: resolution.barsToOutcome,
    reachedMid: resolution.reachedMid,
    reachedFarEdge: resolution.reachedFarEdge,
    closeBarsInZone: resolution.closeBarsInZone,
  };
}

function midAcceptanceForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): MidAcceptanceRec[] {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return [];
  const favorUp = zone.direction === 'bull';
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));

  const out: MidAcceptanceRec[] = [];
  let prevCloseInside = false;
  let closeEntryOrdinal = 0;
  let lastOutcome: CloseEntryOutcome | null = null;

  for (let i = startIdx; i < observe.length; i++) {
    const c = observe[i];
    const inside = closeInZone(zone, c);
    if (inside && !prevCloseInside) {
      const reentryKind: CloseReentryKind =
        closeEntryOrdinal === 0 ? 'firstCloseIn' :
          lastOutcome === 'nearExit' ? 'afterNearExit' :
            lastOutcome === 'invalidated' ? 'afterFarExit' :
              'afterOpen';
      closeEntryOrdinal++;

      let midWickTouched = false;
      let acceptedCloseBars = 0;
      let currentAcceptedRun = 0;
      let maxConsecutiveAccepted = 0;
      let maxPenetration = penetrationOfPrice(zone, favorUp, c.close);
      let closeBarsInZone = 0;
      let outcome: CloseEntryOutcome = 'open';

      for (let k = 0; k <= fwdBars; k++) {
        const f = observe[i + k];
        if (!f) break;
        const pen = deepestPenetrationOfCandle(zone, favorUp, f);
        if (pen > maxPenetration) maxPenetration = pen;
        if (pen >= 0.5) midWickTouched = true;
        const state = closeStateOf(zone, favorUp, f);
        if (state === 'nearInside' || state === 'eqInside' || state === 'farInside') closeBarsInZone++;

        const closePen = penetrationOfPrice(zone, favorUp, f.close);
        const accepted = closePen >= 0.5;
        if (accepted) {
          acceptedCloseBars++;
          currentAcceptedRun++;
          if (currentAcceptedRun > maxConsecutiveAccepted) maxConsecutiveAccepted = currentAcceptedRun;
        } else {
          currentAcceptedRun = 0;
        }

        const resolved = closeEntryOutcomeForState(state);
        if (resolved) {
          outcome = resolved;
          break;
        }
      }

      const bucket: MidAcceptanceBucket =
        !midWickTouched ? 'noMidTouch' :
          acceptedCloseBars === 0 ? 'midWickReject' :
            maxConsecutiveAccepted >= 2 ? 'accepted2Plus' :
              'singleCloseBeyond';
      out.push({
        symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, direction: zone.direction, confluence,
        regime: regimeAt(zone, observe, i),
        closeEntryOrdinal,
        reentryKind,
        entrySection: closeEntrySection(penetrationOfPrice(zone, favorUp, c.close)),
        bucket,
        midWickTouched,
        acceptedCloseBars,
        maxConsecutiveAccepted,
        outcome,
        reachedFarEdge: maxPenetration >= 1,
        closeBarsInZone,
      });
      lastOutcome = outcome;
    }
    prevCloseInside = inside;
  }
  return out;
}

function liquiditySweepForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[], levels: StructureLevelSnapshot[]): LiquiditySweepRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const level = favorUp ? levels[touchIdx]?.low ?? null : levels[touchIdx]?.high ?? null;
  const firstTouchKind: 'wick' | 'close' = closeInZone(zone, observe[touchIdx]) ? 'close' : 'wick';

  let sweepKind: LiquiditySweepKind = level === null ? 'noLevel' : 'none';
  let sweepIdx: number | null = null;
  if (level !== null) {
    const from = Math.max(0, touchIdx - LIQUIDITY_SWEEP_LOOKBACK);
    let firstWickIdx: number | null = null;
    let firstCloseBreakIdx: number | null = null;
    for (let i = from; i <= touchIdx; i++) {
      const c = observe[i];
      const wickSwept = favorUp ? c.low < level : c.high > level;
      const closeBroke = favorUp ? c.close < level : c.close > level;
      if (wickSwept && firstWickIdx === null) firstWickIdx = i;
      if (closeBroke && firstCloseBreakIdx === null) firstCloseBreakIdx = i;
    }
    if (firstCloseBreakIdx !== null) {
      let reclaimed = false;
      for (let i = firstCloseBreakIdx + 1; i <= touchIdx; i++) {
        const c = observe[i];
        if (favorUp ? c.close >= level : c.close <= level) { reclaimed = true; break; }
      }
      sweepKind = reclaimed ? 'closeBreakReclaimed' : 'closeBreak';
      sweepIdx = firstCloseBreakIdx;
    } else if (firstWickIdx !== null) {
      sweepKind = 'wickSweep';
      sweepIdx = firstWickIdx;
    }
  }

  const resolution = scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars, true);
  return {
    symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, direction: zone.direction, confluence,
    regime: regimeAt(zone, observe, touchIdx),
    level,
    sweepKind,
    barsSweepToTouch: sweepIdx === null ? null : touchIdx - sweepIdx,
    firstTouchKind,
    outcome: resolution.outcome,
    reachedMid: resolution.reachedMid,
    reachedFarEdge: resolution.reachedFarEdge,
  };
}

function ltfStructureForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, zone: Zone, fourH: Candle[], levels: StructureLevelSnapshot[]): LtfStructureRec | null {
  if (zoneTf === '1d') return null;
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, fourH);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS['4H']));

  let firstBreak: StructureBreakKind = 'none';
  let breakIdx: number | null = null;
  let breakLevel: number | null = null;
  for (let k = 0; k <= fwdBars; k++) {
    const idx = touchIdx + k;
    const c = fourH[idx];
    if (!c) break;
    const favorLevel = favorUp ? levels[idx]?.high ?? null : levels[idx]?.low ?? null;
    const adverseLevel = favorUp ? levels[idx]?.low ?? null : levels[idx]?.high ?? null;
    const favorable = favorLevel !== null && (favorUp ? c.close > favorLevel : c.close < favorLevel);
    const adverse = adverseLevel !== null && (favorUp ? c.close < adverseLevel : c.close > adverseLevel);
    if (favorable || adverse) {
      firstBreak = favorable ? 'favorableBreak' : 'adverseBreak';
      breakIdx = idx;
      breakLevel = favorable ? favorLevel : adverseLevel;
      break;
    }
  }

  const scanIdx = breakIdx ?? touchIdx;
  const resolution = scanZoneResolution(zone, favorUp, fourH, scanIdx, Math.max(0, touchIdx + fwdBars - scanIdx), true);
  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf: '4H',
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: regimeAt(zone, fourH, touchIdx),
    firstBreak,
    barsToBreak: breakIdx === null ? null : breakIdx - touchIdx,
    breakLevel,
    breakCloseState: breakIdx === null ? null : closeStateOf(zone, favorUp, fourH[breakIdx]),
    outcomeAfterBreak: resolution.outcome,
    reachedMid: resolution.reachedMid,
    reachedFarEdge: resolution.reachedFarEdge,
  };
}

function distanceToZoneFromPenetration(p: number): number {
  if (p < 0) return -p;
  if (p > 1) return p - 1;
  return 0;
}

function trueRangePct(c: Candle, prev: Candle | null): number {
  const tr = prev
    ? Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
    : c.high - c.low;
  return c.close > 0 ? (tr / c.close) * 100 : 0;
}

function preTouchWindowStats(zone: Zone, favorUp: boolean, observe: Candle[], touchIdx: number, lookback: number): PreTouchWindowStats | null {
  const startIdx = touchIdx - lookback;
  const endIdx = touchIdx - 1;
  if (startIdx < 1 || endIdx <= startIdx) return null;
  const width = zone.high - zone.low;
  const start = observe[startIdx];
  const end = observe[endIdx];
  const bars = observe.slice(startIdx, touchIdx);

  const startPen = penetrationOfPrice(zone, favorUp, start.close);
  const endPen = penetrationOfPrice(zone, favorUp, end.close);
  const startDist = distanceToZoneFromPenetration(startPen) * width;
  const endDist = distanceToZoneFromPenetration(endPen) * width;
  const towardMove = startDist - endDist;

  let rangeSum = 0;
  let trueRangeSum = 0;
  let bodySum = 0;
  let towardBars = 0;
  let oppositeBars = 0;
  let run = 0;
  let maxRun = 0;
  for (let i = startIdx; i < touchIdx; i++) {
    const c = observe[i];
    const prev = observe[i - 1] ?? null;
    const range = c.high - c.low;
    rangeSum += c.close > 0 ? (range / c.close) * 100 : 0;
    trueRangeSum += trueRangePct(c, prev);
    bodySum += range > 0 ? Math.abs(c.close - c.open) / range : 0;

    const prevPen = penetrationOfPrice(zone, favorUp, prev?.close ?? c.open);
    const currPen = penetrationOfPrice(zone, favorUp, c.close);
    const prevDist = distanceToZoneFromPenetration(prevPen);
    const currDist = distanceToZoneFromPenetration(currPen);
    if (currDist < prevDist) {
      towardBars++;
      run++;
      if (run > maxRun) maxRun = run;
    } else if (currDist > prevDist) {
      oppositeBars++;
      run = 0;
    } else {
      run = 0;
    }
  }

  const firstHalf = bars.slice(0, Math.max(1, bars.length - Math.min(3, bars.length)));
  const lastPart = bars.slice(Math.max(0, bars.length - Math.min(3, bars.length)));
  const avgRange = (xs: Candle[]) => avg(xs.map(c => c.close > 0 ? ((c.high - c.low) / c.close) * 100 : 0));
  const rangeCompression = avgRange(firstHalf) > 0 ? avgRange(lastPart) / avgRange(firstHalf) : 1;
  const avgTrueRangePct = trueRangeSum / bars.length;
  const avgRangePct = rangeSum / bars.length;
  const bodyRatio = bodySum / bars.length;
  const closeMovePct = start.close > 0 ? ((end.close - start.close) / start.close) * 100 : 0;
  const towardZonePct = start.close > 0 ? (towardMove / start.close) * 100 : 0;
  const avgTrPrice = avgTrueRangePct > 0 ? (avgTrueRangePct / 100) * end.close : 0;

  return {
    bars: bars.length,
    startClose: start.close,
    endClose: end.close,
    closeMovePct,
    towardZonePct,
    avgRangePct,
    avgTrueRangePct,
    towardAtr: avgTrPrice > 0 ? towardMove / avgTrPrice : 0,
    speedAtr: avgTrPrice > 0 ? Math.abs(end.close - start.close) / avgTrPrice : 0,
    bodyRatio,
    wickRatio: 1 - bodyRatio,
    rangeCompression,
    towardBars,
    oppositeBars,
    maxConsecutiveToward: maxRun,
  };
}

function preTouchSpeedBucket(s: PreTouchWindowStats | null): PreTouchSpeedBucket {
  if (!s) return 'normal';
  if (s.speedAtr >= 2 || s.towardAtr >= 2) return 'fast';
  if (s.speedAtr < 0.75 && Math.abs(s.towardAtr) < 0.75) return 'slow';
  return 'normal';
}

function preTouchVolBucket(s: PreTouchWindowStats | null): PreTouchVolBucket {
  if (!s) return 'neutral';
  if (s.rangeCompression <= 0.75) return 'compressed';
  if (s.rangeCompression >= 1.25) return 'expanding';
  return 'neutral';
}

function preTouchBodyBucket(s: PreTouchWindowStats | null): PreTouchBodyBucket {
  if (!s) return 'balanced';
  if (s.bodyRatio >= 0.58) return 'bodyDriven';
  if (s.wickRatio >= 0.58) return 'wickDriven';
  return 'balanced';
}

function preTouchApproachBucket(approachFrom: CloseState | 'unknown', s: PreTouchWindowStats | null): PreTouchApproachBucket {
  if (!s || s.bars < 5) return 'insufficientData';
  if (approachFrom === 'farOutside') return 'fromFarSide';
  if (s.wickRatio >= 0.58 && s.rangeCompression >= 0.9) return 'wickyNoise';
  if (s.rangeCompression <= 0.75 && s.speedAtr < 1.5) return 'compressedDrift';
  if (s.towardAtr >= 2 || (s.maxConsecutiveToward >= 3 && s.speedAtr >= 1.5)) return 'impulseIntoZone';
  if (s.towardBars / s.bars >= 0.6 && s.towardAtr >= 0.5) return 'steadyGrindIntoZone';
  if (Math.abs(s.towardAtr) < 0.5 && s.speedAtr < 1) return 'sideways';
  return 'mixed';
}

function preTouchApproachForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): PreTouchApproachRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const statsByLookback: Record<number, PreTouchWindowStats | null> = {};
  for (const lb of PRE_TOUCH_LOOKBACKS) {
    statsByLookback[lb] = preTouchWindowStats(zone, favorUp, observe, touchIdx, lb);
  }
  const primary = statsByLookback[20] ?? statsByLookback[10] ?? statsByLookback[5] ?? null;
  const prev = observe[touchIdx - 1] ?? null;
  const approachFrom: CloseState | 'unknown' = prev ? closeStateOf(zone, favorUp, prev) : 'unknown';
  const resolution = scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars, true);
  const firstTouchKind: 'wick' | 'close' = closeInZone(zone, observe[touchIdx]) ? 'close' : 'wick';

  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: regimeAt(zone, observe, touchIdx),
    touchTime: observe[touchIdx].time,
    firstTouchKind,
    approachFrom,
    touchPenetration: deepestPenetrationOfCandle(zone, favorUp, observe[touchIdx]),
    bucket: preTouchApproachBucket(approachFrom, primary),
    speedBucket: preTouchSpeedBucket(primary),
    volBucket: preTouchVolBucket(primary),
    bodyBucket: preTouchBodyBucket(primary),
    statsByLookback,
    outcome: resolution.outcome,
    barsToOutcome: resolution.barsToOutcome,
    reachedEq: resolution.reachedEq,
    reachedMid: resolution.reachedMid,
    reachedFarEdge: resolution.reachedFarEdge,
    closeBarsInZone: resolution.closeBarsInZone,
  };
}

function candleBodyRatio(c: Candle): number {
  const range = c.high - c.low;
  return range > 0 ? Math.abs(c.close - c.open) / range : 0;
}

function avgTrueRangePrice(candles: Candle[], idx: number, period = 14): number | null {
  if (idx <= 0) return null;
  const from = Math.max(1, idx - period + 1);
  const vals: number[] = [];
  for (let i = from; i <= idx; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    vals.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return vals.length ? avg(vals) : null;
}

function widthAtrBucket(widthAtr: number | null): WidthAtrBucket {
  if (widthAtr === null || !Number.isFinite(widthAtr)) return 'unknown';
  if (widthAtr < 0.5) return 'thin';
  if (widthAtr < 1.5) return 'normal';
  if (widthAtr < 3) return 'wide';
  return 'veryWide';
}

function zoneCreationQuality(zone: Zone, candles: Candle[]): ZoneCreationQuality {
  const confirmIdx = candles.findIndex(c => c.time === zone.confirmTime);
  const originIdx = candles.findIndex(c => c.time === zone.originTime);
  if (confirmIdx < 0 || originIdx < 0) {
    return {
      bucket: 'unknown',
      originBodyRatio: null,
      originWickRatio: null,
      confirmBodyRatio: null,
      confirmBodyAtr: null,
      confirmRangeAtr: null,
      displacementAtr: null,
      zoneWidthAtr: null,
    };
  }
  const origin = candles[originIdx];
  const confirm = candles[confirmIdx];
  const atr = avgTrueRangePrice(candles, confirmIdx, 14);
  const originBodyRatio = candleBodyRatio(origin);
  const originWickRatio = 1 - originBodyRatio;
  const confirmBodyRatio = candleBodyRatio(confirm);
  const confirmBody = Math.abs(confirm.close - confirm.open);
  const confirmRange = confirm.high - confirm.low;
  const displacement = Math.abs(confirm.close - origin.close);
  const zoneWidth = zone.high - zone.low;
  const confirmBodyAtr = atr && atr > 0 ? confirmBody / atr : null;
  const confirmRangeAtr = atr && atr > 0 ? confirmRange / atr : null;
  const displacementAtr = atr && atr > 0 ? displacement / atr : null;
  const zoneWidthAtr = atr && atr > 0 ? zoneWidth / atr : null;

  const bucket: ZoneQualityBucket =
    confirmBodyAtr !== null && displacementAtr !== null && confirmBodyRatio >= 0.55 && (confirmBodyAtr >= 1 || displacementAtr >= 1.5)
      ? 'strongDisplacement'
      : zoneWidthAtr !== null && zoneWidthAtr >= 2
        ? 'wideVolatile'
        : zoneWidthAtr !== null && zoneWidthAtr < 0.5 && confirmBodyRatio >= 0.45
          ? 'thinClean'
          : originWickRatio >= 0.65
            ? 'wickyOrigin'
            : 'normal';

  return {
    bucket,
    originBodyRatio,
    originWickRatio,
    confirmBodyRatio,
    confirmBodyAtr,
    confirmRangeAtr,
    displacementAtr,
    zoneWidthAtr,
  };
}

function premiumDiscountInfo(zone: Zone, candles: Candle[], levels: StructureLevelSnapshot[]): PremiumDiscountInfo {
  const idx = candles.findIndex(c => c.time >= zone.confirmTime);
  const snap = idx >= 0 ? levels[idx] : null;
  if (!snap?.high || !snap?.low || snap.high <= snap.low) {
    return { bucket: 'unknown', rangePos: null, favorableForDirection: null, swingHigh: snap?.high ?? null, swingLow: snap?.low ?? null };
  }
  const rangePos = (zone.mid - snap.low) / (snap.high - snap.low);
  const bucket: PremiumDiscountBucket =
    rangePos < 0.25 ? 'deepDiscount' :
      rangePos < 0.45 ? 'discount' :
        rangePos <= 0.55 ? 'equilibrium' :
          rangePos <= 0.75 ? 'premium' :
            'deepPremium';
  const favorableForDirection =
    zone.direction === 'bull'
      ? bucket === 'deepDiscount' || bucket === 'discount'
      : bucket === 'premium' || bucket === 'deepPremium';
  return { bucket, rangePos, favorableForDirection, swingHigh: snap.high, swingLow: snap.low };
}

function decayBucket(days: number | null): DecayBucket {
  if (days === null) return 'noTouch';
  if (days <= 7) return 'sameWeek';
  if (days <= 30) return 'freshMonth';
  if (days <= 90) return 'agedQuarter';
  return 'old';
}

function dwellBucket(closeBars: number): DwellBucket {
  if (closeBars <= 0) return 'none';
  if (closeBars === 1) return 'oneBar';
  if (closeBars <= 3) return 'twoToThree';
  if (closeBars <= 8) return 'fourToEight';
  return 'ninePlus';
}

function nestedZoneInfo(parent: Zone, touchTime: number | null, childZones4h: Zone[]): NestedZoneInfo {
  if (touchTime === null) {
    return { timing: 'none', direction: 'none', childCount: 0, obCount: 0, fvgCount: 0, sameDirectionCount: 0, oppositeDirectionCount: 0, firstChildBarsFromTouch: null };
  }
  const endTime = touchTime + FWD_DAYS * 86400;
  const children = childZones4h.filter(child =>
    child.confirmTime >= parent.confirmTime &&
    child.confirmTime <= endTime &&
    boxesOverlap(parent, child)
  );
  if (!children.length) {
    return { timing: 'none', direction: 'none', childCount: 0, obCount: 0, fvgCount: 0, sameDirectionCount: 0, oppositeDirectionCount: 0, firstChildBarsFromTouch: null };
  }
  const before = children.some(c => c.confirmTime < touchTime);
  const after = children.some(c => c.confirmTime >= touchTime);
  const timing: NestedTimingBucket = before && after ? 'both' : before ? 'beforeTouch' : 'afterTouch';
  const sameDirectionCount = children.filter(c => c.direction === parent.direction).length;
  const oppositeDirectionCount = children.length - sameDirectionCount;
  const direction: NestedDirectionBucket =
    sameDirectionCount && oppositeDirectionCount ? 'mixed' :
      sameDirectionCount ? 'sameDirection' :
        'oppositeDirection';
  const firstChild = [...children].sort((a, b) => Math.abs(a.confirmTime - touchTime) - Math.abs(b.confirmTime - touchTime))[0];
  return {
    timing,
    direction,
    childCount: children.length,
    obCount: children.filter(c => c.zoneType === 'OB').length,
    fvgCount: children.filter(c => c.zoneType === 'FVG').length,
    sameDirectionCount,
    oppositeDirectionCount,
    firstChildBarsFromTouch: Math.round((firstChild.confirmTime - touchTime) / (BAR_DAYS['4H'] * 86400)),
  };
}

function targetLiquidityInfo(zone: Zone, favorUp: boolean, observe: Candle[], levels: StructureLevelSnapshot[], touchIdx: number, fwdBars: number): TargetLiquidityInfo {
  const snap = levels[touchIdx];
  const level = favorUp ? snap?.high ?? null : snap?.low ?? null;
  if (level === null) return { bucket: 'noLevel', level: null, distanceAtr: null, reached: null, barsToReach: null };
  const touch = observe[touchIdx];
  const ahead = favorUp ? level > touch.close : level < touch.close;
  if (!ahead) return { bucket: 'behindPrice', level, distanceAtr: null, reached: null, barsToReach: null };
  const atr = avgTrueRangePrice(observe, touchIdx, 14);
  const distance = Math.abs(level - touch.close);
  const distanceAtr = atr && atr > 0 ? distance / atr : null;
  const bucket: TargetLiquidityBucket =
    distanceAtr === null ? 'noLevel' :
      distanceAtr <= 1 ? 'near' :
        distanceAtr <= 3 ? 'normal' :
          'far';
  let reached = false;
  let barsToReach: number | null = null;
  for (let k = 1; k <= fwdBars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    const hit = favorUp ? c.high >= level : c.low <= level;
    if (hit) {
      reached = true;
      barsToReach = k;
      break;
    }
  }
  return { bucket, level, distanceAtr, reached, barsToReach };
}

function btcBiasAt(candles: Candle[] | null, time: number): BtcBias {
  if (!candles) return 'unknown';
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time < time) idx = i;
    else break;
  }
  if (idx < 70) return 'unknown';
  const ma20 = meanClose(candles, idx - 19, idx + 1);
  const ma60 = meanClose(candles, idx - 59, idx + 1);
  const ma20Prev = meanClose(candles, idx - 29, idx - 9);
  if (!Number.isFinite(ma20) || !Number.isFinite(ma60) || !Number.isFinite(ma20Prev) || ma20Prev <= 0 || ma60 <= 0) return 'unknown';
  const slopePct = ((ma20 - ma20Prev) / ma20Prev) * 100;
  if (Math.abs(slopePct) < 0.5 || Math.abs(ma20 - ma60) / ma60 * 100 < 0.75) return 'range';
  if (ma20 > ma60 && slopePct > 0) return 'up';
  if (ma20 < ma60 && slopePct < 0) return 'down';
  return 'range';
}

function btcSyncInfo(symbol: string, zone: Zone, observeTf: ObserveTf, touchTime: number | null, btcObserve: Record<ObserveTf, Candle[]> | null): BtcSyncInfo {
  if (symbol === 'BTCUSDT') return { bias: 'self', sync: 'self' };
  if (touchTime === null) return { bias: 'unknown', sync: 'unknown' };
  const bias = btcBiasAt(btcObserve?.[observeTf] ?? null, touchTime);
  const sync: BtcSync =
    bias === 'unknown' ? 'unknown' :
      bias === 'range' ? 'btcRange' :
        (zone.direction === 'bull' && bias === 'up') || (zone.direction === 'bear' && bias === 'down')
          ? 'aligned'
          : 'against';
  return { bias, sync };
}

function remainingSmcBehaviorForZone(
  symbol: string,
  zoneId: string,
  confluence: ConfluenceInfo,
  zoneTf: ZoneTf,
  observeTf: ObserveTf,
  zone: Zone,
  observe: Candle[],
  zoneTfCandles: Candle[],
  zoneTfStructureLevels: StructureLevelSnapshot[],
  observeStructureLevels: StructureLevelSnapshot[],
  childZones4h: Zone[],
  closeEntries: CloseEntryRec[],
  btcObserve: Record<ObserveTf, Candle[]> | null,
): RemainingSmcBehaviorRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const touchTime = touchIdx >= 0 ? observe[touchIdx].time : null;
  const firstTouchKind: 'wick' | 'close' | 'none' =
    touchIdx < 0 ? 'none' : closeInZone(zone, observe[touchIdx]) ? 'close' : 'wick';
  const resolution = touchIdx >= 0
    ? scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars, true)
    : { outcome: 'open' as CloseEntryOutcome, barsToOutcome: null, reachedEq: false, reachedMid: false, reachedFarHalf: false, reachedFarEdge: false, closeBarsInZone: 0 };
  const creation = zoneCreationQuality(zone, zoneTfCandles);
  const widthBucket = widthAtrBucket(creation.zoneWidthAtr);
  const confirmIdx = observe.findIndex(c => c.time > zone.confirmTime);
  const barsToFirstTouch = touchIdx >= 0 && confirmIdx >= 0 ? touchIdx - confirmIdx : null;
  const daysToFirstTouch = touchTime === null ? null : (touchTime - zone.confirmTime) / 86400;

  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: touchIdx >= 0 ? regimeAt(zone, observe, touchIdx) : 'unknown',
    touchTime,
    firstTouchKind,
    outcome: resolution.outcome,
    reachedMid: resolution.reachedMid,
    reachedFarEdge: resolution.reachedFarEdge,
    closeBarsInZone: resolution.closeBarsInZone,
    closeEntryCount: closeEntries.length,
    nearExitEntryCount: closeEntries.filter(e => e.outcome === 'nearExit').length,
    invalidEntryCount: closeEntries.filter(e => e.outcome === 'invalidated').length,
    creation,
    premiumDiscount: premiumDiscountInfo(zone, zoneTfCandles, zoneTfStructureLevels),
    widthAtrBucket: widthBucket,
    decayBucket: decayBucket(daysToFirstTouch),
    daysToFirstTouch,
    barsToFirstTouch,
    dwellBucket: dwellBucket(resolution.closeBarsInZone),
    nested: nestedZoneInfo(zone, touchTime, childZones4h),
    targetLiquidity: touchIdx >= 0
      ? targetLiquidityInfo(zone, favorUp, observe, observeStructureLevels, touchIdx, fwdBars)
      : { bucket: 'noLevel', level: null, distanceAtr: null, reached: null, barsToReach: null },
    btc: btcSyncInfo(symbol, zone, observeTf, touchTime, btcObserve),
  };
}

function brokenContinuationHit(zone: Zone, favorUp: boolean, c: Candle): boolean {
  const width = zone.high - zone.low;
  return favorUp ? c.low <= zone.low - width : c.high >= zone.high + width;
}

function brokenReclaimDepth(minPenetration: number | null, trueReclaim: boolean): BrokenReclaimDepth {
  if (trueReclaim) return 'nearExit';
  if (minPenetration === null) return 'none';
  if (minPenetration <= 0.382) return 'nearSideReached';
  if (minPenetration <= 0.5) return 'midReached';
  return 'farHalfOnly';
}

function brokenZoneForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): BrokenZoneRec | null {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return null;
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const endIdx = Math.min(observe.length - 1, touchIdx + fwdBars);

  let breakIdx = -1;
  let priorCloseBarsInZone = 0;
  let priorReachedMid = false;
  for (let i = touchIdx; i <= endIdx; i++) {
    const c = observe[i];
    if (closeInZone(zone, c)) priorCloseBarsInZone++;
    if (deepestPenetrationOfCandle(zone, favorUp, c) >= 0.5) priorReachedMid = true;
    if (closeBreaksFarEdge(zone, favorUp, c)) {
      breakIdx = i;
      break;
    }
  }
  if (breakIdx < 0) return null;

  let continuationIdx: number | null = null;
  for (let i = breakIdx; i <= endIdx; i++) {
    if (brokenContinuationHit(zone, favorUp, observe[i])) {
      continuationIdx = i;
      break;
    }
  }

  let reentryIdx: number | null = null;
  for (let i = breakIdx + 1; i <= endIdx; i++) {
    if (closeInZone(zone, observe[i])) {
      reentryIdx = i;
      break;
    }
  }

  if (reentryIdx === null) {
    return {
      symbol,
      zoneId,
      zoneTf,
      observeTf,
      source: zone.zoneType,
      direction: zone.direction,
      confluence,
      regime: regimeAt(zone, observe, touchIdx),
      breakTime: observe[breakIdx].time,
      barsTouchToBreak: breakIdx - touchIdx,
      priorCloseBarsInZone,
      priorReachedMid,
      reentered: false,
      barsBreakToReentry: null,
      reclaimDepth: 'none',
      path: 'breakNoReentry',
      midRecovered: false,
      nearSideRecovered: false,
      trueReclaim: false,
      rebreakAfterReentry: false,
      continuationHit: continuationIdx !== null,
      barsBreakToContinuation: continuationIdx === null ? null : continuationIdx - breakIdx,
      barsReentryToRebreak: null,
      barsReentryToResolution: null,
      maxReclaimPenetration: null,
    };
  }

  let minPenetration: number | null = null;
  let trueReclaimIdx: number | null = null;
  let rebreakIdx: number | null = null;
  let postReentryContinuationIdx: number | null = null;
  for (let i = reentryIdx; i <= endIdx; i++) {
    const c = observe[i];
    const pen = penetrationOfPrice(zone, favorUp, c.close);
    if (minPenetration === null || pen < minPenetration) minPenetration = pen;
    const state = closeStateOf(zone, favorUp, c);
    if (trueReclaimIdx === null && state === 'nearOutside') trueReclaimIdx = i;
    if (rebreakIdx === null && i > reentryIdx && state === 'farOutside') rebreakIdx = i;
    if (postReentryContinuationIdx === null && brokenContinuationHit(zone, favorUp, c)) postReentryContinuationIdx = i;
  }

  const trueReclaim = trueReclaimIdx !== null && (rebreakIdx === null || trueReclaimIdx < rebreakIdx);
  const midRecovered = minPenetration !== null && minPenetration <= 0.5;
  const nearSideRecovered = minPenetration !== null && minPenetration <= 0.382;
  const continuationAfterReentry = postReentryContinuationIdx !== null || (rebreakIdx !== null && !trueReclaim);
  const path: BrokenZonePath =
    trueReclaim ? 'trueReclaim' :
      continuationAfterReentry && midRecovered ? 'polarityFlip' :
        continuationAfterReentry ? 'failedReclaim' :
          'chopOpen';
  const resolutionIdx =
    trueReclaim ? trueReclaimIdx :
      postReentryContinuationIdx ?? rebreakIdx;

  return {
    symbol,
    zoneId,
    zoneTf,
    observeTf,
    source: zone.zoneType,
    direction: zone.direction,
    confluence,
    regime: regimeAt(zone, observe, touchIdx),
    breakTime: observe[breakIdx].time,
    barsTouchToBreak: breakIdx - touchIdx,
    priorCloseBarsInZone,
    priorReachedMid,
    reentered: true,
    barsBreakToReentry: reentryIdx - breakIdx,
    reclaimDepth: brokenReclaimDepth(minPenetration, trueReclaim),
    path,
    midRecovered,
    nearSideRecovered,
    trueReclaim,
    rebreakAfterReentry: rebreakIdx !== null,
    continuationHit: continuationIdx !== null,
    barsBreakToContinuation: continuationIdx === null ? null : continuationIdx - breakIdx,
    barsReentryToRebreak: rebreakIdx === null ? null : rebreakIdx - reentryIdx,
    barsReentryToResolution: resolutionIdx === null ? null : resolutionIdx - reentryIdx,
    maxReclaimPenetration: minPenetration,
  };
}

function closeEntriesForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): CloseEntryRec[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];

  const favorUp = zone.direction === 'bull';
  const sl = favorUp ? zone.low : zone.high;
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];

  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const zoneTouch = (c: Candle) => c.high >= zone.low && c.low <= zone.high;
  const closeInZone = (c: Candle) => c.close >= zone.low && c.close <= zone.high;

  const out: CloseEntryRec[] = [];
  let closeEntryOrdinal = 0;
  let priorWickPokes = 0;
  let prevTouching = false;
  let episodeHadClose = false;
  let prevCloseInside = false;
  let prevCloseState: CloseState | null = null;
  let lastCloseEntryOutcome: CloseEntryOutcome | null = null;

  for (let i = startIdx; i < observe.length; i++) {
    const c = observe[i];
    const touching = zoneTouch(c);
    const inside = closeInZone(c);
    const currentCloseState = closeStateOf(zone, favorUp, c);

    if (touching && !prevTouching) episodeHadClose = false;

    if (inside) {
      episodeHadClose = true;
      if (!prevCloseInside) {
        const entryFrom: CloseEntryFrom =
          prevCloseState === 'nearOutside' ? 'nearOutside' :
            prevCloseState === 'farOutside' ? 'farOutside' :
              'unknown';
        const reentryKind: CloseReentryKind =
          closeEntryOrdinal === 0 ? 'firstCloseIn' :
            lastCloseEntryOutcome === 'nearExit' ? 'afterNearExit' :
              lastCloseEntryOutcome === 'invalidated' ? 'afterFarExit' :
                'afterOpen';
        closeEntryOrdinal++;
        const regime = regimeAt(zone, observe, i);
        const entryPenetration = penetrationOfPrice(zone, favorUp, c.close);
        const risk = Math.abs(c.close - sl);
        if (risk <= 0) {
          prevCloseInside = inside;
          prevTouching = touching;
          prevCloseState = currentCloseState;
          continue;
        }

        let maxPenetration = entryPenetration;
        let closeBarsInZone = 1;
        let outcome: CloseEntryOutcome = 'open';
        let barsToOutcome: number | null = null;
        let mfeR = 0;
        const hit: Record<number, boolean> = {};
        const tp = (r: number) => favorUp ? c.close + r * risk : c.close - r * risk;

        for (let k = 1; k <= fwdBars; k++) {
          const f = observe[i + k];
          if (!f) break;
          const pen = deepestPenetrationOfCandle(zone, favorUp, f);
          if (pen > maxPenetration) maxPenetration = pen;
          const state = closeStateOf(zone, favorUp, f);
          if (state === 'nearInside' || state === 'eqInside' || state === 'farInside') closeBarsInZone++;

          const favExc = favorUp ? (f.high - c.close) : (c.close - f.low);
          if (favExc / risk > mfeR) mfeR = favExc / risk;

          const resolved = closeEntryOutcomeForState(state);
          if (resolved && outcome === 'open') {
            outcome = resolved;
            barsToOutcome = k;
          }

          const slHit = favorUp ? f.low <= sl : f.high >= sl;
          if (slHit) break;
          for (const t of RR_TARGETS) {
            if (!hit[t] && (favorUp ? f.high >= tp(t) : f.low <= tp(t))) hit[t] = true;
          }
          if (outcome !== 'open') break;
        }

        const winByTarget: Record<number, 0 | 1> = {};
        for (const t of RR_TARGETS) winByTarget[t] = hit[t] ? 1 : 0;
        out.push({
          symbol,
          zoneId,
          zoneTf,
          observeTf,
          source: zone.zoneType,
          direction: zone.direction,
          confluence,
          regime,
          closeEntryOrdinal,
          entryFrom,
          reentryKind,
          time: c.time,
          entryClose: c.close,
          entryPenetration,
          entrySection: closeEntrySection(entryPenetration),
          priorWickPokes,
          reachedEq: maxPenetration >= 0.382,
          reachedMid: maxPenetration >= 0.5,
          reachedFarHalf: maxPenetration >= 0.618,
          reachedFarEdge: maxPenetration >= 1,
          closeBarsInZone,
          outcome,
          barsToOutcome,
          riskPct: (risk / c.close) * 100,
          mfeR,
          winByTarget,
        });
        lastCloseEntryOutcome = outcome;
      }
    } else if (prevTouching && !touching && !episodeHadClose) {
      priorWickPokes++;
    }

    prevCloseInside = inside;
    prevTouching = touching;
    prevCloseState = currentCloseState;
  }

  return out;
}

function coarseState(state: CloseState): CoarseState {
  if (state === 'nearOutside') return 'N';
  if (state === 'farOutside') return 'F';
  return 'I';
}

function compressedStates(states: CoarseState[]): CoarseState[] {
  return states.filter((s, i) => i === 0 || states[i - 1] !== s);
}

function countFarReentries(states: CoarseState[]): number {
  let count = 0;
  for (let i = 0; i < states.length - 1; i++) {
    if (states[i] === 'F' && states.slice(i + 1).includes('I')) count++;
  }
  return count;
}

function hasPattern(states: CoarseState[], pattern: CoarseState[]): boolean {
  let pos = 0;
  for (const state of states) {
    if (state === pattern[pos]) pos++;
    if (pos === pattern.length) return true;
  }
  return false;
}

function classifySequence(states: CoarseState[], firstTouchKind: 'wick' | 'close'): SequenceBucket {
  const hasI = states.includes('I');
  const hasF = states.includes('F');
  const insideEpisodes = states.filter(s => s === 'I').length;
  const farBreaks = states.filter(s => s === 'F').length;
  const farReentries = countFarReentries(states);

  if (firstTouchKind === 'wick' && states[0] === 'N' && !hasI && !hasF) return 'wickRejectOnly';
  if (!hasF && hasI && states.at(-1) === 'N') return 'cleanReject';
  if (!hasF && insideEpisodes >= 2) return 'multiInsideNoBreak';
  if (!hasF && states.at(-1) === 'I') return 'insideDrift';
  if (hasF && farReentries === 0) return 'through';
  if (farBreaks >= 2 && farReentries > 0) return 'multiDeviation';
  if (hasPattern(states, ['F', 'I', 'N'])) return 'deviationReject';
  if (hasPattern(states, ['F', 'I', 'F'])) return 'failedReentry';
  return 'mixed';
}

/** deviation/스퀘어 시퀀스: 종가 상태를 N(근단 밖) / I(존 내부) / F(손절쪽 밖)로 압축. */
function sequenceForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): SequenceRec | null {
  const width = zone.high - zone.low;
  if (width <= 0) return null;
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return null;

  const favorUp = zone.direction === 'bull';
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return null;

  let touchIdx = -1;
  for (let i = startIdx; i < observe.length; i++) {
    if (observe[i].high >= zone.low && observe[i].low <= zone.high) { touchIdx = i; break; }
  }
  if (touchIdx < 0) return null;

  const first = observe[touchIdx];
  const regime = regimeAt(zone, observe, touchIdx);
  const firstTouchKind: 'wick' | 'close' =
    first.close >= zone.low && first.close <= zone.high ? 'close' : 'wick';
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const states: CoarseState[] = [];

  for (let k = 0; k <= fwdBars; k++) {
    const c = observe[touchIdx + k];
    if (!c) break;
    states.push(coarseState(closeStateOf(zone, favorUp, c)));
  }
  if (!states.length) return null;

  const compressed = compressedStates(states);
  const insideEpisodes = compressed.filter(s => s === 'I').length;
  const farBreaks = compressed.filter(s => s === 'F').length;
  const farReentries = countFarReentries(compressed);

  return {
    symbol, zoneId, zoneTf, observeTf, source: zone.zoneType, confluence, regime,
    firstTouchKind,
    bucket: classifySequence(compressed, firstTouchKind),
    compressed: compressed.join('>'),
    insideEpisodes,
    farBreaks,
    farReentries,
    finalState: compressed[compressed.length - 1],
    bars: states.length,
  };
}

function rawStateOfClose(zone: Zone, close: number): RawState {
  if (close > zone.high) return 'ABOVE';
  if (close < zone.low) return 'BELOW';
  return 'INSIDE';
}

function normalizeRawState(state: RawState, favorUp: boolean): CoarseState {
  if (state === 'INSIDE') return 'I';
  if (favorUp) return state === 'ABOVE' ? 'N' : 'F';
  return state === 'BELOW' ? 'N' : 'F';
}

function transitionsForZone(symbol: string, zoneId: string, confluence: ConfluenceInfo, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): TransitionRec[] {
  const width = zone.high - zone.low;
  if (width <= 0) return [];
  const widthPct = (width / zone.mid) * 100;
  if (widthPct < MIN_WIDTH_PCT) return [];

  const favorUp = zone.direction === 'bull';
  const startIdx = observe.findIndex(c => c.time > zone.confirmTime);
  if (startIdx < 0) return [];
  const regime = regimeAt(zone, observe, startIdx);
  const out: TransitionRec[] = [];
  let prev: RawState | null = null;

  for (let i = startIdx; i < observe.length; i++) {
    const c = observe[i];
    const state = rawStateOfClose(zone, c.close);
    if (state === prev) continue;
    prev = state;
    out.push({
      symbol,
      zoneId,
      zoneTf,
      observeTf,
      source: zone.zoneType,
      direction: zone.direction,
      confluence,
      regime,
      ordinal: out.length + 1,
      time: c.time,
      barsFromConfirm: i - startIdx,
      state,
      normalizedState: normalizeRawState(state, favorUp),
      close: c.close,
      penetration: penetrationOfPrice(zone, favorUp, c.close),
    });
  }
  return out;
}

function depthLabel(src: 'OB' | 'FVG', depth: DepthLevel): string {
  if (depth === 'mid50') return src === 'OB' ? 'mid50' : 'CE';
  return depth;
}

function fmtExp(g: LevelTrade[], tgt: number): string {
  if (!g.length) return '·';
  const e = expOf(g, tgt);
  return `${e >= 0 ? '+' : ''}${e.toFixed(2)} · ${g.length}${g.length < 15 ? '⚠️' : ''}`;
}

function expOf(g: LevelTrade[], tgt: number): number {
  const wr = g.reduce((s, t) => s + t.winByTarget[tgt], 0) / g.length;
  return wr * tgt - (1 - wr) * 1;
}

/** 진입 깊이 분석 — 관측 TF=1D 고정 (존 TF별 깊이 비교) */
function buildLevelReport(trades: LevelTrade[]): string {
  const obs1d = trades.filter(t => t.observeTf === '1D' && t.entrySignal === 'wick');
  let md = '\n---\n\n# 레벨별 진입 깊이 RR 분석 (관측 1D, 꼬리/지정가 기준)\n\n';
  md += `각 레벨에 지정가 진입, SL = 존 반대편 끝, TP = ${RR_TARGETS.map(t => t + 'R').join('/')}. `;
  md += `edge=근단(첫터치) → eqNear=EQ근단 → mid50(OB mid/FVG CE) → eqFar=EQ원단(SL쪽). 기대값 양수면 엣지.\n\n`;
  const TGT0 = 2;
  for (const src of ['OB', 'FVG'] as const) {
    md += `## ${src}\n\n`;
    md += '| 존TF | 깊이 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
    md += '|---|---|---:|---:|---:|---:|---:|\n';
    for (const tf of ZONE_TFS) {
      for (const depth of DEPTH_LEVELS) {
        const g = obs1d.filter(t => t.source === src && t.zoneTf === tf && t.depth === depth);
        if (!g.length) continue;
        const avgRisk = g.reduce((s, t) => s + t.riskPct, 0) / g.length;
        const avgMfe = g.reduce((s, t) => s + t.mfeR, 0) / g.length;
        const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
        md += `| ${tf} | ${depthLabel(src, depth)} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${expOf(g, TGT0) >= 0 ? '+' : ''}${expOf(g, TGT0).toFixed(2)} | ${avgRisk.toFixed(1)} | ${avgMfe.toFixed(2)} |\n`;
      }
    }
    md += '\n';
  }
  return md;
}

/** 멀티TF 매트릭스 — 같은 TF는 종가확인, 하위 TF는 꼬리/종가확인 둘 다 비교 */
function buildMatrixReport(trades: LevelTrade[]): string {
  let md = '\n---\n\n# 멀티TF — 같은 TF는 종가, 하위 TF는 꼬리·종가 비교 (2R, 지평 ' + FWD_DAYS + '일 고정)\n\n';
  md += '셀 = 기대값(R) · 셋업수. 같은 TF(1M→1M, 1W→1W, 1D→1D)는 `종가`만, 하위 TF 관측은 `꼬리/지정가`와 `종가확인`을 함께 표시. 표본 적은 셀(<15)은 ⚠️.\n\n';
  const TGT0 = 2;
  for (const src of ['OB', 'FVG'] as const) {
    const depth: DepthLevel = src === 'OB' ? 'mid50' : 'edge'; // 각 디텍터의 우세 깊이로
    md += `## ${src} (진입 깊이=${depthLabel(src, depth)})\n\n`;
    md += '| 존TF \\ 관측 | ' + OBSERVE_TFS.join(' | ') + ' |\n';
    md += '|---|' + OBSERVE_TFS.map(() => '---:').join('|') + '|\n';
    for (const ztf of ZONE_TFS) {
      const cells = OBSERVE_TFS.map(otf => {
        if (!OBSERVE_OPTIONS[ztf].includes(otf)) return '·';
        if (SAME_OBSERVE_TF[ztf] === otf) {
          const g = trades.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf && t.depth === depth && t.entrySignal === 'close');
          return `종가 ${fmtExp(g, TGT0)}`;
        }
        const wick = trades.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf && t.depth === depth && t.entrySignal === 'wick');
        const close = trades.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf && t.depth === depth && t.entrySignal === 'close');
        return `꼬리 ${fmtExp(wick, TGT0)} / 종가 ${fmtExp(close, TGT0)}`;
      });
      md += `| ${ztf} | ${cells.join(' | ')} |\n`;
    }
    md += '\n';
  }
  return md;
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function median(nums: number[]): number {
  const xs = nums.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function pathResolvedFavor(p: PathRec): boolean {
  return p.outcome === 'wickReject' || p.outcome === 'favorExit';
}

function deepestLabel(d: DeepestZone): string {
  return ({
    edgeOnly: 'edge만',
    eqOnly: 'EQ까지만',
    mid50: 'mid50/CE',
    farHalf: 'EQ원단쪽',
    farEdge: 'far edge',
  } as const)[d];
}

function firstTouchClosePositionLabel(p: FirstTouchClosePosition): string {
  return ({
    favorOutside: '근단 밖 마감',
    nearInside: '근단 안쪽 마감',
    eqInside: 'EQ/CE권 마감',
    farInside: '원단쪽 내부 마감',
    invalidOutside: '원단 밖 마감',
  } as const)[p];
}

function firstTouchBodyLabel(b: FirstTouchBody): string {
  return ({
    favorClose: '유리방향 몸통',
    againstClose: '불리방향 몸통',
    doji: '도지',
  } as const)[b];
}

function firstTouchRevisitKindLabel(k: FirstTouchRevisitKind): string {
  return ({
    none: '재접촉 없음',
    nearRetouch: '근단만',
    midTouch: 'CE/mid까지',
    farEdgeTouch: '원단까지',
  } as const)[k];
}

function postTouchRegionLabel(r: PostTouchRegion): string {
  return ({
    mirrorFarOutside: '미러원단 밖',
    mirrorFarToCe: '미러원단~미러CE',
    mirrorCeToNear: '미러CE~근단',
    nearToCe: '근단~CE',
    ceToFar: 'CE~원단',
    farOutside: '원단 밖',
  } as const)[r];
}

function postTouchNearestLevelLabel(level: PostTouchNearestLevel): string {
  return ({
    mirrorFar: '미러원단',
    mirrorCe: '미러CE',
    near: '근단',
    ce: 'CE',
    far: '원단',
  } as const)[level];
}

function candleBodyDirectionLabel(body: CandleBodyDirection): string {
  return ({
    bullish: '양봉',
    bearish: '음봉',
    doji: '도지',
  } as const)[body];
}

function confluenceBucketLabel(bucket: ConfluenceBucket): string {
  return ({
    none: '단독',
    boxOnly: '박스겹침',
    levelOnly: '레벨군집',
    boxAndLevel: '박스+레벨',
  } as const)[bucket];
}

function confluenceComboLabel(combo: ConfluenceCombo): string {
  return ({
    obBoxFvgEq: 'OB box ∩ FVG EQ',
    obMidFvgCe: 'OB mid ≈ FVG CE',
    obMidFvgEdge: 'OB mid ≈ FVG edge',
    htfMidCluster: '1W/1M mid cluster',
  } as const)[combo];
}

function regimeLabel(regime: TrendRegime): string {
  return ({
    withTrend: '순추세',
    againstTrend: '역추세',
    range: '횡보',
    unknown: '미분류',
  } as const)[regime];
}

function sequenceBucketLabel(bucket: SequenceBucket): string {
  return ({
    wickRejectOnly: '꼬리거부만',
    cleanReject: '내부진입후 근단거부',
    multiInsideNoBreak: '반복 내부진입',
    insideDrift: '내부 체류',
    through: '그냥 관통',
    deviationReject: '이탈후 재진입거부',
    failedReentry: '재진입 실패',
    multiDeviation: '다중 이탈/재진입',
    mixed: '혼합',
  } as const)[bucket];
}

function selectedMtfTrade(t: LevelTrade): boolean {
  if (t.observeTf !== '4H' || t.entrySignal !== 'wick') return false;
  return (t.source === 'OB' && t.depth === 'mid50') || (t.source === 'FVG' && t.depth === 'edge');
}

function shortSeq(seq: string): string {
  return seq.length <= 36 ? seq : `${seq.slice(0, 33)}...`;
}

function buildConfluenceReport(trades: LevelTrade[], paths: PathRec[]): string {
  let md = '\n---\n\n# 레벨 군집/컨플루언스 분석\n\n';
  md += `컨플루언스는 같은 심볼에서 해당 존 확정 시점 이전에 이미 확정된 다른 OB/FVG와 비교. `;
  md += `박스 겹침 또는 핵심 레벨(low/EQ/mid/high) ±${CONFLUENCE_PCT}% 군집을 집계하며, RR 표는 4H 실행 기준(OB=mid50, FVG=edge, 꼬리/지정가).\n\n`;

  const TGT0 = 2;
  md += '## 4H 실행 RR — 컨플루언스 버킷별\n\n';
  md += '| 존 | 컨플루언스 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const bucket of ['none', 'boxOnly', 'levelOnly', 'boxAndLevel'] as ConfluenceBucket[]) {
      const g = trades.filter(t => selectedMtfTrade(t) && t.source === src && t.confluence.bucket === bucket);
      if (!g.length) continue;
      const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
      const avgRisk = avg(g.map(t => t.riskPct));
      const avgMfe = avg(g.map(t => t.mfeR));
      const exp = expOf(g, TGT0);
      md += `| ${src} | ${confluenceBucketLabel(bucket)} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} | ${avgRisk.toFixed(1)} | ${avgMfe.toFixed(2)} |\n`;
    }
  }

  md += '\n## 4H 실행 RR — 컨플루언스 유형별\n\n';
  md += '| 존 | 구분 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  const rrGroups: [string, (t: LevelTrade) => boolean][] = [
    ['단독', t => !t.confluence.hasAny],
    ['컨플루언스 있음', t => t.confluence.hasAny],
    ['HTF 포함', t => t.confluence.hasHtf],
    ['OB/FVG 겹침', t => t.confluence.hasObFvg],
  ];
  for (const src of ['OB', 'FVG'] as const) {
    for (const [label, pred] of rrGroups) {
      const g = trades.filter(t => selectedMtfTrade(t) && t.source === src && pred(t));
      if (!g.length) continue;
      const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
      const avgRisk = avg(g.map(t => t.riskPct));
      const avgMfe = avg(g.map(t => t.mfeR));
      const exp = expOf(g, TGT0);
      md += `| ${src} | ${label} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} | ${avgRisk.toFixed(1)} | ${avgMfe.toFixed(2)} |\n`;
    }
  }

  md += '\n## 4H 실행 RR — 세부 조합별\n\n';
  md += '| 조합 | 존 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const combo of ['obBoxFvgEq', 'obMidFvgCe', 'obMidFvgEdge', 'htfMidCluster'] as ConfluenceCombo[]) {
    for (const src of ['OB', 'FVG'] as const) {
      const g = trades.filter(t => selectedMtfTrade(t) && t.source === src && t.confluence.combos[combo]);
      if (!g.length) continue;
      const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
      const avgRisk = avg(g.map(t => t.riskPct));
      const avgMfe = avg(g.map(t => t.mfeR));
      const exp = expOf(g, TGT0);
      md += `| ${confluenceComboLabel(combo)} | ${src} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} | ${avgRisk.toFixed(1)} | ${avgMfe.toFixed(2)} |\n`;
    }
  }

  md += '\n## 4H 구조 결과 — 컨플루언스 유형별\n\n';
  md += '| 존 | 구분 | 표본 | 근단이탈 | 무효화 | EQ도달 | HTF겹침 | OB/FVG겹침 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  const groups: [string, (p: PathRec) => boolean][] = [
    ['단독', p => !p.confluence.hasAny],
    ['컨플루언스 있음', p => p.confluence.hasAny],
    ['HTF 포함', p => p.confluence.hasHtf],
    ['OB/FVG 겹침', p => p.confluence.hasObFvg],
  ];
  for (const src of ['OB', 'FVG'] as const) {
    for (const [label, pred] of groups) {
      const g = paths.filter(p => p.observeTf === '4H' && p.source === src && pred(p));
      if (!g.length) continue;
      const favor = g.filter(pathResolvedFavor).length;
      const invalid = g.filter(p => p.outcome === 'invalidated').length;
      const reachedEq = g.filter(p => p.reachedEq).length;
      const htf = g.filter(p => p.confluence.hasHtf).length;
      const obFvg = g.filter(p => p.confluence.hasObFvg).length;
      md += `| ${src} | ${label} | ${g.length} | ${pct(favor, g.length)} | ${pct(invalid, g.length)} | ${pct(reachedEq, g.length)} | ${pct(htf, g.length)} | ${pct(obFvg, g.length)} |\n`;
    }
  }
  return md;
}

function buildSequenceReport(sequences: SequenceRec[]): string {
  let md = '\n---\n\n# Deviation / 스퀘어 시퀀스 분석\n\n';
  md += `첫터치 이후 ${FWD_DAYS}일 동안 종가 위치를 N(유리 방향 바깥) / I(존 내부) / F(손절쪽 바깥)로 압축. `;
  md += '`F>I>N`은 손절쪽 이탈 후 재진입해서 근단으로 거부된 구조, `F` 이후 재진입이 없으면 그냥 관통.\n\n';

  md += '## 4H 관측 — 시퀀스 버킷별\n\n';
  md += '| 존 | 시퀀스 | 표본 | 최종N | 최종I | 최종F | 평균 내부에피소드 | F이탈 | F후재진입 | 컨플루언스 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const bucket of ['wickRejectOnly', 'cleanReject', 'multiInsideNoBreak', 'insideDrift', 'through', 'deviationReject', 'failedReentry', 'multiDeviation', 'mixed'] as SequenceBucket[]) {
      const g = sequences.filter(s => s.observeTf === '4H' && s.source === src && s.bucket === bucket);
      if (!g.length) continue;
      const finalN = g.filter(s => s.finalState === 'N').length;
      const finalI = g.filter(s => s.finalState === 'I').length;
      const finalF = g.filter(s => s.finalState === 'F').length;
      const far = g.filter(s => s.farBreaks > 0).length;
      const reentry = g.filter(s => s.farReentries > 0).length;
      const confl = g.filter(s => s.confluence.hasAny).length;
      md += `| ${src} | ${sequenceBucketLabel(bucket)} | ${g.length} | ${pct(finalN, g.length)} | ${pct(finalI, g.length)} | ${pct(finalF, g.length)} | ${avg(g.map(s => s.insideEpisodes)).toFixed(1)} | ${pct(far, g.length)} | ${pct(reentry, g.length)} | ${pct(confl, g.length)} |\n`;
    }
  }

  md += '\n## 4H 관측 — 대표 압축 시퀀스 Top 12\n\n';
  md += '| 존 | 압축시퀀스 | 표본 | 최빈 버킷 |\n';
  md += '|---|---|---:|---|\n';
  for (const src of ['OB', 'FVG'] as const) {
    const rows = new Map<string, SequenceRec[]>();
    for (const s of sequences.filter(x => x.observeTf === '4H' && x.source === src)) {
      const key = s.compressed;
      rows.set(key, [...(rows.get(key) ?? []), s]);
    }
    const top = [...rows.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12);
    for (const [seq, g] of top) {
      const counts = new Map<SequenceBucket, number>();
      for (const s of g) counts.set(s.bucket, (counts.get(s.bucket) ?? 0) + 1);
      const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      md += `| ${src} | ${shortSeq(seq)} | ${g.length} | ${sequenceBucketLabel(mode)} |\n`;
    }
  }
  return md;
}

function buildRegimeReport(trades: LevelTrade[], paths: PathRec[]): string {
  let md = '\n---\n\n# 추세 레짐 분할\n\n';
  md += '레짐은 터치 이전 봉만 사용해 MA20/MA60 위치와 MA20 기울기로 분류. RR 표는 4H 실행 기준(OB=mid50, FVG=edge), 꼬리/종가를 분리.\n\n';
  const TGT0 = 2;

  md += '## 4H 실행 RR — 레짐 × 진입 신호\n\n';
  md += '| 존 | 레짐 | 신호 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const regime of ['withTrend', 'againstTrend', 'range', 'unknown'] as TrendRegime[]) {
      for (const signal of ENTRY_SIGNALS) {
        const g = trades.filter(t =>
          t.observeTf === '4H' &&
          t.source === src &&
          t.entrySignal === signal &&
          t.regime === regime &&
          ((src === 'OB' && t.depth === 'mid50') || (src === 'FVG' && t.depth === 'edge'))
        );
        if (!g.length) continue;
        const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
        const exp = expOf(g, TGT0);
        md += `| ${src} | ${regimeLabel(regime)} | ${signal === 'wick' ? '꼬리' : '종가'} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} | ${avg(g.map(t => t.riskPct)).toFixed(1)} | ${avg(g.map(t => t.mfeR)).toFixed(2)} |\n`;
      }
    }
  }

  md += '\n## 4H 구조 결과 — 레짐별\n\n';
  md += '| 존 | 레짐 | 표본 | 근단이탈 | 무효화 | EQ도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const regime of ['withTrend', 'againstTrend', 'range', 'unknown'] as TrendRegime[]) {
      const g = paths.filter(p => p.observeTf === '4H' && p.source === src && p.regime === regime);
      if (!g.length) continue;
      const favor = g.filter(pathResolvedFavor).length;
      const invalid = g.filter(p => p.outcome === 'invalidated').length;
      const reachedEq = g.filter(p => p.reachedEq).length;
      md += `| ${src} | ${regimeLabel(regime)} | ${g.length} | ${pct(favor, g.length)} | ${pct(invalid, g.length)} | ${pct(reachedEq, g.length)} | ${avg(g.map(p => p.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }
  return md;
}

function buildTransitionReport(transitions: TransitionRec[]): string {
  let md = '\n---\n\n# 전체 상태 전이 타임라인 요약\n\n';
  md += '각 존 확정 이후 모든 관측 봉의 종가 상태 변화를 `ABOVE/INSIDE/BELOW`로 순서 보존 저장. 리포트는 전이 raw를 요약하고, 전체 raw는 transitions JSON에 기록.\n\n';
  md += '| 존 | 존TF | 관측 | 존수 | 평균전이수 | INSIDE경험 | BELOW종료 | ABOVE종료 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';

  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const otf of OBSERVE_TFS) {
        if (!OBSERVE_OPTIONS[ztf].includes(otf)) continue;
        const g = transitions.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf);
        if (!g.length) continue;
        const byZone = new Map<string, TransitionRec[]>();
        for (const t of g) byZone.set(t.zoneId, [...(byZone.get(t.zoneId) ?? []), t]);
        const groups = [...byZone.values()];
        const inside = groups.filter(rows => rows.some(r => r.state === 'INSIDE')).length;
        const belowEnd = groups.filter(rows => rows[rows.length - 1]?.state === 'BELOW').length;
        const aboveEnd = groups.filter(rows => rows[rows.length - 1]?.state === 'ABOVE').length;
        md += `| ${src} | ${ztf} | ${otf} | ${groups.length} | ${avg(groups.map(rows => rows.length)).toFixed(1)} | ${pct(inside, groups.length)} | ${pct(belowEnd, groups.length)} | ${pct(aboveEnd, groups.length)} |\n`;
      }
    }
  }
  return md;
}

function buildSelfCheckReport(checks: SelfCheck[]): string {
  let md = '\n---\n\n# 셋업 검증 셀프체크\n\n';
  md += '| 체크 | 대상 | 결과 | 실패 샘플 |\n';
  md += '|---|---:|---|---|\n';
  for (const check of checks) {
    const ok = check.failures.length === 0;
    md += `| ${check.name} | ${check.checked} | ${ok ? 'PASS' : 'FAIL'} | ${ok ? '-' : check.failures.slice(0, 3).join('<br>')} |\n`;
  }
  return md;
}

function checkCandles(label: string, candles: Candle[]): SelfCheck {
  const failures: string[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!(c.low <= Math.min(c.open, c.close) && Math.max(c.open, c.close) <= c.high)) failures.push(`${label}[${i}] OHLC`);
    if (i > 0 && candles[i - 1].time >= c.time) failures.push(`${label}[${i}] time order`);
    if (failures.length >= 5) break;
  }
  return { name: `${label} candles sorted/OHLC`, checked: candles.length, failures };
}

function checkCutoff(label: string, candles: Candle[]): SelfCheck {
  const failures: string[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].time >= ANALYSIS_CUTOFF_SEC) failures.push(`${label}[${i}] ${candles[i].time} >= cutoff`);
    if (failures.length >= 5) break;
  }
  return { name: `${label} cutoff < ${ANALYSIS_CUTOFF_ISO}`, checked: candles.length, failures };
}

function checkZones(label: string, zones: MetaZone[]): SelfCheck {
  const failures: string[] = [];
  for (const z of zones) {
    const eq = eqBox(z.low, z.high, true);
    const ok = z.low < eq.low && eq.low < z.mid && z.mid < eq.high && eq.high < z.high && z.confirmTime > 0;
    if (!ok) failures.push(`${z.zoneId} geometry`);
    if (failures.length >= 5) break;
  }
  return { name: `${label} zone geometry`, checked: zones.length, failures };
}

function checkObserveStart(label: string, zones: MetaZone[], observeTf: ObserveTf, observe: Candle[]): SelfCheck {
  const failures: string[] = [];
  for (const z of zones) {
    if (!OBSERVE_OPTIONS[z.zoneTf].includes(observeTf)) continue;
    const startIdx = observe.findIndex(c => c.time > z.confirmTime);
    if (startIdx >= 0 && observe[startIdx].time <= z.confirmTime) failures.push(`${z.zoneId} ${observeTf}`);
    if (failures.length >= 5) break;
  }
  return { name: `${label} ${observeTf} starts after confirmTime`, checked: zones.length, failures };
}

function checkTransitions(label: string, transitions: TransitionRec[]): SelfCheck {
  const failures: string[] = [];
  const byKey = new Map<string, TransitionRec[]>();
  for (const t of transitions) {
    const key = `${t.zoneId}:${t.observeTf}`;
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  for (const [key, rows] of byKey) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].ordinal !== i + 1) failures.push(`${key} ordinal`);
      if (i > 0 && rows[i - 1].time >= rows[i].time) failures.push(`${key} time order`);
      if (i > 0 && rows[i - 1].state === rows[i].state) failures.push(`${key} duplicate state`);
      if (failures.length >= 5) break;
    }
    if (failures.length >= 5) break;
  }
  return { name: `${label} transition order`, checked: byKey.size, failures };
}

function closeEntryExp(g: CloseEntryRec[], tgt: number): number {
  const wr = g.reduce((s, t) => s + t.winByTarget[tgt], 0) / g.length;
  return wr * tgt - (1 - wr) * 1;
}

function ordinalBucket(n: number): string {
  return n === 1 ? '1번째' : n === 2 ? '2번째' : '3번째+';
}

function buildZoneEpisodeBehaviorReport(entries: CloseEntryRec[]): string {
  let md = '\n---\n\n# 존 종가 에피소드 행동 분석\n\n';
  md += '수익률/기대값이 아니라, 종가가 존 안으로 들어온 에피소드가 이후 어떻게 행동했는지만 집계. ';
  md += '`근단이탈 후 재진입`은 존 안에 들어왔다가 유리 방향으로 나간 뒤 다시 들어온 경우, `손절쪽 이탈 후 재진입`은 반대편 밖으로 종가 이탈한 뒤 다시 들어온 경우.\n\n';

  md += '## 4H 관측 — 첫 진입 vs 재진입 반응\n\n';
  md += '| 존 | 에피소드 | 이벤트 | 근단이탈 | 손절쪽이탈 | 미결 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const kind of ['firstCloseIn', 'afterNearExit', 'afterFarExit', 'afterOpen'] as CloseReentryKind[]) {
      const g = entries.filter(e => e.observeTf === '4H' && e.source === src && e.reentryKind === kind);
      if (!g.length) continue;
      const nearExit = g.filter(e => e.outcome === 'nearExit').length;
      const invalid = g.filter(e => e.outcome === 'invalidated').length;
      const open = g.filter(e => e.outcome === 'open').length;
      const mid = g.filter(e => e.reachedMid).length;
      const farEdge = g.filter(e => e.reachedFarEdge).length;
      md += `| ${src} | ${closeReentryKindLabel(kind)} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(open, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 4H 관측 — 직전 위치별 재진입 반응\n\n';
  md += '| 존 | 직전 위치 | 이벤트 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const from of ['nearOutside', 'farOutside', 'unknown'] as CloseEntryFrom[]) {
      const g = entries.filter(e => e.observeTf === '4H' && e.source === src && e.entryFrom === from);
      if (!g.length) continue;
      const nearExit = g.filter(e => e.outcome === 'nearExit').length;
      const invalid = g.filter(e => e.outcome === 'invalidated').length;
      const mid = g.filter(e => e.reachedMid).length;
      const farEdge = g.filter(e => e.reachedFarEdge).length;
      md += `| ${src} | ${closeEntryFromLabel(from)} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 4H 관측 — 종가 에피소드 순번별\n\n';
  md += '| 존 | 순번 | 이벤트 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const bucket of ['1번째', '2번째', '3번째+']) {
      const g = entries.filter(e => e.observeTf === '4H' && e.source === src && ordinalBucket(e.closeEntryOrdinal) === bucket);
      if (!g.length) continue;
      const nearExit = g.filter(e => e.outcome === 'nearExit').length;
      const invalid = g.filter(e => e.outcome === 'invalidated').length;
      const mid = g.filter(e => e.reachedMid).length;
      const farEdge = g.filter(e => e.reachedFarEdge).length;
      md += `| ${src} | ${bucket} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 1W 존 — 1D/4H 재진입 행동\n\n';
  md += '| 존 | 관측 | 에피소드 | 이벤트 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const otf of ['4H', '1D'] as ObserveTf[]) {
      for (const kind of ['firstCloseIn', 'afterNearExit', 'afterFarExit', 'afterOpen'] as CloseReentryKind[]) {
        const g = entries.filter(e => e.zoneTf === '1W' && e.observeTf === otf && e.source === src && e.reentryKind === kind);
        if (!g.length) continue;
        const nearExit = g.filter(e => e.outcome === 'nearExit').length;
        const invalid = g.filter(e => e.outcome === 'invalidated').length;
        const mid = g.filter(e => e.reachedMid).length;
        const farEdge = g.filter(e => e.reachedFarEdge).length;
        md += `| ${src} | ${otf} | ${closeReentryKindLabel(kind)} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} |\n`;
      }
    }
  }
  return md;
}

function breachKindLabel(kind: InvalidationBreachKind): string {
  return ({
    noFarBreach: 'far 미침범',
    wickSweepOnly: '꼬리만 far sweep',
    closeBreak: '종가 far 이탈',
  } as const)[kind];
}

function reclaimSpeedLabel(speed: ReclaimSpeed): string {
  return ({
    noReclaim: '회수없음',
    '1bar': '1봉 회수',
    '2to3': '2-3봉 회수',
    '4to8': '4-8봉 회수',
    '9plus': '9봉+ 회수',
  } as const)[speed];
}

function midAcceptanceLabel(bucket: MidAcceptanceBucket): string {
  return ({
    noMidTouch: 'mid/CE 미도달',
    midWickReject: 'mid/CE 꼬리거부',
    singleCloseBeyond: 'mid/CE 1봉 acceptance',
    accepted2Plus: 'mid/CE 2봉+ acceptance',
  } as const)[bucket];
}

function liquiditySweepLabel(kind: LiquiditySweepKind): string {
  return ({
    noLevel: '기준 swing 없음',
    none: 'sweep 없음',
    wickSweep: 'wick sweep',
    closeBreak: 'liquidity 종가이탈',
    closeBreakReclaimed: '종가이탈 후 회수',
  } as const)[kind];
}

function structureBreakLabel(kind: StructureBreakKind): string {
  return ({
    favorableBreak: '유리방향 구조돌파',
    adverseBreak: '불리방향 구조돌파',
    none: '구조돌파 없음',
  } as const)[kind];
}

function preTouchApproachLabel(bucket: PreTouchApproachBucket): string {
  return ({
    insufficientData: '데이터부족',
    fromFarSide: '손절쪽 밖에서 회수',
    impulseIntoZone: '급하게 꽂힘',
    steadyGrindIntoZone: '연속 흡수 접근',
    compressedDrift: '압축 드리프트',
    wickyNoise: '꼬리 많은 노이즈',
    sideways: '횡보 접근',
    mixed: '혼합',
  } as const)[bucket];
}

function preTouchSpeedLabel(bucket: PreTouchSpeedBucket): string {
  return ({ slow: '느림', normal: '보통', fast: '빠름' } as const)[bucket];
}

function preTouchVolLabel(bucket: PreTouchVolBucket): string {
  return ({ compressed: '압축', neutral: '보통', expanding: '확장' } as const)[bucket];
}

function preTouchBodyLabel(bucket: PreTouchBodyBucket): string {
  return ({ bodyDriven: '실체 주도', balanced: '균형', wickDriven: '꼬리 주도' } as const)[bucket];
}

function primaryPreTouchStats(r: PreTouchApproachRec): PreTouchWindowStats | null {
  return r.statsByLookback[20] ?? r.statsByLookback[10] ?? r.statsByLookback[5] ?? null;
}

function buildPriorityBehaviorReport(
  invalidations: InvalidationBehaviorRec[],
  reclaims: ReclaimBehaviorRec[],
  midAcceptances: MidAcceptanceRec[],
  liquiditySweeps: LiquiditySweepRec[],
  ltfStructures: LtfStructureRec[],
): string {
  let md = '\n---\n\n# 우선 5개 SMC 행동 가설 분석\n\n';
  md += '수익률이 아니라 존 생애 안의 행동 패턴만 집계. 모든 표는 기본적으로 4H 관측 기준이며, 구조전환은 1W/1M 존 내부의 4H swing break proxy를 사용.\n\n';

  md += '## 1. wick 무효화 vs close 무효화\n\n';
  md += '| 존 | far 침범 유형 | 표본 | 근단복귀 | 종가 far 이탈 발생 | 평균 far이탈봉 | 평균 근단복귀봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const kind of ['noFarBreach', 'wickSweepOnly', 'closeBreak'] as InvalidationBreachKind[]) {
      const g = invalidations.filter(r => r.observeTf === '4H' && r.source === src && r.firstBreachKind === kind);
      if (!g.length) continue;
      const near = g.filter(r => r.nearExitAfterBreach).length;
      const closeBreak = g.filter(r => r.eventualCloseBreak).length;
      const closeBreakBars = g.map(r => r.barsToCloseBreak).filter((n): n is number => n !== null);
      const nearBars = g.map(r => r.barsToNearExit).filter((n): n is number => n !== null);
      md += `| ${src} | ${breachKindLabel(kind)} | ${g.length} | ${pct(near, g.length)} | ${pct(closeBreak, g.length)} | ${avg(closeBreakBars).toFixed(1)} | ${avg(nearBars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 2. 손절쪽 종가이탈 후 reclaim\n\n';
  md += '| 존 | 회수 속도 | 표본 | 회수율 | 회수 후 근단이탈 | 회수 후 재무효화 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const speed of ['noReclaim', '1bar', '2to3', '4to8', '9plus'] as ReclaimSpeed[]) {
      const g = reclaims.filter(r => r.observeTf === '4H' && r.source === src && r.reclaimSpeed === speed);
      if (!g.length) continue;
      const reclaimed = g.filter(r => r.reclaimed).length;
      const near = g.filter(r => r.outcomeAfterReclaim === 'nearExit').length;
      const invalid = g.filter(r => r.outcomeAfterReclaim === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      md += `| ${src} | ${reclaimSpeedLabel(speed)} | ${g.length} | ${pct(reclaimed, g.length)} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(g.map(r => r.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 3. mid50/CE acceptance vs rejection\n\n';
  md += '| 존 | mid/CE 행동 | 표본 | 근단이탈 | 손절쪽이탈 | far edge도달 | 평균 acceptance 종가봉 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const bucket of ['noMidTouch', 'midWickReject', 'singleCloseBeyond', 'accepted2Plus'] as MidAcceptanceBucket[]) {
      const g = midAcceptances.filter(r => r.observeTf === '4H' && r.source === src && r.bucket === bucket);
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const far = g.filter(r => r.reachedFarEdge).length;
      md += `| ${src} | ${midAcceptanceLabel(bucket)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(far, g.length)} | ${avg(g.map(r => r.acceptedCloseBars)).toFixed(1)} | ${avg(g.map(r => r.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 4. liquidity sweep 후 존 반응\n\n';
  md += `직전 확정 swing high/low를 기준으로 터치 전 ${LIQUIDITY_SWEEP_LOOKBACK}봉 안의 sweep 여부를 분류.\n\n`;
  md += '| 존 | sweep 유형 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 sweep→touch 봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const kind of ['noLevel', 'none', 'wickSweep', 'closeBreak', 'closeBreakReclaimed'] as LiquiditySweepKind[]) {
      const g = liquiditySweeps.filter(r => r.observeTf === '4H' && r.source === src && r.sweepKind === kind);
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      const bars = g.map(r => r.barsSweepToTouch).filter((n): n is number => n !== null);
      md += `| ${src} | ${liquiditySweepLabel(kind)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(bars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 5. HTF 존 내부 LTF 구조 전환\n\n';
  md += '| 존 | 존TF | 4H 구조 | 표본 | 이후 근단이탈 | 이후 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 구조돌파봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ['1W', '1M'] as ZoneTf[]) {
      for (const kind of ['favorableBreak', 'adverseBreak', 'none'] as StructureBreakKind[]) {
        const g = ltfStructures.filter(r => r.source === src && r.zoneTf === ztf && r.firstBreak === kind);
        if (!g.length) continue;
        const near = g.filter(r => r.outcomeAfterBreak === 'nearExit').length;
        const invalid = g.filter(r => r.outcomeAfterBreak === 'invalidated').length;
        const mid = g.filter(r => r.reachedMid).length;
        const far = g.filter(r => r.reachedFarEdge).length;
        const bars = g.map(r => r.barsToBreak).filter((n): n is number => n !== null);
        md += `| ${src} | ${ztf} | ${structureBreakLabel(kind)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(bars).toFixed(1)} |\n`;
      }
    }
  }

  return md;
}

function buildPreTouchApproachReport(records: PreTouchApproachRec[]): string {
  let md = '\n---\n\n# 터치 전 캔들 접근 행동 분석\n\n';
  md += 'OB/FVG 첫 터치 직전 5/10/20봉의 접근 방식을 집계. 수익률이 아니라 터치 직전 캔들이 급하게 꽂혔는지, 압축됐는지, 실체로 밀고 왔는지, 꼬리 노이즈였는지를 이후 구조 결과와 연결한다.\n\n';

  md += '## 4H 관측 — 접근 타입별\n\n';
  md += '| 존 | 접근 타입 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 towardATR | 평균 speedATR | 평균 body | 평균 압축비 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const bucket of ['impulseIntoZone', 'steadyGrindIntoZone', 'compressedDrift', 'wickyNoise', 'sideways', 'fromFarSide', 'mixed', 'insufficientData'] as PreTouchApproachBucket[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.bucket === bucket);
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      const stats = g.map(primaryPreTouchStats).filter((s): s is PreTouchWindowStats => s !== null);
      md += `| ${src} | ${preTouchApproachLabel(bucket)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(stats.map(s => s.towardAtr)).toFixed(2)} | ${avg(stats.map(s => s.speedAtr)).toFixed(2)} | ${avg(stats.map(s => s.bodyRatio)).toFixed(2)} | ${avg(stats.map(s => s.rangeCompression)).toFixed(2)} |\n`;
    }
  }

  md += '\n## 4H 관측 — 속도/변동성/실체 성격\n\n';
  md += '| 구분 | 버킷 | 존 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';
  const groups: [string, string[], (r: PreTouchApproachRec) => string][] = [
    ['속도', ['slow', 'normal', 'fast'], r => r.speedBucket],
    ['변동성', ['compressed', 'neutral', 'expanding'], r => r.volBucket],
    ['캔들성격', ['bodyDriven', 'balanced', 'wickDriven'], r => r.bodyBucket],
  ];
  for (const [groupLabel, keys, keyFn] of groups) {
    for (const key of keys) {
      for (const src of ['OB', 'FVG'] as const) {
        const g = records.filter(r => r.observeTf === '4H' && r.source === src && keyFn(r) === key);
        if (!g.length) continue;
        const label =
          groupLabel === '속도' ? preTouchSpeedLabel(key as PreTouchSpeedBucket) :
            groupLabel === '변동성' ? preTouchVolLabel(key as PreTouchVolBucket) :
              preTouchBodyLabel(key as PreTouchBodyBucket);
        const near = g.filter(r => r.outcome === 'nearExit').length;
        const invalid = g.filter(r => r.outcome === 'invalidated').length;
        const mid = g.filter(r => r.reachedMid).length;
        const far = g.filter(r => r.reachedFarEdge).length;
        md += `| ${groupLabel} | ${label} | ${src} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} |\n`;
      }
    }
  }

  md += '\n## 1W 존 — 4H/1D 접근 타입별\n\n';
  md += '| 존 | 관측 | 접근 타입 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const otf of ['4H', '1D'] as ObserveTf[]) {
      for (const bucket of ['impulseIntoZone', 'steadyGrindIntoZone', 'compressedDrift', 'wickyNoise', 'sideways', 'fromFarSide', 'mixed'] as PreTouchApproachBucket[]) {
        const g = records.filter(r => r.zoneTf === '1W' && r.observeTf === otf && r.source === src && r.bucket === bucket);
        if (!g.length) continue;
        const near = g.filter(r => r.outcome === 'nearExit').length;
        const invalid = g.filter(r => r.outcome === 'invalidated').length;
        const mid = g.filter(r => r.reachedMid).length;
        const far = g.filter(r => r.reachedFarEdge).length;
        md += `| ${src} | ${otf} | ${preTouchApproachLabel(bucket)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} |\n`;
      }
    }
  }

  return md;
}

function zoneQualityLabel(bucket: ZoneQualityBucket): string {
  return ({
    strongDisplacement: '강한 displacement',
    wideVolatile: '넓고 변동성 큼',
    thinClean: '얇고 깔끔함',
    wickyOrigin: '원천캔들 꼬리 큼',
    normal: '보통',
    unknown: '미분류',
  } as const)[bucket];
}

function widthAtrLabel(bucket: WidthAtrBucket): string {
  return ({ thin: '얇음(<0.5ATR)', normal: '보통', wide: '넓음', veryWide: '매우 넓음', unknown: '미분류' } as const)[bucket];
}

function premiumDiscountLabel(bucket: PremiumDiscountBucket): string {
  return ({
    deepDiscount: 'deep discount',
    discount: 'discount',
    equilibrium: 'equilibrium',
    premium: 'premium',
    deepPremium: 'deep premium',
    unknown: '미분류',
  } as const)[bucket];
}

function decayLabel(bucket: DecayBucket): string {
  return ({
    sameWeek: '7일 이내',
    freshMonth: '8-30일',
    agedQuarter: '31-90일',
    old: '90일+',
    noTouch: '미터치',
  } as const)[bucket];
}

function dwellLabel(bucket: DwellBucket): string {
  return ({ none: '0봉', oneBar: '1봉', twoToThree: '2-3봉', fourToEight: '4-8봉', ninePlus: '9봉+' } as const)[bucket];
}

function nestedTimingLabel(bucket: NestedTimingBucket): string {
  return ({ none: '없음', beforeTouch: '터치 전 생성', afterTouch: '터치 후 생성', both: '전후 모두' } as const)[bucket];
}

function nestedDirectionLabel(bucket: NestedDirectionBucket): string {
  return ({ none: '없음', sameDirection: '동방향', oppositeDirection: '역방향', mixed: '혼합' } as const)[bucket];
}

function targetLiquidityLabel(bucket: TargetLiquidityBucket): string {
  return ({ noLevel: '목표 없음', behindPrice: '가격 뒤쪽', near: '1ATR 이내', normal: '1-3ATR', far: '3ATR+' } as const)[bucket];
}

function btcSyncLabel(sync: BtcSync): string {
  return ({ aligned: 'BTC 동조', against: 'BTC 역행', btcRange: 'BTC 횡보', unknown: '미분류', self: 'BTC 자체' } as const)[sync];
}

function closeEntryCountBucket(n: number): string {
  if (n === 0) return '0회';
  if (n === 1) return '1회';
  if (n === 2) return '2회';
  if (n <= 5) return '3-5회';
  return '6회+';
}

function appendRemainingRows<T extends string>(
  md: string,
  records: RemainingSmcBehaviorRec[],
  keys: readonly T[],
  labelFn: (key: T) => string,
  keyFn: (r: RemainingSmcBehaviorRec) => T,
): string {
  for (const src of ['OB', 'FVG'] as const) {
    for (const key of keys) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && keyFn(r) === key);
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      md += `| ${src} | ${labelFn(key)} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(g.map(r => r.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }
  return md;
}

function buildRemainingSmcBehaviorReport(records: RemainingSmcBehaviorRec[]): string {
  let md = '\n---\n\n# 나머지 SMC 행동 가설 분석\n\n';
  md += '15개 백로그 중 기존 5개와 pre-touch 접근을 제외한 항목을 존별/관측TF별 통합 레코드로 집계. 기본 표는 4H 관측 기준이며, 수익률이 아니라 이후 구조 결과만 본다.\n\n';

  md += '## 1. 존 수명 / 재테스트 감쇠\n\n';
  md += '| 존 | 종가 에피소드 수 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['0회', '1회', '2회', '3-5회', '6회+'] as const, k => k, r => closeEntryCountBucket(r.closeEntryCount) as '0회' | '1회' | '2회' | '3-5회' | '6회+');

  md += '\n## 5. 존 생성 품질\n\n';
  md += '| 존 | 생성 품질 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['strongDisplacement', 'thinClean', 'normal', 'wideVolatile', 'wickyOrigin', 'unknown'] as ZoneQualityBucket[], zoneQualityLabel, r => r.creation.bucket);

  md += '\n## 9. nested zone\n\n';
  md += '| 존 | 4H nested 생성 시점 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['none', 'beforeTouch', 'afterTouch', 'both'] as NestedTimingBucket[], nestedTimingLabel, r => r.nested.timing);
  md += '\n| 존 | 4H nested 방향 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['none', 'sameDirection', 'oppositeDirection', 'mixed'] as NestedDirectionBucket[], nestedDirectionLabel, r => r.nested.direction);

  md += '\n## 10. premium / discount 위치\n\n';
  md += '| 존 | range 위치 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['deepDiscount', 'discount', 'equilibrium', 'premium', 'deepPremium', 'unknown'] as PremiumDiscountBucket[], premiumDiscountLabel, r => r.premiumDiscount.bucket);
  md += '\n| 존 | 방향상 위치 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const label of ['유리 위치', '불리 위치', '미분류']) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && (
        label === '유리 위치' ? r.premiumDiscount.favorableForDirection === true :
          label === '불리 위치' ? r.premiumDiscount.favorableForDirection === false :
            r.premiumDiscount.favorableForDirection === null
      ));
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      md += `| ${src} | ${label} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(g.map(r => r.closeBarsInZone)).toFixed(1)} |\n`;
    }
  }

  md += '\n## 11. 존 폭 / ATR 정규화\n\n';
  md += '| 존 | 존폭/ATR | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['thin', 'normal', 'wide', 'veryWide', 'unknown'] as WidthAtrBucket[], widthAtrLabel, r => r.widthAtrBucket);

  md += '\n## 12. 시간 기반 decay\n\n';
  md += '| 존 | 생성 후 첫터치 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['sameWeek', 'freshMonth', 'agedQuarter', 'old', 'noTouch'] as DecayBucket[], decayLabel, r => r.decayBucket);

  md += '\n## 13. 존 내부 체류 시간\n\n';
  md += '| 존 | 존내 종가 체류 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['none', 'oneBar', 'twoToThree', 'fourToEight', 'ninePlus'] as DwellBucket[], dwellLabel, r => r.dwellBucket);

  md += '\n## 14. 반응 후 목표 유동성까지 거리\n\n';
  md += '| 존 | 목표 swing 거리 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['noLevel', 'behindPrice', 'near', 'normal', 'far'] as TargetLiquidityBucket[], targetLiquidityLabel, r => r.targetLiquidity.bucket);
  md += '\n| 존 | 목표 도달 여부 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 목표거리(ATR) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const label of ['도달', '미도달', '목표없음']) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && (
        label === '도달' ? r.targetLiquidity.reached === true :
          label === '미도달' ? r.targetLiquidity.reached === false :
            r.targetLiquidity.reached === null
      ));
      if (!g.length) continue;
      const near = g.filter(r => r.outcome === 'nearExit').length;
      const invalid = g.filter(r => r.outcome === 'invalidated').length;
      const mid = g.filter(r => r.reachedMid).length;
      const far = g.filter(r => r.reachedFarEdge).length;
      const distances = g.map(r => r.targetLiquidity.distanceAtr).filter((n): n is number => n !== null);
      md += `| ${src} | ${label} | ${g.length} | ${pct(near, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(far, g.length)} | ${avg(distances).toFixed(2)} |\n`;
    }
  }

  md += '\n## 15. BTC 동조 필터\n\n';
  md += '| 존 | BTC 상태 | 표본 | 근단이탈 | 손절쪽이탈 | mid/CE도달 | far edge도달 | 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  md = appendRemainingRows(md, records, ['aligned', 'against', 'btcRange', 'unknown', 'self'] as BtcSync[], btcSyncLabel, r => r.btc.sync);

  return md;
}

function brokenPathLabel(path: BrokenZonePath): string {
  return ({
    breakNoReentry: '이탈 후 재진입 없음',
    failedReclaim: 'mid/CE 회복 실패 후 지속',
    polarityFlip: '되돌림 후 반대방향 지속',
    trueReclaim: '근단 회복(true reclaim)',
    chopOpen: '미결/횡보',
  } as const)[path];
}

function brokenDepthLabel(depth: BrokenReclaimDepth): string {
  return ({
    none: '재진입 없음',
    farHalfOnly: 'far half까지만',
    midReached: 'mid/CE 회복',
    nearSideReached: 'near side 회복',
    nearExit: '근단 밖 회복',
  } as const)[depth];
}

function brokenReentrySpeed(n: number | null): BrokenReentrySpeed {
  if (n === null) return 'noReentry';
  if (n <= 0) return 'sameBar';
  if (n <= 3) return '1to3';
  if (n <= 12) return '4to12';
  if (n <= 48) return '13to48';
  return '49plus';
}

function brokenRebreakSpeed(r: BrokenZoneRec): BrokenRebreakSpeed {
  if (!r.rebreakAfterReentry || r.barsReentryToRebreak === null) return 'noRebreak';
  if (r.barsReentryToRebreak <= 0) return 'sameBar';
  if (r.barsReentryToRebreak <= 3) return '1to3';
  if (r.barsReentryToRebreak <= 12) return '4to12';
  return '13plus';
}

function continuationOrderOf(r: BrokenZoneRec): ContinuationOrder {
  if (!r.continuationHit || r.barsBreakToContinuation === null) return 'noContinuation';
  if (!r.reentered || r.barsBreakToReentry === null) return 'beforeReentry';
  if (r.trueReclaim) {
    const reclaimBarsFromBreak = (r.barsBreakToReentry ?? 0) + (r.barsReentryToResolution ?? 0);
    return r.barsBreakToContinuation <= reclaimBarsFromBreak ? 'beforeTrueReclaim' : 'afterTrueReclaim';
  }
  return r.barsBreakToContinuation <= r.barsBreakToReentry ? 'beforeReentry' : 'afterFailedReclaim';
}

function strategyCandidateOf(r: BrokenZoneRec, order: ContinuationOrder): BrokenStrategyCandidate {
  if (r.path === 'breakNoReentry' || order === 'beforeReentry') return 'continuationClean';
  if (r.path === 'failedReclaim') return 'failedReclaimShort';
  if (r.path === 'polarityFlip') return 'polarityFlipShort';
  if (r.path === 'trueReclaim') return 'trueReclaimRisky';
  return 'avoidChop';
}

function brokenDetailRecords(records: BrokenZoneRec[]): BrokenZoneDetailRec[] {
  return records.map(r => {
    const reentrySpeed = brokenReentrySpeed(r.barsBreakToReentry);
    const rebreakSpeed = brokenRebreakSpeed(r);
    const continuationOrder = continuationOrderOf(r);
    return {
      ...r,
      reentrySpeed,
      rebreakSpeed,
      continuationOrder,
      strategyCandidate: strategyCandidateOf(r, continuationOrder),
      fastFailedReclaim: r.path === 'failedReclaim' && (reentrySpeed === '1to3' || reentrySpeed === '4to12') && r.rebreakAfterReentry,
      slowReclaim: reentrySpeed === '13to48' || reentrySpeed === '49plus',
      cleanContinuation: r.path === 'breakNoReentry' || continuationOrder === 'beforeReentry',
      trueReclaimBeforeContinuation: r.trueReclaim && continuationOrder !== 'beforeTrueReclaim',
      fvgFillBucket: priorDwellBucket(r.priorCloseBarsInZone),
    };
  });
}

function brokenSignalIndex(r: BrokenZoneDetailRec, observe: Candle[]): { idx: number; kind: BrokenStrategySignalKind } | null {
  const breakIdx = observe.findIndex(c => c.time === r.breakTime);
  if (breakIdx < 0) return null;
  if (r.strategyCandidate === 'continuationClean') return { idx: breakIdx, kind: 'breakClose' };
  if (r.strategyCandidate === 'avoidChop') return { idx: breakIdx, kind: 'avoidChopSnapshot' };
  if (r.strategyCandidate === 'failedReclaimShort' || r.strategyCandidate === 'polarityFlipShort') {
    if (r.barsBreakToReentry === null || r.barsReentryToRebreak === null) return null;
    return { idx: breakIdx + r.barsBreakToReentry + r.barsReentryToRebreak, kind: 'rebreakClose' };
  }
  if (r.strategyCandidate === 'trueReclaimRisky') {
    if (r.barsBreakToReentry === null || r.barsReentryToResolution === null) return null;
    return { idx: breakIdx + r.barsBreakToReentry + r.barsReentryToResolution, kind: 'trueReclaimClose' };
  }
  return null;
}

function continuationMultipleOfCandle(zone: Zone, favorUp: boolean, c: Candle): number {
  const width = zone.high - zone.low;
  if (width <= 0) return 0;
  return favorUp
    ? Math.max(0, (zone.low - c.low) / width)
    : Math.max(0, (c.high - zone.high) / width);
}

function adverseReclaimDepthOfClose(zone: Zone, favorUp: boolean, c: Candle): number {
  return Math.max(0, 1 - penetrationOfPrice(zone, favorUp, c.close));
}

function adverseReclaimBucket(depth: number): BrokenAdverseReclaimBucket {
  if (depth <= 0) return 'none';
  if (depth < 0.382) return 'farEdgeOnly';
  if (depth < 0.5) return 'farHalf';
  if (depth < 0.618) return 'midReached';
  if (depth <= 1) return 'nearSideReached';
  return 'nearOutside';
}

function fvgDwellPenaltyBucket(r: BrokenZoneDetailRec): FvgDwellPenaltyBucket {
  if (r.source !== 'FVG') return 'notFvg';
  if (r.priorCloseBarsInZone >= 9) return 'longDwell';
  if (r.priorCloseBarsInZone >= 4) return 'mediumDwell';
  return 'shortDwell';
}

// ── 8차 교정: 관측 가능 결정시점 기반 broken-zone forward (미래라벨 조건화 제거) ──
// 7차(brokenStrategyForwardForZone)는 strategyCandidate(40일 창에서 "재진입 없음"을
// 사후 확인해야 정해지는 라벨)로 표본을 거른 뒤 break 시점부터 측정해 생존편향이 있었다.
// (진입 시점엔 그 존이 clean인지 알 수 없으므로 그 통계로는 매매할 수 없음.)
// 여기서는 깨진 존마다 "그 순간 관측되는" 결정시점만 신호로 emit하고, 각 신호의 다음 봉부터
// 측정한다. breakClose 모집단 = 손절쪽 종가이탈한 모든 존(거르지 않음) → 실시간 진입 가능 통계.
type BrokenSignalKind = 'breakClose' | 'rebreakClose' | 'trueReclaimClose';

type BrokenSignalForwardRec = {
  symbol: string;
  zoneId: string;
  zoneTf: ZoneTf;
  observeTf: ObserveTf;
  source: 'OB' | 'FVG';
  direction: 'bull' | 'bear';
  regime: TrendRegime;
  signalKind: BrokenSignalKind;
  signalTime: number;
  barsTouchToSignal: number;                 // 관측 가능 타이밍
  fvgDwellAtSignal: FvgDwellPenaltyBucket;    // 신호 전까지 존내 종가 체류(관측 가능)
  forwardBars: number;
  // continuation은 wick(부풀림)·close(보수) 두 기준 병기 — 부풀림 노출용
  contWick1Hit: boolean;
  contWick2Hit: boolean;
  contClose1Hit: boolean;
  maxContWick: number;
  maxContClose: number;
  // 신호 이후 결과(진입 후 위험 평가용)
  reentryAfterSignal: boolean;
  oppositeReclaimAfterSignal: boolean;
  maxAdverseReclaimDepth: number;
  firstForwardOutcome: BrokenForwardOutcome;
  barsToFirstForwardOutcome: number | null;
};

// 종가 기준 continuation 배수 (wick 버전 continuationMultipleOfCandle의 보수 대조)
function continuationCloseMultiple(zone: Zone, favorUp: boolean, c: Candle): number {
  const width = zone.high - zone.low;
  if (width <= 0) return 0;
  return favorUp
    ? Math.max(0, (zone.low - c.close) / width)
    : Math.max(0, (c.close - zone.high) / width);
}

type ForwardMeasure = Pick<BrokenSignalForwardRec,
  'forwardBars' | 'contWick1Hit' | 'contWick2Hit' | 'contClose1Hit' | 'maxContWick' | 'maxContClose' |
  'reentryAfterSignal' | 'oppositeReclaimAfterSignal' | 'maxAdverseReclaimDepth' |
  'firstForwardOutcome' | 'barsToFirstForwardOutcome'>;

// 신호 인덱스 다음 봉부터 fwdBars 동안만 측정 (미래정보 없음)
function measureBrokenForward(zone: Zone, favorUp: boolean, observe: Candle[], signalIdx: number, fwdBars: number): ForwardMeasure {
  const endIdx = Math.min(observe.length - 1, signalIdx + fwdBars);
  let maxContWick = 0, maxContClose = 0, maxAdverse = 0;
  let cw1: number | null = null, cw2: number | null = null, cc1: number | null = null;
  let reentry: number | null = null, opposite: number | null = null;
  let firstOutcome: BrokenForwardOutcome = 'unresolved';
  let firstOutcomeBars: number | null = null;
  for (let i = signalIdx + 1; i <= endIdx; i++) {
    const c = observe[i];
    const bars = i - signalIdx;
    const cw = continuationMultipleOfCandle(zone, favorUp, c);
    const cc = continuationCloseMultiple(zone, favorUp, c);
    const reentered = closeInZone(zone, c);
    const oppositeReclaim = closeStateOf(zone, favorUp, c) === 'nearOutside';
    const adv = adverseReclaimDepthOfClose(zone, favorUp, c);
    if (cw > maxContWick) maxContWick = cw;
    if (cc > maxContClose) maxContClose = cc;
    if (adv > maxAdverse) maxAdverse = adv;
    if (cw1 === null && cw >= 1) cw1 = bars;
    if (cw2 === null && cw >= 2) cw2 = bars;
    if (cc1 === null && cc >= 1) cc1 = bars;
    if (reentry === null && reentered) reentry = bars;
    if (opposite === null && oppositeReclaim) opposite = bars;
    if (firstOutcome === 'unresolved') {
      const outs: BrokenForwardOutcome[] = [];
      if (cw >= 1) outs.push('continuation1x');
      if (reentered) outs.push('reentry');
      if (oppositeReclaim) outs.push('oppositeReclaim');
      if (outs.length) { firstOutcome = outs.length === 1 ? outs[0] : 'mixedSameBar'; firstOutcomeBars = bars; }
    }
  }
  return {
    forwardBars: Math.max(0, endIdx - signalIdx),
    contWick1Hit: cw1 !== null, contWick2Hit: cw2 !== null, contClose1Hit: cc1 !== null,
    maxContWick, maxContClose,
    reentryAfterSignal: reentry !== null, oppositeReclaimAfterSignal: opposite !== null,
    maxAdverseReclaimDepth: maxAdverse,
    firstForwardOutcome: firstOutcome, barsToFirstForwardOutcome: firstOutcomeBars,
  };
}

function brokenSignalForwards(symbol: string, zoneId: string, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[]): BrokenSignalForwardRec[] {
  const width = zone.high - zone.low;
  if (width <= 0 || (width / zone.mid) * 100 < MIN_WIDTH_PCT) return [];
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return [];
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const lifeEnd = Math.min(observe.length - 1, touchIdx + fwdBars); // 신호 탐색 범위 = 존 활성 생애

  // breakClose: 손절쪽 종가이탈 첫 봉 (거르지 않음 — 모든 깨진 존이 모집단)
  let breakIdx = -1;
  for (let i = touchIdx; i <= lifeEnd; i++) {
    if (closeBreaksFarEdge(zone, favorUp, observe[i])) { breakIdx = i; break; }
  }
  if (breakIdx < 0) return [];

  const regime = regimeAt(zone, observe, touchIdx);
  const dwellAt = (idx: number): FvgDwellPenaltyBucket => {
    if (zone.zoneType !== 'FVG') return 'notFvg';
    let n = 0;
    for (let i = touchIdx; i <= idx; i++) if (closeInZone(zone, observe[i])) n++;
    return n >= 9 ? 'longDwell' : n >= 4 ? 'mediumDwell' : 'shortDwell';
  };
  const mk = (kind: BrokenSignalKind, idx: number): BrokenSignalForwardRec => ({
    symbol, zoneId, zoneTf, observeTf,
    source: zone.zoneType, direction: zone.direction, regime,
    signalKind: kind, signalTime: observe[idx].time,
    barsTouchToSignal: idx - touchIdx, fvgDwellAtSignal: dwellAt(idx),
    ...measureBrokenForward(zone, favorUp, observe, idx, fwdBars),
  });

  const recs: BrokenSignalForwardRec[] = [mk('breakClose', breakIdx)];

  // 재진입(종가가 다시 존 안) 관측 시, 이후의 추가 결정시점도 각각 emit (각 시점은 관측 가능)
  let reentryIdx = -1;
  for (let i = breakIdx + 1; i <= lifeEnd; i++) {
    if (closeInZone(zone, observe[i])) { reentryIdx = i; break; }
  }
  if (reentryIdx >= 0) {
    for (let i = reentryIdx + 1; i <= lifeEnd; i++) {
      if (closeStateOf(zone, favorUp, observe[i]) === 'nearOutside') { recs.push(mk('trueReclaimClose', i)); break; }
    }
    for (let i = reentryIdx + 1; i <= lifeEnd; i++) {
      if (closeBreaksFarEdge(zone, favorUp, observe[i])) { recs.push(mk('rebreakClose', i)); break; }
    }
  }
  return recs;
}

function brokenStrategyForwardForZone(detail: BrokenZoneDetailRec, zone: Zone, observe: Candle[]): BrokenStrategyForwardRec | null {
  const signal = brokenSignalIndex(detail, observe);
  if (!signal) return null;
  const width = zone.high - zone.low;
  if (width <= 0) return null;

  const favorUp = zone.direction === 'bull';
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[detail.observeTf]));
  const endIdx = Math.min(observe.length - 1, signal.idx + fwdBars);
  const actualForwardBars = Math.max(0, endIdx - signal.idx);

  let barsToContinuation05: number | null = null;
  let barsToContinuation1: number | null = null;
  let barsToContinuation2: number | null = null;
  let barsToReentryAfterSignal: number | null = null;
  let barsToOppositeReclaim: number | null = null;
  let firstForwardOutcome: BrokenForwardOutcome = 'unresolved';
  let barsToFirstForwardOutcome: number | null = null;
  let maxContinuationWidth = 0;
  let maxAdverseReclaimDepth = 0;

  for (let i = signal.idx + 1; i <= endIdx; i++) {
    const c = observe[i];
    const bars = i - signal.idx;
    const continuationWidth = continuationMultipleOfCandle(zone, favorUp, c);
    const closeState = closeStateOf(zone, favorUp, c);
    const reentry = closeInZone(zone, c);
    const oppositeReclaim = closeState === 'nearOutside';
    const adverseDepth = adverseReclaimDepthOfClose(zone, favorUp, c);

    if (continuationWidth > maxContinuationWidth) maxContinuationWidth = continuationWidth;
    if (adverseDepth > maxAdverseReclaimDepth) maxAdverseReclaimDepth = adverseDepth;
    if (barsToContinuation05 === null && continuationWidth >= 0.5) barsToContinuation05 = bars;
    if (barsToContinuation1 === null && continuationWidth >= 1) barsToContinuation1 = bars;
    if (barsToContinuation2 === null && continuationWidth >= 2) barsToContinuation2 = bars;
    if (barsToReentryAfterSignal === null && reentry) barsToReentryAfterSignal = bars;
    if (barsToOppositeReclaim === null && oppositeReclaim) barsToOppositeReclaim = bars;

    if (firstForwardOutcome === 'unresolved') {
      const outcomes: BrokenForwardOutcome[] = [];
      if (continuationWidth >= 1) outcomes.push('continuation1x');
      if (reentry) outcomes.push('reentry');
      if (oppositeReclaim) outcomes.push('oppositeReclaim');
      if (outcomes.length > 0) {
        firstForwardOutcome = outcomes.length === 1 ? outcomes[0] : 'mixedSameBar';
        barsToFirstForwardOutcome = bars;
      }
    }
  }

  return {
    ...detail,
    signalTime: observe[signal.idx].time,
    signalBarsFromBreak: signal.idx - observe.findIndex(c => c.time === detail.breakTime),
    signalKind: signal.kind,
    forwardBars: actualForwardBars,
    continuation05Hit: barsToContinuation05 !== null,
    barsToContinuation05,
    continuation1Hit: barsToContinuation1 !== null,
    barsToContinuation1,
    continuation2Hit: barsToContinuation2 !== null,
    barsToContinuation2,
    reentryAfterSignal: barsToReentryAfterSignal !== null,
    barsToReentryAfterSignal,
    oppositeReclaimAfterSignal: barsToOppositeReclaim !== null,
    barsToOppositeReclaim,
    firstForwardOutcome,
    barsToFirstForwardOutcome,
    maxContinuationWidth,
    maxAdverseReclaimDepth,
    adverseReclaimBucket: adverseReclaimBucket(maxAdverseReclaimDepth),
    fvgDwellPenalty: fvgDwellPenaltyBucket(detail),
  };
}

function brokenReentrySpeedLabel(speed: BrokenReentrySpeed): string {
  return ({
    noReentry: '재진입 없음',
    sameBar: '동봉',
    '1to3': '1-3봉',
    '4to12': '4-12봉',
    '13to48': '13-48봉',
    '49plus': '49봉+',
  } as const)[speed];
}

function brokenRebreakSpeedLabel(speed: BrokenRebreakSpeed): string {
  return ({
    noRebreak: '재이탈 없음',
    sameBar: '동봉',
    '1to3': '1-3봉',
    '4to12': '4-12봉',
    '13plus': '13봉+',
  } as const)[speed];
}

function continuationOrderLabel(order: ContinuationOrder): string {
  return ({
    noContinuation: 'continuation 없음',
    beforeReentry: '재진입 전 continuation',
    beforeTrueReclaim: 'true reclaim 전 continuation',
    afterTrueReclaim: 'true reclaim 후 continuation',
    afterFailedReclaim: 'failed reclaim 후 continuation',
  } as const)[order];
}

function strategyCandidateLabel(candidate: BrokenStrategyCandidate): string {
  return ({
    continuationClean: 'clean continuation',
    failedReclaimShort: 'failed reclaim continuation',
    polarityFlipShort: 'polarity flip continuation',
    trueReclaimRisky: 'true reclaim 재검증',
    avoidChop: '회피/횡보',
  } as const)[candidate];
}

function brokenSignalKindLabel(kind: BrokenStrategySignalKind): string {
  return ({
    breakClose: '손절쪽 종가이탈',
    rebreakClose: '재진입 후 재이탈',
    trueReclaimClose: '근단 밖 회복',
    avoidChopSnapshot: '미결/횡보 스냅샷',
  } as const)[kind];
}

function brokenForwardOutcomeLabel(outcome: BrokenForwardOutcome): string {
  return ({
    continuation1x: '1존폭 continuation',
    reentry: '존 재진입',
    oppositeReclaim: '근단 밖 회복',
    mixedSameBar: '동봉 혼합',
    unresolved: '미해소',
  } as const)[outcome];
}

function adverseReclaimBucketLabel(bucket: BrokenAdverseReclaimBucket): string {
  return ({
    none: '회복 없음',
    farEdgeOnly: 'far edge 근처',
    farHalf: 'far half',
    midReached: 'mid/CE',
    nearSideReached: 'near side',
    nearOutside: '근단 밖',
  } as const)[bucket];
}

function fvgDwellPenaltyLabel(bucket: FvgDwellPenaltyBucket): string {
  return ({
    notFvg: 'OB',
    shortDwell: '짧은 체류',
    mediumDwell: '중간 체류',
    longDwell: '긴 체류',
  } as const)[bucket];
}

function priorDwellBucket(n: number): string {
  if (n <= 0) return '0봉';
  if (n === 1) return '1봉';
  if (n <= 3) return '2-3봉';
  if (n <= 8) return '4-8봉';
  return '9봉+';
}

function buildBrokenZoneReport(records: BrokenZoneRec[]): string {
  let md = '\n---\n\n# 깨진 존 재활용 / Polarity Flip 분석\n\n';
  md += '손절쪽 종가이탈이 발생한 존만 대상으로, 그 이후 재진입·mid/CE 회복·근단 회복·반대방향 지속 여부를 집계. ';
  md += '기존 존 방향의 반전 전략이 아니라, 깨진 존을 반대 방향 기준선으로 재활용할 수 있는지 보는 섹션.\n\n';

  md += '## 1. broken OB/FVG retest — 이탈 후 경로\n\n';
  md += '| 존 | 경로 | 표본 | 재진입 | continuation | true reclaim | 평균 이탈→재진입봉 | 평균 해소봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const path of ['breakNoReentry', 'failedReclaim', 'polarityFlip', 'trueReclaim', 'chopOpen'] as BrokenZonePath[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.path === path);
      if (!g.length) continue;
      const reentry = g.filter(r => r.reentered).length;
      const cont = g.filter(r => r.continuationHit).length;
      const tr = g.filter(r => r.trueReclaim).length;
      const reentryBars = g.map(r => r.barsBreakToReentry).filter((n): n is number => n !== null);
      const resolutionBars = g.map(r => r.barsReentryToResolution).filter((n): n is number => n !== null);
      md += `| ${src} | ${brokenPathLabel(path)} | ${g.length} | ${pct(reentry, g.length)} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${avg(reentryBars).toFixed(1)} | ${avg(resolutionBars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 2. failed reclaim / true reclaim — 회복 깊이별\n\n';
  md += '| 존 | 회복 깊이 | 표본 | continuation | 재이탈 | true reclaim | 평균 이탈→재진입봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const depth of ['none', 'farHalfOnly', 'midReached', 'nearSideReached', 'nearExit'] as BrokenReclaimDepth[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.reclaimDepth === depth);
      if (!g.length) continue;
      const cont = g.filter(r => r.continuationHit).length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      const tr = g.filter(r => r.trueReclaim).length;
      const reentryBars = g.map(r => r.barsBreakToReentry).filter((n): n is number => n !== null);
      md += `| ${src} | ${brokenDepthLabel(depth)} | ${g.length} | ${pct(cont, g.length)} | ${pct(rebreak, g.length)} | ${pct(tr, g.length)} | ${avg(reentryBars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 3. polarity flip — mid/CE 회복 후 반대방향 지속\n\n';
  md += '| 존 | mid/CE 회복 | 표본 | polarity flip | true reclaim | continuation | 재이탈 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const recovered of [false, true]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.reentered && r.midRecovered === recovered);
      if (!g.length) continue;
      const flip = g.filter(r => r.path === 'polarityFlip').length;
      const tr = g.filter(r => r.trueReclaim).length;
      const cont = g.filter(r => r.continuationHit).length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      md += `| ${src} | ${recovered ? '회복' : '미회복'} | ${g.length} | ${pct(flip, g.length)} | ${pct(tr, g.length)} | ${pct(cont, g.length)} | ${pct(rebreak, g.length)} |\n`;
    }
  }

  md += '\n## 4. FVG fill-complete continuation\n\n';
  md += '| 이탈 전 FVG 내부 종가 체류 | 표본 | 재진입 | continuation | true reclaim | polarity flip | 평균 이탈봉 |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|\n';
  for (const bucket of ['0봉', '1봉', '2-3봉', '4-8봉', '9봉+']) {
    const g = records.filter(r => r.observeTf === '4H' && r.source === 'FVG' && priorDwellBucket(r.priorCloseBarsInZone) === bucket);
    if (!g.length) continue;
    const reentry = g.filter(r => r.reentered).length;
    const cont = g.filter(r => r.continuationHit).length;
    const tr = g.filter(r => r.trueReclaim).length;
    const flip = g.filter(r => r.path === 'polarityFlip').length;
    md += `| ${bucket} | ${g.length} | ${pct(reentry, g.length)} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${pct(flip, g.length)} | ${avg(g.map(r => r.barsTouchToBreak)).toFixed(1)} |\n`;
  }

  md += '\n## 5. 존TF별 broken-zone 경로\n\n';
  md += '| 존 | 존TF | 경로 | 표본 | continuation | true reclaim | 평균 이탈→재진입봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const path of ['failedReclaim', 'polarityFlip', 'trueReclaim', 'breakNoReentry', 'chopOpen'] as BrokenZonePath[]) {
        const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.zoneTf === ztf && r.path === path);
        if (!g.length) continue;
        const cont = g.filter(r => r.continuationHit).length;
        const tr = g.filter(r => r.trueReclaim).length;
        const reentryBars = g.map(r => r.barsBreakToReentry).filter((n): n is number => n !== null);
        md += `| ${src} | ${ztf} | ${brokenPathLabel(path)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${avg(reentryBars).toFixed(1)} |\n`;
      }
    }
  }

  return md;
}

function buildBrokenZoneDetailReport(records: BrokenZoneDetailRec[]): string {
  let md = '\n---\n\n# 깨진 존 정밀 조건 분석\n\n';
  md += '5차 broken-zone raw를 더 세밀하게 쪼개어, 이탈 후 재진입 속도·재이탈 속도·continuation 선행 여부·존TF별 차이를 집계.\n\n';

  md += '## 1. 이탈 후 재진입 속도\n\n';
  md += '| 존 | 재진입 속도 | 표본 | continuation | true reclaim | polarity flip | 재이탈 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const speed of ['noReentry', '1to3', '4to12', '13to48', '49plus'] as BrokenReentrySpeed[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.reentrySpeed === speed);
      if (!g.length) continue;
      const cont = g.filter(r => r.continuationHit).length;
      const tr = g.filter(r => r.trueReclaim).length;
      const flip = g.filter(r => r.path === 'polarityFlip').length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      md += `| ${src} | ${brokenReentrySpeedLabel(speed)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${pct(flip, g.length)} | ${pct(rebreak, g.length)} |\n`;
    }
  }

  md += '\n## 2. 재진입 후 회복 깊이 × 재이탈 속도\n\n';
  md += '| 존 | 회복 깊이 | 재이탈 속도 | 표본 | continuation | true reclaim | 평균 해소봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const depth of ['farHalfOnly', 'midReached', 'nearSideReached', 'nearExit'] as BrokenReclaimDepth[]) {
      for (const speed of ['1to3', '4to12', '13plus', 'noRebreak'] as BrokenRebreakSpeed[]) {
        const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.reclaimDepth === depth && r.rebreakSpeed === speed);
        if (!g.length) continue;
        const cont = g.filter(r => r.continuationHit).length;
        const tr = g.filter(r => r.trueReclaim).length;
        const resolutionBars = g.map(r => r.barsReentryToResolution).filter((n): n is number => n !== null);
        md += `| ${src} | ${brokenDepthLabel(depth)} | ${brokenRebreakSpeedLabel(speed)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${avg(resolutionBars).toFixed(1)} |\n`;
      }
    }
  }

  md += '\n## 3. continuation 선행 여부\n\n';
  md += '| 존 | 순서 | 표본 | true reclaim | polarity flip | 재이탈 | 평균 이탈→재진입봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const order of ['beforeReentry', 'afterFailedReclaim', 'beforeTrueReclaim', 'afterTrueReclaim', 'noContinuation'] as ContinuationOrder[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.continuationOrder === order);
      if (!g.length) continue;
      const tr = g.filter(r => r.trueReclaim).length;
      const flip = g.filter(r => r.path === 'polarityFlip').length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      const reentryBars = g.map(r => r.barsBreakToReentry).filter((n): n is number => n !== null);
      md += `| ${src} | ${continuationOrderLabel(order)} | ${g.length} | ${pct(tr, g.length)} | ${pct(flip, g.length)} | ${pct(rebreak, g.length)} | ${avg(reentryBars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 4. 전략 후보별 상태 품질\n\n';
  md += '| 존 | 후보 | 표본 | continuation | true reclaim | polarity flip | 재이탈 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const candidate of ['continuationClean', 'failedReclaimShort', 'polarityFlipShort', 'trueReclaimRisky', 'avoidChop'] as BrokenStrategyCandidate[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.strategyCandidate === candidate);
      if (!g.length) continue;
      const cont = g.filter(r => r.continuationHit).length;
      const tr = g.filter(r => r.trueReclaim).length;
      const flip = g.filter(r => r.path === 'polarityFlip').length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      md += `| ${src} | ${strategyCandidateLabel(candidate)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${pct(flip, g.length)} | ${pct(rebreak, g.length)} |\n`;
    }
  }

  md += '\n## 5. 존TF × 정밀 경로\n\n';
  md += '| 존 | 존TF | 후보 | 표본 | continuation | true reclaim | 평균 이탈→재진입봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const candidate of ['continuationClean', 'failedReclaimShort', 'polarityFlipShort', 'trueReclaimRisky'] as BrokenStrategyCandidate[]) {
        const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.zoneTf === ztf && r.strategyCandidate === candidate);
        if (!g.length) continue;
        const cont = g.filter(r => r.continuationHit).length;
        const tr = g.filter(r => r.trueReclaim).length;
        const reentryBars = g.map(r => r.barsBreakToReentry).filter((n): n is number => n !== null);
        md += `| ${src} | ${ztf} | ${strategyCandidateLabel(candidate)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${avg(reentryBars).toFixed(1)} |\n`;
      }
    }
  }

  md += '\n## 6. FVG fill 상태별 continuation 품질\n\n';
  md += '| FVG 내부체류 | 재진입 속도 | 표본 | continuation | true reclaim | polarity flip | 재이탈 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const fill of ['0봉', '1봉', '2-3봉', '4-8봉', '9봉+']) {
    for (const speed of ['noReentry', '1to3', '4to12', '13to48', '49plus'] as BrokenReentrySpeed[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === 'FVG' && r.fvgFillBucket === fill && r.reentrySpeed === speed);
      if (!g.length) continue;
      const cont = g.filter(r => r.continuationHit).length;
      const tr = g.filter(r => r.trueReclaim).length;
      const flip = g.filter(r => r.path === 'polarityFlip').length;
      const rebreak = g.filter(r => r.rebreakAfterReentry).length;
      md += `| ${fill} | ${brokenReentrySpeedLabel(speed)} | ${g.length} | ${pct(cont, g.length)} | ${pct(tr, g.length)} | ${pct(flip, g.length)} | ${pct(rebreak, g.length)} |\n`;
    }
  }

  md += '\n## 7. 전략 해석 메모\n\n';
  md += '- 깨진 존은 `얼마나 깊게 회복했는가`보다 `재진입 뒤 얼마나 빨리 다시 손절쪽으로 종가이탈하는가`가 더 강한 상태 조건으로 보인다.\n';
  md += '- `재진입 없음`은 clean continuation 후보로 우선 분류한다. 4H 관측 기준 OB/FVG 모두 continuation이 매우 높아, 깨진 존을 기존 방향 지지/저항으로 재사용하기보다 이탈 방향 지속으로 본다.\n';
  md += '- `존 재진입 → mid/CE 또는 near side 회복 실패 → 손절쪽 재이탈`은 failed reclaim / polarity flip continuation 후보로 본다. CE 회복 자체는 회복 신호가 아니라, 이후 재이탈 여부와 속도로 판정한다.\n';
  md += '- `근단 밖 회복(true reclaim)`도 단독 반전 신호로 쓰지 않는다. true reclaim 전후 continuation이 다시 발생하는 비율이 높으므로, 다음 검증에서는 별도 confirmation이 없으면 회피 또는 축소 조건으로 둔다.\n';
  md += '- FVG는 내부 체류가 길수록 continuation 품질이 둔해지는 경향이 있으므로, fill/dwell이 긴 FVG는 continuation 셋업에서도 별도 감점 조건으로 테스트한다.\n';

  return md;
}

function buildBrokenStrategyForwardReport(records: BrokenStrategyForwardRec[]): string {
  let md = '\n---\n\n# Broken-Zone Strategy Forward Outcomes (사후분류 · 참고용 · 진입신호 아님)\n\n';
  md += '> ⚠️ **이 섹션은 미래정보 편향이 있다.** `strategyCandidate`(continuationClean 등)는 40일 창에서 ';
  md += '"재진입이 없었나"를 사후 확인해야 정해지는 라벨이라, break 시점엔 알 수 없다. 따라서 여기 수치(예: ';
  md += 'clean continuation 1x 99%)는 **실시간 진입에 쓸 수 없다.** 진입용 통계는 위 `결정시점 Forward(8차 교정)` 섹션을 본다. ';
  md += '이 표는 깨진 존을 사후 분류했을 때의 분포만 참고용으로 남긴다.\n\n';
  md += `6차에서 분리한 broken-zone 후보가 발생한 뒤, 다음 봉부터 ${FWD_DAYS}일 동안의 구조적 결과를 집계. `;
  md += 'continuation 목표(0.5/1/2존폭)는 wick 도달 기준, 존 재진입·근단 밖 회복은 종가 기준.\n\n';

  const candidates: BrokenStrategyCandidate[] = ['continuationClean', 'failedReclaimShort', 'polarityFlipShort', 'trueReclaimRisky', 'avoidChop'];

  md += '## 1. 후보별 이후 상태 결과 — 4H 관측\n\n';
  md += '| 존 | 후보 | 표본 | 0.5x cont | 1x cont | 2x cont | 첫결과 continuation | 재진입 재발 | 근단밖 회복 | 평균 1x봉 | 평균 max x | 평균 adverse |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const candidate of candidates) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.strategyCandidate === candidate);
      if (!g.length) continue;
      const c05 = g.filter(r => r.continuation05Hit).length;
      const c1 = g.filter(r => r.continuation1Hit).length;
      const c2 = g.filter(r => r.continuation2Hit).length;
      const firstCont = g.filter(r => r.firstForwardOutcome === 'continuation1x').length;
      const reentry = g.filter(r => r.reentryAfterSignal).length;
      const reclaim = g.filter(r => r.oppositeReclaimAfterSignal).length;
      const c1Bars = g.map(r => r.barsToContinuation1).filter((n): n is number => n !== null);
      md += `| ${src} | ${strategyCandidateLabel(candidate)} | ${g.length} | ${pct(c05, g.length)} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${pct(firstCont, g.length)} | ${pct(reentry, g.length)} | ${pct(reclaim, g.length)} | ${avg(c1Bars).toFixed(1)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} | ${avg(g.map(r => r.maxAdverseReclaimDepth)).toFixed(2)} |\n`;
    }
  }

  md += '\n## 2. 첫 구조 결과 분포 — 4H 관측\n\n';
  md += '| 후보 | 첫 구조 결과 | 표본 | 1x cont | 2x cont | 평균 첫결과봉 | 평균 max x | 평균 adverse |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const candidate of candidates) {
    for (const outcome of ['continuation1x', 'reentry', 'oppositeReclaim', 'mixedSameBar', 'unresolved'] as BrokenForwardOutcome[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.strategyCandidate === candidate && r.firstForwardOutcome === outcome);
      if (!g.length) continue;
      const c1 = g.filter(r => r.continuation1Hit).length;
      const c2 = g.filter(r => r.continuation2Hit).length;
      const firstBars = g.map(r => r.barsToFirstForwardOutcome).filter((n): n is number => n !== null);
      md += `| ${strategyCandidateLabel(candidate)} | ${brokenForwardOutcomeLabel(outcome)} | ${g.length} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${avg(firstBars).toFixed(1)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} | ${avg(g.map(r => r.maxAdverseReclaimDepth)).toFixed(2)} |\n`;
    }
  }

  md += '\n## 3. 시그널 발생 종류별 결과\n\n';
  md += '| 시그널 | 표본 | 1x cont | 2x cont | 재진입 재발 | 근단밖 회복 | 평균 max x | 평균 adverse |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const kind of ['breakClose', 'rebreakClose', 'trueReclaimClose', 'avoidChopSnapshot'] as BrokenStrategySignalKind[]) {
    const g = records.filter(r => r.observeTf === '4H' && r.signalKind === kind);
    if (!g.length) continue;
    const c1 = g.filter(r => r.continuation1Hit).length;
    const c2 = g.filter(r => r.continuation2Hit).length;
    const reentry = g.filter(r => r.reentryAfterSignal).length;
    const reclaim = g.filter(r => r.oppositeReclaimAfterSignal).length;
    md += `| ${brokenSignalKindLabel(kind)} | ${g.length} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${pct(reentry, g.length)} | ${pct(reclaim, g.length)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} | ${avg(g.map(r => r.maxAdverseReclaimDepth)).toFixed(2)} |\n`;
  }

  md += '\n## 4. FVG dwell/fill 감점 검증 — 4H 관측\n\n';
  md += '| FVG 체류 | 후보 | 표본 | 1x cont | 2x cont | 첫결과 continuation | 재진입 재발 | 근단밖 회복 | 평균 max x |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const dwell of ['shortDwell', 'mediumDwell', 'longDwell'] as FvgDwellPenaltyBucket[]) {
    for (const candidate of candidates) {
      const g = records.filter(r => r.observeTf === '4H' && r.source === 'FVG' && r.fvgDwellPenalty === dwell && r.strategyCandidate === candidate);
      if (!g.length) continue;
      const c1 = g.filter(r => r.continuation1Hit).length;
      const c2 = g.filter(r => r.continuation2Hit).length;
      const firstCont = g.filter(r => r.firstForwardOutcome === 'continuation1x').length;
      const reentry = g.filter(r => r.reentryAfterSignal).length;
      const reclaim = g.filter(r => r.oppositeReclaimAfterSignal).length;
      md += `| ${fvgDwellPenaltyLabel(dwell)} | ${strategyCandidateLabel(candidate)} | ${g.length} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${pct(firstCont, g.length)} | ${pct(reentry, g.length)} | ${pct(reclaim, g.length)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} |\n`;
    }
  }

  md += '\n## 5. 존TF × 후보 결과 — 4H 관측\n\n';
  md += '| 존 | 존TF | 후보 | 표본 | 1x cont | 2x cont | 재진입 재발 | 근단밖 회복 | 평균 max x |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const candidate of candidates) {
        const g = records.filter(r => r.observeTf === '4H' && r.source === src && r.zoneTf === ztf && r.strategyCandidate === candidate);
        if (!g.length) continue;
        const c1 = g.filter(r => r.continuation1Hit).length;
        const c2 = g.filter(r => r.continuation2Hit).length;
        const reentry = g.filter(r => r.reentryAfterSignal).length;
        const reclaim = g.filter(r => r.oppositeReclaimAfterSignal).length;
        md += `| ${src} | ${ztf} | ${strategyCandidateLabel(candidate)} | ${g.length} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${pct(reentry, g.length)} | ${pct(reclaim, g.length)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} |\n`;
      }
    }
  }

  md += '\n## 6. adverse reclaim 깊이별 위험\n\n';
  md += '| 후보 | adverse reclaim | 표본 | 1x cont | 2x cont | 재진입 재발 | 근단밖 회복 | 평균 max x |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const candidate of candidates) {
    for (const bucket of ['none', 'farEdgeOnly', 'farHalf', 'midReached', 'nearSideReached', 'nearOutside'] as BrokenAdverseReclaimBucket[]) {
      const g = records.filter(r => r.observeTf === '4H' && r.strategyCandidate === candidate && r.adverseReclaimBucket === bucket);
      if (!g.length) continue;
      const c1 = g.filter(r => r.continuation1Hit).length;
      const c2 = g.filter(r => r.continuation2Hit).length;
      const reentry = g.filter(r => r.reentryAfterSignal).length;
      const reclaim = g.filter(r => r.oppositeReclaimAfterSignal).length;
      md += `| ${strategyCandidateLabel(candidate)} | ${adverseReclaimBucketLabel(bucket)} | ${g.length} | ${pct(c1, g.length)} | ${pct(c2, g.length)} | ${pct(reentry, g.length)} | ${pct(reclaim, g.length)} | ${avg(g.map(r => r.maxContinuationWidth)).toFixed(2)} |\n`;
    }
  }

  const h4 = records.filter(r => r.observeTf === '4H');
  const breakClose = h4.filter(r => r.signalKind === 'breakClose');
  const rebreakClose = h4.filter(r => r.signalKind === 'rebreakClose');
  const trueReclaimClose = h4.filter(r => r.signalKind === 'trueReclaimClose');
  const fvgShort = h4.filter(r => r.source === 'FVG' && r.fvgDwellPenalty === 'shortDwell');
  const fvgLong = h4.filter(r => r.source === 'FVG' && r.fvgDwellPenalty === 'longDwell');
  const shortPolarity = fvgShort.filter(r => r.strategyCandidate === 'polarityFlipShort');
  const longPolarity = fvgLong.filter(r => r.strategyCandidate === 'polarityFlipShort');
  const shortTrueReclaim = fvgShort.filter(r => r.strategyCandidate === 'trueReclaimRisky');
  const longTrueReclaim = fvgLong.filter(r => r.strategyCandidate === 'trueReclaimRisky');

  md += '\n## 7. 핵심 관찰\n\n';
  md += `- breakClose/no-reentry 계열은 ${breakClose.length}건, 1x continuation ${pct(breakClose.filter(r => r.continuation1Hit).length, breakClose.length)}, 2x continuation ${pct(breakClose.filter(r => r.continuation2Hit).length, breakClose.length)}로 가장 강한 지속 후보.\n`;
  md += `- reentry 후 rebreakClose 계열은 ${rebreakClose.length}건, 1x continuation ${pct(rebreakClose.filter(r => r.continuation1Hit).length, rebreakClose.length)}, 2x continuation ${pct(rebreakClose.filter(r => r.continuation2Hit).length, rebreakClose.length)}지만 재진입 재발 ${pct(rebreakClose.filter(r => r.reentryAfterSignal).length, rebreakClose.length)}가 높아 진입 타이밍을 더 쪼개야 한다.\n`;
  md += `- trueReclaimClose 계열도 ${trueReclaimClose.length}건 중 1x continuation ${pct(trueReclaimClose.filter(r => r.continuation1Hit).length, trueReclaimClose.length)}, 2x continuation ${pct(trueReclaimClose.filter(r => r.continuation2Hit).length, trueReclaimClose.length)}가 재발한다. true reclaim은 단독 반전 신호로 보기 어렵다.\n`;
  md += `- FVG polarity flip은 짧은 체류에서 1x/2x ${pct(shortPolarity.filter(r => r.continuation1Hit).length, shortPolarity.length)}/${pct(shortPolarity.filter(r => r.continuation2Hit).length, shortPolarity.length)}, 긴 체류에서 ${pct(longPolarity.filter(r => r.continuation1Hit).length, longPolarity.length)}/${pct(longPolarity.filter(r => r.continuation2Hit).length, longPolarity.length)}로 약해진다.\n`;
  md += `- FVG true reclaim도 짧은 체류 ${pct(shortTrueReclaim.filter(r => r.continuation1Hit).length, shortTrueReclaim.length)}/${pct(shortTrueReclaim.filter(r => r.continuation2Hit).length, shortTrueReclaim.length)} 대비 긴 체류 ${pct(longTrueReclaim.filter(r => r.continuation1Hit).length, longTrueReclaim.length)}/${pct(longTrueReclaim.filter(r => r.continuation2Hit).length, longTrueReclaim.length)}로 둔화된다.\n`;

  md += '\n## 8. 전략 전환 메모\n\n';
  md += '- 다음 백테스트 후보는 `breakClose 이후 no/late reentry`와 `reentry 후 rebreakClose`를 분리해야 한다. 둘 다 continuation 후보지만 시그널 확정 시점이 다르다.\n';
  md += '- `trueReclaimClose`는 단독 반전 진입 트리거로 쓰기보다, 이후 1x/2x continuation 재발률과 재진입 재발률을 기준으로 회피/감점 필터부터 검증한다.\n';
  md += '- FVG long dwell은 continuation 후보에서 별도 감점 조건으로 유지한다. 같은 후보라도 dwell/fill이 길면 재진입·근단 회복 위험을 따로 본다.\n';
  md += '- 이 섹션은 PnL이 아니라 상태 결과다. 실제 전략화는 수수료·진입가·SL·TP를 붙이는 다음 단계에서 진행한다.\n';

  return md;
}

function flagN(n: number): string { return n < 30 ? ' ⚠' : ''; }

function buildBrokenSignalForwardReport(records: BrokenSignalForwardRec[]): string {
  let md = '\n---\n\n# Broken-Zone 결정시점 Forward (8차 교정 · 미래라벨 제거)\n\n';
  md += '> 7차 표(아래 `Broken-Zone Strategy Forward Outcomes`)는 `strategyCandidate`로 표본을 거른 뒤 ';
  md += 'break 시점부터 측정했는데, 그 라벨은 40일 창에서 "재진입이 없었나"를 사후 확인해야 정해진다. ';
  md += '즉 진입 시점엔 clean 여부를 알 수 없어 **그 통계로는 매매할 수 없다(생존편향).** ';
  md += '이 섹션은 그 순간 관측되는 결정시점만 신호로 잡고 그 다음 봉부터만 측정한다.\n\n';
  md += '- `breakClose`: 손절쪽 종가이탈한 **모든** 존(거르지 않음) — 진입 직후 통계.\n';
  md += '- `rebreakClose`: 재진입 후 다시 손절쪽 종가이탈이 **관측된** 봉.\n';
  md += '- `trueReclaimClose`: 재진입 후 근단 밖 회복이 **관측된** 봉.\n';
  md += `- continuation은 wick(부풀림)·close(보수) 두 기준 병기. 표본 30 미만은 ⚠. 관측 ${FWD_DAYS}일.\n\n`;

  const h4 = records.filter(r => r.observeTf === '4H');
  const kinds: BrokenSignalKind[] = ['breakClose', 'rebreakClose', 'trueReclaimClose'];
  const p = (g: BrokenSignalForwardRec[], f: (r: BrokenSignalForwardRec) => boolean) => pct(g.filter(f).length, g.length);

  md += '## 1. 신호×존 — wick vs close continuation\n\n';
  md += '| 신호 | 존 | 표본 | 1x(wick) | 1x(close) | 2x(wick) | 신호후 재진입 | 신호후 근단회복 | 평균maxX(wick) | 평균maxX(close) | 평균adverse |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const kind of kinds) for (const src of ['OB', 'FVG'] as const) {
    const g = h4.filter(r => r.signalKind === kind && r.source === src);
    if (!g.length) continue;
    md += `| ${brokenSignalKindLabel(kind)} | ${src} | ${g.length}${flagN(g.length)} | ${p(g, r => r.contWick1Hit)} | ${p(g, r => r.contClose1Hit)} | ${p(g, r => r.contWick2Hit)} | ${p(g, r => r.reentryAfterSignal)} | ${p(g, r => r.oppositeReclaimAfterSignal)} | ${avg(g.map(r => r.maxContWick)).toFixed(2)} | ${avg(g.map(r => r.maxContClose)).toFixed(2)} | ${avg(g.map(r => r.maxAdverseReclaimDepth)).toFixed(2)} |\n`;
  }

  const bc = h4.filter(r => r.signalKind === 'breakClose');
  md += '\n## 2. breakClose 모집단 — 존TF × 존 (close 1x = 보수 엣지 후보)\n\n';
  md += '| 존 | 존TF | 표본 | 1x(close) | 1x(wick) | 신호후 재진입 | 평균maxX(close) | 평균adverse |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) for (const ztf of ZONE_TFS) {
    const g = bc.filter(r => r.source === src && r.zoneTf === ztf);
    if (!g.length) continue;
    md += `| ${src} | ${ztf} | ${g.length}${flagN(g.length)} | ${p(g, r => r.contClose1Hit)} | ${p(g, r => r.contWick1Hit)} | ${p(g, r => r.reentryAfterSignal)} | ${avg(g.map(r => r.maxContClose)).toFixed(2)} | ${avg(g.map(r => r.maxAdverseReclaimDepth)).toFixed(2)} |\n`;
  }

  md += '\n## 3. breakClose 모집단 — 레짐 × 존\n\n';
  md += '| 존 | 레짐 | 표본 | 1x(close) | 1x(wick) | 신호후 재진입 | 평균maxX(close) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) for (const regime of ['withTrend', 'againstTrend', 'range', 'unknown'] as TrendRegime[]) {
    const g = bc.filter(r => r.source === src && r.regime === regime);
    if (!g.length) continue;
    md += `| ${src} | ${regimeLabel(regime)} | ${g.length}${flagN(g.length)} | ${p(g, r => r.contClose1Hit)} | ${p(g, r => r.contWick1Hit)} | ${p(g, r => r.reentryAfterSignal)} | ${avg(g.map(r => r.maxContClose)).toFixed(2)} |\n`;
  }

  md += '\n## 4. FVG breakClose — 신호시점 dwell별 (관측 가능)\n\n';
  md += '| dwell(신호전) | 표본 | 1x(close) | 1x(wick) | 신호후 재진입 | 평균maxX(close) |\n';
  md += '|---|---:|---:|---:|---:|---:|\n';
  for (const dwell of ['shortDwell', 'mediumDwell', 'longDwell'] as FvgDwellPenaltyBucket[]) {
    const g = bc.filter(r => r.source === 'FVG' && r.fvgDwellAtSignal === dwell);
    if (!g.length) continue;
    md += `| ${fvgDwellPenaltyLabel(dwell)} | ${g.length}${flagN(g.length)} | ${p(g, r => r.contClose1Hit)} | ${p(g, r => r.contWick1Hit)} | ${p(g, r => r.reentryAfterSignal)} | ${avg(g.map(r => r.maxContClose)).toFixed(2)} |\n`;
  }

  md += '\n## 5. 신호별 첫 구조 결과 분포\n\n';
  md += '| 신호 | 첫 결과 | 표본 | 비율 | 평균 첫결과봉 |\n';
  md += '|---|---|---:|---:|---:|\n';
  for (const kind of kinds) {
    const gk = h4.filter(r => r.signalKind === kind);
    if (!gk.length) continue;
    for (const outcome of ['continuation1x', 'reentry', 'oppositeReclaim', 'mixedSameBar', 'unresolved'] as BrokenForwardOutcome[]) {
      const g = gk.filter(r => r.firstForwardOutcome === outcome);
      if (!g.length) continue;
      const bars = g.map(r => r.barsToFirstForwardOutcome).filter((n): n is number => n !== null);
      md += `| ${brokenSignalKindLabel(kind)} | ${brokenForwardOutcomeLabel(outcome)} | ${g.length}${flagN(g.length)} | ${pct(g.length, gk.length)} | ${avg(bars).toFixed(1)} |\n`;
    }
  }

  md += '\n## 6. 핵심 관찰 (편향 제거)\n\n';
  if (bc.length) {
    md += `- breakClose 모집단 ${bc.length}건(거르지 않은 전체) — 1x continuation wick ${p(bc, r => r.contWick1Hit)} vs **close ${p(bc, r => r.contClose1Hit)}**. wick 기준이 부풀린다.\n`;
    md += `- breakClose 신호 후 존 재진입 ${p(bc, r => r.reentryAfterSignal)}, 근단 밖 회복 ${p(bc, r => r.oppositeReclaimAfterSignal)} — 깨졌다고 바로 지속되지 않고 상당수가 되돌아온다.\n`;
  }
  const rbc = h4.filter(r => r.signalKind === 'rebreakClose');
  const trc = h4.filter(r => r.signalKind === 'trueReclaimClose');
  if (rbc.length) md += `- rebreakClose ${rbc.length}건 — close 1x ${p(rbc, r => r.contClose1Hit)}, 신호후 재진입 ${p(rbc, r => r.reentryAfterSignal)}. 재이탈 확인 후 진입해도 재진입 위험이 남는다.\n`;
  if (trc.length) md += `- trueReclaimClose ${trc.length}건 — close 기준 반대방향 continuation ${p(trc, r => r.contClose1Hit)}. 근단 회복도 단독 신호로는 약하다.\n`;
  md += '- 결론: 다음 백테스트는 breakClose를 **모집단 그대로** 들고, 위 관측 가능 슬라이스(존TF·레짐·dwell)에서 close 1x가 유의하게 높은 구간만 진입 후보로 좁힌다. wick 통계와 사후 라벨 통계는 후보 선정에 쓰지 않는다.\n';

  return md;
}

function buildCloseEntryReport(entries: CloseEntryRec[]): string {
  let md = '\n---\n\n# 종가 진입 후 경로 분석 (Close-In-Zone)\n\n';
  md += `종가가 존 밖에서 OB/FVG 박스 안으로 처음 들어온 봉을 t0로 잡고 이후 ${FWD_DAYS}일 경로를 집계. `;
  md += '동일 체류 에피소드 안의 반복 종가는 중복 집계하지 않음. RR은 t0 종가 진입, SL=손절쪽 박스 끝 기준.\n\n';
  md += '> ⚠️ **E@2R 열은 트레이드 RR로 읽지 말 것.** 이 시뮬은 근단이탈(유리방향 구조해소) 시점에 ';
  md += '루프를 break하므로, 4H 표본의 43%가 평균 4.4봉 만에 조기종료되고 그중 82%가 2R 도달 전에 잘린다. ';
  md += '즉 E@2R이 체계적으로 과소평가된다(유리 이동인데 손실로 집계). **구조 컬럼(근단이탈/무효화/mid·CE도달)만 ';
  md += '유효**하며, 깨끗한 진입 RR은 레벨/멀티TF 섹션(SL에서만 break)을 본다.\n\n';

  const TGT0 = 2;
  md += '## TF별 종가 진입 후 결과\n\n';
  md += '| 존 | 존TF | 관측 | 이벤트 | 근단이탈 | 무효화 | EQ도달 | mid/CE도달 | far edge도달 | 평균 존내종가봉 | E@2R |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const otf of OBSERVE_TFS) {
        if (!OBSERVE_OPTIONS[ztf].includes(otf)) continue;
        const g = entries.filter(e => e.source === src && e.zoneTf === ztf && e.observeTf === otf);
        if (!g.length) continue;
        const nearExit = g.filter(e => e.outcome === 'nearExit').length;
        const invalid = g.filter(e => e.outcome === 'invalidated').length;
        const eq = g.filter(e => e.reachedEq).length;
        const mid = g.filter(e => e.reachedMid).length;
        const farEdge = g.filter(e => e.reachedFarEdge).length;
        const exp = closeEntryExp(g, TGT0);
        md += `| ${src} | ${ztf} | ${otf} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(eq, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} |\n`;
      }
    }
  }

  md += '\n## 4H 관측 — 종가 진입 위치별\n\n';
  md += '| 존 | 종가 위치 | 이벤트 | 근단이탈 | 무효화 | mid/CE도달 | far edge도달 | 평균MFE(R) | E@2R |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const section of ['near', 'eqNear', 'eqFar', 'far'] as CloseEntrySection[]) {
      const g = entries.filter(e => e.source === src && e.observeTf === '4H' && e.entrySection === section);
      if (!g.length) continue;
      const nearExit = g.filter(e => e.outcome === 'nearExit').length;
      const invalid = g.filter(e => e.outcome === 'invalidated').length;
      const mid = g.filter(e => e.reachedMid).length;
      const farEdge = g.filter(e => e.reachedFarEdge).length;
      const exp = closeEntryExp(g, TGT0);
      md += `| ${src} | ${closeEntrySectionLabel(section)} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(e => e.mfeR)).toFixed(2)} | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} |\n`;
    }
  }

  md += '\n## 1W 존 — 1D/4H 종가 진입 위치별\n\n';
  md += '| 존 | 관측 | 종가 위치 | 이벤트 | 근단이탈 | 무효화 | mid/CE도달 | 평균 존내종가봉 | E@2R |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const otf of ['4H', '1D'] as ObserveTf[]) {
      for (const section of ['near', 'eqNear', 'eqFar', 'far'] as CloseEntrySection[]) {
        const g = entries.filter(e => e.source === src && e.zoneTf === '1W' && e.observeTf === otf && e.entrySection === section);
        if (!g.length) continue;
        const nearExit = g.filter(e => e.outcome === 'nearExit').length;
        const invalid = g.filter(e => e.outcome === 'invalidated').length;
        const mid = g.filter(e => e.reachedMid).length;
        const exp = closeEntryExp(g, TGT0);
        md += `| ${src} | ${otf} | ${closeEntrySectionLabel(section)} | ${g.length} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${avg(g.map(e => e.closeBarsInZone)).toFixed(1)} | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} |\n`;
      }
    }
  }
  return md;
}

/** 존 내부 경로 리포트 — FVG/OB box 안에서 EQ·mid50·far edge까지의 이동 경로. */
function buildPathReport(paths: PathRec[]): string {
  let md = '\n---\n\n# 존 내부 경로 분석 (FVG/OB box → EQ → mid50/CE → far edge)\n\n';
  md += `첫터치 이후 ${FWD_DAYS}일 안에서 방향 정규화한 침투 경로를 집계. `;
  md += '`edge만`은 EQ(0.382) 전, `mid50/CE`는 OB mid 또는 FVG CE, `far edge`는 손절쪽 박스 끝까지 닿은 경우.\n\n';
  md += '`근단이탈`은 수익 달성이 아니라 존 밖 유리 방향으로 종가가 복귀한 구조적 결과이며, `무효화`는 손절쪽 박스 밖 종가 이탈.\n\n';

  md += '## TF별 내부 도달률\n\n';
  md += '| 존 | 존TF | 관측 | 표본 | 첫봉 꼬리거부 | 종가안착 | EQ도달 | mid50/CE도달 | EQ원단도달 | 근단이탈 | 무효화 | 평균 존내종가봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const otf of OBSERVE_TFS) {
        if (!OBSERVE_OPTIONS[ztf].includes(otf)) continue;
        const g = paths.filter(p => p.source === src && p.zoneTf === ztf && p.observeTf === otf);
        if (!g.length) continue;
        const wickReject = g.filter(p => p.outcome === 'wickReject').length;
        const closeHold = g.filter(p => p.firstTouchKind === 'close').length;
        const reachedEq = g.filter(p => p.reachedEq).length;
        const reachedMid = g.filter(p => p.reachedMid).length;
        const reachedFarHalf = g.filter(p => p.reachedFarHalf).length;
        const favor = g.filter(pathResolvedFavor).length;
        const invalid = g.filter(p => p.outcome === 'invalidated').length;
        md += `| ${src} | ${ztf} | ${otf} | ${g.length} | ${pct(wickReject, g.length)} | ${pct(closeHold, g.length)} | ${pct(reachedEq, g.length)} | ${pct(reachedMid, g.length)} | ${pct(reachedFarHalf, g.length)} | ${pct(favor, g.length)} | ${pct(invalid, g.length)} | ${avg(g.map(p => p.closeBarsInZone)).toFixed(1)} |\n`;
      }
    }
  }

  md += '\n## 4H 관측 — 최대 침투 깊이별 결과\n\n';
  md += '| 존 | 최대 침투 | 표본 | 근단이탈 | 무효화 | 미결 | 평균 존내종가봉 | 평균 결과봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    const src4h = paths.filter(p => p.source === src && p.observeTf === '4H');
    for (const depth of ['edgeOnly', 'eqOnly', 'mid50', 'farHalf', 'farEdge'] as DeepestZone[]) {
      const g = src4h.filter(p => p.deepest === depth);
      if (!g.length) continue;
      const favor = g.filter(pathResolvedFavor).length;
      const invalid = g.filter(p => p.outcome === 'invalidated').length;
      const open = g.filter(p => p.outcome === 'open').length;
      const resolvedBars = g.map(p => p.barsToOutcome).filter((n): n is number => n !== null);
      md += `| ${src} | ${deepestLabel(depth)} | ${g.length} | ${pct(favor, g.length)} | ${pct(invalid, g.length)} | ${pct(open, g.length)} | ${avg(g.map(p => p.closeBarsInZone)).toFixed(1)} | ${avg(resolvedBars).toFixed(1)} |\n`;
    }
  }
  return md;
}

const FIRST_TOUCH_CLOSE_POSITIONS: FirstTouchClosePosition[] = ['favorOutside', 'nearInside', 'eqInside', 'farInside', 'invalidOutside'];
const FIRST_TOUCH_WICK_DEPTHS: DeepestZone[] = ['edgeOnly', 'eqOnly', 'mid50', 'farHalf', 'farEdge'];

function firstTouchMatrixCombos(): Array<{ zoneTf: ZoneTf; observeTf: ObserveTf }> {
  const rows: Array<{ zoneTf: ZoneTf; observeTf: ObserveTf }> = [];
  for (const zoneTf of ZONE_TFS) {
    for (const observeTf of OBSERVE_OPTIONS[zoneTf]) rows.push({ zoneTf, observeTf });
  }
  return rows;
}

function firstTouchAnatomyRow(labelCells: string[], g: FirstTouchAnatomyRec[]): string {
  const nearExit = g.filter(r => r.outcome === 'nearExit').length;
  const invalid = g.filter(r => r.outcome === 'invalidated').length;
  const wickReject = g.filter(r => r.wickReject).length;
  const invalidClose = g.filter(r => r.invalidClose).length;
  const mid = g.filter(r => r.reachedMid).length;
  const farEdge = g.filter(r => r.reachedFarEdge).length;
  return `| ${labelCells.join(' | ')} | ${g.length} | ${pct(wickReject, g.length)} | ${pct(invalidClose, g.length)} | ${pct(nearExit, g.length)} | ${pct(invalid, g.length)} | ${pct(mid, g.length)} | ${pct(farEdge, g.length)} | ${avg(g.map(r => r.wickPenetration)).toFixed(2)} | ${avg(g.map(r => r.closePenetration)).toFixed(2)} | ${avg(g.map(r => r.closeBarsInZone)).toFixed(1)} |\n`;
}

function buildFirstTouchCountLedger(records: FirstTouchAnatomyRec[]): string {
  const fourH1d = records.filter(r => r.zoneTf === '1d' && r.observeTf === '4H');
  let md = '## 전체 매트릭스 — 첫터치 분류 원장 (카운팅)\n\n';
  md += '후속 결과를 붙이기 전, 요청 범위의 모든 `OB/FVG × 존TF × 관측TF`에서 첫터치 마감봉이 어떤 형태였는지만 센다. ';
  md += '이 표는 순수 카운팅이며 `후속 40일` 같은 관측기간 설정의 영향을 받지 않는다.\n\n';

  md += '### 종가 위치별 전체 카운트\n\n';
  md += '| 존 | 존TF | 관측TF | 근단 밖 마감 | 근단 안쪽 마감 | EQ/CE권 마감 | 원단쪽 내부 마감 | 원단 밖 마감 | 합계 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      const g = records.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf);
      if (!g.length) continue;
      const cells = FIRST_TOUCH_CLOSE_POSITIONS.map(pos => g.filter(r => r.closePosition === pos).length);
      md += `| ${src} | ${zoneTf} | ${observeTf} | ${cells.join(' | ')} | ${g.length} |\n`;
    }
  }

  md += '\n### 꼬리 깊이별 전체 카운트\n\n';
  md += '| 존 | 존TF | 관측TF | edge만 | EQ까지만 | mid50/CE | EQ원단쪽 | far edge | 합계 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      const g = records.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf);
      if (!g.length) continue;
      const cells = FIRST_TOUCH_WICK_DEPTHS.map(depth => g.filter(r => r.wickDepth === depth).length);
      md += `| ${src} | ${zoneTf} | ${observeTf} | ${cells.join(' | ')} | ${g.length} |\n`;
    }
  }

  md += '\n### 1D 존 — 4H 종가 위치별 상세\n\n';
  md += '| 존 | 근단 밖 마감 | 근단 안쪽 마감 | EQ/CE권 마감 | 원단쪽 내부 마감 | 원단 밖 마감 | 합계 |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    const g = fourH1d.filter(r => r.source === src);
    const cells = FIRST_TOUCH_CLOSE_POSITIONS.map(pos => g.filter(r => r.closePosition === pos).length);
    md += `| ${src} | ${cells.join(' | ')} | ${g.length} |\n`;
  }

  for (const src of ['OB', 'FVG'] as const) {
    const g = fourH1d.filter(r => r.source === src);
    md += `\n### 1D 존 4H 상세 — ${src} 꼬리 깊이 × 종가 위치\n\n`;
    md += '| 꼬리 깊이 | 근단 밖 마감 | 근단 안쪽 마감 | EQ/CE권 마감 | 원단쪽 내부 마감 | 원단 밖 마감 | 합계 |\n';
    md += '|---|---:|---:|---:|---:|---:|---:|\n';
    for (const depth of FIRST_TOUCH_WICK_DEPTHS) {
      const row = g.filter(r => r.wickDepth === depth);
      const cells = FIRST_TOUCH_CLOSE_POSITIONS.map(pos => row.filter(r => r.closePosition === pos).length);
      md += `| ${deepestLabel(depth)} | ${cells.join(' | ')} | ${row.length} |\n`;
    }
  }

  return md + '\n';
}

function buildFirstTouchAnalysisProcess(): string {
  let md = '## 분석 진행 순서 기록\n\n';
  md += '결과를 바로 전략 규칙으로 해석하지 않고, 아래 순서로 데이터에서 결론을 좁힌다.\n\n';
  md += '| 순서 | 단계 | 목적 | 산출물 |\n';
  md += '|---:|---|---|---|\n';
  md += '| 1 | 범위 고정 | BTC/ETH/SOL, 최근 약 4년, 1D=1D/4H, 1W=1W/1D/4H, 1M=1M/1W/1D/4H 관측을 고정 | 재현 가능한 표본군 |\n';
  md += '| 2 | 첫터치 캔들 분해 | 각 관측TF 첫터치 봉의 꼬리 깊이와 종가 위치를 분리 | `꼬리 깊이 × 종가 위치` 분류 |\n';
  md += '| 3 | 분류 카운팅 | 어떤 첫터치 종류가 얼마나 자주 나오는지 먼저 확인 | 전체 매트릭스 첫터치 분류 원장 |\n';
  md += '| 4 | 후속 움직임 부착 | 각 첫터치 종류 이후 W40/W80/W120 구조 결과와 변동폭을 측정 | 근단방향/원단방향 종가, CE도달, MFE/MAE |\n';
  md += '| 5 | 재방문/재접촉 분석 | 첫터치 이후 근단·CE·원단을 몇 번, 몇 봉 만에 다시 건드리는지 episode로 측정 | 재접촉 타이밍/횟수/종가분포 |\n';
  md += '| 6 | 첫터치 이전 캔들 분석 | 첫터치 직전 1/3/6/12개 관측TF 봉의 접근 속도·변동성·몸통/꼬리를 측정 | 사전 접근 프로파일 |\n';
  md += '| 7 | 조건 조합 비교 | 첫터치 종류와 사전 접근·재접촉 조건을 결합해 유효/위험 패턴을 분리 | 후보 필터 |\n';
  md += '| 8 | 전략화는 마지막 | 데이터에서 반복되는 패턴만 진입/손절/익절/R 규칙으로 번역 | 백테스트 후보 |\n\n';
  return md;
}

function completedForwardStats(records: FirstTouchAnatomyRec[], days: number): FirstTouchForwardStats[] {
  return records
    .map(r => r.forwardByDays[days])
    .filter((s): s is FirstTouchForwardStats => Boolean(s?.complete));
}

function firstTouchForwardMovementRow(labelCells: string[], stats: FirstTouchForwardStats[]): string {
  const near = stats.filter(s => s.nearExit).length;
  const invalid = stats.filter(s => s.invalidated).length;
  const nearFirst = stats.filter(s => s.barsToNearExit !== null && (s.barsToInvalidation === null || s.barsToNearExit <= s.barsToInvalidation)).length;
  const invalidFirst = stats.filter(s => s.barsToInvalidation !== null && (s.barsToNearExit === null || s.barsToInvalidation < s.barsToNearExit)).length;
  const reentered = stats.filter(s => s.reenteredZone).length;
  const mid = stats.filter(s => s.reachedMid).length;
  const farEdge = stats.filter(s => s.reachedFarEdge).length;
  const invalidBars = stats.map(s => s.barsToInvalidation).filter((n): n is number => n !== null);
  return `| ${labelCells.join(' | ')} | ${stats.length} | ${pct(nearFirst, stats.length)} | ${pct(invalidFirst, stats.length)} | ${pct(near, stats.length)} | ${pct(invalid, stats.length)} | ${pct(reentered, stats.length)} | ${pct(mid, stats.length)} | ${pct(farEdge, stats.length)} | ${median(stats.map(s => s.maxFavorPct)).toFixed(1)} | ${median(stats.map(s => s.maxAdversePct)).toFixed(1)} | ${median(stats.map(s => s.maxFavorZone)).toFixed(2)} | ${median(stats.map(s => s.maxAdverseZone)).toFixed(2)} | ${invalidBars.length ? median(invalidBars).toFixed(1) : '-'} |\n`;
}

function buildFirstTouchForwardMovementReport(records: FirstTouchAnatomyRec[]): string {
  const base = records.filter(r => r.zoneTf === '1d' && r.observeTf === '4H');
  let md = '## 전체 매트릭스 — 첫터치 타입별 후속 움직임 (W40/W80/W120)\n\n';
  md += '첫터치 봉 다음 봉부터 집계한다. W40/W80/W120은 해당 기간이 완전히 확보된 이벤트만 포함한다. ';
  md += '`근단방향 우선/원단방향 우선`은 둘 중 먼저 나온 종가 이벤트이고, `기간내 근단방향/원단밖 종가`는 창 안에서 한 번이라도 발생했는지라 동시에 참일 수 있다. ';
  md += 'MFE/MAE는 첫터치 관측TF 종가 기준 최대 유리/불리 이동이며, 존폭 배수도 함께 표시한다.\n\n';
  md += '| 존 | 존TF | 관측TF | 첫터치 종가 | 창 | 표본 | 근단방향 우선 | 원단방향 우선 | 기간내 근단방향 종가 | 기간내 원단밖 종가 | 후속 존 재진입 | CE/mid 도달 | 원단 touch | MFE% 중앙 | MAE% 중앙 | MFE존폭 중앙 | MAE존폭 중앙 | 원단밖 종가봉 중앙 |\n';
  md += '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
        const group = records.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf && r.closePosition === closePos);
        if (!group.length) continue;
        for (const days of FIRST_TOUCH_FORWARD_DAYS) {
          const stats = completedForwardStats(group, days);
          if (!stats.length) continue;
          md += firstTouchForwardMovementRow([src, zoneTf, observeTf, firstTouchClosePositionLabel(closePos), `W${days}`], stats);
        }
      }
    }
  }

  md += '\n## 1D 존 — 4H 꼬리 깊이 × 종가 위치별 W40 후속 움직임 (표본 5개 이상)\n\n';
  md += '| 존 | 꼬리 깊이 | 첫터치 종가 | 표본 | 근단방향 우선 | 원단방향 우선 | 기간내 근단방향 종가 | 기간내 원단밖 종가 | 후속 존 재진입 | CE/mid 도달 | 원단 touch | MFE% 중앙 | MAE% 중앙 | MFE존폭 중앙 | MAE존폭 중앙 | 원단밖 종가봉 중앙 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const depth of FIRST_TOUCH_WICK_DEPTHS) {
      for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
        const group = base.filter(r => r.source === src && r.wickDepth === depth && r.closePosition === closePos);
        const stats = completedForwardStats(group, 40);
        if (stats.length < 5) continue;
        md += firstTouchForwardMovementRow([src, deepestLabel(depth), firstTouchClosePositionLabel(closePos)], stats);
      }
    }
  }

  return md + '\n';
}

function completedRevisitStats(records: FirstTouchAnatomyRec[], days: number): FirstTouchRevisitStats[] {
  return records
    .map(r => r.revisitByDays[days])
    .filter((s): s is FirstTouchRevisitStats => Boolean(s?.complete));
}

function avgNullable(nums: Array<number | null>): string {
  const xs = nums.filter((n): n is number => n !== null);
  return xs.length ? avg(xs).toFixed(1) : '-';
}

function medianNullable(nums: Array<number | null>): string {
  const xs = nums.filter((n): n is number => n !== null);
  return xs.length ? median(xs).toFixed(1) : '-';
}

function firstTouchRevisitSummaryRow(labelCells: string[], stats: FirstTouchRevisitStats[]): string {
  const firstNear = stats.filter(s => s.firstRevisitKind === 'nearRetouch').length;
  const firstMid = stats.filter(s => s.firstRevisitKind === 'midTouch').length;
  const firstFar = stats.filter(s => s.firstRevisitKind === 'farEdgeTouch').length;
  const firstNone = stats.filter(s => s.firstRevisitKind === 'none').length;
  const near = stats.filter(s => s.nearRetouchEpisodes > 0).length;
  const mid = stats.filter(s => s.midTouchEpisodes > 0).length;
  const far = stats.filter(s => s.farEdgeTouchEpisodes > 0).length;
  return `| ${labelCells.join(' | ')} | ${stats.length} | ${pct(firstNear, stats.length)} | ${pct(firstMid, stats.length)} | ${pct(firstFar, stats.length)} | ${pct(firstNone, stats.length)} | ${medianNullable(stats.map(s => s.barsToFirstRevisit))} | ${pct(near, stats.length)} | ${medianNullable(stats.map(s => s.barsToFirstNearRetouch))} | ${avg(stats.map(s => s.nearRetouchEpisodes)).toFixed(2)} | ${pct(mid, stats.length)} | ${medianNullable(stats.map(s => s.barsToFirstMidTouch))} | ${avg(stats.map(s => s.midTouchEpisodes)).toFixed(2)} | ${pct(far, stats.length)} | ${medianNullable(stats.map(s => s.barsToFirstFarEdgeTouch))} | ${avg(stats.map(s => s.farEdgeTouchEpisodes)).toFixed(2)} |\n`;
}

function mergeCloseDistribution(stats: FirstTouchRevisitStats[], pick: (s: FirstTouchRevisitStats) => FirstTouchCloseDistribution): FirstTouchCloseDistribution {
  const out = emptyFirstTouchCloseDistribution();
  for (const stat of stats) {
    const dist = pick(stat);
    for (const key of Object.keys(out) as FirstTouchClosePosition[]) out[key] += dist[key];
  }
  return out;
}

function closeDistributionCells(dist: FirstTouchCloseDistribution): string {
  const total = Object.values(dist).reduce((s, n) => s + n, 0);
  const positions: FirstTouchClosePosition[] = ['favorOutside', 'nearInside', 'eqInside', 'farInside', 'invalidOutside'];
  return `${total} | ${positions.map(pos => pct(dist[pos], total)).join(' | ')}`;
}

function firstRevisitCloseDistribution(stats: FirstTouchRevisitStats[], kind: FirstTouchRevisitKind): FirstTouchCloseDistribution {
  const out = emptyFirstTouchCloseDistribution();
  for (const stat of stats) {
    if (stat.firstRevisitKind !== kind || stat.firstRevisitClosePosition === null) continue;
    out[stat.firstRevisitClosePosition]++;
  }
  return out;
}

function buildFirstTouchRevisitReport(records: FirstTouchAnatomyRec[]): string {
  const base = records.filter(r => r.zoneTf === '1d' && r.observeTf === '4H');
  let md = '## 전체 매트릭스 — 첫터치 이후 재방문/재접촉 episode\n\n';
  md += '첫터치 다음 봉부터 연속 접촉은 하나의 episode로 묶는다. `첫 재접촉`은 첫 재접촉 관측TF 봉이 결과적으로 어디까지 닿았는지다. ';
  md += '봉 내부 선후관계는 알 수 없으므로, 같은 봉이 CE나 원단까지 닿았다면 가장 깊은 레벨로 분류한다.\n\n';
  md += '| 존 | 존TF | 관측TF | 첫터치 종가 | 창 | 표본 | 첫재접촉 근단만 | 첫재접촉 CE | 첫재접촉 원단 | 재접촉없음 | 첫재접촉 중앙봉 | 근단 재접촉률 | 첫 근단 중앙봉 | 근단 평균횟수 | CE touch율 | 첫 CE 중앙봉 | CE 평균횟수 | 원단 touch율 | 첫 원단 중앙봉 | 원단 평균횟수 |\n';
  md += '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
        const group = records.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf && r.closePosition === closePos);
        if (!group.length) continue;
        for (const days of FIRST_TOUCH_FORWARD_DAYS) {
          const stats = completedRevisitStats(group, days);
          if (!stats.length) continue;
          md += firstTouchRevisitSummaryRow([src, zoneTf, observeTf, firstTouchClosePositionLabel(closePos), `W${days}`], stats);
        }
      }
    }
  }

  md += '\n## 1D 존 — W40 첫 재접촉 캔들 종가 위치 분포\n\n';
  md += '첫 재접촉 4H 봉이 가장 깊게 닿은 레벨별로, 그 봉의 종가가 어디에 있었는지 본다.\n\n';
  md += '| 존 | 첫터치 종가 | 첫 재접촉 레벨 | 표본 | 근단 밖 마감 | 근단 안쪽 마감 | EQ/CE권 마감 | 원단쪽 내부 마감 | 원단 밖 마감 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
      const group = base.filter(r => r.source === src && r.closePosition === closePos);
      const stats = completedRevisitStats(group, 40);
      if (!stats.length) continue;
      for (const kind of ['nearRetouch', 'midTouch', 'farEdgeTouch'] as FirstTouchRevisitKind[]) {
        const dist = firstRevisitCloseDistribution(stats, kind);
        const total = Object.values(dist).reduce((s, n) => s + n, 0);
        if (!total) continue;
        md += `| ${src} | ${firstTouchClosePositionLabel(closePos)} | ${firstTouchRevisitKindLabel(kind)} | ${closeDistributionCells(dist)} |\n`;
      }
    }
  }

  md += '\n## 1D 존 — W40 재접촉 episode 첫 캔들 종가 위치 분포\n\n';
  md += '각 재접촉 episode의 첫 캔들이 어디서 종가 마감했는지 센다. 에피소드 수 기준이며, 한 존에서 여러 episode가 나올 수 있다.\n\n';
  md += '| 존 | 첫터치 종가 | 이벤트 | 에피소드 | 근단 밖 마감 | 근단 안쪽 마감 | EQ/CE권 마감 | 원단쪽 내부 마감 | 원단 밖 마감 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
      const group = base.filter(r => r.source === src && r.closePosition === closePos);
      const stats = completedRevisitStats(group, 40);
      if (!stats.length) continue;
      const rows: [string, (s: FirstTouchRevisitStats) => FirstTouchCloseDistribution][] = [
        ['근단 재접촉', s => s.nearRetouchCloseDistribution],
        ['CE touch', s => s.midTouchCloseDistribution],
        ['원단 touch', s => s.farEdgeTouchCloseDistribution],
      ];
      for (const [label, pick] of rows) {
        const dist = mergeCloseDistribution(stats, pick);
        const total = Object.values(dist).reduce((s, n) => s + n, 0);
        if (!total) continue;
        md += `| ${src} | ${firstTouchClosePositionLabel(closePos)} | ${label} | ${closeDistributionCells(dist)} |\n`;
      }
    }
  }

  return md + '\n';
}

function preStatsFor(records: FirstTouchAnatomyRec[], lookback: number): FirstTouchPreWindowStats[] {
  return records
    .map(r => r.preTouchByLookback[lookback])
    .filter((s): s is FirstTouchPreWindowStats => s !== null);
}

function firstTouchPreCandleRow(labelCells: string[], stats: FirstTouchPreWindowStats[]): string {
  const totalBars = stats.reduce((s, r) => s + r.bars, 0);
  const towardBars = stats.reduce((s, r) => s + r.towardBars, 0);
  return `| ${labelCells.join(' | ')} | ${stats.length} | ${pct(towardBars, totalBars)} | ${avg(stats.map(s => s.towardAtr)).toFixed(2)} | ${avg(stats.map(s => s.speedAtr)).toFixed(2)} | ${avg(stats.map(s => s.avgRangePct)).toFixed(2)} | ${avg(stats.map(s => s.bodyRatio)).toFixed(2)} | ${avg(stats.map(s => s.wickRatio)).toFixed(2)} | ${avg(stats.map(s => s.rangeCompression)).toFixed(2)} | ${avg(stats.map(s => s.lastClosePenetration)).toFixed(2)} | ${avg(stats.map(s => s.lastDistanceToZone)).toFixed(2)} |\n`;
}

function buildFirstTouchPreCandleReport(records: FirstTouchAnatomyRec[]): string {
  const base = records.filter(r => r.zoneTf === '1d' && r.observeTf === '4H');
  let md = '## 전체 매트릭스 — 첫터치 이전 캔들 접근 프로파일\n\n';
  md += '첫터치 직전 1/3/6/12개 관측TF 봉을 본다. `접근봉%`는 해당 구간에서 종가가 존과 가까워진 봉의 비율, ';
  md += '`직전종가침투`는 첫터치 바로 전 관측TF 종가 위치다(0=근단, 음수=근단 밖).\n\n';
  md += '| 존 | 존TF | 관측TF | 첫터치 종가 | 직전봉수 | 표본 | 접근봉% | 평균 towardATR | 평균 speedATR | 평균 range% | 평균 body | 평균 wick | 평균 압축비 | 직전종가침투 | 직전거리 |\n';
  md += '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
        const group = records.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf && r.closePosition === closePos);
        if (!group.length) continue;
        for (const lookback of FIRST_TOUCH_PRE_LOOKBACKS) {
          const stats = preStatsFor(group, lookback);
          if (!stats.length) continue;
          md += firstTouchPreCandleRow([src, zoneTf, observeTf, firstTouchClosePositionLabel(closePos), String(lookback)], stats);
        }
      }
    }
  }

  md += '\n## 1D 존 — 4H 첫터치 이전 캔들 접근 프로파일 상세\n\n';
  md += '| 존 | 첫터치 종가 | 직전봉수 | 표본 | 접근봉% | 평균 towardATR | 평균 speedATR | 평균 range% | 평균 body | 평균 wick | 평균 압축비 | 직전종가침투 | 직전거리 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
      const group = base.filter(r => r.source === src && r.closePosition === closePos);
      if (!group.length) continue;
      for (const lookback of FIRST_TOUCH_PRE_LOOKBACKS) {
        const stats = preStatsFor(group, lookback);
        if (!stats.length) continue;
        md += firstTouchPreCandleRow([src, firstTouchClosePositionLabel(closePos), String(lookback)], stats);
      }
    }
  }

  return md + '\n';
}

function modePostTouchNearestLevel(records: PostFirstTouchPathRec[]): string {
  if (!records.length) return '-';
  const counts = new Map<PostTouchNearestLevel, number>();
  for (const r of records) counts.set(r.closeNearestLevel, (counts.get(r.closeNearestLevel) ?? 0) + 1);
  const [level] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return postTouchNearestLevelLabel(level);
}

function postTouchPathSummaryRow(labelCells: string[], records: PostFirstTouchPathRec[]): string {
  const n = records.length;
  const closeMirrorOutside = records.filter(r => r.closeRegion === 'mirrorFarOutside').length;
  const closeMirrorInside = records.filter(r => r.closeRegion === 'mirrorFarToCe' || r.closeRegion === 'mirrorCeToNear').length;
  const closeNearCe = records.filter(r => r.closeRegion === 'nearToCe').length;
  const closeCeFar = records.filter(r => r.closeRegion === 'ceToFar').length;
  const closeFarOutside = records.filter(r => r.closeRegion === 'farOutside').length;
  const bullish = records.filter(r => r.bodyDirection === 'bullish').length;
  const bearish = records.filter(r => r.bodyDirection === 'bearish').length;
  const favor = records.filter(r => r.favorBody === 'favorClose').length;
  return `| ${labelCells.join(' | ')} | ${n} | ${median(records.map(r => r.barsFromFirst)).toFixed(1)} | ${pct(records.filter(r => r.touchesMirrorFar).length, n)} | ${pct(records.filter(r => r.touchesMirrorCe).length, n)} | ${pct(records.filter(r => r.touchesNear).length, n)} | ${pct(records.filter(r => r.touchesCe).length, n)} | ${pct(records.filter(r => r.touchesFar).length, n)} | ${pct(closeMirrorOutside, n)} | ${pct(closeMirrorInside, n)} | ${pct(closeNearCe, n)} | ${pct(closeCeFar, n)} | ${pct(closeFarOutside, n)} | ${pct(records.filter(r => r.closeNearCeBand).length, n)} | ${modePostTouchNearestLevel(records)} | ${pct(bullish, n)} | ${pct(bearish, n)} | ${pct(favor, n)} |\n`;
}

function buildPostFirstTouchPathReport(records: PostFirstTouchPathRec[]): string {
  let md = '\n## 첫터치 이후 캔들 경로 — 미러/실제 존 좌표\n\n';
  md += '첫터치 다음 봉부터 `근단`을 0으로 두고, 원단=1, CE=0.5, 미러CE=-0.5, 미러원단=-1로 정규화한다. ';
  md += '`다음봉 경로`는 첫터치 다음 1~5개 관측TF 봉을 그대로 기록하고, `레벨터치`는 40일 안에서 미러원단~원단 축(-1~1)을 다시 건드린 캔들을 2~5번째 터치로 센다. ';
  md += '연속 캔들을 episode로 묶지 않고, 마감된 캔들 단위로 꼬리와 종가를 분리한다.\n\n';

  md += '### 전체 매트릭스 — 2~5번째 레벨터치 경로 (표본 5개 이상)\n\n';
  md += '| 존 | 존TF | 관측TF | 첫터치 종가 | 터치순서 | 표본 | 첫터치후 중앙봉 | 미러원단 꼬리 | 미러CE 꼬리 | 근단 꼬리 | CE 꼬리 | 원단 꼬리 | 종가 미러원단밖 | 종가 미러영역 | 종가 근단~CE | 종가 CE~원단 | 종가 원단밖 | CE근처 종가 | 종가 최빈 근접레벨 | 양봉 | 음봉 | 유리몸통 |\n';
  md += '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|\n';
  const levelTouch = records.filter(r => r.pathKind === 'levelTouch');
  for (const src of ['OB', 'FVG'] as const) {
    for (const { zoneTf, observeTf } of firstTouchMatrixCombos()) {
      for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
        for (const ordinal of POST_FIRST_TOUCH_TOUCH_ORDINALS) {
          const group = levelTouch.filter(r => r.source === src && r.zoneTf === zoneTf && r.observeTf === observeTf && r.firstClosePosition === closePos && r.sequenceOrdinal === ordinal);
          if (group.length < 5) continue;
          md += postTouchPathSummaryRow([src, zoneTf, observeTf, firstTouchClosePositionLabel(closePos), String(ordinal)], group);
        }
      }
    }
  }

  md += '\n### 1D 존 — 4H 다음 1~5봉 즉시 경로 (표본 5개 이상)\n\n';
  md += '| 존 | 첫터치 종가 | 다음봉순서 | 표본 | 첫터치후 중앙봉 | 미러원단 꼬리 | 미러CE 꼬리 | 근단 꼬리 | CE 꼬리 | 원단 꼬리 | 종가 미러원단밖 | 종가 미러영역 | 종가 근단~CE | 종가 CE~원단 | 종가 원단밖 | CE근처 종가 | 종가 최빈 근접레벨 | 양봉 | 음봉 | 유리몸통 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|\n';
  const nextBar = records.filter(r => r.pathKind === 'nextBar' && r.zoneTf === '1d' && r.observeTf === '4H');
  for (const src of ['OB', 'FVG'] as const) {
    for (const closePos of FIRST_TOUCH_CLOSE_POSITIONS) {
      for (const barOrdinal of POST_FIRST_TOUCH_BARS) {
        const group = nextBar.filter(r => r.source === src && r.firstClosePosition === closePos && r.sequenceOrdinal === barOrdinal);
        if (group.length < 5) continue;
        md += postTouchPathSummaryRow([src, firstTouchClosePositionLabel(closePos), String(barOrdinal)], group);
      }
    }
  }

  return md + '\n';
}

function buildFirstTouchAnatomyReport(records: FirstTouchAnatomyRec[], postTouchPaths: PostFirstTouchPathRec[]): string {
  let md = '\n---\n\n# 첫 터치 캔들 Anatomy (꼬리 깊이 × 종가 위치)\n\n';
  md += '마감된 관측TF 캔들 기준으로 첫 터치 봉의 `꼬리`와 `종가`를 분리한다. ';
  md += '`꼬리침투/종가침투`는 방향 정규화 값이다: 0=근단, 0.5=OB mid/FVG CE, 1=원단. ';
  md += '`첫봉 꼬리거부`는 첫 터치 봉이 존을 찔렀지만 종가는 근단 밖 유리방향으로 마감한 경우, ';
  md += '`후속 근단방향 종가/원단밖 종가/CE도달`은 첫 터치 봉 다음 봉부터 관측한 결과다.\n\n';
  md += buildFirstTouchAnalysisProcess();
  md += buildFirstTouchCountLedger(records);
  md += buildFirstTouchForwardMovementReport(records);
  md += buildFirstTouchRevisitReport(records);
  md += buildFirstTouchPreCandleReport(records);
  md += buildPostFirstTouchPathReport(postTouchPaths);

  const fourH = records.filter(r => r.observeTf === '4H');
  md += '## 4H 관측 — 첫 터치 종가 위치별\n\n';
  md += '| 존 | 존TF | 첫터치 종가 | 표본 | 첫봉 꼬리거부 | 첫봉 원단밖종가 | 후속 근단방향 종가 | 후속 원단밖 종가 | 후속 CE/mid 도달 | 후속 원단 touch | 평균 꼬리침투 | 평균 종가침투 | 후속 평균 존내종가봉 |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const closePos of ['favorOutside', 'nearInside', 'eqInside', 'farInside', 'invalidOutside'] as FirstTouchClosePosition[]) {
        const g = fourH.filter(r => r.source === src && r.zoneTf === ztf && r.closePosition === closePos);
        if (!g.length) continue;
        md += firstTouchAnatomyRow([src, ztf, firstTouchClosePositionLabel(closePos)], g);
      }
    }
  }

  md += '\n## 4H 관측 — 첫 터치 꼬리 깊이 × 종가 위치 (표본 5개 이상)\n\n';
  md += '| 존 | 존TF | 꼬리 깊이 | 첫터치 종가 | 표본 | 첫봉 꼬리거부 | 첫봉 원단밖종가 | 후속 근단방향 종가 | 후속 원단밖 종가 | 후속 CE/mid 도달 | 후속 원단 touch | 평균 꼬리침투 | 평균 종가침투 | 후속 평균 존내종가봉 |\n';
  md += '|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const wickDepth of ['edgeOnly', 'eqOnly', 'mid50', 'farHalf', 'farEdge'] as DeepestZone[]) {
        for (const closePos of ['favorOutside', 'nearInside', 'eqInside', 'farInside', 'invalidOutside'] as FirstTouchClosePosition[]) {
          const g = fourH.filter(r => r.source === src && r.zoneTf === ztf && r.wickDepth === wickDepth && r.closePosition === closePos);
          if (g.length < 5) continue;
          md += firstTouchAnatomyRow([src, ztf, deepestLabel(wickDepth), firstTouchClosePositionLabel(closePos)], g);
        }
      }
    }
  }

  md += '\n## 핵심 후보 — 1W FVG를 4H 첫 터치봉으로 본 경우\n\n';
  md += '| 꼬리 깊이 | 첫터치 종가 | 표본 | 첫봉 꼬리거부 | 첫봉 원단밖종가 | 후속 근단방향 종가 | 후속 원단밖 종가 | 후속 CE/mid 도달 | 후속 원단 touch | 평균 꼬리침투 | 평균 종가침투 | 후속 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  const core = fourH.filter(r => r.source === 'FVG' && r.zoneTf === '1W');
  for (const wickDepth of ['edgeOnly', 'eqOnly', 'mid50', 'farHalf', 'farEdge'] as DeepestZone[]) {
    for (const closePos of ['favorOutside', 'nearInside', 'eqInside', 'farInside', 'invalidOutside'] as FirstTouchClosePosition[]) {
      const g = core.filter(r => r.wickDepth === wickDepth && r.closePosition === closePos);
      if (!g.length) continue;
      md += firstTouchAnatomyRow([deepestLabel(wickDepth), firstTouchClosePositionLabel(closePos)], g);
    }
  }

  md += '\n## 4H 관측 — 첫 터치 몸통 방향별\n\n';
  md += '| 존 | 몸통 | 표본 | 첫봉 꼬리거부 | 첫봉 원단밖종가 | 후속 근단방향 종가 | 후속 원단밖 종가 | 후속 CE/mid 도달 | 후속 원단 touch | 평균 꼬리침투 | 평균 종가침투 | 후속 평균 존내종가봉 |\n';
  md += '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const body of ['favorClose', 'againstClose', 'doji'] as FirstTouchBody[]) {
      const g = fourH.filter(r => r.source === src && r.body === body);
      if (!g.length) continue;
      md += firstTouchAnatomyRow([src, firstTouchBodyLabel(body)], g);
    }
  }

  return md;
}

// ══════════════════════════════════════════════════════════════════
// 신규 분석 4종 (2026-06-13): 음성대조 · 거래량 · 세션 · 등가유동성
// ══════════════════════════════════════════════════════════════════

// 결정적 RNG (재현성) — 음성대조용
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 1. 음성대조: 같은 폭%·TF지만 무작위 가격레벨·방향의 통제 존 ──
// 실제 OB/FVG가 무작위 박스보다 반응 성공률이 높은지 검정. 비슷하면 '엣지'가 노이즈.
function controlZoneFor(real: Zone, daily: Candle[], rng: () => number): Zone | null {
  if (daily.length < 60) return null;
  const widthPct = (real.high - real.low) / real.mid * 100;
  const anchorIdx = Math.floor(rng() * (daily.length - 45)); // 전방 관측 여지
  const anchor = daily[anchorIdx];
  const level = anchor.close;
  if (level <= 0) return null;
  const halfW = level * (widthPct / 100) / 2;
  const direction: 'bull' | 'bear' = rng() < 0.5 ? 'bull' : 'bear';
  return {
    zoneType: real.zoneType, direction,
    high: level + halfW, low: level - halfW, mid: level,
    originTime: anchor.time, confirmTime: anchor.time,
  };
}

// ── 2. 거래량 / 변위 볼륨 ──
type VolumeBucket = 'low' | 'normal' | 'high' | 'extreme';
function volBucket(ratio: number | null): VolumeBucket {
  if (ratio === null) return 'normal';
  if (ratio < 0.7) return 'low';
  if (ratio < 1.3) return 'normal';
  if (ratio < 2) return 'high';
  return 'extreme';
}
function volRatioAt(candles: Candle[], idx: number, period = 20): number | null {
  if (idx < period || idx >= candles.length) return null;
  let sum = 0;
  for (let i = idx - period; i < idx; i++) sum += candles[i].volume;
  const avgV = sum / period;
  if (avgV <= 0) return null;
  return candles[idx].volume / avgV;
}
function nearestIdxByTime(candles: Candle[], time: number): number {
  // time 이하 마지막 봉 (zone 생성 봉)
  let lo = 0, hi = candles.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (candles[m].time <= time) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
type VolumeRec = {
  symbol: string; zoneTf: ZoneTf; observeTf: ObserveTf; source: 'OB' | 'FVG';
  originVol: VolumeBucket; touchVol: VolumeBucket;
  reachedMid: boolean; nearExit: boolean; invalidated: boolean; reachedFarEdge: boolean;
};
function volumeForZone(symbol: string, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, zoneCandles: Candle[], observe: Candle[]): VolumeRec | null {
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const originIdx = nearestIdxByTime(zoneCandles, zone.originTime);
  const originVol = volBucket(originIdx >= 0 ? volRatioAt(zoneCandles, originIdx) : null);
  const touchVol = volBucket(volRatioAt(observe, touchIdx));
  const res = scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars);
  return {
    symbol, zoneTf, observeTf, source: zone.zoneType, originVol, touchVol,
    reachedMid: res.reachedMid, nearExit: res.outcome === 'nearExit',
    invalidated: res.outcome === 'invalidated', reachedFarEdge: res.reachedFarEdge,
  };
}

// ── 3. 세션 / 킬존 (4H 관측 전용, UTC) ──
type Session = 'asia' | 'london' | 'ny' | 'late';
function sessionOf(timeSec: number): Session {
  const h = new Date(timeSec * 1000).getUTCHours();
  if (h < 7) return 'asia';      // 00-07 UTC 아시아
  if (h < 13) return 'london';   // 07-13 런던(+킬존)
  if (h < 21) return 'ny';       // 13-21 뉴욕(+킬존)
  return 'late';                 // 21-24 마감
}
function sessionLabel(s: Session): string {
  return ({ asia: '아시아(00-07)', london: '런던(07-13)', ny: '뉴욕(13-21)', late: '마감(21-24)' } as const)[s];
}
type SessionRec = {
  symbol: string; zoneTf: ZoneTf; source: 'OB' | 'FVG'; session: Session;
  reachedMid: boolean; nearExit: boolean; invalidated: boolean; reachedFarEdge: boolean;
};
function sessionForZone(symbol: string, zoneTf: ZoneTf, zone: Zone, fourH: Candle[]): SessionRec | null {
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, fourH);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS['4H']));
  const res = scanZoneResolution(zone, favorUp, fourH, touchIdx, fwdBars);
  return {
    symbol, zoneTf, source: zone.zoneType, session: sessionOf(fourH[touchIdx].time),
    reachedMid: res.reachedMid, nearExit: res.outcome === 'nearExit',
    invalidated: res.outcome === 'invalidated', reachedFarEdge: res.reachedFarEdge,
  };
}

// ── 4. 등가 고저 유동성 sweep (이중천정/바닥형) ──
type EqLiqKind = 'none' | 'clusterNoSweep' | 'clusterSwept';
function eqLiqLabel(k: EqLiqKind): string {
  return ({ none: '등가 없음', clusterNoSweep: '등가 군집(sweep 없음)', clusterSwept: '등가 sweep' } as const)[k];
}
type EqLiqRec = {
  symbol: string; zoneTf: ZoneTf; observeTf: ObserveTf; source: 'OB' | 'FVG';
  kind: EqLiqKind;
  reachedMid: boolean; nearExit: boolean; invalidated: boolean; reachedFarEdge: boolean;
};
function eqLiquidityForZone(symbol: string, zoneTf: ZoneTf, observeTf: ObserveTf, zone: Zone, observe: Candle[], levels: StructureLevelSnapshot[]): EqLiqRec | null {
  const favorUp = zone.direction === 'bull';
  const touchIdx = firstTouchIndex(zone, observe);
  if (touchIdx < 0) return null;
  const fwdBars = Math.max(1, Math.round(FWD_DAYS / BAR_DAYS[observeTf]));
  const lb = 40;
  const start = Math.max(0, touchIdx - lb);
  // bull(수요)→등가 저점, bear(공급)→등가 고점
  const piv: number[] = [];
  for (let i = start; i < touchIdx; i++) {
    const price = favorUp ? levels[i]?.low : levels[i]?.high;
    if (price != null) piv.push(price);
  }
  let kind: EqLiqKind = 'none';
  if (piv.length >= 2) {
    const ref = piv[piv.length - 1];
    const cluster = piv.filter(pv => Math.abs(pv - ref) / ref <= 0.003);
    if (cluster.length >= 2) {
      const lvl = favorUp ? Math.min(...cluster) : Math.max(...cluster);
      let swept = false;
      for (let i = start; i <= touchIdx; i++) {
        const c = observe[i]; if (!c) continue;
        const tookOut = favorUp ? c.low < lvl * 0.9995 : c.high > lvl * 1.0005;
        const closedBack = favorUp ? c.close > lvl : c.close < lvl;
        if (tookOut && closedBack) { swept = true; break; }
      }
      kind = swept ? 'clusterSwept' : 'clusterNoSweep';
    }
  }
  const res = scanZoneResolution(zone, favorUp, observe, touchIdx, fwdBars);
  return {
    symbol, zoneTf, observeTf, source: zone.zoneType, kind,
    reachedMid: res.reachedMid, nearExit: res.outcome === 'nearExit',
    invalidated: res.outcome === 'invalidated', reachedFarEdge: res.reachedFarEdge,
  };
}

// ── 신규 4종 리포트 빌더 ──
function buildControlReport(real: Event[], control: Event[]): string {
  let md = '\n---\n\n# 음성 대조 ① 일봉 관측 (실제 존 vs 무작위 통제 존)\n\n';
  md += '통제 존 = 실제 존과 같은 폭%·TF·종목이지만 **무작위 가격레벨·무작위 방향**에 놓은 박스(시드 고정). ';
  md += '같은 반응 측정(일봉 20봉 내 무효화 없이 유리 +5% 도달). **실제가 통제보다 유의하게 높아야 진짜 엣지.**\n';
  md += '> ⚠️ 이 표는 **일봉 관측** 기준이다(비관 편향 TF). 실제 실행 TF(4H/1D)에서의 공정 비교는 아래 `음성 대조 ② 4H/1D 관측 RR`을 본다.\n\n';
  md += '| 존TF | 실제 표본 | 실제 성공률 | 통제 표본 | 통제 성공률 | 차이(실제−통제) |\n';
  md += '|---|---:|---:|---:|---:|---:|\n';
  const succ = (e: Event) => isSuccess(e, 20, 5) ? 1 : 0;
  for (const tf of ZONE_TFS) {
    const r = real.filter(e => e.zoneTf === tf && e.t0Kind === 'close');
    const c = control.filter(e => e.zoneTf === tf && e.t0Kind === 'close');
    if (!r.length || !c.length) continue;
    const rs = r.reduce((a, e) => a + succ(e), 0) / r.length;
    const cs = c.reduce((a, e) => a + succ(e), 0) / c.length;
    md += `| ${tf} | ${r.length} | ${(rs * 100).toFixed(0)}% | ${c.length} | ${(cs * 100).toFixed(0)}% | ${((rs - cs) * 100).toFixed(0)}%p |\n`;
  }
  md += '\n> 차이가 작거나 음수면 해당 TF에서 "존 반응"은 무작위 박스 대비 엣지가 약하다는 뜻.\n';
  return md;
}

// 음성대조 ② — 실제 실행 TF(4H/1D) RR로 실제 존 vs 무작위 통제 존 비교
function buildControl4hReport(real: LevelTrade[], control: LevelTrade[]): string {
  let md = '\n---\n\n# 음성 대조 ② 4H/1D 관측 RR (실제 존 vs 무작위 통제 존)\n\n';
  md += '실제 실행 설정(OB=mid50 / FVG=edge, 꼬리 지정가, SL 존 반대편, TP 2R)으로 무작위 통제 존과 ';
  md += '**기대값을 직접 비교**. 일봉 관측이 아니라 실제로 쓰는 4H·1D 관측에서 비교한다. ';
  md += '**실제 기대값이 통제보다 유의하게 높아야 진짜 엣지.** 차이가 0 근처면 그 구간 "존 반응"은 무작위 박스 수준.\n\n';
  const pick = (g: LevelTrade[], src: 'OB' | 'FVG') => g.filter(t => t.source === src && t.entrySignal === 'wick' && ((src === 'OB' && t.depth === 'mid50') || (src === 'FVG' && t.depth === 'edge')));
  md += '| 존 | 존TF | 관측 | 실제 표본 | 실제 E@2R | 통제 표본 | 통제 E@2R | 차이(실제−통제) |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) for (const otf of OBSERVE_TFS) {
      if (!OBSERVE_OPTIONS[ztf].includes(otf)) continue;
      const r = pick(real.filter(t => t.zoneTf === ztf && t.observeTf === otf), src);
      const c = pick(control.filter(t => t.zoneTf === ztf && t.observeTf === otf), src);
      if (r.length < 10 && c.length < 10) continue;
      const re = expOf(r, 2), ce = expOf(c, 2);
      const diff = re - ce;
      md += `| ${src} | ${ztf} | ${otf} | ${r.length}${flagN(r.length)} | ${re >= 0 ? '+' : ''}${re.toFixed(2)} | ${c.length}${flagN(c.length)} | ${ce >= 0 ? '+' : ''}${ce.toFixed(2)} | ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} |\n`;
    }
  }
  md += '\n> 차이가 큰 양수 구간 = 실제 존이 무작위 대비 진짜 엣지가 있는 곳. 0 근처/음수 = 그 구간은 무작위와 동급.\n';
  return md;
}

function ageBucket(days: number): string {
  if (days <= 7) return '0-7일';
  if (days <= 30) return '8-30일';
  if (days <= 90) return '31-90일';
  return '90일+';
}

function winRateOf(g: LevelTrade[], tgt: number): number {
  return g.length ? g.reduce((s, t) => s + t.winByTarget[tgt], 0) / g.length : 0;
}

function makeExcessRow(
  section: string,
  label: string,
  source: 'OB' | 'FVG',
  zoneTf: ZoneTf | 'ALL',
  observeTf: ObserveTf | 'ALL',
  depth: DepthLevel | 'mixed',
  entrySignal: EntrySignal,
  real: LevelTrade[],
  control: LevelTrade[],
): ControlExcessRow | null {
  if (!real.length || !control.length) return null;
  const realExp = expOf(real, 2);
  const controlExp = expOf(control, 2);
  return {
    section,
    label,
    source,
    zoneTf,
    observeTf,
    depth,
    entrySignal,
    realN: real.length,
    controlN: control.length,
    realWinPct: winRateOf(real, 2) * 100,
    controlWinPct: winRateOf(control, 2) * 100,
    realExp,
    controlExp,
    excessExp: realExp - controlExp,
    avgRiskPct: avg(real.map(t => t.riskPct)),
  };
}

function controlExcessRows(real: LevelTrade[], control: LevelTrade[]): ControlExcessRow[] {
  const rows: ControlExcessRow[] = [];
  const add = (row: ControlExcessRow | null) => { if (row) rows.push(row); };

  // 1. 4H 실행에서 깊이별 실제-통제 초과엣지. 백테스트 후보의 주 테이블.
  for (const src of ['OB', 'FVG'] as const) {
    for (const ztf of ZONE_TFS) {
      for (const depth of DEPTH_LEVELS) {
        const r = real.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === '4H' && t.depth === depth && t.entrySignal === 'wick');
        const c = control.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === '4H' && t.depth === depth && t.entrySignal === 'wick');
        add(makeExcessRow('4H depth', `${src} ${ztf} 4H ${depthLabel(src, depth)}`, src, ztf, '4H', depth, 'wick', r, c));
      }
    }
  }

  // 2. 기존 대표 후보(OB mid50 / FVG edge)의 관측TF별 초과엣지. 4H 필수 여부 재확인.
  for (const src of ['OB', 'FVG'] as const) {
    const depth: DepthLevel = src === 'OB' ? 'mid50' : 'edge';
    for (const ztf of ZONE_TFS) {
      for (const otf of OBSERVE_TFS) {
        if (!OBSERVE_OPTIONS[ztf].includes(otf)) continue;
        const r = real.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf && t.depth === depth && t.entrySignal === 'wick');
        const c = control.filter(t => t.source === src && t.zoneTf === ztf && t.observeTf === otf && t.depth === depth && t.entrySignal === 'wick');
        add(makeExcessRow('observe matrix', `${src} ${ztf}->${otf} ${depthLabel(src, depth)}`, src, ztf, otf, depth, 'wick', r, c));
      }
    }
  }

  // 3. 관측 가능한 레짐 필터. 과최적화 방지를 위해 추천 깊이·4H 실행만 본다.
  for (const src of ['OB', 'FVG'] as const) {
    const depth: DepthLevel = src === 'OB' ? 'mid50' : 'edge';
    for (const regime of ['withTrend', 'againstTrend', 'range'] as TrendRegime[]) {
      const r = real.filter(t => t.source === src && t.observeTf === '4H' && t.depth === depth && t.entrySignal === 'wick' && t.regime === regime);
      const c = control.filter(t => t.source === src && t.observeTf === '4H' && t.depth === depth && t.entrySignal === 'wick' && t.regime === regime);
      add(makeExcessRow('regime 4H', `${src} ${regimeLabel(regime)}`, src, 'ALL', '4H', depth, 'wick', r, c));
    }
  }

  // 4. FVG fresh/aged 필터. fresh gap 후보가 무작위 대비로도 살아있는지 확인.
  for (const bucket of ['0-7일', '8-30일', '31-90일', '90일+']) {
    const r = real.filter(t => t.source === 'FVG' && t.observeTf === '4H' && t.depth === 'edge' && t.entrySignal === 'wick' && ageBucket(t.ageDays) === bucket);
    const c = control.filter(t => t.source === 'FVG' && t.observeTf === '4H' && t.depth === 'edge' && t.entrySignal === 'wick' && ageBucket(t.ageDays) === bucket);
    add(makeExcessRow('FVG age 4H', `FVG edge ${bucket}`, 'FVG', 'ALL', '4H', 'edge', 'wick', r, c));
  }

  // 5. OB deep 후보의 종목별 의존성. 실제-통제 차이도 종목 단위로 확인.
  for (const sym of [...new Set(real.map(t => t.symbol))].sort()) {
    const r = real.filter(t => t.symbol === sym && t.source === 'OB' && t.zoneTf === '1W' && t.observeTf === '4H' && t.depth === 'eqFar' && t.entrySignal === 'wick');
    const c = control.filter(t => t.symbol === sym && t.source === 'OB' && t.zoneTf === '1W' && t.observeTf === '4H' && t.depth === 'eqFar' && t.entrySignal === 'wick');
    add(makeExcessRow('OB deep symbol', `OB 1W eqFar ${sym}`, 'OB', '1W', '4H', 'eqFar', 'wick', r, c));
  }

  return rows;
}

function buildControlExcessReport(rows: ControlExcessRow[]): string {
  let md = '\n---\n\n# 백테스트 전 최종 체크 — 실제−무작위 초과엣지\n\n';
  md += `데이터 스냅샷은 cutoff ${ANALYSIS_CUTOFF_ISO}로 고정. open time이 cutoff 이상인 캔들은 제외했고, `;
  md += '1W/1M 리샘플은 마지막 미완성 HTF 버킷을 제외했다. ';
  md += '아래 표는 같은 depth/TF/관측TF 조건의 실제 존 기대값에서 무작위 통제 존 기대값을 뺀 값이다. ';
  md += '백테스트 후보는 실제 E@2R뿐 아니라 초과엣지가 양수인 구간만 우선한다.\n\n';

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
  const rowMd = (r: ControlExcessRow) =>
    `| ${r.label} | ${r.realN}${flagN(r.realN)} | ${r.realWinPct.toFixed(0)}% | ${fmt(r.realExp)} | ${r.controlN}${flagN(r.controlN)} | ${fmt(r.controlExp)} | ${fmt(r.excessExp)} | ${r.avgRiskPct.toFixed(1)} |`;

  const shortlist = rows
    .filter(r => r.section !== 'observe matrix' && r.observeTf === '4H' && r.realN >= 30 && r.controlN >= 30 && r.realExp > 0 && r.excessExp > 0.5)
    .sort((a, b) => b.excessExp - a.excessExp)
    .slice(0, 20);

  md += '## 1. 백테스트 후보 shortlist (4H 실행, N>=30, 실제 E>0, 초과엣지>+0.5R)\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of shortlist) md += rowMd(r) + '\n';

  md += '\n## 2. 4H 실행 depth별 초과엣지\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows.filter(r => r.section === '4H depth' && r.realN >= 10 && r.controlN >= 10).sort((a, b) => b.excessExp - a.excessExp)) {
    md += rowMd(r) + '\n';
  }

  md += '\n## 3. 관측TF별 초과엣지 — 대표 깊이(OB mid50 / FVG edge)\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows.filter(r => r.section === 'observe matrix' && r.realN >= 10 && r.controlN >= 10).sort((a, b) => {
    const ao = a.observeTf === '4H' ? 0 : a.observeTf === '1D' ? 1 : a.observeTf === '1W' ? 2 : 3;
    const bo = b.observeTf === '4H' ? 0 : b.observeTf === '1D' ? 1 : b.observeTf === '1W' ? 2 : 3;
    return ao - bo || b.excessExp - a.excessExp;
  })) {
    md += rowMd(r) + '\n';
  }

  md += '\n## 4. 레짐별 초과엣지 — 대표 깊이, 4H 실행\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows.filter(r => r.section === 'regime 4H' && r.realN >= 30 && r.controlN >= 30).sort((a, b) => b.excessExp - a.excessExp)) {
    md += rowMd(r) + '\n';
  }

  md += '\n## 5. FVG age별 초과엣지 — edge, 4H 실행\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows.filter(r => r.section === 'FVG age 4H' && r.realN >= 30 && r.controlN >= 30).sort((a, b) => b.excessExp - a.excessExp)) {
    md += rowMd(r) + '\n';
  }

  md += '\n## 6. OB 1W eqFar 종목별 초과엣지\n\n';
  md += '| 후보 | 실제N | 실제승률 | 실제E@2R | 통제N | 통제E@2R | 초과엣지 | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|---:|---:|---:|\n';
  for (const r of rows.filter(r => r.section === 'OB deep symbol').sort((a, b) => b.excessExp - a.excessExp)) {
    md += rowMd(r) + '\n';
  }

  md += '\n## 7. 체크 결론\n\n';
  md += '- 백테스트로 넘길 셀은 실제 기대값과 실제−통제 초과엣지가 함께 양수인 셀만 우선한다.\n';
  md += '- 4H 실행이 아닌 동일TF/거친 관측 셀은 실제 기대값이 좋아 보여도 초과엣지 붕괴 여부를 먼저 본다.\n';
  md += '- 표본 30 미만은 후보 발굴에는 참고 가능하지만, 백테스트 검증에서는 단독 결론으로 쓰지 않는다.\n';
  return md;
}

function buildVolumeReport(recs: VolumeRec[]): string {
  let md = '\n---\n\n# 거래량 / 변위 볼륨 분석\n\n';
  md += '존 생성 캔들 volume(변위)·터치 캔들 volume을 직전 20봉 평균 대비 배수로 버킷팅(4H 관측). ';
  md += '반응 = 첫터치 이후 mid/CE 도달·근단이탈·무효화.\n\n';
  const h4 = recs.filter(r => r.observeTf === '4H');
  const P = (g: VolumeRec[], f: (r: VolumeRec) => boolean) => pct(g.filter(f).length, g.length);

  md += '## 존 생성(변위) 볼륨별\n\n';
  md += '| 존 | 변위볼륨 | 표본 | mid/CE도달 | 근단이탈 | 무효화 | far edge |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) for (const b of ['low', 'normal', 'high', 'extreme'] as VolumeBucket[]) {
    const g = h4.filter(r => r.source === src && r.originVol === b);
    if (!g.length) continue;
    md += `| ${src} | ${b} | ${g.length}${flagN(g.length)} | ${P(g, r => r.reachedMid)} | ${P(g, r => r.nearExit)} | ${P(g, r => r.invalidated)} | ${P(g, r => r.reachedFarEdge)} |\n`;
  }

  md += '\n## 터치 캔들 볼륨별\n\n';
  md += '| 존 | 터치볼륨 | 표본 | mid/CE도달 | 근단이탈 | 무효화 | far edge |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) for (const b of ['low', 'normal', 'high', 'extreme'] as VolumeBucket[]) {
    const g = h4.filter(r => r.source === src && r.touchVol === b);
    if (!g.length) continue;
    md += `| ${src} | ${b} | ${g.length}${flagN(g.length)} | ${P(g, r => r.reachedMid)} | ${P(g, r => r.nearExit)} | ${P(g, r => r.invalidated)} | ${P(g, r => r.reachedFarEdge)} |\n`;
  }
  return md;
}

function buildSessionReport(recs: SessionRec[]): string {
  let md = '\n---\n\n# 세션 / 킬존 분석 (4H 첫터치 시점, UTC)\n\n';
  md += '존 첫터치가 발생한 4H 봉의 UTC 시간대별 반응. 런던/뉴욕 킬존 가설 검정.\n\n';
  md += '| 존 | 세션 | 표본 | mid/CE도달 | 근단이탈 | 무효화 | far edge |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  const P = (g: SessionRec[], f: (r: SessionRec) => boolean) => pct(g.filter(f).length, g.length);
  for (const src of ['OB', 'FVG'] as const) for (const s of ['asia', 'london', 'ny', 'late'] as Session[]) {
    const g = recs.filter(r => r.source === src && r.session === s);
    if (!g.length) continue;
    md += `| ${src} | ${sessionLabel(s)} | ${g.length}${flagN(g.length)} | ${P(g, r => r.reachedMid)} | ${P(g, r => r.nearExit)} | ${P(g, r => r.invalidated)} | ${P(g, r => r.reachedFarEdge)} |\n`;
  }
  return md;
}

function buildEqLiqReport(recs: EqLiqRec[]): string {
  let md = '\n---\n\n# 등가 고저 유동성 sweep 분석\n\n';
  md += '터치 직전 40봉(4H 관측)에서 등가 고점/저점 군집(±0.3%)을 찾고, 그 군집을 꼬리로 쓸고 종가는 안쪽으로 ';
  md += '돌아왔는지(sweep)로 분류. bull→등가 저점, bear→등가 고점.\n\n';
  md += '| 존 | 유동성 유형 | 표본 | mid/CE도달 | 근단이탈 | 무효화 | far edge |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  const h4 = recs.filter(r => r.observeTf === '4H');
  const P = (g: EqLiqRec[], f: (r: EqLiqRec) => boolean) => pct(g.filter(f).length, g.length);
  for (const src of ['OB', 'FVG'] as const) for (const k of ['none', 'clusterNoSweep', 'clusterSwept'] as EqLiqKind[]) {
    const g = h4.filter(r => r.source === src && r.kind === k);
    if (!g.length) continue;
    md += `| ${src} | ${eqLiqLabel(k)} | ${g.length}${flagN(g.length)} | ${P(g, r => r.reachedMid)} | ${P(g, r => r.nearExit)} | ${P(g, r => r.invalidated)} | ${P(g, r => r.reachedFarEdge)} |\n`;
  }
  return md;
}

// ══════════════════════════════════════════════════════════════════
// 더 깊게 팔 가설 (2026-06-13): acceptance 임계 · OB깊은진입 강건성 ·
//                              4H 해상도 아티팩트 · 묵은 FVG
// ══════════════════════════════════════════════════════════════════
function buildDeepDiveReport(levelTrades: LevelTrade[], midAccepts: MidAcceptanceRec[]): string {
  let md = '\n---\n\n# 더 깊게 팔 가설 (정밀)\n\n';

  // 1. mid/CE acceptance 임계 — 반전→관통이 뒤집히는 봉수
  md += '## 1. mid/CE acceptance 임계 (반전→관통 전환점, 4H)\n\n';
  md += '연속 acceptance 종가봉 수별로 근단이탈(반전)·far edge(관통)·무효화를 본다. 어느 봉수에서 뒤집히나.\n\n';
  md += '| 존 | 연속 acceptance | 표본 | 근단이탈 | far edge도달 | 무효화 |\n';
  md += '|---|---|---:|---:|---:|---:|\n';
  const m4 = midAccepts.filter(r => r.observeTf === '4H');
  const accBucket = (n: number) => n <= 0 ? '0봉' : n === 1 ? '1봉' : n === 2 ? '2봉' : n === 3 ? '3봉' : '4봉+';
  for (const src of ['OB', 'FVG'] as const) for (const b of ['0봉', '1봉', '2봉', '3봉', '4봉+']) {
    const g = m4.filter(r => r.source === src && accBucket(r.maxConsecutiveAccepted) === b);
    if (!g.length) continue;
    md += `| ${src} | ${b} | ${g.length}${flagN(g.length)} | ${pct(g.filter(r => r.outcome === 'nearExit').length, g.length)} | ${pct(g.filter(r => r.reachedFarEdge).length, g.length)} | ${pct(g.filter(r => r.outcome === 'invalidated').length, g.length)} |\n`;
  }

  // 2. OB 깊은 진입(eqFar/mid50) 강건성 — 종목 집중도
  md += '\n## 2. OB 깊은 진입 강건성 — 종목별 (1W존, 4H실행, eqFar, 꼬리)\n\n';
  md += '최강 양수 RR(OB eqFar)이 소수 종목/존에 의존하는지 분해. 종목마다 양수면 강건.\n\n';
  md += '| 종목 | 표본 | 승률(2R) | 기대값(R) | 평균위험% |\n';
  md += '|---|---:|---:|---:|---:|\n';
  const obDeep = levelTrades.filter(t => t.source === 'OB' && t.zoneTf === '1W' && t.observeTf === '4H' && t.depth === 'eqFar' && t.entrySignal === 'wick');
  const symsSorted = [...new Set(obDeep.map(t => t.symbol))].sort();
  for (const sym of symsSorted) {
    const g = obDeep.filter(t => t.symbol === sym);
    if (!g.length) continue;
    const wr = g.reduce((s, t) => s + t.winByTarget[2], 0) / g.length;
    md += `| ${sym} | ${g.length}${flagN(g.length)} | ${(wr * 100).toFixed(0)}% | ${expOf(g, 2) >= 0 ? '+' : ''}${expOf(g, 2).toFixed(2)} | ${avg(g.map(t => t.riskPct)).toFixed(1)} |\n`;
  }
  const allDeep = obDeep;
  md += `| **합계** | ${allDeep.length} | ${(allDeep.reduce((s, t) => s + t.winByTarget[2], 0) / allDeep.length * 100).toFixed(0)}% | ${expOf(allDeep, 2) >= 0 ? '+' : ''}${expOf(allDeep, 2).toFixed(2)} | ${avg(allDeep.map(t => t.riskPct)).toFixed(1)} |\n`;

  // 3. 4H 우위가 해상도 아티팩트인가 — SL·2R 동봉 충돌률
  md += '\n## 3. "4H 우위"는 해상도 아티팩트인가 — SL·2R 동봉 충돌률\n\n';
  md += '일봉은 한 봉에 SL·2R 동시 도달 시 SL우선(보수)으로 손실 집계 → 승률 과소. 관측TF별 충돌률 비교. ';
  md += '1D 충돌률이 4H보다 크게 높으면 "4H 우위"의 상당부분은 진짜 엣지가 아니라 해상도 아티팩트.\n\n';
  md += '| 존 | 관측TF | 표본 | SL·2R 동봉충돌률 | 승률(2R) | 기대값(R) |\n';
  md += '|---|---|---:|---:|---:|---:|\n';
  for (const src of ['OB', 'FVG'] as const) for (const otf of OBSERVE_TFS) {
    const g = levelTrades.filter(t => t.source === src && t.observeTf === otf && t.entrySignal === 'wick' && ((src === 'OB' && t.depth === 'mid50') || (src === 'FVG' && t.depth === 'edge')));
    if (!g.length) continue;
    const conflict = g.filter(t => t.sameBarConflict).length;
    const wr = g.reduce((s, t) => s + t.winByTarget[2], 0) / g.length;
    md += `| ${src} | ${otf} | ${g.length}${flagN(g.length)} | ${pct(conflict, g.length)} | ${(wr * 100).toFixed(0)}% | ${expOf(g, 2) >= 0 ? '+' : ''}${expOf(g, 2).toFixed(2)} |\n`;
  }

  // 4. 묵은 FVG — confirm→첫터치 경과일별 RR
  md += '\n## 4. 묵은 FVG — 생성 후 첫터치 경과일별 (4H실행, edge, 꼬리)\n\n';
  md += '신선 갭 vs 묵은 갭의 진입 RR 차이. 구조분석에선 묵은 FVG가 깊이 침투했는데, 실제 RR로도 좋은가.\n\n';
  md += '| 경과일 | 표본 | 승률(2R) | 기대값(R) | 평균MFE(R) |\n';
  md += '|---|---:|---:|---:|---:|\n';
  const fvgAge = levelTrades.filter(t => t.source === 'FVG' && t.observeTf === '4H' && t.depth === 'edge' && t.entrySignal === 'wick');
  const ageB = (d: number) => d <= 7 ? '0-7일' : d <= 30 ? '8-30일' : d <= 90 ? '31-90일' : '90일+';
  for (const b of ['0-7일', '8-30일', '31-90일', '90일+']) {
    const g = fvgAge.filter(t => ageB(t.ageDays) === b);
    if (!g.length) continue;
    const wr = g.reduce((s, t) => s + t.winByTarget[2], 0) / g.length;
    md += `| ${b} | ${g.length}${flagN(g.length)} | ${(wr * 100).toFixed(0)}% | ${expOf(g, 2) >= 0 ? '+' : ''}${expOf(g, 2).toFixed(2)} | ${avg(g.map(t => t.mfeR)).toFixed(2)} |\n`;
  }
  return md;
}

// ── 집계 → REPORT.md ──────────────────────────────────────────────
/** 성공 = 무효화 전에 유리 이동이 목표 가격 % 도달 */
function isSuccess(e: Event, N: number, targetPct: number): boolean {
  if (e.invalidatedByBar !== null && e.invalidatedByBar <= N) return false;
  return (e.favPctByN[N] ?? 0) >= targetPct;
}

function pct(n: number, d: number): string {
  return d === 0 ? '-' : `${((n / d) * 100).toFixed(0)}%`;
}

/** RR 트레이드 집계 섹션 */
function buildTradeReport(trades: TradeRec[]): string {
  let md = '\n---\n\n# RR 트레이드 시뮬레이션 (진입 타이밍 × 손익비)\n\n';
  md += `진입 = 중심값(OB mid/FVG CE), SL = 존 반대편 끝, TP = ${RR_TARGETS.map(t => t + 'R').join('/')}. SL 우선(보수적). `;
  md += `체결 후 ${RR_FWD_BARS}봉 관측, 터치 후 ${FILL_WAIT_BARS}봉 내 미체결·체결 전 무효화 시 폐기.\n`;
  md += `기대값(E) = 승률×목표R − (1−승률)×1R. **양수면 엣지.**\n\n`;

  // 모델 × zoneTf 기대값 (TP=2R 기준 대표)
  const TGT0 = 2;
  md += `## 진입 타이밍 비교 — zone TF별 (TP ${TGT0}R 기준)\n\n`;
  md += '| TF | 모델 | 셋업 | 승률(2R) | 기대값(R) | 평균위험% | 평균MFE(R) |\n';
  md += '|---|---|---:|---:|---:|---:|---:|\n';
  for (const tf of ZONE_TFS) {
    for (const model of ['immediate', 'close_confirm'] as EntryModel[]) {
      const g = trades.filter(t => t.zoneTf === tf && t.model === model);
      if (!g.length) continue;
      const wr = g.reduce((s, t) => s + t.winByTarget[TGT0], 0) / g.length;
      const exp = wr * TGT0 - (1 - wr) * 1;
      const avgRisk = g.reduce((s, t) => s + t.riskPct, 0) / g.length;
      const avgMfe = g.reduce((s, t) => s + t.mfeR, 0) / g.length;
      md += `| ${tf} | ${model} | ${g.length} | ${(wr * 100).toFixed(0)}% | ${exp >= 0 ? '+' : ''}${exp.toFixed(2)} | ${avgRisk.toFixed(1)} | ${avgMfe.toFixed(2)} |\n`;
    }
  }

  // 목표 R 스윕 (모델별 전체 기대값)
  md += '\n## 목표 R 스윕 — 모델별 전체 기대값\n\n';
  md += '| 모델 | 셋업 | ' + RR_TARGETS.map(t => `E@${t}R`).join(' | ') + ' |\n';
  md += '|---|---:|' + RR_TARGETS.map(() => '---:').join('|') + '|\n';
  for (const model of ['immediate', 'close_confirm'] as EntryModel[]) {
    const g = trades.filter(t => t.model === model);
    if (!g.length) continue;
    const cells = RR_TARGETS.map(t => {
      const wr = g.reduce((s, x) => s + x.winByTarget[t], 0) / g.length;
      const exp = wr * t - (1 - wr) * 1;
      return `${exp >= 0 ? '+' : ''}${exp.toFixed(2)}`;
    });
    md += `| ${model} | ${g.length} | ${cells.join(' | ')} |\n`;
  }
  return md;
}

function buildReport(events: Event[]): string {
  let md = '# EQ 존 반응 연구 결과\n\n';
  md += `자동 생성 — \`cd frontend && npx vite-node scripts/eq-reaction-study.ts\`. 설계: docs/plans/eq-zone-reaction-study.md\n`;
  md += `종목 ${SYMBOLS.join('/')} · 일봉 관측 · 이벤트 ${events.length}건. 데이터 cutoff ${ANALYSIS_CUTOFF_ISO}\n\n`;

  // 대표 임계: N=20봉 내 무효화 없이 유리 +5%. 표엔 이 기준 성공률.
  const N0 = 20, TGT0 = 5;
  md += `> 표의 성공률 기준: 전방 ${N0}봉 내 무효화(종가가 존 반대편 돌파) 없이 유리 이동 +${TGT0}% 도달.\n`;
  md += `> 종목 ${SYMBOLS.join('/')} · 존폭 ${MIN_WIDTH_PCT}% 미만 제외 · 종가(close) 기준이 주, 꼬리(wick)는 대조.\n\n`;
  md += `> 재현성: candle open time < ${ANALYSIS_CUTOFF_ISO}만 사용. 1W/1M 리샘플은 마지막 미완성 HTF 버킷 제외. 음성대조 seed=${CONTROL_SEED}.\n\n`;

  const closeEvents = events.filter(e => e.t0Kind === 'close');

  // Q1+Q3: zoneType × zoneTf × t0Kind 성공률
  md += '## Q1·Q3 — wick vs close × zone TF 반응 성공률\n\n';
  md += '| 존 | TF | t0 | 이벤트 | 성공률 | 무효화율 | 평균유리% | 평균불리% |\n';
  md += '|---|---|---|---:|---:|---:|---:|---:|\n';
  for (const zt of ['OB', 'FVG'] as const) {
    for (const tf of ZONE_TFS) {
      for (const k of ['close', 'wick'] as const) {
        const g = events.filter(e => e.zoneType === zt && e.zoneTf === tf && e.t0Kind === k);
        if (!g.length) continue;
        const succ = g.filter(e => isSuccess(e, N0, TGT0)).length;
        const inval = g.filter(e => e.invalidatedByBar !== null && e.invalidatedByBar <= N0).length;
        const avgFav = g.reduce((s, e) => s + (e.favPctByN[N0] ?? 0), 0) / g.length;
        const avgAdv = g.reduce((s, e) => s + (e.advPctByN[N0] ?? 0), 0) / g.length;
        md += `| ${zt} | ${tf} | ${k} | ${g.length} | ${pct(succ, g.length)} | ${pct(inval, g.length)} | ${avgFav.toFixed(1)} | ${avgAdv.toFixed(1)} |\n`;
      }
    }
  }

  // Q2: entryFib 분포 (0.5 집중 여부) — close 이벤트, 존 전체 구간
  md += '\n## Q2 — 반응 시작 위치(최대 침투 fib) × 성공률 (close 이벤트)\n\n';
  md += '0=존 근단, 1=존 원단. 0.50=OB mid/FVG CE, EQ밴드 0.38~0.62. "0.5/EQ 진입이 존 가장자리보다 나은가" 검증.\n\n';
  const bins = [-99, 0, 0.2, 0.38, 0.5, 0.62, 0.8, 1.0, 99];
  const binLabel = ['<0(존이탈)', '0~0.2', '0.2~0.38', '0.38~0.5', '0.5~0.62', '0.62~0.8', '0.8~1.0', '>1.0'];
  md += '| fib 구간 | 이벤트 | 성공률 | 평균유리% |\n|---|---:|---:|---:|\n';
  for (let b = 0; b < bins.length - 1; b++) {
    const g = closeEvents.filter(e => e.entryFib >= bins[b] && e.entryFib < bins[b + 1]);
    if (!g.length) continue;
    const succ = g.filter(e => isSuccess(e, N0, TGT0)).length;
    const avgFav = g.reduce((s, e) => s + (e.favPctByN[N0] ?? 0), 0) / g.length;
    md += `| ${binLabel[b]} | ${g.length} | ${pct(succ, g.length)} | ${avgFav.toFixed(1)} |\n`;
  }

  // Q(케이스A): priorWickPokes × 성공률 — 많이 쓸고 종가지지하면 반등 강한가
  md += '\n## 케이스A — 사전 꼬리 찌름 횟수 × 종가지지 반응 (close 이벤트)\n\n';
  md += '| 사전 꼬리찌름 | 이벤트 | 성공률 | 평균유리% |\n|---|---:|---:|---:|\n';
  const pokeBuckets: [string, (n: number) => boolean][] = [
    ['0', n => n === 0], ['1', n => n === 1], ['2', n => n === 2], ['3+', n => n >= 3],
  ];
  for (const [lab, f] of pokeBuckets) {
    const g = closeEvents.filter(e => f(e.priorWickPokes));
    if (!g.length) continue;
    const succ = g.filter(e => isSuccess(e, N0, TGT0)).length;
    const avgFav = g.reduce((s, e) => s + (e.favPctByN[N0] ?? 0), 0) / g.length;
    md += `| ${lab} | ${g.length} | ${pct(succ, g.length)} | ${avgFav.toFixed(1)} |\n`;
  }

  // 민감도: N × target% 스윕 (close 이벤트 전체 성공률)
  md += '\n## 민감도 — 임계값 스윕 (close 이벤트 전체 성공률)\n\n';
  md += '| N \\ 목표 | ' + TARGETS_PCT.map(t => `+${t}%`).join(' | ') + ' |\n';
  md += '|---|' + TARGETS_PCT.map(() => '---:').join('|') + '|\n';
  for (const N of FWD_NS) {
    const row = TARGETS_PCT.map(tgt => {
      const succ = closeEvents.filter(e => isSuccess(e, N, tgt)).length;
      return pct(succ, closeEvents.length);
    });
    md += `| ${N}봉 | ${row.join(' | ')} |\n`;
  }

  md += '\n## 터치 순번별 성공률 (close 이벤트)\n\n';
  md += '| 순번 | 이벤트 | 성공률 |\n|---|---:|---:|\n';
  for (const ord of [1, 2, 3]) {
    const g = closeEvents.filter(e => (ord < 3 ? e.touchOrdinal === ord : e.touchOrdinal >= 3));
    if (!g.length) continue;
    const succ = g.filter(e => isSuccess(e, N0, TGT0)).length;
    md += `| ${ord < 3 ? ord : '3+'} | ${g.length} | ${pct(succ, g.length)} |\n`;
  }

  return md;
}

async function main() {
  console.log(`▶ EQ 존 반응 연구 — ${SYMBOLS.join('/')}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const allEvents: Event[] = [];
  const allTrades: TradeRec[] = [];
  const allLevelTrades: LevelTrade[] = [];
  const allPaths: PathRec[] = [];
  const allFirstTouchAnatomies: FirstTouchAnatomyRec[] = [];
  const allPostFirstTouchPaths: PostFirstTouchPathRec[] = [];
  const allCloseEntries: CloseEntryRec[] = [];
  const allSequences: SequenceRec[] = [];
  const allTransitions: TransitionRec[] = [];
  const allInvalidationBehaviors: InvalidationBehaviorRec[] = [];
  const allReclaimBehaviors: ReclaimBehaviorRec[] = [];
  const allMidAcceptances: MidAcceptanceRec[] = [];
  const allLiquiditySweeps: LiquiditySweepRec[] = [];
  const allLtfStructures: LtfStructureRec[] = [];
  const allPreTouchApproaches: PreTouchApproachRec[] = [];
  const allRemainingBehaviors: RemainingSmcBehaviorRec[] = [];
  const allBrokenZones: BrokenZoneRec[] = [];
  const allBrokenStrategyForwards: BrokenStrategyForwardRec[] = [];
  const allBrokenSignalForwards: BrokenSignalForwardRec[] = [];
  const allControlEvents: Event[] = [];
  const allControlLevelTrades: LevelTrade[] = []; // 4H/1D 관측 음성대조 (실제 RR 기준)
  const allVolumeRecs: VolumeRec[] = [];
  const allSessionRecs: SessionRec[] = [];
  const allEqLiqRecs: EqLiqRec[] = [];
  const controlRng = mulberry32(CONTROL_SEED); // 음성대조 시드 고정(재현성)
  const selfChecks: SelfCheck[] = [];
  let btcObserveCandles: Record<ObserveTf, Candle[]> | null = null;

  for (const symbol of SYMBOLS) {
    const daily = await fetchKlines(symbol, '1d', DAILY_BARS);
    const fourH = await fetchKlines(symbol, '4h', FOURH_BARS);
    // 관측 TF별 캔들: 4H=수집, 1D=수집, 1W/1M=일봉 리샘플
    const observeCandles: Record<ObserveTf, Candle[]> = {
      '4H': fourH, '1D': daily, '1W': resample(daily, '1W'), '1M': resample(daily, '1M'),
    };
    if (symbol === 'BTCUSDT') btcObserveCandles = observeCandles;
    const structureLevels: Record<ObserveTf, StructureLevelSnapshot[]> = {
      '4H': buildStructureLevels(observeCandles['4H']),
      '1D': buildStructureLevels(observeCandles['1D']),
      '1W': buildStructureLevels(observeCandles['1W']),
      '1M': buildStructureLevels(observeCandles['1M']),
    };
    const childZones4h = zonesFor(fourH as SmcCandle[])
      .filter(z => z.high > z.low && ((z.high - z.low) / z.mid) * 100 >= MIN_WIDTH_PCT);
    for (const otf of OBSERVE_TFS) {
      selfChecks.push(checkCandles(`${symbol} ${otf}`, observeCandles[otf]));
      selfChecks.push(checkCutoff(`${symbol} ${otf}`, observeCandles[otf]));
    }
    const zonesByTf = {} as Record<ZoneTf, MetaZone[]>;
    const zoneCandlesByTf = {} as Record<ZoneTf, Candle[]>;
    const zoneStructureLevels = {} as Record<ZoneTf, StructureLevelSnapshot[]>;
    for (const tf of ZONE_TFS) {
      const tfCandles = resample(daily, tf);
      zoneCandlesByTf[tf] = tfCandles;
      zoneStructureLevels[tf] = buildStructureLevels(tfCandles);
      zonesByTf[tf] = zonesFor(tfCandles as SmcCandle[]).map((zone, idx) => ({
        ...zone,
        symbol,
        zoneTf: tf,
        zoneId: `${symbol}:${tf}:${idx}:${zone.zoneType}:${zone.direction}:${zone.confirmTime}:${zone.low.toFixed(8)}:${zone.high.toFixed(8)}`,
      }));
    }
    const symbolZones = ZONE_TFS.flatMap(tf => zonesByTf[tf]);
    selfChecks.push(checkZones(symbol, symbolZones));
    for (const otf of OBSERVE_TFS) {
      selfChecks.push(checkObserveStart(symbol, symbolZones, otf, observeCandles[otf]));
    }

    for (const tf of ZONE_TFS) {
      const zones = zonesByTf[tf];
      let evCount = 0;
      for (const zone of zones) {
        const confluence = confluenceForZone(zone, symbolZones);
        // 이벤트·timing 분석은 기존대로 일봉 관측
        const evs = eventsForZone(symbol, tf, zone, daily);
        allEvents.push(...evs);
        // 음성대조: 같은 폭%·TF의 무작위 통제 존 1개
        const control = controlZoneFor(zone, daily, controlRng);
        if (control) {
          allControlEvents.push(...eventsForZone(symbol, tf, control, daily));
          // 4H/1D 관측 음성대조: 통제 존도 실제 RR(레벨 트레이드)로 측정 — 실행 TF에서 공정 비교
          for (const otf of OBSERVE_OPTIONS[tf]) {
            allControlLevelTrades.push(...levelTradesForZone(symbol, `${zone.zoneId}:ctrl`, confluence, tf, otf, control, observeCandles[otf]));
          }
        }
        evCount += evs.length;
        allTrades.push(...tradesForZone(symbol, tf, zone, daily));
        // 레벨 분석: 존 TF에 허용된 관측 TF 전부
        for (const otf of OBSERVE_OPTIONS[tf]) {
          allLevelTrades.push(...levelTradesForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]));
          const path = pathForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (path) allPaths.push(path);
          const firstTouchAnatomy = firstTouchAnatomyForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (firstTouchAnatomy) allFirstTouchAnatomies.push(firstTouchAnatomy);
          allPostFirstTouchPaths.push(...postFirstTouchPathForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]));
          const closeEntries = closeEntriesForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          allCloseEntries.push(...closeEntries);
          const sequence = sequenceForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (sequence) allSequences.push(sequence);
          allTransitions.push(...transitionsForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]));
          const invalidation = invalidationBehaviorForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (invalidation) allInvalidationBehaviors.push(invalidation);
          const reclaim = reclaimBehaviorForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (reclaim) allReclaimBehaviors.push(reclaim);
          allMidAcceptances.push(...midAcceptanceForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]));
          const liquidity = liquiditySweepForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf], structureLevels[otf]);
          if (liquidity) allLiquiditySweeps.push(liquidity);
          if (otf === '4H') {
            const ltfStructure = ltfStructureForZone(symbol, zone.zoneId, confluence, tf, zone, observeCandles['4H'], structureLevels['4H']);
            if (ltfStructure) allLtfStructures.push(ltfStructure);
          }
          const preTouch = preTouchApproachForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (preTouch) allPreTouchApproaches.push(preTouch);
          const remaining = remainingSmcBehaviorForZone(
            symbol,
            zone.zoneId,
            confluence,
            tf,
            otf,
            zone,
            observeCandles[otf],
            zoneCandlesByTf[tf],
            zoneStructureLevels[tf],
            structureLevels[otf],
            childZones4h,
            closeEntries,
            btcObserveCandles,
          );
          if (remaining) allRemainingBehaviors.push(remaining);
          const brokenZone = brokenZoneForZone(symbol, zone.zoneId, confluence, tf, otf, zone, observeCandles[otf]);
          if (brokenZone) {
            allBrokenZones.push(brokenZone);
            const brokenDetail = brokenDetailRecords([brokenZone])[0];
            const forward = brokenStrategyForwardForZone(brokenDetail, zone, observeCandles[otf]);
            if (forward) allBrokenStrategyForwards.push(forward);
          }
          allBrokenSignalForwards.push(...brokenSignalForwards(symbol, zone.zoneId, tf, otf, zone, observeCandles[otf]));
          const volRec = volumeForZone(symbol, tf, otf, zone, zoneCandlesByTf[tf], observeCandles[otf]);
          if (volRec) allVolumeRecs.push(volRec);
          const eqLiq = eqLiquidityForZone(symbol, tf, otf, zone, observeCandles[otf], structureLevels[otf]);
          if (eqLiq) allEqLiqRecs.push(eqLiq);
          if (otf === '4H') {
            const sess = sessionForZone(symbol, tf, zone, observeCandles['4H']);
            if (sess) allSessionRecs.push(sess);
          }
        }
      }
      console.log(`  ${symbol} ${tf}: 존 ${zones.length}개 → 이벤트 ${evCount}건`);
    }
  }
  selfChecks.push(checkTransitions('all', allTransitions));
  // 8차 교정 불변식: breakClose 신호는 깨진 존을 거르지 않으므로 그 수가 깨진 존 수와 일치해야 한다.
  // (불일치 = 어딘가에서 미래조건으로 표본이 걸러졌다는 뜻)
  {
    const breakCloseN = allBrokenSignalForwards.filter(r => r.signalKind === 'breakClose').length;
    const failures = breakCloseN === allBrokenZones.length ? [] : [`breakClose ${breakCloseN} ≠ 깨진존 ${allBrokenZones.length}`];
    selfChecks.push({ name: 'breakClose 모집단 = 깨진 존 전수(미래조건 거름 없음)', checked: allBrokenZones.length, failures });
    // 모든 신호의 전방 측정은 신호 다음 봉부터 시작 (forwardBars ≥ 0, lookahead 없음)
    const badFwd = allBrokenSignalForwards.filter(r => r.forwardBars < 0).length;
    selfChecks.push({ name: 'signal forward는 신호 다음 봉부터 (lookahead 없음)', checked: allBrokenSignalForwards.length, failures: badFwd ? [`${badFwd}건 음수 forwardBars`] : [] });
  }

  const date = ANALYSIS_DATE;
  const allBrokenZoneDetails = brokenDetailRecords(allBrokenZones);
  const allControlExcessRows = controlExcessRows(allLevelTrades, allControlLevelTrades);
  const analysisMeta = {
    date,
    cutoffIso: ANALYSIS_CUTOFF_ISO,
    cutoffRule: 'Use candles with open time < cutoffIso; drop last resampled 1W/1M bucket to avoid incomplete HTF candles.',
    symbols: SYMBOLS,
    zoneTfs: ZONE_TFS,
    observeTfs: OBSERVE_TFS,
    dailyBars: DAILY_BARS,
    fourHBars: FOURH_BARS,
    controlSeed: CONTROL_SEED,
  };
  const eventsFile = resolve(OUT_DIR, `events-${date}.json`);
  const pathsFile = resolve(OUT_DIR, `paths-${date}.json`);
  const firstTouchAnatomyFile = resolve(OUT_DIR, `first-touch-anatomy-${date}.json`);
  const postFirstTouchPathFile = resolve(OUT_DIR, `post-first-touch-path-${date}.json`);
  const closeEntriesFile = resolve(OUT_DIR, `close-entries-${date}.json`);
  const sequencesFile = resolve(OUT_DIR, `sequences-${date}.json`);
  const transitionsFile = resolve(OUT_DIR, `transitions-${date}.json`);
  const priorityBehaviorsFile = resolve(OUT_DIR, `priority-behaviors-${date}.json`);
  const preTouchApproachFile = resolve(OUT_DIR, `pre-touch-approach-${date}.json`);
  const remainingBehaviorsFile = resolve(OUT_DIR, `remaining-behaviors-${date}.json`);
  const brokenZonesFile = resolve(OUT_DIR, `broken-zones-${date}.json`);
  const brokenZoneDetailsFile = resolve(OUT_DIR, `broken-zone-details-${date}.json`);
  const brokenStrategyForwardsFile = resolve(OUT_DIR, `broken-strategy-forwards-${date}.json`);
  const brokenSignalForwardsFile = resolve(OUT_DIR, `broken-signal-forwards-${date}.json`);
  const snapshotFile = resolve(OUT_DIR, `analysis-snapshot-${date}.json`);
  const controlExcessFile = resolve(OUT_DIR, `control-excess-${date}.json`);
  writeFileSync(snapshotFile, JSON.stringify({ ...analysisMeta }, null, 2));
  writeFileSync(eventsFile, JSON.stringify({ ...analysisMeta, count: allEvents.length, events: allEvents }, null, 2));
  writeFileSync(pathsFile, JSON.stringify({ date, symbols: SYMBOLS, count: allPaths.length, paths: allPaths }, null, 2));
  writeFileSync(firstTouchAnatomyFile, JSON.stringify({
    ...analysisMeta,
    description: '첫 터치 관측TF 캔들의 꼬리 침투 깊이, 종가 위치, 이후 구조 결과 anatomy 분석',
    penetrationScale: 'direction-normalized: 0=proximal/near edge, 0.5=OB mid or FVG CE, 1=far edge',
    count: allFirstTouchAnatomies.length,
    firstTouchAnatomies: allFirstTouchAnatomies,
  }, null, 2));
  writeFileSync(postFirstTouchPathFile, JSON.stringify({
    ...analysisMeta,
    description: '첫터치 다음 1~5봉과 첫터치 이후 2~5번째 레벨터치의 꼬리/종가/몸통 경로 분석',
    penetrationScale: 'direction-normalized mirror coordinate: -1=mirror far edge, -0.5=mirror CE, 0=near edge, 0.5=CE/mid, 1=far edge',
    count: allPostFirstTouchPaths.length,
    postFirstTouchPaths: allPostFirstTouchPaths,
  }, null, 2));
  writeFileSync(closeEntriesFile, JSON.stringify({ date, symbols: SYMBOLS, count: allCloseEntries.length, closeEntries: allCloseEntries }, null, 2));
  writeFileSync(sequencesFile, JSON.stringify({ date, symbols: SYMBOLS, count: allSequences.length, sequences: allSequences }, null, 2));
  writeFileSync(transitionsFile, JSON.stringify({ date, symbols: SYMBOLS, count: allTransitions.length, transitions: allTransitions }, null, 2));
  writeFileSync(priorityBehaviorsFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    hypotheses: [
      'wick 무효화 vs close 무효화',
      '손절쪽 종가이탈 후 reclaim',
      'mid50/CE acceptance vs rejection',
      'liquidity sweep 후 존 반응',
      'HTF 존 내부 LTF 구조 전환',
    ],
    counts: {
      invalidationBehaviors: allInvalidationBehaviors.length,
      reclaimBehaviors: allReclaimBehaviors.length,
      midAcceptances: allMidAcceptances.length,
      liquiditySweeps: allLiquiditySweeps.length,
      ltfStructures: allLtfStructures.length,
    },
    invalidationBehaviors: allInvalidationBehaviors,
    reclaimBehaviors: allReclaimBehaviors,
    midAcceptances: allMidAcceptances,
    liquiditySweeps: allLiquiditySweeps,
    ltfStructures: allLtfStructures,
  }, null, 2));
  writeFileSync(preTouchApproachFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    description: 'OB/FVG 첫 터치 직전 5/10/20봉 접근 프로파일과 이후 구조 결과',
    count: allPreTouchApproaches.length,
    preTouchApproaches: allPreTouchApproaches,
  }, null, 2));
  writeFileSync(remainingBehaviorsFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    description: '15개 SMC 행동 가설 중 남은 항목 통합 레코드',
    completedHypotheses: [
      '존 수명 / 재테스트 감쇠',
      '존 생성 품질',
      'nested zone',
      'premium / discount 위치',
      '존 폭 / ATR 정규화',
      '시간 기반 decay',
      '존 내부 체류 시간',
      '반응 후 목표 유동성까지 거리',
      'BTC 동조 필터',
    ],
    count: allRemainingBehaviors.length,
    remainingBehaviors: allRemainingBehaviors,
  }, null, 2));
  writeFileSync(brokenZonesFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    description: '손절쪽 종가이탈 이후 broken-zone retest / reclaim / polarity flip 분석',
    hypotheses: [
      'broken OB/FVG retest',
      'failed reclaim',
      'true reclaim',
      'polarity flip',
      'FVG fill-complete continuation',
    ],
    count: allBrokenZones.length,
    brokenZones: allBrokenZones,
  }, null, 2));
  writeFileSync(brokenZoneDetailsFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    description: 'broken-zone raw를 정밀 상태 조건으로 재분류한 파생 레코드',
    conditions: [
      '이탈 후 재진입 속도',
      '재진입 후 회복 깊이',
      '재진입 후 재이탈 속도',
      'continuation 선행 여부',
      '존TF별 broken retest / true reclaim 차이',
      'FVG fill 상태별 continuation',
    ],
    count: allBrokenZoneDetails.length,
    brokenZoneDetails: allBrokenZoneDetails,
  }, null, 2));
  writeFileSync(brokenStrategyForwardsFile, JSON.stringify({
    date,
    symbols: SYMBOLS,
    description: 'broken-zone 전략 후보 발생 이후 상태 결과 분석',
    notes: [
      'continuation 0.5/1/2존폭은 wick 도달 기준',
      '재진입 재발과 근단 밖 회복은 종가 기준',
      '후보 발생 봉 다음 봉부터 관측해 signal candle 내부 순서 lookahead를 줄임',
    ],
    count: allBrokenStrategyForwards.length,
    brokenStrategyForwards: allBrokenStrategyForwards,
  }, null, 2));
  writeFileSync(brokenSignalForwardsFile, JSON.stringify({
    ...analysisMeta,
    description: '8차 교정 — 관측 가능 결정시점(breakClose/rebreakClose/trueReclaimClose) 기반 broken-zone forward. 미래라벨 조건화 제거.',
    notes: [
      'breakClose 모집단 = 손절쪽 종가이탈한 모든 존 (거르지 않음)',
      '각 신호는 그 다음 봉부터만 측정 — lookahead 없음',
      'continuation은 wick·close 두 기준 병기 (close가 보수적 진입 가능 엣지)',
    ],
    count: allBrokenSignalForwards.length,
    brokenSignalForwards: allBrokenSignalForwards,
  }, null, 2));
  writeFileSync(controlExcessFile, JSON.stringify({
    ...analysisMeta,
    description: '백테스트 전 최종 체크 — 실제 존 기대값에서 같은 조건의 무작위 통제 존 기대값을 뺀 초과엣지',
    count: allControlExcessRows.length,
    controlExcessRows: allControlExcessRows,
  }, null, 2));
  const report = buildReport(allEvents)
    + buildTradeReport(allTrades)
    + buildLevelReport(allLevelTrades)
    + buildMatrixReport(allLevelTrades)
    + buildConfluenceReport(allLevelTrades, allPaths)
    + buildSequenceReport(allSequences)
    + buildRegimeReport(allLevelTrades, allPaths)
    + buildTransitionReport(allTransitions)
    + buildZoneEpisodeBehaviorReport(allCloseEntries)
    + buildPriorityBehaviorReport(allInvalidationBehaviors, allReclaimBehaviors, allMidAcceptances, allLiquiditySweeps, allLtfStructures)
    + buildPreTouchApproachReport(allPreTouchApproaches)
    + buildRemainingSmcBehaviorReport(allRemainingBehaviors)
    + buildBrokenZoneReport(allBrokenZones)
    + buildBrokenZoneDetailReport(allBrokenZoneDetails)
    + buildBrokenSignalForwardReport(allBrokenSignalForwards)
    + buildBrokenStrategyForwardReport(allBrokenStrategyForwards)
    + buildControlReport(allEvents, allControlEvents)
    + buildControl4hReport(allLevelTrades, allControlLevelTrades)
    + buildControlExcessReport(allControlExcessRows)
    + buildVolumeReport(allVolumeRecs)
    + buildSessionReport(allSessionRecs)
    + buildEqLiqReport(allEqLiqRecs)
    + buildDeepDiveReport(allLevelTrades, allMidAcceptances)
    + buildCloseEntryReport(allCloseEntries)
    + buildPathReport(allPaths)
    + buildFirstTouchAnatomyReport(allFirstTouchAnatomies, allPostFirstTouchPaths)
    + buildSelfCheckReport(selfChecks);
  writeFileSync(resolve(OUT_DIR, 'REPORT.md'), report);
  console.log(`\n총 이벤트 ${allEvents.length}건, 트레이드 ${allTrades.length}건, 레벨트레이드 ${allLevelTrades.length}건, 경로 ${allPaths.length}건, 첫터치 anatomy ${allFirstTouchAnatomies.length}건, 첫터치이후경로 ${allPostFirstTouchPaths.length}건, 종가진입 ${allCloseEntries.length}건, 시퀀스 ${allSequences.length}건, 전이 ${allTransitions.length}건, 우선행동 ${allInvalidationBehaviors.length + allReclaimBehaviors.length + allMidAcceptances.length + allLiquiditySweeps.length + allLtfStructures.length}건, 터치전접근 ${allPreTouchApproaches.length}건, 나머지행동 ${allRemainingBehaviors.length}건, 깨진존 ${allBrokenZones.length}건, 깨진존정밀 ${allBrokenZoneDetails.length}건, 깨진존전략이후 ${allBrokenStrategyForwards.length}건`);
  console.log(`raw: ${eventsFile}`);
  console.log(`paths: ${pathsFile}`);
  console.log(`first touch anatomy: ${firstTouchAnatomyFile}`);
  console.log(`post first touch path: ${postFirstTouchPathFile}`);
  console.log(`close entries: ${closeEntriesFile}`);
  console.log(`sequences: ${sequencesFile}`);
  console.log(`transitions: ${transitionsFile}`);
  console.log(`priority behaviors: ${priorityBehaviorsFile}`);
  console.log(`pre-touch approach: ${preTouchApproachFile}`);
  console.log(`remaining behaviors: ${remainingBehaviorsFile}`);
  console.log(`broken zones: ${brokenZonesFile}`);
  console.log(`broken zone details: ${brokenZoneDetailsFile}`);
  console.log(`broken strategy forwards: ${brokenStrategyForwardsFile}`);
  console.log(`broken signal forwards(8차 교정): ${brokenSignalForwardsFile} (${allBrokenSignalForwards.length}건)`);
  console.log(`control excess: ${controlExcessFile} (${allControlExcessRows.length}건)`);
  console.log(`snapshot: ${snapshotFile}`);
  console.log(`리포트: ${resolve(OUT_DIR, 'REPORT.md')}`);
}

main();
