import { authedGetJson } from '../client';

/** MAIN 키(수동) 포지션 1건 */
export interface MainPosition {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  markPrice: number;
  unrealizedPl: number;
  leverage: number;
  marginMode: string;
  liqPrice: number;    // 예상 청산가
  mmr: number;         // 유지증거금률(비율, ×100 = %)
  margin: number;      // 포지션 증거금(USDT)
  realizedPl: number;  // 실현손익(USDT)
  takeProfit: number;  // 포지션 전체 TP (0=미설정)
  stopLoss: number;    // 포지션 전체 SL (0=미설정)
}

/** MAIN 키(수동) 미체결 주문 1건 */
export interface MainOrder {
  orderId: string;
  symbol: string;
  side: string;       // buy / sell
  tradeSide: string;  // open / close
  orderType: string;  // limit / market
  price: number;
  size: number;
  filledQty: number;
  leverage: number;
  status: string;
  cTime: number;
}

/** TP/SL 등 플랜(트리거) 미체결 주문 1건 */
export interface MainPlanOrder {
  orderId: string;
  symbol: string;
  planType: string;      // pos_profit/pos_loss/profit_plan/loss_plan
  triggerPrice: number;
  triggerType: string;   // mark_price/fill_price
  executePrice: number;  // <=0 = 시장가
  size: number;
  side: string;
  tradeSide: string;     // open/close
  posSide: string;       // long/short
  marginMode: string;
  orderType: string;
  cTime: number;
}

export interface MainTradeOverview {
  hasKey: boolean;
  positions: MainPosition[];
  orders: MainOrder[];
  planOrders: MainPlanOrder[];
  available: number;
  equity: number; // 계좌 총 평가자산(잔고+미실현). 총 자산 표시용
}

const EMPTY: MainTradeOverview = { hasKey: false, positions: [], orders: [], planOrders: [], available: 0, equity: 0 };

/** Trade 페이지: MAIN 키로 포지션·미체결·잔고를 한 번에 조회 (보기 전용). */
export async function fetchMainTrade(exchange = 'BITGET'): Promise<MainTradeOverview> {
  try {
    const data = await authedGetJson<any>(`/api/user/main-trade?exchange=${exchange}`);
    return {
      hasKey: !!data?.hasKey,
      positions: Array.isArray(data?.positions) ? data.positions : [],
      orders: Array.isArray(data?.orders) ? data.orders : [],
      planOrders: Array.isArray(data?.planOrders) ? data.planOrders : [],
      available: typeof data?.available === 'number' ? data.available : 0,
      equity: typeof data?.equity === 'number' ? data.equity : 0,
    };
  } catch (e) {
    console.error(e);
    return EMPTY;
  }
}
