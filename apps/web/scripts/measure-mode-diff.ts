/**
 * entry vs display 모드 차이 측정 — 한 종목·TF에서 첫터치 패턴 수·집합 비교.
 * 분석(entry)이 차트(display)와 얼마나 다른 패턴을 보는지 규모 파악용.
 *
 * 실행: npx vite-node apps/web/scripts/measure-mode-diff.ts BTCUSDT 4h
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBacktest, DEFAULT_STRATEGY_PARAMS } from '../src/utils/backtestEngine';
import type { HarmonicAnatomyRow, StrategyParams } from '../src/utils/backtestEngine';
import type { Candle } from '../src/types/market';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sym = process.argv[2] || 'BTCUSDT';
const tf = process.argv[3] || '4h';

const raw = JSON.parse(readFileSync(resolve(ROOT, `ops/verify/fixtures/full/${sym}/${sym}-${tf}.json`), 'utf8'));
const candles: Candle[] = raw.map((r: any) => ({
  time: r.time ?? r[0], open: +(r.open ?? r[1]), high: +(r.high ?? r[2]),
  low: +(r.low ?? r[3]), close: +(r.close ?? r[4]), volume: +(r.volume ?? r[5] ?? 0),
}));

function run(mode: 'entry' | 'display'): HarmonicAnatomyRow[] {
  const params: StrategyParams = {
    ...DEFAULT_STRATEGY_PARAMS,
    useHarmonicStrategy: true,
    harmonicEntryMode: 'immediate',
    harmonicLogScale: true,
    harmonicUseEqFilter: false,
    harmonicEnabledPatterns: [],
    harmonicPredictMode: mode,
  };
  const out: HarmonicAnatomyRow[] = [];
  runBacktest(sym, candles, candles, params, 100, out);
  return out;
}

const key = (r: HarmonicAnatomyRow) => `${r.patternName}|${r.signalTime}`;

console.log(`\n=== ${sym} ${tf} : 캔들 ${candles.length}개 ===`);
const E = run('entry');
const D = run('display');
const eSet = new Set(E.map(key));
const dSet = new Set(D.map(key));
const inter = [...eSet].filter((k) => dSet.has(k)).length;
const onlyE = [...eSet].filter((k) => !dSet.has(k)).length;
const onlyD = [...dSet].filter((k) => !eSet.has(k)).length;

console.log(`entry   첫터치 패턴: ${E.length}`);
console.log(`display 첫터치 패턴: ${D.length}`);
console.log(`\n[집합 비교 (고유 패턴키)]`);
console.log(`  공통(둘 다)      : ${inter}`);
console.log(`  entry에만        : ${onlyE}`);
console.log(`  display에만      : ${onlyD}`);
const union = eSet.size + onlyD;
console.log(`  일치율(자카드)    : ${(inter / union * 100).toFixed(1)}%`);

const slR = (g: HarmonicAnatomyRow[]) => {
  const f = g.filter((r) => r.outcome === 'SL' || r.outcome === 'TP');
  return f.length ? (f.filter((r) => r.outcome === 'SL').length / f.length * 100).toFixed(1) : 'n/a';
};
console.log(`\n[SL율]  entry ${slR(E)}%  /  display ${slR(D)}%`);

// ── 일치율 55% 원인 진단: entry-only가 display에 "이름같고 시점가까운 짝"을 갖는지 ──
const tfSec: Record<string, number> = { '1h': 3600, '4h': 14400, '1d': 86400, '3d': 259200, '1w': 604800 };
const bar = tfSec[tf] ?? 14400;
const entryOnly = E.filter((r) => !dSet.has(key(r)));
function nearestSame(r: HarmonicAnatomyRow, pool: HarmonicAnatomyRow[]) {
  let best = Infinity;
  for (const p of pool) {
    if (p.patternName !== r.patternName || p.dir !== r.dir) continue;
    best = Math.min(best, Math.abs(p.signalTime - r.signalTime));
  }
  return best;
}
const buckets = { '동일시점(0봉)': 0, '근접(1~2봉)': 0, '약간(3~5봉)': 0, '먼/없음(6봉+)': 0 };
for (const r of entryOnly) {
  const d = nearestSame(r, D) / bar;
  if (d === 0) buckets['동일시점(0봉)']++;
  else if (d <= 2) buckets['근접(1~2봉)']++;
  else if (d <= 5) buckets['약간(3~5봉)']++;
  else buckets['먼/없음(6봉+)']++;
}
console.log(`\n[진단] entry에만 있는 ${entryOnly.length}개 → display에서 "이름·방향 같고 시점 가까운 짝" 거리`);
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(16)}: ${v}`);
console.log(`\n→ '근접/약간'이 많으면 = 같은 패턴인데 첫터치 시점만 어긋난 것(차이 과장).`);
console.log(`   '먼/없음'이 많으면 = display가 실제로 제외한 진짜 다른 패턴.`);
