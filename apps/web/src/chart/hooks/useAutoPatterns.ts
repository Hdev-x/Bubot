import { useEffect } from 'react';
import type { ISeriesApi, SeriesMarker, Time } from 'lightweight-charts';
import { createSeriesMarkers } from 'lightweight-charts';
import { getPivots } from '../analysis/pivots';
import { buildSwingMarkers } from '../../shared/utils/swingMarkers';
import { detectElliottWave, detectAbcWave, predictAbcWave } from '../analysis/elliottWavePattern';
import { predictHarmonicPatterns } from '../analysis/harmonicPattern';
import type { Candle } from '../../shared/types/market';
import type { PivotSetting } from '../indicators/IndicatorSheet';
import type { ChartTheme } from '../settings/ChartSettingsSheet';
import type { AutoShape } from '../overlays/AutoPatternOverlay';
import type { ElliottWaveResult, AbcWaveResult, AbcEmergingResult } from '../analysis/elliottWavePattern';
import type { EmergingHarmonicResult } from '../analysis/harmonicPattern';
import type { AutoPatternOverlay } from '../overlays/AutoPatternOverlay';
import type { TrackerState } from '../../shared/types/bot';

interface UseAutoPatternsProps {
  candles: Candle[];
  pivotSetting?: PivotSetting;
  chartType?: 'candle' | 'line';
  isLogScale?: boolean;
  tickDecimals?: number;
  chartTheme?: ChartTheme;
  seriesRef: React.MutableRefObject<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>;
  waveSeriesRef: React.MutableRefObject<ISeriesApi<'Line'> | null>;
  autoPatternOverlayRef: React.MutableRefObject<AutoPatternOverlay | null>;
  markersPrimitiveRef: React.MutableRefObject<any>;
  toChartTime: (time: string | number) => Time;
  drawingStorageKey?: string;
  variant?: string;
  locked?: boolean;
  focusTracker?: TrackerState | null;
  highlightTracker?: TrackerState | null; // 클릭 강조: 매칭 패턴 원색, 나머지 흐리게 (M-H5)
  soloDimAll?: boolean; // solo 모드: 매칭 없어도(다른 TF 등) 나머지 전부 흐림 (웹 solo 포커스)
}

function getHarmonicPatternColor(patternName: string, alpha: number): string {
  const name = patternName.replace(/^(Bullish|Bearish)\s+/, '').replace(/\s+\(Emerging\)$/, '');
  const colors: Record<string, string> = {
    'Gartley': '100, 200, 200',     // Darker Cyan (was 178, 255, 255)
    'Deep Gartley': '120, 210, 210',// Darker Cyan
    'Bat': '255, 0, 255',           // Magenta
    'Alt Bat': '255, 0, 255',
    'Shark': '49, 130, 246',        // Blue
    'Cypher': '255, 255, 0',        // Yellow
    'Butterfly': '0, 160, 180',     // More Blueish Teal
    'Crab': '248, 81, 73',          // Red
    'Deep Crab': '200, 40, 35',     // Darker Red
    '5-0': '255, 105, 180',         // Pink
  };
  const rgb = colors[name] || '200, 200, 200';
  
  // 특정 패턴 불투명도 조절 제거 (모든 패턴 동일하게 적용)
  const currentAlpha = alpha;
  
  return `rgba(${rgb}, ${currentAlpha})`;
}

type HarmonicKeyPoints = {
  X?: { time: unknown };
  A?: { time: unknown };
  B?: { time: unknown };
  C?: { time: unknown };
};

function normalizeHarmonicPatternName(patternName?: string): string {
  return (patternName ?? '')
    .replace(/\s*\(Emerging\)\s*$/, '')
    .replace(/^(Bullish|Bearish)\s+/, '')
    .trim();
}

function harmonicPatternKey(patternName: string | undefined, isBullish: boolean, points: HarmonicKeyPoints): string | null {
  const { X, A, B, C } = points;
  const family = normalizeHarmonicPatternName(patternName);
  if (!X || !A || !B || !C || !family) return null;
  return [
    String(X.time),
    String(A.time),
    String(B.time),
    String(C.time),
    family,
    isBullish ? 'bull' : 'bear',
  ].join('|');
}

function focusHarmonicPatternKey(tracker: TrackerState | null | undefined, toChartTime: (time: string | number) => Time): string | null {
  const xabc = tracker?.xabc;
  if (!tracker || !xabc?.X || !xabc.A || !xabc.B || !xabc.C) return null;
  return harmonicPatternKey(tracker.patternName, tracker.type === 'bull', {
    X: { time: toChartTime(xabc.X.time) },
    A: { time: toChartTime(xabc.A.time) },
    B: { time: toChartTime(xabc.B.time) },
    C: { time: toChartTime(xabc.C.time) },
  });
}




// ── 렌더 표준 공유 헬퍼 (완성·신호 공용 — 한 군데서 그려 둘이 항상 일치) ──

// 이름 + AB=CD(+종료사유) 라벨 스택: B 수직선(B.time) × (X 또는 D 중 B에 더 가까운 가격), 16px 간격.
function buildHarmonicLabelStack(opts: {
  pB: { time: Time; price: number };
  pX: { time: Time; price: number };
  przPrice: number;
  name: string;
  abcdRatio?: number;
  reasonLabels?: { text: string; color: string }[];
  isBullish: boolean;
}): AutoShape[] {
  const { pB, pX, przPrice, name, abcdRatio, reasonLabels = [], isBullish } = opts;
  const distBX = Math.abs(pB.price - pX.price);
  const distBD = Math.abs(pB.price - przPrice);
  const namePrice = distBX < distBD ? pX.price : przPrice;

  const lines: { text: string; color: string; size: number }[] = [
    { text: name, color: getHarmonicPatternColor(name, 1), size: 12 },
  ];
  const noAbcd = /Cypher|Shark|5-0/.test(name);
  const abRatio = abcdRatio ?? 0;
  const abcdTier = abRatio >= 1.618 ? '1.618' : abRatio >= 1.272 ? '1.272' : abRatio >= 1.0 ? '1:1' : null;
  if (!noAbcd && abcdTier) {
    const idealAbcd: Record<string, string> = {
      'Gartley': '1:1', 'Deep Gartley': '1:1', 'Bat': '1.272', 'Alt Bat': '1.618',
      'Butterfly': '1.618', 'Crab': '1.618', 'Deep Crab': '1.272',
    };
    const baseName = name.replace(/^(Bullish|Bearish)\s+/, '');
    const isIdeal = idealAbcd[baseName] === abcdTier;
    lines.push({ text: isIdeal ? `AB=CD ${abcdTier} ✓` : `AB=CD ${abcdTier}`, color: isIdeal ? '#FFD700' : getHarmonicPatternColor(name, 1), size: 11 });
  }
  for (const r of reasonLabels) lines.push({ text: r.text, color: r.color, size: 11 });

  return lines.map((ln, i) => ({
    type: 'label' as const,
    point: { time: pB.time, price: namePrice },
    text: ln.text,
    color: ln.color,
    textAlign: 'center' as const,
    fontSize: ln.size,
    fontWeight: '600',
    pixelOffsetY: isBullish ? i * 16 : -i * 16,
  }));
}

