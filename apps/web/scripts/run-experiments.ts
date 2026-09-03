/**
 * 조합 필터 실험 배치 러너 (M3 → 상시 트랙)
 *
 * 실행: cd frontend && npx vite-node scripts/run-experiments.ts [스윕이름...]
 *   - 인자 없으면 docs/experiments/sweeps/*.json 전부 실행
 *   - 스윕 정의 = base 설정(StrategyConfigInput) + axes(점표기 경로 → 값 배열)의 카테시안 곱
 *   - 자동 탐색: npx vite-node scripts/run-experiments.ts --search harmonic-auto-search --limit 80
 *   - 실행 전 미리보기: ... --search harmonic-auto-search --limit 80 --dry-run
 *   - GitHub Actions: EXPERIMENT_MARKET_API_URL을 주면 앱 서버 프록시로 Binance 캔들을 수집
 *
 * 실험 = 전략 스키마 JSON 1장. toLegacyBacktest로 변환해 화면과 동일한 runBacktest를
 * 돌리고, buildReport 표준 리포트를 docs/experiments/results/에 누적한 뒤
 * LEADERBOARD.md를 재생성한다 (UI의 backtest_runs와 별개 트랙).
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBacktest, DEFAULT_STRATEGY_PARAMS } from '../src/utils/backtestEngine';
import type { BacktestResult, StrategyParams } from '../src/utils/backtestEngine';
import { buildReport, buildSegmentReports, stabilityMetrics, summarizeReport } from '../src/utils/backtestReport';
import type { BacktestReport, ReportSummary, SegmentReports } from '../src/utils/backtestReport';
import {
  DEFAULT_FEE_PCT,
  DEFAULT_SLIPPAGE_PCT,
  DEFAULT_FUNDING_PCT_8H,
} from '../src/utils/backtestEngine';
import type { Candle } from '../src/types/market';
import { normalizeConfig, toLegacyBacktest, validateConfig } from '../../shared/strategy-schema';
import type { StrategyConfigInput } from '../../shared/strategy-schema';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SWEEPS_DIR = resolve(ROOT, 'docs/experiments/sweeps');
const SEARCH_SPACES_DIR = resolve(ROOT, 'docs/experiments/search-spaces');
const RESULTS_DIR = resolve(ROOT, 'docs/experiments/results');
const MARKET_PROXY_BASE = normalizeApiBase(process.env.EXPERIMENT_MARKET_API_URL);
// --max-minutes: 이 시각을 넘기면 다음 조합을 시작하지 않고 정상 종료 (Actions 타임아웃 취소로
// 진행분이 유실되는 것 방지 — 잔여 조합은 중복 스킵 덕에 다음 실행이 이어감)
let deadlineMs: number | undefined;

const BINANCE_FUTURES_SYMBOL_ALIASES: Record<string, string> = {
  PEPEUSDT: '1000PEPEUSDT',
};

function toBinanceFuturesSymbol(symbol: string): string {
  return BINANCE_FUTURES_SYMBOL_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

function normalizeApiBase(raw?: string): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

// ── universe: 기본은 워커 모니터링 픽스처 47종목, 제한 universe도 코어 3종은 항상 포함 ──
const SYMBOLS = readdirSync(resolve(ROOT, 'ops/verify/fixtures'))
  .filter(f => f.endsWith('-4h.json'))
  .map(f => f.replace('-4h.json', ''));
const MANDATORY_TEST_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

type Sweep = {
  name: string;
  label: string;
  bars: { entry: number; zone: number };
  universe?: string[];
  base: StrategyConfigInput;
  axes: Record<string, unknown[]>;
};

type SearchMode = 'grid' | 'random';

type SearchSpace = {
  name: string;
  label: string;
  sampler?: SearchMode;
  defaultLimit?: number;
  budget?: { daily?: number; weekly?: number };
  bars: { entry: number; zone: number };
  universe?: string[];
  base: StrategyConfigInput;
  space: Record<string, unknown[]>;
};

type ExperimentInput = {
  name: string;
  input: StrategyConfigInput;
  variantValues?: Record<string, unknown>;
  configHash?: string;
};

type RunRecord = {
  name: string;
  label?: string;
  variantValues?: Record<string, unknown>;
  configHash?: string;
  config: ReturnType<typeof normalizeConfig>;
  report: BacktestReport;
  /** train/validation/holdout 시간 구간별 성능 — 과최적화 가드 (없으면 거래 부족) */
  segments?: SegmentReports | null;
  /** 비용(수수료·슬리피지·펀딩) 배수 스트레스 — 1.5배에서도 순손익 양수여야 후보 자격 */
  costStress?: { multiplier: number; report: ReportSummary };
};

