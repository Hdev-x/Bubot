// 업비트/빗썸 KRW 현물 티커 — 공개 REST 직접 호출(백엔드 미경유).
// 비트겟 merge-depth처럼 브라우저에서 거래소 공개 API를 바로 친다.
// 백엔드 트레이딩 API는 사용자가 키를 줄 때 연결(M-EX6 이후).
import type { CoinTicker, Candle } from '../../../shared/types/market';
import { getToken } from '../../client';

// 마켓 리스트 티커는 백엔드 캐시 집약 엔드포인트에서 받는다(브라우저 직접 폴링 제거 → 멀티유저 429 방지).
type KrwRow = { base: string; name: string; last: number; change: number; changeRate: number; volume: number };
async function backendKrwTickers(ex: 'upbit' | 'bithumb'): Promise<KrwRow[]> {
  const token = getToken();
  const res = await fetch(`/coin/api/${ex}/tickers`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`krw ${ex} tickers ${res.status}`);
  return (await res.json()) as KrwRow[];
}
function krwRowToTicker(r: KrwRow): CoinTicker {
  return {
    symbol: `${r.base}KRW`, baseSymbol: r.base, quoteSymbol: 'KRW', name: r.name,
    last: r.last, change: r.change, changeRate: r.changeRate, volume: r.volume,
    tickDecimals: krwDecimals(r.last),
  } as CoinTicker;
}

// KRW 가격 표시 소수 자릿수 — 큰 가격은 0자리, 소액 코인만 소수 유지. (마켓 리스트·차트축·호가 공용)
export function krwDecimals(price: number): number {
  if (!Number.isFinite(price)) return 0;
  if (price >= 100) return 0;
  const s = String(price);
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return Math.min(8, s.length - dot - 1);
}

// ───────────────── 업비트 ─────────────────

export async function fetchUpbitSpotTickers(): Promise<CoinTicker[]> {
  // 백엔드 캐시 집약(서버가 업비트 1콜로 받아 뿌림). 실패 시 throw → 호출부가 이전 목록 유지.
  const rows = await backendKrwTickers('upbit');
  return rows.map(krwRowToTicker)
    .filter((t) => t.last > 0)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

// ───────────────── 빗썸 ─────────────────
export async function fetchBithumbSpotTickers(): Promise<CoinTicker[]> {
  // 백엔드 캐시 집약(서버가 빗썸 1콜로 받아 뿌림 + 업비트 한글명 보강). 실패 시 throw → 이전 목록 유지.
  const rows = await backendKrwTickers('bithumb');
  return rows.map(krwRowToTicker)
    .filter((t) => t.last > 0)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

// ───────────────── 업비트 캔들 ─────────────────
// 백엔드 프록시 경유 — 업비트 candles는 IP당 동시 버스트에 즉시 429라 브라우저 직결이면 차트 오픈 시
// (초기600봉 페이징+일봉2개+시드 동시 호출) 429 폭주로 차트가 안 뜸. 서버가 간격+캐시로 받아 흡수한다.
// granularity→경로 매핑·페이징은 백엔드(KrwMarketService)가 처리. 반환은 정규화 Candle 배열.
export async function fetchUpbitCandles(symbol: string, granularity: string, limit: number, endTime?: string): Promise<Candle[]> {
  const token = getToken();
  const params = new URLSearchParams({ symbol, granularity, count: String(Math.min(limit, 1000)) });
  if (endTime) params.set('to', String(endTime)); // ms — 백엔드가 ISO로 변환
  try {
    const res = await fetch(`/coin/api/upbit/candles?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return [];
    const rows = (await res.json()) as Candle[];
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// ───────────────── 빗썸 캔들 ─────────────────
// 백엔드 프록시 경유 — 업비트와 동일 이유(직결 429·멀티유저). granularity→interval 매핑은 백엔드가 처리.
export async function fetchBithumbCandles(symbol: string, granularity: string, limit: number, endTime?: string): Promise<Candle[]> {
  const token = getToken();
  const params = new URLSearchParams({ symbol, granularity, count: String(limit) });
  if (endTime) params.set('to', String(endTime)); // ms — 백엔드가 ISO로 변환(과거 스크롤)
  try {
    const res = await fetch(`/coin/api/bithumb/candles?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return [];
    const rows = (await res.json()) as Candle[];
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