// TP1/TP2/SL 선 + 가격% 라벨 (D±5 창). %는 이론적 D라인(przPrice) 기준. 토글 게이팅.
function buildHarmonicTpSlLines(opts: {
  startTime: Time;
  endTime: Time;
  przPrice: number;
  tp1?: number;
  tp2?: number;
  slPrice: number;
  slCol: string;
  pivotSetting?: PivotSetting;
}): AutoShape[] {
  const { startTime, endTime, przPrice, tp1, tp2, slPrice, slCol, pivotSetting } = opts;
  const showAnyTpSl = pivotSetting?.showTpLine || pivotSetting?.showTpLabel || pivotSetting?.showSlLine || pivotSetting?.showSlLabel;
  if (!showAnyTpSl) return [];
  const fmtPct = (v: number) => {
    const pct = (v - przPrice) / przPrice * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };
  const tpCol = 'rgba(0, 200, 120, 0.8)';
  const tpCol2 = 'rgba(0, 200, 120, 0.6)';
  const lines: { price: number | undefined; color: string; label: string; isTp: boolean }[] = [
    { price: tp1, color: tpCol, label: `TP1 ${tp1 != null ? fmtPct(tp1) : ''}`, isTp: true },
    { price: tp2, color: tpCol2, label: `TP2 ${tp2 != null ? fmtPct(tp2) : ''}`, isTp: true },
    { price: slPrice, color: slCol, label: `SL ${fmtPct(slPrice)}`, isTp: false },
  ];
  const out: AutoShape[] = [];
  for (const ln of lines) {
    if (ln.price == null) continue;
    const showLine = ln.isTp ? pivotSetting?.showTpLine : pivotSetting?.showSlLine;
    const showLabel = ln.isTp ? pivotSetting?.showTpLabel : pivotSetting?.showSlLabel;
    if (showLine) {
      out.push({ type: 'segment', from: { time: startTime, price: ln.price }, to: { time: endTime, price: ln.price }, color: ln.color, lineWidth: 1, lineStyle: 'solid' });
    }
    if (showLabel) {
      out.push({ type: 'label', point: { time: endTime, price: ln.price }, text: ` ${ln.label}`, color: ln.color, textAlign: 'left', fontSize: 10 });
    }
  }
  return out;
}


// 완성(종료) 예측 패턴을 "자기위치 고정"으로 그린다 (현재가로 안 늘임 = 폭주 방지).
// X·A·B·C는 차트 time(getPivots 변환됨), D는 PRZ 터치점(raw time → 변환).
function buildCompletedEmergingShapes(
  p: EmergingHarmonicResult,
  candles: Candle[],
  toChartTime: (time: string | number) => Time,
  pivotSetting?: PivotSetting,
  suppressFill = false,
  windowSec?: number, // 주면 D±windowSec 절대시간 창(TF 무관 동일 가로폭). 없으면 ±5캔들(현재 TF).
): AutoShape[] {
  const { X, A, B, C } = p.points;
  if (!candles.length) return [];
  const isBullish = p.isBullish;
  const name = p.name.replace(/\s*\(Emerging\)/, '');
  const slBroken = p.slBroken === true;
  // SL 선/% 라벨 색 — 사유 라벨(SL 이탈/Hunted/시간만료)도 이 색으로 통일.
  const slCol = 'rgba(248, 81, 73, 0.8)';
  // SL이탈 완성도 원색으로 — 사용자 요청(2026-06-16). 종료 구분은 라벨(SL 이탈/Hunted)·SL선 빨강으로 충분.
  const colorFn = getHarmonicPatternColor;

  // przTouchedTime은 string|number(원본 캔들 time). finiteNumber로 거르면 문자열 time이 떨어져
  // 마지막 캔들(현재가)로 fallback → D가 우측 끝으로 폭주. toChartTime을 직접 써서 둘 다 처리.
  const dRaw = p.przTouchedTime != null ? p.przTouchedTime : candles[candles.length - 1].time;
  const dPrice = (p.przTouchedPrice !== undefined ? p.przTouchedPrice : p.przPrice);
  const pX = { time: X.time as Time, price: X.price };
  const pA = { time: A.time as Time, price: A.price };
  const pB = { time: B.time as Time, price: B.price };
  const pC = { time: C.time as Time, price: C.price };
  const pD = { time: toChartTime(dRaw), price: dPrice };

  const lineColor = pivotSetting?.showHarmonicLines === false ? 'transparent' : colorFn(name, 0.35);
  const fillColor = (pivotSetting?.showHarmonicFill === false || suppressFill) ? 'transparent' : colorFn(name, 0.20);
  const shapes: AutoShape[] = [];
  shapes.push({ type: 'polygon', points: [pX, pA, pB], lineColor, fillColor, lineWidth: 0.5, lineStyle: 'solid' });
  shapes.push({ type: 'polygon', points: [pB, pC, pD], lineColor, fillColor, lineWidth: 0.5, lineStyle: 'solid' });

  // 이름+AB=CD(+종료사유) 라벨 스택 — 공유 헬퍼(신호와 동일). 종료사유는 완성만.
  // 종료사유: TP는 표기 안 함(클린). SL 이탈/시간만료/헌팅 모두 채도 안 뺀 빨강.
  const reasonColor = 'rgba(248, 81, 73, 0.8)';
  const reasonLabels: { text: string; color: string }[] = [];
  if (p.lifecycle === 'cancelled') reasonLabels.push({ text: '미체결', color: 'rgba(150, 155, 165, 0.85)' }); // 0.5 미체결(TP1 선도달)
  else if (slBroken) reasonLabels.push({ text: 'SL 이탈', color: reasonColor });
  else if (p.slHunted) reasonLabels.push({ text: 'SL Hunted', color: reasonColor });
  else if (p.endReason === 'timeout') reasonLabels.push({ text: '시간만료', color: reasonColor });
  shapes.push(...buildHarmonicLabelStack({ pB, pX, przPrice: p.przPrice, name, abcdRatio: p.abcdRatio, reasonLabels, isBullish }));

  // D±5 자기위치 고정창 (PRZ/SL 박스 + TP/SL 선 공용)
  const dRawTime = toChartTime(dRaw); // string|number 모두 chart time(숫자)으로 정규화 후 비교
  let dIdx = candles.findIndex(c => toChartTime(c.time) >= dRawTime);
  if (dIdx < 0) dIdx = candles.length - 1;
  let startTime: Time, endTime: Time;
  if (windowSec && windowSec > 0) {
    // 절대 시간 창(패턴 TF 기준) → 어느 TF에서도 동일 가로폭. 실제 캔들로 스냅(안 그러면 timeToCoordinate=null).
    const dNum = Number(dRaw);
    const nearest = (target: number): Time => {
      let best = Number(candles[0].time), bestD = Infinity;
      for (const c of candles) { const d = Math.abs(Number(c.time) - target); if (d < bestD) { bestD = d; best = Number(c.time); } }
      return toChartTime(best);
    };
    startTime = nearest(dNum - windowSec);
    endTime = nearest(dNum + windowSec);
  } else {
    startTime = toChartTime(candles[Math.max(0, dIdx - 5)].time);
    endTime = toChartTime(candles[Math.min(dIdx + 5, candles.length - 1)].time);
  }

  // PRZ/SL 박스
  if (pivotSetting?.showSlLine) {
    shapes.push({
      type: 'rect',
      from: { time: startTime, price: p.przPrice },
      to: { time: endTime, price: p.slPrice },
      lineColor: 'transparent',
      fillColor: getHarmonicPatternColor(name, 0.15),
      lineWidth: 0,
    });
    shapes.push({
      type: 'segment',
      from: { time: startTime, price: p.przPrice },
      to: { time: endTime, price: p.przPrice },
      color: getHarmonicPatternColor(name, 0.7),
      lineWidth: 1,
      lineStyle: 'solid',
    });
  }

  // TP1/TP2/SL 선 + 가격% 라벨 — 공유 헬퍼(신호와 동일).
  shapes.push(...buildHarmonicTpSlLines({ startTime, endTime, przPrice: p.przPrice, tp1: p.tp1, tp2: p.tp2, slPrice: p.slPrice, slCol, pivotSetting }));

  return shapes;
}

