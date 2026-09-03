// 하모닉 실시간 엔진 — frontend/src/utils/backtestEngine.ts 의 runHarmonicBacktest 를
// 단일 타임프레임 캔들 마감 이벤트로 그대로 재현한다.
//
// 백테스트와의 정합성 원칙:
//  - 피벗 스캔 길이 6종 [55,34,21,13,8,5] (백테스트 scanLengths 동일)
//  - predictHarmonicPatterns: 프론트 원본과 동일(SL 캡을 내부에서 적용하지 않음)
//  - 진입: immediate=존 터치 즉시 / close=종가 존 안착
//  - Gartley/Crab 품질 필터 + 전패턴 SL폭 15% 캡
//  - 실행 SL: 패턴 SL과 가격 하드캡(harmonicSlCapPct, 기본 1%) 중 가까운 쪽
//  - TP1 부분익절 → 본절스탑 이동, TP2/타임아웃 청산
//  - 진입/청산을 동일 타임프레임 캔들 시퀀스에서 추적(백테스트 j-loop 1:1)
import { EventEmitter } from 'events';
import type { Candle } from './candle-feed.ts';
import type { EntrySignal, ExitSignal } from './signal-engine.ts';

// ── 타입 ──────────────────────────────────────────────────
// 감지 로직·타입은 공유 엔진(shared/)에서 가져온다. 복사본 금지.
import { predictHarmonicPatterns, harmonicEntryPrice, type EmergingHarmonicResult } from '../../../../../shared/harmonic.ts';
import { getPivots } from '../../../../../shared/pivots.ts';

export interface HarmonicEngineParams {
  harmonicEntryMode: 'immediate' | 'close';  // 신호(arming) 트리거: PRZ터치 / 존안 종가. 실제 체결은 entryDepth 라인.
  harmonicTp1Pct: number;
  harmonicTp2Pct: number;
  harmonicMoveStopToBreakeven: boolean;
  harmonicSlCapPct: number;
  harmonicEnabledPatterns: string[];
  maxHoldCandles: number;
  longOnly: boolean;
  harmonicLogScale: boolean;
  harmonicEntryDepth: number;                // 진입 깊이 0~1 (0=D점, 0.5=D~SL 중간) — 백테스트와 동일 규칙
  harmonicRegimeSmaPeriod: number;           // 레짐 게이트: 직전 마감 1D 종가 vs SMA(N) 순방향만 arming (0=끔, H-R50=50)
}

export const DEFAULT_HARMONIC_PARAMS: HarmonicEngineParams = {
  harmonicEntryMode: 'immediate',
  harmonicTp1Pct: 50,
  harmonicTp2Pct: 50,
  harmonicMoveStopToBreakeven: true,
  harmonicSlCapPct: 10.0,
  harmonicEnabledPatterns: [],
  maxHoldCandles: 100,
  longOnly: false,
  harmonicLogScale: true,
  harmonicEntryDepth: 0.5,
  harmonicRegimeSmaPeriod: 0,
};

export type HarmonicEngineInterval = '30m' | '1h' | '4h' | '1d';
const INTERVAL_SEC: Record<HarmonicEngineInterval, number> = {
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};
// 백테스트 scanLengths 동일.
const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
// 거래당 SL폭 상한(진입가↔패턴SL 거리). 백테스트와 동일.
const MAX_SL_WIDTH_PCT = 15;
// 심볼당 동시 추적 셋업 수 = 1.
// 실거래 동시포지션 한도는 "봇(botTarget)당 N개"로 워커(tryEntry)가 종목을 가로질러 관리하고,
// config(=종목)는 activeEntry 단일이라 종목당 1포지션이다. 따라서 엔진도 종목당 최선 셋업 1개만 추적한다.
// (백테스트는 심볼당 4동시였으나, 실거래 한도는 봇당이라 이 값과 무관하게 워커에서 결정된다.)
const MAX_CONCURRENT = 1;
// 차트 비교 기준과 동일하게 1200봉만 본다.
const BUF_MAX = 1200;
const DISPLAY_DONE_MAX = 200;
// 레짐 게이트용 마감 1D 버퍼 상한 (SMA50 + 여유)
const DAY_SEC = 86400;
const DAILY_BUF_MAX = 400;

interface ActiveTracker {
  id: number;              // 고유 식별자(=ob.time, 워커 heldKey 매칭용)
  symbol: string;
  isBullish: boolean;
  patternName: string;
  family: string;
  attemptKey: string;
  xabcKey: string;
  przPrice: number;
  entryPrice: number;
  cappedSlPrice: number;   // 실행 손절가(가격 하드캡 적용)
  cappedSlPct: number;
  tp1Price: number;
  tp2Price: number;
  tp1Hit: boolean;
  holdCount: number;       // 체결(0.5터치) 이후 경과 봉 수
  signalTime: number;      // D(PRZ) 터치 = 신호 발생 시각
  entryTime: number;       // 0.5 라인 터치 = 체결 시각(미체결이면 0)
  filled: boolean;         // 0.5 진입라인 터치 여부(신호→체결 전환)
  points: Xabc;            // XABC 각 점 시간·가격(모니터링 표시용)
  regimeAtArm: 'up' | 'down' | 'na' | null; // arming 시점 레짐(게이트 미사용 시 null) — F4 태깅용
}

// XABC 4점 (시간·가격) — 모니터링 카드 표시용
interface Xabc {
  X: { time: number; price: number };
  A: { time: number; price: number };
  B: { time: number; price: number };
  C: { time: number; price: number };
}
function xabcOf(p: EmergingHarmonicResult): Xabc {
  const { X, A, B, C } = p.points;
  return {
    X: { time: Number(X.time), price: X.price },
    A: { time: Number(A.time), price: A.price },
    B: { time: Number(B.time), price: B.price },
    C: { time: Number(C.time), price: C.price },
  };
}

