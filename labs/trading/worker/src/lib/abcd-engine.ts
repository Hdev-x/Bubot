// AB=CD 실시간 엔진 — shared/waves.ts 의 predictAbcWave 를
// 단일 타임프레임 캔들 마감 이벤트로 재현한다.
//
// 범위: 라이브 모니터링 상태(scanning/signal/active/done) 생성.
// 주문 실행은 기존 unified-worker 이벤트 흐름을 따르되, tradeEnabled=false면 관찰만 한다.
import { EventEmitter } from 'events';
import type { Candle } from './candle-feed.ts';
import type { EntrySignal, ExitSignal } from './signal-engine.ts';

import { getPivots } from '../../../../../shared/pivots.ts';
import { predictAbcWave, type AbcEmergingResult } from '../../../../../shared/waves.ts';

export interface AbcdEngineParams {
  abcdEntryMode: 'immediate' | 'close';
  abcdTp1Pct: number;
  abcdTp2Pct: number;
  abcdEnabledRatios: string[];
  abcdLogScale: boolean;
  maxHoldCandles: number;
  longOnly: boolean;
}

export const DEFAULT_ABCD_PARAMS: AbcdEngineParams = {
  abcdEntryMode: 'immediate',
  abcdTp1Pct: 50,
  abcdTp2Pct: 50,
  abcdEnabledRatios: [],
  abcdLogScale: true,
  maxHoldCandles: 100,
  longOnly: false,
};

const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
const MAX_CONCURRENT = 1;
const BUF_MAX = 1200;
export type AbcdEngineInterval = '4h' | '1d' | '1w';

interface AbcPoints {
  A: { time: number; price: number };
  B: { time: number; price: number };
  C: { time: number; price: number };
}

interface ActiveTracker {
  id: number;
  symbol: string;
  isBullish: boolean;
  targetLabel: string;
  attemptKey: string;
  abcKey: string;
  przPrice: number;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp1Hit: boolean;
  holdCount: number;
  signalTime: number;
  entryTime: number;
  filled: boolean;
  points: AbcPoints;
}

interface WatchItem {
  id: number;
  symbol: string;
  isBullish: boolean;
  targetLabel: string;
  przPrice: number;
  entryPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  cTime: number;
  points: AbcPoints;
}

function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pointsOf(p: AbcEmergingResult): AbcPoints {
  const { A, B, C } = p.points;
  return {
    A: { time: Number(A.time), price: A.price },
    B: { time: Number(B.time), price: B.price },
    C: { time: Number(C.time), price: C.price },
  };
}

function abcKey(p: AbcEmergingResult): string {
  const { A, B, C } = p.points;
  return `${A.time}_${B.time}_${C.time}_${p.isBullish}`;
}

function attemptKey(p: AbcEmergingResult): string {
  return `${abcKey(p)}_${p.targetLabel}_${p.przPrice.toPrecision(8)}`;
}

function patternName(label: string): string {
  return `AB=CD ${label}`;
}

function targets(p: AbcEmergingResult, entryPrice: number): { tp1: number; tp2: number } {
  const c = p.points.C.price;
  const retrace = (ratio: number) => entryPrice + (c - entryPrice) * ratio;
  return { tp1: retrace(0.382), tp2: retrace(0.618) };
}

export class AbcdEngine extends EventEmitter {
  private p: AbcdEngineParams;
  private interval: AbcdEngineInterval;
  private bufs = new Map<string, Candle[]>();
  private trackers: ActiveTracker[] = [];
  private tradedKeys = new Set<string>();
  private closedAbcKeys = new Set<string>();
  private watching = new Map<string, WatchItem[]>();
  private completedTrackers: (ActiveTracker & { exitReason: string; exitPrice: number; exitTime: number })[] = [];
  private idSeq = 0;
  private warmupMode = false;

  setWarmupMode(on: boolean) { this.warmupMode = on; }

  constructor(params: Partial<AbcdEngineParams> = {}, interval: AbcdEngineInterval = '4h') {
    super();
    this.p = { ...DEFAULT_ABCD_PARAMS, ...params };
    this.interval = interval;
  }

