import { authedGetJson, authedMutate } from './authApi';

/** 현물 보유자산 1건 */
export interface SpotHolding {
  coin: string;
  available: number;
  frozen: number;
  avgCost?: number;       // 가중평균 매입가(체결내역 재구성). 없으면 원가 조회불가
  costReliable?: boolean; // 보유량을 다 덮는 매입기록이 있어 신뢰 가능한지(90일 초과 등이면 false)
  costSource?: 'manual';  // 'manual' = 사용자가 직접 입력한 원가(거래소 데이터 아님)
}

/** 현물 미체결 주문 1건 */
export interface SpotOrder {
  orderId: string;
  symbol: string;
  side: string;       // buy / sell
  orderType: string;  // limit / market
  price: number;
  size: number;
  filledQty: number;
  status: string;
  cTime: number;
}

export interface SpotTradeOverview {
  hasKey: boolean;
  holdings: SpotHolding[];
  orders: SpotOrder[];
  usdtAvailable: number;
}

const EMPTY: SpotTradeOverview = { hasKey: false, holdings: [], orders: [], usdtAvailable: 0 };
// (UI 작업용 더미 현물 보유 데이터는 2026-07-05 사용자 요청으로 제거 — 실데이터만 표시)

/** 수동 입력 매수평균가 조회 → { coin: avgCost } */
export async function fetchSpotManualCosts(exchange = 'BITGET'): Promise<Record<string, number>> {
  try {
    return (await authedGetJson<Record<string, number>>(`/api/user/spot-manual-cost?exchange=${exchange}`)) || {};
  } catch {
    return {};
  }
}

/** 수동 매수평균가 저장/수정(업서트) */
export async function saveSpotManualCost(coin: string, avgCost: number, exchange = 'BITGET'): Promise<void> {
  await authedMutate(`/api/user/spot-manual-cost`, 'PUT', { exchange, coin, avgCost });
}

/** 수동 매수평균가 삭제 */
export async function deleteSpotManualCost(coin: string, exchange = 'BITGET'): Promise<void> {
  await authedMutate(`/api/user/spot-manual-cost?exchange=${exchange}&coin=${encodeURIComponent(coin)}`, 'DELETE');
}

/** 거래소 원가가 없거나(신뢰불가) 빈 코인에 수동 입력값을 채운다(현금 제외, 실데이터 우선). */
function mergeManualCosts(holdings: SpotHolding[], manual: Record<string, number>): SpotHolding[] {
  return holdings.map((h) => {
    if (h.coin === 'USDT' || h.coin === 'USDC') return h;
    const hasReal = h.avgCost != null && h.costReliable === true;
    const m = manual[h.coin];
    if (!hasReal && typeof m === 'number' && m > 0) {
      return { ...h, avgCost: m, costReliable: true, costSource: 'manual' as const };
    }
    return h;
  });
}

/** Trade 페이지(현물): MAIN 키로 보유자산·미체결을 한 번에 조회 (보기 전용). */
export async function fetchSpotTrade(exchange = 'BITGET'): Promise<SpotTradeOverview> {
  try {
    const [data, manual] = await Promise.all([
      authedGetJson<any>(`/api/user/spot-trade?exchange=${exchange}`),
      fetchSpotManualCosts(exchange),
    ]);
    const real: SpotHolding[] = Array.isArray(data?.holdings) ? data.holdings : [];
    return {
      hasKey: data?.hasKey !== false,
      holdings: mergeManualCosts(real, manual),
      orders: Array.isArray(data?.orders) ? data.orders : [],
      usdtAvailable: typeof data?.usdtAvailable === 'number' ? data.usdtAvailable : 0,
    };
  } catch (e) {
    console.error(e);
    return EMPTY;
  }
}
