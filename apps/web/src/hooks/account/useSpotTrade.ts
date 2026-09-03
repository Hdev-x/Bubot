import { usePolledData } from '../ui/usePolledData';
import { fetchSpotTrade, type SpotTradeOverview } from '../../api/server/spotTradeApi';

const EMPTY: SpotTradeOverview = { hasKey: false, holdings: [], orders: [], usdtAvailable: 0 };

/**
 * Trade 페이지(현물) — MAIN 키 보유자산·미체결을 폴링(2.5s)으로 갱신 (보기 전용).
 * enabled=false면 폴링하지 않는다(선물 뷰일 때 등 불필요 호출 차단).
 * refetch()로 즉시 재조회(당겨서 새로고침 연결용).
 */
export function useSpotTrade(enabled: boolean) {
  return usePolledData<SpotTradeOverview>(fetchSpotTrade, EMPTY, enabled, 1000);
}
