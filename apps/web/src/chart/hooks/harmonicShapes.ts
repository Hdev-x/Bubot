import type { Time } from 'lightweight-charts';
import type { Candle } from '../../shared/types/market';
import type { PivotSetting } from '../indicators/IndicatorSheet';
import type { AutoShape } from '../overlays/AutoPatternOverlay';
import type { EmergingHarmonicResult } from '../analysis/harmonicPattern';
import type { TrackerState } from '../../shared/types/bot';

// 하모닉 패턴 렌더 헬퍼 — 색·키·라벨·TP/SL 선·완성/진행 도형 조립. useAutoPatterns.ts에서 분리 (wp-07 d02).
// React·차트 인스턴스에 의존하지 않는 순수 함수만 있다. AutoShape 타입이 overlays에 있어 analysis/가 아니라 hooks/ 옆에 둔다.

export function getHarmonicPatternColor(patternName: string, alpha: number): string {
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

export function normalizeHarmonicPatternName(patternName?: string): string {
  return (patternName ?? '')
    .replace(/\s*\(Emerging\)\s*$/, '')
    .replace(/^(Bullish|Bearish)\s+/, '')
    .trim();
}

export function harmonicPatternKey(patternName: string | undefined, isBullish: boolean, points: HarmonicKeyPoints): string | null {
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

export function focusHarmonicPatternKey(tracker: TrackerState | null | undefined, toChartTime: (time: string | number) => Time): string | null {
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
export function buildHarmonicLabelStack(opts: {
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
export function buildHarmonicTpSlLines(opts: {
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
export function buildCompletedEmergingShapes(
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
export function buildTrackerFocusShapes(
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
