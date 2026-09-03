// SMC 존 관찰 엔진 (관찰 전용 — 주문/알림 이벤트 없음)
//
// 존 생성: zoneInterval(월봉 1M / 주봉 1w / 일봉 1d) OB/FVG (shared/smc.ts detectOBs/detectFVGs, 로그 스케일)
// 추적은 전부 일봉(1d) 기준:
//   scanning → 일봉 꼬리가 EQ 박스(0.382~0.618) 터치 → signal
//   signal   → 일봉이 0.5선(OB mid / FVG CE) 터치 → active (bull=롱, bear=숏)
//   active   → 익절: 존 바깥쪽 선(bull=존 상단, bear=존 하단) 꼬리 터치
//              손절: 일봉 종가가 존 반대쪽 돌파 마감
//   진입 전(scanning/signal)에 종가 돌파 마감이 나오면 존 무효(invalidated) 처리.
import { detectOBs, detectFVGs, eqBox, DEFAULT_OB_OPTIONS } from '../../../../../shared/smc.ts';
import type { Candle } from './candle-feed.ts';

type ZonePhase = 'scanning' | 'signal' | 'active' | 'done';

interface ZoneTracker {
  key:         string;            // source|type|zoneTime
  symbol:      string;
  source:      'OB' | 'FVG';
  type:        'bull' | 'bear';
  zoneHigh:    number;
  zoneLow:     number;
  mid:         number;            // OB mid / FVG CE — 진입 기준 0.5선
  eqLow:       number;
  eqHigh:      number;
  zoneTime:    number;            // 존 원천 캔들 (unix sec)
  confirmTime: number;            // 존 확정 캔들 — 이 시점 이후 일봉부터 추적
  phase:       ZonePhase;
  waitCount:   number;            // signal 이후 경과 일봉 수
  holdCount:   number;            // active 이후 경과 일봉 수
  signalTime?: number;
  entryTime?:  number;
  exitTime?:   number;
  exitReason?: 'tp' | 'sl' | 'invalidated';
  exitPrice?:  number;
}

const MAX_DONE = 200;  // 심볼당 종료 이력 보존 상한

export type SmcZoneInterval = '1M' | '1w' | '1d';

const YEAR_SEC = 365 * 86400;

export class SmcZoneEngine {
  private zoneInterval: SmcZoneInterval;
  private maxZoneAgeSec: number;  // 존 나이 컷오프 — 디폴트 월봉 3년 / 주봉 1년 / 일봉 180일

  constructor(zoneInterval: SmcZoneInterval = '1M', maxZoneAgeSec?: number) {
    this.zoneInterval = zoneInterval;
    this.maxZoneAgeSec = maxZoneAgeSec ?? (
      zoneInterval === '1M' ? 3 * YEAR_SEC :
      zoneInterval === '1w' ? YEAR_SEC :
      180 * 86400
    );
  }

  private zoneCandles = new Map<string, Candle[]>();    // symbol → 존 인터벌 버퍼
  private trackers = new Map<string, ZoneTracker[]>();  // symbol → 진행 중
  private completed = new Map<string, ZoneTracker[]>(); // symbol → 종료
  private seen = new Map<string, Set<string>>();        // symbol → 이미 등록한 존 key
  private warmup = false;

  setWarmupMode(on: boolean) { this.warmup = on; }

  private log(msg: string) {
    if (!this.warmup) console.log(msg);
  }

  feed(candle: Candle) {
    if (!candle.isClosed) return;
    if (candle.interval === this.zoneInterval) this.processZoneCandle(candle);
    if (candle.interval === '1d') this.processDaily(candle);
  }

  private tfLabel() {
    if (this.zoneInterval === '1M') return '월봉';
    if (this.zoneInterval === '1w') return '주봉';
    return '일봉';
  }

  // ── 존 인터벌 캔들: 존 감지 ───────────────────────────
  private processZoneCandle(c: Candle) {
    const sym = c.symbol;
    if (!this.zoneCandles.has(sym)) this.zoneCandles.set(sym, []);
    const buf = this.zoneCandles.get(sym)!;
    if (buf.length > 0 && buf[buf.length - 1].time >= c.time) return; // 중복/역행 방지
    buf.push(c);

    const obs  = detectOBs(buf, { ...DEFAULT_OB_OPTIONS, logScale: true });
    const fvgs = detectFVGs(buf, { logScale: true });
    const seen = this.seen.get(sym) ?? new Set<string>();
    this.seen.set(sym, seen);
    if (!this.trackers.has(sym)) this.trackers.set(sym, []);
    let list = this.trackers.get(sym)!;

    // 존 나이 컷오프: 기준 시각은 최신 존 캔들. 진입한 존(active)은 유지.
    const cutoff = c.time - this.maxZoneAgeSec;
    list = list.filter(t => t.phase === 'active' || t.confirmTime >= cutoff);
    this.trackers.set(sym, list);

    for (const ob of obs) {
      if (ob.confirmTime < cutoff) continue;
      const key = `OB|${ob.type}|${ob.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const eq = eqBox(ob.low, ob.high, true);
      list.push({
        key, symbol: sym, source: 'OB', type: ob.type,
        zoneHigh: ob.high, zoneLow: ob.low, mid: ob.mid,
        eqLow: eq.low, eqHigh: eq.high,
        zoneTime: ob.time, confirmTime: ob.confirmTime,
        phase: 'scanning', waitCount: 0, holdCount: 0,
      });
      this.log(`[SmcZone] 🔍 ${this.tfLabel()} OB 등록 ${sym} ${ob.type} ${ob.low}~${ob.high}`);
    }
    for (const fvg of fvgs) {
      if (fvg.confirmTime < cutoff) continue;
      const key = `FVG|${fvg.type}|${fvg.startTime}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const eq = eqBox(fvg.low, fvg.high, true);
      list.push({
        key, symbol: sym, source: 'FVG', type: fvg.type,
        zoneHigh: fvg.high, zoneLow: fvg.low, mid: fvg.ce,
        eqLow: eq.low, eqHigh: eq.high,
        zoneTime: fvg.startTime, confirmTime: fvg.confirmTime,
        phase: 'scanning', waitCount: 0, holdCount: 0,
      });
      this.log(`[SmcZone] 🔍 ${this.tfLabel()} FVG 등록 ${sym} ${fvg.type} ${fvg.low}~${fvg.high}`);
    }
  }