  feed(candle: Candle): void {
    const sym = candle.symbol.toUpperCase();

    if (candle.interval === '1m') {
      const items = this.watching.get(sym);
      if (items && items.length > 0) {
        const validItems = items.filter(w => {
          if (w.isBullish) {
            if (candle.low <= w.slPrice || candle.high > w.points.C.price || candle.low <= w.przPrice) return false;
          } else {
            if (candle.high >= w.slPrice || candle.low < w.points.C.price || candle.high >= w.przPrice) return false;
          }
          return true;
        });
        if (validItems.length !== items.length) this.watching.set(sym, validItems);
      }
      return;
    }

    if (!candle.isClosed || candle.interval !== this.interval) return;

    let buf = this.bufs.get(sym);
    if (!buf) { buf = []; this.bufs.set(sym, buf); }
    buf.push(candle);
    if (buf.length > BUF_MAX) buf.shift();

    for (let i = this.trackers.length - 1; i >= 0; i--) {
      const t = this.trackers[i];
      if (t.symbol === sym) this.processLaterCandle(t, candle);
    }
    this.scan(sym, candle, buf);
  }

  private processLaterCandle(t: ActiveTracker, c: Candle): void {
    if (!t.filled) {
      const fillHit = t.isBullish ? c.low <= t.entryPrice : c.high >= t.entryPrice;
      if (fillHit) {
        t.filled = true;
        t.entryTime = c.time;
        if (!this.warmupMode) console.log(`[AbcdEngine] ✅ 체결 | ${t.symbol} ${patternName(t.targetLabel)} @ ${t.entryPrice.toFixed(4)}`);
        this.emit('entry', this.buildSignal(t, c.time));
      } else {
        const tp1Reached = t.isBullish ? c.high >= t.tp1Price : c.low <= t.tp1Price;
        if (tp1Reached) this.finish(t, 'cancelled', t.tp1Price, c.time);
        return;
      }
    }

    t.holdCount++;

    const slHit = t.isBullish ? c.low <= t.slPrice : c.high >= t.slPrice;
    if (slHit) {
      this.emitExit(t, 'sl1', t.slPrice, c.time);
      this.finish(t, 'sl1', t.slPrice, c.time);
      return;
    }

    if (!t.tp1Hit) {
      const tp1Reached = t.isBullish ? c.high >= t.tp1Price : c.low <= t.tp1Price;
      if (tp1Reached) {
        t.tp1Hit = this.tp1Weight() > 0;
        if (t.tp1Hit) this.emitExit(t, 'tp1', t.tp1Price, c.time, t.entryPrice);
      }
    }

    if (this.tp2Weight() > 0) {
      const tp2Reached = t.isBullish ? c.high >= t.tp2Price : c.low <= t.tp2Price;
      if (tp2Reached) {
        this.emitExit(t, 'tp', t.tp2Price, c.time);
        this.finish(t, 'tp2', t.tp2Price, c.time);
        return;
      }
    }

    if (t.holdCount >= this.p.maxHoldCandles) {
      this.emitExit(t, 'timeout', c.close, c.time);
      this.finish(t, 'timeout', c.close, c.time);
    }
  }

