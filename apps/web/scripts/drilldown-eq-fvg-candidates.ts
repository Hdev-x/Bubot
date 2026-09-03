import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_FEE_PCT,
  DEFAULT_FUNDING_PCT_8H,
  DEFAULT_SLIPPAGE_PCT,
  DEFAULT_STRATEGY_PARAMS,
  runBacktest,
} from '../src/utils/backtestEngine';
import type { BacktestResult, StrategyParams, TradeResult } from '../src/utils/backtestEngine';
import type { Candle } from '../src/types/market';
import {
  buildReport,
  buildSegmentReports,
  summarizeReport,
} from '../src/utils/backtestReport';
import type { BacktestReport, ReportInput, ReportSummary } from '../src/utils/backtestReport';
import { normalizeConfig, toLegacyBacktest } from '../../shared/strategy-schema';
import type { StrategyConfigInput } from '../../shared/strategy-schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_DIR = resolve(ROOT, 'docs/experiments/results');
const MARKET_PROXY_BASE = normalizeApiBase(process.env.EXPERIMENT_MARKET_API_URL);
const ENTRY_BARS = 5000;
const ZONE_BARS = 1000;
const INITIAL_CAPITAL = 100;
const STRESS_MULTIPLIER = 1.5;

const BINANCE_FUTURES_SYMBOL_ALIASES: Record<string, string> = {
  PEPEUSDT: '1000PEPEUSDT',
};

const CANDIDATES = [
  {
    key: 'primary-r2-risk15-vol2-accept2-age30',
    label: '주력: R2 risk15 vol2 accept2 age30',
    targetR: 2,
    maxZoneRiskPct: 15,
    entryVolumeMaxMultiple: 2,
    acceptanceStopBars: 2,
    maxZoneAgeDays: 30,
  },
  {
    key: 'alt-risk20-r2-vol2-accept2-age30',
    label: '대안: R2 risk20 vol2 accept2 age30',
    targetR: 2,
    maxZoneRiskPct: 20,
    entryVolumeMaxMultiple: 2,
    acceptanceStopBars: 2,
    maxZoneAgeDays: 30,
  },
  {
    key: 'aggressive-r25-risk15-vol2-accept2-age30',
    label: '공격형: R2.5 risk15 vol2 accept2 age30',
    targetR: 2.5,
    maxZoneRiskPct: 15,
    entryVolumeMaxMultiple: 2,
    acceptanceStopBars: 2,
    maxZoneAgeDays: 30,
  },
] as const;

type CandidateSpec = typeof CANDIDATES[number];
type CandleWithNotional = Candle & { quoteVolumeApprox: number };
type FlatTrade = TradeResult & { symbol: string };

type SymbolRow = {
  symbol: string;
  liquidityRank: number;
  avgQuoteVolume4h: number;
  trades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdownPct: number;
  positiveMonthRate: number;
};

type SubsetRow = {
  name: string;
  symbols: string[];
  report: ReportSummary;
  holdout: ReportSummary | null;
  costStress: ReportSummary;
};

function normalizeApiBase(raw?: string): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