type ExperimentBatch = {
  name: string;
  label?: string;
  mode: 'sweep' | 'search';
  bars: { entry: number; zone: number };
  universe: string[];
  experiments: ExperimentInput[];
  metadata?: Record<string, unknown>;
};

function resolveUniverse(raw?: string[]): string[] {
  const available = new Set(SYMBOLS);
  const requested = raw?.length ? raw : SYMBOLS;
  const out = new Set<string>();
  for (const symbol of [...requested, ...MANDATORY_TEST_SYMBOLS]) {
    const normalized = symbol.toUpperCase();
    if (available.has(normalized)) out.add(normalized);
  }
  const missingCore = MANDATORY_TEST_SYMBOLS.filter(symbol => !out.has(symbol));
  if (missingCore.length) {
    throw new Error(`필수 테스트 종목이 fixtures에 없음: ${missingCore.join(', ')}`);
  }
  return [...out].sort();
}

/** 'detector.entryDepth' 같은 점표기 경로에 값 설정 (얕은 복제) */
function setPath(obj: any, path: string, value: unknown): any {
  const keys = path.split('.');
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] ?? {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

/** axes 카테시안 곱 → 실험 입력 목록 */
function expandSweep(sweep: Sweep): ExperimentInput[] {
  let variants: { suffix: string; input: StrategyConfigInput }[] = [{ suffix: '', input: sweep.base }];
  for (const [path, values] of Object.entries(sweep.axes)) {
    const key = path.split('.').pop()!;
    variants = variants.flatMap(v =>
      values.map(value => ({
        suffix: `${v.suffix}-${key}=${String(value)}`,
        input: setPath(v.input, path, value),
      }))
    );
  }
  return variants.map(v => ({ name: `${sweep.name}${v.suffix}`, input: v.input }));
}

type SearchVariant = {
  values: Record<string, unknown>;
  input: StrategyConfigInput;
};

const SEARCH_FIELD_ALIASES: Record<string, string> = {
  'detector.entryDepth': 'depth',
  'detector.useEqFilter': 'eq',
  'execution.entryMode': 'entry',
  'execution.slCapPct': 'sl',
  'execution.useZoneRiskReward': 'zoneRR',
  'execution.targetR': 'R',
  'execution.maxZoneAgeDays': 'ageD',
  'execution.useConfirmTimeEntry': 'confirm',
  'execution.maxZoneRiskPct': 'riskMax',
  'execution.avoidHighVolumeEntry': 'volAvoid',
  'execution.entryVolumeMaxMultiple': 'volMax',
  'execution.acceptanceStopBars': 'acceptStop',
  'execution.brokenEntrySignal': 'brokenSig',
  'execution.brokenTargetZoneWidths': 'btw',
  'execution.brokenStopZoneWidths': 'bsw',
  'execution.brokenStopOnReclaimClose': 'reclaimStop',
  'execution.maxHoldCandles': 'hold',
  'execution.maxWaitCandles': 'wait',
  'execution.moveStopToBreakeven': 'be',
  'detector.entryOnFirstTouch': 'firstTouch',
  'detector.entryLevel': 'obLevel',
  'detector.entryAtBorder': 'edge',
  'zoneTimeframe': 'zoneTf',
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function formatSearchValue(value: unknown): string {
  if (value === true) return 'T';
  if (value === false) return 'F';
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '');
}

function formatSearchSuffix(values: Record<string, unknown>): string {
  return Object.entries(values)
    .map(([path, value]) => `${SEARCH_FIELD_ALIASES[path] ?? path.split('.').pop()}=${formatSearchValue(value)}`)
    .join('-');
}

function enumerateSearchSpace(space: SearchSpace): SearchVariant[] {
  let variants: SearchVariant[] = [{ values: {}, input: space.base }];
  for (const [path, values] of Object.entries(space.space)) {
    variants = variants.flatMap(v =>
      values.map(value => ({
        values: { ...v.values, [path]: value },
        input: setPath(v.input, path, value),
      }))
    );
  }
  return variants;
}

function buildSearchExperiments(
  space: SearchSpace,
  opts: { limit?: number; seed: string; sampler?: SearchMode; existingHashes?: Set<string>; universe: string[] }
): {
  experiments: ExperimentInput[];
  generatedCount: number;
  selectedCount: number;
  skippedExistingCount: number;
  sampler: SearchMode;
  seed: string;
  limit: number;
} {
  const variants = enumerateSearchSpace(space);
  const sampler = opts.sampler ?? space.sampler ?? 'grid';
  const limit = Math.max(1, opts.limit ?? space.defaultLimit ?? variants.length);
  const existingHashes = opts.existingHashes ?? new Set<string>();
  const ranked = sampler === 'random'
    ? variants
        .map(v => ({ v, rank: hashString(`${opts.seed}|${JSON.stringify(v.values)}`) }))
        .sort((a, b) => a.rank - b.rank)
        .map(x => x.v)
    : variants;

  let skippedExistingCount = 0;
  const experiments: ExperimentInput[] = [];
  for (const v of ranked) {
    const suffix = formatSearchSuffix(v.values);
    const name = `${space.name}-${suffix}`;
    const input = {
      ...v.input,
      name: `${space.label} ${suffix}`,
    };
    const cfg = normalizeConfig(input);
    const configHash = hashExperimentConfig(cfg, opts.universe);
    if (existingHashes.has(configHash)) {
      skippedExistingCount++;
      continue;
    }
    experiments.push({
      name,
      input,
      variantValues: v.values,
      configHash,
    });
    if (experiments.length >= limit) break;
  }
  return { experiments, generatedCount: variants.length, selectedCount: experiments.length, skippedExistingCount, sampler, seed: opts.seed, limit };
}

// ── Binance 선물 공개 API 캔들 수집 ──
const candleCache = new Map<string, Candle[]>();
const MIN_DATA_SUCCESS_RATIO = 0.7;
let marketProxyAuthPromise: Promise<Record<string, string>> | null = null;

async function loginToAppApi(base: string, user: string, pass: string, context: string): Promise<Record<string, string>> {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  if (!loginRes.ok) throw new Error(`${context} 로그인 실패 HTTP ${loginRes.status}`);
  const { token } = await loginRes.json() as { token?: string };
  if (!token) throw new Error(`${context} 로그인 응답에 token 없음`);
  return { Authorization: `Bearer ${token}` };
}

async function getMarketProxyHeaders(): Promise<Record<string, string> | undefined> {
  if (!MARKET_PROXY_BASE) return undefined;
  if (!marketProxyAuthPromise) {
    const user = process.env.EXPERIMENT_MARKET_API_USER ?? process.env.EXPERIMENT_API_USER;
    const pass = process.env.EXPERIMENT_MARKET_API_PASS ?? process.env.EXPERIMENT_API_PASS;
    if (!user || !pass) {
      throw new Error('캔들 프록시 사용 시 EXPERIMENT_API_USER/PASS env 필요');
    }
    marketProxyAuthPromise = loginToAppApi(MARKET_PROXY_BASE, user, pass, '캔들 프록시');
  }
  return marketProxyAuthPromise;
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

async function fetchKlines(symbol: string, interval: string, totalBars: number): Promise<Candle[]> {
  const key = `${symbol}-${interval}`;
  const cached = candleCache.get(key);
  if (cached) return cached;
  const apiSymbol = toBinanceFuturesSymbol(symbol);

  const out: Candle[] = [];
  let endTime: number | undefined;
  while (out.length < totalBars) {
    const limit = Math.min(1500, totalBars - out.length);
    const url = getKlinesUrl(apiSymbol, interval, limit, endTime);
    const headers = await getMarketProxyHeaders();
    const res = await fetch(url, headers ? { headers } : undefined);
    if (!res.ok) throw new Error(`${symbol} ${interval} ${MARKET_PROXY_BASE ? 'proxy' : 'Binance'} HTTP ${res.status}`);
    const rows = asKlineRows(await res.json());
    if (!rows.length) break;
    const page: Candle[] = rows.map(r => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
    }));
    out.unshift(...page);
    endTime = Number(rows[0][0]) - 1;
    if (rows.length < limit) break;
  }
  out.sort((a, b) => Number(a.time) - Number(b.time));
  candleCache.set(key, out);
  return out;
}

