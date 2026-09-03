/**
 * ② 파라미터 최적화 (분석 정합판) — 분석에서 나온 진입조건을 백테스트 차원으로.
 *    진입방식(immediate=첫터치 / close) × 진입깊이 × 고변동필터 × 패턴선택,
 *    htf정렬+유리마감(cp≥0.5) 고정. 손익/MDD 랭킹.
 *
 * 실행: cd frontend && npx vite-node scripts/optimize-harmonic.ts --tf 4h [--top N]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBacktest, DEFAULT_STRATEGY_PARAMS } from '../src/utils/backtestEngine';
import type { StrategyParams, TradeResult } from '../src/utils/backtestEngine';
import type { Candle } from '../src/types/market';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FULL = resolve(ROOT, 'ops/verify/fixtures/full');
const HTF_MAP: Record<string, string> = { '1h': '4h', '4h': '1d', '1d': '1w' };

const argv = process.argv.slice(2);
const argVal = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const TF = argVal('--tf') ?? '4h';
const TOP = argVal('--top') ? Number(argVal('--top')) : Infinity;
const MIN_BARS = 150;
const htfTf = HTF_MAP[TF];

const baseP: StrategyParams = {
  ...DEFAULT_STRATEGY_PARAMS,
  useHarmonicStrategy: true, harmonicLogScale: true,
  harmonicUseEqFilter: false,
  harmonicRequireHtfAlign: true,        // htf정렬 고정(핵심)
  harmonicMinClosePosition: 0.5,        // 유리마감 고정(핵심)
  harmonicMoveStopToBreakeven: false,   // 무의미 → 고정
};

const manifest = JSON.parse(readFileSync(resolve(FULL, '_manifest.json'), 'utf8'));
const symbols: string[] = (manifest.symbols ?? readdirSync(FULL)).slice(0, Number.isFinite(TOP) ? TOP : undefined);

const cache = new Map<string, Candle[] | null>();
function load(symbol: string, tf: string): Candle[] | null {
  const key = `${symbol}-${tf}`;
  if (cache.has(key)) return cache.get(key)!;
  const f = resolve(FULL, symbol, `${key}.json`);
  let out: Candle[] | null = null;
  if (existsSync(f)) { try { const a = JSON.parse(readFileSync(f, 'utf8')); if (Array.isArray(a) && a.length >= MIN_BARS) out = a; } catch { /* */ } }
  cache.set(key, out); return out;
}

function evalP(params: StrategyParams) {
  const trades: TradeResult[] = [];
  for (const symbol of symbols) {
    const entry = load(symbol, TF);
    if (!entry) continue;
    const htf = htfTf ? (load(symbol, htfTf) ?? undefined) : undefined;
    trades.push(...runBacktest(symbol, entry, entry, params, 100, undefined, htf).trades);
  }
  trades.sort((a, b) => a.entryTime - b.entryTime);
  const n = trades.length;
  const wins = trades.filter(t => t.capitalPnl > 0).length;
  const total = trades.reduce((s, t) => s + t.capitalPnl, 0);
  let cum = 0, peak = 0, mdd = 0;
  for (const t of trades) { cum += t.capitalPnl; peak = Math.max(peak, cum); mdd = Math.max(mdd, peak - cum); }
  return { n, wr: n ? wins / n * 100 : 0, total, mdd, score: mdd > 0 ? total / mdd : 0 };
}

type G = { mode: 'immediate' | 'close'; depth: number; atr: number | undefined; pats: string[] };
const grid: G[] = [];
for (const mode of ['immediate', 'close'] as const)
  for (const depth of [0, 0.5])
    for (const atr of [undefined, 1.3])
      for (const pats of [[] as string[], ['Cypher', 'Shark']])
        grid.push({ mode, depth, atr, pats });

console.log(`\n=== ② 분석정합 최적화 (${TF}, 종목 ${symbols.length}, htf정렬+유리마감 고정, 수수료) ===`);
console.log(`조합 ${grid.length}개 | 정렬: 손익/MDD\n`);
const results = grid.map(g => {
  const p: StrategyParams = {
    ...baseP, harmonicEntryMode: g.mode, harmonicEntryDepth: g.depth,
    harmonicMinTouchAtr: g.atr, harmonicEnabledPatterns: g.pats,
  };
  return { g, r: evalP(p) };
});
results.sort((a, b) => b.r.score - a.r.score);
console.log(`${'진입'.padEnd(11)}${'깊이'.padEnd(5)}${'고변동'.padEnd(7)}${'패턴'.padEnd(11)}${'거래'.padStart(5)} ${'승률'.padStart(6)} ${'총손익'.padStart(8)} ${'MDD'.padStart(6)} ${'손익/MDD'.padStart(8)}`);
for (const { g, r } of results) {
  console.log(
    `${(g.mode === 'immediate' ? '첫터치' : '종가확인').padEnd(10)}${String(g.depth).padEnd(5)}` +
    `${(g.atr ? '≥1.3' : '-').padEnd(7)}${(g.pats.length ? 'Cyp+Shk' : '전체').padEnd(10)}` +
    `${String(r.n).padStart(5)} ${r.wr.toFixed(1).padStart(5)}% ${r.total.toFixed(0).padStart(7)}% ${r.mdd.toFixed(0).padStart(5)}% ${r.score.toFixed(2).padStart(8)}`,
  );
}
