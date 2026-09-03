import { Drawing } from './Drawing';
import type { Anchor, DrawingOptions, DrawingStyle } from './types';
import { DEFAULT_FIB_LEVELS } from './types';

export type ToolEntry = {
  requiredAnchors: number;
  factory: (id: string, anchors?: Anchor[], style?: DrawingStyle, options?: DrawingOptions) => Drawing;
};

const BLUE = '#2962ff';

// 도구별 필요 앵커 수 + 기본 스타일
const TOOL_DEFS: Array<{ type: string; requiredAnchors: number; defaults: DrawingStyle }> = [
  { type: 'horizontal-line', requiredAnchors: 1, defaults: { lineColor: BLUE, lineWidth: 1, showLabels: true } },
  { type: 'horizontal-ray', requiredAnchors: 1, defaults: { lineColor: BLUE, lineWidth: 1 } },
  { type: 'trend-line', requiredAnchors: 2, defaults: { lineColor: BLUE, lineWidth: 1 } },
  { type: 'rectangle', requiredAnchors: 2, defaults: { lineColor: BLUE, lineWidth: 1, fillColor: 'rgba(41, 98, 254, 0.15)' } },
  { type: 'price-range', requiredAnchors: 2, defaults: { lineColor: BLUE, lineWidth: 1, fillColor: 'rgba(41, 98, 254, 0.12)' } },
  { type: 'fib-retracement', requiredAnchors: 2, defaults: { lineColor: BLUE, lineWidth: 1, showLabels: true, showBackground: true, levels: DEFAULT_FIB_LEVELS, logScale: true } },
  { type: 'parallel-channel', requiredAnchors: 3, defaults: { lineColor: BLUE, lineWidth: 1, fillColor: 'rgba(41, 98, 254, 0.12)' } },
];

const registry = new Map<string, ToolEntry>();
for (const def of TOOL_DEFS) {
  registry.set(def.type, {
    requiredAnchors: def.requiredAnchors,
    factory: (id, anchors = [], style = {}, options = {}) =>
      new Drawing(id, def.type, anchors, { ...def.defaults, ...style }, options),
  });
}

/** 도구 타입 → 팩토리/필요 앵커 수. 기존 lightweight-charts-drawing과 동일 시그니처. */
export function getToolRegistry(): Map<string, ToolEntry> {
  return registry;
}