function toBinanceFuturesSymbol(symbol: string): string {
  return BINANCE_FUTURES_SYMBOL_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

function getSymbols(): string[] {
  return readdirSync(resolve(ROOT, 'ops/verify/fixtures'))
    .filter(f => f.endsWith('-4h.json'))
    .map(f => f.replace('-4h.json', ''))
    .sort();
}

async function getMarketProxyHeaders(): Promise<Record<string, string> | undefined> {
  if (!MARKET_PROXY_BASE) return undefined;
  const user = process.env.EXPERIMENT_MARKET_API_USER ?? process.env.EXPERIMENT_API_USER;
  const pass = process.env.EXPERIMENT_MARKET_API_PASS ?? process.env.EXPERIMENT_API_PASS;
  if (!user || !pass) {
    throw new Error('캔들 프록시 사용 시 EXPERIMENT_API_USER/PASS env 필요');
  }
  const loginRes = await fetch(`${MARKET_PROXY_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) throw new Error(`캔들 프록시 로그인 실패 HTTP ${loginRes.status}`);
  const { token } = await loginRes.json() as { token?: string };
  if (!token) throw new Error('캔들 프록시 로그인 응답에 token 없음');
  return { Authorization: `Bearer ${token}` };
}

function getKlinesUrl(apiSymbol: string, interval: string, limit: number, endTime?: number): URL {
  if (!MARKET_PROXY_BASE && process.env.GITHUB_ACTIONS === 'true') {
    throw new Error('GitHub Actions 캔들 수집은 EXPERIMENT_MARKET_API_URL env 필요');
  }
  const url = new URL(MARKET_PROXY_BASE
    ? `${MARKET_PROXY_BASE}/coin/api/binance/futures/candles`
    : 'https://fapi.binance.com/fapi/v1/klines');
  url.searchParams.set('symbol', apiSymbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));
  if (endTime) url.searchParams.set('endTime', String(endTime));
  return url;
}

function asKlineRows(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

const candleCache = new Map<string, CandleWithNotional[]>();

async function fetchKlines(symbol: string, interval: string, totalBars: number): Promise<CandleWithNotional[]> {
  const key = `${symbol}-${interval}`;
  const cached = candleCache.get(key);
  if (cached) return cached;

  const out: CandleWithNotional[] = [];
  let endTime: number | undefined;
  const headers = await getMarketProxyHeaders();
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = getKlinesUrl(toBinanceFuturesSymbol(symbol), interval, limit, endTime);
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) throw new Error(`${symbol} ${interval} ${MARKET_PROXY_BASE ? 'proxy' : 'Binance'} HTTP ${res.status}`);
    const rows = asKlineRows(await res.json());
    if (!rows.length) break;
    const page: CandleWithNotional[] = rows.map(r => {
      const close = +r[4];
      const volume = +r[5];
      return {
        time: Math.floor(Number(r[0]) / 1000),
        open: +r[1],
        high: +r[2],
        low: +r[3],
        close,
        volume,
        quoteVolumeApprox: Number.isFinite(+r[7]) ? +r[7] : close * volume,
      };
    });
    out.unshift(...page);
    endTime = Number(rows[0][0]) - 1;
    if (rows.length < limit) break;
  }
  out.sort((a, b) => Number(a.time) - Number(b.time));
  candleCache.set(key, out);
  return out;
}

function inputForCandidate(c: CandidateSpec): StrategyConfigInput {
  return {
    name: `EQ FVG drilldown ${c.key}`,
    symbol: 'BTCUSDT',
    timeframe: '4h',
    zoneTimeframe: '1w',
    risk: {
      investUsdt: 100,
      leverage: 10,
      maxLossPct: 0,
      capitalMode: 'fixed',
      positionPct: 10,
      initialCapital: INITIAL_CAPITAL,
    },
    execution: {
      entryMode: 'immediate',
      tp1Pct: 50,
      tp2Pct: 50,
      slCapPct: 10,
      moveStopToBreakeven: false,
      maxWaitCandles: 40,
      maxHoldCandles: 120,
      useZoneRiskReward: true,
      targetR: c.targetR,
      maxZoneAgeDays: c.maxZoneAgeDays,
      useConfirmTimeEntry: true,
      maxZoneRiskPct: c.maxZoneRiskPct,
      avoidHighVolumeEntry: true,
      entryVolumeLookback: 20,
      entryVolumeMaxMultiple: c.entryVolumeMaxMultiple,
      acceptanceStopBars: c.acceptanceStopBars,
    },
    cost: {
      feePct: DEFAULT_FEE_PCT,
      slippagePct: DEFAULT_SLIPPAGE_PCT,
      fundingPctPer8h: DEFAULT_FUNDING_PCT_8H,
    },
    detector: {
      kind: 'FVG',
      entryAtBorder: true,
      entryAtLow: false,
      signalDeep: false,
    },
  };
}

function paramsForCandidate(c: CandidateSpec): StrategyParams {
  const legacy = toLegacyBacktest(normalizeConfig(inputForCandidate(c)));
  return { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params } as StrategyParams;
}

function stressParams(params: StrategyParams): StrategyParams {
  return {
    ...params,
    feePct: (params.feePct ?? DEFAULT_FEE_PCT) * STRESS_MULTIPLIER,
    slippagePct: (params.slippagePct ?? DEFAULT_SLIPPAGE_PCT) * STRESS_MULTIPLIER,
    fundingPctPer8h: (params.fundingPctPer8h ?? DEFAULT_FUNDING_PCT_8H) * STRESS_MULTIPLIER,
  };
}

function reportFor(results: BacktestResult[]): BacktestReport {
  return buildReport(results, INITIAL_CAPITAL * Math.max(results.length, 1));
}

function summarize(results: BacktestResult[]): ReportSummary {
  return summarizeReport(reportFor(results));
}

function subsetRows(
  results: BacktestResult[],
  stressResults: BacktestResult[],
  liquidityRanks: { symbol: string; avgQuoteVolume4h: number }[],
): SubsetRow[] {
  const top10 = liquidityRanks.slice(0, 10).map(r => r.symbol);
  const top20 = liquidityRanks.slice(0, 20).map(r => r.symbol);
  const sets = [
    { name: 'all47', symbols: results.map(r => r.symbol).sort() },
    { name: 'liquidityTop10', symbols: top10 },
    { name: 'liquidityTop20', symbols: top20 },
  ];

  return sets.map(set => {
    const symbolSet = new Set(set.symbols);
    const sub = results.filter(r => symbolSet.has(r.symbol));
    const stress = stressResults.filter(r => symbolSet.has(r.symbol));
    const capital = INITIAL_CAPITAL * Math.max(sub.length, 1);
    const segments = buildSegmentReports(sub, capital);
    return {
      name: set.name,
      symbols: set.symbols,
      report: summarize(sub),
      holdout: segments ? segments.holdout.report : null,
      costStress: summarize(stress),
    };
  });
}

function symbolRows(
  results: BacktestResult[],
  liquidityRanks: { symbol: string; avgQuoteVolume4h: number }[],
): SymbolRow[] {
  const rankMap = new Map(liquidityRanks.map((r, i) => [r.symbol, { rank: i + 1, avgQuoteVolume4h: r.avgQuoteVolume4h }]));
  return results.map(r => {
    const report = reportFor([r]);
    const liq = rankMap.get(r.symbol);
    return {
      symbol: r.symbol,
      liquidityRank: liq?.rank ?? 999,
      avgQuoteVolume4h: Math.round(liq?.avgQuoteVolume4h ?? 0),
      trades: report.trades,
      winRate: round(report.winRate, 1),
      profitFactor: roundPf(report.profitFactor),
      netProfit: Math.round(report.netProfit),
      maxDrawdownPct: round(report.maxDrawdownPct, 1),
      positiveMonthRate: round(report.positiveMonthRate, 1),
    };
  }).sort((a, b) => b.netProfit - a.netProfit);
}

function holdoutTrades(results: BacktestResult[]): Array<Record<string, unknown>> {
  const trades = flatTrades(results);
  if (!trades.length) return [];
  const min = Math.min(...trades.map(t => t.entryTime));
  const max = Math.max(...trades.map(t => t.entryTime));
  const holdoutStart = min + (max - min) * 0.85;
  return trades
    .filter(t => t.entryTime > holdoutStart)
    .sort((a, b) => a.entryTime - b.entryTime)
    .map(t => ({
      symbol: t.symbol,
      entryTime: fmt(t.entryTime),
      exitTime: fmt(t.exitTime),
      outcome: t.outcome,
      side: t.obType,
      entryPrice: round(t.entryPrice, 8),
      exitPrice: round(t.exitPrice, 8),
      capitalDelta: round(t.capitalDelta ?? 0, 2),
      capitalPnl: round(t.capitalPnl, 2),
    }));
}

function flatTrades(results: BacktestResult[]): FlatTrade[] {
  return results
    .flatMap(r => r.trades.map(t => ({ ...t, symbol: r.symbol })))
    .sort((a, b) => a.entryTime - b.entryTime);
}

function avgQuoteVolume4h(candles: CandleWithNotional[]): number {
  const recent = candles.slice(-720);
  if (!recent.length) return 0;
  return recent.reduce((sum, c) => sum + c.quoteVolumeApprox, 0) / recent.length;
}

function fmt(sec: number): string {
  return new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

function round(n: number, digits: number): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function roundPf(n: number): number {
  return Number.isFinite(n) ? round(n, 2) : 999;
}

async function main() {
  const symbols = getSymbols();
  const entryCandlesBySymbol = new Map<string, CandleWithNotional[]>();
  const zoneCandlesBySymbol = new Map<string, CandleWithNotional[]>();

  for (const symbol of symbols) {
    entryCandlesBySymbol.set(symbol, await fetchKlines(symbol, '4h', ENTRY_BARS));
    zoneCandlesBySymbol.set(symbol, await fetchKlines(symbol, '1w', ZONE_BARS));
  }

  const liquidityRanks = symbols
    .map(symbol => ({
      symbol,
      avgQuoteVolume4h: avgQuoteVolume4h(entryCandlesBySymbol.get(symbol) ?? []),
    }))
    .sort((a, b) => b.avgQuoteVolume4h - a.avgQuoteVolume4h);

  const outCandidates = [];

  for (const candidate of CANDIDATES) {
    const params = paramsForCandidate(candidate);
    const stressed = stressParams(params);
    const results: BacktestResult[] = [];
    const stressResults: BacktestResult[] = [];

    for (const symbol of symbols) {
      const entry = entryCandlesBySymbol.get(symbol) ?? [];
      const zone = zoneCandlesBySymbol.get(symbol) ?? [];
      if (!entry.length || !zone.length) continue;
      results.push(runBacktest(symbol, zone, entry, params, INITIAL_CAPITAL));
      stressResults.push(runBacktest(symbol, zone, entry, stressed, INITIAL_CAPITAL));
    }

    const report = reportFor(results);
    const portfolioCapital = INITIAL_CAPITAL * Math.max(results.length, 1);
    const segments = buildSegmentReports(results, portfolioCapital);
    const stressReport = reportFor(stressResults);
    const bySymbol = symbolRows(results, liquidityRanks);

    outCandidates.push({
      key: candidate.key,
      label: candidate.label,
      config: normalizeConfig(inputForCandidate(candidate)),
      report: summarizeReport(report),
      fullReport: {
        positiveMonthRate: round(report.positiveMonthRate, 1),
        worstMonthNetPnl: Math.round(report.worstMonthNetPnl),
        avgMonthNetPnl: Math.round(report.avgMonthNetPnl),
        monthlyNetPnlStdDev: Math.round(report.monthlyNetPnlStdDev),
        monthly: report.monthly.map(m => ({
          ...m,
          winRate: round(m.winRate, 1),
          netPnl: Math.round(m.netPnl),
        })),
      },
      segments,
      costStress: {
        multiplier: STRESS_MULTIPLIER,
        report: summarizeReport(stressReport),
      },
      subsets: subsetRows(results, stressResults, liquidityRanks),
      bySymbol,
      topSymbols: bySymbol.slice(0, 12),
      bottomSymbols: [...bySymbol].sort((a, b) => a.netProfit - b.netProfit).slice(0, 12),
      holdoutTrades: holdoutTrades(results),
    });
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = resolve(RESULTS_DIR, `${date}-eq-fvg-candidate-drilldown.json`);
  writeFileSync(outFile, JSON.stringify({
    date,
    label: 'EQ FVG 1W edge 후보 종목별/월별/holdout 드릴다운',
    universe: symbols,
    bars: { entry: ENTRY_BARS, zone: ZONE_BARS },
    liquidityBasis: '최근 720개 4H 캔들의 평균 quoteVolumeApprox',
    liquidityRanks: liquidityRanks.map((r, i) => ({
      rank: i + 1,
      symbol: r.symbol,
      avgQuoteVolume4h: Math.round(r.avgQuoteVolume4h),
    })),
    candidates: outCandidates,
  }, null, 2));
  console.log(`drilldown saved: ${outFile}`);
}

const realLog = console.log;
console.log = (...args: any[]) => {
  const s = String(args[0] ?? '');
  if (s.startsWith('[')) return;
  if (s.startsWith('  noIdx:') || s.startsWith('  firstTouchTypes:') || s.startsWith('  [trade ')) return;
  realLog(...args);
};

main().finally(() => { console.log = realLog; });