  // ── 일봉: 신호/진입/청산 추적 ─────────────────────────
  private processDaily(c: Candle) {
    const list = this.trackers.get(c.symbol);
    if (!list || list.length === 0) return;
    const doneNow: ZoneTracker[] = [];

    for (const t of list) {
      if (c.time <= t.confirmTime) continue; // 존 확정 이전 일봉은 무시 (lookahead 방지)

      // 종가 돌파 마감 = 존 무효(진입 전) / 손절(진입 후)
      const brokeThrough = t.type === 'bull' ? c.close < t.zoneLow : c.close > t.zoneHigh;

      if (t.phase === 'scanning' || t.phase === 'signal') {
        if (t.phase === 'signal') t.waitCount++;
        if (brokeThrough) {
          t.phase = 'done'; t.exitReason = 'invalidated';
          t.exitPrice = c.close; t.exitTime = c.time;
          doneNow.push(t);
          continue;
        }
        // 신호: 일봉 꼬리가 EQ 박스 터치
        if (t.phase === 'scanning' && c.high >= t.eqLow && c.low <= t.eqHigh) {
          t.phase = 'signal'; t.signalTime = c.time;
          this.log(`[SmcZone] 🟡 EQ 터치(신호) ${c.symbol} ${t.source} ${t.type}`);
        }
        // 진입: 같은 일봉이 더 깊게 0.5선까지 닿았으면 바로 진입까지 진행
        if (t.phase === 'signal' && c.low <= t.mid && c.high >= t.mid) {
          t.phase = 'active'; t.entryTime = c.time;
          this.log(`[SmcZone] 🟢 0.5 터치(진입) ${c.symbol} ${t.source} ${t.type} @ ${t.mid}`);
        }
        if (t.phase !== 'active') continue;
      }

      if (t.phase === 'active') {
        t.holdCount++;
        // 익절: 존 바깥쪽 선(가격이 들어온 쪽 경계) 꼬리 터치
        const tpHit = t.type === 'bull' ? c.high >= t.zoneHigh : c.low <= t.zoneLow;
        if (tpHit && c.time > (t.entryTime ?? 0)) {
          t.phase = 'done'; t.exitReason = 'tp';
          t.exitPrice = t.type === 'bull' ? t.zoneHigh : t.zoneLow;
          t.exitTime = c.time;
          this.log(`[SmcZone] ✅ 익절 ${c.symbol} ${t.source} ${t.type} @ ${t.exitPrice}`);
          doneNow.push(t);
          continue;
        }
        if (brokeThrough) {
          t.phase = 'done'; t.exitReason = 'sl';
          t.exitPrice = c.close; t.exitTime = c.time;
          this.log(`[SmcZone] 🛑 손절(종가 돌파) ${c.symbol} ${t.source} ${t.type} @ ${c.close}`);
          doneNow.push(t);
        }
      }
    }

    if (doneNow.length > 0) {
      this.trackers.set(c.symbol, list.filter(t => t.phase !== 'done'));
      const done = this.completed.get(c.symbol) ?? [];
      done.push(...doneNow);
      if (done.length > MAX_DONE) done.splice(0, done.length - MAX_DONE);
      this.completed.set(c.symbol, done);
    }
  }

  // ── 상태 스냅샷 (WorkerTracker 호환) ──────────────────
  getStatus() {
    const toItem = (t: ZoneTracker) => ({
      symbol:        t.symbol,
      type:          t.type,
      isBb:          false,
      phase:         t.phase,
      mid:           t.mid,
      obTime:        t.zoneTime,
      przHitTime:    t.signalTime,
      entryTime:     t.entryTime,
      lookAfterTime: t.confirmTime,
      waitCount:     t.waitCount,
      holdCount:     t.holdCount,
      patternName:   `${this.tfLabel()} ${t.source}${t.source === 'FVG' ? '(CE)' : ''}`,
      slPrice:       t.type === 'bull' ? t.zoneLow : t.zoneHigh,
      tp1Price:      t.type === 'bull' ? t.zoneHigh : t.zoneLow,
      tp2Price:      t.type === 'bull' ? t.zoneHigh : t.zoneLow,
      exitReason:    t.exitReason,
      exitPrice:     t.exitPrice,
      exitTime:      t.exitTime,
      filled:        Boolean(t.entryTime),
    });
    const live = [...this.trackers.values()].flat();
    const done = [...this.completed.values()].flat();
    return {
      trackers: live.length,
      activePositions: live.filter(t => t.phase === 'active').map(t => t.symbol),
      byPhase: [...live, ...done].reduce<Record<string, number>>((acc, t) => {
        acc[t.phase] = (acc[t.phase] ?? 0) + 1;
        return acc;
      }, {}),
      trackersList: [...live.map(toItem), ...done.map(toItem)],
    };
  }
}
