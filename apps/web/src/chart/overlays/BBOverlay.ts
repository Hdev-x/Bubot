import type {
  ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView,
  ISeriesApi, IChartApi, Time
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

export type BBData = {
  time: Time;
  upper: number;
  lower: number;
};

class BBRenderer implements IPrimitivePaneRenderer {
  constructor(
    private data: BBData[],
    private fillColor: string,
    private series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    private chart: IChartApi,
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => this._draw(scope));
  }

  private _draw({ context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr }: BitmapCoordinatesRenderingScope) {
    if (this.data.length < 2) return;
    
    const timeScale = this.chart.timeScale();

    ctx.fillStyle = this.fillColor;
    ctx.beginPath();

    let started = false;

    // Upper line (left to right)
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      const x = timeScale.timeToCoordinate(d.time);
      if (x === null) continue;
      const y = this.series.priceToCoordinate(d.upper);
      if (y === null) continue;
      
      const px = x * hr;
      const py = y * vr;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    if (!started) return;

    // Lower line (right to left)
    for (let i = this.data.length - 1; i >= 0; i--) {
      const d = this.data[i];
      const x = timeScale.timeToCoordinate(d.time);
      if (x === null) continue;
      const y = this.series.priceToCoordinate(d.lower);
      if (y === null) continue;
      
      const px = x * hr;
      const py = y * vr;
      ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.fill();
  }
}

class BBView implements IPrimitivePaneView {
  private _renderer: BBRenderer;

  constructor(
    data: BBData[],
    fillColor: string,
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    chart: IChartApi,
  ) {
    this._renderer = new BBRenderer(data, fillColor, series, chart);
  }

  update(data: BBData[], fillColor: string, series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>, chart: IChartApi) {
    this._renderer = new BBRenderer(data, fillColor, series, chart);
  }

  renderer() {
    return this._renderer;
  }
}

export class BBOverlay implements ISeriesPrimitive {
  private _view: BBView | null = null;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null = null;

  attached({ chart, series, requestUpdate }: any) {
    this._chart = chart;
    this._series = series;
    this.requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
  }

  paneViews() {
    return this._view ? [this._view] : [];
  }

  update(data: BBData[], fillColor: string) {
    if (!this._chart || !this._series) return;
    if (!this._view) {
      this._view = new BBView(data, fillColor, this._series, this._chart);
    } else {
      this._view.update(data, fillColor, this._series, this._chart);
    }
    this.requestUpdate?.();
  }

  requestUpdate?: () => void;
}