function saveBatchResults(batch: ExperimentBatch, runs: RunRecord[]): string {
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = resolve(RESULTS_DIR, `${date}-${batch.name}.json`);
  const mergedRuns = batch.mode === 'search' ? mergeSearchRuns(outFile, runs) : runs;
  writeFileSync(outFile, JSON.stringify({
    date,
    sweep: batch.name,
    label: batch.label,
    mode: batch.mode,
    universe: batch.universe,
    bars: batch.bars,
    ...(batch.metadata ?? {}),
    totalRecordedCount: mergedRuns.length,
    runs: mergedRuns,
  }, null, 2));
  return outFile;
}

async function runExperimentBatch(batch: ExperimentBatch): Promise<void> {
  const symbols = batch.universe;
  console.log(`\n▶ ${batch.mode === 'search' ? '탐색' : '스윕'} ${batch.name} — ${batch.experiments.length}조합 × ${symbols.length}종목`);
  const runs: RunRecord[] = [];
  let outFile: string | undefined;
  let done = 0;

  for (const exp of batch.experiments) {
    if (deadlineMs && Date.now() >= deadlineMs) {
      console.log(`⏱ 시간 예산 소진 — ${done}/${batch.experiments.length}조합 완료, 잔여 ${batch.experiments.length - done}개는 다음 실행이 이어감`);
      break;
    }
    const expStart = Date.now();
    const cfg = normalizeConfig(exp.input);
    const errors = validateConfig(cfg);
    if (errors.length) {
      console.warn(`  ${exp.name} 설정 오류: ${errors.join(', ')}`);
      continue;
    }
    const legacy = toLegacyBacktest(cfg);
    const params: StrategyParams = { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params } as StrategyParams;
    // 비용 1.5배 스트레스 — 캔들은 캐시 재사용이라 CPU만 2배
    const STRESS_MULTIPLIER = 1.5;
    const stressParams: StrategyParams = {
      ...params,
      feePct: (params.feePct ?? DEFAULT_FEE_PCT) * STRESS_MULTIPLIER,
      slippagePct: (params.slippagePct ?? DEFAULT_SLIPPAGE_PCT) * STRESS_MULTIPLIER,
      fundingPctPer8h: (params.fundingPctPer8h ?? DEFAULT_FUNDING_PCT_8H) * STRESS_MULTIPLIER,
    };
    const needsZone = cfg.detector.kind === 'HARMONIC' ? (cfg.detector as any).useEqFilter : true;

    const results: BacktestResult[] = [];
    const stressResults: BacktestResult[] = [];
    const failedSymbols: string[] = [];
    const emptySymbols: string[] = [];
    let fetchMs = 0;
    for (const symbol of symbols) {
      try {
        const fetchStart = Date.now();
        const entryCandles = await fetchKlines(symbol, cfg.timeframe, batch.bars.entry);
        const obCandles = needsZone
          ? await fetchKlines(symbol, cfg.zoneTimeframe ?? '1d', batch.bars.zone)
          : [];
        fetchMs += Date.now() - fetchStart;
        if (!entryCandles.length || (needsZone && !obCandles.length)) {
          emptySymbols.push(symbol);
          continue;
        }
        results.push(runBacktest(symbol, obCandles, entryCandles, params, legacy.initialCapital));
        stressResults.push(runBacktest(symbol, obCandles, entryCandles, stressParams, legacy.initialCapital));
      } catch (e: any) {
        failedSymbols.push(`${symbol}: ${e.message}`);
        console.warn(`  ${symbol} 실패: ${e.message}`);
      }
    }
    const minSuccess = Math.max(1, Math.ceil(symbols.length * MIN_DATA_SUCCESS_RATIO));
    if (results.length < minSuccess) {
      const detail = [
        `성공 ${results.length}/${symbols.length}`,
        failedSymbols.length ? `실패 ${failedSymbols.length}건 (${failedSymbols.slice(0, 5).join(' / ')}${failedSymbols.length > 5 ? ' ...' : ''})` : null,
        emptySymbols.length ? `빈 캔들 ${emptySymbols.length}건 (${emptySymbols.slice(0, 5).join(', ')}${emptySymbols.length > 5 ? ' ...' : ''})` : null,
      ].filter(Boolean).join(' · ');
      throw new Error(`${exp.name} 데이터 수집 실패율 초과 — ${detail}`);
    }
    // 포트폴리오 기준 자본 = 심볼당 초기자본 × 심볼수 (단일 기준이면 MDD 100%+ 왜곡)
    const capital = legacy.initialCapital * Math.max(results.length, 1);
    const report = buildReport(results, capital);
    const segments = buildSegmentReports(results, capital);
    const costStress = {
      multiplier: STRESS_MULTIPLIER,
      report: summarizeReport(buildReport(stressResults, capital)),
    };
    runs.push({
      name: exp.name,
      label: cfg.name,
      variantValues: exp.variantValues,
      configHash: exp.configHash,
      config: cfg,
      report,
      segments,
      costStress,
    });
    const totalSec = (Date.now() - expStart) / 1000;
    console.log(
      `✔ ${exp.name.padEnd(50)} trades ${String(report.trades).padStart(5)} | ` +
      `WR ${report.winRate.toFixed(1).padStart(5)}% | PF ${Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : '∞'} | ` +
      `MDD ${report.maxDrawdownPct.toFixed(1)}% | net ${report.netProfit.toFixed(0)} | ` +
      `holdPF ${segments ? segments.holdout.report.profitFactor.toFixed(2) : '-'} | ` +
      `stress net ${costStress.report.netProfit} | ` +
      `${totalSec.toFixed(0)}s (수집 ${(fetchMs / 1000).toFixed(0)}s)`
    );
    done++;
    // 조합 단위 즉시 저장 — 타임아웃·취소가 나도 완료분은 보존된다
    outFile = saveBatchResults(batch, runs);
  }

  if (!runs.length) {
    console.log('완료된 조합 없음 — 결과 저장 생략');
    return;
  }
  console.log(`결과 저장: ${outFile}`);
}

