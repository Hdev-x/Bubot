import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { Anchor, DrawingOptions, DrawingStyle, SerializedDrawing } from './types';
import { DEFAULT_FIB_LEVELS, DEFAULT_CHANNEL_LEVELS } from './types';

export type AnySeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
export type DrawingState = 'normal' | 'selected';

type Pt = { x: number; y: number };
type Segment = { a: Pt; b: Pt; color?: string; width?: number; dash?: number[] };

// 픽셀 단위 도형 기하 — 렌더링과 히트테스트가 같은 계산을 공유한다.
type Geometry = {
  segments: Segment[];          // 선분들(히트테스트 대상)
  fill?: { poly: Pt[]; color: string }[]; // 채움 다각형(내부 클릭도 히트)
  handles: Pt[];                // 선택 시 표시/드래그하는 핸들(앞쪽 anchors.length개는 앵커와 1:1)
  labels?: { x: number; y: number; text: string; color: string; align?: CanvasTextAlign; bg?: string; size?: number }[];
};

const HANDLE_RADIUS = 5;
const HIT_TOLERANCE = 6;
const HANDLE_HIT_RADIUS = 10;

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pointInPoly(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function lineDash(style: number | undefined): number[] {
  if (style === 1) return [2, 3];
  if (style === 2) return [6, 5];
  return [];
}

// 선분을 화면 좌우 끝까지 연장한 끝점 계산
function extendPoint(from: Pt, to: Pt, width: number, left: boolean): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) < 1e-6) return { x: to.x, y: left ? 0 : 1e6 }; // 수직선은 위/아래로
  const targetX = left ? 0 : width;
  const t = (targetX - from.x) / dx;
  return { x: targetX, y: from.y + dy * t };
}

class DrawingPaneView implements IPrimitivePaneView {
  constructor(private readonly _drawing: Drawing) {}
  renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target: CanvasRenderingTarget2D) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          this._drawing.render(context, mediaSize.width, mediaSize.height);
        });
      },
    };
  }
}

/**
 * 수동 드로잉 한 개 — ISeriesPrimitive로 시리즈에 붙어 차트가 그려질 때마다 함께 렌더된다.
 * 지원 타입: trend-line / horizontal-line / horizontal-ray / rectangle /
 *           price-range / fib-retracement / parallel-channel
 */
export class Drawing implements ISeriesPrimitive {
  readonly id: string;
  readonly type: string;
  anchors: Anchor[];
  style: DrawingStyle;
  options: DrawingOptions;
  state: DrawingState = 'normal';
  /** 매니저가 걸어두는 변경 훅(저장·이벤트 발행용) */
  onChange?: (drawing: Drawing) => void;

  private _chart: IChartApi | null = null;
  private _series: AnySeries | null = null;
  private _requestUpdate?: () => void;
  private _view = new DrawingPaneView(this);

  constructor(id: string, type: string, anchors: Anchor[], style: DrawingStyle, options: DrawingOptions) {
    this.id = id;
    this.type = type;
    this.anchors = anchors.map(a => ({ ...a }));
    this.style = { ...style };
    this.options = { visible: true, locked: false, ...options };
  }

