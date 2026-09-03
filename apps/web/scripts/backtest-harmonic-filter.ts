/**
 * ① 진입 필터 정식 백테스트 — "유리마감+htf정렬" 필터를 실제 하모닉 백테스트
 *    (0.5진입·수수료·다중포지션)에 넣어 필터 OFF/ON 실손익 비교.
 *
 * 실행: cd frontend && npx vite-node scripts/backtest-harmonic-filter.ts --tf 4h [--top N]
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

const base: StrategyParams = {
  ...DEFAULT_STRATEGY_PARAMS,
  useHarmonicStrategy: true,
  harmonicLogScale: true,
  harmonicEntryMode: 'close',
  harmonicUseEqFilter: false, // 표본 최대화(필터 효과만 보기)
  harmonicEnabledPatterns: [],
};

const manifest = JSON.parse(readFileSync(resolve(FULL, '_manifest.json'), 'utf8'));
const symbols: string[] = (manifest.symbols ?? readdirSync(FULL)).slice(0, Number.isFinite(TOP) ? TOP : undefined);
const htfTf = HTF_MAP[TF];

function loadCandles(symbol: string, tf: string): Candle[] | null {
  const f = resolve(FULL, symbol, `${symbol}-${tf}.json`);
  if (!existsSync(f)) return null;
  try { const a = JSON.parse(readFileSync(f, 'utf8')); return Array.isArray(a) && a.length >= MIN_BARS ? a : null; }
  catch { return null; }
}

// 설정별 전 종목 백테스트 → trades 집계
function run(label: string, params: StrategyParams) {
  const trades: TradeResult[] = [];
  for (const symbol of symbols) {
    const entry = loadCandles(symbol, TF);
    if (!entry) continue;
    const htf = htfTf ? (loadCandles(symbol, htfTf) ?? undefined) : undefined;
    const res = runBacktest(symbol, entry, entry, params, 100, undefined, htf);
    trades.push(...res.trades);
  }
  trades.sort((a, b) => a.entryTime - b.entryTime);
  const n = trades.length;
  const wins = trades.filter(t => t.capitalPnl > 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.capitalPnl, 0);
  // 누적 자본곡선 MDD (capitalPnl 단순합 기준)
  let cum = 0, peak = 0, mdd = 0;
  for (const t of trades) { cum += t.capitalPnl; peak = Math.max(peak, cum); mdd = Math.max(mdd, peak - cum); }
  const wr = n ? wins / n * 100 : 0;
  const avg = n ? totalPnl / n : 0;
  console.log(
    `  ${label.padEnd(26)} 거래 ${String(n).padStart(5)} | 승률 ${wr.toFixed(1)}% | ` +
    `총손익 ${totalPnl.toFixed(0).padStart(6)}% | 거래당 ${avg.toFixed(2).padStart(5)}% | ` +
    `MDD ${mdd.toFixed(0).padStart(5)}% | 손익/MDD ${mdd > 0 ? (totalPnl / mdd).toFixed(2) : '-'}`,
  );
}

console.log(`\n=== 진입 필터 정식 백테스트 (${TF}, 종목 ${symbols.length}, htf=${htfTf ?? '-'}, 수수료 포함) ===`);
console.log(`(레버리지 ${base.leverage}x, EQ필터 OFF, 0.5진입)\n`);
run('① 무필터', base);
run('② htf정렬만', { ...base, harmonicRequireHtfAlign: true });
run('③ 유리마감만(cp≥0.5)', { ...base, harmonicMinClosePosition: 0.5 });
run('④ 유리마감+htf정렬', { ...base, harmonicMinClosePosition: 0.5, harmonicRequireHtfAlign: true });
