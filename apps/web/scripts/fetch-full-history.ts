/**
 * 대용량 캔들 수집기 — 표본 확대용
 * ───────────────────────────────────────────────────────────
 * Binance USDⓈ-M 선물에서 거래대금 상위 N종목의 다중 TF 캔들을
 * 상장일~현재까지 받아 종목별/TF별로 저장한다. SL anatomy 등 분석의 원재료.
 *
 * 실행: cd frontend && npx vite-node scripts/fetch-full-history.ts [옵션]
 *   --top N          거래대금 상위 N종목 (기본 100)
 *   --symbols A,B     특정 종목만 (스모크 테스트용, --top 무시)
 *   --tfs 1M,1h       TF 오버라이드 (기본: 1M,1w,3d,1d,4h,1h)
 *   --sleep MS        페이지 간 대기 (기본 500ms, 보수)
 *   --force           기존 파일 무시하고 재수집
 *
 * 저장: ops/verify/fixtures/full/{SYMBOL}/{SYMBOL}-{tf}.json  +  _manifest.json
 *
 * Rate limit(보수): 페이지 sleep + X-MBX-USED-WEIGHT-1m 감시 + 429/418 backoff.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = resolve(ROOT, 'ops/verify/fixtures/full');
const FAPI = 'https://fapi.binance.com';

// ── 확장 캔들: OHLCV + 거래대금/체결수/매수세 ──
type FullCandle = {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  quoteVolume: number;  // 거래대금(USDT)
  trades: number;       // 체결 건수
  takerBuyVolume: number; // 시장가 매수 체결량(코인) — volume 대비 비율이 매수세
};

// ── CLI 파싱 ──
const argv = process.argv.slice(2);
const argVal = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TOP = Number(argVal('--top') ?? 100);
const SYMBOLS_OVERRIDE = argVal('--symbols')?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const TFS = (argVal('--tfs')?.split(',').map(s => s.trim()) ?? ['1M', '1w', '3d', '1d', '4h', '1h']);
const SLEEP_MS = Number(argVal('--sleep') ?? 500);
const FORCE = argv.includes('--force');
const PAGE_LIMIT = 1500;          // Binance futures klines 최대
const WEIGHT_SOFT_CAP = 1800;     // 1m weight 이 값 넘으면 대기 (한도 2400)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── rate limit 인지 fetch (weight 감시 + 429/418 backoff) ──
let lastWeight = 0;
async function safeFetch(url: string, attempt = 0): Promise<Response> {
  const res = await fetch(url);
  const w = Number(res.headers.get('x-mbx-used-weight-1m') ?? 0);
  if (w) lastWeight = w;
  if (res.status === 429 || res.status === 418) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 0);
    const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 2000 * 2 ** attempt);
    console.warn(`  ⚠ ${res.status} rate limit — ${(wait / 1000).toFixed(0)}s 대기 후 재시도`);
    await sleep(wait);
    return safeFetch(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  // weight 한도 근처면 1분 식힘
  if (lastWeight >= WEIGHT_SOFT_CAP) {
    console.warn(`  ⏸ weight ${lastWeight}/${WEIGHT_SOFT_CAP} — 60s 대기`);
    await sleep(60000);
  }
  return res;
}

// ── 종목 선정: USDT 무기한 TRADING ∩ 거래대금 상위 ──
async function selectSymbols(): Promise<string[]> {
  if (SYMBOLS_OVERRIDE?.length) return SYMBOLS_OVERRIDE;
  const info = await (await safeFetch(`${FAPI}/fapi/v1/exchangeInfo`)).json() as any;
  const usdtPerp = new Set<string>(
    (info.symbols ?? [])
      .filter((s: any) => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING')
      .map((s: any) => s.symbol),
  );
  const tickers = await (await safeFetch(`${FAPI}/fapi/v1/ticker/24hr`)).json() as any[];
  return tickers
    .filter(t => usdtPerp.has(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, TOP)
    .map(t => t.symbol);
}

// ── 한 종목·TF 상장일~현재 전부 (endTime 역페이지네이션) ──
async function fetchAll(symbol: string, tf: string): Promise<FullCandle[]> {
  const out: FullCandle[] = [];
  let endTime: number | undefined;
  for (;;) {
    const u = new URL(`${FAPI}/fapi/v1/klines`);
    u.searchParams.set('symbol', symbol);
    u.searchParams.set('interval', tf);
    u.searchParams.set('limit', String(PAGE_LIMIT));
    if (endTime) u.searchParams.set('endTime', String(endTime));
    const rows = await (await safeFetch(u.toString())).json() as any[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    const page: FullCandle[] = rows.map(r => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5],
      quoteVolume: +r[7], trades: +r[8], takerBuyVolume: +r[9],
    }));
    out.unshift(...page);
    endTime = Number(rows[0][0]) - 1; // 가장 오래된 봉 직전으로
    await sleep(SLEEP_MS);
    if (rows.length < PAGE_LIMIT) break; // 상장일 도달
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

type ManifestEntry = { bars: number; from: number; to: number; fetchedAt: string };
type Manifest = { updatedAt: string; top: number; symbols: string[]; data: Record<string, Record<string, ManifestEntry>> };

async function main() {
  const t0 = Date.now();
  mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = resolve(OUT_DIR, '_manifest.json');
  const manifest: Manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { updatedAt: '', top: TOP, symbols: [], data: {} };

  console.log('종목 선정 중...');
  const symbols = await selectSymbols();
  manifest.symbols = symbols;
  console.log(`대상 ${symbols.length}종목 × ${TFS.length}TF [${TFS.join(',')}] | sleep ${SLEEP_MS}ms | force=${FORCE}\n`);

  let done = 0, skipped = 0;
  const total = symbols.length * TFS.length;
  for (const tf of TFS) {              // 큰 TF부터 (바깥 루프)
    for (const symbol of symbols) {
      const dir = resolve(OUT_DIR, symbol);
      const file = resolve(dir, `${symbol}-${tf}.json`);
      manifest.data[symbol] ??= {};
      // 재개: 이미 받은 유효 파일이면 skip
      if (!FORCE && existsSync(file)) {
        try {
          const arr = JSON.parse(readFileSync(file, 'utf8'));
          if (Array.isArray(arr) && arr.length > 0) { skipped++; continue; }
        } catch { /* 손상 → 재수집 */ }
      }
      try {
        const candles = await fetchAll(symbol, tf);
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(candles));
        manifest.data[symbol][tf] = {
          bars: candles.length,
          from: candles[0]?.time ?? 0,
          to: candles[candles.length - 1]?.time ?? 0,
          fetchedAt: new Date().toISOString(),
        };
        manifest.updatedAt = new Date().toISOString();
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        done++;
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        console.log(`✓ ${symbol}-${tf}: ${candles.length}봉 (w${lastWeight}) [${done + skipped}/${total}, ${elapsed}s]`);
      } catch (e) {
        console.error(`✗ ${symbol}-${tf}: ${(e as Error).message}`);
      }
    }
  }
  console.log(`\n완료: 신규 ${done} / skip ${skipped} / 총 ${total} | ${((Date.now() - t0) / 1000 / 60).toFixed(1)}분`);
  console.log(`저장: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
