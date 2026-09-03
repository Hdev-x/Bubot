import type { IChartApi, ISeriesPrimitive, IPrimitivePaneView } from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { Anchor } from './types';
import type { AnySeries } from './Drawing';

/**
 * 자석 스냅 표시점 — 도구 배치 중 커서가 캔들 OHLC에 스냅되면 그 지점에 파란 링을 그린다.
 * (첫 클릭 전에도 자석이 어디에 붙는지 보이게 — TV와 동일한 피드백)
 */
export class SnapDot implements ISeriesPrimitive {
  private _point: Anchor | null = null;
  private _chart: IChartApi | null = null;
  private _series: AnySeries | null = null;
  private _requestUpdate?: () => void;
  private _view: IPrimitivePaneView = {
    renderer: () => ({
      draw: (target: CanvasRenderingTarget2D) => {
        target.useMediaCoordinateSpace(({ context: ctx }) => {
          if (!this._point || !this._chart || !this._series) return;
          const x = this._chart.timeScale().timeToCoordinate(this._point.time);
          const y = this._series.priceToCoordinate(this._point.price);
          if (x == null || y == null) return;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(41, 98, 254, 0.25)';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#2962ff';
          ctx.stroke();
        });
      },
    }),
  };

  attached({ chart, series, requestUpdate }: { chart: IChartApi; series: unknown; requestUpdate: () => void }) {
    this._chart = chart;
    this._series = series as AnySeries;
    this._requestUpdate = requestUpdate;
  }
  detached() {
    this._chart = null;
    this._series = null;
  }
  paneViews() {
    return this._point ? [this._view] : [];
  }
  /** 표시 위치 설정(null=숨김) */
  set(point: Anchor | null) {
    const changed = !!point !== !!this._point
      || (point && this._point && (point.time !== this._point.time || point.price !== this._point.price));
    this._point = point;
    if (changed) this._requestUpdate?.();
  }
}
