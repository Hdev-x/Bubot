// 관찰 전용 모니터링 registry.
//
// 주문용 EngineRegistry와 분리되어 이벤트 fan-out을 하지 않는다.
// 활성 설정의 심볼 universe를 받아 HARMONIC(30m·4h·일봉) / ABCD(4h·일봉·주봉) /
// SMC(월봉·주봉·일봉 OB·FVG)를 항상 관찰한다.
import { EventEmitter } from 'node:events';
import { HarmonicEngine } from './harmonic-engine.ts';
import { AbcdEngine } from './abcd-engine.ts';
import { SmcZoneEngine } from './smc-zone-engine.ts';
import { fetchCandles } from './warmup.ts';
import type { Candle } from './candle-feed.ts';

type MonitorStrategy = 'HARMONIC' | 'ABCD' | 'SMC';
type MonitorKind =
  | 'HARMONIC_30m' | 'HARMONIC_4h' | 'HARMONIC_1d'
  | 'ABCD_4h' | 'ABCD_1d' | 'ABCD_1w'
  | 'SMC_1M' | 'SMC_1w' | 'SMC_1d';
type MonitorEngine = HarmonicEngine | AbcdEngine | SmcZoneEngine;

interface MonitorEntry {
  key: string;
  symbol: string;
  strategy: MonitorStrategy;
  kind: MonitorKind;
  engine: MonitorEngine;
}

function createEngine(kind: MonitorKind): MonitorEngine {
  if (kind === 'HARMONIC_30m') return new HarmonicEngine({}, '30m');
  if (kind === 'HARMONIC_4h') return new HarmonicEngine({}, '4h');
  if (kind === 'HARMONIC_1d') return new HarmonicEngine({}, '1d');
  if (kind === 'ABCD_4h') return new AbcdEngine({}, '4h');
  if (kind === 'ABCD_1d') return new AbcdEngine({}, '1d');
  if (kind === 'ABCD_1w') return new AbcdEngine({}, '1w');
  // SMC 관찰: 월봉/주봉/일봉 OB/FVG 존 + 일봉 추적 (4h 이하 SMC는 사용하지 않음)
  if (kind === 'SMC_1w') return new SmcZoneEngine('1w');
  if (kind === 'SMC_1d') return new SmcZoneEngine('1d');
  return new SmcZoneEngine('1M');
}

function strategyOf(kind: MonitorKind): MonitorStrategy {
  if (kind.startsWith('HARMONIC')) return 'HARMONIC';
  if (kind.startsWith('ABCD')) return 'ABCD';
  return 'SMC';
}

// 모니터링 하모닉 엔진의 패턴 생애주기(signal/active/closed)를 fan-out한다.
// 이벤트: 'patternUpsert' → { signature: entry.key, payload }
export class MonitoringRegistry extends EventEmitter {
  private engines = new Map<string, MonitorEntry>();
  private readonly kinds: MonitorKind[] = [
    'HARMONIC_30m', 'HARMONIC_4h', 'HARMONIC_1d',
    'ABCD_4h', 'ABCD_1d', 'ABCD_1w',
    'SMC_1M', 'SMC_1w', 'SMC_1d',
  ];

  async setSymbols(symbols: string[]): Promise<void> {
    const nextSymbols = new Set(symbols.map(s => s.toUpperCase()));

    for (const key of [...this.engines.keys()]) {
      const entry = this.engines.get(key)!;
      if (!nextSymbols.has(entry.symbol)) this.engines.delete(key);
    }

    for (const symbol of nextSymbols) {
      const created: MonitorEntry[] = [];
      for (const kind of this.kinds) {
        const key = `${symbol}|${kind}`;
        if (this.engines.has(key)) continue;

        const engine = createEngine(kind);
        const entry: MonitorEntry = {
          key,
          symbol,
          kind,
          strategy: strategyOf(kind),
          engine,
        };
        // 하모닉 패턴 생애주기를 DB 영속화용으로 fan-out. 웜업 전에 구독해야
        // 웜업→라이브 전환 flush(setWarmupMode(false))를 받을 수 있다.
        if (engine instanceof HarmonicEngine) {
          engine.on('patternUpsert', (payload: unknown) => {
            this.emit('patternUpsert', { signature: entry.key, payload });
          });
        }
        this.engines.set(key, entry);
        created.push(entry);
      }

      if (created.length > 0) {
        await this.warmUpSymbol(symbol, created);
        await new Promise(r => setTimeout(r, 800)); // 0.8초 대기하여 Rate Limit 방지
      }
    }
  }

