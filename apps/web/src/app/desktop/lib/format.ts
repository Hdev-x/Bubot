import type { MainPosition } from '../../../api/server/mainTradeApi';

// 자산 표기 — 1 미만 4자리, 그 외 1자리 (모바일 fmtAsset 동일)
export function fmtAsset(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 1,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 1,
  });
}
// base 심볼 → 로고 클래스(색) 대략 매핑
export function logoClass(base: string): string {
  if (base === 'BTC') return 'btc';
  if (base === 'ETH') return 'eth';
  if (base === 'SOL') return 'sol';
  return 'btc';
}
// 포지션 ROE(증거금 기준 근사) = 가격변화율 × 레버리지 × 방향
export function calcRoe(p: MainPosition): number {
  if (p.entryPrice <= 0) return 0;
  return ((p.markPrice - p.entryPrice) / p.entryPrice) * 100 * p.leverage * (p.direction === 'long' ? 1 : -1);
}