async function runSweep(sweep: Sweep): Promise<void> {
  const universe = resolveUniverse(sweep.universe);
  await runExperimentBatch({
    name: sweep.name,
    label: sweep.label,
    mode: 'sweep',
    bars: sweep.bars,
    universe,
    experiments: expandSweep(sweep),
  });
}

async function runSearchSpace(
  space: SearchSpace,
  opts: { limit?: number; seed: string; sampler?: SearchMode; dryRun?: boolean; force?: boolean; only?: Set<string> }
): Promise<void> {
  const universe = resolveUniverse(space.universe);
  // --force: 중복 스킵 무시하고 재실행 — segments/costStress 없는 과거 결과 백필용
  const existingHashes = opts.force ? new Set<string>() : collectExistingExperimentHashes();
  const built = buildSearchExperiments(space, { ...opts, existingHashes, universe });
  // --only: 지정 configHash만 실행 (--force와 함께 특정 조합 백필용)
  if (opts.only?.size) {
    built.experiments = built.experiments.filter(e => e.configHash && opts.only!.has(e.configHash));
    built.selectedCount = built.experiments.length;
  }
  console.log(
    `탐색 공간 ${space.name}: 전체 ${built.generatedCount}조합 중 ${built.selectedCount}조합 선택 ` +
    `(sampler=${built.sampler}, seed=${built.seed}, limit=${built.limit}, universe=${universe.length}, 중복 스킵 ${built.skippedExistingCount})`
  );
  printSearchPlan(built.experiments, opts.dryRun ?? false);
  if (opts.dryRun) return;
  if (!built.experiments.length) {
    console.log('새로 실행할 조합 없음 — 결과 저장 생략');
    return;
  }
  await runExperimentBatch({
    name: space.name,
    label: space.label,
    mode: 'search',
    bars: space.bars,
    universe,
    experiments: built.experiments,
    metadata: {
      searchMode: built.sampler,
      seed: built.seed,
      limit: built.limit,
      generatedCount: built.generatedCount,
      selectedCount: built.selectedCount,
      skippedExistingCount: built.skippedExistingCount,
      budget: space.budget,
      space: space.space,
    },
  });
}

