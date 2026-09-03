// Signal Engine — 4h OB 감지 → 1h 진입 조건 체크 (실시간 backtestEngine 포팅)
// backtestEngine.ts의 detectOBs / classifyCandle / 진입 대기 로직 동일

import { EventEmitter } from 'events';
import { midPrice, isBullCandle, isBearCandle, classifyCandle as classifyCandleShared } from '../../../../../shared/smc.ts';
import type { Candle } from './candle-feed.ts';

// ── 타입 ───────────────────────────────────────────────────
export interface OB {
  symbol: string;
  time:   number;   // OB 캔들(음봉) open time (unix sec)
  high:   number;
  low:    number;
  mid:    number;   // sqrt(high * low)  — 기준가
  type:   'bull' | 'bear';
  isBb?:  boolean;  // BB 여부
}

type OBPhase =
  | 'waiting'        // lookAfterTime 대기 중 (4h 캔들 2개 소비 전)
  | 'scanning'       // 1h 첫 터치 탐색 중
  | 'waiting_entry'  // 신호(첫 터치 확인), mid 풀백 대기
  | 'active'         // 진입 완료 — SL2/SL3/timeout 모니터링
  | 'done';

type TouchType = 'no_touch' | 'wick_high' | 'wick_mid' | 'wick_low'
               | 'close_above_mid' | 'close_below_mid' | 'breakout';

interface OBTracker {
  ob:            OB;
  phase:         OBPhase;
  lookAfterTime: number;  // 이 unix sec 이후 1h 캔들부터 모니터링
  waitCount:     number;  // waiting_entry 진입 후 카운터 (maxWaitCandles 체크)
  holdCount:     number;  // active 진입 후 카운터 (maxHoldCandles 체크)
  signalTime?:   number;
  entryTime?:    number;
  exitTime?:     number;
  exitReason?:   string;
  exitPrice?:    number;
}

export interface SymbolConfig {
  tpPercent: number;
  slPercent: number;
}

export interface EntrySignal {
  symbol:     string;
  direction:  'long' | 'short';
  ob:         OB;
  entryPrice: number;       // ob.mid (진입 기준가)
  deepEntryPrice?: number;  // split 모드 등에서 사용될 보수적 진입 타점 (예: D와 SL의 0.5)
  tpPrice:    number;
  sl1Price:   number;       // 경성 손절 (거래소 stop-loss 주문)
  sl2Price:   number;       // ob.mid — 1h 종가 이탈 시 소프트 청산
  sl3Price:   number | null;// ob.low (bull) / ob.high (bear) — SL3 활성화 시만
  time:       number;       // 신호 발생 시간 (unix sec)
  tpPercent:  number;       // 진입 당시의 TP%
  slPercent:  number;       // 진입 당시의 SL1%
  // ── 하모닉 메타(F4 태깅용, HarmonicEngine만 채움) ──
  patternName?: string;     // 패턴명 (예: 'Bullish Bat (Emerging)')
  signalTime?:  number;     // D(PRZ) 터치 = 신호 발생 시각
  przPrice?:    number;     // D점(PRZ) 가격
  tp1Price?:    number;     // TP1 (tpPrice = TP2)
  regimeAtArm?: 'up' | 'down' | 'na'; // arming 시점 레짐 (게이트 사용 시)
  regime?:      'up' | 'down' | 'na'; // 이 신호 평가 시점 레짐 (entry 이벤트 = 체결 시점)
}

export interface ExitSignal {
  symbol: string;
  reason: 'sl1' | 'tp' | 'tp1' | 'sl2' | 'sl3' | 'timeout';
  price:  number;
  time:   number;
  ob:     OB;   // 어느 트래커의 청산인지 매칭용
}

