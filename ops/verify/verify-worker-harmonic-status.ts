/**
 * 워커 하모닉 상태 회귀 검증
 *
 * 고정 4h 픽스처를 실제 HarmonicEngine.feed()에 순서대로 넣고,
 * 라이브 모니터링 탭이 읽는 getStatus().trackersList 상태를 baseline과 비교한다.
 *
 * 실행:   node --experimental-strip-types ops/verify/verify-worker-harmonic-status.ts
 * 갱신:   node --experimental-strip-types ops/verify/verify-worker-harmonic-status.ts --update
 *
 * 범위: 하모닉 워커 엔진의 상태머신(scanning/signal/active/done) 재현 검증.
 * 주문 API, DB 상태, 포지션 reconciliation은 포함하지 않는다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HarmonicEngine } from '../../labs/trading/worker/src/lib/harmonic-engine.ts';
import type { Candle } from '../../labs/trading/worker/src/lib/candle-feed.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, 'fixtures');
const BASELINE_PATH = join(FIXTURE_DIR, 'expected-worker-harmonic-status.json');

const SYMBOLS = readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith('-4h.json'))
  .map((f) => f.replace('-4h.json', ''))
  .sort();

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

function toWorkerCandle(symbol: string, c: FixtureCandle): Candle {
  return {
    symbol,
    interval: '4h',
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

function trackerLine(t: any): string {
  const side = t.type === 'bull' ? 'bull' : 'bear';
  return [
    t.symbol,
    t.phase,
    side,
    t.patternName ?? '-',
    `id${t.obTime ?? '-'}`,
    `c${t.cTime ?? '-'}`,
    `prz${round(t.mid)}`,
    `sl${round(t.slPrice)}`,
    `tp1${round(t.tp1Price)}`,
    `tp2${round(t.tp2Price)}`,
    `hit${t.przHitTime ?? '-'}`,
    `entry${t.entryTime ?? '-'}`,
    `exit${t.exitTime ?? '-'}`,
    `reason${t.exitReason ?? '-'}`,
    `filled${t.filled ? 1 : 0}`,
    `tp1hit${t.tp1Hit ? 1 : 0}`,
  ].join(' ');
}

function runSymbol(symbol: string): string[] {
  const engine = new HarmonicEngine();
  engine.setWarmupMode(true);

  const candles: FixtureCandle[] = JSON.parse(readFileSync(join(FIXTURE_DIR, `${symbol}-4h.json`), 'utf8'));
  for (const candle of candles) {
    engine.feed(toWorkerCandle(symbol, candle));
  }

  const status = engine.getStatus();
  return status.trackersList.map(trackerLine).sort();
}

function run(): WorkerStatusBaseline {
  const trackers = SYMBOLS.flatMap(runSymbol).sort();
  const summary = trackers.reduce<Record<string, number>>((acc, line) => {
    const phase = line.split(' ')[1] ?? 'unknown';
    acc[phase] = (acc[phase] ?? 0) + 1;
    return acc;
  }, {});
  return { summary, trackers };
}

const actual = run();

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(actual, null, 1));
  console.log('✅ worker harmonic baseline 갱신:', BASELINE_PATH);
  console.log('   상태 수:', JSON.stringify(actual.summary));
} else {
  let baseline: WorkerStatusBaseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error('❌ worker harmonic baseline 없음 — 먼저 --update로 생성하세요.');
    process.exit(1);
  }

  const expected = baseline.trackers ?? [];
  const current = actual.trackers ?? [];
  const missing = expected.filter((s) => !current.includes(s));
  const added = current.filter((s) => !expected.includes(s));

  if (missing.length || added.length) {
    console.error(`❌ worker harmonic 상태 불일치: 기준 ${expected.length}개 vs 현재 ${current.length}개`);
    console.error(`   기준 phase: ${JSON.stringify(baseline.summary ?? {})}`);
    console.error(`   현재 phase: ${JSON.stringify(actual.summary)}`);
    for (const s of missing.slice(0, 10)) console.error(`   - 사라짐: ${s}`);
    for (const s of added.slice(0, 10)) console.error(`   + 새로 생김: ${s}`);
    console.error('\n의도된 워커 상태머신 변경이면: node --experimental-strip-types ops/verify/verify-worker-harmonic-status.ts --update');
    process.exit(1);
  }

  console.log('✅ worker harmonic 상태 동일성 통과 —', JSON.stringify(actual.summary));
}
