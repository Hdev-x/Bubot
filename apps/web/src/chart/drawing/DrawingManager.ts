import type { IChartApi, Time } from 'lightweight-charts';
import { Drawing } from './Drawing';
import type { AnySeries } from './Drawing';
import type { Anchor, SerializedDrawing } from './types';

export type DrawingEvent =
  | 'drawing:added' | 'drawing:removed' | 'drawing:updated' | 'drawing:cleared'
  | 'drawing:selected' | 'drawing:deselected';

type EventPayload = { drawingId?: string };
type Listener = (e: EventPayload) => void;

type DragSession = {
  drawing: Drawing;
  mode: 'body' | 'handle';
  handleIndex: number;
  startX: number;
  startY: number;
  startAnchors: Anchor[];
  startPts: ({ x: number; y: number } | null)[]; // 드래그 시작 시 각 앵커의 픽셀 좌표
  moved: boolean;
};

/**
 * 수동 드로잉 매니저 — 도형 목록 관리 + 선택/드래그 인터랙션 + 직렬화.
 * 기존 lightweight-charts-drawing의 DrawingManager와 동일한 API 표면을 유지해
 * MarketChart/FloatingToolbar/ObjectTreeSheet가 그대로 동작한다.
 */
export class DrawingManager {
  private _chart: IChartApi | null = null;
  private _series: AnySeries | null = null;
  private _container: HTMLElement | null = null;
  private _drawings: Drawing[] = [];
  private _listeners = new Map<DrawingEvent, Set<Listener>>();
  private _drag: DragSession | null = null;
  private _hitTestEnabled = true;
  /** 자석 스냅 — MarketChart가 주입(캔들 OHLC 근접 시 가격을 붙임). 핸들 드래그에 적용. */
  snapFn?: (time: Time, price: number) => number;

  // ── 수명주기 ──
  attach(chart: IChartApi, series: AnySeries, container: HTMLElement) {
    this._chart = chart;
    this._series = series;
    this._container = container;
    // 캡처 단계에서 가로채 도형 히트 시 차트 팬/줌으로 이벤트가 가지 않게 막는다.
    container.addEventListener('mousedown', this._onPointerDown, true);
    container.addEventListener('touchstart', this._onPointerDown, true);
    container.addEventListener('mousemove', this._onHoverMove);
  }

  detach() {
    if (this._container) {
      this._container.removeEventListener('mousedown', this._onPointerDown, true);
      this._container.removeEventListener('touchstart', this._onPointerDown, true);
      this._container.removeEventListener('mousemove', this._onHoverMove);
      this._clearHoverCursor();
    }
    this._unbindDragListeners();
    for (const d of this._drawings) d.detach();
    this._drawings = [];
    this._chart = null;
    this._series = null;
    this._container = null;
  }

  isAttached() {
    return this._chart != null && this._series != null;
  }

  /** 도구 배치 중(activeTool)에는 기존 도형 선택/드래그를 끔 — 클릭이 앵커 배치로 가야 하므로 */
  setHitTestEnabled(enabled: boolean) {
    this._hitTestEnabled = enabled;
  }

  // ── 도형 CRUD ──
  addDrawing(drawing: Drawing) {
    if (!this._series) return;
    if (!drawing.isAttached()) drawing.attach(this._series, this._chart ?? undefined, this._container);
    // preview_* 는 화면 전용(고스트) — 목록/저장/이벤트에서 제외
    if (drawing.id.startsWith('preview_')) return;
    drawing.onChange = () => this._emit('drawing:updated', { drawingId: drawing.id });
    this._drawings.push(drawing);
    this._emit('drawing:added', { drawingId: drawing.id });
  }

  removeDrawing(id: string) {
    const idx = this._drawings.findIndex(d => d.id === id);
    if (idx < 0) return;
    const [d] = this._drawings.splice(idx, 1);
    const wasSelected = d.state === 'selected';
    d.detach();
    this._emit('drawing:removed', { drawingId: id });
    if (wasSelected) this._emit('drawing:deselected', {});
  }

