import { useAutoPatterns } from "./hooks/useAutoPatterns";

import { useIndicators } from './hooks/useIndicators';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { CandlestickSeries, LineSeries, HistogramSeries, ColorType, createChart, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, UTCTimestamp, LineData } from 'lightweight-charts';
import { DrawingManager, getToolRegistry, SnapDot, getFibLogScaleDefault } from './drawing';
import type { IDrawing, SerializedDrawing } from './drawing';
import type { Candle } from '../types/market';
import { computeRsiCandles, DEFAULT_RSI_SETTINGS } from '../utils/rsiCandles';
import type { RsiSettings } from '../utils/rsiCandles';
import { computeMA } from '../utils/movingAverages';
import type { ChartTheme } from './settings/ChartSettingsSheet';
import { getDerivedThemeColors } from './settings/ChartSettingsSheet';
import { ChartOverlay } from './overlays/ChartOverlay';
import { BBOverlay } from './overlays/BBOverlay';
import type { BBData } from './overlays/BBOverlay';
import { AutoPatternOverlay } from './overlays/AutoPatternOverlay';
import { PriceTagOverlay } from './overlays/PriceTagOverlay';
import type { PriceTagState } from './overlays/PriceTagOverlay';
import type { MASetting, BBSetting } from './indicators/IndicatorSheet';
import { hexToRgba } from './indicators/IndicatorSheet';
import type { IndicatorSettings, IndicatorLayer, OBOptions } from './overlays/ChartOverlay';
import type { PivotSetting } from './indicators/IndicatorSheet';
import type { TrackerState } from '../types/bot';

type Props = {
  candles: Candle[];
  symbol?: string;
  period?: string;
  marketKey?: string; // 거래소+상품(현물/선물) 식별 — 바뀌면 종목 변경처럼 캔버스 리셋·리프레이밍
  variant?: 'dark' | 'light';
  className?: string;
  chartType?: 'candle' | 'line';
  isLogScale?: boolean;
  locked?: boolean;
  activeTool?: string | null;
  magnet?: boolean; // 드로잉 자석 — 포인트가 캔들 OHLC 근처(픽셀)면 달라붙음(약자석). 배치·프리뷰·핸들 드래그 적용

  drawingStorageKey?: string;
  chartTheme?: ChartTheme;
  tickDecimals?: number;
  indicatorSettings?: IndicatorSettings;
  indicatorLayers?: IndicatorLayer[];
  currentTfSeconds?: number;
  active?: boolean; // 차트 화면이 떠 있을 때만 가격태그 카운트다운 타이머(250ms) 작동
  obOptions?: OBOptions;
  onLogScaleToggle?: () => void;
  onCrosshairMove?: (candle: Candle | null) => void;
  // 마지막 캔들 이후 미래 빈 구간에도 시간축 시점(whitespace)을 추가해 크로스헤어 날짜 라벨이 뜨게 함(기본 false)
  futureTimeAxis?: boolean;
  onVisibleRangeChange?: (range: { logicalRange: { from: number; to: number } | null }) => void;
  onHistoryChange?: (status: { canUndo: boolean, canRedo: boolean }) => void;
  onToolChange?: (tool: string | null) => void;
  // 드로잉 선택 변경 통지 — 지정하면 부모가 자체 선택 UI(웹 플로팅 툴바)를 그리는 것으로 보고
  // 내부 기본 삭제 버튼은 렌더하지 않는다.
  onDrawingSelect?: (id: string | null) => void;
  maSettings?: MASetting[];
  bbSetting?: BBSetting;
  pivotSetting?: PivotSetting;
  focusTracker?: TrackerState | null;
  highlightTracker?: TrackerState | null;
  soloDimAll?: boolean; // solo 포커스: 매칭 없는 TF에서도 나머지 전부 흐림
  soloPreserve?: boolean; // solo 뷰 유지: TF 변경 시 가격축 autoScale 리셋 스킵(수동 줌 유지)
  // 종목/주기 변경 시 캔버스를 비우지 않고 옛 캔들 유지 → 새 데이터 도착 시 통째 교체(웹: 전환 깜빡임 방지). 기본 false(모바일 보존)
  keepDataOnSymbolChange?: boolean;
  showVolume?: boolean; // 차트 하단에 거래량 히스토그램 표시(기본 false, 모바일 보존)
  showRsiCandles?: boolean; // 하단 별도 페인에 RSI 캔들 표시(v5 panes — 시간축 공유)
  rsiSettings?: RsiSettings; // RSI 캔들 색·기간·기준선(70/50/30) 스타일
  showPriceLine?: boolean; // 현재가 기준 수평 점선(마지막 값 priceLine) 표시(기본 false)
  rankTiersOn?: Record<string, boolean>; // 신뢰도 랭킹 선 체급별 토글 (baseline_rank_{symbol}.json 필요)
};

// ── 신뢰도 랭킹 선(임시 오버레이) — baseline_rank_{symbol}.json이 있을 때만 노출 ──
const RANK_TIERS = ['1M', '1W', '3D', '1d'] as const;
type RankLine = { price?: number; priceLo?: number; priceHi?: number; count?: number; score: number; from?: number };

// 거래량 막대 색(반투명 상승/하락)
const VOL_UP_COLOR = 'rgba(14, 203, 129, 0.20)';
const VOL_DOWN_COLOR = 'rgba(246, 70, 93, 0.20)';

// 거래량 막대 색 = 캔들 색(테마)에 반투명 적용. hex(#rgb/#rrggbb)만 변환, 그 외엔 폴백.
function volColorFromHex(hex: string | undefined, fallback: string): string {
  if (!hex || hex[0] !== '#') return fallback;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return fallback;
  return `rgba(${r}, ${g}, ${b}, 0.20)`;
}

export interface MarketChartRef {
  deleteSelected: () => void;
  clearAll: () => void;
  getDrawingManager: () => any;
  addDrawing: (tool: string) => void;
  selectDrawing: (id: string) => void;
  undo: () => void;
  redo: () => void;
  focusTimeWindow: (fromTime: number, toTime: number, marginFrac?: number) => void;
  resetView: () => void;
  // solo 뷰 유지용: 현재 보이는 시간범위를 raw 캔들시간 도메인(focusTimeWindow와 동일 도메인)으로 읽기.
  // 인덱스→캔들.time 매핑이라 chart-time offset 변환이 필요 없다(오프셋 불일치 버그 방지).
  getVisibleRawTimeRange: () => { from: number; to: number } | null;
  resetPriceAutoScale: () => void;
  captureImage: () => HTMLCanvasElement | null; // 차트 전체(캔들·지표·패턴·가격축·시간축) 스냅샷
};

function toChartTime(time: string | number): Time {
  const offsetSeconds = -new Date().getTimezoneOffset() * 60;
  if (typeof time === 'number') return (time + offsetSeconds) as UTCTimestamp;
  if (typeof time === 'string' && time.includes(' ')) return (Math.floor(new Date(time.replace(' ', 'T')).getTime() / 1000) + offsetSeconds) as UTCTimestamp;
  return time as Time;
}


