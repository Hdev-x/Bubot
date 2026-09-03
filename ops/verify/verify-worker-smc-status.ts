/**
 * 워커 SMC 상태 회귀 검증
 *
 * 고정 4h 픽스처를 SignalEngine(OB/FVG/BB)에 넣고 getStatus().trackersList를 baseline과 비교한다.
 *
 * 실행:   node --experimental-strip-types ops/verify/verify-worker-smc-status.ts
 * 갱신:   node --experimental-strip-types ops/verify/verify-worker-smc-status.ts --update
 *
 * 범위: SMC 워커 상태 출력의 결정성 검증. 별도 1h 픽스처가 아직 없으므로,
 * 4h 캔들을 4h 감지 피드와 coarse 1h 상태 피드로 함께 넣는다.
 * 정밀한 1h 터치 재현은 별도 픽스처가 생기면 확장한다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SignalEngine } from '../../labs/trading/worker/src/lib/signal-engine.ts';
import type { Candle } from '../../labs/trading/worker/src/lib/candle-feed.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures');
const BASELINE_PATH = join(FIXTURE_DIR, 'expected-worker-smc-status.json');

const SYMBOLS = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('-4h.json'))
  .map((f) => f.replace('-4h.json', ''))
  .sort();

const MODES = [
  { name: 'OB', params: {} },
  { name: 'FVG', params: { useFvgStrategy: true } },
  { name: 'BB', params: { useBbStrategy: true, useSl3: true } },
] as const;

type FixtureCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type WorkerStatusBaseline = {
  summary: Record<string, number>;
  trackers: string[];
};

function toCandle(symbol: string, interval: '4h' | '1h', c: FixtureCandle): Candle {
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

function round(n: number | undefined): string {
  return n === undefined ? '-' : n.toFixed(4);
}

function trackerLine(mode: string, t: any): string {
  const side = t.type === 'bull' ? 'bull' : 'bear';
  return [
    mode,
    t.symbol,
    t.phase,
    side,
    t.patternName ?? '-',
    `id${t.obTime ?? '-'}`,
    `mid${round(t.mid)}`,
    `sl${round(t.slPrice)}`,
    `tp${round(t.tp2Price ?? t.tp1Price)}`,
    `look${t.lookAfterTime ?? '-'}`,
    `hit${t.przHitTime ?? '-'}`,
    `entry${t.entryTime ?? '-'}`,
    `exit${t.exitTime ?? '-'}`,
    `reason${t.exitReason ?? '-'}`,
    `filled${t.filled ? 1 : 0}`,
  ].join(' ');
}

function runSymbol(mode: string, params: Record<string, unknown>, symbol: string): string[] {
  const engine = new SignalEngine({
    tpPercent: 0.5,
    slPercent: 3,
    maxWaitCandles: 40,
    maxHoldCandles: 100,
    longOnly: false,
    useSl3: false,
    useBbStrategy: false,
    ...params,
  });

  const candles: FixtureCandle[] = JSON.parse(readFileSync(join(FIXTURE_DIR, `${symbol}-4h.json`), 'utf8'));
  const originalLog = console.log;
  console.log = () => {};
  try {
    for (const candle of candles) {
      engine.feed(toCandle(symbol, '4h', candle));
      engine.feed(toCandle(symbol, '1h', candle));
    }
  } finally {
    console.log = originalLog;
  }

  const status = engine.getStatus();
  return status.trackersList.map((t: any) => trackerLine(mode, t)).sort();
}

function run(): WorkerStatusBaseline {
  const trackers = MODES.flatMap(mode =>
    SYMBOLS.flatMap(symbol => runSymbol(mode.name, mode.params, symbol))
  ).sort();
  const summary = trackers.reduce<Record<string, number>>((acc, line) => {
    const [mode, , phase] = line.split(' ');
    const key = `${mode}:${phase}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return { summary, trackers };
}

const actual = run();

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(actual, null, 1));
  console.log('✅ worker smc baseline 갱신:', BASELINE_PATH);
  console.log('   상태 수:', JSON.stringify(actual.summary));
} else {
  let baseline: WorkerStatusBaseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error('❌ worker smc baseline 없음 — 먼저 --update로 생성하세요.');
    process.exit(1);
  }

  const expected = baseline.trackers ?? [];
  const current = actual.trackers ?? [];
  const missing = expected.filter((s) => !current.includes(s));
  const added = current.filter((s) => !expected.includes(s));

  if (missing.length || added.length) {
    console.error(`❌ worker smc 상태 불일치: 기준 ${expected.length}개 vs 현재 ${current.length}개`);
    console.error(`   기준 phase: ${JSON.stringify(baseline.summary ?? {})}`);
    console.error(`   현재 phase: ${JSON.stringify(actual.summary)}`);
    for (const s of missing.slice(0, 10)) console.error(`   - 사라짐: ${s}`);
    for (const s of added.slice(0, 10)) console.error(`   + 새로 생김: ${s}`);
    console.error('\n의도된 SMC 상태머신 변경이면: node --experimental-strip-types ops/verify/verify-worker-smc-status.ts --update');
    process.exit(1);
  }

  console.log('✅ worker smc 상태 동일성 통과 —', JSON.stringify(actual.summary));
}