export interface SignalEngineParams {
  tpPercent:      number;  // 기본 TP% (ob.mid 기준)
  slPercent:      number;  // 기본 SL1% (경성 손절)
  maxWaitCandles: number;  // 신호 후 진입 대기 최대 캔들 수 (1h 기준)
  maxHoldCandles: number;  // 진입 후 최대 보유 캔들 수 (1h 기준)
  longOnly:       boolean; // true = Bull OB만 감지
  useSl3:         boolean; // SL3 활성화 여부
  useBbStrategy:  boolean; // OB 돌파 시 BB(Breaker Block) 역매매 사용
  symbolConfigs?: Record<string, SymbolConfig>; // 코인별 개별 설정 맵
  harmonicLogScale?: boolean; // 하모닉 패턴 탐색 시 로그 스케일 사용 여부
  harmonicEntryDepth?: number; // 진입 깊이 0~1 (0=D점, 0.5=D~SL 중간)
  useAbcdStrategy?: boolean;
  abcdEntryMode?: 'immediate' | 'close';
  abcdTp1Pct?: number;
  abcdTp2Pct?: number;
  abcdEnabledRatios?: string[];
  abcdLogScale?: boolean;
}

export const DEFAULT_PARAMS: SignalEngineParams = {
  tpPercent:      0.5,
  slPercent:      3.0,
  maxWaitCandles: 40,
  maxHoldCandles: 100,
  longOnly:       false,
  useSl3:         false,
  useBbStrategy:  false,
};

// ── 캔들 분류 — 공유 엔진(shared/smc.ts) 위임 ───────────────
function classifyCandle(ob: OB, c: Candle): TouchType {
  return classifyCandleShared(ob, c);
}

