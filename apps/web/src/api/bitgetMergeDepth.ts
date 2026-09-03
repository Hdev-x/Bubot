// 비트겟 호가창(merge-depth) — 단위(precision)별로 서버가 합산해 주는 REST 호가.
// 퍼블릭 데이터(키 불필요)라 브라우저에서 비트겟에 직접 호출(CORS: *).
// WS books15는 최소단위만 줘서 10·100 묶음을 못 만들기에, 단위 묶음은 이 엔드포인트로 받는다.
//
// precision 매핑(BTCUSDT 기준): scale0=0.1, scale1=1, scale2=10, scale3=100.

const MIX_URL = 'https://api.bitget.com/api/v2/mix/market/merge-depth';   // 선물
const SPOT_URL = 'https://api.bitget.com/api/v2/spot/market/merge-depth'; // 현물

export type DepthPrecision = 'scale0' | 'scale1' | 'scale2' | 'scale3';

export type OrderbookLevel = { price: number; size: number };
export type OrderbookSnapshot = {
  asks: OrderbookLevel[]; // 가격 오름차순(최우선 매도 = [0])
  bids: OrderbookLevel[]; // 가격 내림차순(최우선 매수 = [0])
  ts: number;
  scale: string; // 비트겟이 알려주는 실제 묶음 단위(예: "0.1", "10")
  key?: string;  // 이 스냅샷이 속한 거래소|심볼|선물여부 — 종목 전환 시 "현재 종목 호가인지" 판별용(useOrderbook이 채움)
};

function parseLevels(raw: [string | number, string | number][]): OrderbookLevel[] {
  return raw
    .map(([p, s]) => ({ price: Number(p), size: Number(s) }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.size));
}

/**
 * 지정 단위(precision)의 호가를 한 번 조회. 실패 시 null.
 */
export async function fetchMergeDepth(
  symbol: string,
  precision: DepthPrecision,
  isFutures = true,
  limit = 15
): Promise<OrderbookSnapshot | null> {
  // 선물=mix(productType 필요), 현물=spot(productType 없음).
  // ⚠️ Bitget은 같은 scaleN을 현물에서 선물보다 한 단계 더 잘게 해석한다(현물 scale0=0.01, 선물 scale0=0.1).
  //    UI 단위(선물기준 라벨)를 현물에 맞추려면 precision을 +1 시프트한다. (enum 최대 scale4로 클램프)
  let url: string;
  if (isFutures) {
    url = `${MIX_URL}?symbol=${encodeURIComponent(symbol)}&productType=usdt-futures&precision=${precision}&limit=${limit}`;
  } else {
    const idx = Number(precision.replace('scale', ''));
    const spotPrecision = `scale${Math.min(idx + 1, 4)}`;
    url = `${SPOT_URL}?symbol=${encodeURIComponent(symbol)}&precision=${spotPrecision}&limit=${limit}`;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== '00000' || !json.data) return null;
    const d = json.data;
    return {
      asks: parseLevels(d.asks ?? []),
      bids: parseLevels(d.bids ?? []),
      ts: Number(d.ts ?? Date.now()),
      scale: String(d.scale ?? ''),
    };
  } catch {
    return null;
  }
}