  // ── ISeriesPrimitive ──
  attached({ chart, series, requestUpdate }: { chart: IChartApi; series: unknown; requestUpdate: () => void }) {
    this._chart = chart;
    this._series = series as AnySeries;
    this._requestUpdate = requestUpdate;
  }
  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }
  paneViews() {
    return this.options.visible === false ? [] : [this._view];
  }

  // ── 기존 lightweight-charts-drawing 호환 API ──
  attach(series: AnySeries, _chart?: IChartApi, _container?: HTMLElement | null) {
    if (this._series) return;
    series.attachPrimitive(this);
  }
  detach() {
    this._series?.detachPrimitive(this);
  }
  isAttached() {
    return this._series != null;
  }
  setAnchors(anchors: Anchor[]) {
    this.anchors = anchors.map(a => ({ ...a }));
    this.requestUpdate();
  }
  setState(state: DrawingState) {
    this.state = state;
    this.requestUpdate();
  }
  updateStyle(patch: DrawingStyle) {
    this.style = { ...this.style, ...patch };
    this.requestUpdate();
    this.onChange?.(this);
  }
  updateOptions(patch: DrawingOptions) {
    this.options = { ...this.options, ...patch };
    this.requestUpdate();
    this.onChange?.(this);
  }
  toJSON(): SerializedDrawing {
    return { id: this.id, type: this.type, anchors: this.anchors.map(a => ({ ...a })), style: { ...this.style }, options: { ...this.options } };
  }
  requestUpdate() {
    this._requestUpdate?.();
  }

  // ── 좌표 변환 ──
  private toPt(anchor: Anchor): Pt | null {
    if (!this._chart || !this._series) return null;
    const x = this._chart.timeScale().timeToCoordinate(anchor.time);
    const y = this._series.priceToCoordinate(anchor.price);
    if (x === null || y === null) return null;
    return { x, y };
  }
  /** 앵커들의 현재 픽셀 좌표(드래그 시작 시 캐시용). 변환 불가 앵커는 null. */
  anchorPoints(): (Pt | null)[] {
    return this.anchors.map(a => this.toPt(a));
  }

  private fmtPrice(p: number): string {
    try { return this._series?.priceFormatter().format(p) ?? String(p); } catch { return String(p); }
  }

  /** 두 앵커 사이 봉 개수(logical 인덱스 차) — 가격범위 라벨용 */
  private barsBetween(a: Anchor, b: Anchor): number | null {
    const ts = this._chart?.timeScale();
    if (!ts) return null;
    const xa = ts.timeToCoordinate(a.time), xb = ts.timeToCoordinate(b.time);
    if (xa == null || xb == null) return null;
    const la = ts.coordinateToLogical(xa), lb = ts.coordinateToLogical(xb);
    if (la == null || lb == null) return null;
    return Math.round(Math.abs((lb as number) - (la as number)));
  }

  // ── 기하 계산(렌더·히트테스트 공용) ──
  private geometry(width: number): Geometry | null {
    const s = this.style;
    const color = s.lineColor ?? '#2962ff';
    const lw = s.lineWidth ?? 1;
    const dash = lineDash(s.lineStyle);
    const pts = this.anchors.map(a => this.toPt(a));

    switch (this.type) {
      case 'horizontal-line': {
        const p = pts[0];
        if (!p) return null;
        return {
          segments: [{ a: { x: 0, y: p.y }, b: { x: width, y: p.y }, color, width: lw, dash }],
          handles: [p],
          labels: s.showLabels === false ? [] : [{ x: width - 4, y: p.y - 6, text: this.fmtPrice(this.anchors[0].price), color, align: 'right' }],
        };
      }
      case 'horizontal-ray': {
        const p = pts[0];
        if (!p) return null;
        return {
          segments: [{ a: p, b: { x: width, y: p.y }, color, width: lw, dash }],
          handles: [p],
        };
      }
      case 'trend-line': {
        const [a, b] = pts;
        if (!a || !b) return null;
        const start = s.extendLeft ? extendPoint(b, a, width, true) : a;
        const end = s.extendRight ? extendPoint(a, b, width, false) : b;
        const labels: Geometry['labels'] = [];
        if (s.showLabels) {
          // 프라이스 라벨 — 양끝 앵커 가격을 선 끝에 표시(TV의 '프라이스 라벨')
          labels.push({ x: a.x, y: a.y - 8, text: this.fmtPrice(this.anchors[0].price), color, align: 'center' });
          labels.push({ x: b.x, y: b.y - 8, text: this.fmtPrice(this.anchors[1].price), color, align: 'center' });
        }
        return { segments: [{ a: start, b: end, color, width: lw, dash }], handles: [a, b], labels };
      }
      case 'rectangle': {
        const [a, b] = pts;
        if (!a || !b) return null;
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
        const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        const corners: Pt[] = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
        return {
          segments: corners.map((c, i) => ({ a: c, b: corners[(i + 1) % 4], color, width: lw, dash })),
          fill: s.showBackground === false ? [] : [{ poly: corners, color: s.fillColor ?? 'rgba(41, 98, 254, 0.15)' }],
          // 핸들 0·1 = 실제 앵커, 2·3 = 반대편 코너(x는 상대 앵커, y는 자기 앵커)
          handles: [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }],
        };
      }
      case 'price-range': {
        // TV 방식: 위/아래 캡 수평선 + 중앙 세로 화살표 + 상단 라벨(가격차·%·봉수). 배경은 옵션(기본 꺼짐).
        const [a, b] = pts;
        if (!a || !b) return null;
        const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
        const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        const midX = (x1 + x2) / 2;
        const p0 = this.anchors[0].price, p1 = this.anchors[1].price;
        const diff = p1 - p0;
        const pct = p0 !== 0 ? (diff / p0) * 100 : 0;
        const bars = this.barsBetween(this.anchors[0], this.anchors[1]);
        const text = `${diff >= 0 ? '' : '-'}${this.fmtPrice(Math.abs(diff))} (${pct.toFixed(2)}%)${bars != null ? ` ${bars}` : ''}`;
        const segments: Segment[] = [
          { a: { x: x1, y: a.y }, b: { x: x2, y: a.y }, color, width: lw, dash }, // 시작 캡
          { a: { x: x1, y: b.y }, b: { x: x2, y: b.y }, color, width: lw, dash }, // 끝 캡
          { a: { x: midX, y: a.y }, b: { x: midX, y: b.y }, color, width: lw },   // 중앙 세로
        ];
        const dir = b.y > a.y ? 1 : -1; // 화살촉은 끝 anchor 방향
        segments.push({ a: { x: midX - 4, y: b.y - dir * 6 }, b: { x: midX, y: b.y }, color, width: lw });
        segments.push({ a: { x: midX + 4, y: b.y - dir * 6 }, b: { x: midX, y: b.y }, color, width: lw });
        const fill = s.showBackground
          ? [{ poly: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], color: s.fillColor ?? 'rgba(41, 98, 254, 0.12)' }]
          : [];
        // 라벨은 측정 방향(끝점) 쪽에 — 위로 재면 위, 아래로 재면 아래(TV와 동일)
        const fontSize = s.labelSize ?? 10;
        const labelY = dir > 0 ? y2 + fontSize + 6 : y1 - 8;
        return {
          segments,
          fill,
          handles: [a, b],
          labels: [{ x: midX, y: labelY, text, color: s.labelColor ?? color, align: 'center', size: s.labelSize }],
        };
      }
      case 'fib-retracement': {
        const [a, b] = pts;
        if (!a || !b) return null;
        const levels = (s.levels && s.levels.length ? s.levels : DEFAULT_FIB_LEVELS).filter(l => l.visible);
        const x1 = Math.min(a.x, b.x);
        const x2 = s.extendRight ? width : Math.max(a.x, b.x);
        // 리버스: 0/1 기준을 뒤집음. 기본은 0=끝점(두번째 클릭), 1=시작점 — TV와 동일
        const pEnd = s.reverse ? this.anchors[0].price : this.anchors[1].price;
        const pStart = s.reverse ? this.anchors[1].price : this.anchors[0].price;
        const segments: Segment[] = s.showTrendLine === false ? [] : [{ a, b, color, width: 1, dash: [4, 4] }];
        const labels: Geometry['labels'] = [];
        const fill: NonNullable<Geometry['fill']> = [];
        const levelPts: { level: (typeof levels)[number]; y: number; price: number }[] = [];
        for (const l of levels) {
          // logScale: 하모닉 엔진과 동일하게 로그공간(기하)에서 보간 — 산술보간은 로그축에서 위치가 어긋남
          const price = s.logScale
            ? Math.exp(Math.log(pEnd) + (Math.log(pStart) - Math.log(pEnd)) * l.value)
            : pEnd + (pStart - pEnd) * l.value;
          const y = this._series?.priceToCoordinate(price);
          if (y != null) levelPts.push({ level: l, y: y as number, price });
        }
        levelPts.sort((u, v) => u.y - v.y);
        const fontSize = s.labelSize ?? 10;
        for (let i = 0; i < levelPts.length; i++) {
          const lp = levelPts[i];
          segments.push({ a: { x: x1, y: lp.y }, b: { x: x2, y: lp.y }, color: lp.level.color, width: lw });
          if (s.showLabels !== false && (s.showLevelValues !== false || s.showLevelPrices !== false)) {
            const parts: string[] = [];
            if (s.showLevelValues !== false) parts.push(String(lp.level.value));
            if (s.showLevelPrices !== false) parts.push(`(${this.fmtPrice(lp.price)})`);
            // 라벨 위치 — 가로: 왼쪽(라인 왼쪽 바깥)/센터/오른쪽(라인 오른쪽 바깥), 세로: 위/미들/아래
            const h = s.labelAlignH ?? 'left';
            const lx = h === 'left' ? x1 - 4 : h === 'right' ? x2 + 4 : (x1 + x2) / 2;
            const align: CanvasTextAlign = h === 'left' ? 'right' : h === 'right' ? 'left' : 'center';
            const v = s.labelAlignV ?? 'middle';
            const ly = v === 'top' ? lp.y - 4 : v === 'bottom' ? lp.y + fontSize + 3 : lp.y + fontSize / 2 - 1;
            labels.push({ x: lx, y: ly, text: parts.join(' '), color: lp.level.color, align, size: fontSize });
          }
          if (s.showBackground !== false && i < levelPts.length - 1) {
            const next = levelPts[i + 1];
            fill.push({
              poly: [{ x: x1, y: lp.y }, { x: x2, y: lp.y }, { x: x2, y: next.y }, { x: x1, y: next.y }],
              color: toAlpha(next.level.color, s.bgOpacity ?? 0.07),
            });
          }
        }
        return { segments, fill, handles: [a, b], labels };
      }
      case 'parallel-channel': {
        const [a, b, c] = pts;
        if (!a || !b) return null;
        if (!c) return { segments: [{ a, b, color, width: lw, dash }], handles: [a, b] }; // 3점 배치 중 프리뷰
        // 오프셋: 기준선을 c의 x 위치까지 연장했을 때의 y와 c.y 차이
        const dx = b.x - a.x;
        const baseYAtC = Math.abs(dx) < 1e-6 ? a.y : a.y + (b.y - a.y) * ((c.x - a.x) / dx);
        const dy = c.y - baseYAtC;
        // 레벨 시스템(TV) — 0=기준선, 1=평행선, 0.5=중앙선, 그 외(-0.25~1.25)는 옵션
        const levels = (s.levels && s.levels.length ? s.levels : DEFAULT_CHANNEL_LEVELS).filter(l => l.visible);
        const segments: Segment[] = [];
        for (const l of levels) {
          const la = { x: a.x, y: a.y + dy * l.value };
          const lb = { x: b.x, y: b.y + dy * l.value };
          const start = s.extendLeft ? extendPoint(lb, la, width, true) : la;
          const end = s.extendRight ? extendPoint(la, lb, width, false) : lb;
          const isMain = l.value === 0 || l.value === 1; // 기준/평행선은 라인 스타일, 나머지는 보조선(점선)
          segments.push({
            a: start, b: end,
            color: isMain ? color : l.color,
            width: isMain ? lw : 1,
            dash: isMain ? dash : [4, 4],
          });
        }
        const a2 = { x: a.x, y: a.y + dy }, b2 = { x: b.x, y: b.y + dy };
        const fill = s.showBackground
          ? [{ poly: [a, b, b2, a2], color: s.fillColor ?? toAlpha(color, s.bgOpacity ?? 0.12) }]
          : [];
        return { segments, fill, handles: [a, b, c] };
      }
      default:
        return null;
    }
  }

  // ── 렌더링 ──
  render(ctx: CanvasRenderingContext2D, width: number, _height: number) {
    const geo = this.geometry(width);
    if (!geo) return;
    ctx.save();
    for (const f of geo.fill ?? []) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      f.poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    // showLine=false면 선은 숨기고 배경/라벨만 표시(박스 배경 전용 등). 히트테스트는 유지.
    if (this.style.showLine !== false) {
      for (const seg of geo.segments) {
        ctx.strokeStyle = seg.color ?? '#2962ff';
        ctx.lineWidth = seg.width ?? 1;
        ctx.setLineDash(seg.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(seg.a.x, seg.a.y);
        ctx.lineTo(seg.b.x, seg.b.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    if (geo.labels?.length) {
      for (const l of geo.labels) {
        ctx.font = `${l.size ?? 10}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = l.align ?? 'left';
        if (l.bg) {
          const m = ctx.measureText(l.text);
          const w = m.width + 12, h = (l.size ?? 10) + 6;
          const bx = l.align === 'center' ? l.x - w / 2 : l.align === 'right' ? l.x - w : l.x;
          ctx.fillStyle = l.bg;
          ctx.beginPath();
          ctx.roundRect(bx, l.y - h + 4, w, h, 4);
          ctx.fill();
        }
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, l.x, l.y);
      }
    }
    // 문자(도형 위 사용자 텍스트) — 도형 바운딩박스 기준 정렬
    if (this.options.text && geo.handles.length) {
      const xs = geo.handles.map(h => h.x), ys = geo.handles.map(h => h.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const size = this.style.textSize ?? 12;
      const weight = this.style.textBold ? 'bold ' : '';
      const italic = this.style.textItalic ? 'italic ' : '';
      ctx.font = `${italic}${weight}${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = this.style.textColor ?? this.style.lineColor ?? '#2962ff';
      const h = this.style.textAlignH ?? 'center';
      const v = this.style.textAlignV ?? 'bottom';
      ctx.textAlign = h === 'left' ? 'left' : h === 'right' ? 'right' : 'center';
      const tx = h === 'left' ? minX : h === 'right' ? maxX : (minX + maxX) / 2;
      const lines = String(this.options.text).split('\n');
      const lineH = size * 1.25;
      // 세로 위치: 위=박스 위 바깥, 미들=박스 중앙, 아래=박스 아래 바깥
      let ty = v === 'top' ? minY - 6 - (lines.length - 1) * lineH
        : v === 'middle' ? (minY + maxY) / 2 - ((lines.length - 1) * lineH) / 2 + size / 3
        : maxY + size + 4;
      for (const line of lines) {
        ctx.fillText(line, tx, ty);
        ty += lineH;
      }
    }
    // 선택 시 앵커 핸들
    if (this.state === 'selected') {
      for (const h of geo.handles) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.style.lineColor ?? '#2962ff';
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ── 히트테스트 ──
  // (ISeriesPrimitive.hitTest와 시그니처가 달라 별도 이름 사용)
  /** (x,y)가 핸들 위면 {handle: index}, 몸통 위면 {body: true}, 아니면 null */
  hitTestAt(x: number, y: number, width: number): { handle?: number; body?: boolean } | null {
    if (this.options.visible === false) return null;
    const geo = this.geometry(width);
    if (!geo) return null;
    const p = { x, y };
    if (this.state === 'selected') {
      for (let i = 0; i < geo.handles.length; i++) {
        if (Math.hypot(geo.handles[i].x - x, geo.handles[i].y - y) <= HANDLE_HIT_RADIUS) return { handle: i };
      }
    }
    for (const seg of geo.segments) {
      if (distToSegment(p, seg.a, seg.b) <= HIT_TOLERANCE) return { body: true };
    }
    for (const f of geo.fill ?? []) {
      if (pointInPoly(p, f.poly)) return { body: true };
    }
    return null;
  }

  /** 히트 결과에 맞는 마우스 커서 — 몸통=pointer, 핸들=성격별(수평선 상하조절, 박스 대각 등) */
  cursorFor(hit: { handle?: number; body?: boolean }): string {
    if (hit.handle == null) return 'pointer';
    if (this.type === 'horizontal-line' || this.type === 'horizontal-ray' || this.type === 'price-range') return 'ns-resize';
    if (this.type === 'rectangle') {
      // 코너와 반대 코너의 상대 위치로 대각 방향 결정(TL/BR=nwse, TR/BL=nesw)
      const [a, b] = this.anchorPoints();
      if (a && b) {
        const corners = [a, b, { x: a.x, y: b.y }, { x: b.x, y: a.y }];
        const c = corners[hit.handle];
        const o = corners[hit.handle === 0 ? 1 : hit.handle === 1 ? 0 : hit.handle === 2 ? 3 : 2];
        if (c && o) return (c.x < o.x) === (c.y < o.y) ? 'nwse-resize' : 'nesw-resize';
      }
      return 'default';
    }
    return 'default'; // 추세선·피보·채널 핸들은 기본 화살표(TV와 동일)
  }

  /** 핸들 i를 (time, price)로 드래그 — 타입별 앵커 반영 규칙 */
  moveHandle(index: number, anchor: Anchor) {
    if (this.type === 'rectangle' && index >= 2) {
      // 파생 코너: x는 한쪽 앵커, y는 다른쪽 앵커에 반영
      if (index === 2) { // (a.x, b.y)
        this.anchors[0] = { time: anchor.time, price: this.anchors[0].price };
        this.anchors[1] = { time: this.anchors[1].time, price: anchor.price };
      } else { // (b.x, a.y)
        this.anchors[1] = { time: anchor.time, price: this.anchors[1].price };
        this.anchors[0] = { time: this.anchors[0].time, price: anchor.price };
      }
    } else if (index < this.anchors.length) {
      this.anchors[index] = { ...anchor };
    }
    this.requestUpdate();
  }
}

function toAlpha(hex: string, alpha: number): string {
  if (hex[0] !== '#') return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