// solo 포커스: 클릭한 트래커의 "저장된 XABC 좌표"를 그대로 그린다(현재 TF의 탐지 결과와 무관).
// 절대 시각/가격이라 어느 TF에서든 같은 패턴이 자기 위치에 고정 렌더 → 하위TF에서도 패턴 보임(스샷용).
function buildTrackerFocusShapes(
  tracker: TrackerState,
  candles: Candle[],
  toChartTime: (time: string | number) => Time,
  pivotSetting?: PivotSetting,
): AutoShape[] {
  const x: any = tracker.xabc;
  // D(PRZ)는 xabc.D가 없을 수 있음(신호/탐색 트래커) → przPrice·시각 필드로 대체. X~C만 필수.
  if (!x?.X || !x.A || !x.B || !x.C || !candles.length) return [];
  const t = tracker as any;
  const dTime = x.D?.time ?? t.przHitTime ?? t.entryTime ?? t.exitTime ?? x.C.time;
  const dPrice = x.D?.price ?? tracker.przPrice ?? x.C.price;
  // ★핵심: 각 점 시각을 현재 TF의 가장 가까운 캔들로 스냅. lightweight-charts는 캔들 격자에 없는
  // 시각이면 timeToCoordinate가 null을 반환해 도형을 통째로 스킵함(6H/12H서 패턴 안 그려지던 원인).
  // 실제 캔들 시각으로 스냅하면 어느 TF에서든 폴리곤이 그려진다(패턴 TF에선 자기 캔들=변화 없음).
  const snapRaw = (rawT: number): number => {
    let best = Number(candles[0].time), bestD = Infinity;
    for (const c of candles) { const d = Math.abs(Number(c.time) - rawT); if (d < bestD) { bestD = d; best = Number(c.time); } }
    return best;
  };
  // buildCompletedEmergingShapes가 먹는 형태로 변환. X/A/B/C는 chart-time으로, D는 raw(함수가 변환).
  const pseudo: any = {
    points: {
      X: { time: toChartTime(snapRaw(x.X.time)), price: x.X.price },
      A: { time: toChartTime(snapRaw(x.A.time)), price: x.A.price },
      B: { time: toChartTime(snapRaw(x.B.time)), price: x.B.price },
      C: { time: toChartTime(snapRaw(x.C.time)), price: x.C.price },
    },
    isBullish: tracker.type === 'bull',
    name: tracker.patternName ?? '하모닉',
    przTouchedTime: snapRaw(dTime),
    przTouchedPrice: dPrice,
    przPrice: tracker.przPrice ?? dPrice,
    slPrice: tracker.slPrice ?? dPrice,
    tp1: tracker.tp1Price,
    tp2: tracker.tp2Price,
    lifecycle: (tracker.exitReason === 'cancelled' || tracker.exitReason === 'invalidated') ? 'cancelled' : 'completed',
    endReason: tracker.exitReason,
    slBroken: t.slBroken === true,
    slHunted: t.slHunted === true,
    abcdRatio: t.abcdRatio,
  };
  // 박스/TP·SL 선 가로폭 = 패턴 TF의 5캔들만큼(절대 시간). 어느 하위 TF에서도 같은 실제 폭.
  const kind = String((tracker as any).monitorKind ?? '');
  const patTfSec = kind.endsWith('_30m') ? 1800 : kind.endsWith('_4h') ? 14400
    : kind.endsWith('_1d') ? 86400 : kind.endsWith('_1w') ? 604800 : kind.endsWith('_1M') ? 2592000 : 0;
  const windowSec = patTfSec > 0 ? patTfSec * 5 : undefined;
  return buildCompletedEmergingShapes(pseudo, candles, toChartTime, pivotSetting, false, windowSec);
}