/** 전체 결과 파일 집계 → LEADERBOARD.md 재생성 */
function rebuildLeaderboard(): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const rows: { date: string; name: string; r: BacktestReport; segments?: SegmentReports | null; costStress?: RunRecord['costStress'] }[] = [];
  for (const f of readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(resolve(RESULTS_DIR, f), 'utf8'));
      for (const run of data.runs ?? []) {
        rows.push({ date: data.date, name: run.name, r: run.report, segments: run.segments, costStress: run.costStress });
      }
    } catch { /* 손상 파일 무시 */ }
  }
  const valid = rows.filter(x => x.r.trades >= 30);
  valid.sort((a, b) => {
    const pa = Number.isFinite(a.r.profitFactor) ? a.r.profitFactor : 999;
    const pb = Number.isFinite(b.r.profitFactor) ? b.r.profitFactor : 999;
    return pb - pa;
  });

  let md = '# 실험 리더보드\n\n';
  md += '자동 생성 — `cd frontend && npx vite-node scripts/run-experiments.ts`.\n';
  md += '거래수 30건 이상만 표시. MDD 40% 초과는 ⚠️ (실전 후보 제외 가드).\n\n';
  md += '## PF 순위\n\n';
  md += '| # | 실험 | 일자 | 거래수 | 승률 | PF | 손익비 | MDD | 순손익 |\n';
  md += '|---|---|---|---|---|---|---|---|---|\n';
  valid.forEach((x, i) => {
    const pf = Number.isFinite(x.r.profitFactor) ? x.r.profitFactor.toFixed(2) : '∞';
    const mddMark = x.r.maxDrawdownPct > 40 ? ' ⚠️' : '';
    md += `| ${i + 1} | ${x.name} | ${x.date} | ${x.r.trades} | ${x.r.winRate.toFixed(1)}% | ${pf} | ${Number.isFinite(x.r.payoff) ? x.r.payoff.toFixed(2) : '∞'} | ${x.r.maxDrawdownPct.toFixed(1)}%${mddMark} | ${x.r.netProfit.toFixed(0)} |\n`;
  });

  const stabilityRows = valid
    .map(row => ({
      ...row,
      m: stabilityMetrics({
        ...row.r,
        segments: row.segments ?? row.r.segments,
        costStress: row.costStress ?? row.r.costStress,
      }),
    }))
    .sort((a, b) => b.m.score - a.m.score);

  md += '\n## 우상향 후보 점수\n\n';
  md += '목표: 오래 걸려도 계좌가 꾸준히 우상향할 가능성이 있는 조합을 우선한다. ';
  md += '점수는 PF, MDD, 월별 양수 비율, 연속손실 억제를 합산하고, 순손익 음수·거래수 부족·MDD 40% 초과는 감점한다.\n';
  md += 'holdout PF = 최근 15% 구간(탐색에 안 쓴 데이터) PF, 스트레스 = 비용 1.5배 순손익 — 둘 다 과최적화 가드 (구간 리포트 없는 과거 결과는 -).\n\n';
  md += '| # | 실험 | 점수 | 판정 | 거래수 | PF | holdout PF | 스트레스 | MDD | 양수월 | 최악월 | 연속손실 | 순손익 | 판정 사유 |\n';
  md += '|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n';
  stabilityRows.forEach((x, i) => {
    const pf = Number.isFinite(x.r.profitFactor) ? x.r.profitFactor.toFixed(2) : '∞';
    const monthText = x.m.totalMonths > 0
      ? `${x.m.positiveMonths}/${x.m.totalMonths} (${x.m.positiveMonthRate.toFixed(0)}%)`
      : '-';
    const holdPf = x.segments ? x.segments.holdout.report.profitFactor.toFixed(2) : '-';
    const stressNet = x.costStress ? String(x.costStress.report.netProfit) : '-';
    const reasons = x.m.reasons.length ? x.m.reasons.join(' · ') : '-';
    md += `| ${i + 1} | ${x.name} | ${x.m.score.toFixed(1)} | ${x.m.verdict} | ${x.r.trades} | ${pf} | ${holdPf} | ${stressNet} | ${x.r.maxDrawdownPct.toFixed(1)}% | ${monthText} | ${x.m.worstMonthNetPnl.toFixed(0)} | ${x.r.maxLoseStreak} | ${x.r.netProfit.toFixed(0)} | ${reasons} |\n`;
  });

  md += `\n총 ${rows.length}개 실험 (30건 미만 ${rows.length - valid.length}개 제외). 갱신: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`;
  writeFileSync(resolve(ROOT, 'docs/experiments/LEADERBOARD.md'), md);
  console.log('\nLEADERBOARD.md 갱신 완료');
}

