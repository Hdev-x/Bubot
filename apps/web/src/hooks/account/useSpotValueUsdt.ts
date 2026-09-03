import { useSpotTrade } from './useSpotTrade';
import { useRealtimePrices } from '../market/useRealtimePrices';

// 현물 보유자산 총평가(USDT) — 마켓·자산 총자산 합산용.
// 거래탭 현물 탭(SpotAccountSummary)과 동일 계산: 보유량 × 현물 실시간가, 현금(USDT/USDC)=1.
// enabled=false면 폴링/구독하지 않는다.
// priced = 보유내역·모든 코인 시세가 도착했는지(총자산 점프 방지용 게이트). 코인 없으면(현금만) 도착 즉시 true.
export function useSpotValueUsdt(enabled: boolean): { value: number; priced: boolean } {
  const { data: spot } = useSpotTrade(enabled);
  const priceSymbols = spot.holdings
    .filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC')
    .map((h) => `${h.coin}USDT`);
  const prices = useRealtimePrices(priceSymbols, false);
  const priceOf = (coin: string) =>
    coin === 'USDT' || coin === 'USDC' ? 1 : (prices[`${coin}USDT`] ?? 0);
  const value = spot.holdings.reduce((s, h) => s + (h.available + h.frozen) * priceOf(h.coin), 0);
  // 보유내역 도착(EMPTY 아님) + 코인 시세 모두 도착 시에만 준비 완료(부분합 노출 방지).
  const priced = spot.holdings.length > 0 && priceSymbols.every((s) => (prices[s] ?? 0) > 0);
  return { value, priced };
}
