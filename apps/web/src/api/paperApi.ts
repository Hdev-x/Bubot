// 모의투자(페이퍼) 가상계좌 API. 평가손익·총자산은 프론트가 실시간가로 계산하므로 여기선 잔고+포지션(진입정보)만 받는다.
import { authedGetJson, authedMutate } from './authApi';

export interface PaperPositionRaw {
  id: number;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  leverage: number;
  margin: number;
  openedAt?: string;
}
export interface PaperOrderRaw {
  id: number;
  symbol: string;
  direction: 'long' | 'short';
  limitPrice: number;
  size: number;
  leverage: number;
  margin: number;
  status: string;
  createdAt?: string;
}
export interface PaperAccount {
  balance: number;            // 가용 잔고(USDT)
  peakEquity: number;         // 실현 에쿼티(잔고+증거금) 역대 고점 — 페이퍼 실증 DD 표시용
  positions: PaperPositionRaw[];
  orders: PaperOrderRaw[];    // 미체결 지정가
}

const EMPTY: PaperAccount = { balance: 0, peakEquity: 0, positions: [], orders: [] };

function norm(d: unknown): PaperAccount {
  const o = d as { balance?: unknown; peakEquity?: unknown; positions?: unknown; orders?: unknown } | null;
  return {
    balance: Number(o?.balance) || 0,
    peakEquity: Number(o?.peakEquity) || 0,
    positions: Array.isArray(o?.positions) ? (o!.positions as PaperPositionRaw[]) : [],
    orders: Array.isArray(o?.orders) ? (o!.orders as PaperOrderRaw[]) : [],
  };
}

export async function fetchPaperAccount(): Promise<PaperAccount> {
  try { return norm(await authedGetJson('/api/paper/account')); } catch { return EMPTY; }
}

export async function placePaperOrder(order: {
  type: 'market' | 'limit'; symbol: string; direction: 'long' | 'short'; marginUsdt: number; leverage: number; price: number;
}): Promise<PaperAccount> {
  return norm(await authedMutate('/api/paper/order', 'POST', order));
}

export async function cancelPaperOrder(orderId: number): Promise<PaperAccount> {
  return norm(await authedMutate('/api/paper/cancel', 'POST', { orderId }));
}

export async function closePaperPosition(positionId: number, price: number): Promise<PaperAccount> {
  return norm(await authedMutate('/api/paper/close', 'POST', { positionId, price }));
}

export async function resetPaper(): Promise<PaperAccount> {
  return norm(await authedMutate('/api/paper/reset', 'POST', {}));
}
