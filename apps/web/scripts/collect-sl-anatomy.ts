/**
 * SL 패턴 해부 데이터셋 수집기 (full 데이터·다중 TF)
 * ───────────────────────────────────────────────────────────
 * 목적: 하모닉 패턴이 PRZ에 "첫 터치"한 뒤 가격이 어떻게 흘렀나를 순수 관측해
 *       ML(트리계열)·EDA용 tabular 데이터셋 + 경로 JSONL을 만든다.
 *       전략 백테스트(진입→손익)가 아니라 관측이므로 0.5체결·손익·비용은 타지 않는다.
 *
 * 입력: ops/verify/fixtures/full/{SYMBOL}/{SYMBOL}-{tf}.json  (fetch-full-history.ts 산출)
 * 출력: research/datasets/full/sl-anatomy-{tf}.csv  +  sl-anatomy-{tf}-paths.jsonl  (TF별 분리)
 *
 * 실행: cd frontend && npx vite-node scripts/collect-sl-anatomy.ts [옵션]
 *   --tf 1d,4h      TF 지정 (기본 1M,1w,3d,1d,4h,1h 전체)
 *   --min-bars N    종목·TF당 최소 봉수 (기본 150, 미만이면 패턴 안 나와 skip)
 *   --top N         거래대금 상위 N종목만 (manifest 순서 기준, 기본 전체)
 *   --eq-off        EQ 컨플루언스 필터 끄기 (PRZ 단독까지 — 표본 최대화, 기본 ON)
 *   --display       분석 전용 기준: predict display(SL이탈 보존·우연터치/통째관통 컷·캔들폭밴드)
 *                   + SL폭 15% 캡 해제 + EQ OFF. 출력은 research/datasets/full-display/ 로 분리.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBacktest, DEFAULT_STRATEGY_PARAMS } from '../src/utils/backtestEngine';
import type { HarmonicAnatomyRow, StrategyParams } from '../src/utils/backtestEngine';
import type { Candle } from '../src/types/market';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FULL_DIR = resolve(ROOT, 'ops/verify/fixtures/full');
let OUT_DIR = resolve(ROOT, 'research/datasets/full');

// ── CLI ──
const argv = process.argv.slice(2);
const argVal = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TFS = (argVal('--tf')?.split(',').map(s => s.trim()) ?? ['1M', '1w', '3d', '1d', '4h', '1h']);
const MIN_BARS = Number(argVal('--min-bars') ?? 150);
const TOP = argVal('--top') ? Number(argVal('--top')) : Infinity;
const eqOff = argv.includes('--eq-off');
// 분석 전용 display 기준 수집: SL이탈 보존·우연터치/통째관통 컷·캔들폭밴드(predict display) +
// SL폭 캡 해제 + EQ OFF. 출력은 full-display/로 분리(기존 entry 데이터 보존). Gartley/Crab 품질필터는 유지.
const displayMode = argv.includes('--display');
const slCloseMode = argv.includes('--sl-close'); // SL을 종가 이탈 기준으로(꼬리 헌팅 무시)
if (displayMode) OUT_DIR = resolve(ROOT, 'research/datasets/full-display');
if (slCloseMode) OUT_DIR = OUT_DIR + '-slclose';

const params: StrategyParams = {
  ...DEFAULT_STRATEGY_PARAMS,
  useHarmonicStrategy: true,
  harmonicEntryMode: 'immediate', // t0 = PRZ에 꼬리라도 닿은 첫 봉(첫터치 정의)
  harmonicLogScale: true,         // 운영(워커·차트)과 동일한 피보 투영
  harmonicUseEqFilter: displayMode ? false : !eqOff, // display 모드는 EQ 강제 OFF(PRZ 단독)
  harmonicEnabledPatterns: [],    // 전체 패턴
  ...(displayMode ? { harmonicPredictMode: 'display' as const, harmonicNoSlCap: true } : {}),
  ...(slCloseMode ? { harmonicSlCloseBasis: true } : {}),
};

// 거래대금 순서(_manifest.symbols) 우선, 없으면 디렉토리 목록
function listSymbols(): string[] {
  const manPath = resolve(FULL_DIR, '_manifest.json');
  if (existsSync(manPath)) {
    const m = JSON.parse(readFileSync(manPath, 'utf8'));
    if (Array.isArray(m.symbols) && m.symbols.length) return m.symbols;
  }
  return readdirSync(FULL_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
}

const COLS: (keyof HarmonicAnatomyRow)[] = [
  'symbol', 'tf', 'signalTime', 'patternName', 'dir',
  'touchBody', 'touchWickZoneSide', 'closeInsideZone', 'touchRangeAtr', 'touchVolRel', 'penetrationDepth',
  'abXaRatio', 'xcXaRatio', 'abCdTimeRatio',
  'patternError', 'tpSlRatio', 'slDistPct', 'przWidth', 'closePosition', 'takerBuyRatio', 'htfTrendAligned',
  'approachReturn', 'precedingConsec', 'atrTrend', 'hourOfDay', 'dayOfWeek', 'htf2Aligned', 'btcAligned',
  'outcome', 'barsToEnd', 'straightToSL', 'slMode', 'mae', 'mfe', 'nextBarDir',
  'upBars', 'downBars', 'dojiBars', 'favBars', 'advBars', 'maxConsecAdv', 'reversals',
];

// 상위 TF 매핑 (htfTrendAligned 판정용)
const HTF_MAP: Record<string, string> = { '1h': '4h', '4h': '1d', '3d': '1w', '1d': '1w', '1w': '1M' };
// 2단계 위 TF (htf2Aligned)
const HTF2_MAP: Record<string, string> = { '1h': '1d', '4h': '1w', '3d': '1M', '1d': '1M' };
// BTC 1d 캔들 1회 로드 (btcAligned 판정용, SMA50)
let _btc: Candle[] | null = null;
function btcCandles(): Candle[] {
  if (_btc) return _btc;
  const f = resolve(FULL_DIR, 'BTCUSDT', 'BTCUSDT-1d.json');
  _btc = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Candle[]) : [];
  return _btc;
}
// t0 시점 상위TF 추세(SMA20 대비 종가)와 패턴 방향 정렬 여부
function htfAlign(htfCandles: Candle[], t0: number, dir: 'bull' | 'bear', period = 20): 0 | 1 | null {
  let idx = -1;
  for (let i = htfCandles.length - 1; i >= 0; i--) {
    if (Number(htfCandles[i].time) <= t0) { idx = i; break; }
  }
  if (idx < period) return null;
  let sma = 0;
  for (let i = idx - period + 1; i <= idx; i++) sma += htfCandles[i].close;
  sma /= period;
  const up = htfCandles[idx].close > sma;
  return (up === (dir === 'bull')) ? 1 : 0;
}
const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(6);
  return String(v);
};
const pct = (n: number, d: number) => d > 0 ? (n / d * 100).toFixed(1) + '%' : '-';
const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-';

const allSymbols = listSymbols();
const symbols = Number.isFinite(TOP) ? allSymbols.slice(0, TOP) : allSymbols;
mkdirSync(OUT_DIR, { recursive: true });
console.log(`종목 ${symbols.length} | TF [${TFS.join(',')}] | min-bars ${MIN_BARS} | EQ ${params.harmonicUseEqFilter ? 'ON' : 'OFF'} | 모드 ${displayMode ? 'display(SL이탈보존·SL캡해제)' : 'entry'} → ${OUT_DIR.split('/').pop()}\n`);

for (const tf of TFS) {
  const t0 = Date.now();
  const rows: HarmonicAnatomyRow[] = [];
  let usedSymbols = 0, skippedShort = 0;
  for (const symbol of symbols) {
    const file = resolve(FULL_DIR, symbol, `${symbol}-${tf}.json`);
    if (!existsSync(file)) continue;
    let candles: Candle[];
    try { candles = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    if (!Array.isArray(candles) || candles.length < MIN_BARS) { skippedShort++; continue; }
    const out: HarmonicAnatomyRow[] = [];
    runBacktest(symbol, candles, candles, params, 100, out);
    for (const r of out) r.tf = tf;
    rows.push(...out);
    usedSymbols++;
  }
  rows.sort((a, b) => a.signalTime - b.signalTime);

  // htfTrendAligned / htf2Aligned 채우기 — 상위TF 캔들을 종목별 1회 로드해 t0 추세 판정
  const loadHtf = (htfTf: string | undefined, assign: (r: HarmonicAnatomyRow, hc: Candle[]) => void) => {
    if (!htfTf) return;
    const cache = new Map<string, Candle[]>();
    for (const r of rows) {
      if (!cache.has(r.symbol)) {
        const f = resolve(FULL_DIR, r.symbol, `${r.symbol}-${htfTf}.json`);
        let hc: Candle[] = [];
        if (existsSync(f)) { try { hc = JSON.parse(readFileSync(f, 'utf8')); } catch { /* skip */ } }
        cache.set(r.symbol, hc);
      }
      assign(r, cache.get(r.symbol)!);
    }
  };
  loadHtf(HTF_MAP[tf], (r, hc) => { r.htfTrendAligned = hc.length ? htfAlign(hc, r.signalTime, r.dir) : null; });
  loadHtf(HTF2_MAP[tf], (r, hc) => { r.htf2Aligned = hc.length ? htfAlign(hc, r.signalTime, r.dir) : null; });
  // btcAligned — BTC 1d SMA50 추세 vs 패턴방향
  const btc = btcCandles();
  for (const r of rows) r.btcAligned = btc.length ? htfAlign(btc, r.signalTime, r.dir, 50) : null;

  // 출력 — 요약 CSV + 경로 JSONL
  const csv = [COLS.join(',')].concat(rows.map(r => COLS.map(c => fmt(r[c])).join(','))).join('\n');
  writeFileSync(resolve(OUT_DIR, `sl-anatomy-${tf}.csv`), csv + '\n');
  const jsonl = rows.map(r => JSON.stringify({
    symbol: r.symbol, tf: r.tf, signalTime: r.signalTime,
    patternName: r.patternName, dir: r.dir, outcome: r.outcome,
    przPrice: r.przPrice, slPrice: r.slPrice, tp1: r.tp1,
    pointsTime: r.pointsTime, touchIdx: r.touchIdx, endIdx: r.endIdx,
    barsToEnd: r.barsToEnd, straightToSL: r.straightToSL, slMode: r.slMode,
    path: r.path,
  })).join('\n');
  writeFileSync(resolve(OUT_DIR, `sl-anatomy-${tf}-paths.jsonl`), jsonl + '\n');

  // 통계
  const resolved = rows.filter(r => r.outcome !== 'open');
  const sl = resolved.filter(r => r.outcome === 'SL');
  const tp = resolved.filter(r => r.outcome === 'TP');
  const inZone = resolved.filter(r => r.closeInsideZone === 1);
  const outZone = resolved.filter(r => r.closeInsideZone === 0);
  const slRate = (g: HarmonicAnatomyRow[]) => pct(g.filter(r => r.outcome === 'SL').length, g.length);
  const straightSL = sl.filter(r => r.straightToSL === 1).length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(`━━ ${tf} ━━ (종목 ${usedSymbols} 사용 / 짧아서 skip ${skippedShort}, ${elapsed}s)`);
  console.log(`  총 패턴 ${rows.length} (resolved ${resolved.length} / open ${rows.length - resolved.length})`);
  console.log(`  SL ${sl.length} (${pct(sl.length, resolved.length)}) / TP ${tp.length} (${pct(tp.length, resolved.length)})`);
  console.log(`  종가 존밖 SL율 ${slRate(outZone)}(n=${outZone.length}) / 존안 ${slRate(inZone)}(n=${inZone.length})`);
  console.log(`  직행SL ${straightSL}/${sl.length} (${pct(straightSL, sl.length)}) | barsToEnd SL ${avg(sl.map(r => r.barsToEnd ?? 0))} TP ${avg(tp.map(r => r.barsToEnd ?? 0))}`);
  const htfA = resolved.filter(r => r.htfTrendAligned === 1);
  const htfC = resolved.filter(r => r.htfTrendAligned === 0);
  if (htfA.length || htfC.length) console.log(`  상위TF 추세정렬 SL율 ${slRate(htfA)}(n=${htfA.length}) / 역추세 ${slRate(htfC)}(n=${htfC.length})`);
  console.log(`  → sl-anatomy-${tf}.csv (${rows.length}행) + -paths.jsonl\n`);
}
console.log(`저장: ${OUT_DIR}`);