// 탐색(아직 PRZ 미터치) 중인 유효 예측 패턴 — 시각화 전용. 매 봉마다 재계산된다.
interface WatchItem {
  id: number;              // attemptKey 기반 안정 식별자(UI 키)
  symbol: string;
  isBullish: boolean;
  patternName: string;
  przPrice: number;        // 목표 PRZ
  entryPrice: number;      // 터치 시 진입 예정가
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  cTime: number;           // C점 형성 시간(=포착 시간 표시용)
  points: Xabc;            // XABC 각 점 시간·가격
  touched?: boolean;       // PRZ 터치됨(차트 isPrzTouched와 일치) — 표시 시 phase 'signal'
  signalTime?: number;     // 터치(신호) 발생 시각 — 차트 D점 좌표용
}

type DisplayPhase = 'signal' | 'active' | 'done';
type DisplayExitReason = 'sl' | 'tp1' | 'tp2' | 'cancelled';

interface DisplayTracker {
  signature: string;
  symbol: string;
  type: 'bull' | 'bear';
  isBullish: boolean;
  phase: DisplayPhase;
  kind: 'emerging';
  patternName: string;
  mid: number;
  entryPrice: number;
  przPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  obTime: number;
  cTime: number;
  przHitTime?: number;
  entryTime?: number;
  exitReason?: DisplayExitReason;
  exitPrice?: number;
  exitTime?: number;
  holdCount: number;
  filled: boolean;
  tp1Hit: boolean;
  xabc: Xabc;
}

// 문자열 → 안정적 양의 정수 해시(트래커 obTime 충돌 회피용)
function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── 백테스트 헬퍼(동일) ───────────────────────────────────
function getPatternFamilyName(p: EmergingHarmonicResult): string {
  return p.name.replace(/^Bullish\s+|^Bearish\s+/, '').replace(/\s+\(Emerging\)$/, '');
}

function harmonicTargets(p: EmergingHarmonicResult, isLog = false): { tp1: number; tp2: number } {
  const { A, C } = p.points;
  const d = p.przPrice;
  const family = getPatternFamilyName(p);
  const target = (base: number, from: number, ratio: number) => {
    return isLog ? Math.exp(Math.log(base) + (Math.log(from) - Math.log(d)) * ratio) : base + (from - d) * ratio;
  };
  if (family === 'Cypher') return { tp1: target(d, C.price, 0.382), tp2: target(d, C.price, 0.618) };
  if (family === 'Shark') return { tp1: target(d, C.price, 0.5), tp2: target(d, C.price, 0.886) };
  if (family === '5-0') return { tp1: C.price, tp2: target(d, C.price, 1.272) };
  return { tp1: target(d, A.price, 0.382), tp2: target(d, A.price, 0.618) };
}

function harmonicXabcKey(p: EmergingHarmonicResult): string {
  const { X, A, B, C } = p.points;
  return `${X.time}_${A.time}_${B.time}_${C.time}_${p.isBullish}`;
}

function harmonicAttemptKey(p: EmergingHarmonicResult): string {
  return `${harmonicXabcKey(p)}_${p.name}_${p.przPrice.toPrecision(8)}`;
}

// ── 엔진 ──────────────────────────────────────────────────
export class HarmonicEngine extends EventEmitter {
  private p: HarmonicEngineParams;
  private interval: HarmonicEngineInterval;
  private bufs = new Map<string, Candle[]>();           // 심볼별 캔들 버퍼
  private trackers: ActiveTracker[] = [];               // 보유 셋업
  private tradedKeys = new Set<string>();               // 진입 시도한 attemptKey
  private closedXabcKeys = new Set<string>();           // tp/timeout 청산된 XABC
  private watching = new Map<string, WatchItem[]>();    // 심볼별 탐색 중(미터치) 패턴 — 시각화용
  private completedTrackers: (ActiveTracker & { exitReason: string; exitPrice: number; exitTime: number })[] = []; // 완료 내역
  private displayTrackers = new Map<string, DisplayTracker>(); // 차트 스냅샷 기반 표시 생명주기
  private displayDone = new Map<string, DisplayTracker>();     // SL/TP/폐기 보존 표시
  private idSeq = 0;
  private eqWarned = false;
  private warmupMode = false;
  private daily = new Map<string, Candle[]>();          // 심볼별 마감 1D 캔들(오름차순) — 레짐 게이트용
  private regimeBlockedCount = 0;                       // 레짐 게이트로 차단된 arming 누계

  setWarmupMode(on: boolean) {
    this.warmupMode = on;
  }

  constructor(params: Partial<HarmonicEngineParams> = {}, interval: HarmonicEngineInterval = '4h') {
    super();
    this.p = { ...DEFAULT_HARMONIC_PARAMS, ...params };
    this.interval = interval;
    if ((params as any).harmonicUseEqFilter) {
      // 상위TF EQ 컨플루언스는 단일 피드에선 재현 불가 → PRZ 단독으로만 동작.
      console.warn(`[HarmonicEngine] ⚠️ harmonicUseEqFilter=true 는 실시간(${interval} 단일)에서 미지원 — PRZ 단독으로 동작합니다.`);
    }
  }