  private scan(sym: string, c: Candle, buf: Candle[]): void {
    const currentPrice = c.close;
    const predictions: AbcEmergingResult[] = [];
    for (const len of SCAN_LENGTHS) {
      if (buf.length <= len * 2) continue;
      const pivots = getPivots(buf, len, 'wick');
      predictions.push(...predictAbcWave(pivots, currentPrice, this.p.abcdLogScale, buf));
    }

    const enabled = new Set(this.p.abcdEnabledRatios ?? []);
    const useRatioFilter = enabled.size > 0;
    const seen = new Set<string>();
    const candidates: Array<{
      pattern: AbcEmergingResult;
      attemptKey: string;
      abcKey: string;
      entryPrice: number;
      tp1: number;
      tp2: number;
    }> = [];
    const watchItems: WatchItem[] = [];

    for (const p of predictions) {
      if (useRatioFilter && !enabled.has(p.targetLabel)) continue;
      if (this.p.longOnly && !p.isBullish) continue;

      const key = attemptKey(p);
      const baseKey = abcKey(p);
      if (seen.has(key) || this.tradedKeys.has(key) || this.closedAbcKeys.has(baseKey)) continue;
      seen.add(key);

      const entryPrice = (p.przPrice + p.slPrice) / 2;
      const { tp1, tp2 } = targets(p, entryPrice);
      if (entryPrice <= 0 || p.slPrice <= 0 || tp1 <= 0 || tp2 <= 0) continue;
      if (p.isBullish && (tp1 <= entryPrice || tp2 <= entryPrice || p.slPrice >= entryPrice)) continue;
      if (!p.isBullish && (tp1 >= entryPrice || tp2 >= entryPrice || p.slPrice <= entryPrice)) continue;

      const zoneLow = Math.min(p.przPrice, p.slPrice);
      const zoneHigh = Math.max(p.przPrice, p.slPrice);
      const touchedZone = c.high >= zoneLow && c.low <= zoneHigh;
      const closedInZone = c.close >= zoneLow && c.close <= zoneHigh;
      const shouldEnter = this.p.abcdEntryMode === 'immediate' ? touchedZone : closedInZone;

      if (shouldEnter) {
        candidates.push({ pattern: p, attemptKey: key, abcKey: baseKey, entryPrice, tp1, tp2 });
      } else {
        watchItems.push({
          id: hashId(key), symbol: sym, isBullish: p.isBullish, targetLabel: p.targetLabel,
          przPrice: p.przPrice, entryPrice, slPrice: p.slPrice, tp1Price: tp1, tp2Price: tp2,
          cTime: Number(p.points.C.time), points: pointsOf(p),
        });
      }
    }

    watchItems.sort((a, b) => Math.abs(currentPrice - a.przPrice) - Math.abs(currentPrice - b.przPrice));
    this.watching.set(sym, watchItems.slice(0, 8));

    if (candidates.length === 0) return;
    const activeCount = this.trackers.filter(t => t.symbol === sym).length;
    const available = MAX_CONCURRENT - activeCount;
    if (available <= 0) return;

    candidates.sort((a, b) => Math.abs(currentPrice - a.pattern.przPrice) - Math.abs(currentPrice - b.pattern.przPrice));
    for (const sel of candidates.slice(0, available)) {
      const t: ActiveTracker = {
        id: ++this.idSeq,
        symbol: sym,
        isBullish: sel.pattern.isBullish,
        targetLabel: sel.pattern.targetLabel,
        attemptKey: sel.attemptKey,
        abcKey: sel.abcKey,
        przPrice: sel.pattern.przPrice,
        entryPrice: sel.entryPrice,
        slPrice: sel.pattern.slPrice,
        tp1Price: sel.tp1,
        tp2Price: sel.tp2,
        tp1Hit: false,
        holdCount: 0,
        signalTime: c.time,
        entryTime: 0,
        filled: false,
        points: pointsOf(sel.pattern),
      };
      this.trackers.push(t);
      this.tradedKeys.add(sel.attemptKey);

      if (!this.warmupMode) console.log(`[AbcdEngine] 🔔 신호 발생 | ${sym} ${patternName(t.targetLabel)} | 체결대기≈${t.entryPrice.toFixed(4)} SL=${t.slPrice.toFixed(4)} TP1=${t.tp1Price.toFixed(4)} TP2=${t.tp2Price.toFixed(4)}`);
      this.emit('signal', this.buildSignal(t, c.time));

      const slHit = t.isBullish ? c.low <= t.slPrice : c.high >= t.slPrice;
      if (slHit) {
        this.emitExit(t, 'sl1', t.slPrice, c.time);
        this.finish(t, 'sl1', t.slPrice, c.time);
      }
    }
  }

  private tp1Weight(): number {
    const w1 = Math.max(0, Math.min(1, this.p.abcdTp1Pct / 100));
    const w2 = Math.max(0, Math.min(1, this.p.abcdTp2Pct / 100));
    return (w1 + w2) > 0 ? w1 / (w1 + w2) : 0;
  }

