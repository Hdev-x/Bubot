import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { ChartOverlay } from '../overlays/ChartOverlay';

// ── 신뢰도 랭킹 선(임시 오버레이) — baseline_rank_{symbol}.json이 있을 때만 노출 ──
const RANK_TIERS = ['1M', '1W', '3D', '1d'] as const;
type RankLine = { price?: number; priceLo?: number; priceHi?: number; count?: number; score: number; from?: number };

// MarketChart 전용 — 스캐너 산출 JSON을 읽어 체급별 신뢰선을 SMC 오버레이에 위임. MarketChart.tsx에서 옮김 (wp-07 d04).
export function useRankLines({ overlayRef, rankTiersOn, symbol }: {
  overlayRef: RefObject<ChartOverlay | null>;
  rankTiersOn: Record<string, boolean> | undefined;
  symbol: string | undefined;
}) {
  const [rankData, setRankData] = useState<Record<string, RankLine[]> | null>(null);
  const rankOn = rankTiersOn ?? {};

  useEffect(() => {
    let alive = true;
    setRankData(null);
    if (!symbol) return;
    fetch(`${import.meta.env.BASE_URL}baseline_rank_${symbol}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.tiers) setRankData(j.tiers); })
      .catch(() => {});
    return () => { alive = false; };
  }, [symbol]);

  useEffect(() => {
    // 신뢰선 — SMC 오버레이 캔버스(ChartOverlay)에 위임. 좌표계·시작점 스냅·우측 라벨 전부 SMC와 동일.
    const ov = overlayRef.current;
    if (!ov) return;
    const key = JSON.stringify(rankOn) + (rankData ? '1' : '0');
    if ((ov as any).__rankKey === key) return;
    (ov as any).__rankKey = key;
    const list = !rankData
      ? []
      : (RANK_TIERS as readonly string[]).flatMap(tier =>
          rankOn[tier]
            ? (rankData[tier] ?? []).map(l => ({ tier: tier as any, price: l.price, priceLo: (l as any).priceLo, priceHi: (l as any).priceHi, count: (l as any).count, score: l.score, from: Number(l.from ?? 0) }))
            : []);
    ov.updateRankLines(list);
  });
}
