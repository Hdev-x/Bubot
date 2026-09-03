import { useCallback, useEffect, useState } from 'react';
import { fetchPaperAccount, placePaperOrder, cancelPaperOrder, closePaperPosition, resetPaper, type PaperAccount } from '../api/paperApi';

const EMPTY: PaperAccount = { balance: 0, peakEquity: 0, positions: [], orders: [] };

/**
 * 모의투자 가상계좌. 진입/청산/취소는 응답으로 즉시 갱신 + 지정가 서버 체결을 반영하려고
 * 미체결 주문이 있을 때만 3초 폴링(없으면 폴링 안 함).
 */
export function usePaperTrade(enabled: boolean) {
  const [account, setAccount] = useState<PaperAccount>(EMPTY);
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    const a = await fetchPaperAccount();
    setAccount(a);
    setReady(true);
  }, []);

  useEffect(() => { if (enabled) refetch(); }, [enabled, refetch]);

  // 미체결 지정가가 있으면 서버 체결을 반영하려고 3초 폴링
  const hasPending = account.orders.length > 0;
  useEffect(() => {
    if (!enabled || !hasPending) return;
    const id = setInterval(refetch, 3000);
    return () => clearInterval(id);
  }, [enabled, hasPending, refetch]);

  const place = useCallback(async (o: { type: 'market' | 'limit'; symbol: string; direction: 'long' | 'short'; marginUsdt: number; leverage: number; price: number }) => {
    const a = await placePaperOrder(o);
    setAccount(a);
    return a;
  }, []);
  const cancel = useCallback(async (orderId: number) => { setAccount(await cancelPaperOrder(orderId)); }, []);
  const close = useCallback(async (positionId: number, price: number) => { setAccount(await closePaperPosition(positionId, price)); }, []);
  const reset = useCallback(async () => { setAccount(await resetPaper()); }, []);

  return { account, ready, refetch, place, cancel, close, reset };
}