  feed(candle: Candle): void {
    const sym = candle.symbol.toUpperCase();

    // 1m 캔들(미완성 포함 실시간 틱) - 탐색 중인 패턴(watchItems)의 무효화 및 실시간 청산(SL/TP) 정확도 보정
    if (candle.interval === '1m' || candle.interval === 'ticker') {
      const items = this.watching.get(sym);
      if (items && items.length > 0) {
        const c = candle;
        const validItems = items.filter(w => {
          const C_price = w.points.C.price;
          if (w.isBullish) {
            if (c.low <= w.slPrice || c.high > C_price || c.low <= w.przPrice) return false;
          } else {
            if (c.high >= w.slPrice || c.low < C_price || c.high >= w.przPrice) return false;
          }
          return true;
        });
        if (validItems.length !== items.length) {
          this.watching.set(sym, validItems);
        }
      }

      // 실시간 1m/ticker 로 기존 보유 셋업(trackers) 청산 판정 (꼬리 안에서 TP가 먼저 닿았는지 정확하게 판정)
      for (let i = this.trackers.length - 1; i >= 0; i--) {
        const t = this.trackers[i];
        if (t.symbol !== sym) continue;
        this.processLaterCandle(t, candle);
      }

      // 모니터링 표시용 청산 판정 동일 수행
      for (const [signature, tracker] of [...this.displayTrackers.entries()]) {
        if (tracker.symbol !== sym) continue;
        this.processDisplayTracker(tracker, candle);
      }
      return; // 1m/ticker 캔들은 메인 엔진 사이클(buf 저장 및 신규 스캔)에는 들어가지 않음
    }

    if (!candle.isClosed) return;
    // 레짐 게이트용 마감 1D 수집 — 메인 interval과 무관하게 항상 흡수 (1d 엔진이면 아래 메인 처리도 계속)
    if (candle.interval === '1d' && this.p.harmonicRegimeSmaPeriod > 0) this.pushDaily(sym, candle);
    if (candle.interval !== this.interval) return;

    let buf = this.bufs.get(sym);
    if (!buf) { buf = []; this.bufs.set(sym, buf); }
    buf.push(candle);
    if (buf.length > BUF_MAX) buf.shift();

    // 1) 기존 보유 셋업을 이 캔들로 갱신(청산 판정)
    for (let i = this.trackers.length - 1; i >= 0; i--) {
      const t = this.trackers[i];
      if (t.symbol !== sym) continue;
      this.processLaterCandle(t, candle);
    }
    // 2) 이 캔들에서 신규 진입 스캔
    this.scanForEntries(sym, candle, buf);
    // 3) 모니터링 표시용 생명주기 갱신(차트 스냅샷 기준, 주문과 분리)
    this.updateDisplayLifecycle(sym, candle, buf);
  }

  private pushDaily(sym: string, c: Candle): void {
    let arr = this.daily.get(sym);
    if (!arr) { arr = []; this.daily.set(sym, arr); }
    const last = arr[arr.length - 1];
    if (last && last.time === c.time) { arr[arr.length - 1] = c; return; } // 같은 봉 재수신 → 교체
    if (last && c.time < last.time) return;                                // 역순 유입 무시(웜업은 정렬 주입)
    arr.push(c);
    if (arr.length > DAILY_BUF_MAX) arr.shift();
  }

