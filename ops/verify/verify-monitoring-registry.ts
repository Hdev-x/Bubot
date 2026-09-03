/**
 * 관찰 전용 MonitoringRegistry 회귀 검증
 *
 * 한 심볼 universe에 HARMONIC(1h·4h·일봉) / AB=CD(4h·일봉·주봉) /
 * SMC(월봉·주봉·일봉 OB·FVG) 관찰 엔진이 모두 생성되고,
 * 주문 이벤트 없이 snapshot용 trackers를 만들 수 있는지 확인한다.
 *
 * 실행: node --experimental-strip-types ops/verify/verify-monitoring-registry.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MonitoringRegistry } from '../../labs/trading/worker/src/lib/monitoring-registry.ts';
import type { Candle } from '../../labs/trading/worker/src/lib/candle-feed.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures');
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'FARTCOINUSDT'];

type FixtureCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toCandle(symbol: string, interval: '4h' | '1h' | '1d' | '1w' | '1M', c: FixtureCandle): Candle {
  return {
    symbol,
    interval,
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    isClosed: true,
  };
}

const registry = new MonitoringRegistry();

const originalLog = console.log;
const originalWarn = console.warn;
console.log = () => {};
console.warn = () => {};
try {
  await registry.setSymbols(SYMBOLS);

  for (const symbol of SYMBOLS) {
    const candles: FixtureCandle[] = JSON.parse(readFileSync(join(FIXTURE_DIR, `${symbol}-4h.json`), 'utf8'));
    for (const candle of candles) {
      registry.feed(toCandle(symbol, '4h', candle));
      registry.feed(toCandle(symbol, '1h', candle));
      // SMC 존 관찰 엔진 동작 확인용 — 같은 픽스처를 1M/1w/1d(존 감지+추적)로도 주입
      registry.feed(toCandle(symbol, '1M', candle));
      registry.feed(toCandle(symbol, '1w', candle));
      registry.feed(toCandle(symbol, '1d', candle));
    }
  }
} finally {
  console.log = originalLog;
  console.warn = originalWarn;
}

const status = registry.getStatus();
const engineCounts = status.reduce<Record<string, number>>((acc, entry) => {
  acc[entry.strategy] = (acc[entry.strategy] ?? 0) + 1;
  return acc;
}, {});
const trackerCounts = status.reduce<Record<string, number>>((acc, entry) => {
  const key = entry.strategy;
  acc[key] = (acc[key] ?? 0) + entry.status.trackersList.length;
  return acc;
}, {});

const expectedEngines = {
  HARMONIC: SYMBOLS.length * 3, // 1h + 4h + 일봉
  ABCD: SYMBOLS.length * 3,     // 4h + 일봉 + 주봉
  SMC: SYMBOLS.length * 3, // 월봉 + 주봉 + 일봉
};

for (const [strategy, count] of Object.entries(expectedEngines)) {
  if (engineCounts[strategy] !== count) {
    console.error(`❌ ${strategy} 엔진 수 불일치: 기대 ${count}, 현재 ${engineCounts[strategy] ?? 0}`);
    process.exit(1);
  }
}

if ((trackerCounts.HARMONIC ?? 0) === 0 || (trackerCounts.ABCD ?? 0) === 0 || (trackerCounts.SMC ?? 0) === 0) {
  console.error('❌ 관찰 tracker가 비어 있음:', JSON.stringify(trackerCounts));
  process.exit(1);
}

console.log('✅ monitoring registry 통과 — engines', JSON.stringify(engineCounts), 'trackers', JSON.stringify(trackerCounts));