// ── 결과 → 서버 backtest_runs 업로드 (실험 대시보드용) ──
// env: EXPERIMENT_API_URL(예: https://autotradev.duckdns.org), EXPERIMENT_API_USER/PASS
// 같은 configHash가 이미 서버에 있으면 스킵 — 일일 재실행이 중복 행을 만들지 않게.

/** backtestRunApi.hashRunConfig와 동일한 djb2 — 러너는 브라우저 모듈을 못 쓰므로 복제 유지 */
function hashRunConfig(config: unknown, symbols: string[], rangeStart?: string): string {
  const s = JSON.stringify(config) + '|' + [...symbols].sort().join(',') + '|' + (rangeStart ?? '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function hashExperimentConfig(config: unknown, symbols: string[]): string {
  return hashRunConfig(stripHumanLabel(config), symbols, undefined);
}

function stripHumanLabel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripHumanLabel);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'name') continue;
    out[key] = stripHumanLabel(child);
  }
  return out;
}

function collectExistingExperimentHashes(): Set<string> {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const hashes = new Set<string>();
  for (const f of readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const data = JSON.parse(readFileSync(resolve(RESULTS_DIR, f), 'utf8'));
      const symbols = Array.isArray(data.universe) ? data.universe : SYMBOLS;
      for (const run of data.runs ?? []) {
        if (typeof run.configHash === 'string' && run.configHash) hashes.add(run.configHash);
        if (run.config) hashes.add(hashExperimentConfig(run.config, symbols));
      }
    } catch { /* 손상 파일 무시 */ }
  }
  return hashes;
}