function fmt(sec: number) {
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

// ── SignalEngine ────────────────────────────────────────────
export class SignalEngine extends EventEmitter {
  private p: SignalEngineParams;
  private trackers: OBTracker[] = [];
  private completedTrackers: OBTracker[] = [];
  private ob4hBuf: Map<string, Candle[]> = new Map();  // symbol → 4h 버퍼

  constructor(params: Partial<SignalEngineParams> = {}) {
    super();
    this.p = { ...DEFAULT_PARAMS, ...params };
  }

  private getSymbolParams(symbol: string): SymbolConfig {
    if (this.p.symbolConfigs && this.p.symbolConfigs[symbol]) {
      return this.p.symbolConfigs[symbol];
    }
    return { tpPercent: this.p.tpPercent, slPercent: this.p.slPercent };
  }

  // CandleFeed.onCandle()에 바로 연결 가능
  feed(candle: Candle) {
    if (!candle.isClosed) return;
    if (candle.interval === '4h') this.process4h(candle);
    if (candle.interval === '1h') this.process1h(candle);
  }

  // ── 4h 처리: OB 감지 ─────────────────────────────────────
  private process4h(c: Candle) {
    const sym = c.symbol;
    if (!this.ob4hBuf.has(sym)) this.ob4hBuf.set(sym, []);
    const buf = this.ob4hBuf.get(sym)!;
    buf.push(c);
    if (this.p.useFvgStrategy) {
      if (buf.length < 3) return;
      const c1 = buf[buf.length - 3];
      const c2 = buf[buf.length - 2];
      const c3 = buf[buf.length - 1];

      // Bull FVG: c1 high < c3 low
      if (c1.high < c3.low) {
        this.addOB({
          symbol: sym, type: 'bull',
          time: c3.time,
          high: c3.low, low: c1.high,
          mid: midPrice(c1.high, c3.low), // 로그 중간값 — 차트 CE와 동일
        }, c3.time);
      }
      // Bear FVG: c1 low > c3 high (longOnly=false 일 때만)
      if (!this.p.longOnly && c1.low > c3.high) {
        this.addOB({
          symbol: sym, type: 'bear',
          time: c3.time,
          high: c1.low, low: c3.high,
          mid: midPrice(c1.low, c3.high), // 로그 중간값 — 차트 CE와 동일
        }, c3.time);
      }
    } else {
      if (buf.length < 5) return;
      const prev = buf[buf.length - 2];  // OB 원천 캔들
      const curr = buf[buf.length - 1];
      const isBear = isBearCandle; // 공유 엔진 — 도지(시가=종가)는 무방향
      const isBull = isBullCandle;
      const b1 = buf[buf.length - 2], b2 = buf[buf.length - 3], b3 = buf[buf.length - 4], b4 = buf[buf.length - 5];

      // Bull OB (원천=음봉): A) 음봉 3개 연속  또는  B) 양봉 3연속 후 반전 음봉 1개
      const bullA = isBear(b1) && isBear(b2) && isBear(b3);
      const bullB = isBear(b1) && isBull(b2) && isBull(b3) && isBull(b4);
      if ((bullA || bullB) && curr.close > prev.high) {
        this.addOB({
          symbol: sym, type: 'bull',
          time:   prev.time,
          high:   prev.high, low: prev.low,
          mid:    Math.sqrt(prev.high * prev.low),
        }, curr.time);
      }

      // Bear OB (원천=양봉): A) 양봉 3개 연속  또는  B) 음봉 3연속 후 반전 양봉 1개
      const bearA = isBull(b1) && isBull(b2) && isBull(b3);
      const bearB = isBull(b1) && isBear(b2) && isBear(b3) && isBear(b4);
      if (!this.p.longOnly && (bearA || bearB) && curr.close < prev.low) {
        this.addOB({
          symbol: sym, type: 'bear',
          time:   prev.time,
          high:   prev.high, low: prev.low,
          mid:    Math.sqrt(prev.high * prev.low),
        }, curr.time);
      }
    }

    // 버퍼 크기 제한 (마지막 500개)
    if (buf.length > 500) buf.splice(0, buf.length - 500);
  }

  private addOB(ob: OB, breakoutCandleTime: number) {
    // lookAfterTime = breakout 4h 캔들 이후 다음 4h 캔들 오픈 시간
    // = breakoutCandleTime + 4h (백테스트의 obCandleIdx+2 에 해당)
    const lookAfterTime = breakoutCandleTime + 4 * 3600;
    this.trackers.push({ ob, phase: 'waiting', lookAfterTime, waitCount: 0, holdCount: 0 });
    const emoji = ob.type === 'bull' ? '🟧' : '🟥';
    const label = this.p.useFvgStrategy ? 'FVG' : 'OB';
    console.log(`[SignalEngine] ${emoji} ${label} 감지 | ${ob.symbol} ${ob.type.toUpperCase()} | ${fmt(ob.time)} | mid=${ob.mid.toFixed(4)} | 모니터링: ${fmt(lookAfterTime)}~`);
  }

  private zoneLabel(ob: OB): string {
    if (ob.isBb) return 'BB';
    return this.p.useFvgStrategy ? 'FVG' : 'OB';
  }

  private completeTracker(t: OBTracker, reason: string, price: number, time: number) {
    t.phase = 'done';
    t.exitReason = reason;
    t.exitPrice = price;
    t.exitTime = time;
    this.completedTrackers.push({ ...t });
    if (this.completedTrackers.length > 80) this.completedTrackers.shift();
  }

  // 트래커 키 (실행계층 매칭용): type-obTime
  static key(ob: OB): string {
    return `${ob.type}-${ob.time}`;
  }

  // OB.mid + 종목 설정으로 EntrySignal 구성
  private buildSignal(t: OBTracker, time: number): EntrySignal {
    const dir = t.ob.type === 'bull' ? 'long' : 'short';
    const mid = t.ob.mid;
    const sp  = this.getSymbolParams(t.ob.symbol);
    return {
      symbol: t.ob.symbol, direction: dir, ob: t.ob,
      entryPrice: mid,
      tpPrice:  dir === 'long' ? mid * (1 + sp.tpPercent / 100) : mid * (1 - sp.tpPercent / 100),
      sl1Price: dir === 'long' ? mid * (1 - sp.slPercent / 100) : mid * (1 + sp.slPercent / 100),
      sl2Price: mid,
      sl3Price: this.p.useSl3 ? (dir === 'long' ? t.ob.low : t.ob.high) : null,
      time, tpPercent: sp.tpPercent, slPercent: sp.slPercent,
    };
  }

  // 청산 조건 평가 (backtest 순서: SL1→TP→SL2→SL3→timeout). 해당 없으면 null
  private evalExit(t: OBTracker, c: Candle): ExitSignal | null {
    const sym = t.ob.symbol;
    const mid = t.ob.mid;
    const isBull = t.ob.type === 'bull';
    const sp  = this.getSymbolParams(sym);
    const sl1 = isBull ? mid * (1 - sp.slPercent / 100) : mid * (1 + sp.slPercent / 100);
    const tp  = isBull ? mid * (1 + sp.tpPercent / 100) : mid * (1 - sp.tpPercent / 100);

    // SL1 (장중 고저 기준)
    if (isBull ? c.low <= sl1 : c.high >= sl1)
      return { symbol: sym, reason: 'sl1', price: sl1, time: c.time, ob: t.ob };
    // TP (장중 고저 기준)
    if (isBull ? c.high >= tp : c.low <= tp)
      return { symbol: sym, reason: 'tp', price: tp, time: c.time, ob: t.ob };
    // SL2 (종가 mid 이탈)
    if (isBull ? c.close < mid : c.close > mid)
      return { symbol: sym, reason: 'sl2', price: c.close, time: c.time, ob: t.ob };
    // SL3 (종가 OB 존 완전 이탈)
    if (this.p.useSl3 && (isBull ? c.close < t.ob.low : c.close > t.ob.high))
      return { symbol: sym, reason: 'sl3', price: c.close, time: c.time, ob: t.ob };
    // Timeout
    if (t.holdCount >= this.p.maxHoldCandles)
      return { symbol: sym, reason: 'timeout', price: c.close, time: c.time, ob: t.ob };
    return null;
  }

  // ── 1h 처리: 순수 전략 상태머신 (포지션/체결과 무관) ──────
  private process1h(c: Candle) {
    const sym = c.symbol;
    const toRemove: number[] = [];

    for (let i = 0; i < this.trackers.length; i++) {
      const t = this.trackers[i];
      if (t.ob.symbol !== sym) continue;

      // waiting → scanning 전환
      if (t.phase === 'waiting') {
        if (c.time >= t.lookAfterTime) t.phase = 'scanning';
        else continue;
      }

      // ── scanning: 첫 터치 확인 → 신호 ──────────────────
      if (t.phase === 'scanning') {
        // [BB Only Mode] 원본 OB인 경우 매매 신호를 발생시키지 않고 오직 이탈(breakout)만 감시함
        if (this.p.useBbStrategy && !t.ob.isBb) {
          const isBreakout = t.ob.type === 'bull' ? c.close < t.ob.low : c.close > t.ob.high;
          if (isBreakout) {
            console.log(`[SignalEngine] 🔄 원본 OB 무시/이탈 → BB(Breaker Block) 역매매 전환 | ${sym} | mid=${t.ob.mid.toFixed(4)}`);
            this.trackers.push({
              ob: { ...t.ob, type: t.ob.type === 'bull' ? 'bear' : 'bull', isBb: true },
              phase: 'waiting',
              lookAfterTime: c.time + 1,
              waitCount: 0, holdCount: 0
            });
            toRemove.push(i);
          }
          continue;
        }

        const touch = classifyCandle(t.ob, c);
        if (touch === 'no_touch') continue;

        const signalType: TouchType = t.ob.type === 'bull' ? 'close_above_mid' : 'close_below_mid';
        if (touch === signalType) {
          t.phase = 'waiting_entry';
          t.waitCount = 0;
          t.signalTime = c.time;
          const signal = this.buildSignal(t, c.time);
          const label = t.ob.isBb ? 'BB' : 'OB';
          console.log(`[SignalEngine] 📌 ${label} 신호 | ${sym} ${signal.direction.toUpperCase()} @ mid=${t.ob.mid.toFixed(4)} | TP=${signal.tpPrice.toFixed(4)} SL1=${signal.sl1Price.toFixed(4)} | ${fmt(c.time)}`);
          this.emit('signal', signal);
          // 같은 캔들에서 mid 풀백까지 했으면 아래 waiting_entry 블록으로 fall-through
        } else {
          // 첫 터치가 잘못된 타입 → OB 무효화
          console.log(`[SignalEngine] ❌ OB 무효 (첫 터치: ${touch}) | ${sym} | mid=${t.ob.mid.toFixed(4)}`);
          this.completeTracker(t, 'invalid_touch', t.ob.mid, c.time);
          toRemove.push(i);
          continue;
        }
      }

      // ── waiting_entry: mid 풀백이면 진입(active) 판정 ────
      if (t.phase === 'waiting_entry') {
        const entered = t.ob.type === 'bull' ? c.low <= t.ob.mid : c.high >= t.ob.mid;
        if (entered) {
          t.phase = 'active';
          t.holdCount = 0;
          t.entryTime = c.time;
          const sig = this.buildSignal(t, c.time);
          const label = t.ob.isBb ? 'BB' : 'OB';
          console.log(`[SignalEngine] 🟢 진입(active) | ${label} ${sym} ${sig.direction.toUpperCase()} @ mid=${t.ob.mid.toFixed(4)} | ${fmt(c.time)}`);
          this.emit('entry', sig);
          // 진입 캔들에서는 청산 평가를 미룸(다음 캔들부터). 봇 비동기 진입과의 레이스 방지.
          // TP/SL1은 거래소 preset이 장중 처리하므로 손해 없음.
          continue;
        } else {
          t.waitCount++;
          if (t.waitCount > this.p.maxWaitCandles) {
            console.log(`[SignalEngine] ⏱ 대기 초과(${this.p.maxWaitCandles}h) → 신호 취소 | ${sym} | mid=${t.ob.mid.toFixed(4)}`);
            this.emit('signal_cancel', { symbol: sym, ob: t.ob });
            this.completeTracker(t, 'cancelled', t.ob.mid, c.time);
            toRemove.push(i);
          }
          continue;
        }
      }

      // ── active: 청산 조건 (SL1→TP→SL2→SL3→timeout) ─────
      if (t.phase === 'active') {
        const exit = this.evalExit(t, c);
        if (exit) {
          const label = t.ob.isBb ? 'BB' : 'OB';
          console.log(`[SignalEngine] 🏁 ${label} 청산 (${exit.reason}) | ${sym} | 수익률: ${(((exit.price - t.ob.mid)/t.ob.mid)*(t.ob.type==='bull'?1:-1)*100).toFixed(2)}% | ${fmt(c.time)}`);
          this.emit('exit', exit);
          this.completeTracker(t, exit.reason, exit.price, c.time);
          
          if (exit.reason === 'sl3' && this.p.useBbStrategy) {
            console.log(`[SignalEngine] 🔄 SL3 손절(완전 이탈) → BB(Breaker Block) 전환 | ${sym} | mid=${t.ob.mid.toFixed(4)}`);
            this.trackers.push({
              ob: { ...t.ob, type: t.ob.type === 'bull' ? 'bear' : 'bull', isBb: true },
              phase: 'scanning',
              lookAfterTime: c.time,
              waitCount: 0, holdCount: 0
            });
          }
          
          toRemove.push(i);
          continue;
        }
        t.holdCount++;
      }
    }

    // 완료된 tracker 역순 제거
    for (let k = toRemove.length - 1; k >= 0; k--) {
      this.trackers.splice(toRemove[k], 1);
    }
  }

  // 봇이 실시간 mid 터치로 진입을 먼저 잡았을 때, 모니터링 즉시 동기화용.
  // 해당 waiting_entry 트래커를 active로 전환하고 EntrySignal 반환 (없으면 null)
  markEntered(symbol: string, key: string): EntrySignal | null {
    const t = this.trackers.find(
      x => x.ob.symbol === symbol && SignalEngine.key(x.ob) === key && x.phase === 'waiting_entry',
    );
    if (!t) return null;
    t.phase = 'active';
    t.holdCount = 0;
    t.entryTime = Math.floor(Date.now() / 1000);
    const label = t.ob.isBb ? 'BB' : 'OB';
    console.log(`[SignalEngine] 🟢 진입(active, 실시간 터치) | ${label} ${symbol} | ${key}`);
    return this.buildSignal(t, Math.floor(Date.now() / 1000));
  }

  updateParams(params: Partial<SignalEngineParams>) {
    this.p = { ...this.p, ...params };
    console.log('[SignalEngine] 전략 파라미터가 실시간 업데이트되었습니다:', this.p);
  }

  getParams(): SignalEngineParams {
    return this.p;
  }

  // ── 디버그 ──────────────────────────────────────────────
  getStatus() {
    return {
      trackers: this.trackers.length,
      // active(체결) 단계인 트래커들의 종목 — 모니터링 표시용
      activePositions: this.trackers.filter(t => t.phase === 'active').map(t => t.ob.symbol),
      byPhase: [...this.trackers, ...this.completedTrackers].reduce<Record<string, number>>((acc, t) => {
        acc[t.phase] = (acc[t.phase] ?? 0) + 1;
        return acc;
      }, {}),
      trackersList: [
        ...this.trackers.map(t => {
          const sp = this.getSymbolParams(t.ob.symbol);
          const dir = t.ob.type === 'bull' ? 'long' : 'short';
          const tpPrice = dir === 'long' ? t.ob.mid * (1 + sp.tpPercent / 100) : t.ob.mid * (1 - sp.tpPercent / 100);
          const slPrice = dir === 'long' ? t.ob.mid * (1 - sp.slPercent / 100) : t.ob.mid * (1 + sp.slPercent / 100);
          return {
            symbol:        t.ob.symbol,
            type:          t.ob.type,
            isBb:          t.ob.isBb || false,
            phase:         t.phase,
            mid:           t.ob.mid,
            obTime:        t.ob.time,
            przHitTime:    t.signalTime,
            entryTime:     t.entryTime,
            lookAfterTime: t.lookAfterTime,
            waitCount:     t.waitCount,
            holdCount:     t.holdCount,
            patternName:   this.zoneLabel(t.ob),
            slPrice,
            tp1Price:      tpPrice,
            tp2Price:      tpPrice,
          };
        }),
        ...this.completedTrackers.map(t => {
          const sp = this.getSymbolParams(t.ob.symbol);
          const dir = t.ob.type === 'bull' ? 'long' : 'short';
          const tpPrice = dir === 'long' ? t.ob.mid * (1 + sp.tpPercent / 100) : t.ob.mid * (1 - sp.tpPercent / 100);
          const slPrice = dir === 'long' ? t.ob.mid * (1 - sp.slPercent / 100) : t.ob.mid * (1 + sp.slPercent / 100);
          return {
            symbol:        t.ob.symbol,
            type:          t.ob.type,
            isBb:          t.ob.isBb || false,
            phase:         'done',
            mid:           t.ob.mid,
            obTime:        t.ob.time,
            przHitTime:    t.signalTime,
            entryTime:     t.entryTime,
            lookAfterTime: t.lookAfterTime,
            waitCount:     t.waitCount,
            holdCount:     t.holdCount,
            patternName:   this.zoneLabel(t.ob),
            slPrice,
            tp1Price:      tpPrice,
            tp2Price:      tpPrice,
            exitReason:    t.exitReason,
            exitPrice:     t.exitPrice,
            exitTime:      t.exitTime,
            filled:        Boolean(t.entryTime),
          };
        }),
      ],
    };
  }
}