  // t 이전에 마감(open+1일 ≤ t)된 마지막 일봉의 종가 vs SMA(period).
  // 백테스트 buildRegime(harmonic-regime.ts)과 동일 규칙 — 진행 중 일봉은 절대 안 씀(룩어헤드 제로).
  regimeAt(sym: string, t: number): 'up' | 'down' | 'na' {
    const period = this.p.harmonicRegimeSmaPeriod;
    const arr = this.daily.get(sym.toUpperCase());
    if (!period || !arr || arr.length === 0) return 'na';
    let lo = 0, hi = arr.length - 1, idx = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (arr[m].time + DAY_SEC <= t) { idx = m; lo = m + 1; } else hi = m - 1;
    }
    if (idx < period - 1) return 'na';
    let sum = 0;
    for (let i = idx - period + 1; i <= idx; i++) sum += arr[i].close;
    return arr[idx].close > sum / period ? 'up' : 'down';
  }

  /** 웜업 시 1D 히스토리 주입이 필요한지 (레짐 게이트 사용 여부). warmup.ts에서 호출. */
  needsDailyCandles(): boolean {
    return this.p.harmonicRegimeSmaPeriod > 0;
  }

  // 보유 셋업의 청산 판정(백테스트 j-loop 1봉분). 진입 후 캔들에서만 호출.
  private processLaterCandle(t: ActiveTracker, c: Candle): void {
    const moveStop = this.p.harmonicMoveStopToBreakeven;
    const tp2Weight = this.tp2Weight();

    // ── 신호(미체결) 단계: 0.5 진입라인 터치 대기 ──
    if (!t.filled) {
      // 레짐 재체크(체결 전) — 대기 중 일봉이 갱신돼 레짐이 뒤집히면 신호 폐기(지정가 회수와 등가).
      // 백테스트(own50 = entryTime 기준)와 정합 목적: arming 후 체결 전 레짐 플립 매매를 걸러낸다.
      if (this.p.harmonicRegimeSmaPeriod > 0 && c.isClosed && c.interval === this.interval) {
        const r = this.regimeAt(t.symbol, c.time);
        if (t.isBullish ? r !== 'up' : r !== 'down') {
          this.regimeBlockedCount++;
          if (!this.warmupMode) console.log(`[HarmonicEngine] ⛔ 레짐 플립 — 대기신호 폐기 | ${t.symbol} ${t.patternName} ${t.isBullish ? 'bull' : 'bear'} vs regime=${r}`);
          this.finish(t, 'cancelled', c.close, c.time);
          return;
        }
      }
      const fillHit = t.isBullish ? c.low <= t.entryPrice : c.high >= t.entryPrice;
      if (fillHit) {
        t.filled = true;
        t.entryTime = c.time;
        if (!this.warmupMode) console.log(`[HarmonicEngine] ✅ 체결 | ${t.symbol} ${t.patternName} @ ${t.entryPrice.toFixed(4)}`);
        this.emit('entry', this.buildSignal(t, c.time)); // 실제 진입 주문은 여기서
        // 체결 캔들에서 바로 청산까지 갈 수 있으므로 아래 청산 로직 계속 진행
      } else {
        // 0.5 닿기 전 TP1 먼저 도달 → 신호 폐기(거래 미발생)
        const tp1Reached = t.isBullish ? c.high >= t.tp1Price : c.low <= t.tp1Price;
        if (tp1Reached) { this.finish(t, 'cancelled', t.tp1Price, c.time); return; }
        return; // 아직 신호 상태 유지(시간만료 없음)
      }
    }

    // ── 체결 이후 청산 판정 ──
    const isMainIntervalClose = c.isClosed && c.interval === this.interval;
    if (isMainIntervalClose) {
      t.holdCount++;
    }
    const activeSl = moveStop && t.tp1Hit ? t.entryPrice : t.cappedSlPrice;

    const slHit = t.isBullish ? c.low <= activeSl : c.high >= activeSl;
    if (slHit) {
      const isBreakEven = Math.abs(activeSl - t.entryPrice) / t.entryPrice < 0.0001; // 대략 진입가 근처면 본절
      this.emitExit(t, 'sl1', activeSl, c.time);
      // TP1 달성 후 본절 마감은 사용자 시점에서 'TP1 익절'로 간주
      if (t.tp1Hit && isBreakEven) {
        this.finish(t, 'tp1', t.tp1Price, c.time);
      } else {
        this.finish(t, 'sl1', activeSl, c.time);
      }
      return;
    }

    // TP1 도달 → 부분익절 + 본절스탑 이동 (tp2 비중 0이면 전량 익절)
    if (!t.tp1Hit) {
      const tp1Reached = t.isBullish ? c.high >= t.tp1Price : c.low <= t.tp1Price;
      if (tp1Reached) {
        if (tp2Weight === 0) { this.emitExit(t, 'tp', t.tp1Price, c.time); this.finish(t, 'tp1', t.tp1Price, c.time); return; }
        t.tp1Hit = this.tp1Weight() > 0;
        if (t.tp1Hit) {
          // 부분청산 신호: ob.mid 에 잔여물량 새 손절가(본절=진입가 또는 기존 캡)를 실어 보낸다.
          this.emitExit(t, 'tp1', t.tp1Price, c.time, moveStop ? t.entryPrice : t.cappedSlPrice);
        }
      }
    }

    // TP2 도달 → 전량 익절
    if (tp2Weight > 0) {
      const tp2Reached = t.isBullish ? c.high >= t.tp2Price : c.low <= t.tp2Price;
      if (tp2Reached) { this.emitExit(t, 'tp', t.tp2Price, c.time); this.finish(t, 'tp2', t.tp2Price, c.time); return; }
    }

    // 타임아웃
    if (isMainIntervalClose && t.holdCount >= this.p.maxHoldCandles) {
      this.emitExit(t, 'timeout', c.close, c.time); this.finish(t, 'timeout', c.close, c.time);
    }
  }

  private scanForEntries(sym: string, c: Candle, buf: Candle[]): void {
    const currentPrice = c.close;
    const currentTime = c.time;
    const entryMode = this.p.harmonicEntryMode;

    const isLog = this.p.harmonicLogScale === true;

    // 피벗 스캔 6종 → 예측 패턴 수집
    const predictions: EmergingHarmonicResult[] = [];
    for (const len of SCAN_LENGTHS) {
      if (buf.length <= len * 2) continue;
      const pivots = getPivots(buf, len, 'wick');
      predictions.push(...predictHarmonicPatterns(pivots, currentPrice, isLog, buf));
    }
    const enabled = new Set(this.p.harmonicEnabledPatterns ?? []);
    const usePatternFilter = enabled.size > 0;
    // 레짐 게이트: 이 캔들 시점의 직전 마감 1D 기준 up/down/na (캔들당 1회 평가)
    const regime = this.p.harmonicRegimeSmaPeriod > 0 ? this.regimeAt(sym, currentTime) : null;
    let regimeBlockedThisScan = 0;
    const seenAtCandle = new Set<string>();
    const seenCTimeName = new Set<string>(); // C점 기반 중복 제거
    const candidates: Array<{
      pattern: EmergingHarmonicResult;
      attemptKey: string; xabcKey: string;
      isBullish: boolean; family: string;
      entryPrice: number; tp1: number; tp2: number; slPrice: number;
    }> = [];
    const watchItems: WatchItem[] = [];  // 필터 통과했으나 아직 PRZ 미터치 → 탐색 표시용

    for (const pattern of predictions) {
      const family = getPatternFamilyName(pattern);
      if (usePatternFilter && !enabled.has(family)) continue;

      // 동일 X, A, B, C + 동일 패턴명 중복 방지 (프론트 차트와 동일 로직)
      const xabcTimeNameKey = `${pattern.points.X.time}_${pattern.points.A.time}_${pattern.points.B.time}_${pattern.points.C.time}_${pattern.name}_${pattern.isBullish}`;
      if (seenCTimeName.has(xabcTimeNameKey)) continue;
      seenCTimeName.add(xabcTimeNameKey);

      const xabcKey = harmonicXabcKey(pattern);
      const attemptKey = harmonicAttemptKey(pattern);
      // 이미 진입했거나(active=tradedKeys) tp/timeout 종결된 셋업은 탐색·진입 모두 제외
      if (this.closedXabcKeys.has(xabcKey) || seenAtCandle.has(attemptKey) || this.tradedKeys.has(attemptKey)) continue;
      seenAtCandle.add(attemptKey);

      // EQ 필터는 단일 피드에서 미지원 → PRZ 단독(zone = przMin..przMax)
      const zoneLow = pattern.przMin;
      const zoneHigh = pattern.przMax;

      // ── 품질 필터를 먼저 적용 → 통과한 것만 탐색/진입 후보 ──
      // ── Gartley 전용 품질 필터 (AB=CD만, BC 미사용) ──
      if (family === 'Gartley') {
        const barSec = INTERVAL_SEC[this.interval];
        const abBars = (Number(pattern.points.B.time) - Number(pattern.points.A.time)) / barSec;
        const cdBars = (currentTime - Number(pattern.points.C.time)) / barSec;
        if (abBars > 0 && cdBars / abBars < 0.8) continue;
        if (pattern.xcXaRatio !== undefined && pattern.xcXaRatio >= 0.5 && pattern.xcXaRatio < 0.6) continue;
        if (pattern.abcdRatio !== undefined && (pattern.abcdRatio < 0.5 || pattern.abcdRatio > 1.1)) continue;
      }
      // ── Crab 전용 필수 조건: AB=CD 1.272 이상 ──
      if (family === 'Crab') {
        if (pattern.abcdRatio === undefined || pattern.abcdRatio < 1.272) continue;
      }

      const isBullish = pattern.isBullish;
      if (this.p.longOnly && !isBullish) continue;

      // 레짐 게이트(H-R50 own50): bull=up에서만 / bear=down에서만 arming. na(SMA 미충족)도 차단.
      if (regime !== null && (isBullish ? regime !== 'up' : regime !== 'down')) {
        regimeBlockedThisScan++;
        this.regimeBlockedCount++;
        continue;
      }

      const slPrice = pattern.slPrice;
      // 신호는 PRZ 영역(przMin~przMax = D~SL) 터치로 발생하되,
      // 실제 체결은 D→SL 방향 entryDepth 보간 라인 — 백테스트와 동일 규칙(shared 단일 정의).
      const entryPrice = harmonicEntryPrice(pattern.przPrice, slPrice, this.p.harmonicEntryDepth ?? 0.5, isLog);
      const { tp1, tp2 } = harmonicTargets(pattern, isLog);

      if (entryPrice <= 0 || tp1 <= 0 || tp2 <= 0 || slPrice <= 0) continue;
      if (isBullish && (tp1 <= entryPrice || tp2 <= entryPrice || slPrice >= entryPrice)) continue;
      if (!isBullish && (tp1 >= entryPrice || tp2 >= entryPrice || slPrice <= entryPrice)) continue;

      // SL폭 상한: 진입가↔패턴SL 15% 이상 셋업 제외
      const slPctAbs = Math.abs(entryPrice - slPrice) / entryPrice * 100;
      if (slPctAbs >= MAX_SL_WIDTH_PCT) continue;

      // ── 존 터치 여부로 진입 후보 vs 탐색(미터치) 분기 ──
      const touchedZone = c.high >= zoneLow && c.low <= zoneHigh;
      const closedInZone = c.close >= zoneLow && c.close <= zoneHigh;
      const liveTouch = entryMode === 'immediate' ? touchedZone : closedInZone; // 현재 봉 터치
      // 차트(predictHarmonicPatterns)와 동일 기준: 과거에 PRZ 터치한 패턴도 신호로 인정
      const shouldEnter = liveTouch || pattern.isPrzTouched === true;
      if (shouldEnter) {
        candidates.push({ pattern, attemptKey, xabcKey, isBullish, family, entryPrice, tp1, tp2, slPrice });
      } else {
        watchItems.push({
          id: hashId(attemptKey), symbol: sym, isBullish, patternName: pattern.name,
          przPrice: pattern.przPrice, entryPrice, slPrice, tp1Price: tp1, tp2Price: tp2,
          cTime: Number(pattern.points.C.time), points: xabcOf(pattern),
        });
      }
    }

    // 탐색 뷰(미터치) — PRZ 근접 순 상위 8개
    watchItems.sort((a, b) => Math.abs(currentPrice - a.przPrice) - Math.abs(currentPrice - b.przPrice));
    const displayItems: WatchItem[] = watchItems.slice(0, 8);

    if (candidates.length > 0) {
      // PRZ 근접 순 — 슬롯(MAX_CONCURRENT)은 "실제 진입"에만 적용. 표시는 슬롯과 무관.
      candidates.sort((a, b) =>
        Math.abs(currentPrice - a.pattern.przPrice) - Math.abs(currentPrice - b.pattern.przPrice));
      const activeCount = this.trackers.filter(t => t.symbol === sym).length;
      const available = Math.max(0, MAX_CONCURRENT - activeCount);
      const armedKeys = new Set<string>();

      for (const sel of candidates.slice(0, available)) {
        // 손절은 패턴 SL을 그대로 사용한다. (가격 기반 하드캡 harmonicSlCapPct 제거)
        const cappedSlPrice = sel.slPrice;
        const cappedSlPct = Math.abs(sel.entryPrice - sel.slPrice) / sel.entryPrice * 100;

        const t: ActiveTracker = {
          id: ++this.idSeq,
          symbol: sym,
          isBullish: sel.isBullish,
          patternName: sel.pattern.name,
          family: sel.family,
          attemptKey: sel.attemptKey,
          xabcKey: sel.xabcKey,
          przPrice: sel.pattern.przPrice,
          entryPrice: sel.entryPrice,
          cappedSlPrice,
          cappedSlPct,
          tp1Price: sel.tp1,
          tp2Price: sel.tp2,
          tp1Hit: false,
          holdCount: 0,
          signalTime: Number(sel.pattern.przTouchedTime ?? currentTime), // 차트 D점 좌표와 일치
          entryTime: 0,           // 0.5 터치 시 채워짐
          filled: false,
          points: xabcOf(sel.pattern),
          regimeAtArm: regime,
        };
        this.trackers.push(t);
        this.tradedKeys.add(sel.attemptKey);
        armedKeys.add(sel.attemptKey);

        if (!this.warmupMode) console.log(`[HarmonicEngine] 🔔 신호 발생 | ${sym} ${sel.pattern.name} | 체결대기(0.5)≈${sel.entryPrice.toFixed(4)} SL=${cappedSlPrice.toFixed(4)}(${cappedSlPct.toFixed(2)}%) TP1=${sel.tp1.toFixed(4)} TP2=${sel.tp2.toFixed(4)}`);
        // 신호(arming)만 통지 — 실제 진입('entry')은 0.5 터치 시 processLaterCandle에서 발생
        this.emit('signal', this.buildSignal(t, currentTime));

        // 진입 캔들에서 즉시 SL 이탈 여부만 확인(백테스트 j=entryIdx, TP는 다음 봉부터)
        const slHit = t.isBullish ? c.low <= t.cappedSlPrice : c.high >= t.cappedSlPrice;
        if (slHit) { this.emitExit(t, 'sl1', t.cappedSlPrice, c.time); this.finish(t, 'sl1', t.cappedSlPrice, c.time); }
      }

      // 터치됐지만 슬롯에서 빠진 후보 → 신호 "표시용"으로 노출(차트와 일치, 실제 진입 아님).
      // tradedKeys에 넣지 않으므로 슬롯이 비면 다음 봉에 arming 가능.
      for (const sel of candidates) {
        if (armedKeys.has(sel.attemptKey)) continue;
        displayItems.push({
          id: hashId(sel.attemptKey), symbol: sym, isBullish: sel.isBullish, patternName: sel.pattern.name,
          przPrice: sel.pattern.przPrice, entryPrice: sel.entryPrice, slPrice: sel.slPrice,
          tp1Price: sel.tp1, tp2Price: sel.tp2, cTime: Number(sel.pattern.points.C.time),
          points: xabcOf(sel.pattern), touched: true,
          signalTime: Number(sel.pattern.przTouchedTime ?? currentTime),
        });
      }
    }

    if (regimeBlockedThisScan > 0 && !this.warmupMode) {
      console.log(`[HarmonicEngine] ⛔ 레짐게이트(SMA${this.p.harmonicRegimeSmaPeriod}) | ${sym} regime=${regime} 역방향 ${regimeBlockedThisScan}건 차단`);
    }

    this.watching.set(sym, displayItems);
  }

  private tp1Weight(): number {
    const w1 = Math.max(0, Math.min(1, this.p.harmonicTp1Pct / 100));
    const w2 = Math.max(0, Math.min(1, this.p.harmonicTp2Pct / 100));
    return (w1 + w2) > 0 ? w1 / (w1 + w2) : 0;
  }
  private tp2Weight(): number {
    const w1 = Math.max(0, Math.min(1, this.p.harmonicTp1Pct / 100));
    const w2 = Math.max(0, Math.min(1, this.p.harmonicTp2Pct / 100));
    return (w1 + w2) > 0 ? w2 / (w1 + w2) : 0;
  }

  private finish(t: ActiveTracker, reason: string, exitPrice: number, exitTime: number): void {
    this.closedXabcKeys.add(t.xabcKey);
    const idx = this.trackers.indexOf(t);
    if (idx >= 0) {
      this.trackers.splice(idx, 1);
      const closed = { ...t, exitReason: reason, exitPrice, exitTime };
      this.completedTrackers.push(closed);
      if (this.completedTrackers.length > 50) {
        this.completedTrackers.shift(); // 최대 50개 유지
      }
    }
  }

  private buildSignal(t: ActiveTracker, time: number): EntrySignal {
    const ob = {
      symbol: t.symbol,
      time: t.id,                       // SignalEngine.key 매칭용 고유값
      high: t.entryPrice,
      low: t.entryPrice,
      mid: t.entryPrice,
      type: t.isBullish ? 'bull' : 'bear' as const,
    };
    const tpPct = Math.abs(t.tp2Price - t.entryPrice) / t.entryPrice * 100;

    return {
      symbol: t.symbol,
      direction: t.isBullish ? 'long' : 'short',
      ob,
      entryPrice: t.entryPrice,
      tpPrice: t.tp2Price,              // 거래소 preset TP = TP2
      sl1Price: t.cappedSlPrice,        // 거래소 preset SL = 가격 하드캡
      sl2Price: t.entryPrice,
      sl3Price: null,
      time,
      tpPercent: tpPct,
      slPercent: t.cappedSlPct,
      // F4 태깅 메타 — 페이퍼/실증 기록용
      patternName: t.patternName,
      signalTime: t.signalTime,
      przPrice: t.przPrice,
      tp1Price: t.tp1Price,
      ...(t.regimeAtArm ? { regimeAtArm: t.regimeAtArm } : {}),
      ...(this.p.harmonicRegimeSmaPeriod > 0 ? { regime: this.regimeAt(t.symbol, time) } : {}),
    };
  }

  // newSl: tp1 부분청산 시 잔여물량 새 손절가(워커가 ob.mid 로 읽음)
  private emitExit(t: ActiveTracker, reason: ExitSignal['reason'], price: number, time: number, newSl?: number): void {
    const ob = {
      symbol: t.symbol,
      time: t.id,
      high: t.przPrice,
      low: t.przPrice,
      mid: newSl ?? t.entryPrice,
      type: t.isBullish ? 'bull' : 'bear' as const,
    };
    this.emit('exit', { symbol: t.symbol, reason, price, time, ob });
  }

  // 모니터링 = 차트 동일 스냅샷(shared display 생애주기) 그대로.
  // (구 displayTrackers 오버레이 머지 제거 — 체결/완성/폐기 모두 shared display가 분류.
  //  displayTrackers는 patternUpsert→DB 저장용으로만 휴면 유지, 제거는 P2.5.)
  getMonitoringSnapshot() {
    return this.getChartSnapshot();
  }

  private updateDisplayLifecycle(sym: string, c: Candle, buf: Candle[]): void {
    const chartSignals = this.chartSnapshotForSymbol(sym, buf)
      .filter((item: any) => item.kind === 'emerging' && item.phase === 'signal');
    const replayedNew = new Set<string>();

    for (const signal of chartSignals) {
      if (this.displayDone.has(signal.signature)) continue;
      if (this.displayTrackers.has(signal.signature)) continue;

      const tracker = this.displayTrackerFromSignal(signal);
      this.displayTrackers.set(tracker.signature, tracker);
      this.emitDisplayUpsert(tracker, 'signal');

      const replayStart = tracker.przHitTime ?? tracker.cTime;
      for (const replayCandle of buf) {
        if (replayCandle.time < replayStart) continue;
        if (!this.displayTrackers.has(tracker.signature)) break;
        this.processDisplayTracker(tracker, replayCandle);
      }
      replayedNew.add(tracker.signature);
    }

    for (const [signature, tracker] of [...this.displayTrackers.entries()]) {
      if (tracker.symbol !== sym) continue;
      if (replayedNew.has(signature)) continue;
      this.processDisplayTracker(tracker, c);
    }
  }

  private displayTrackerFromSignal(signal: any): DisplayTracker {
    return {
      signature: signal.signature,
      symbol: signal.symbol,
      type: signal.type,
      isBullish: signal.type === 'bull',
      phase: 'signal',
      kind: 'emerging',
      patternName: signal.patternName,
      mid: signal.entryPrice,
      entryPrice: signal.entryPrice,
      przPrice: signal.przPrice,
      slPrice: signal.slPrice,
      tp1Price: signal.tp1Price,
      tp2Price: signal.tp2Price,
      obTime: hashId(signal.signature),
      cTime: signal.cTime,
      przHitTime: signal.przHitTime,
      holdCount: 0,
      filled: false,
      tp1Hit: false,
      xabc: signal.xabc,
    };
  }

  private processDisplayTracker(t: DisplayTracker, c: Candle): void {
    if (!t.filled) {
      if (this.stopSideHit(t, c, t.entryPrice)) {
        t.phase = 'active';
        t.filled = true;
        t.entryTime = c.time;
        this.emitDisplayUpsert(t, 'active');
      } else if (this.tpSideHit(t, c, t.tp1Price)) {
        this.closeDisplayTracker(t, 'cancelled', t.tp1Price, c.time);
        return;
      } else {
        return;
      }
    }

    const isMainIntervalClose = c.isClosed && c.interval === this.interval;
    if (isMainIntervalClose) {
      t.holdCount++;
    }

    const moveStop = this.p.harmonicMoveStopToBreakeven;
    const tp2Weight = this.tp2Weight();
    const activeSl = moveStop && t.tp1Hit ? t.entryPrice : t.slPrice;

    if (this.stopSideHit(t, c, activeSl)) {
      const isBreakEven = Math.abs(activeSl - t.entryPrice) / t.entryPrice < 0.0001;
      if (t.tp1Hit && isBreakEven) {
        this.closeDisplayTracker(t, 'tp1', t.tp1Price, c.time);
      } else {
        this.closeDisplayTracker(t, 'sl', activeSl, c.time);
      }
      return;
    }

    if (!t.tp1Hit && this.tpSideHit(t, c, t.tp1Price)) {
      if (tp2Weight === 0) {
        this.closeDisplayTracker(t, 'tp1', t.tp1Price, c.time);
        return;
      }
      t.tp1Hit = this.tp1Weight() > 0;
      if (t.tp1Hit) this.emitDisplayUpsert(t, 'active');
    }

    if (tp2Weight > 0 && this.tpSideHit(t, c, t.tp2Price)) {
      this.closeDisplayTracker(t, 'tp2', t.tp2Price, c.time);
    }
  }

  private closeDisplayTracker(t: DisplayTracker, reason: DisplayExitReason, exitPrice: number, exitTime: number): void {
    this.displayTrackers.delete(t.signature);
    const done: DisplayTracker = {
      ...t,
      phase: 'done',
      exitReason: reason,
      exitPrice,
      exitTime,
    };
    this.displayDone.set(done.signature, done);
    while (this.displayDone.size > DISPLAY_DONE_MAX) {
      const oldest = this.displayDone.keys().next().value;
      if (!oldest) break;
      this.displayDone.delete(oldest);
    }
    this.emitDisplayUpsert(done, 'closed');
  }

  private emitDisplayUpsert(t: DisplayTracker, phase: 'signal' | 'active' | 'closed'): void {
    if (this.warmupMode) return;
    this.emit('patternUpsert', this.buildDisplayPatternSnapshot(t, phase));
  }

  private buildDisplayPatternSnapshot(t: DisplayTracker, phase: 'signal' | 'active' | 'closed') {
    return {
      signature: t.signature,
      phase,
      symbol: t.symbol,
      interval: this.interval,
      type: t.type,
      patternName: t.patternName,
      entryPrice: t.entryPrice,
      przPrice: t.przPrice,
      slPrice: t.slPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      przHitTime: t.przHitTime,
      entryTime: t.entryTime,
      exitReason: t.exitReason,
      exitPrice: t.exitPrice,
      exitTime: t.exitTime,
      filled: t.filled,
      tp1Hit: t.tp1Hit,
      xabc: t.xabc,
    };
  }

  private stopSideHit(t: Pick<DisplayTracker, 'isBullish'>, c: Candle, price: number): boolean {
    return t.isBullish ? c.low <= price : c.high >= price;
  }

  private tpSideHit(t: Pick<DisplayTracker, 'isBullish'>, c: Candle, price: number): boolean {
    return t.isBullish ? c.high >= price : c.low <= price;
  }

  // 진입대기(0.5 라인 체결 대기) 셋업 — arming됐으나 아직 미체결(filled=false)인 실 트래커.
  // 페이퍼 실증 현황 "진입대기 목록" 표시용(체결되면 paper_positions로 넘어가 여기서 빠진다).
  getArmedSetups() {
    return this.trackers.filter(t => !t.filled).map(t => ({
      symbol: t.symbol,
      patternName: t.patternName,
      direction: t.isBullish ? 'long' : 'short' as 'long' | 'short',
      entryPrice: t.entryPrice,     // 0.5 진입라인
      przPrice: t.przPrice,         // D점
      slPrice: t.cappedSlPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      signalTime: t.signalTime,     // D 터치(신호 발생) 시각
      regimeAtArm: t.regimeAtArm,
    }));
  }

  getStatus() {
    const active = this.trackers.map(t => ({
      symbol: t.symbol,
      type: t.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: t.filled ? 'active' : 'signal',   // 0.5 미터치=신호, 터치=체결
      mid: t.entryPrice,
      entryPrice: t.entryPrice,
      przPrice: t.przPrice,
      obTime: t.id,
      przHitTime: t.signalTime,                // D(PRZ) 터치 = 신호 발생 시각
      entryTime: t.filled ? t.entryTime : undefined,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: t.holdCount,
      patternName: t.patternName,
      slPrice: t.cappedSlPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      cTime: t.points.C.time,
      xabc: t.points,
      filled: t.filled,
      tp1Hit: t.tp1Hit,
    }));
    // 탐색/신호 표시: 미터치=scanning, 터치(차트 isPrzTouched)=signal(표시용, 슬롯에서 빠진 후보 포함)
    const scanning = [...this.watching.values()].flat().map(w => ({
      symbol: w.symbol,
      type: w.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: w.touched ? 'signal' : 'scanning',
      mid: w.przPrice,            // 목표 PRZ
      entryPrice: w.entryPrice,
      przPrice: w.przPrice,
      obTime: w.id,
      przHitTime: w.touched ? w.signalTime : (undefined as number | undefined),
      entryTime: undefined as number | undefined,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: 0,
      patternName: w.patternName,
      slPrice: w.slPrice,
      tp1Price: w.tp1Price,
      tp2Price: w.tp2Price,
      cTime: w.cTime,
      xabc: w.points,
    }));
    const watchCount = scanning.length;
    const done = this.completedTrackers.map(t => ({
      symbol: t.symbol,
      type: t.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: 'done',
      mid: t.entryPrice,
      entryPrice: t.entryPrice,
      przPrice: t.przPrice,
      obTime: t.id,
      przHitTime: t.signalTime,
      entryTime: t.entryTime,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: t.holdCount,
      patternName: t.patternName,
      slPrice: t.cappedSlPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      cTime: t.points.C.time,
      xabc: t.points,
      exitReason: t.exitReason,     // tp1/tp2/sl1/timeout/cancelled(폐기)
      exitPrice: t.exitPrice,
      exitTime: t.exitTime,
      filled: t.filled,             // 폐기는 미체결(false)
      tp1Hit: t.tp1Hit,             // 절반(TP1) 익절 발생 여부
    }));
    const signalDisplayCount = scanning.filter(s => s.phase === 'signal').length;
    return {
      trackers: this.trackers.length + watchCount + done.length,
      activePositions: this.trackers.map(t => t.symbol),
      regimeBlocked: this.regimeBlockedCount,   // 레짐 게이트 차단 누계(게이트 미사용 시 0)
      byPhase: {
        active: this.trackers.length,
        signal: signalDisplayCount,                 // 터치(표시용) 신호 — 슬롯에서 빠진 후보 포함
        scanning: watchCount - signalDisplayCount,   // 순수 미터치 탐색
        done: done.length,
      },
      trackersList: [...active, ...scanning, ...done],
    };
  }

  // ── 차트 동일 스냅샷(뼈대) ─────────────────────────────────
  // 거래 상태머신과 무관하게, 자기 버퍼에 차트와 동일한 탐지를 그대로 돌려
  // 완성/예측(터치·미터치) 패턴을 반환한다. 표시(모니터링) 전용 — 진입/종료/제외 없음.
  // 차트(useAutoPatterns)와 동일: SCAN_LENGTHS, basis 'wick', 동일 dedup, isLog=harmonicLogScale.
  getChartSnapshot() {
    const items: any[] = [];

    for (const [sym, buf] of this.bufs.entries()) {
      if (!buf.length) continue;
      items.push(...this.chartSnapshotForSymbol(sym, buf));
    }
    return items;
  }

  // 차트(useAutoPatterns)와 동일: predict display 한 경로로 탐색/신호/체결/완성/폐기 생애주기 산출.
  // (구 detect 완성 경로 폐기 — 차트와 동일하게 predict-display로 일원화.)
  private chartSnapshotForSymbol(sym: string, buf: Candle[]) {
    const isLog = this.p.harmonicLogScale === true;
    const lastClose = buf[buf.length - 1]?.close ?? 0;

    const all: EmergingHarmonicResult[] = [];
    for (const len of SCAN_LENGTHS) {
      if (buf.length <= len * 2) continue;
      all.push(...predictHarmonicPatterns(getPivots(buf, len, 'wick'), lastClose, isLog, buf, { mode: 'display' }));
    }

    // 차트와 동일 dedup: Cypher는 Shark와 X·A·B·C 공유 시 폐기 → A·B·이름·방향 키로 메이저(큰 스캔) 우선 1개.
    const sharkKeys = new Set<string>();
    for (const p of all) {
      if (p.name.includes('Shark')) sharkKeys.add(`${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`);
    }
    const seen = new Set<string>();
    const items: any[] = [];
    for (const p of all) {
      if (p.name.includes('Cypher') && sharkKeys.has(`${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`)) continue;
      const key = `${p.points.A.time}_${p.points.B.time}_${p.name}_${p.isBullish}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(this.displaySnapItem(sym, p, isLog));
    }
    return items;
  }

  // shared display 패턴 1개 → 모니터링/차트 공용 스냅샷 아이템(생애주기 phase 매핑).
  private displaySnapItem(sym: string, p: EmergingHarmonicResult, isLog: boolean) {
    const lc = p.lifecycle;
    const touched = !!lc && lc !== 'scanning';
    // 완성·폐기 = done, 그 외(탐색/신호/체결)는 lifecycle 그대로.
    const phase = lc === 'completed' || lc === 'cancelled' ? 'done' : (lc ?? 'scanning');
    const exitReason = lc === 'cancelled' ? 'cancelled' : p.endReason; // 'sl'|'tp'|'timeout'|'cancelled'|undefined
    const entryPrice = harmonicEntryPrice(p.przPrice, p.slPrice, this.p.harmonicEntryDepth ?? 0.5, isLog);
    const { tp1, tp2 } = harmonicTargets(p, isLog);
    const xabc = { X: pt(p.points.X), A: pt(p.points.A), B: pt(p.points.B), C: pt(p.points.C) };
    const hitTime = touched ? Number(p.przTouchedTime ?? p.points.C.time) : undefined;
    return {
      signature: this.chartSignature(sym, p.name, p.isBullish, xabc),
      symbol: sym, type: p.isBullish ? 'bull' : 'bear', isBb: false, kind: 'emerging',
      phase,
      mid: entryPrice,           // 거래 기준 = 0.5 진입가 (손익 계산 기준)
      entryPrice,
      obTime: Number(p.points.C.time),
      lookAfterTime: 0, waitCount: 0, holdCount: 0,
      patternName: p.name, przPrice: p.przPrice, slPrice: p.slPrice, tp1Price: tp1, tp2Price: tp2,
      isPrzTouched: !!p.isPrzTouched, przHitTime: hitTime, cTime: p.points.C.time,
      entryTime: p.entryTime, exitReason, exitPrice: p.exitPrice, exitTime: p.exitTime,
      slHunted: p.slHunted, slBroken: p.slBroken, tp1Hit: false,
      xabc,
    };
  }

  private chartSignature(sym: string, patternName: string, isBullish: boolean, xabc: any): string {
    return `${sym}|${this.interval}|${xabc.X.time}_${xabc.A.time}_${xabc.B.time}_${xabc.C.time}_${isBullish}|${patternName}`;
  }

  static key(ob: any): string {
    return `${ob.symbol}-${ob.time}`;
  }
}

// 피벗점 → {time, price} (스냅샷 직렬화용)
function pt(p: { time: number | string; price: number } | undefined) {
  return p ? { time: Number(p.time), price: p.price } : undefined;
}
