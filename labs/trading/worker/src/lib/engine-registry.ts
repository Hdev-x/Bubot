// 엔진 레지스트리 — 신호는 (심볼+전략+파라미터)에만 의존하므로 중복 제거.
// signature = hash(symbol, strategy, engineParams)별로 SignalEngine 1개만 두고,
// 같은 signature를 쓰는 여러 설정(configId)이 그 엔진을 공유한다.
// 신호 이벤트는 그 signature 구독 설정 전체로 fan-out → 주문 단계(워커)에서만
// 설정별 creds/investUsdt/leverage로 갈린다.
import { EventEmitter } from 'events';
import crypto from 'crypto';
import { SignalEngine } from './signal-engine.ts';
import { HarmonicEngine } from './harmonic-engine.ts';
import { AbcdEngine } from './abcd-engine.ts';
import { warmUpEngine } from './warmup.ts';
import { toEngineParams, type TradeConfig } from './config-loader.ts';
import type { Candle } from './candle-feed.ts';

interface EngineEntry {
  engine:      SignalEngine | HarmonicEngine | AbcdEngine;
  signature:   string;
  symbol:      string;
  strategy:    TradeConfig['strategy'];
  subscribers: Set<number>;  // configId 집합
}

/** (symbol, strategy, engineParams)로 안정적 signature 생성. */
export function computeSignature(cfg: TradeConfig): string {
  const params = toEngineParams(cfg);
  // 키 순서 안정화를 위해 정렬된 JSON 사용
  const norm = JSON.stringify(params, Object.keys(params).sort());
  const raw  = `${cfg.symbol}|${cfg.strategy}|${norm}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

// 워커로 재방출되는 이벤트 페이로드. configIds = 이 신호를 받을 구독 설정들.
export interface RegistryEvent {
  signature: string;
  symbol:    string;
  configIds: number[];
  payload:   any;  // EntrySignal | ExitSignal | { symbol, ob }
}

export class EngineRegistry extends EventEmitter {
  private engines = new Map<string, EngineEntry>();

  /**
   * 설정을 엔진에 구독시키고 signature 반환. 신규 signature면 엔진 생성→웜업→이벤트 배선.
   * 웜업(과거 캔들 주입)을 배선 *이전*에 끝내 과거 신호가 fan-out돼 주문되는 사고를 막는다.
   */
  async subscribe(cfg: TradeConfig): Promise<string> {
    const sig = computeSignature(cfg);
    let e = this.engines.get(sig);
    if (!e) {
      const params = toEngineParams(cfg);
      const engine = cfg.strategy === 'HARMONIC'
        ? new HarmonicEngine(params)
        : cfg.strategy === 'ABCD'
          ? new AbcdEngine(params)
          : new SignalEngine(params);
      e = { engine, signature: sig, symbol: cfg.symbol.toUpperCase(), strategy: cfg.strategy, subscribers: new Set() };
      this.engines.set(sig, e);
      try {
        await warmUpEngine(engine, [e.symbol]);
        await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        console.warn(`[Registry] ⚠️ 웜업 실패 sig=${sig} ${e.symbol}:`, (err as Error).message);
      }
      this.wire(e);  // 웜업 후 배선 → 과거 캔들 신호는 리스너가 없어 fan-out 안 됨
      console.log(`[Registry] 🆕 엔진 생성+웜업 | sig=${sig} ${e.symbol} ${cfg.strategy}`);
    }
    e.subscribers.add(cfg.id);
    return sig;
  }

  /** 특정 signature의 엔진(reconcile 시 트래커 매칭용). */
  getEngine(signature: string): SignalEngine | HarmonicEngine | AbcdEngine | undefined {
    return this.engines.get(signature)?.engine;
  }

  /** 설정 구독 해제. 구독자 0이면 엔진 폐기. */
  unsubscribe(configId: number, signature: string): void {
    const e = this.engines.get(signature);
    if (!e) return;
    e.subscribers.delete(configId);
    if (e.subscribers.size === 0) {
      this.engines.delete(signature);
      console.log(`[Registry] 🗑 엔진 폐기 | sig=${signature} ${e.symbol}`);
    }
  }

  /** 공유 시세 캔들을 해당 심볼 엔진들에 전달. */
  feed(candle: Candle): void {
    const sym = candle.symbol.toUpperCase();
    for (const e of this.engines.values()) {
      if (e.symbol === sym) e.engine.feed(candle);
    }
  }

  /** 현재 구독 중인 모든 심볼(합집합) — MarketFeed.setSymbols()용. */
  activeSymbols(): string[] {
    return [...new Set([...this.engines.values()].map(e => e.symbol))];
  }

  getStatus() {
    return [...this.engines.values()].map(e => ({
      signature:   e.signature,
      symbol:      e.symbol,
      strategy:    e.strategy,
      subscribers: [...e.subscribers],
    }));
  }

  getDetailedStatus() {
    return [...this.engines.values()].map(e => ({
      signature:   e.signature,
      symbol:      e.symbol,
      strategy:    e.strategy,
      subscribers: [...e.subscribers],
      status:      e.engine.getStatus(),
    }));
  }

  // 엔진 이벤트를 RegistryEvent로 재방출(구독자 목록 첨부). 구독자는 emit 시점에 동적 평가.
  private wire(e: EngineEntry): void {
    const relay = (evt: string) => (payload: any) => {
      const ev: RegistryEvent = {
        signature: e.signature,
        symbol:    e.symbol,
        configIds: [...e.subscribers],
        payload,
      };
      this.emit(evt, ev);
    };
    e.engine.on('signal',        relay('signal'));
    e.engine.on('entry',         relay('entry'));
    e.engine.on('exit',          relay('exit'));
    e.engine.on('signal_cancel', relay('signal_cancel'));
    // 패턴 생애주기 DB 영속화는 모니터링 레지스트리(MonitoringRegistry)에서 담당한다.
    // 트레이딩 엔진은 주문 실행 전용이라 patternUpsert를 relay하지 않는다.
  }
}