export function useAutoPatterns({
  candles,
  pivotSetting: providedPivotSetting,
  chartType,
  isLogScale = false,
  tickDecimals = 2,
  seriesRef,
  waveSeriesRef,
  autoPatternOverlayRef,
  markersPrimitiveRef,
  toChartTime,
  drawingStorageKey,
  variant,
  locked,
  focusTracker,
  highlightTracker,
  soloDimAll,
}: UseAutoPatternsProps) {
  // 스윙 하이/로우 (Pivot) 마커 업데이트
  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    const pivotSetting = providedPivotSetting ?? { show: false, length: 10, basis: 'wick' as const };
    const hasFocusTracker = !!focusTracker?.xabc;
    
    let markers: SeriesMarker<Time>[] = [];

    if ((pivotSetting.show || pivotSetting.showHarmonic || pivotSetting.showElliottWave || pivotSetting.showAbcWave || hasFocusTracker) && candles.length > (pivotSetting.length || 10) * 2) {
      const { length = 10, basis = 'wick' } = pivotSetting;

      const filteredPivots = getPivots(candles, length, basis, toChartTime);

      // Generate Markers & Wave Line
      // 파동 선(showWave)은 Swing High/Low 마스터(show) 하위 → show가 꺼지면 같이 꺼짐
      const swing = buildSwingMarkers(filteredPivots, {
        show: pivotSetting.show,
        showWave: pivotSetting.show ? (pivotSetting.showWave ?? true) : false,
      });
      markers = swing.markers;

      if (waveSeriesRef.current) {
        waveSeriesRef.current.setData(swing.waveData);
      }

      const autoShapes: AutoShape[] = [];

      const getWaveColor = (scanLen: number, isBullish: boolean, waveType: 'elliott' | 'abc') => {
          if (waveType === 'elliott') {
            if (isBullish) {
              if (scanLen <= 10) return 'rgba(6, 182, 212, 0.8)'; // Cyan
              if (scanLen <= 20) return 'rgba(59, 130, 246, 0.8)'; // Blue
              return 'rgba(139, 92, 246, 0.8)'; // Purple
            } else {
              if (scanLen <= 10) return 'rgba(249, 115, 22, 0.8)'; // Orange
              if (scanLen <= 20) return 'rgba(239, 68, 68, 0.8)'; // Red
              return 'rgba(225, 29, 72, 0.8)'; // Rose
            }
          } else {
            if (isBullish) {
              if (scanLen <= 10) return 'rgba(132, 204, 22, 0.8)'; // Lime
              if (scanLen <= 20) return 'rgba(34, 197, 94, 0.8)'; // Green
              return 'rgba(16, 185, 129, 0.8)'; // Emerald
            } else {
              if (scanLen <= 10) return 'rgba(234, 179, 8, 0.8)'; // Yellow
              if (scanLen <= 20) return 'rgba(245, 158, 11, 0.8)'; // Amber
              return 'rgba(234, 88, 12, 0.8)'; // Orange
            }
          }
        };

        if (pivotSetting.showElliottWave) {
          const scanLen = pivotSetting.elliottLength || 21;
          let allWaves: ElliottWaveResult[] = [];
          
          if (candles.length > scanLen * 2) {
            const scanPivots = getPivots(candles, scanLen, pivotSetting.basis || 'wick', toChartTime);
            allWaves = detectElliottWave(scanPivots, isLogScale);
          }

          allWaves.forEach((bestWave) => {
            const { P0, P1, P2, P3, P4, P5 } = bestWave.points;
            const pts = [
              { time: P0.time, price: P0.price },
              { time: P1.time, price: P1.price },
              { time: P2.time, price: P2.price },
              { time: P3.time, price: P3.price },
              { time: P4.time, price: P4.price },
              { time: P5.time, price: P5.price },
            ];

            const color = getWaveColor(scanLen, bestWave.isBullish, 'elliott');

            for (let i = 0; i < 5; i++) {
              autoShapes.push({
                type: 'segment',
                from: pts[i],
                to: pts[i + 1],
                color,
                lineWidth: 2,
                lineStyle: 'solid',
              });
            }

            for (let i = 1; i <= 5; i++) {
              autoShapes.push({
                type: 'label',
                point: pts[i],
                text: `(${i})`,
                color,
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 'bold',
              });
            }
          });
        }

        let uniqueAbcWaves: (AbcWaveResult & { scanLen: number })[] = [];

        if (pivotSetting.showAbcWave) {
          const isMulti = pivotSetting.abcMode === 'multi';
          // 큰 파동(장기)부터 찾아서 색상을 장기 기준으로 덮어씌우기 위해 배열을 뒤집습니다.
          const scanLengths = isMulti ? [5, 8, 13, 21, 34, 55].reverse() : [pivotSetting.abcLength || 21];
          const foundWaves: (AbcWaveResult & { scanLen: number })[] = [];
          
          for (const scanLen of scanLengths) {
            if (candles.length > scanLen * 2) {
              const scanPivots = getPivots(candles, scanLen, pivotSetting.basis || 'wick', toChartTime);
              const abcWaves = detectAbcWave(scanPivots, isLogScale, candles);
              for (const abcWave of abcWaves) {
                foundWaves.push({ ...abcWave, scanLen });
              }
            }
          }

          // 중복 제거: A·B점 시간 + 비율 라벨 + 방향 기준. scanLengths가 큰 순서로 스캔하므로 메이저 scanLen이 살아남음.
          const uniqueWaves: (AbcWaveResult & { scanLen: number })[] = [];
          const seen = new Set<string>();
          for (const w of foundWaves) {
            const key = `${w.points.A.time}_${w.points.B.time}_${w.label}_${w.isBullish}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueWaves.push(w);
            }
          }
          
          uniqueAbcWaves = uniqueWaves;

          // 완성 패턴 그리기 (탐지/dedup은 위에서 유지, 표시만 토글)
          if (pivotSetting.showAbcCompleted !== false)
          uniqueWaves.forEach((bestAbc) => {
            const { A, B, C, D } = bestAbc.points;
            const color = getWaveColor(bestAbc.scanLen, bestAbc.isBullish, 'abc');

            // C->D 선을 그릴 때만 스냅된 D 가격(snappedDPrice)을 사용합니다.
            // D 수평선과 박스는 실제 타겟 비율 가격(przPrice)을 사용합니다.
            const exactDPrice = bestAbc.przPrice ?? D.price;
            const snappedDPrice = bestAbc.isBullish ? candles[D.i].low : candles[D.i].high;
            const pts = [A, B, C, { ...D, price: snappedDPrice }];

            const minPrice = Math.min(A.price, B.price, C.price, snappedDPrice, exactDPrice);
            const maxPrice = Math.max(A.price, B.price, C.price, snappedDPrice, exactDPrice);
            const offset = (maxPrice - minPrice) * 0.05; // 패턴 전체 높이의 5%를 여백으로 사용

            // A-B, B-C, C-D 선 그리기
            if (pivotSetting.showAbcLines !== false) {
              for (let i = 0; i < 3; i++) {
                autoShapes.push({
                  type: 'segment',
                  from: { time: pts[i].time, price: pts[i].price },
                  to: { time: pts[i + 1].time, price: pts[i + 1].price },
                  color,
                  lineWidth: 1.5,
                  lineStyle: 'solid',
                });
              }
            }

            // 라벨 그리기 (A, B, C, D)
            if (pivotSetting.showAbcText) {
              const labels = ['A', 'B', 'C', 'D'];
              for (let i = 0; i < 4; i++) {
                let text = labels[i];
                let align = 'center';
                
                if (i === 3) {
                  text = `D ${bestAbc.label}`;
                  align = 'left';
                }
                
                const labelPrice = pts[i].type === 'high' ? pts[i].price + offset : pts[i].price - offset;

                autoShapes.push({
                  type: 'label',
                  point: { time: pts[i].time, price: labelPrice },
                  text,
                  color,
                  textAlign: align as CanvasTextAlign,
                  fontSize: i === 3 ? 12 : 14,
                  fontWeight: 'bold',
                });
              }
            }
            if (bestAbc.slPrice) {
              const baseColor = getWaveColor(bestAbc.scanLen, bestAbc.isBullish, 'abc');
              const boxColor = baseColor.replace(/[\d.]+\)$/g, '0.15)');
              const slColor = baseColor;

              const startIdx = Math.max(0, D.i - 5);
              const endIdx = Math.min(candles.length - 1, D.i + 5);
              const startTime = toChartTime(candles[startIdx].time);
              const endTime = toChartTime(candles[endIdx].time);

              // D점 가격 ~ SL 가격 사이 배경 박스
              autoShapes.push({
                type: 'rect',
                from: { time: startTime, price: exactDPrice },
                to: { time: endTime, price: bestAbc.slPrice },
                lineColor: 'transparent',
                fillColor: boxColor,
                lineWidth: 0,
              });

              // D 수평선 (과거차트 색상 실선, 불투명도 연하게)
              const dLineColor = baseColor.replace(/[\d.]+\)$/g, '0.4)');
              autoShapes.push({
                type: 'segment',
                from: { time: startTime, price: exactDPrice },
                to: { time: endTime, price: exactDPrice },
                color: dLineColor,
                lineWidth: 1,
                lineStyle: 'solid',
              });

              // SL 수평선 (기존 색상 실선, 얇게)
              autoShapes.push({
                type: 'segment',
                from: { time: startTime, price: bestAbc.slPrice },
                to: { time: endTime, price: bestAbc.slPrice },
                color: slColor,
                lineWidth: 1,
                lineStyle: 'solid',
              });



              // D 텍스트 (왼쪽 비율, 기존 색상)
              autoShapes.push({
                type: 'label',
                point: { time: startTime, price: exactDPrice },
                text: `${bestAbc.label}  `,
                color: baseColor,
                textAlign: 'right',
                fontSize: 11,
                fontWeight: 'bold',
              });
            }
          });
        }

        // ABC 파동 실시간 예측 (Emerging) - ABC 마스터(showAbcWave) 하위로 동작
        if (pivotSetting.showAbcWave && pivotSetting.showAbcPrediction !== false) {
          const scanLengths = [55, 34, 21, 13, 8, 5]; // 내림차순: 중복 시 메이저(큰 스캔)가 살아남도록 (하모닉과 통일)
          const emergingWaves: (AbcEmergingResult & { scanLen: number })[] = [];
            for (const scanLen of scanLengths) {
              if (candles.length > scanLen * 2) {
              const scanPivots = getPivots(candles, scanLen, pivotSetting.basis || 'wick', toChartTime);
              const currentPrice = candles[candles.length - 1].close;
              const predictions = predictAbcWave(scanPivots, currentPrice, isLogScale, candles);
              for (const p of predictions) {
                emergingWaves.push({ ...p, scanLen });
              }
            }
          }

          // 간단한 중복 제거 (A, B점 시간 기준)
          const uniqueEmerging: (AbcEmergingResult & { scanLen: number })[] = [];
          const seenEmerging = new Set<string>();
          for (const w of emergingWaves) {
            // 과거에 이미 완성된 동일한 ABC + 동일한 라벨의 패턴이 있다면 예측에서 제외 (숨김 처리)
            const isAlreadyCompleted = uniqueAbcWaves.some(completed => 
              completed.points.A.time === w.points.A.time &&
              completed.points.B.time === w.points.B.time &&
              completed.label === w.targetLabel
            );
            if (isAlreadyCompleted) continue;

            const key = `${w.points.A.time}_${w.points.B.time}_${w.targetLabel}_${w.isBullish}`;
            if (!seenEmerging.has(key)) {
              seenEmerging.add(key);
              uniqueEmerging.push(w);
            }
          }

          uniqueEmerging.forEach((emg) => {
            const { A, B, C } = emg.points;
            
            // 현재가 및 시간 계산
            const currentIdx = candles.length - 1;
            const currentTime = toChartTime(candles[currentIdx].time);

            // D점 위치 결정
            let dPredTime = currentTime;
            if (emg.przTouchedTime) {
              dPredTime = toChartTime(emg.przTouchedTime); // 캔들 터치 루프로 인해 raw time이 넘어오므로 변환
            }

            const baseColor = getWaveColor(emg.scanLen, emg.isBullish, 'abc');
            const dLineColor = baseColor.replace(/[\d.]+\)$/g, '0.4)');
            const boxBorderColor = baseColor.replace(/[\d.]+\)$/g, '0.2)');
            const boxColor = baseColor.replace(/[\d.]+\)$/g, '0.15)');
            const slColor = emg.isPrzTouched ? 'rgba(255, 0, 0, 0.8)' : 'rgba(239, 68, 68, 0.4)';

            // A-B, B-C 구조선
            for (let i = 0; i < 2; i++) {
              const start = i === 0 ? A : B;
              const end = i === 0 ? B : C;
              autoShapes.push({
                type: 'segment',
                from: { time: start.time, price: start.price },
                to: { time: end.time, price: end.price },
                color: baseColor,
                lineWidth: emg.isPrzTouched ? 1.5 : 0.5,
                lineStyle: 'solid',
              });
            }
            // 미터치 상태에서도 박스와 선이 보이도록 과거 5캔들 확보
            let past5Time: any = currentTime;
            if (candles.length > 5) {
              past5Time = toChartTime(candles[candles.length - 6].time);
            } else if (candles.length > 0) {
              past5Time = toChartTime(candles[0].time);
            }
            
            // 터치했으면 터치 시간부터, 안 했으면 5캔들 전부터
            const boxStartTime = emg.isPrzTouched ? dPredTime : past5Time;

            // D점 (목표가 przPrice, 터치 시간). 박스/선은 D부터 현재까지 (하모닉 터치와 동일, 클램프 없음)
            const dPredPrice = (emg.isPrzTouched && emg.przTouchedPrice !== undefined) ? emg.przTouchedPrice : emg.przPrice;
            const pD = { time: dPredTime, price: dPredPrice };

            // C→D 선 (구조선을 D까지 연결)
            autoShapes.push({
              type: 'segment',
              from: { time: emg.points.C.time, price: emg.points.C.price },
              to: { time: pD.time, price: pD.price },
              color: emg.isPrzTouched ? baseColor : baseColor.replace(/, [\d.]+\)$/, ', 0.5)'),
              lineWidth: emg.isPrzTouched ? 1.5 : 0.5,
              lineStyle: emg.isPrzTouched ? 'solid' : 'dotted',
            });

            // D 타겟 수평선 (boxStartTime부터 현재까지)
            autoShapes.push({
              type: 'segment',
              from: { time: boxStartTime, price: emg.przPrice },
              to: { time: currentTime, price: emg.przPrice },
              color: dLineColor,
              lineWidth: 1,
              lineStyle: emg.isPrzTouched ? 'solid' : 'dashed',
            });

            // PRZ 박스 반대편(SL) 기본 테두리 수평선 (항상 표시)
            autoShapes.push({
              type: 'segment',
              from: { time: boxStartTime, price: emg.slPrice },
              to: { time: currentTime, price: emg.slPrice },
              color: boxBorderColor,
              lineWidth: 1,
              lineStyle: emg.isPrzTouched ? 'solid' : 'dashed',
            });

            // PRZ 박스 (boxStartTime부터 현재까지)
            autoShapes.push({
              type: 'rect',
              from: { time: boxStartTime, price: emg.przPrice },
              to: { time: currentTime, price: emg.slPrice },
              lineColor: 'transparent',
              fillColor: boxColor,
              lineWidth: 0
            });

            // SL 강조 테두리 (항상 표시 - AB=CD에는 별도 토글 없음)
            autoShapes.push({
              type: 'segment',
              from: { time: boxStartTime, price: emg.slPrice },
              to: { time: currentTime, price: emg.slPrice },
              color: slColor,
              lineWidth: 1,
              lineStyle: emg.isPrzTouched ? 'solid' : 'dashed',
            });

            // 패턴명 라벨
            autoShapes.push({
              type: 'label',
              point: { time: currentTime, price: emg.przPrice },
              text: `  AB=CD ${emg.targetLabel}`,
              color: baseColor,
              textAlign: 'left',
              fontSize: 12,
              fontWeight: emg.isPrzTouched ? 'bold' : '600',
            });
          });
        }



        // ===== 하모닉 패턴 그리기 (마스터 하위, 카테고리 토글은 패턴별로 — M-H4) =====
        if (pivotSetting.showHarmonic) {
          // 내림차순(큰 길이부터) — 완성 패턴과 통일
          const scanLengths = [55, 34, 21, 13, 8, 5];
          const currentPrice = candles[candles.length - 1].close;
          const emergingPatterns: EmergingHarmonicResult[] = [];
          for (const scanLen of scanLengths) {
            if (candles.length > scanLen * 2) {
              const scanPivots = getPivots(candles, scanLen, pivotSetting.basis || 'wick', toChartTime);
              // display 모드: 탐색(미터치 최근만)/신호/완성(종료) 생애주기 분류 포함
              const preds = predictHarmonicPatterns(scanPivots, currentPrice, isLogScale, candles, { mode: 'display' });
              emergingPatterns.push(...preds);
            }
          }

          // Cypher는 Shark와 X·A·B·C 공유 시 폐기(Shark 우선)
          const sharkKeys = new Set<string>();
          for (const p of emergingPatterns) {
            if (p.name.includes('Shark')) sharkKeys.add(`${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`);
          }

          const uniqueEmerging: EmergingHarmonicResult[] = [];
          const seenEmerging = new Set();
          for (const pat of emergingPatterns) {
            if (pat.name.includes('Cypher') && sharkKeys.has(`${pat.points.X.time}_${pat.points.A.time}_${pat.points.B.time}_${pat.points.C.time}_${pat.isBullish}`)) continue;
            // C나 X만 살짝 다른 동일 패턴 중복 제거: A·B·이름·방향이 같으면 무관하게 하나만 (배열이 큰 스캔부터라 메이저가 살아남음)
            const key = `${pat.points.A.time}_${pat.points.B.time}_${pat.name}_${pat.isBullish}`;
            if (!seenEmerging.has(key)) {
              seenEmerging.add(key);
              uniqueEmerging.push(pat);
            }
          }

          // 클릭 강조(M-H5): highlightTracker와 매칭되는 패턴은 원색, 나머지는 흐리게(opacity).
          // 매칭 패턴이 하나도 없으면(좌표 미세차 등) 강조 안 함 → 전체 원색(faded 전체 방지).
          const rawFocusKey = highlightTracker ? focusHarmonicPatternKey(highlightTracker, toChartTime) : null;
          const focusKey = (rawFocusKey && uniqueEmerging.some(p => harmonicPatternKey(p.name, p.isBullish, p.points) === rawFocusKey))
            ? rawFocusKey : null;
          const DIM = 0.22;

          // Gartley/Deep Gartley는 진입조건이 동일해 같은 XABC에서 쌍으로 출현 → 폴리곤이 겹침.
          // 겹칠 때 Gartley 배경(fill)만 빼서 떡짐 방지 (외곽선·라벨은 둘 다 유지).
          const deepGartleyKeys = new Set<string>();
          for (const p of uniqueEmerging) {
            if (p.name.includes('Deep Gartley')) {
              deepGartleyKeys.add(`${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`);
            }
          }
          const isGartleyFillSuppressed = (pat: EmergingHarmonicResult) =>
            pat.name.includes('Gartley') && !pat.name.includes('Deep') &&
            deepGartleyKeys.has(`${pat.points.X.time}_${pat.points.A.time}_${pat.points.B.time}_${pat.points.C.time}_${pat.isBullish}`);

          uniqueEmerging.forEach((pattern) => {
            const dimThis = !!focusKey && harmonicPatternKey(pattern.name, pattern.isBullish, pattern.points) !== focusKey;
            // ── 카테고리 토글 (M-H4): 생애주기별 독립 4토글 ──
            // 완성·폐기(cancelled) = 종료 상태 → 자기위치 고정 렌더(H6-2: 폐기도 표시). 폐기는 '완성' 토글 하위.
            if (pattern.lifecycle === 'completed' || pattern.lifecycle === 'cancelled') {
              const isSl = pattern.endReason === 'sl';
              if (isSl && pivotSetting.showHarmonicStoploss === false) return;   // 손절 토글
              if (!isSl && pivotSetting.showHarmonicCompleted === false) return; // 완성(TP·시간만료·폐기) 토글
              const compShapes = buildCompletedEmergingShapes(pattern, candles, toChartTime, pivotSetting, isGartleyFillSuppressed(pattern));
              if (dimThis) compShapes.forEach(s => { s.opacity = DIM; });
              autoShapes.push(...compShapes);
              return;
            }
            // 진행중: 탐색(scanning) / 신호·체결(signal·active)
            if (pattern.lifecycle === 'scanning' && pivotSetting.showHarmonicScanning === false) return; // 탐색 토글
            if ((pattern.lifecycle === 'signal' || pattern.lifecycle === 'active') && pivotSetting.showHarmonicSignal === false) return; // 신호·체결 토글
            const dimStartLen = autoShapes.length;
            const { X, A, B, C } = pattern.points;
            const pX = { time: X.time, price: X.price };
            const pA = { time: A.time, price: A.price };
            const pB = { time: B.time, price: B.price };
            const pC = { time: C.time, price: C.price };
            const isBullish = pattern.isBullish;
            
            const currentTime = toChartTime(candles[candles.length - 1].time);
            let dPredTime = currentTime;
            if (pattern.isPrzTouched && pattern.przTouchedTime) {
              dPredTime = toChartTime(pattern.przTouchedTime); // 하모닉은 raw candle.time 저장 → 변환 필요 (ABC와 다름)
            }
            const dPredPrice = (pattern.isPrzTouched && pattern.przTouchedPrice !== undefined) ? pattern.przTouchedPrice : pattern.przPrice;
            const pD_pred = { time: dPredTime, price: dPredPrice };
            
            // 미터치(탐색)는 점선·배경을 좀 더 강조 — 터치(신호·체결) 기존 스타일은 유지.
            const lineAlpha = pattern.isPrzTouched ? 0.4 : 0.5;
            // 외곽선/배경 토글(showHarmonicLines/Fill) — 완성과 동일하게 탐색·신호에도 적용(R4).
            const lineColor = pivotSetting.showHarmonicLines === false ? 'transparent' : getHarmonicPatternColor(pattern.name, lineAlpha);
            // 미터치=옅은 배경(0.10), 터치=진하게(0.2). 토글 off면 투명.
            const fillColor = (pivotSetting.showHarmonicFill === false || isGartleyFillSuppressed(pattern)) ? 'transparent' : getHarmonicPatternColor(pattern.name, pattern.isPrzTouched ? 0.2 : 0.08);

            const nameColor = getHarmonicPatternColor(pattern.name, pattern.isPrzTouched ? 1.0 : 0.6);
            const borderStyle = pattern.isPrzTouched ? 'solid' : 'dashed';
            const polyLineWidth = pattern.isPrzTouched ? 0.5 : 0.7; // 미터치 점선 약간 굵게

            autoShapes.push({
              type: 'polygon',
              points: [pX, pA, pB],
              lineColor,
              fillColor,
              lineWidth: polyLineWidth,
              lineStyle: borderStyle
            });

            autoShapes.push({
              type: 'polygon',
              points: [pB, pC, pD_pred],
              lineColor,
              fillColor,
              lineWidth: polyLineWidth,
              lineStyle: borderStyle
            });

            // 미래 빈 공간으로는 좌표를 찾지 못해 그려지지 않으므로, 
            // 현재 캔들 기준으로 과거 5캔들 전 위치를 시작점으로 하여 정확히 5캔들 길이의 선을 확보
            let past5Time: any = currentTime;
            if (candles.length > 5) {
              past5Time = toChartTime(candles[candles.length - 6].time);
            } else if (candles.length > 0) {
              past5Time = toChartTime(candles[0].time);
            }

            let przBoxStart = pattern.isPrzTouched ? dPredTime : past5Time;
            
            // 너무 과거부터 그리면 화면을 가리므로, 최대 5캔들 전까지만 표시
            const maxPastIdxHarmonic = Math.max(0, candles.length - 1 - 5);
            const maxPastTimeHarmonic = toChartTime(candles[maxPastIdxHarmonic].time);
            if (!pattern.isPrzTouched && przBoxStart < maxPastTimeHarmonic) {
              przBoxStart = maxPastTimeHarmonic; // 미터치만 5캔들 제한, 터치는 진짜 D부터
            }
            const przBoxEnd = currentTime;
            const przBoxColor = getHarmonicPatternColor(pattern.name, 0.15); // 배경 투명도 (0.15)
            const przBoxDBorder = getHarmonicPatternColor(pattern.name, 0.7); // D쪽 테두리 강조 (0.7)
            const slColor = pattern.isPrzTouched ? 'rgba(255, 0, 0, 0.4)' : 'rgba(239, 68, 68, 0.4)';

            autoShapes.push({
              type: 'rect',
              from: { time: przBoxStart, price: pattern.przMax },
              to: { time: przBoxEnd, price: pattern.przMin },
              lineColor: 'transparent',
              fillColor: przBoxColor,
              lineWidth: 0
            });

            autoShapes.push({
              type: 'segment',
              from: { time: przBoxStart, price: pattern.przMax },
              to: { time: przBoxEnd, price: pattern.przMax },
              color: !isBullish ? slColor : przBoxDBorder, // Bearish일 때 상단(przMax)이 SL 방향
              lineWidth: 1,
              lineStyle: borderStyle
            });

            autoShapes.push({
              type: 'segment',
              from: { time: przBoxStart, price: pattern.przMin },
              to: { time: przBoxEnd, price: pattern.przMin },
              color: isBullish ? slColor : przBoxDBorder, // Bullish일 때 하단(przMin)이 SL 방향
              lineWidth: 1,
              lineStyle: borderStyle
            });

            const cleanName = pattern.name.replace(/\s*\(Emerging\)/, '');
            if (pattern.isPrzTouched) {
              // 신호(터치): 완성과 동일한 이름+AB=CD 스택 (B수직×X또는D 가까운쪽). 종료사유는 없음. (R3)
              autoShapes.push(...buildHarmonicLabelStack({
                pB: { time: B.time as Time, price: B.price },
                pX: { time: X.time as Time, price: X.price },
                przPrice: pattern.przPrice,
                name: cleanName,
                abcdRatio: pattern.abcdRatio,
                isBullish,
              }));
            } else {
              // 탐색(미터치): 이름만 현재 옆에 (기존 유지)
              autoShapes.push({
                type: 'label',
                point: { time: currentTime, price: pattern.przPrice },
                text: `  ${pattern.name}`,
                color: nameColor,
                textAlign: 'left',
                fontSize: 12,
                fontWeight: '600',
              });
            }

            if (pattern.isPrzTouched) {
              // 신호(터치): TP1/TP2/SL 선·% 완성과 동일 (D±5 창, 공유 헬퍼). (R3)
              const dRawT = pattern.przTouchedTime != null ? pattern.przTouchedTime : candles[candles.length - 1].time;
              const dRawTime = toChartTime(dRawT);
              let dIdx = candles.findIndex(c => toChartTime(c.time) >= dRawTime);
              if (dIdx < 0) dIdx = candles.length - 1;
              const tpStart = toChartTime(candles[Math.max(0, dIdx - 5)].time);
              const tpEnd = toChartTime(candles[Math.min(dIdx + 5, candles.length - 1)].time);
              autoShapes.push(...buildHarmonicTpSlLines({
                startTime: tpStart, endTime: tpEnd, przPrice: pattern.przPrice,
                tp1: pattern.tp1, tp2: pattern.tp2, slPrice: pattern.slPrice,
                slCol: 'rgba(248, 81, 73, 0.8)', pivotSetting,
              }));
            } else if (pivotSetting.showSlLine) {
              // 탐색(미터치): 기존 트레일링 SL 선
              const slTimeStart = past5Time; // SL 박스는 항상 현재가 기준 과거 5캔들까지만
              const slTimeEnd = currentTime;
              autoShapes.push({
                type: 'rect',
                from: { time: slTimeStart, price: pattern.przPrice },
                to: { time: slTimeEnd, price: pattern.slPrice },
                lineColor: 'transparent',
                fillColor: 'transparent',
                lineWidth: 0
              });
              autoShapes.push({
                type: 'segment',
                from: { time: slTimeStart, price: pattern.slPrice },
                to: { time: slTimeEnd, price: pattern.slPrice },
                color: slColor,
                lineWidth: 1,
                lineStyle: borderStyle
              });
            }
            // 강조 안 된 패턴 흐리게 (이 패턴이 방금 push한 도형들에만 opacity 태그)
            if (dimThis) for (let k = dimStartLen; k < autoShapes.length; k++) autoShapes[k].opacity = DIM;
          });
	        }
          // (DB SL 아카이브 오버레이 제거됨 — 완성/종료 SL은 predict display 경로가 자기위치로 그림)
          // focusTracker는 차트 이동(타임프레임/로딩범위/스크롤)만 담당한다.
          // 패턴 자체는 위의 완성/예측 하모닉 지표 또는 SL 아카이브 오버레이가 이미 그리므로
          // 여기서 별도 오버레이로 다시 그리지 않는다. (떠도는 포커스 오버레이 버그 방지)
          // solo 포커스: 자동탐지 결과(autoShapes)는 버리고 클릭한 트래커 하나만 그림(저장 좌표, TF 무관).
          // 흐림·focusKey 없이 "그 패턴만". SMC존·BB 등 별도 프리미티브는 그대로 유지된다.
          const soloShapes = (soloDimAll && focusTracker?.xabc && candles.length)
            ? buildTrackerFocusShapes(focusTracker, candles, toChartTime, pivotSetting)
            : null;
	        autoPatternOverlayRef.current?.update(soloShapes ?? autoShapes);
	    } else {
      if (waveSeriesRef.current) {
        waveSeriesRef.current.setData([]);
      }
      autoPatternOverlayRef.current?.update([]);
    }

    // console.log('pivotSetting:', pivotSetting, 'markers:', markers);
    try {
      if (!markersPrimitiveRef.current) {
        markersPrimitiveRef.current = createSeriesMarkers(seriesRef.current as any, markers);
      } else {
        markersPrimitiveRef.current.setMarkers(markers);
      }
    } catch (e: any) {
      console.warn('Failed to set markers:', e?.message || e);
    }
  }, [candles, providedPivotSetting, chartType, drawingStorageKey, variant, locked, focusTracker, highlightTracker, soloDimAll, isLogScale, tickDecimals]);

}