  clearAll(silent = false) {
    for (const d of this._drawings) d.detach();
    this._drawings = [];
    if (!silent) this._emit('drawing:cleared', {});
  }

  getDrawing(id: string): Drawing | undefined {
    return this._drawings.find(d => d.id === id);
  }

  getAllDrawings(): Drawing[] {
    return [...this._drawings];
  }

  getSelectedDrawing(): Drawing | undefined {
    return this._drawings.find(d => d.state === 'selected');
  }

  // ── 선택 ──
  selectDrawing(id: string) {
    for (const d of this._drawings) if (d.state === 'selected' && d.id !== id) d.setState('normal');
    const target = this.getDrawing(id);
    if (target) {
      target.setState('selected');
      this._emit('drawing:selected', { drawingId: id });
    }
  }

  deselectAll() {
    let had = false;
    for (const d of this._drawings) {
      if (d.state === 'selected') { d.setState('normal'); had = true; }
    }
    if (had) this._emit('drawing:deselected', {});
  }

  // ── 직렬화 ──
  exportDrawings(): SerializedDrawing[] {
    return this._drawings.map(d => d.toJSON());
  }

  importDrawings(data: SerializedDrawing[], factory: (type: string, d: SerializedDrawing) => Drawing | null) {
    for (const item of data ?? []) {
      try {
        const d = factory(item.type, item);
        if (d) this.addDrawing(d);
      } catch { /* 알 수 없는 타입(구버전 도구)은 건너뜀 */ }
    }
  }

