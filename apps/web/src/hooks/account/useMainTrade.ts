import { usePolledData } from '../ui/usePolledData';
import { fetchMainTrade, type MainTradeOverview } from '../../api/server/mainTradeApi';

const EMPTY: MainTradeOverview = { hasKey: false, positions: [], orders: [], planOrders: [], available: 0, equity: 0 };

/**
 * Trade 페이지 — MAIN 키 포지션·미체결·잔고를 폴링(2.5s)으로 갱신 (보기 전용).
 * enabled=false면 폴링하지 않는다(Bot 탭일 때 등 불필요 호출 차단).
 * refetch()로 즉시 재조회(당겨서 새로고침 연결용).
 */
export function useMainTrade(enabled: boolean) {
  return usePolledData<MainTradeOverview>(fetchMainTrade, EMPTY, enabled, 1000);
}