function mergeSearchRuns(outFile: string, newRuns: RunRecord[]): RunRecord[] {
  if (!existsSync(outFile)) return newRuns;
  try {
    const existing = JSON.parse(readFileSync(outFile, 'utf8'));
    const keyOf = (run: RunRecord) =>
      run.configHash ?? (run.config ? hashExperimentConfig(run.config, existing.universe ?? SYMBOLS) : run.name);
    // 같은 조합이면 새 run이 우선 — --force 백필(segments/costStress 추가)이 구 결과를 대체하게
    const byKey = new Map<string, RunRecord>();
    for (const run of [...(existing.runs ?? []), ...newRuns]) byKey.set(keyOf(run), run);
    return [...byKey.values()];
  } catch {
    return newRuns;
  }
}

function reportTradeCount(report: unknown): number {
  try {
    const parsed = typeof report === 'string' ? JSON.parse(report) : report as any;
    const trades = Number(parsed?.trades ?? 0);
    return Number.isFinite(trades) ? trades : 0;
  } catch {
    return 0;
  }
}

function printSearchPlan(experiments: ExperimentInput[], dryRun: boolean): void {
  const prefix = dryRun ? 'DRY-RUN' : '실행 예정';
  if (!experiments.length) {
    console.log(`${prefix}: 새 조합 없음`);
    return;
  }
  console.log(`${prefix}: ${experiments.length}개 조합`);
  for (const [i, exp] of experiments.entries()) {
    const values = exp.variantValues ? ` ${JSON.stringify(exp.variantValues)}` : '';
    console.log(`  ${String(i + 1).padStart(2)}. ${exp.name} ${exp.configHash ?? '-'}${values}`);
  }
}