  // ── 이벤트 ──
  on(event: DrawingEvent, cb: Listener): () => void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(cb);
    return () => this._listeners.get(event)?.delete(cb);
  }

  private _emit(event: DrawingEvent, payload: EventPayload) {
    this._listeners.get(event)?.forEach(cb => { try { cb(payload); } catch { /* 리스너 오류 무시 */ } });
  }

  // ── 인터랙션 ──
  private _localPoint(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if (!this._container) return null;
    const rect = this._container.getBoundingClientRect();
    const src = 'touches' in e ? (e.touches[0] ?? ('changedTouches' in e ? e.changedTouches[0] : undefined)) : e;
    if (!src) return null;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  /** 페인(캔들 영역) 크기 — 가격축/시간축 위 클릭은 무시 */
  private _paneSize(): { w: number; h: number } {
    const ts = this._chart?.timeScale();
    const w = ts?.width() ?? this._container?.clientWidth ?? 0;
    const h = (this._container?.clientHeight ?? 0) - (ts?.height() ?? 0);
    return { w, h };
  }

  // ── 호버 커서 — 몸통 위 pointer, 핸들 위 성격별 커서, 잠금 도형은 기본 커서 ──
  private _hoverCursorSet = false;
  private _clearHoverCursor() {
    if (this._hoverCursorSet && this._container) {
      this._container.style.cursor = '';
      this._hoverCursorSet = false;
    }
  }
  private _onHoverMove = (e: MouseEvent) => {
    // 드래그 중이거나 도구 배치 중(크로스헤어)이면 커서를 건드리지 않음
    if (this._drag || !this._hitTestEnabled || !this.isAttached()) return;
    const pt = this._localPoint(e);
    if (!pt) return;
    const { w, h } = this._paneSize();
    if (pt.x > w || pt.y > h) { this._clearHoverCursor(); return; }
    const ordered = [...this._drawings].sort((a, b) => (b.state === 'selected' ? 1 : 0) - (a.state === 'selected' ? 1 : 0));
    for (const d of ordered) {
      const r = d.hitTestAt(pt.x, pt.y, w);
      if (r) {
        if (d.options.locked) { this._clearHoverCursor(); return; } // 잠금: 손가락 없음
        this._container!.style.cursor = d.cursorFor(r);
        this._hoverCursorSet = true;
        return;
      }
    }
    this._clearHoverCursor();
  };

  private _onPointerDown = (e: MouseEvent | TouchEvent) => {
    if (!this.isAttached()) return;
    const pt = this._localPoint(e);
    if (!pt) return;
    const { w, h } = this._paneSize();
    if (pt.x > w || pt.y > h) return; // 축 영역

    if (!this._hitTestEnabled) return; // 도구 배치 중 — 선택/드래그 안 함

    // 선택된 도형 우선(핸들 잡기), 그다음 위에 그려진 순(뒤에 추가된 것 먼저)
    const ordered = [...this._drawings].sort((a, b) => (b.state === 'selected' ? 1 : 0) - (a.state === 'selected' ? 1 : 0));
    let hitDrawing: Drawing | null = null;
    let hit: { handle?: number; body?: boolean } | null = null;
    for (const d of ordered) {
      const r = d.hitTestAt(pt.x, pt.y, w);
      if (r) { hitDrawing = d; hit = r; break; }
    }

    if (!hitDrawing || !hit) {
      this.deselectAll();
      return;
    }

    // 도형 히트 — 차트 팬/줌으로 이벤트가 내려가지 않게 캡처 단계에서 차단
    e.preventDefault();
    e.stopPropagation();

    if (hitDrawing.state !== 'selected') this.selectDrawing(hitDrawing.id);
    if (hitDrawing.options.locked) return; // 잠금: 선택만 되고 이동 불가

    this._drag = {
      drawing: hitDrawing,
      mode: hit.handle != null ? 'handle' : 'body',
      handleIndex: hit.handle ?? -1,
      startX: pt.x,
      startY: pt.y,
      startAnchors: hitDrawing.anchors.map(a => ({ ...a })),
      startPts: hitDrawing.anchorPoints(),
      moved: false,
    };
    window.addEventListener('mousemove', this._onPointerMove);
    window.addEventListener('mouseup', this._onPointerUp);
    window.addEventListener('touchmove', this._onPointerMove, { passive: false });
    window.addEventListener('touchend', this._onPointerUp);
  };

  private _onPointerMove = (e: MouseEvent | TouchEvent) => {
    const drag = this._drag;
    if (!drag || !this._chart || !this._series) return;
    const pt = this._localPoint(e);
    if (!pt) return;
    if ('touches' in e) e.preventDefault(); // 터치 드래그 중 페이지 스크롤 방지
    const dx = pt.x - drag.startX;
    const dy = pt.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;

    const ts = this._chart.timeScale();
    if (drag.mode === 'handle') {
      const time = ts.coordinateToTime(pt.x);
      const rawPrice = this._series.coordinateToPrice(pt.y);
      if (rawPrice == null) return;
      const cur = drag.drawing.anchors[Math.min(drag.handleIndex, drag.drawing.anchors.length - 1)];
      const t = time ?? cur.time;
      const price = this.snapFn ? this.snapFn(t, rawPrice) : rawPrice;
      drag.drawing.moveHandle(drag.handleIndex, { time: t, price });
    } else {
      // 몸통 이동: 시작 시 픽셀 좌표에 델타를 더해 시간/가격으로 역변환
      const next: Anchor[] = [];
      for (let i = 0; i < drag.startAnchors.length; i++) {
        const sp = drag.startPts[i];
        if (!sp) { next.push(drag.startAnchors[i]); continue; }
        const time = ts.coordinateToTime(sp.x + dx);
        const price = this._series.coordinateToPrice(sp.y + dy);
        next.push({
          time: time ?? drag.startAnchors[i].time,
          price: price ?? drag.startAnchors[i].price,
        });
      }
      drag.drawing.setAnchors(next);
    }
  };

  private _onPointerUp = () => {
    const drag = this._drag;
    this._drag = null;
    this._unbindDragListeners();
    if (drag?.moved) this._emit('drawing:updated', { drawingId: drag.drawing.id });
  };

  private _unbindDragListeners() {
    window.removeEventListener('mousemove', this._onPointerMove);
    window.removeEventListener('mouseup', this._onPointerUp);
    window.removeEventListener('touchmove', this._onPointerMove);
    window.removeEventListener('touchend', this._onPointerUp);
  }
}
