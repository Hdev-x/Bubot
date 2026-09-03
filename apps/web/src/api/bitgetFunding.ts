// Bitget 선물 펀딩비 — 공개 API 직접 호출(merge-depth 등과 동일 패턴).
// current-fund-rate 한 번으로 펀딩률·주기·다음 펀딩시각을 모두 받는다.
const URL = 'https://api.bitget.com/api/v2/mix/market/current-fund-rate';

export interface FundingInfo {
  rate: number;          // 펀딩률(비율, ×100 = %)
  intervalHours: number; // 펀딩 주기(시간)
  nextUpdate: number;    // 다음 펀딩 시각(ms epoch)
}

/** 선물 심볼의 현재 펀딩비 조회. 실패/없으면 null. */
export async function fetchFundingRate(symbol: string): Promise<FundingInfo | null> {
  try {
    const res = await fetch(`${URL}?symbol=${symbol}&productType=USDT-FUTURES`);
    if (!res.ok) return null;
    const json = await res.json();
    const d = Array.isArray(json?.data) ? json.data[0] : null;
    if (!d) return null;
    const rate = parseFloat(d.fundingRate);
    const nextUpdate = parseInt(d.nextUpdate, 10);
    if (!Number.isFinite(rate) || !Number.isFinite(nextUpdate)) return null;
    return {
      rate,
      intervalHours: parseInt(d.fundingRateInterval ?? '8', 10) || 8,
      nextUpdate,
    };
  } catch {
    return null;
  }
}

// Binance 선물 펀딩비 — premiumIndex 공개 API 직접. 주기는 premiumIndex에 없어 8h 기본.
const BINANCE_FUNDING_URL = 'https://fapi.binance.com/fapi/v1/premiumIndex';

export async function fetchBinanceFunding(symbol: string): Promise<FundingInfo | null> {
  try {
    const res = await fetch(`${BINANCE_FUNDING_URL}?symbol=${symbol}`);
    if (!res.ok) return null;
    const d = await res.json();
    const rate = parseFloat(d.lastFundingRate);
    const nextUpdate = Number(d.nextFundingTime);
    if (!Number.isFinite(rate) || !Number.isFinite(nextUpdate) || nextUpdate <= 0) return null;
    return { rate, intervalHours: 8, nextUpdate };
  } catch {
    return null;
  }
}
