import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ISeriesApi, Time } from 'lightweight-charts';
import type { Candle } from '../../shared/types/market';
import type { DrawingManager, IDrawing } from '../drawing';

// MarketChart 전용 — 드로잉 자석(약자석) 스냅 + 키보드(Delete/Escape). MarketChart.tsx에서 옮김 (wp-07 d04).
// ref들은 MarketChart가 소유하고(차트 초기화 effect가 같이 씀) 여기선 읽기·갱신만 한다.
export function useDrawingMagnet({ magnet, seriesRef, candlesRef, drawingManagerRef, previewDrawingRef, pendingAnchorsRef, selectedDrawingIdRef, setSelectedDrawingId }: {
  magnet: boolean;
  seriesRef: RefObject<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>;
  candlesRef: RefObject<Candle[]>;
  drawingManagerRef: RefObject<DrawingManager | null>;
  previewDrawingRef: RefObject<IDrawing | null>;
  pendingAnchorsRef: RefObject<Array<{ time: Time; price: number }>>;
  selectedDrawingIdRef: RefObject<string | null>;
  setSelectedDrawingId: Dispatch<SetStateAction<string | null>>;
}) {
  // ── 드로잉 자석(약자석) — 해당 봉의 O/H/L/C 중 픽셀 거리 8px 이내 최근접 값으로 스냅 ──
  const magnetRef = useRef(magnet);
  useEffect(() => { magnetRef.current = magnet; }, [magnet]);
  const MAGNET_PX = 8;
  const snapPrice = useCallback((chartTime: Time, price: number): number => {
    if (!magnetRef.current || !seriesRef.current) return price;
    const cs = candlesRef.current;
    if (!cs.length || typeof chartTime !== 'number') return price;
    // 차트 Time(로컬 오프셋 시프트) → 캔들 원시 unix
    const raw = (chartTime as number) + new Date().getTimezoneOffset() * 60;
    const candle = cs.find(c => Number(c.time) === raw);
    if (!candle) return price;
    const y = seriesRef.current.priceToCoordinate(price);
    if (y == null) return price;
    let best = price;
    let bestDist = MAGNET_PX;
    for (const v of [candle.open, candle.high, candle.low, candle.close]) {
      const vy = seriesRef.current.priceToCoordinate(v);
      if (vy == null) continue;
      const d = Math.abs(vy - y);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    return best;
  }, []);
  const snapPriceRef = useRef(snapPrice);
  useEffect(() => { snapPriceRef.current = snapPrice; }, [snapPrice]);

  // 키보드: Delete = 선택 드로잉 삭제, Escape = 배치 취소
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        pendingAnchorsRef.current = [];
        if (previewDrawingRef.current) {
          previewDrawingRef.current.detach();
          previewDrawingRef.current = null;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingIdRef.current) {
        const manager = drawingManagerRef.current;
        if (manager) {
          manager.removeDrawing(selectedDrawingIdRef.current);
          selectedDrawingIdRef.current = null;
          setSelectedDrawingId(null);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { magnetRef, snapPriceRef };
}
