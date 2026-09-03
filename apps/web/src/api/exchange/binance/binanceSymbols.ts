// 바이낸스 USDT-M 선물 거래 가능 심볼 목록 — 차트 거래소 우선순위(바이낸스 선물 우선) 판정용.
// 퍼블릭 API(키 불필요, CORS *). 1회 조회 후 Set 캐시. 못 받으면 막지 않음(fail-open → 비트겟 폴백).

const ENDPOINT = 'https://fapi.binance.com/fapi/v1/exchangeInfo';

let cache: Set<string> | null = null;
let inflight: Promise<Set<string> | null> | null = null;

function load(): Promise<Set<string> | null> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) return null;
      const json = await res.json();
      if (!Array.isArray(json?.symbols)) return null;
      const set = new Set<string>(
        json.symbols
          .filter((s: any) => s?.contractType === 'PERPETUAL' && s?.status === 'TRADING')
          .map((s: any) => String(s?.symbol ?? '').toUpperCase())
          .filter(Boolean)
      );
      cache = set;
      return set;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 앱 로드 시 미리 받아두면 트레이드 시트 선택 시 즉시 판정된다. */
export function prefetchBinanceSymbols() {
  load();
}

/** 그 심볼이 바이낸스 USDT-M 선물에 있는지. 목록을 못 받으면 false(→ 비트겟 선물 폴백). */
export async function isBinanceFuturesSupported(symbol: string): Promise<boolean> {
  const set = await load();
  if (!set) return false; // fail → 비트겟 폴백
  return set.has(symbol.toUpperCase());
}
