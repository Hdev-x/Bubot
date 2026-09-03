import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { BitmapCoordinatesRenderingScope } from 'fancy-canvas';

export type AutoPoint = {
  time: Time;
  price: number;
};

export type AutoLineStyle = 'solid' | 'dashed' | 'dotted';

export type AutoSegment = {
  type: 'segment';
  from: AutoPoint;
  to: AutoPoint;
  color: string;
  lineWidth?: number;
  lineStyle?: AutoLineStyle;
};

export type AutoPolyline = {
  type: 'polyline';
  points: AutoPoint[];
  color: string;
  lineWidth?: number;
  lineStyle?: AutoLineStyle;
};

export type AutoPolygon = {
  type: 'polygon';
  points: AutoPoint[];
  lineColor: string;
  fillColor: string;
  lineWidth?: number;
  lineStyle?: AutoLineStyle;
};

export type AutoRect = {
  type: 'rect';
  from: AutoPoint;
  to: AutoPoint;
  lineColor: string;
  fillColor: string;
  lineWidth?: number;
  lineStyle?: AutoLineStyle;
};

export type AutoLabel = {
  type: 'label';
  point: AutoPoint;
  text: string;
  color: string;
  fontSize?: number;
  fontWeight?: string;
  textAlign?: CanvasTextAlign;
  pixelOffsetY?: number;
};

// opacity: 그룹 강조용 — 도형 하나당 globalAlpha. 없으면 1(무변화). (M-H5 클릭 강조: 비매칭 패턴 흐리게)
export type AutoShape = (AutoSegment | AutoPolyline | AutoPolygon | AutoRect | AutoLabel) & { opacity?: number };

class AutoPatternRenderer implements IPrimitivePaneRenderer {
  constructor(
    private shapes: AutoShape[],
    private series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    private chart: IChartApi,
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => this.drawShapes(scope));
  }

  private drawShapes({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }: BitmapCoordinatesRenderingScope) {
    const toX = (time: Time) => {
      const coordinate = this.chart.timeScale().timeToCoordinate(time);
      return coordinate == null ? null : coordinate * hr;
    };
    const toY = (price: number) => {
      const coordinate = this.series.priceToCoordinate(price);
      return coordinate == null ? null : coordinate * vr;
    };
    const toPoint = (point: AutoPoint) => {
      const x = toX(point.time);
      const y = toY(point.price);
      return x == null || y == null ? null : { x, y };
    };

    for (const shape of this.shapes) {
      ctx.globalAlpha = shape.opacity ?? 1; // 매 도형 시작 시 설정 → continue 누수 없음
      if (shape.type === 'segment') {
        const from = toPoint(shape.from);
        const to = toPoint(shape.to);
        if (!from || !to) continue;
        this.applyLineStyle(ctx, shape.lineStyle, hr);
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = (shape.lineWidth ?? 1) * hr;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        continue;
      }

      if (shape.type === 'polyline') {
        const points = shape.points.map(toPoint).filter((point): point is { x: number; y: number } => !!point);
        if (points.length < 2) continue;
        this.applyLineStyle(ctx, shape.lineStyle, hr);
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = (shape.lineWidth ?? 1) * hr;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
        continue;
      }

      if (shape.type === 'polygon') {
        const points = shape.points.map(toPoint).filter((point): point is { x: number; y: number } => !!point);
        if (points.length < 3) continue;
        this.applyLineStyle(ctx, shape.lineStyle, hr);
        ctx.fillStyle = shape.fillColor;
        ctx.strokeStyle = shape.lineColor;
        ctx.lineWidth = (shape.lineWidth ?? 1) * hr;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        continue;
      }

      if (shape.type === 'rect') {
        const from = toPoint(shape.from);
        const to = toPoint(shape.to);
        if (!from || !to) continue;
        const x = Math.min(from.x, to.x);
        const y = Math.min(from.y, to.y);
        const width = Math.abs(to.x - from.x);
        const height = Math.abs(to.y - from.y);
        this.applyLineStyle(ctx, shape.lineStyle, hr);
        ctx.fillStyle = shape.fillColor;
        ctx.strokeStyle = shape.lineColor;
        ctx.lineWidth = (shape.lineWidth ?? 1) * hr;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
        continue;
      }

      if (shape.type === 'label') {
        const point = toPoint(shape.point);
        if (!point) continue;
        ctx.setLineDash([]);
        ctx.fillStyle = shape.color;
        ctx.textAlign = shape.textAlign ?? 'center';
        ctx.textBaseline = 'middle';
        const fontSize = (shape.fontSize ?? 12) * vr;
        ctx.font = `${shape.fontWeight ?? 'normal'} ${fontSize}px sans-serif`;
        const yOffset = (shape.pixelOffsetY ?? 0) * vr;
        const lines = shape.text.split(/\n|<br\s*\/?>/i);
        const lineHeight = fontSize * 1.18;
        const startY = point.y + yOffset - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => {
          ctx.fillText(line, point.x, startY + index * lineHeight);
        });
      }
    }
    ctx.globalAlpha = 1; // 루프 후 복원
  }

  private applyLineStyle(ctx: CanvasRenderingContext2D, lineStyle: AutoLineStyle | undefined, horizontalPixelRatio: number) {
    if (lineStyle === 'dashed') {
      ctx.setLineDash([6 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
      return;
    }
    if (lineStyle === 'dotted') {
      ctx.setLineDash([2 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
      return;
    }
    ctx.setLineDash([]);
  }
}

class AutoPatternView implements IPrimitivePaneView {
  private rendererInstance: AutoPatternRenderer;

  constructor(
    shapes: AutoShape[],
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    chart: IChartApi,
  ) {
    this.rendererInstance = new AutoPatternRenderer(shapes, series, chart);
  }

  renderer() {
    return this.rendererInstance;
  }
}

export class AutoPatternOverlay implements ISeriesPrimitive {
  private shapes: AutoShape[] = [];
  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;
  private requestUpdate?: () => void;

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series as unknown as ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = undefined;
  }

  paneViews(): IPrimitivePaneView[] {
    if (!this.chart || !this.series) return [];
    return [new AutoPatternView(this.shapes, this.series, this.chart)];
  }

  update(shapes: AutoShape[]) {
    this.shapes = shapes;
    this.requestUpdate?.();
  }
}