  private tp2Weight(): number {
    const w1 = Math.max(0, Math.min(1, this.p.abcdTp1Pct / 100));
    const w2 = Math.max(0, Math.min(1, this.p.abcdTp2Pct / 100));
    return (w1 + w2) > 0 ? w2 / (w1 + w2) : 0;
  }

  private finish(t: ActiveTracker, reason: string, exitPrice: number, exitTime: number): void {
    this.closedAbcKeys.add(t.abcKey);
    const idx = this.trackers.indexOf(t);
    if (idx >= 0) {
      this.trackers.splice(idx, 1);
      this.completedTrackers.push({ ...t, exitReason: reason, exitPrice, exitTime });
      if (this.completedTrackers.length > 50) this.completedTrackers.shift();
    }
  }

  private buildSignal(t: ActiveTracker, time: number): EntrySignal {
    const ob = {
      symbol: t.symbol,
      time: t.id,
      high: t.entryPrice,
      low: t.entryPrice,
      mid: t.entryPrice,
      type: t.isBullish ? 'bull' : 'bear' as const,
    };
    const tpPct = Math.abs(t.tp2Price - t.entryPrice) / t.entryPrice * 100;
    const slPct = Math.abs(t.entryPrice - t.slPrice) / t.entryPrice * 100;
    return {
      symbol: t.symbol,
      direction: t.isBullish ? 'long' : 'short',
      ob,
      entryPrice: t.entryPrice,
      tpPrice: t.tp2Price,
      sl1Price: t.slPrice,
      sl2Price: t.entryPrice,
      sl3Price: null,
      time,
      tpPercent: tpPct,
      slPercent: slPct,
    };
  }

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

  getStatus() {
    const active = this.trackers.map(t => ({
      symbol: t.symbol,
      type: t.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: t.filled ? 'active' : 'signal',
      mid: t.entryPrice,
      obTime: t.id,
      przHitTime: t.signalTime,
      entryTime: t.filled ? t.entryTime : undefined,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: t.holdCount,
      patternName: patternName(t.targetLabel),
      slPrice: t.slPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      cTime: t.points.C.time,
      xabc: t.points,
      filled: t.filled,
      tp1Hit: t.tp1Hit,
    }));
    const scanning = [...this.watching.values()].flat().map(w => ({
      symbol: w.symbol,
      type: w.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: 'scanning',
      mid: w.przPrice,
      obTime: w.id,
      przHitTime: undefined as number | undefined,
      entryTime: undefined as number | undefined,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: 0,
      patternName: patternName(w.targetLabel),
      slPrice: w.slPrice,
      tp1Price: w.tp1Price,
      tp2Price: w.tp2Price,
      cTime: w.cTime,
      xabc: w.points,
    }));
    const done = this.completedTrackers.map(t => ({
      symbol: t.symbol,
      type: t.isBullish ? 'bull' : 'bear',
      isBb: false,
      phase: 'done',
      mid: t.entryPrice,
      obTime: t.id,
      przHitTime: undefined as number | undefined,
      entryTime: t.entryTime,
      lookAfterTime: 0,
      waitCount: 0,
      holdCount: t.holdCount,
      patternName: patternName(t.targetLabel),
      slPrice: t.slPrice,
      tp1Price: t.tp1Price,
      tp2Price: t.tp2Price,
      cTime: t.points.C.time,
      xabc: t.points,
      exitReason: t.exitReason,
      exitPrice: t.exitPrice,
      exitTime: t.exitTime,
      filled: t.filled,
      tp1Hit: t.tp1Hit,
    }));
    return {
      trackers: this.trackers.length + scanning.length + done.length,
      activePositions: this.trackers.map(t => t.symbol),
      byPhase: { active: this.trackers.length, scanning: scanning.length, done: done.length },
      trackersList: [...active, ...scanning, ...done],
    };
  }

  static key(ob: any): string {
    return `${ob.symbol}-${ob.time}`;
  }
}
