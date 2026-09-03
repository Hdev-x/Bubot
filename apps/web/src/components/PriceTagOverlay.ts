// 마지막 가격 + 봉 카운트다운 라벨을 "차트의 렌더링 파이프라인 안에서" 위치시키는
// ISeriesPrimitive. 라벨 자체는 기존의 스타일된 DOM(<div>)을 그대로 쓰되, 그 위치를
// 라이브러리가 실제로 페인트하는 시점(renderer.draw)에만 갱신한다. 차트와 같은 프레임·
// 같은 좌표계에서 좌표를 읽으므로, 리사이즈/autoscale 도중의 잘못된 좌표를 DOM에 박는
// "튐/깜빡임"이 구조적으로 발생하지 않는다.
//
// 텍스트(가격·카운트다운)는 외부 타이머가 setState로 넣어주고 refresh()로 리페인트를
// 유도한다. 텍스트는 위치를 바꾸지 않으므로 튐과 무관하다.
import type {
  ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView,
  ISeriesApi, IChartApi, SeriesAttachedParameter,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

export type PriceTagState = {
  lastPrice: number;
  bgColor: string;
  textColor: string;
  priceStr: string;
  countdownText: string;
};

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// ── 위치/여백 튜닝 (기존 카운트다운 로직에서 그대로 이식) ──
const PRICE_FONT_SIZE = 10;
const COUNTDOWN_FONT_SIZE = 9;
const TOP_OFFSET = -11;
const LEFT_OFFSET = 0;
const WIDTH_ADDITION = 18;
const TEXT_PADDING_LEFT = 8;
const TEXT_PADDING_RIGHT = 0;
const TEXT_PADDING_TOP = 0;
const TEXT_PADDING_BOTTOM = 0;
const PRICE_HEIGHT = 14;
const COUNTDOWN_HEIGHT = 14;
const GAP_ADJUST = -2;

function measureWidth(text: string): number {
  const w = window as unknown as { _measureCtx?: CanvasRenderingContext2D | null };
  if (!w._measureCtx) {
    const canvas = document.createElement('canvas');
    w._measureCtx = canvas.getContext('2d');
  }
  const ctx = w._measureCtx;
  if (!ctx) return text.length * PRICE_FONT_SIZE * 0.6;
  ctx.font = `${PRICE_FONT_SIZE}px ${FONT}`;
  return Math.ceil(ctx.measureText(text).width);
}

class PriceTagRenderer implements IPrimitivePaneRenderer {
  constructor(
    private getEl: () => HTMLElement | null,
    private getState: () => PriceTagState | null,
    private series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    private chart: IChartApi,
  ) {}

  // 캔버스에 그리지는 않고, 페인트 시점에 동기화된 좌표로 DOM 라벨만 배치한다.
  draw(target: CanvasRenderingTarget2D) {
    const el = this.getEl();
    const st = this.getState();
    if (!el) return;
    if (!st) { el.style.display = 'none'; return; }

    const y = this.series.priceToCoordinate(st.lastPrice);
    if (y === null) { el.style.display = 'none'; return; }

    // 현재가가 보이는 범위를 벗어나면(좌표가 차트 영역 밖) 배지를 숨긴다 — 헤더 위로 튀는 현상 방지
    const paneHeight = target.useMediaCoordinateSpace((scope) => scope.mediaSize.height);
    if (y + TOP_OFFSET < 0 || y > paneHeight) { el.style.display = 'none'; return; }

    el.style.display = 'flex';
    el.style.top = `${y + TOP_OFFSET}px`;
    el.style.backgroundColor = st.bgColor;
    el.style.color = st.textColor;

    // 네이티브 가격축 라벨을 덮도록 우측 스케일 폭만큼 좌측 시작점을 잡는다.
    const scaleWidth = this.chart.priceScale('right').width();
    el.style.left = `calc(100% - ${scaleWidth - LEFT_OFFSET}px)`;
    el.style.right = 'auto';
    el.style.width = `${measureWidth(st.priceStr) + WIDTH_ADDITION}px`;

    const html =
      `<div style="height: ${PRICE_HEIGHT}px; display: flex; align-items: center; padding-left: ${TEXT_PADDING_LEFT}px; padding-right: ${TEXT_PADDING_RIGHT}px; padding-top: ${TEXT_PADDING_TOP}px; width: 100%; box-sizing: border-box; font-size: ${PRICE_FONT_SIZE}px;">${st.priceStr}</div>` +
      `<div style="height: ${COUNTDOWN_HEIGHT}px; margin-top: ${GAP_ADJUST}px; display: flex; align-items: center; padding-left: ${TEXT_PADDING_LEFT}px; padding-right: ${TEXT_PADDING_RIGHT}px; padding-bottom: ${TEXT_PADDING_BOTTOM}px; width: 100%; box-sizing: border-box; opacity: 0.95; font-size: ${COUNTDOWN_FONT_SIZE}px;">${st.countdownText}</div>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
}

class PriceTagView implements IPrimitivePaneView {
  private _renderer: PriceTagRenderer;
  constructor(
    getEl: () => HTMLElement | null,
    getState: () => PriceTagState | null,
    series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
    chart: IChartApi,
  ) {
    this._renderer = new PriceTagRenderer(getEl, getState, series, chart);
  }
  zOrder() { return 'top' as const; }
  renderer() { return this._renderer; }
}

export class PriceTagOverlay implements ISeriesPrimitive {
  private _view: PriceTagView | null = null;
  private _requestUpdate?: () => void;

  constructor(
    private getEl: () => HTMLElement | null,
    private getState: () => PriceTagState | null,
  ) {}

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter) {
    this._view = new PriceTagView(
      this.getEl,
      this.getState,
      series as ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>,
      chart,
    );
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._view = null;
    const el = this.getEl();
    if (el) el.style.display = 'none';
  }

  paneViews() {
    return this._view ? [this._view] : [];
  }

  // 텍스트/가격이 바뀌었을 때 외부에서 호출 → 리페인트 유도(위치는 draw에서 동기화).
  refresh() {
    this._requestUpdate?.();
  }
}
