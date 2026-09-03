// 헤더 우측 24h 통계(고가/저가/거래량/거래대금)용 — 거래소별 공개 티커 API를 BitgetTicker 형태로 통일.
// 기존엔 전 거래소를 Bitget 선물 티커로 받아 Binance/KRW가 부정확했던 것을 거래소별로 라우팅.
import { fetchBitgetFuturesTicker, type BitgetTicker } from './bitgetTicker';

type Exchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
const num = (v: unknown) => Number(v) || 0;

// Bitget 현물
async function fetchBitgetSpot(symbol: string): Promise<BitgetTicker | null> {
  try {
    const res = await fetch(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);
    const t = (await res.json())?.data?.[0];
    if (!t) return null;
    return {
      last: num(t.lastPr), high24h: num(t.high24h), low24h: num(t.low24h),
      baseVolume: num(t.baseVolume), quoteVolume: num(t.quoteVolume ?? t.usdtVolume), openUtc: num(t.openUtc),
    };
  } catch { return null; }
}

// Binance 선물/현물 24hr 티커
async function fetchBinance(symbol: string, isFutures: boolean): Promise<BitgetTicker | null> {
  const url = isFutures
    ? `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`
    : `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const t = await (await fetch(url)).json();
    if (!t || t.code) return null;
    return {
      last: num(t.lastPrice), high24h: num(t.highPrice), low24h: num(t.lowPrice),
      baseVolume: num(t.volume), quoteVolume: num(t.quoteVolume), openUtc: num(t.openPrice),
    };
  } catch { return null; }
}

// 업비트 — symbol "BTCKRW" → "KRW-BTC"
async function fetchUpbit(symbol: string): Promise<BitgetTicker | null> {
  const code = `KRW-${symbol.replace(/KRW$/, '')}`;
  try {
    const d = (await (await fetch(`https://api.upbit.com/v1/ticker?markets=${code}`)).json())?.[0];
    if (!d) return null;
    return {
      last: num(d.trade_price), high24h: num(d.high_price), low24h: num(d.low_price),
      baseVolume: num(d.acc_trade_volume_24h), quoteVolume: num(d.acc_trade_price_24h), openUtc: num(d.opening_price),
    };
  } catch { return null; }
}

// 빗썸 — symbol "BTCKRW" → "BTC_KRW"
async function fetchBithumb(symbol: string): Promise<BitgetTicker | null> {
  const base = symbol.replace(/KRW$/, '');
  try {
    const json = await (await fetch(`https://api.bithumb.com/public/ticker/${base}_KRW`)).json();
    const d = json?.data;
    if (!d || json.status !== '0000') return null;
    return {
      last: num(d.closing_price), high24h: num(d.max_price), low24h: num(d.min_price),
      baseVolume: num(d.units_traded_24H), quoteVolume: num(d.acc_trade_value_24H), openUtc: num(d.opening_price),
    };
  } catch { return null; }
}

export function fetchHeaderTicker(exchange: Exchange, symbol: string, isFutures: boolean): Promise<BitgetTicker | null> {
  switch (exchange) {
    case 'BINANCE': return fetchBinance(symbol, isFutures);
    case 'UPBIT':   return fetchUpbit(symbol);
    case 'BITHUMB': return fetchBithumb(symbol);
    default:        return isFutures ? fetchBitgetFuturesTicker(symbol) : fetchBitgetSpot(symbol);
  }
}
