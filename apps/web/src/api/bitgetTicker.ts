// Bitget 선물 24h 티커 — 공개 API 직접 호출(merge-depth/funding 등과 동일 패턴).
// 헤더 정보(24h 고가/저가/거래량/거래대금/시가)용.
const URL = 'https://api.bitget.com/api/v2/mix/market/ticker';

export interface BitgetTicker {
  last: number;
  high24h: number;
  low24h: number;
  baseVolume: number;   // 24h 거래량 (코인 수량)
  quoteVolume: number;  // 24h 거래대금 (USDT)
  openUtc: number;      // 당일(UTC) 시가
}

export async function fetchBitgetFuturesTicker(symbol: string): Promise<BitgetTicker | null> {
  try {
    const res = await fetch(`${URL}?symbol=${symbol}&productType=USDT-FUTURES`);
    const json = await res.json();
    const t = json?.data?.[0];
    if (!t) return null;
    const num = (v: unknown) => Number(v) || 0;
    return {
      last: num(t.lastPr),
      high24h: num(t.high24h),
      low24h: num(t.low24h),
      baseVolume: num(t.baseVolume),
      quoteVolume: num(t.quoteVolume ?? t.usdtVolume),
      openUtc: num(t.openUtc),
    };
  } catch {
    return null;
  }
}