const MarketChart = forwardRef<MarketChartRef, Props>(function MarketChart({
  candles,
  symbol,
  period,
  marketKey,
  variant = 'dark',
  className = '',
  chartType = 'candle',
  isLogScale = false,
  locked = false,
  activeTool = null,
  magnet = false,
  drawingStorageKey,
  chartTheme,
  tickDecimals = 2,
  indicatorSettings,
  indicatorLayers,
  currentTfSeconds = 0,
  active = true,
  obOptions,
  onLogScaleToggle,
  onCrosshairMove,
  futureTimeAxis = false,
  onVisibleRangeChange,
  onHistoryChange,
  onToolChange,
  onDrawingSelect,
  maSettings,
  bbSetting,
  pivotSetting,
  focusTracker,
  highlightTracker,
  soloDimAll,
  soloPreserve,
  keepDataOnSymbolChange = false,
  showVolume = false,
  showRsiCandles = false,
  rsiSettings = DEFAULT_RSI_SETTINGS,
  showPriceLine = false,
  rankTiersOn,
}, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const volSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null); // RSI 캔들(페인1)
  const rsiLastCountRef = useRef(0);   // RSI 시리즈 추적(거래량과 동일 — TF 전환 시 리셋 필수)
  const rsiLastTimeRef = useRef<Time | null>(null);
  const showPriceLineRef = useRef(showPriceLine); // 차트 생성 시 초기 priceLine 표시값
  const showRsiCandlesRef = useRef(showRsiCandles); // 차트 재생성 시 RSI 재부착 판단용
  const rsiSettingsRef = useRef(rsiSettings);
  const rsiPriceLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const maSeriesMapRef = useRef<Record<number, ISeriesApi<'Line'>>>({});
  const bbSeriesRef = useRef<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; middle: ISeriesApi<'Line'>; overlay: BBOverlay } | null>(null);
  const overlayRef = useRef<ChartOverlay | null>(null);
  const autoPatternOverlayRef = useRef<AutoPatternOverlay | null>(null);
  const waveSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const futureWsSeriesRef = useRef<ISeriesApi<'Line'> | null>(null); // 미래 시간축 whitespace 전용
  const futureWsAnchorRef = useRef<string | null>(null); // 마지막 whitespace 앵커(중복 setData 방지)
  const markersPrimitiveRef = useRef<any>(null);
  const drawingManagerRef = useRef<DrawingManager | null>(null);
  const previewDrawingRef = useRef<IDrawing | null>(null);
  const snapDotRef = useRef<SnapDot | null>(null); // 자석 스냅 표시점(도구 배치 중)
  const drawingStorageKeyRef = useRef(drawingStorageKey);
  const activeToolRef = useRef(activeTool);
  const pendingAnchorsRef = useRef<Array<{ time: Time; price: number }>>([]);
  const selectedDrawingIdRef = useRef<string | null>(null);
  const skipNextClickRef = useRef(false);
  const lastCandleTimeRef = useRef<Time | null>(null);
  const lastCandleCountRef = useRef<number>(0);
  const pendingRecentCountRef = useRef<number | null>(null); // 폭 생기면 적용할 초기 프레이밍 count
  const frameObserverRef = useRef<ResizeObserver | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const currentStateRef = useRef<string>('[]');
  const isRestoringRef = useRef<boolean>(false);
  const onHistoryChangeRef = useRef(onHistoryChange);
  useEffect(() => { onHistoryChangeRef.current = onHistoryChange; }, [onHistoryChange]);
  const onToolChangeRef = useRef(onToolChange);
  useEffect(() => { onToolChangeRef.current = onToolChange; }, [onToolChange]);
  const onDrawingSelectRef = useRef(onDrawingSelect);
  useEffect(() => { onDrawingSelectRef.current = onDrawingSelect; }, [onDrawingSelect]);
  // 선택 변경을 부모에 통지(웹 플로팅 툴바용)
  useEffect(() => { onDrawingSelectRef.current?.(selectedDrawingId); }, [selectedDrawingId]);

  const takeSnapshot = useCallback(() => {
    if (!drawingManagerRef.current || isRestoringRef.current) return;
    const serialized = drawingManagerRef.current.exportDrawings();
    const newStateStr = JSON.stringify(serialized);
    if (newStateStr !== currentStateRef.current) {
      undoStackRef.current.push(currentStateRef.current);
      redoStackRef.current = [];
      currentStateRef.current = newStateStr;
      
      onHistoryChangeRef.current?.({ 
        canUndo: undoStackRef.current.length > 0, 
        canRedo: redoStackRef.current.length > 0 
      });
    }
  }, []);

  const countdownRef = useRef<HTMLDivElement | null>(null);
  const priceTagRef = useRef<PriceTagOverlay | null>(null);
  const priceTagStateRef = useRef<PriceTagState | null>(null);

  const tickDecimalsRef = useRef(tickDecimals);
  const onCrosshairMoveRef = useRef(onCrosshairMove);
  const onVisibleRangeChangeRef = useRef(onVisibleRangeChange);

  useImperativeHandle(ref, () => ({
    deleteSelected: () => {
      const manager = drawingManagerRef.current;
      const selectedId = manager?.getSelectedDrawing()?.id;
      if (manager && selectedId) {
        manager.removeDrawing(selectedId);
        selectedDrawingIdRef.current = null;
        setSelectedDrawingId(null);
        takeSnapshot();
      }
    },
    clearAll() {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.clearAll();
        selectedDrawingIdRef.current = null;
        setSelectedDrawingId(null);
        takeSnapshot();
      }
    },
    getDrawingManager: () => drawingManagerRef.current,
    getVisibleRawTimeRange: () => {
      const ts = chartRef.current?.timeScale();
      const lr = ts?.getVisibleLogicalRange();
      const cs = candlesRef.current;
      if (!lr || !cs?.length) return null;
      const fromIdx = Math.max(0, Math.min(cs.length - 1, Math.round(lr.from)));
      const toIdx = Math.max(0, Math.min(cs.length - 1, Math.round(lr.to)));
      if (fromIdx > toIdx) return null;
      return { from: Number(cs[fromIdx].time), to: Number(cs[toIdx].time) };
    },
    resetPriceAutoScale: () => {
      try { chartRef.current?.priceScale(locked ? 'left' : 'right').applyOptions({ autoScale: true }); } catch { /* 무시 */ }
    },
    captureImage: () => chartRef.current?.takeScreenshot() ?? null,
    addDrawing: (tool: string) => {
      const manager = drawingManagerRef.current;
      if (!manager) return;
      
      pendingAnchorsRef.current = [];
      const entry = getToolRegistry().get(tool);
      if (!entry) return;

      const preview = entry.factory(`preview_${Date.now()}`, [], {}, {});
      previewDrawingRef.current = preview;
      manager.addDrawing(preview);
    },
    selectDrawing: (id) => {
      const manager = drawingManagerRef.current;
      if (manager) {
        if (id) {
          manager.deselectAll();
          const drawing = manager.getAllDrawings().find((d: any) => d.id === id);
          if (drawing) drawing.setState('selected');
          selectedDrawingIdRef.current = id;
          setSelectedDrawingId(id);
        } else {
          manager.deselectAll();
          selectedDrawingIdRef.current = null;
          setSelectedDrawingId(null);
        }
        chartRef.current?.timeScale().applyOptions({});
      }
    },
    undo: () => {
      const manager = drawingManagerRef.current;
      if (!manager || undoStackRef.current.length === 0) return;
      isRestoringRef.current = true;
      
      redoStackRef.current.push(currentStateRef.current);
      const prevStateStr = undoStackRef.current.pop()!;
      currentStateRef.current = prevStateStr;
      
      manager.clearAll();
      const registry = getToolRegistry();
      manager.importDrawings(JSON.parse(prevStateStr), (type: string, d: any) => {
        const entry = registry.get(type);
        return entry ? entry.factory(d.id, d.anchors, d.style, d.options) : null;
      });
      
      isRestoringRef.current = false;
      onHistoryChangeRef.current?.({ 
        canUndo: undoStackRef.current.length > 0, 
        canRedo: redoStackRef.current.length > 0 
      });
    },
    redo: () => {
      const manager = drawingManagerRef.current;
      if (!manager || redoStackRef.current.length === 0) return;
      isRestoringRef.current = true;
      
      undoStackRef.current.push(currentStateRef.current);
      const nextStateStr = redoStackRef.current.pop()!;
      currentStateRef.current = nextStateStr;
      
      manager.clearAll();
      const registry = getToolRegistry();
      manager.importDrawings(JSON.parse(nextStateStr), (type: string, d: any) => {
        const entry = registry.get(type);
        return entry ? entry.factory(d.id, d.anchors, d.style, d.options) : null;
      });

      isRestoringRef.current = false;
      onHistoryChangeRef.current?.({
        canUndo: undoStackRef.current.length > 0,
        canRedo: redoStackRef.current.length > 0
      });
    },
    // 모니터링 카드 클릭 시 해당 패턴을 캔들 인덱스 범위로 가시 영역에 맞춘다.
    // 패턴 시간 창을 받아 저장하고 적용. 인덱스 계산은 applyFocusRange가 현재 캔들 기준으로.
    focusTimeWindow: (fromTime, toTime, marginFrac = 0.2) => {
      focusRef.current = { fromTime, toTime, marginFrac };
      applyFocusRange();
    },
    // 당겨서 새로고침 등에서 호출 — 포커스 해제 + 가격 스케일 auto 복귀 + 마지막 ~60봉으로 뷰 리셋
    resetView: () => {
      focusRef.current = null;
      // 사용자가 가격축을 드래그하면 autoScale=false(수동)가 됨 → auto로 되돌려 자동 맞춤 복귀
      try { chartRef.current?.priceScale(locked ? 'left' : 'right').applyOptions({ autoScale: true }); } catch { /* 무시 */ }
      showRecentBars(candlesRef.current?.length ?? 0);
    }
  }));

  // 현재가 수평 점선 토글 — 차트 재생성 없이 메인 시리즈 옵션만 갱신
  useEffect(() => {
    showPriceLineRef.current = showPriceLine;
    seriesRef.current?.applyOptions({ priceLineVisible: showPriceLine });
  }, [showPriceLine]);

  // 스토리지 키(심볼) 변경 — 차트를 재생성하지 않고 드로잉만 교체(웹 keepDataOnSymbolChange와 공존).
  // 초기 로드는 차트 생성 effect가 하고, 이후 심볼 전환은 여기서 조용히 비우고 새 키의 저장분을 복원.
  useEffect(() => {
    const prevKey = drawingStorageKeyRef.current;
    drawingStorageKeyRef.current = drawingStorageKey;
    const manager = drawingManagerRef.current;
    if (!manager || !manager.isAttached() || prevKey === drawingStorageKey) return;
    manager.clearAll(true); // silent — 새 키의 localStorage를 지우면 안 됨
    selectedDrawingIdRef.current = null;
    setSelectedDrawingId(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    currentStateRef.current = '[]';
    if (drawingStorageKey) {
      try {
        const saved = localStorage.getItem(`chart_drawings_${drawingStorageKey}`);
        if (saved) {
          const data = JSON.parse(saved) as SerializedDrawing[];
          const registry = getToolRegistry();
          isRestoringRef.current = true;
          manager.importDrawings(data, (type, d) => {
            const entry = registry.get(type);
            return entry ? entry.factory(d.id, d.anchors, d.style, d.options) : null;
          });
          isRestoringRef.current = false;
        }
      } catch { /* 손상된 저장분 무시 */ }
    }
  }, [drawingStorageKey]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    pendingAnchorsRef.current = [];
    // 도형 선택 때 켜진 "다음 클릭 무시" 플래그가 남아 있으면 도구의 첫 클릭이 소모됨 → 도구 전환 시 리셋
    skipNextClickRef.current = false;
    snapDotRef.current?.set(null); // 도구 해제 시 자석 표시점 제거
    if (previewDrawingRef.current) {
      previewDrawingRef.current.detach();
      previewDrawingRef.current = null;
    }
    if (drawingManagerRef.current?.isAttached()) {
      drawingManagerRef.current.deselectAll();
      // 배치 중에는 기존 도형 선택/드래그를 꺼서 클릭이 앵커 배치로 가게 한다
      drawingManagerRef.current.setHitTestEnabled(!activeTool);
    }
  }, [activeTool]);

  useEffect(() => { tickDecimalsRef.current = tickDecimals; }, [tickDecimals]);

  useEffect(() => {
    if (!seriesRef.current) return;
    const minMove = Math.pow(10, -tickDecimals);
    seriesRef.current.applyOptions({
      priceFormat: { type: 'price', precision: tickDecimals, minMove },
    });
  }, [tickDecimals]);

  const candlesRef = useRef<Candle[]>([]);
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // ── 드로잉 자석(약자석) — 해당 봉의 O/H/L/C 중 픽셀 거리 8px 이내 최근접 값으로 스냅 ──
  const magnetRef = useRef(magnet);
  useEffect(() => { magnetRef.current = magnet; }, [magnet]);
  const MAGNET_PX = 8;
  const snapPrice = useCallback((chartTime: Time, price: number): number => {
    if (!magnetRef.current || !seriesRef.current) return price;
    const cs = candlesRef.current;
    if (!cs.length || typeof chartTime !== 'number') return price;
    // 차트 Time(로컬 오프셋 시프트) → 캔들 원시 unix
    const raw = (chartTime as number) + new Date().getTimezoneOffset() * 60;
    const candle = cs.find(c => Number(c.time) === raw);
    if (!candle) return price;
    const y = seriesRef.current.priceToCoordinate(price);
    if (y == null) return price;
    let best = price;
    let bestDist = MAGNET_PX;
    for (const v of [candle.open, candle.high, candle.low, candle.close]) {
      const vy = seriesRef.current.priceToCoordinate(v);
      if (vy == null) continue;
      const d = Math.abs(vy - y);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    return best;
  }, []);
  const snapPriceRef = useRef(snapPrice);
  useEffect(() => { snapPriceRef.current = snapPrice; }, [snapPrice]);

  // ── RSI 캔들(하단 페인1) ── 색·기간·기준선은 rsiSettings로 제어. toChartTime으로 시간축 공유.
  useEffect(() => { rsiSettingsRef.current = rsiSettings; }, [rsiSettings]);

  // 기준선(70/50/30) 재적용 — 기존 라인 제거 후 설정대로 재생성
  const applyRsiLines = useCallback((s: ISeriesApi<'Candlestick'>) => {
    for (const pl of rsiPriceLinesRef.current) { try { s.removePriceLine(pl); } catch { /* 무시 */ } }
    rsiPriceLinesRef.current = [];
    for (const ln of rsiSettingsRef.current.lines) {
      if (!ln.visible) continue;
      rsiPriceLinesRef.current.push(s.createPriceLine({
        price: ln.value, color: ln.color, lineWidth: Math.max(1, Math.min(4, ln.width)) as 1 | 2 | 3 | 4,
        lineStyle: ln.style, axisLabelVisible: true, title: '',
      }));
    }
  }, []);

  const rsiCandleColorOpts = () => {
    const { upColor: up, downColor: down } = rsiSettingsRef.current;
    return { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down };
  };

  // RSI 시리즈 생성(페인1). 이미 있으면 그대로 반환. 기준선 포함.
  const ensureRsiSeries = useCallback((): ISeriesApi<'Candlestick'> | null => {
    const chart = chartRef.current;
    if (!chart) return null;
    if (rsiSeriesRef.current) return rsiSeriesRef.current;
    const s = chart.addSeries(CandlestickSeries, {
      ...rsiCandleColorOpts(),
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: true, priceLineVisible: false,
    }, 1); // paneIndex 1 = 하단 별도 페인(시간축 공유)
    rsiSeriesRef.current = s;
    applyRsiLines(s);
    try { s.priceScale().applyOptions({ mode: rsiSettingsRef.current.logScale ? 1 : 0 }); } catch { /* 무시 */ }
    try { chart.panes()[1]?.setHeight(130); } catch { /* 페인 크기 실패 무시 */ }
    return s;
  }, [applyRsiLines]);

  const destroyRsiSeries = useCallback(() => {
    const chart = chartRef.current;
    if (chart && rsiSeriesRef.current) {
      try { chart.removeSeries(rsiSeriesRef.current); } catch { /* 이미 제거됨 */ }
    }
    rsiSeriesRef.current = null;
    rsiPriceLinesRef.current = [];
    rsiLastCountRef.current = 0;
    rsiLastTimeRef.current = null;
  }, []);

  // RSI 데이터 그리기 — 거래량 히스토그램과 동일한 전체 setData / 마지막봉 update 분기.
  const drawRsi = useCallback((cs: Candle[]) => {
    const s = rsiSeriesRef.current;
    if (!s) return;
    const rsi = computeRsiCandles(cs, rsiSettingsRef.current.period);
    if (!rsi.length) {
      s.setData([]);
      rsiLastCountRef.current = 0;
      rsiLastTimeRef.current = null;
      return;
    }
    const toBar = (r: (typeof rsi)[number]) => ({ time: toChartTime(r.time), open: r.open, high: r.high, low: r.low, close: r.close });
    const newCount = rsi.length;
    const prevCount = rsiLastCountRef.current;
    const addedCount = newCount - prevCount;
    const lastTime = toChartTime(rsi[newCount - 1].time);
    const isAppendingSingle = addedCount === 1 && (newCount < 2 || toChartTime(rsi[newCount - 2].time) === rsiLastTimeRef.current);
    const isUpdatingLast = addedCount === 0 && lastTime === rsiLastTimeRef.current;
    if (prevCount > 0 && (isAppendingSingle || isUpdatingLast)) {
      // ref-시리즈 불일치 시 update가 throw → 전체 setData 폴백(거래량과 동일)
      try { s.update(toBar(rsi[newCount - 1])); }
      catch { s.setData(rsi.map(toBar)); }
    } else {
      s.setData(rsi.map(toBar));
    }
    rsiLastCountRef.current = newCount;
    rsiLastTimeRef.current = lastTime;
  }, []);

  // RSI 토글 — 런타임에 페인 시리즈 추가/제거(차트 재생성 없이). 켤 때 즉시 그린다.
  useEffect(() => {
    showRsiCandlesRef.current = showRsiCandles;
    if (!chartRef.current) return;
    if (showRsiCandles) {
      ensureRsiSeries();
      drawRsi(candlesRef.current);
    } else {
      destroyRsiSeries();
    }
  }, [showRsiCandles, ensureRsiSeries, destroyRsiSeries, drawRsi]);

  // RSI 설정 변경(색/기간/기준선) — 시리즈 있으면 색·기준선 갱신 + 전체 재계산(기간 반영).
  useEffect(() => {
    const s = rsiSeriesRef.current;
    if (!s) return;
    s.applyOptions(rsiCandleColorOpts());
    applyRsiLines(s);
    try { s.priceScale().applyOptions({ mode: rsiSettings.logScale ? 1 : 0 }); } catch { /* 무시 */ }
    rsiLastCountRef.current = 0; // 기간이 바뀌면 봉 개수가 달라짐 → 전체 setData 강제
    rsiLastTimeRef.current = null;
    drawRsi(candlesRef.current);
     
  }, [rsiSettings, applyRsiLines, drawRsi]);

  // 모니터링 카드 focus 대상(시간 창). 인덱스가 아니라 "시간"을 저장하고 적용할 때마다
  // 현재 캔들에서 인덱스를 다시 계산한다 → 캔들 길이(loadMore/새로고침)가 바뀌어도 안 깨짐.
  // 캔들 데이터 effect의 fitContent를 덮어쓰지 않도록 그 자리에서 재적용한다.
  const focusRef = useRef<{ fromTime: number; toTime: number; marginFrac: number } | null>(null);
  const pendingAutoScaleRef = useRef(false); // 종목/TF 전환 시 가격축 autoScale 복원을 새 데이터(isFirstLoad)까지 미룸
  const soloPreserveRef = useRef(false); // solo 뷰 유지 중이면 TF 변경 시 가격축 리셋 스킵(effect에서 최신값 읽기)
  soloPreserveRef.current = !!soloPreserve;
  const applyFocusRange = () => {
    const f = focusRef.current;
    const ts = chartRef.current?.timeScale();
    const cs = candlesRef.current;
    if (!f || !ts || !cs.length) return;
    let xIdx = cs.findIndex(c => Number(c.time) >= f.fromTime);
    let dIdx = cs.findIndex(c => Number(c.time) >= f.toTime);
    if (xIdx < 0) xIdx = 0;
    if (dIdx < 0) dIdx = cs.length - 1;
    const span = Math.max(dIdx - xIdx, 1);
    const margin = Math.max(2, Math.round(span * f.marginFrac));
    const from = Math.max(0, xIdx - margin);
    const to = Math.min(cs.length - 1, dIdx + margin);
    try { ts.setVisibleLogicalRange({ from, to }); } catch { /* 무시 */ }
  };
  // focus가 없을 때 초기/타임프레임 전환 표시 영역. 캔들은 패턴 탐지용으로 많이(1200) 로드하되
  // 화면엔 마지막 N봉만 보이게 한다(fitContent로 전체를 욱여넣지 않음).
  const INITIAL_VISIBLE_BARS = 60;
  // 마지막 N봉 범위를 적용. 붙으면(getVisibleLogicalRange non-null) pending 해제하고 true.
  const applyRecentBars = (count: number): boolean => {
    const ts = chartRef.current?.timeScale();
    if (!ts || count <= 0) return false;
    const from = Math.max(0, count - INITIAL_VISIBLE_BARS);
    try {
      ts.setVisibleLogicalRange({ from, to: count - 1 + 12 });
    } catch {
      return false; // fitContent 폴백 안 함(전체 축소 방지)
    }
    const ok = ts.getVisibleLogicalRange() != null;
    if (ok) pendingRecentCountRef.current = null;
    return ok;
  };
  // 초기 프레이밍 — 진입 직후 차트 폭이 0이면 범위가 안 붙으므로(getVisibleLogicalRange=null),
  // 적용할 count를 pending에 걸어두고 즉시+rAF로 시도한다. 폭이 늦게 생기면 ResizeObserver(생성 effect)가 적용.
  const showRecentBars = (count: number) => {
    if (count <= 0) return;
    pendingRecentCountRef.current = count;
    if (applyRecentBars(count)) return;
    let tries = 0;
    const attempt = () => {
      if (pendingRecentCountRef.current == null) return; // 이미 적용됨
      if (applyRecentBars(pendingRecentCountRef.current)) return;
      if (++tries < 90) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  };
  // 심볼/타임프레임이 바뀌면 이전 focus는 무효(새 패턴 클릭 시 부모가 다시 설정).
  // period까지 보는 이유: 패턴 시간창은 진입 TF 기준이라, 하위 TF로 바꾸면 그 창이
  // 로드 범위 밖으로 나가 캔들이 화면에서 사라짐(빈 차트) → TF 변경 시에도 초기화.
  useEffect(() => {
    // solo 뷰 유지 중이면 focusRef를 지우지 않는다 — TF 버튼 onClick에서 이미 새 목표 창을
    // 동기적으로 세팅해뒀는데, 여기서 null로 밀면 새 캔들 도착 시 프레이밍이 통째로 안 먹혀
    // "이전 leftover 뷰(사실상 캔들개수 기준처럼 보임)"가 남는 버그가 났었다. solo 아닐 땐 기존 동작.
    if (!soloPreserveRef.current) focusRef.current = null;
    // 종목/주기 변경 시 가격축을 auto로 복원 — 사용자가 직전에 축을 드래그(autoScale=false)했어도
    // 새 종목은 자기 가격대로 다시 맞춰지게(수동 스케일이 새 코인에 남는 구멍 방지).
    // keepDataOnSymbolChange(웹)면 옛 캔들이 아직 떠 있어, 지금 복원하면 가격축이 옛 캔들에 먼저 스냅("풀린 뒤
    // 넘어가는" 2단계)된다 → 새 데이터 도착(isFirstLoad) 때 함께 복원하도록 미룬다. 모바일은 즉시 비우므로 지금 복원.
    // solo 뷰 유지 중이면 가격축 autoScale 리셋을 건너뛴다(사용자 수동 줌 유지). solo 아닐 땐 기존 동작.
    if (soloPreserveRef.current) {
      // skip
    } else if (keepDataOnSymbolChange) {
      pendingAutoScaleRef.current = true;
    } else {
      try { chartRef.current?.priceScale(locked ? 'left' : 'right').applyOptions({ autoScale: true }); } catch { /* 무시 */ }
    }
  }, [symbol, period, marketKey, locked, keepDataOnSymbolChange]);

  useEffect(() => { onCrosshairMoveRef.current = onCrosshairMove; }, [onCrosshairMove]);
  useEffect(() => { onVisibleRangeChangeRef.current = onVisibleRangeChange; }, [onVisibleRangeChange]);

  useEffect(() => {
    // ref 리셋은 항상 — 새 캔들 도착 시 isFirstLoad로 전체 setData(통째 교체)되게 한다.
    lastCandleCountRef.current = 0;
    lastCandleTimeRef.current = null;
    // 거래량 추적 ref도 함께 리셋 — 안 하면 새 TF 캔들 개수·마지막 봉 시각이 이전 TF와 우연히
    // 일치할 때(정각 부근 1H→6H 등) update 경로로 오판, 이전 TF 거래량 막대 전체가 시리즈에 남아
    // 시간축(전 시리즈 시간 합집합)이 뒤틀림 → 캔들 간격 깨짐/인트라데이 라벨/빈 구간 막대.
    volLastCountRef.current = 0;
    volLastTimeRef.current = null;
    // RSI 추적 ref도 리셋 — 안 하면 이전 TF RSI 봉이 잔존해 시간축 뒤틀림(거래량과 동일 함정)
    rsiLastCountRef.current = 0;
    rsiLastTimeRef.current = null;
    // keepDataOnSymbolChange=true(웹)면 캔버스를 비우지 않고 옛 캔들 유지 → 새 데이터 도착 시 교체(빈 화면 깜빡 방지).
    // 기본(모바일)은 즉시 비워 이전 종목 잔상 제거.
    if (keepDataOnSymbolChange) return;
    seriesRef.current?.setData([]);
    volSeriesRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    Object.values(maSeriesMapRef.current).forEach(s => s.setData([]));
    if (bbSeriesRef.current) {
      bbSeriesRef.current.upper.setData([]);
      bbSeriesRef.current.middle.setData([]);
      bbSeriesRef.current.lower.setData([]);
      bbSeriesRef.current.overlay.update([], 'rgba(0,0,0,0)');
    }
  }, [symbol, period, marketKey, keepDataOnSymbolChange]);

  // 키보드: Delete = 선택 드로잉 삭제, Escape = 배치 취소
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        pendingAnchorsRef.current = [];
        if (previewDrawingRef.current) {
          previewDrawingRef.current.detach();
          previewDrawingRef.current = null;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingIdRef.current) {
        const manager = drawingManagerRef.current;
        if (manager) {
          manager.removeDrawing(selectedDrawingIdRef.current);
          selectedDrawingIdRef.current = null;
          setSelectedDrawingId(null);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 차트 초기화
  useEffect(() => {
    if (!hostRef.current) return;

    const isLight = variant === 'light';
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: isLight ? '#ffffff' : '#000000' },
        textColor: isLight ? '#9a9a9a' : '#9aa4b2',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: 10,
        // 페인(메인↔RSI) 구분선 — 기본 흰색이 두껍고 진해 은은한 회색으로
        panes: {
          separatorColor: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)',
          separatorHoverColor: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.16)',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' }
      },
      leftPriceScale: {
        visible: locked,
        borderColor: 'transparent',
        scaleMargins: { top: 0, bottom: 0 },
        mode: isLogScale ? 1 : 0
      },
      rightPriceScale: {
        visible: !locked,
        borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        mode: isLogScale ? 1 : 0
      },
      timeScale: {
        visible: true,
        borderColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 6
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { labelVisible: true, color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' },
        horzLine: { labelVisible: true, color: isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)' }
      },
      handleScroll: !locked,
      handleScale: !locked
    });
    
    const timeScale = chart.timeScale();
    // 마지막 캔들 이후 빈 영역에서도 크로스헤어 시각/좌표를 미래로 추정 → 빈 구간에도 하단 날짜 라벨 표시
    const originalCoordinateToTime = timeScale.coordinateToTime.bind(timeScale);
    timeScale.coordinateToTime = (x: number) => {
      let time = originalCoordinateToTime(x);
      if (!time && candlesRef.current && candlesRef.current.length > 0) {
        const logical = timeScale.coordinateToLogical(x);
        if (logical !== null) {
          const lastCandle = candlesRef.current[candlesRef.current.length - 1];
          const lastX = timeScale.timeToCoordinate(toChartTime(lastCandle.time) as any);
          const lastLogical = lastX !== null ? timeScale.coordinateToLogical(lastX) : candlesRef.current.length - 1;
          const diffBars = Math.max(1, Math.floor(logical - (lastLogical || candlesRef.current.length - 1)));
          const lastUnix = typeof lastCandle.time === 'number' ? lastCandle.time : Math.floor(new Date(lastCandle.time).getTime() / 1000);
          time = toChartTime(lastUnix + (diffBars * (currentTfSeconds || 86400))) as any;
        }
      }
      return time;
    };

    const originalTimeToCoordinate = timeScale.timeToCoordinate.bind(timeScale);
    timeScale.timeToCoordinate = (time: any) => {
      let x = originalTimeToCoordinate(time);
      if (x === null && candlesRef.current && candlesRef.current.length > 0) {
        const lastCandle = candlesRef.current[candlesRef.current.length - 1];
        const lastUnix = typeof lastCandle.time === 'number' ? lastCandle.time : Math.floor(new Date(lastCandle.time).getTime() / 1000);
        const offsetSeconds = -new Date().getTimezoneOffset() * 60;
        const targetUnix = typeof time === 'number' ? time : time.timestamp;
        if (targetUnix) {
          const diffSeconds = targetUnix - (lastUnix + offsetSeconds);
          if (diffSeconds > 0) {
            const diffBars = diffSeconds / (currentTfSeconds || 86400);
            const lastX = originalTimeToCoordinate(toChartTime(lastCandle.time) as any);
            const lastLogical = lastX !== null ? timeScale.coordinateToLogical(lastX) : candlesRef.current.length - 1;
            if (lastLogical !== null) {
              x = timeScale.logicalToCoordinate((lastLogical + diffBars) as any);
            }
          }
        }
      }
      return x;
    };

    const scaleId = locked ? 'left' : 'right';
    let activeSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;

    const initDecimals = tickDecimalsRef.current;
    const initMinMove = Math.pow(10, -initDecimals);

    if (chartType === 'line') {
      activeSeries = chart.addSeries(LineSeries, {
        color: '#3182f6', lineWidth: 2,
        lastValueVisible: !locked,
        priceLineVisible: showPriceLineRef.current, // 현재가 수평 점선(기본 off)
        priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove },
        priceScaleId: scaleId
      });
    } else {
      activeSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#0ecb81', downColor: '#f6465d',
        borderUpColor: '#0ecb81', borderDownColor: '#f6465d',
        wickUpColor: '#0ecb81', wickDownColor: '#f6465d',
        lastValueVisible: !locked,
        priceLineVisible: showPriceLineRef.current, // 현재가 수평 점선(기본 off)
        priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove },
        priceScaleId: scaleId
      });
    }

    // 거래량 히스토그램 — 별도 priceScale('volume')로 차트 하단에 겹쳐 표시
    if (showVolume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      volSeriesRef.current = volSeries;
    }

    chartRef.current = chart;
    seriesRef.current = activeSeries;

    // Overlay (OB/FVG/CE) — candlestick 전용
    if (chartType === 'candle') {
      const overlay = new ChartOverlay();
      activeSeries.attachPrimitive(overlay);
      overlayRef.current = overlay;
    }

    // BB Overlay 초기화
    const bbOverlay = new BBOverlay();
    activeSeries.attachPrimitive(bbOverlay);

    const autoPatternOverlay = new AutoPatternOverlay();
    activeSeries.attachPrimitive(autoPatternOverlay);
    autoPatternOverlay.update([]);
    autoPatternOverlayRef.current = autoPatternOverlay;


    // 가격/카운트다운 라벨: 차트 페인트 시점에 위치 동기화(튐 방지)
    const priceTag = new PriceTagOverlay(
      () => countdownRef.current,
      () => priceTagStateRef.current,
    );
    activeSeries.attachPrimitive(priceTag);
    priceTagRef.current = priceTag;

    const bbUpper = chart.addSeries(LineSeries, { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: scaleId, priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove } });
    const bbMiddle = chart.addSeries(LineSeries, { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: scaleId, priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove } });
    const bbLower = chart.addSeries(LineSeries, { lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: scaleId, priceFormat: { type: 'price', precision: initDecimals, minMove: initMinMove } });
    
    bbSeriesRef.current = { upper: bbUpper, middle: bbMiddle, lower: bbLower, overlay: bbOverlay };

    const waveSeries = chart.addSeries(LineSeries, {
      color: 'rgba(255, 235, 59, 0.6)',
      lineWidth: 2,
      lineStyle: 0, // Solid line
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      priceScaleId: scaleId
    });
    waveSeriesRef.current = waveSeries;

    // 미래 시간축 whitespace — 마지막 캔들 이후에도 크로스헤어 날짜 라벨이 뜨게 시점만 추가(값 없음 → 안 보임)
    if (futureTimeAxis) {
      futureWsSeriesRef.current = chart.addSeries(LineSeries, {
        lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, priceScaleId: scaleId,
      });
    }

    // RSI 캔들 페인 — 토글이 켜져 있으면 차트 생성 시 함께 부착(데이터는 아래 RSI effect가 그림)
    if (showRsiCandlesRef.current) ensureRsiSeries();

    // 초기 뷰는 캔들 데이터 effect의 showRecentBars가 잡는다(여기서 fitContent하면
    // 재생성 때마다 전체가 욱여넣어져 showRecentBars를 덮어씀 → 제거).
    // 진입 직후 폭이 0이면 setVisibleLogicalRange가 안 붙으므로, 폭이 생기는 순간 pending 프레이밍을 적용.
    const frameObserver = new ResizeObserver(() => {
      const c = pendingRecentCountRef.current;
      if (c != null && hostRef.current && hostRef.current.clientWidth > 0) {
        requestAnimationFrame(() => {
          if (pendingRecentCountRef.current != null) applyRecentBars(pendingRecentCountRef.current);
        });
      }
    });
    frameObserver.observe(hostRef.current);
    frameObserverRef.current = frameObserver;

    const manager = new DrawingManager();
    manager.attach(chart, activeSeries, hostRef.current);
    manager.setHitTestEnabled(!activeToolRef.current);
    manager.snapFn = (t, p) => snapPriceRef.current(t, p); // 자석 — 핸들 드래그 스냅
    drawingManagerRef.current = manager;

    // 자석 스냅 표시점 — 도구 배치 중 커서가 OHLC에 붙으면 파란 링 표시
    const snapDot = new SnapDot();
    activeSeries.attachPrimitive(snapDot);
    snapDotRef.current = snapDot;

    const storageKey = drawingStorageKeyRef.current;
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`chart_drawings_${storageKey}`);
        if (saved) {
          const data = JSON.parse(saved) as SerializedDrawing[];
          const registry = getToolRegistry();
          manager.importDrawings(data, (type, d) => {
            const entry = registry.get(type);
            return entry ? entry.factory(d.id, d.anchors, d.style, d.options) : null;
          });
        }
      } catch { /* ignore */ }
    }

    const saveDrawings = () => {
      const key = drawingStorageKeyRef.current;
      if (!key) return;
      localStorage.setItem(`chart_drawings_${key}`, JSON.stringify(manager.exportDrawings()));
    };

    const unsubs = [
      manager.on('drawing:added', saveDrawings),
      manager.on('drawing:removed', () => { saveDrawings(); takeSnapshot(); }),
      manager.on('drawing:updated', saveDrawings),
      manager.on('drawing:cleared', () => {
        const key = drawingStorageKeyRef.current;
        if (key) localStorage.removeItem(`chart_drawings_${key}`);
        takeSnapshot();
      }),
      manager.on('drawing:selected', (e) => {
        selectedDrawingIdRef.current = e.drawingId ?? null;
        setSelectedDrawingId(e.drawingId ?? null);
        skipNextClickRef.current = true;
      }),
      manager.on('drawing:deselected', () => {
        selectedDrawingIdRef.current = null;
        setSelectedDrawingId(null);
      }),
    ];

    // Ghost preview: mousemove 시 임시 드로잉으로 프리뷰 표시
    const registry = getToolRegistry();

    const handleMouseMove = (e: MouseEvent) => {
      const tool = activeToolRef.current;
      // 자석 스냅 표시점 — 도구가 활성이면(첫 클릭 전 포함) 커서가 OHLC에 붙을 때 링 표시
      if (tool && magnetRef.current) {
        const rect0 = hostRef.current!.getBoundingClientRect();
        const t0 = chart.timeScale().coordinateToTime(e.clientX - rect0.left);
        const p0 = activeSeries.coordinateToPrice(e.clientY - rect0.top);
        if (t0 != null && p0 != null) {
          const snapped = snapPriceRef.current(t0, p0);
          snapDot.set(snapped !== p0 ? { time: t0, price: snapped } : null);
        } else {
          snapDot.set(null);
        }
      } else {
        snapDot.set(null);
      }
      if (!tool || pendingAnchorsRef.current.length === 0) return;
      const entry = registry.get(tool);
      if (!entry || entry.requiredAnchors <= 1) return;

      const rect = hostRef.current!.getBoundingClientRect();
      const time = chart.timeScale().coordinateToTime(e.clientX - rect.left);
      const rawPrice = activeSeries.coordinateToPrice(e.clientY - rect.top);
      if (time === null || rawPrice === null) return;
      const price = snapPriceRef.current(time, rawPrice); // 자석 — 프리뷰도 스냅 위치로

      const allAnchors = [...pendingAnchorsRef.current, { time, price }];

      if (!previewDrawingRef.current) {
        const preview = entry.factory(`preview_${Date.now()}`, allAnchors, { lineColor: '#2962ff', lineWidth: 1 });
        preview.attach(activeSeries, chart, hostRef.current!);
        previewDrawingRef.current = preview;
      } else {
        previewDrawingRef.current.setAnchors(allAnchors);
      }
    };

    const handleMouseLeave = () => snapDot.set(null);
    hostRef.current.addEventListener('mousemove', handleMouseMove);
    hostRef.current.addEventListener('mouseleave', handleMouseLeave);

    // 클릭 → 앵커 수집 → 드로잉 완성
    chart.subscribeClick((params) => {
      const tool = activeToolRef.current;
      if (!tool || !params.time || !params.point) return;
      if (skipNextClickRef.current) {
        skipNextClickRef.current = false;
        return;
      }
      const entry = registry.get(tool);
      if (!entry) return;
      const rawPrice = activeSeries.coordinateToPrice(params.point.y);
      if (rawPrice === null) return;
      const price = snapPriceRef.current(params.time, rawPrice); // 자석 — 배치 클릭 스냅
      pendingAnchorsRef.current.push({ time: params.time, price });
      if (pendingAnchorsRef.current.length >= entry.requiredAnchors) {
        if (previewDrawingRef.current) {
          previewDrawingRef.current.detach();
          previewDrawingRef.current = null;
        }
        const id = `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        // 피보나치는 로그스케일 여부를 마지막 선택값으로 이어받는다(클릭한 게 다음 그리기의 기본값).
        const initStyle = tool === 'fib-retracement' ? { logScale: getFibLogScaleDefault() } : undefined;
        const drawing = entry.factory(id, [...pendingAnchorsRef.current], initStyle);
        manager.addDrawing(drawing);
        pendingAnchorsRef.current = [];
        activeToolRef.current = null;
        if (onToolChangeRef.current) {
          onToolChangeRef.current(null);
        }
      }
    });

    chart.subscribeCrosshairMove((param) => {
      if (!onCrosshairMoveRef.current) return;
      if (!param.time || !param.seriesData.size) {
        onCrosshairMoveRef.current(null);
        return;
      }
      const data = param.seriesData.get(activeSeries);
      if (data) {
        // 거래량은 볼륨 시리즈의 해당 막대 값에서 읽는다(캔들 시리즈엔 volume이 없어 0으로 나가던 것 보정)
        const volData = volSeriesRef.current ? param.seriesData.get(volSeriesRef.current) : undefined;
        onCrosshairMoveRef.current({
          time: param.time as number,
          open: (data as any).open ?? (data as any).value,
          high: (data as any).high ?? (data as any).value,
          low: (data as any).low ?? (data as any).value,
          close: (data as any).close ?? (data as any).value,
          volume: volData ? Number((volData as any).value) || 0 : 0
        });
      }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && onVisibleRangeChangeRef.current) {
        onVisibleRangeChangeRef.current({ logicalRange: range });
      }
    });

    const handlePointerUp = () => {
      setTimeout(takeSnapshot, 0);
    };
    if (hostRef.current) {
      hostRef.current.addEventListener('pointerup', handlePointerUp);
    }

    return () => {
      if (hostRef.current) {
        hostRef.current.removeEventListener('pointerup', handlePointerUp);
      }
      hostRef.current?.removeEventListener('mousemove', handleMouseMove);
      hostRef.current?.removeEventListener('mouseleave', handleMouseLeave);
      snapDotRef.current = null;
      frameObserverRef.current?.disconnect();
      frameObserverRef.current = null;
      if (previewDrawingRef.current) {
        previewDrawingRef.current.detach();
        previewDrawingRef.current = null;
      }
      unsubs.forEach(unsub => unsub());
      if (manager) {
        manager.detach();
      }
      drawingManagerRef.current = null;
      overlayRef.current = null;
      autoPatternOverlayRef.current = null;
      priceTagRef.current = null;
      priceTagStateRef.current = null;
      waveSeriesRef.current = null;
      futureWsSeriesRef.current = null;
      futureWsAnchorRef.current = null;
      markersPrimitiveRef.current = null;
      // chart.remove()가 모든 시리즈를 파괴하므로 ref만 정리(removeSeries 호출 금지)
      rsiSeriesRef.current = null;
      rsiLastCountRef.current = 0;
      rsiLastTimeRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      maSeriesMapRef.current = {};
      lastCandleCountRef.current = 0;
      lastCandleTimeRef.current = null;
    };
    // drawingStorageKey는 deps에서 제외 — 키(심볼) 변경은 위 전용 effect가 드로잉만 교체(차트 재생성 방지)
  }, [variant, chartType, locked]);

  useIndicators({
    chartRef,
    maSeriesMapRef,
    bbSeriesRef,
    overlayRef,
    candles,
    period,
    locked,
    tickDecimals,
    currentTfSeconds,
    maSettings,
    bbSetting,
    indicatorSettings,
    indicatorLayers,
    obOptions,
    isLogScale,
    toChartTime,
    drawingStorageKey,
    variant,
    chartType
  });

  useEffect(() => {
    if (!chartRef.current) return;
    const scaleId = locked ? 'left' : 'right';
    chartRef.current.priceScale(scaleId).applyOptions({ mode: isLogScale ? 1 : 0 });
  }, [isLogScale, locked]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !chartTheme) return;
    const derived = getDerivedThemeColors(chartTheme);
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.bgColor },
        textColor: derived.textColor,
        fontSize: 10
      },
      timeScale: { borderColor: derived.borderColor },
      rightPriceScale: { borderColor: derived.borderColor },
      leftPriceScale: { borderColor: 'transparent' },
      crosshair: {
        vertLine: { color: derived.crosshairColor, labelBackgroundColor: derived.borderColor },
        horzLine: { color: derived.crosshairColor, labelBackgroundColor: derived.borderColor },
      },
    });
    if (chartType === 'candle') {
      (series as ISeriesApi<'Candlestick'>).applyOptions({
        upColor: chartTheme.upColor,
        downColor: chartTheme.downColor,
        borderUpColor: chartTheme.upColor,
        borderDownColor: chartTheme.downColor,
        wickUpColor: chartTheme.upColor,
        wickDownColor: chartTheme.downColor,
      });
    } else {
      (series as ISeriesApi<'Line'>).applyOptions({ color: chartTheme.upColor });
    }
    // (RSI 캔들 색은 rsiSettings가 관리 — 테마로 덮어쓰지 않음)
  }, [chartTheme, chartType, drawingStorageKey, variant, locked]);

  // 드로잉 툴 활성 or 드로잉 선택 중에는 차트 스크롤/줌 비활성화
  useEffect(() => {
    const host = hostRef.current;
    const chart = chartRef.current;
    if (!host || !chart) return;
    const blockScroll = !!activeTool || !!selectedDrawingId;
    host.style.cursor = activeTool ? 'crosshair' : '';
    chart.applyOptions({
      handleScroll: blockScroll ? false : !locked,
      handleScale: blockScroll ? false : !locked,
    });
  }, [activeTool, selectedDrawingId, locked]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;
    // 캔들이 비면(종목/TF 변경 등) 차트를 즉시 비운다 — 안 그러면 early-return으로 이전 종목 캔들이
    // 캔버스에 남아 새 데이터 도착 전까지 "이전 종목 잔상"으로 보인다.
    if (!candles.length) {
      seriesRef.current.setData([]);
      volSeriesRef.current?.setData([]);
      rsiSeriesRef.current?.setData([]);
      rsiLastCountRef.current = 0;
      rsiLastTimeRef.current = null;
      Object.values(maSeriesMapRef.current).forEach(s => s.setData([]));
      if (bbSeriesRef.current) {
        bbSeriesRef.current.upper.setData([]);
        bbSeriesRef.current.middle.setData([]);
        bbSeriesRef.current.lower.setData([]);
        bbSeriesRef.current.overlay.update([], 'rgba(0,0,0,0)');
      }
      lastCandleCountRef.current = 0;
      lastCandleTimeRef.current = null;
      return;
    }

    const formattedData = chartType === 'line'
      ? candles.map(c => ({ time: toChartTime(c.time), value: c.close }))
      : candles.map(c => ({ time: toChartTime(c.time), open: c.open, high: c.high, low: c.low, close: c.close }));

    // MA는 인덱스(슬롯)로 키잉 — 기간 편집·중복 기간·종류(SMA/EMA/WMA)를 안전히 지원(useIndicators와 동일 키).
    const maDataMap: Record<number, LineData<Time>[]> = {};
    if (maSettings) {
      const closes = candles.map(c => c.close);
      maSettings.forEach((ma, idx) => {
        const vals = computeMA(closes, ma.period, ma.type ?? 'SMA');
        const data: LineData<Time>[] = [];
        for (let i = 0; i < candles.length; i++) {
          if (vals[i] != null) data.push({ time: toChartTime(candles[i].time), value: vals[i] as number });
        }
        maDataMap[idx] = data;
      });
    }

    const bbData: {
      upper: LineData<Time>[];
      middle: LineData<Time>[];
      lower: LineData<Time>[];
      overlayData: BBData[];
    } = { upper: [], middle: [], lower: [], overlayData: [] };
    if (bbSetting) {
      // 날봉(d), 주봉(w), 월봉(mo)인지 확인 (props의 period 활용)
      const pLower = period ? period.toLowerCase() : '';
      const isDailyOrAbove = pLower.endsWith('d') || pLower.endsWith('w') || pLower.endsWith('mo');
      const { period: bbPeriod, multiplier } = bbSetting;
      
      let sum = 0;
      let logSum = 0;
      for (let i = 0; i < candles.length; i++) {
        const cPrice = candles[i].close;
        sum += cPrice;
        if (isDailyOrAbove) logSum += Math.log(cPrice);
        
        if (i >= bbPeriod) {
          sum -= candles[i - bbPeriod].close;
          if (isDailyOrAbove) logSum -= Math.log(candles[i - bbPeriod].close);
        }
        
        if (i >= bbPeriod - 1) {
          const sma = sum / bbPeriod;
          let upperVal = 0;
          let lowerVal = 0;
          
          if (isDailyOrAbove) {
            const logSma = logSum / bbPeriod;
            let logVarSum = 0;
            for (let j = 0; j < bbPeriod; j++) {
              logVarSum += Math.pow(Math.log(candles[i - j].close) - logSma, 2);
            }
            const logStdDev = Math.sqrt(logVarSum / bbPeriod);
            upperVal = sma * Math.exp(multiplier * logStdDev);
            lowerVal = sma / Math.exp(multiplier * logStdDev);
          } else {
            let varianceSum = 0;
            for (let j = 0; j < bbPeriod; j++) {
              varianceSum += Math.pow(candles[i - j].close - sma, 2);
            }
            const stdDev = Math.sqrt(varianceSum / bbPeriod);
            upperVal = sma + (multiplier * stdDev);
            lowerVal = sma - (multiplier * stdDev);
          }
          const t = toChartTime(candles[i].time);
          
          bbData.upper.push({ time: t, value: upperVal });
          bbData.middle.push({ time: t, value: sma });
          bbData.lower.push({ time: t, value: lowerVal });
          bbData.overlayData.push({ time: t, upper: upperVal, lower: lowerVal });
        }
      }
    }

    const series = seriesRef.current;
    const maSeriesMap = maSeriesMapRef.current;
    const bbSeries = bbSeriesRef.current;
    const timeScale = chartRef.current.timeScale();
    const prevCount = lastCandleCountRef.current;
    const newCount = candles.length;
    const addedCount = newCount - prevCount;

    const isFirstLoad = prevCount === 0;
    const isPrepending = prevCount > 0 && addedCount > 0 && formattedData[newCount - 1].time === lastCandleTimeRef.current;
    const isAppendingSingle = addedCount === 1 && (newCount < 2 || formattedData[newCount - 2]?.time === lastCandleTimeRef.current);
    const isUpdatingLast = addedCount === 0 && formattedData[newCount - 1]?.time === lastCandleTimeRef.current;

    if (isFirstLoad) {
      series.setData(formattedData);
      Object.keys(maSeriesMap).forEach(p => {
        const pd = Number(p);
        maSeriesMap[pd].setData(maDataMap[pd] || []);
      });
      if (bbSeries) {
        bbSeries.upper.setData(bbData.upper);
        bbSeries.middle.setData(bbData.middle);
        bbSeries.lower.setData(bbData.lower);
        const fillBase = bbSetting?.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting?.fillColor || '#3182f6';
        bbSeries.overlay.update(bbSetting?.show ? bbData.overlayData : [], hexToRgba(fillBase, bbSetting?.fillOpacity ?? 10));
      }
      // 미뤄둔 가격축 복원을 새 데이터와 함께 적용(전환 직후 옛 캔들에 스냅되는 2단계 방지)
      if (pendingAutoScaleRef.current) {
        try { chartRef.current?.priceScale(locked ? 'left' : 'right').applyOptions({ autoScale: true }); } catch { /* 무시 */ }
        pendingAutoScaleRef.current = false;
      }
      // solo 뷰 유지 중이면 최근봉으로 점프 안 함 — 부모 훅이 직전 시간범위를 복원한다(안 그러면 튕김).
      if (focusRef.current) applyFocusRange(); else if (!soloPreserveRef.current) showRecentBars(newCount);
    } else if (isPrepending) {
      const logicalRange = timeScale.getVisibleLogicalRange();
      series.setData(formattedData);
      Object.keys(maSeriesMap).forEach(p => {
        const pd = Number(p);
        maSeriesMap[pd].setData(maDataMap[pd] || []);
      });
      if (bbSeries) {
        bbSeries.upper.setData(bbData.upper);
        bbSeries.middle.setData(bbData.middle);
        bbSeries.lower.setData(bbData.lower);
        const fillBase = bbSetting?.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting?.fillColor || '#3182f6';
        bbSeries.overlay.update(bbSetting?.show ? bbData.overlayData : [], hexToRgba(fillBase, bbSetting?.fillOpacity ?? 10));
      }
      // focus 중이면 현재 캔들 기준으로 다시 계산해 적용(인덱스 시프트 불필요).
      if (focusRef.current) {
        applyFocusRange();
      } else if (logicalRange) {
        timeScale.setVisibleLogicalRange({ from: logicalRange.from + addedCount, to: logicalRange.to + addedCount });
      }
    } else if (isAppendingSingle || isUpdatingLast) {
      series.update(formattedData[newCount - 1]);
      Object.keys(maSeriesMap).forEach(p => {
        const pd = Number(p);
        if (maDataMap[pd]?.length) maSeriesMap[pd].update(maDataMap[pd][maDataMap[pd].length - 1]);
      });
      if (bbSeries && bbData.upper.length) {
        bbSeries.upper.update(bbData.upper[bbData.upper.length - 1]);
        bbSeries.middle.update(bbData.middle[bbData.middle.length - 1]);
        bbSeries.lower.update(bbData.lower[bbData.lower.length - 1]);
        const fillBase = bbSetting?.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting?.fillColor || '#3182f6';
        bbSeries.overlay.update(bbSetting?.show ? bbData.overlayData : [], hexToRgba(fillBase, bbSetting?.fillOpacity ?? 10));
      }
    } else {
      // prepend/append로 분류되지 않는 갱신(예: 과거 로드+새봉 동시). 사용자가 과거를 보는 중이면
      // 시간 구간을 보존해 현재로 튕기지 않게 한다(우측 끝 추종 중일 때만 showRecentBars).
      const beforeLogical = timeScale.getVisibleLogicalRange();
      const beforeTimeRange = timeScale.getVisibleRange();
      const wasAtRightEdge = !beforeLogical || beforeLogical.to >= prevCount - 2;
      series.setData(formattedData);
      Object.keys(maSeriesMap).forEach(p => {
        const pd = Number(p);
        maSeriesMap[pd].setData(maDataMap[pd] || []);
      });
      if (bbSeries) {
        bbSeries.upper.setData(bbData.upper);
        bbSeries.middle.setData(bbData.middle);
        bbSeries.lower.setData(bbData.lower);
        const fillBase = bbSetting?.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting?.fillColor || '#3182f6';
        bbSeries.overlay.update(bbSetting?.show ? bbData.overlayData : [], hexToRgba(fillBase, bbSetting?.fillOpacity ?? 10));
      }
      if (focusRef.current) {
        applyFocusRange();
      } else if (!wasAtRightEdge && beforeTimeRange) {
        try { timeScale.setVisibleRange(beforeTimeRange); } catch { showRecentBars(newCount); }
      } else {
        showRecentBars(newCount);
      }
    }

    lastCandleCountRef.current = newCount;
    lastCandleTimeRef.current = formattedData[newCount - 1].time;

    // 미래 시간축 whitespace 갱신 — 마지막 캔들 이후 N봉의 시점만 추가해 빈 구간 날짜 라벨 표시.
    // 앵커(마지막 캔들 시각+TF)가 바뀔 때만 재생성(매 틱 1000개 setData 낭비 방지).
    if (futureWsSeriesRef.current) {
      const last = candles[newCount - 1];
      const lastUnix = typeof last.time === 'number' ? last.time : Math.floor(new Date(last.time).getTime() / 1000);
      const tf = currentTfSeconds || 86400;
      const anchor = `${lastUnix}|${tf}`;
      if (futureWsAnchorRef.current !== anchor) {
        futureWsAnchorRef.current = anchor;
        const ws: { time: Time }[] = [];
        for (let i = 1; i <= 1000; i++) ws.push({ time: toChartTime(lastUnix + i * tf) });
        futureWsSeriesRef.current.setData(ws);
      }
    }
  }, [candles, chartType]);

  // 거래량 히스토그램 — 캔들/테마 바뀔 때만 색·값 갱신(메인 데이터 effect와 분리: TF 전환 시
  // 옛 캔들로 재프레이밍되는 깜빡임 방지). 비면 클리어.
  // 실시간 틱(1봉 추가/마지막 봉 갱신)은 캔들 시리즈처럼 update()로 마지막 막대만 —
  // 매 틱 전체 setData(최대 1만봉 재구성)로 인한 프레임 드랍 방지. 전체 setData는
  // 히스토리 교체(첫 로드·prepend·종목/TF 전환)와 테마 변경 때만.
  const volLastCountRef = useRef(0);
  const volLastTimeRef = useRef<Time | null>(null);
  const volThemeKeyRef = useRef('');
  useEffect(() => {
    if (!volSeriesRef.current) return;
    if (!candles.length) {
      volSeriesRef.current.setData([]);
      volLastCountRef.current = 0;
      volLastTimeRef.current = null;
      return;
    }
    const volUp = volColorFromHex(chartTheme?.upColor, VOL_UP_COLOR);
    const volDown = volColorFromHex(chartTheme?.downColor, VOL_DOWN_COLOR);
    const themeKey = `${volUp}|${volDown}`;
    const toBar = (c: typeof candles[number]) => (
      { time: toChartTime(c.time), value: c.volume, color: c.close >= c.open ? volUp : volDown }
    );
    const prevCount = volLastCountRef.current;
    const newCount = candles.length;
    const addedCount = newCount - prevCount;
    const lastTime = toChartTime(candles[newCount - 1].time);
    // 메인 캔들 effect의 분기 판별과 동일 기준(마지막 봉 time 연속성)
    const isAppendingSingle = addedCount === 1
      && (newCount < 2 || toChartTime(candles[newCount - 2].time) === volLastTimeRef.current);
    const isUpdatingLast = addedCount === 0 && lastTime === volLastTimeRef.current;
    if (volThemeKeyRef.current === themeKey && prevCount > 0 && (isAppendingSingle || isUpdatingLast)) {
      // 시리즈 실데이터와 ref 추적이 어긋난 경우(차트 재생성 등) update가 던질 수 있음 → 전체 setData 폴백
      try {
        volSeriesRef.current.update(toBar(candles[newCount - 1]));
      } catch {
        volSeriesRef.current.setData(candles.map(toBar));
      }
    } else {
      volSeriesRef.current.setData(candles.map(toBar));
    }
    volThemeKeyRef.current = themeKey;
    volLastCountRef.current = newCount;
    volLastTimeRef.current = lastTime;
  }, [candles, chartTheme]);

  // RSI 캔들 데이터 — candles 변경마다 그림(시리즈 있을 때만). 실시간은 마지막 봉만 update.
  useEffect(() => {
    if (!rsiSeriesRef.current) return;
    drawRsi(candles);
  }, [candles, drawRsi]);


  useAutoPatterns({
    candles,
    pivotSetting,
    chartType,
    isLogScale,
    tickDecimals,
    chartTheme,
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
  });


  // 가격/카운트다운 라벨 상태 갱신.
  // 위치 계산은 PriceTagOverlay(차트 페인트와 동기)가 하므로 여기선 표시할
  // "값"(가격·색·카운트다운 텍스트)만 주기적으로 만들어 넣고 리페인트를 유도한다.
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

  // ── 신뢰도 랭킹 선 (임시) — 스캐너 산출 JSON을 읽어 체급별 priceLine 토글 ──
  const [rankData, setRankData] = useState<Record<string, RankLine[]> | null>(null);
  const rankOn = rankTiersOn ?? {};

  useEffect(() => {
    let alive = true;
    setRankData(null);
    if (!symbol) return;
    fetch(`${import.meta.env.BASE_URL}baseline_rank_${symbol}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.tiers) setRankData(j.tiers); })
      .catch(() => {});
    return () => { alive = false; };
  }, [symbol]);

  useEffect(() => {
    // 신뢰선 — SMC 오버레이 캔버스(ChartOverlay)에 위임. 좌표계·시작점 스냅·우측 라벨 전부 SMC와 동일.
    const ov = overlayRef.current;
    if (!ov) return;
    const key = JSON.stringify(rankOn) + (rankData ? '1' : '0');
    if ((ov as any).__rankKey === key) return;
    (ov as any).__rankKey = key;
    const list = !rankData
      ? []
      : (RANK_TIERS as readonly string[]).flatMap(tier =>
          rankOn[tier]
            ? (rankData[tier] ?? []).map(l => ({ tier: tier as any, price: l.price, priceLo: (l as any).priceLo, priceHi: (l as any).priceHi, count: (l as any).count, score: l.score, from: Number(l.from ?? 0) }))
            : []);
    ov.updateRankLines(list);
  });

  return (
    <div className={`chart-container-relative ${className}`} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={hostRef} className="chart-host" style={{ width: '100%', height: '100%' }} />
      <div 
        ref={countdownRef} 
        style={{ 
          position: 'absolute', display: 'none', 
          fontWeight: 400, 
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start',
          borderTopRightRadius: '1px', borderBottomLeftRadius: '0px', borderBottomRightRadius: '1px',
          boxSizing: 'border-box',
          pointerEvents: 'none', zIndex: 20, fontVariantNumeric: 'tabular-nums' 
        }} 
      />
      {selectedDrawingId && !onDrawingSelect && (
        <button
          className="drawing-delete-float"
          onClick={() => {
            const manager = drawingManagerRef.current;
            if (manager && selectedDrawingId) {
              manager.removeDrawing(selectedDrawingId);
              setSelectedDrawingId(null);
              selectedDrawingIdRef.current = null;
            }
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          삭제
        </button>
      )}
      {onLogScaleToggle && (
        <button
          className={`chart-log-btn ${isLogScale ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); onLogScaleToggle(); }}
        >
          L
        </button>
      )}
    </div>
  );
});

export default MarketChart;
