// 비트겟 거래 가능 심볼 목록 — 트레이드 진입 가드용. 퍼블릭 API(키 불필요, CORS *).
// 마켓별 1회 조회 후 Set 캐시. 목록을 못 받으면 막지 않음(fail-open).

type Market = 'futures' | 'spot';

const ENDPOINTS: Record<Market, string> = {
  futures: 'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES',
  spot: 'https://api.bitget.com/api/v2/spot/public/symbols',
};

const cache: Partial<Record<Market, Set<string>>> = {};
const inflight: Partial<Record<Market, Promise<Set<string> | null>>> = {};

function load(market: Market): Promise<Set<string> | null> {
  if (cache[market]) return Promise.resolve(cache[market]!);
  if (inflight[market]) return inflight[market]!;

  const p = (async () => {
    try {
      const res = await fetch(ENDPOINTS[market]);
      if (!res.ok) return null;
      const json = await res.json();
      if (json.code !== '00000' || !Array.isArray(json.data)) return null;
      const set = new Set<string>(
        json.data
          .map((d: any) => String(d?.symbol ?? '').toUpperCase())
          .filter(Boolean)
      );
      cache[market] = set;
      return set;
    } catch {
      return null;
    } finally {
      inflight[market] = undefined;
    }
  })();

  inflight[market] = p;
  return p;
}

/** 앱 로드 시 미리 받아두면 트레이드 버튼 누를 때 즉시 판정된다. */
export function prefetchBitgetSymbols() {
  load('futures');
  load('spot');
}

/** 해당 마켓에 그 심볼이 비트겟에 있는지. 목록을 못 받으면 true(차단하지 않음). */
export async function isBitgetSymbolSupported(symbol: string, market: Market): Promise<boolean> {
  const set = await load(market);
  if (!set) return true; // fail-open
  return set.has(symbol.toUpperCase());
}