async function pushResultsToServer(): Promise<void> {
  const base = normalizeApiBase(process.env.EXPERIMENT_API_URL);
  const user = process.env.EXPERIMENT_API_USER;
  const pass = process.env.EXPERIMENT_API_PASS;
  if (!base || !user || !pass) {
    console.error('--push: EXPERIMENT_API_URL/USER/PASS env 필요');
    process.exit(1);
  }

  const auth = await loginToAppApi(base, user, pass, '--push');

  const listRes = await fetch(`${base}/api/user/backtest-runs?limit=1000`, { headers: auth });
  if (!listRes.ok) throw new Error(`이력 조회 실패 HTTP ${listRes.status}`);
  const existingRuns = ((await listRes.json() as { runs: { id: number; configHash: string; report: unknown }[] }).runs ?? []);
  const existingByHash = new Map<string, { id: number; report: unknown }[]>();
  for (const run of existingRuns) {
    if (!run.configHash) continue;
    const list = existingByHash.get(run.configHash) ?? [];
    list.push({ id: run.id, report: run.report });
    existingByHash.set(run.configHash, list);
  }

  let pushed = 0, replaced = 0, skipped = 0;
  const handledHashes = new Set<string>();
  for (const f of readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(resolve(RESULTS_DIR, f), 'utf8'));
    for (const run of data.runs ?? []) {
      const hash = hashRunConfig(run.config, data.universe ?? [], undefined);
      const runHash = typeof run.configHash === 'string' && run.configHash ? run.configHash : hash;
      if (handledHashes.has(runHash)) { skipped++; continue; }
      const existingMatches = existingByHash.get(runHash) ?? [];
      const currentTrades = reportTradeCount(run.report);
      const bestExistingTrades = Math.max(-1, ...existingMatches.map(r => reportTradeCount(r.report)));
      if (existingMatches.length && bestExistingTrades >= currentTrades) { skipped++; handledHashes.add(runHash); continue; }
      if (existingMatches.length) {
        for (const item of existingMatches) {
          const deleteRes = await fetch(`${base}/api/user/backtest-runs/${item.id}`, { method: 'DELETE', headers: auth });
          if (!deleteRes.ok) throw new Error(`기존 이력 삭제 실패 ${run.name}: HTTP ${deleteRes.status}`);
        }
        replaced++;
      }
      const res = await fetch(`${base}/api/user/backtest-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          name: run.name,
          config: JSON.stringify(run.config),
          symbols: JSON.stringify(data.universe ?? []),
          rangeStart: null,
          rangeEnd: data.date,
          // segments/costStress를 report에 동봉 — 앱 stabilityMetrics가 같은 가드로 판정
          report: JSON.stringify({ ...run.report, segments: run.segments ?? null, costStress: run.costStress }),
          configHash: runHash,
        }),
      });
      if (!res.ok) { console.warn(`  업로드 실패 ${run.name}: HTTP ${res.status}`); continue; }
      handledHashes.add(runHash);
      pushed++;
    }
  }
  console.log(`서버 업로드: 신규 ${pushed}건, 교체 ${replaced}건, 중복 스킵 ${skipped}건`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--leaderboard-only')) {
    rebuildLeaderboard();
    return;
  }
  if (args.includes('--push-only')) {
    await pushResultsToServer();
    return;
  }
  const searchName = optionValue(args, '--search');
  const seed = optionValue(args, '--seed') ?? new Date().toISOString().slice(0, 10);
  const limitRaw = optionValue(args, '--limit');
  const samplerRaw = optionValue(args, '--sampler');
  const sampler = samplerRaw === 'grid' || samplerRaw === 'random' ? samplerRaw : undefined;
  const dryRun = args.includes('--dry-run') || args.includes('--plan-only');
  const force = args.includes('--force');
  const onlyRaw = optionValue(args, '--only');
  const only = onlyRaw ? new Set(onlyRaw.split(',').map(s => s.trim()).filter(Boolean)) : undefined;
  const maxMinutesRaw = optionValue(args, '--max-minutes');
  if (maxMinutesRaw !== undefined) {
    const maxMinutes = Number(maxMinutesRaw);
    if (!Number.isFinite(maxMinutes) || maxMinutes < 0) {
      console.error('--max-minutes는 0 이상의 숫자여야 합니다.');
      process.exit(1);
    }
    deadlineMs = Date.now() + maxMinutes * 60_000;
  }
  if (samplerRaw !== undefined && !sampler) {
    console.error('--sampler는 grid 또는 random이어야 합니다.');
    process.exit(1);
  }

  if (searchName) {
    const searchNames = searchName.split(',').map(s => s.trim()).filter(Boolean);
    if (!searchNames.length) {
      console.error('--search 뒤에 탐색 공간 이름이 필요합니다.');
      process.exit(1);
    }
    const limit = limitRaw !== undefined ? Number(limitRaw) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
      console.error('--limit은 1 이상의 숫자여야 합니다.');
      process.exit(1);
    }
    for (const name of searchNames) {
      const file = resolve(SEARCH_SPACES_DIR, `${name}.json`);
      const space = JSON.parse(readFileSync(file, 'utf8')) as SearchSpace;
      await runSearchSpace(space, { limit, seed, sampler, dryRun, force, only });
    }
    if (dryRun) return;
    rebuildLeaderboard();
    if (args.includes('--push')) await pushResultsToServer();
    return;
  }

  const sweepFiles = readdirSync(SWEEPS_DIR).filter(f => f.endsWith('.json'));
  const selectedNames = positionalArgs(args);
  const selected = selectedNames.length
    ? sweepFiles.filter(f => selectedNames.includes(basename(f, '.json')))
    : sweepFiles;
  if (!selected.length) {
    console.error(`스윕 없음. 사용 가능: ${sweepFiles.map(f => basename(f, '.json')).join(', ')}`);
    process.exit(1);
  }
  for (const f of selected) {
    const sweep = JSON.parse(readFileSync(resolve(SWEEPS_DIR, f), 'utf8')) as Sweep;
    await runSweep(sweep);
  }
  rebuildLeaderboard();
  if (args.includes('--push')) await pushResultsToServer();
}

function optionValue(args: string[], flag: string): string | undefined {
  const withEquals = args.find(a => a.startsWith(`${flag}=`));
  if (withEquals) return withEquals.slice(flag.length + 1);
  const i = args.indexOf(flag);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
  return undefined;
}

function positionalArgs(args: string[]): string[] {
  const withValue = new Set(['--search', '--limit', '--seed', '--sampler', '--only', '--max-minutes']);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (!arg.includes('=') && withValue.has(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

// runBacktest 내부 디버그 console.log 억제
const realLog = console.log;
console.log = (...args: any[]) => {
  const s = String(args[0] ?? '');
  if (s.startsWith('[')) return;
  if (s.startsWith('  noIdx:') || s.startsWith('  firstTouchTypes:') || s.startsWith('  [trade ')) return;
  realLog(...args);
};
main().finally(() => { console.log = realLog; });