  private async warmUpSymbol(symbol: string, entries: MonitorEntry[]): Promise<void> {
    try {
      const candles30m = (await fetchCandles(symbol, '30m', 1200)).slice(0, -1);
      const candles4h = (await fetchCandles(symbol, '4h', 1200)).slice(0, -1);
      // SMC 관찰용: 월봉/주봉/일봉 존 감지 + 일봉 추적 (각 엔진이 interval로 필터링)
      const candles1M = (await fetchCandles(symbol, '1M', 120)).slice(0, -1);
      const candles1w = (await fetchCandles(symbol, '1w', 500)).slice(0, -1);
      const candles1d = (await fetchCandles(symbol, '1d', 1000)).slice(0, -1);
      // 정렬은 캔들 "닫힘" 시각 기준 — open 기준으로 섞으면 월봉이 닫히기 전의
      // 일봉들이 존 확정 이후에 재생되는 lookahead가 생긴다. (1M은 32일로 보수적 근사)
      const closeTime = (c: Candle) => c.time + (
        c.interval === '1M' ? 32 * 86400 :
        c.interval === '1w' ? 7 * 86400 :
        c.interval === '1d' ? 86400 :
        c.interval === '30m' ? 1800 :
        c.interval === '4h' ? 14400 : 3600
      );
      const merged = [...candles30m, ...candles4h, ...candles1M, ...candles1w, ...candles1d]
        .sort((a, b) => closeTime(a) - closeTime(b));

      const originalLog = console.log;
      console.log = () => {};
      try {
        for (const entry of entries) {
          if ('setWarmupMode' in entry.engine) entry.engine.setWarmupMode(true);
        }
        for (const candle of merged) {
          for (const entry of entries) entry.engine.feed(candle);
        }
      } finally {
        for (const entry of entries) {
          if ('setWarmupMode' in entry.engine) entry.engine.setWarmupMode(false);
        }
        console.log = originalLog;
      }
    } catch (err) {
      console.warn(`[MonitoringRegistry] ⚠️ 웜업 실패 ${symbol}:`, (err as Error).message);
    }
  }

  feed(candle: Candle): void {
    const sym = candle.symbol.toUpperCase();
    for (const entry of this.engines.values()) {
      if (entry.symbol === sym) entry.engine.feed(candle);
    }
  }

  activeSymbols(): string[] {
    return [...new Set([...this.engines.values()].map(e => e.symbol))];
  }

  getStatus() {
    return [...this.engines.values()].map(entry => {
      // 하모닉 표시는 차트 동일 스냅샷 위의 표시용 생명주기. 실제 주문 상태머신과 분리.
      const status = entry.engine instanceof HarmonicEngine
        ? (() => {
            const trackersList = entry.engine.getMonitoringSnapshot();
            return {
              trackers: trackersList.length,
              activePositions: [] as string[],
              byPhase: trackersList.reduce<Record<string, number>>((acc, t: any) => {
                acc[t.phase] = (acc[t.phase] ?? 0) + 1;
                return acc;
              }, {}),
              trackersList,
            };
          })()
        : entry.engine.getStatus();
      return {
        signature: entry.key,
        symbol: entry.symbol,
        strategy: entry.strategy,
        kind: entry.kind,
        subscribers: [] as number[],
        status,
      };
    });
  }
}
