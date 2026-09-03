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
import { buildReport, summarizeReport } from '../src/utils/backtestReport';
import type { ReportInput, ReportSummary } from '../src/utils/backtestReport';
import { normalizeConfig, toLegacyBacktest } from '../../shared/strategy-schema';
import type { StrategyConfigInput } from '../../shared/strategy-schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_DIR = resolve(ROOT, 'docs/experiments/results');
const MARKET_PROXY_BASE = normalizeApiBase(process.env.EXPERIMENT_MARKET_API_URL);
const ENTRY_BARS = 5000;
const ZONE_BARS = 1000;
const INITIAL_CAPITAL = 100;
const STRESS_MULTIPLIER = 1.5;
const CORE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] as const;

const BINANCE_FUTURES_SYMBOL_ALIASES: Record<string, string> = {
  PEPEUSDT: '1000PEPEUSDT',
};

const CANDIDATES = [
  {
    key: 'primary-r2-risk15-vol2-accept2-age30',
    label: 'primary R2 risk15 vol2 accept2 age30',
    targetR: 2,
    maxZoneRiskPct: 15,
    entryVolumeMaxMultiple: 2,
    acceptanceStopBars: 2,
    maxZoneAgeDays: 30,
  },
  {
    key: 'alt-risk20-r2-vol2-accept2-age30',
    label: 'alt R2 risk20 vol2 accept2 age30',
    targetR: 2,
    maxZoneRiskPct: 20,
    entryVolumeMaxMultiple: 2,
    acceptanceStopBars: 2,
    maxZoneAgeDays: 30,
  },
  {
    key: 'aggressive-r25-risk15-vol2-accept2-age30',
    label: 'aggressive R2.5 risk15 vol2 accept2 age30',
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
type SegmentName = 'train' | 'validation' | 'holdout';

type FixedSplit = {
  minTime: number;
  maxTime: number;
  trainEnd: number;
  validationEnd: number;
};

type FixedSegmentReports = Record<SegmentName, {
  rangeStart: string;
  rangeEnd: string;
  report: ReportSummary;
}>;

type SymbolStats = {
  symbol: string;
  isCore: boolean;
  liquidityRank: number;
  avgQuoteVolume4h: number;
  score: number;
  full: ReportSummary;
  train: ReportSummary;
  validation: ReportSummary;
  preHoldout: ReportSummary;
  holdout: ReportSummary;
};

type UniverseRow = {
  name: string;
  description: string;
  symbols: string[];
  addedNonCore: string[];
  report: ReportSummary;
  segments: FixedSegmentReports | null;
  costStress: ReportSummary;
  selectedStats: SymbolStats[];
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
    throw new Error('EXPERIMENT_API_USER/PASS env required when using candle proxy');
  }
  const loginRes = await fetch(`${MARKET_PROXY_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) throw new Error(`candle proxy login failed HTTP ${loginRes.status}`);
  const { token } = await loginRes.json() as { token?: string };
  if (!token) throw new Error('candle proxy login response has no token');
  return { Authorization: `Bearer ${token}` };
}

function getKlinesUrl(apiSymbol: string, interval: string, limit: number, endTime?: number): URL {
  if (!MARKET_PROXY_BASE && process.env.GITHUB_ACTIONS === 'true') {
    throw new Error('GitHub Actions candle fetch requires EXPERIMENT_MARKET_API_URL env');
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
    name: `EQ FVG universe filter ${c.key}`,
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

function reportFor(inputs: ReportInput[], symbolCount = inputs.length): ReportSummary {
  return summarizeReport(buildReport(inputs, INITIAL_CAPITAL * Math.max(symbolCount, 1)));
}

function fixedSplit(results: ReportInput[]): FixedSplit | null {
  const trades = flatTrades(results);
  if (!trades.length) return null;
  const minTime = trades[0].entryTime;
  const maxTime = trades[trades.length - 1].entryTime;
  if (maxTime <= minTime) return null;
  const span = maxTime - minTime;
  return {
    minTime,
    maxTime,
    trainEnd: minTime + span * 0.6,
    validationEnd: minTime + span * 0.85,
  };
}

function segmentOf(entryTime: number, split: FixedSplit): SegmentName {
  if (entryTime <= split.trainEnd) return 'train';
  if (entryTime <= split.validationEnd) return 'validation';
  return 'holdout';
}

function filterSegment(inputs: ReportInput[], split: FixedSplit, segments: SegmentName[]): ReportInput[] {
  const allowed = new Set(segments);
  return inputs.map(r => ({
    symbol: r.symbol,
    trades: r.trades.filter(t => allowed.has(segmentOf(t.entryTime, split))),
  }));
}

function fixedSegmentReports(inputs: ReportInput[], split: FixedSplit, symbolCount = inputs.length): FixedSegmentReports {
  const date = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
  const build = (name: SegmentName, start: number, end: number) => ({
    rangeStart: date(start),
    rangeEnd: date(end),
    report: reportFor(filterSegment(inputs, split, [name]), symbolCount),
  });
  return {
    train: build('train', split.minTime, split.trainEnd),
    validation: build('validation', split.trainEnd, split.validationEnd),
    holdout: build('holdout', split.validationEnd, split.maxTime),
  };
}

function symbolStats(
  results: BacktestResult[],
  split: FixedSplit,
  liquidityRanks: { symbol: string; avgQuoteVolume4h: number }[],
): SymbolStats[] {
  const rankMap = new Map(liquidityRanks.map((r, i) => [r.symbol, { rank: i + 1, avgQuoteVolume4h: r.avgQuoteVolume4h }]));
  const coreSet = new Set<string>(CORE_SYMBOLS);
  return results.map(r => {
    const input: ReportInput = { symbol: r.symbol, trades: r.trades };
    const full = reportFor([input], 1);
    const train = reportFor(filterSegment([input], split, ['train']), 1);
    const validation = reportFor(filterSegment([input], split, ['validation']), 1);
    const preHoldout = reportFor(filterSegment([input], split, ['train', 'validation']), 1);
    const holdout = reportFor(filterSegment([input], split, ['holdout']), 1);
    const liq = rankMap.get(r.symbol);
    return {
      symbol: r.symbol,
      isCore: coreSet.has(r.symbol),
      liquidityRank: liq?.rank ?? 999,
      avgQuoteVolume4h: Math.round(liq?.avgQuoteVolume4h ?? 0),
      score: scoreSymbol(preHoldout, validation),
      full,
      train,
      validation,
      preHoldout,
      holdout,
    };
  }).sort((a, b) => b.score - a.score);
}

function scoreSymbol(pre: ReportSummary, validation: ReportSummary): number {
  const pf = finitePf(pre.profitFactor);
  const valPf = finitePf(validation.profitFactor);
  const sampleBonus = Math.min(pre.trades, 12) * 8;
  const pfBonus = Math.max(0, Math.min(pf, 3) - 1) * 80;
  const validationBonus = Math.max(0, Math.min(valPf, 3) - 1) * 40;
  const drawdownPenalty = pre.maxDrawdownPct * 2;
  return round(pre.netProfit + validation.netProfit * 0.3 + sampleBonus + pfBonus + validationBonus - drawdownPenalty, 1);
}

function finitePf(pf: number): number {
  if (Number.isFinite(pf)) return pf;
  return pf > 0 ? 3 : 0;
}

function buildUniverseRows(
  results: BacktestResult[],
  stressResults: BacktestResult[],
  stats: SymbolStats[],
  split: FixedSplit,
  liquidityRanks: { symbol: string; avgQuoteVolume4h: number }[],
): UniverseRow[] {
  const core = new Set<string>(CORE_SYMBOLS);
  const top20 = new Set(liquidityRanks.slice(0, 20).map(r => r.symbol));

  const prePositiveMin3 = stats
    .filter(s => !s.isCore && s.preHoldout.trades >= 3 && s.preHoldout.netProfit > 0)
    .map(s => s.symbol);
  const prePf110Min3 = stats
    .filter(s => !s.isCore && s.preHoldout.trades >= 3 && s.preHoldout.netProfit > 0 && s.preHoldout.profitFactor >= 1.1)
    .map(s => s.symbol);
  const trainValPositive = stats
    .filter(s => !s.isCore && s.preHoldout.trades >= 3 && s.train.netProfit > 0 && s.validation.netProfit > 0)
    .map(s => s.symbol);
  const noRepeatLosers = stats
    .filter(s => !s.isCore && s.preHoldout.trades >= 3 && !(s.train.netProfit < 0 && s.validation.netProfit < 0))
    .map(s => s.symbol);
  const topScore = (n: number) => stats
    .filter(s => !s.isCore && s.preHoldout.trades >= 3 && s.preHoldout.netProfit > 0)
    .slice(0, n)
    .map(s => s.symbol);

  const specs = [
    {
      name: 'coreOnly',
      description: 'BTC/ETH/SOL only',
      symbols: [...CORE_SYMBOLS],
    },
    {
      name: 'corePlusLiquidityTop20',
      description: 'BTC/ETH/SOL plus current liquidity top20',
      symbols: [...new Set([...CORE_SYMBOLS, ...top20])],
    },
    {
      name: 'corePlusPrePositiveMin3',
      description: 'BTC/ETH/SOL plus symbols with pre-holdout net > 0 and at least 3 pre-holdout trades',
      symbols: [...CORE_SYMBOLS, ...prePositiveMin3],
    },
    {
      name: 'corePlusPrePf110Min3',
      description: 'BTC/ETH/SOL plus symbols with pre-holdout PF >= 1.10, net > 0, and at least 3 pre-holdout trades',
      symbols: [...CORE_SYMBOLS, ...prePf110Min3],
    },
    {
      name: 'corePlusTrainValPositive',
      description: 'BTC/ETH/SOL plus symbols positive in both train and validation',
      symbols: [...CORE_SYMBOLS, ...trainValPositive],
    },
    {
      name: 'corePlusNoRepeatLosers',
      description: 'BTC/ETH/SOL plus symbols that were not negative in both train and validation',
      symbols: [...CORE_SYMBOLS, ...noRepeatLosers],
    },
    {
      name: 'corePlusTopScore10',
      description: 'BTC/ETH/SOL plus top 10 non-core symbols by pre-holdout score',
      symbols: [...CORE_SYMBOLS, ...topScore(10)],
    },
    {
      name: 'corePlusTopScore15',
      description: 'BTC/ETH/SOL plus top 15 non-core symbols by pre-holdout score',
      symbols: [...CORE_SYMBOLS, ...topScore(15)],
    },
    {
      name: 'corePlusTopScore20',
      description: 'BTC/ETH/SOL plus top 20 non-core symbols by pre-holdout score',
      symbols: [...CORE_SYMBOLS, ...topScore(20)],
    },
    {
      name: 'allSymbols',
      description: 'All tested symbols',
      symbols: stats.map(s => s.symbol),
    },
  ];

  return specs.map(spec => {
    const symbols = [...new Set(spec.symbols)].filter(s => stats.some(row => row.symbol === s)).sort();
    for (const s of CORE_SYMBOLS) {
      if (!symbols.includes(s)) symbols.push(s);
    }
    symbols.sort();
    const set = new Set(symbols);
    const sub = results.filter(r => set.has(r.symbol));
    const stress = stressResults.filter(r => set.has(r.symbol));
    const selectedStats = stats.filter(s => set.has(s.symbol)).sort((a, b) => {
      if (a.isCore !== b.isCore) return a.isCore ? -1 : 1;
      return b.score - a.score;
    });
    return {
      name: spec.name,
      description: spec.description,
      symbols,
      addedNonCore: symbols.filter(s => !core.has(s)),
      report: reportFor(sub, symbols.length),
      segments: fixedSegmentReports(sub, split, symbols.length),
      costStress: reportFor(stress, symbols.length),
      selectedStats,
    };
  });
}

function flatTrades(results: ReportInput[]): FlatTrade[] {
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

async function main() {
  const symbols = getSymbols();
  const missingCore = CORE_SYMBOLS.filter(s => !symbols.includes(s));
  if (missingCore.length) {
    throw new Error(`missing mandatory core symbols in fixtures: ${missingCore.join(', ')}`);
  }

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

    const split = fixedSplit(results);
    if (!split) {
      outCandidates.push({
        key: candidate.key,
        label: candidate.label,
        config: normalizeConfig(inputForCandidate(candidate)),
        error: 'no trades',
      });
      continue;
    }

    const stats = symbolStats(results, split, liquidityRanks);
    const universes = buildUniverseRows(results, stressResults, stats, split, liquidityRanks);
    outCandidates.push({
      key: candidate.key,
      label: candidate.label,
      config: normalizeConfig(inputForCandidate(candidate)),
      split: {
        trainEnd: fmt(split.trainEnd),
        validationEnd: fmt(split.validationEnd),
        minTime: fmt(split.minTime),
        maxTime: fmt(split.maxTime),
      },
      mandatoryCore: CORE_SYMBOLS,
      baseline: {
        allSymbols: reportFor(results, results.length),
        segments: fixedSegmentReports(results, split, results.length),
        costStress: reportFor(stressResults, stressResults.length),
      },
      universes,
      bySymbol: stats,
      topPreHoldoutSymbols: [...stats]
        .filter(s => !s.isCore)
        .sort((a, b) => b.preHoldout.netProfit - a.preHoldout.netProfit)
        .slice(0, 20),
      bottomPreHoldoutSymbols: [...stats]
        .filter(s => !s.isCore)
        .sort((a, b) => a.preHoldout.netProfit - b.preHoldout.netProfit)
        .slice(0, 20),
    });
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outFile = resolve(RESULTS_DIR, `${date}-eq-fvg-universe-filter.json`);
  writeFileSync(outFile, JSON.stringify({
    date,
    label: 'EQ FVG 1W edge universe filter with mandatory BTC/ETH/SOL core',
    mandatoryCore: CORE_SYMBOLS,
    universe: symbols,
    bars: { entry: ENTRY_BARS, zone: ZONE_BARS },
    selectionRule: 'Symbols are selected only from train+validation/pre-holdout metrics. Holdout is reported after selection.',
    liquidityBasis: 'Average quoteVolumeApprox of the latest 720 4H candles',
    liquidityRanks: liquidityRanks.map((r, i) => ({
      rank: i + 1,
      symbol: r.symbol,
      avgQuoteVolume4h: Math.round(r.avgQuoteVolume4h),
    })),
    candidates: outCandidates,
  }, null, 2));
  console.log(`universe filter saved: ${outFile}`);
}

const realLog = console.log;
console.log = (...args: any[]) => {
  const s = String(args[0] ?? '');
  if (s.startsWith('[')) return;
  if (s.startsWith('  noIdx:') || s.startsWith('  firstTouchTypes:') || s.startsWith('  [trade ')) return;
  realLog(...args);
};

main().finally(() => { console.log = realLog; });
