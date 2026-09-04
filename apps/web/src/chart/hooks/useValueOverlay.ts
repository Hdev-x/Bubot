import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Candle } from '../../shared/types/market';
import type { ChartTheme } from '../settings/ChartSettingsSheet';
import type { PriceTagOverlay, PriceTagState } from '../overlays/PriceTagOverlay';

// MarketChart 전용 — 현재가 태그·카운트다운 "값" 갱신(250ms). MarketChart.tsx에서 옮김 (wp-07 d04).
// 위치 계산은 PriceTagOverlay(차트 페인트와 동기)가 하므로 여기선 표시할
// "값"(가격·색·카운트다운 텍스트)만 주기적으로 만들어 넣고 리페인트를 유도한다.
export function useValueOverlay({ active, currentTfSeconds, chartTheme, chartType, candles, candlesRef, tickDecimalsRef, priceTagRef, priceTagStateRef, countdownRef }: {
  active: boolean;
  currentTfSeconds: number | undefined;
  chartTheme: ChartTheme | undefined;
  chartType: 'candle' | 'line' | undefined;
  candles: Candle[];
  candlesRef: RefObject<Candle[]>;
  tickDecimalsRef: RefObject<number>;
  priceTagRef: RefObject<PriceTagOverlay | null>;
  priceTagStateRef: RefObject<PriceTagState | null>;
  countdownRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const setInvalid = () => {
      priceTagStateRef.current = null;
      priceTagRef.current?.refresh();
      if (countdownRef.current) countdownRef.current.style.display = 'none';
    };
    if (!active || !currentTfSeconds || !candles.length) { setInvalid(); return; } // 화면 밖이면 타이머 정지

    const countdownText = () => {
      const currentSec = Math.floor(Date.now() / 1000);
      let nextBoundary = 0;
      if (currentTfSeconds === 2592000) { // 1M — 달력 길이가 가변이라 다음달 1일로
        const d = new Date();
        nextBoundary = Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).getTime() / 1000);
      } else {
        // 거래소마다 주봉·3일봉 등 anchor가 달라(예: Binance 3d=06-25 vs Bitget 3d=06-24, 빗썸=KST 자정)
        // epoch 격자로 계산하면 어긋난다 → 실제 마지막 캔들 시각 + TF로 마감을 잡아 각 거래소 경계를 그대로 따른다.
        const lastTime = Number(candlesRef.current[candlesRef.current.length - 1]?.time) || 0;
        nextBoundary = lastTime + currentTfSeconds;
        while (nextBoundary <= currentSec) nextBoundary += currentTfSeconds; // 캔들 롤오버 직전/직후 보호
      }
      const diff = nextBoundary - currentSec;
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (d > 0) return `${d}d ${h}h`;
      if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const tick = () => {
      const cs = candlesRef.current;
      if (!cs.length) { setInvalid(); return; }
      const last = cs[cs.length - 1];

      let bgColor = chartTheme?.upColor || '#3182f6';
      if (chartType === 'candle') {
        const isUp = last.close >= last.open;
        bgColor = isUp ? (chartTheme?.upColor || '#0ecb81') : (chartTheme?.downColor || '#f6465d');
      }

      let textColor = '#ffffff';
      if (bgColor.startsWith('#')) {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) || 0;
        const g = parseInt(hex.substring(2, 4), 16) || 0;
        const b = parseInt(hex.substring(4, 6), 16) || 0;
        const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        textColor = yiq >= 128 ? '#000000' : '#ffffff';
      }

      const decimals = tickDecimalsRef.current || 2;
      priceTagStateRef.current = {
        lastPrice: last.close,
        bgColor,
        textColor,
        priceStr: last.close.toFixed(decimals),
        countdownText: countdownText(),
      };
      priceTagRef.current?.refresh();
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [active, currentTfSeconds, chartTheme, chartType, candles.length]);
}
