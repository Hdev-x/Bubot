/**
 * 레짐 재검증 — 백테스트 후보(primary)를 다른 시장 레짐(과거 창)에서 재검증.
 * 실행: cd frontend && npx vite-node scripts/revalidate-regime.ts
 *
 * run-experiments는 "최근 N봉"만 fetch한다(=2024~2026 우호 레짐). 이 스크립트는 endTime을 줘
 * 과거 창(기본 ~2024-03 이전 5000 4h봉 ≈ 2021-12~2024-03, 2022 베어 포함)을 받아 같은 엔진·
 * 같은 primary config로 돌려 PF가 레짐 밖에서도 유지되는지 본다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBacktest, DEFAULT_STRATEGY_PARAMS } from '../src/utils/backtestEngine';
import type { BacktestResult, StrategyParams } from '../src/utils/backtestEngine';
import { buildReport, buildSegmentReports, summarizeReport } from '../src/utils/backtestReport';
import { normalizeConfig, toLegacyBacktest } from '../../shared/strategy-schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = resolve(ROOT, 'ops/verify/fixtures');
const PRIMARY_RESULT = resolve(ROOT, 'docs/experiments/results/2026-06-13-eq-fvg-universe-filter.json');

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

// 과거 창 끝(이 시각 이전 totalBars개를 받음). 기본 = 2024-03-01 UTC (현행 픽스처 시작 직전).
const END_MS = Date.parse(process.env.REVAL_END ?? '2024-03-01T00:00:00Z');

async function fetchOld(symbol: string, interval: string, totalBars: number, endMs: number): Promise<Candle[]> {
  const out: Candle[] = [];
  let endTime: number | undefined = endMs;
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));
    if (endTime) url.searchParams.set('endTime', String(endTime));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${symbol} ${interval} HTTP ${res.status}`);
    const rows = (await res.json()) as any[];
    if (!rows.length) break;
    const page: Candle[] = rows.map(r => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
    }));
    out.unshift(...page);
    endTime = Number(rows[0][0]) - 1;
    if (rows.length < limit) break;
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

// 비교할 손익비(targetR) 목록 — 같은 데이터에 대해 여러 R을 돌려 비교
const R_VALUES = (process.env.REVAL_R ?? '2,1').split(',').map(Number);
// 손절 위치: 'edge'(존 반대편 끝, 기본) | 'mid'(CE) | 'half'(진입↔CE 중간)
type StopMode = 'edge' | 'mid' | 'half';
const STOP_MODE_RAW = process.env.REVAL_STOP ?? 'edge';
const STOP_MODE: StopMode = STOP_MODE_RAW === 'mid' || STOP_MODE_RAW === 'half' ? STOP_MODE_RAW : 'edge';
const STOP_LABEL: Record<StopMode, string> = {
  edge: 'edge(원단)',
  mid: 'CE(mid)',
  half: 'entry-CE 0.5',
};

async function main(): Promise<void> {
  const rawConfig = JSON.parse(readFileSync(PRIMARY_RESULT, 'utf8')).candidates[0].config;
  const cfg = normalizeConfig(rawConfig);
  const legacy = toLegacyBacktest(cfg);
  const baseParams: StrategyParams = { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params } as StrategyParams;

  const symbols = readdirSync(FIXTURES).filter(f => f.endsWith('-4h.json')).map(f => f.replace('-4h.json', ''));
  const windowEnd = new Date(END_MS).toISOString().slice(0, 10);
  const isRecent = END_MS >= Date.now() - 86400_000 * 2;
  console.log(`레짐 재검증 — primary "${cfg.name}"`);
  console.log(`창 끝: ${windowEnd}${isRecent ? '(최근)' : '(과거)'} 이전, universe ${symbols.length}종, R=${R_VALUES.join('/')}, 손절=${STOP_LABEL[STOP_MODE]}\n`);

  // 1) 캔들은 한 번만 수집해 캐시
  type Pair = { symbol: string; ob: Candle[]; entry: Candle[] };
  const pairs: Pair[] = [];
  const skipped: string[] = [];
  const MIN_ENTRY_BARS = 2000;
  for (const symbol of symbols) {
    try {
      const entry = await fetchOld(symbol, '4h', 5000, END_MS);
      if (entry.length < MIN_ENTRY_BARS) { skipped.push(`${symbol}(${entry.length}봉)`); continue; }
      const ob = await fetchOld(symbol, '1w', 1000, END_MS);
      if (!ob.length) { skipped.push(`${symbol}(zone없음)`); continue; }
      pairs.push({ symbol, ob, entry });
      process.stdout.write(`  ${symbol} ✓\n`);
    } catch (e: any) {
      skipped.push(`${symbol}(${e.message})`);
    }
  }
  if (!pairs.length) { console.log('유효 결과 없음'); return; }

  // 2) 같은 데이터에 대해 R마다 백테스트
  console.log(`\n=== 결과 (${pairs.length}종, 창 ${windowEnd} 이전) ===`);
  console.log(`| R(손익비) | PF | 거래 | 승률 | MDD% | net | holdout PF |`);
  console.log(`|---|---|---|---|---|---|---|`);
  for (const R of R_VALUES) {
    const params: StrategyParams = {
      ...baseParams,
      targetR: R,
      zoneStopAtMid: STOP_MODE === 'mid',
      zoneStopToMidFrac: STOP_MODE === 'half' ? 0.5 : undefined,
    };
    const results: BacktestResult[] = [];
    for (const p of pairs) results.push(runBacktest(p.symbol, p.ob, p.entry, params, legacy.initialCapital));
    const capital = legacy.initialCapital * results.length;
    const report = buildReport(results, capital);
    const segments = buildSegmentReports(results, capital);
    const holdPF = segments ? segments.holdout.report.profitFactor.toFixed(2) : '-';
    console.log(`| 1:${R} | ${report.profitFactor.toFixed(2)} | ${report.trades} | ${report.winRate.toFixed(1)}% | ${report.maxDrawdownPct.toFixed(1)} | ${report.netProfit.toFixed(0)} | ${holdPF} |`);
  }
  if (skipped.length) console.log(`\n제외(데이터 부족) ${skipped.length}종: ${skipped.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
