import { useEffect, useState, useRef, useMemo } from 'react';
import MarketChart from '../../../chart/MarketChart';
import type { MarketChartRef } from '../../../chart/MarketChart';
import TimeframeSheet from '../components/sheets/TimeframeSheet';
import SymbolSearchSheet from '../components/sheets/SymbolSearchSheet';
import AnalysisHubSheet from '../components/sheets/AnalysisHubSheet';
import ObjectTreeSheet from '../components/sheets/ObjectTreeSheet';
import ChartSettingsSheet, { PRESET_THEMES, getThemeCssVars } from '../../../chart/settings/ChartSettingsSheet';
import DrawingSheet from '../components/sheets/DrawingSheet';
import IndicatorSheet, { DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING, DEFAULT_PIVOT_SETTING } from '../../../chart/indicators/IndicatorSheet';
import type { MASetting, BBSetting, PivotSetting } from '../../../chart/indicators/IndicatorSheet';
import type { IndicatorSettings, IndicatorLayer, TFKey, OBOptions } from '../../../chart/overlays/ChartOverlay';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';
import { useChartTheme } from '../../../chart/hooks/useChartTheme';
import { useMtfCandles } from '../../../chart/hooks/useMtfCandles';
import { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import { useCoinCandles } from '../../../chart/hooks/useCoinCandles';
import PullToRefresh from '../components/PullToRefresh';
import { DEFAULT_OB_OPTIONS } from '../../../chart/analysis/chartIndicators';
import type { Candle } from '../../../types/market';
import type { TrackerState } from '../../../types/bot';
import binanceLogo from '../../../assets/exchanges/binance.svg';
import bitgetLogo from '../../../assets/exchanges/bitget.svg';

type Props = {
  active?: boolean; // 차트 화면이 떠 있을 때만 실시간 캔들 구독·카운트다운 타이머 작동
  symbol: string;
  onSelectSymbol: (symbol: string) => void;
  productType?: string;
  exchange?: 'BITGET' | 'BINANCE';
  tickDecimals?: number;
  onExchangeChange?: (exchange: 'BITGET' | 'BINANCE') => void;
  onProductTypeChange?: (productType: string | undefined) => void;
  onOpenTrade?: () => void;
  focusTracker?: TrackerState | null;
};

function formatPrice(price: number, decimals: number) {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type TimeframeOption = {
  label: string;
  value: string;
  granularity: string;
  channel: string;
  category: 'min' | 'hour' | 'day' | 'week' | 'month';
};

const CHART_TIMEFRAMES: Record<'30m' | '1h' | '4h' | '1d', TimeframeOption> = {
  '30m': { label: '30분', value: '30m', granularity: '30m', channel: 'candle30m', category: 'min' },
  '1h': { label: '1시간', value: '1h', granularity: '1h', channel: 'candle1H', category: 'hour' },
  '4h': { label: '4시간', value: '4h', granularity: '4h', channel: 'candle4H', category: 'hour' },
  '1d': { label: '1일', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' },
};

const CHART_PATTERN_CANDLE_LIMIT = 1200;
const DEFAULT_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_MIN_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_MAX_CANDLE_LIMIT = CHART_PATTERN_CANDLE_LIMIT;
const FOCUS_PIVOT_CONTEXT_BARS = 80;

function timeframeForTracker(tracker?: TrackerState | null): TimeframeOption | null {
  const kind = tracker?.monitorKind ?? '';
  if (kind.endsWith('_30m')) return CHART_TIMEFRAMES['30m'];
  if (kind.endsWith('_1h')) return CHART_TIMEFRAMES['1h'];
  if (kind.endsWith('_4h')) return CHART_TIMEFRAMES['4h'];
  if (kind.endsWith('_1d')) return CHART_TIMEFRAMES['1d'];
  return null;
}

const fallbackCandles: Candle[] = [
  { time: 1767225600, open: 43000, high: 49200, low: 38500, close: 46700, volume: 10 },
  { time: 1769817600, open: 46700, high: 53000, low: 45100, close: 52000, volume: 10 },
  { time: 1772236800, open: 52000, high: 61000, low: 50100, close: 59800, volume: 10 },
  { time: 1774915200, open: 59800, high: 68000, low: 58600, close: 66400, volume: 10 },
  { time: 1777507200, open: 66400, high: 77000, low: 64200, close: 76791, volume: 10 }
];

function getBaseSymbol(symbol: string) {
  return symbol.replace(/(USDT|USDC)$/i, '');
}

function getChartLogoUrl(baseSymbol: string) {
  const officialLogos: Record<string, string> = {
    BTC: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
    ETH: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
    XRP: 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
    SOL: 'https://assets.coingecko.com/coins/images/4128/large/solana.png',
    DOGE: 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png',
    ADA: 'https://assets.coingecko.com/coins/images/975/large/cardano.png',
    AVAX: 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png',
    DOT: 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png',
    LINK: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png',
    TRX: 'https://assets.coingecko.com/coins/images/1094/large/tron-logo.png'
  };
  return officialLogos[baseSymbol] ||
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${baseSymbol.toLowerCase()}.png`;
}

function getChartLogoColor(symbol: string) {
  const colors = ['#f59f2f', '#5d6fbd', '#12a594', '#36a3d9', '#3f67ff', '#d6aa32'];
  return colors[symbol.charCodeAt(0) % colors.length];
}

function getIntervalSeconds(granularity: string): number {
  const map: Record<string, number> = {
    '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30min': 1800, '30m': 1800,
    '1h': 3600, '4h': 14400, '6Hutc': 21600, '12Hutc': 43200,
    '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
  };
  return map[granularity] ?? 60;
}

function getFocusCandleLimit(tracker: TrackerState, granularity: string): number {
  const startTime = Number(tracker.xabc?.X?.time ?? tracker.xabc?.A?.time);
  if (!Number.isFinite(startTime) || startTime <= 0) return FOCUS_MIN_CANDLE_LIMIT;

  const intervalSec = getIntervalSeconds(granularity);
  const nowSec = Math.floor(Date.now() / 1000);
  const barsFromStart = Math.max(1, Math.ceil((nowSec - startTime) / intervalSec) + 1);
  const needed = barsFromStart + FOCUS_PIVOT_CONTEXT_BARS;
  return Math.min(FOCUS_MAX_CANDLE_LIMIT, Math.max(FOCUS_MIN_CANDLE_LIMIT, needed));
}

function getBucketTime(timestamp: number, granularity: string): number {
  const seconds = timestamp;
  switch (granularity) {
    case '1min':  return Math.floor(seconds / 60) * 60;
    case '3min':  return Math.floor(seconds / 180) * 180;
    case '5min':  return Math.floor(seconds / 300) * 300;
    case '15min': return Math.floor(seconds / 900) * 900;
    case '30m':
    case '30min': return Math.floor(seconds / 1800) * 1800;
    case '1h':    return Math.floor(seconds / 3600) * 3600;
    case '4h':    return Math.floor(seconds / 14400) * 14400;
    case '6h':
    case '6Hutc': return Math.floor(seconds / 21600) * 21600;
    case '12h':
    case '12Hutc':return Math.floor(seconds / 43200) * 43200;
    case '1Dutc': return Math.floor(seconds / 86400) * 86400;
    case '3Dutc': return Math.floor(seconds / 259200) * 259200;
    case '1Wutc': {
      const date = new Date(seconds * 1000);
      const day = date.getUTCDay();
      const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
      return Math.floor(monday.getTime() / 1000);
    }
    case '1Mutc': {
      const date = new Date(seconds * 1000);
      const firstDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      return Math.floor(firstDay.getTime() / 1000);
    }
    default: return Math.floor(seconds / 60) * 60;
  }
}

export default function CoinChartPage({ active = true, symbol, onSelectSymbol, productType, exchange = 'BITGET', tickDecimals = 2, onExchangeChange, onProductTypeChange, focusTracker }: Props) {
  const isBinance = exchange === 'BINANCE';

  const handleSelectFixed = (sym: string, ex: 'BITGET' | 'BINANCE', futures: boolean) => {
    onSelectSymbol(sym);
    onExchangeChange?.(ex);
    onProductTypeChange?.(futures ? 'USDT-FUTURES' : undefined);
  };
  const isFutures = !!productType;
  
  const { precisionMap, getTickDecimals } = usePricePrecision(tickDecimals);
  const actualTickDecimals = useMemo(() => {
    if (precisionMap.size === 0) return tickDecimals;
    const key = (isBinance && isFutures) ? 'BN_' + symbol : symbol;
    return getTickDecimals(key);
  }, [getTickDecimals, precisionMap, isBinance, isFutures, symbol, tickDecimals]);

  const loadCandles = useCandleLoader({ symbol, productType, exchange });
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  const [timeframe, setTimeframe] = useState<TimeframeOption>({ label: '1일', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' });
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSymbolSheetOpen, setIsSymbolSearchOpen] = useState(false);
  const [isLogScale, setIsLogScale] = usePersistentState('chart_log_scale', true);

  // 드로잉
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isDrawingPanelOpen, setIsDrawingPanelOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAnalysisHubOpen, setIsAnalysisHubOpen] = useState(false);
  const [isObjectTreeOpen, setIsObjectTreeOpen] = useState(false);
  const chartRef = useRef<MarketChartRef>(null);

  // 보조지표
  const [isIndicatorSheetOpen, setIsIndicatorSheetOpen] = useState(false);
  // 지표 on/off 상태를 종목 이동·새로고침에도 유지 (전역 공통)
  const [indicatorSettings, setIndicatorSettings] = usePersistentState<IndicatorSettings>('chart_indicators', {
    '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  }, true);
  const { mtfCandles } = useMtfCandles(symbol, indicatorSettings, loadCandles);
  const [obOptions] = useState<OBOptions>(DEFAULT_OB_OPTIONS);

  // 차트 테마 (localStorage 우선, 쿠키 폴백)
  const [chartTheme, setChartTheme] = useChartTheme(PRESET_THEMES[0]);

  const [maSettings, setMaSettings] = usePersistentState<MASetting[]>('chart_ma_settings', DEFAULT_MA_SETTINGS);
  const [bbSetting, setBbSetting] = usePersistentState<BBSetting>('chart_bb_setting', DEFAULT_BB_SETTING, true);
  const [pivotSetting, setPivotSetting] = usePersistentState<PivotSetting>('chart_pivot_setting', DEFAULT_PIVOT_SETTING, true);
  const initialCandleLimit = useMemo(() => {
    if (!focusTracker) return DEFAULT_CANDLE_LIMIT;
    const focusTimeframe = timeframeForTracker(focusTracker) ?? timeframe;
    return getFocusCandleLimit(focusTracker, focusTimeframe.granularity);
  }, [focusTracker, timeframe]);

  const { candles, livePrice, dailyOpenPrice, clearCandles, refreshCandles, handleVisibleRangeChange } = useCoinCandles({
    symbol,
    productType,
    isBinance,
    isFutures,
    timeframe,
    loadCandles,
    fallbackCandles,
    getBucketTime,
    initialLimit: initialCandleLimit,
    active,
    clearOnSymbolChange: false, // 종목 전환 시 새 캔들 도착까지 이전 캔들 유지 — 빈 차트 플래시 방지(웹과 동일)
  });

  const changeAbs = livePrice !== null && dailyOpenPrice !== null ? livePrice - dailyOpenPrice : null;
  const changePercent = livePrice !== null && dailyOpenPrice !== null ? ((livePrice - dailyOpenPrice) / dailyOpenPrice) * 100 : null;
  const isUp = changePercent !== null ? changePercent >= 0 : null;
  const displayedCandle = hoveredCandle || candles[candles.length - 1];
  const baseSymbol = getBaseSymbol(symbol);

  // 트래커로 진입 시 그 패턴 TF로 한 번만 이동. 이후 수동 TF 변경은 되돌리지 않는다.
  // (deps에 timeframe.value가 있어 수동 변경 때 재실행되던 것 → 같은 focusTracker엔 1회만 적용)
  const appliedFocusTfKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTracker || focusTracker.symbol !== symbol) return;
    const focusKey = `${focusTracker.symbol}|${(focusTracker as any).signature ?? focusTracker.obTime}`;
    if (appliedFocusTfKeyRef.current === focusKey) return; // 이 트래커 TF 이미 적용함
    appliedFocusTfKeyRef.current = focusKey;
    const nextTimeframe = timeframeForTracker(focusTracker);
    if (!nextTimeframe || nextTimeframe.value === timeframe.value) return;
    clearCandles();
    setTimeframe(nextTimeframe);
  }, [clearCandles, focusTracker, symbol, timeframe.value]);

  // 클릭 강조(M-H5): 트래커로 진입하면 그 패턴 강조 on. 수동 TF 변경·당겨서 새로고침 시 off(종목 변경은 symbol 불일치로 자동).
  const [highlightActive, setHighlightActive] = useState(true);
  const lastHlKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTracker || focusTracker.symbol !== symbol) return;
    const k = `${focusTracker.symbol}|${(focusTracker as any).signature ?? focusTracker.obTime}`;
    if (lastHlKeyRef.current === k) return; // 같은 트래커 재실행 무시
    lastHlKeyRef.current = k;
    setHighlightActive(true);
  }, [focusTracker, symbol]);
  const highlightTracker = highlightActive && focusTracker?.symbol === symbol ? focusTracker : null;

  // 카드 클릭 시 해당 패턴 시간창으로 차트를 한 번 이동시킨다.
  // 패턴 자체는 자동 하모닉 지표가 그리고, 여기선 가시 영역만 맞춘다.
  // 라이브 캔들 갱신마다 다시 튀지 않도록 패턴 키가 바뀔 때만 스크롤한다.
  const lastFocusKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTracker || focusTracker.symbol !== symbol || !candles.length) return;
    if (!highlightActive) return; // 수동 TF 변경(강조 off) 후엔 패턴 창으로 재스크롤하지 않음 — 하위 TF에서 옛 패턴 시작점으로 튀는 버그 방지
    const x = focusTracker.xabc;
    if (!x) return;
    const startT = x.X?.time ?? x.A?.time;
    // 워커 xabc엔 D가 없음(예측 PRZ). 탐색(미터치)은 예측 D가 현재 근처에 그려지므로
    // 프레임 끝을 "마지막 캔들"까지 잡아 PRZ가 화면 밖으로 잘리지 않게 한다.
    const lastT = Number(candles[candles.length - 1].time);
    const frameEndT = focusTracker.exitTime ?? focusTracker.przHitTime ?? lastT;
    // 키는 패턴 식별용으로 "안정적인" 끝(C 또는 종료/신호 시각)을 쓴다 — 매 봉 lastT 변화로
    // 화면이 다시 튀지 않게. (signature는 종목 내 모든 패턴이 공유하므로 키에 못 씀)
    const anchorEndT = focusTracker.exitTime ?? focusTracker.przHitTime ?? x.C?.time;
    if (!startT || !anchorEndT) return;
    const key = `${focusTracker.symbol}|${timeframe.value}|${startT}|${anchorEndT}`;
    if (lastFocusKeyRef.current === key) return;
    lastFocusKeyRef.current = key;
    // 패턴 시간 창을 넘기면 MarketChart가 현재 캔들 기준으로 인덱스를 계산해 맞춘다.
    chartRef.current?.focusTimeWindow(startT, frameEndT, 0.2);
  }, [candles, focusTracker, symbol, timeframe.value, highlightActive]);

  function handleToolSelect(toolType: string | null) {
    setActiveTool(toolType);
  }

  return (
    <PullToRefresh onRefresh={async () => { setHighlightActive(false); await refreshCandles(); requestAnimationFrame(() => chartRef.current?.resetView()); }} excludeSelector=".chart-only-surface" indicatorTop="env(safe-area-inset-top, 0px)" fill>
    <main className="coin-chart-page" style={getThemeCssVars(chartTheme)}>
      <header className="chart-symbol-bar">
        <div className="chart-symbol-main">
          <div className="chart-symbol-left">
            <span className="chart-coin-logo" style={{ background: getChartLogoColor(baseSymbol) }}>
              <span className="chart-coin-logo-fallback">{baseSymbol.slice(0, 1)}</span>
              <img
                src={getChartLogoUrl(baseSymbol)}
                alt={baseSymbol}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </span>
            <span className="chart-symbol-name">{productType ? `${symbol}.P` : symbol}</span>
            <span className={`chart-exchange-badge ${isBinance ? 'is-binance' : 'is-bitget'}`}>
              <img className="chart-exchange-logo" src={isBinance ? binanceLogo : bitgetLogo} alt="" aria-hidden="true" />
              <span className="chart-exchange-name">{isBinance ? 'Binance' : 'Bitget'}</span>
            </span>
          </div>
        </div>
        <div className="chart-symbol-right">
          <span className="chart-live-price">
            {livePrice ? formatPrice(livePrice, actualTickDecimals) : '—'}
          </span>
          {changeAbs !== null && changePercent !== null && (
            <span className={`chart-change-info ${isUp ? 'up' : 'down'}`}>
              {isUp ? '+' : ''}{formatPrice(changeAbs, actualTickDecimals)} {isUp ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          )}
        </div>
      </header>

      <section className="chart-only-surface" style={{ position: 'relative' }}>
        {displayedCandle && (
          <div className="chart-overlay-ohlc">
            <div className="ohlc-values-row">
              <span>시 <em>{formatPrice(displayedCandle.open, actualTickDecimals)}</em></span>
              <span>고 <em>{formatPrice(displayedCandle.high, actualTickDecimals)}</em></span>
              <span>저 <em>{formatPrice(displayedCandle.low, actualTickDecimals)}</em></span>
              <span>종 <em>{formatPrice(displayedCandle.close, actualTickDecimals)}</em></span>
            </div>
            {(() => {
              const change = displayedCandle.close - displayedCandle.open;
              const changePercent = (change / displayedCandle.open) * 100;
              const isBull = change >= 0;
              return (
                <div className={`ohlc-change-row ${isBull ? 'up' : 'down'}`}>
                  {isBull ? '+' : ''}{formatPrice(change, actualTickDecimals)} ({isBull ? '+' : ''}{changePercent.toFixed(2)}%)
                </div>
              );
            })()}
          </div>
        )}
        <MarketChart
          ref={chartRef}
          candles={candles}
          symbol={symbol}
          period={timeframe.value}
          marketKey={`${exchange}-${productType ?? 'spot'}`}
          variant="light"
          className="full-chart"
          isLogScale={isLogScale}
          showPriceLine
          activeTool={activeTool}
          onToolChange={setActiveTool}
          drawingStorageKey={symbol}
          chartTheme={chartTheme}
          tickDecimals={actualTickDecimals}
          indicatorSettings={indicatorSettings}
          indicatorLayers={
            (['1M', '1W', '3D', '1D'] as TFKey[])
              .filter(tf => !!mtfCandles[tf])
              .map(tf => ({ tf, candles: mtfCandles[tf]! } satisfies IndicatorLayer))
          }
          currentTfSeconds={getIntervalSeconds(timeframe.granularity)}
          active={active}
          obOptions={obOptions}
          onCrosshairMove={setHoveredCandle}
          onVisibleRangeChange={handleVisibleRangeChange}
          onHistoryChange={(status) => {
            setCanUndo(status.canUndo);
            setCanRedo(status.canRedo);
          }}
          maSettings={maSettings}
          bbSetting={bbSetting}
          pivotSetting={pivotSetting}
          focusTracker={focusTracker?.symbol === symbol ? focusTracker : null}
          highlightTracker={highlightTracker}
        />
      </section>

      <DrawingSheet
        isOpen={isDrawingPanelOpen}
        onClose={() => setIsDrawingPanelOpen(false)}
        activeTool={activeTool}
        onSelectTool={handleToolSelect}
        onClearAll={() => chartRef.current?.clearAll()}
      />

      <IndicatorSheet
        isOpen={isIndicatorSheetOpen}
        onClose={() => setIsIndicatorSheetOpen(false)}
        settings={indicatorSettings}
        onChange={setIndicatorSettings}
        maSettings={maSettings}
        onMaSettingsChange={setMaSettings}
        bbSetting={bbSetting}
        onBbSettingChange={setBbSetting}
        pivotSetting={pivotSetting}
        onPivotSettingChange={setPivotSetting}
      />

      <div className="chart-tool-strip">
        <div className="tool-fixed-area">
          <div className="tool-group symbol-time">
            <strong onClick={() => setIsSymbolSearchOpen(true)}>{productType ? `${symbol}.P` : symbol}</strong>
            <span onClick={() => setIsSheetOpen(true)}>{timeframe.label}</span>
          </div>
          <div className="tool-divider tool-divider--flush" />
        </div>

        <div className="tool-icons-wrapper">
          <div className="tool-scroll-container">
            {/* 그리기 */}
            <button
              className={`tool-btn ${isDrawingPanelOpen || (activeTool && activeTool !== 'cursor') ? 'active' : ''}`}
              title="그리기"
              onClick={() => setIsDrawingPanelOpen(prev => !prev)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
                <path d="m15 5 4 4"/>
              </svg>
            </button>


            {/* 보조지표 */}
            <button
              className={`tool-btn ${isIndicatorSheetOpen || Object.values(indicatorSettings).some(s => (s as any).showOB || (s as any).showOBBox || (s as any).showFVG || (s as any).showCE || (s as any).showEQ) ? 'active' : ''}`}
              title="보조지표"
              onClick={() => setIsIndicatorSheetOpen(prev => !prev)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v16h16" strokeWidth="1.5"/>
                <path d="M6.5 15.5 11 11l3 2.2 5-6v8.3z" fill="currentColor" fillOpacity="0.7"/>
              </svg>
            </button>

            {/* 더보기 (분석 허브) */}
            <button className={`tool-btn ${isAnalysisHubOpen ? 'active' : ''}`} title="더보기" onClick={() => setIsAnalysisHubOpen(prev => !prev)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
              </svg>
            </button>

            <div className="tool-divider" />

            {/* 되돌리기 */}
            <button 
              className={`tool-btn history-tool-btn ${!canUndo ? 'disabled' : ''}`} 
              title="되돌리기" 
              onClick={() => chartRef.current?.undo()}
              disabled={!canUndo} 
              aria-disabled={!canUndo}
            >
              <svg width="20" height="20" style={{ transform: 'translateY(-1px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 7.5 4.5 12 9 16.5"/>
                <path d="M4.5 12h8.8c4.1 0 6.2 2.7 6.2 6.2"/>
              </svg>
            </button>

            {/* 전체화면 */}
            <button className="tool-btn" title="전체화면">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H6a3 3 0 0 0-3 3v3"/>
                <path d="M21 9V6a3 3 0 0 0-3-3h-3"/>
                <path d="M3 15v3a3 3 0 0 0 3 3h3"/>
                <path d="M15 21h3a3 3 0 0 0 3-3v-3"/>
              </svg>
            </button>

            {/* 앞으로 */}
            <button 
              className={`tool-btn history-tool-btn ${!canRedo ? 'disabled' : ''}`} 
              title="앞으로" 
              onClick={() => chartRef.current?.redo()}
              disabled={!canRedo} 
              aria-disabled={!canRedo}
            >
              <svg width="20" height="20" style={{ transform: 'translateY(-1px)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 7.5 19.5 12 15 16.5"/>
                <path d="M19.5 12h-8.8c-4.1 0-6.2 2.7-6.2 6.2"/>
              </svg>
            </button>

            <div className="tool-divider" />

            {/* 공유하기 */}
            <button className="tool-btn" title="공유하기">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v6.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V12"/>
                <polyline points="16 7 12 3.5 8 7"/>
                <line x1="12" y1="3.5" x2="12" y2="15"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <TimeframeSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        selectedTimeframe={timeframe.value}
        onSelect={(tf: any) => { setHighlightActive(false); clearCandles(); setTimeframe(tf); }}
      />

      <ChartSettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={chartTheme}
        onThemeChange={setChartTheme}
        isLogScale={isLogScale}
        onLogScaleToggle={() => setIsLogScale(!isLogScale)}
      />

      <AnalysisHubSheet
        isOpen={isAnalysisHubOpen}
        onClose={() => setIsAnalysisHubOpen(false)}
        onOpenIndicators={() => setIsIndicatorSheetOpen(true)}
        onOpenChartSettings={() => setIsSettingsOpen(true)}
        onOpenObjectTree={() => setIsObjectTreeOpen(true)}
      />

      <ObjectTreeSheet
        isOpen={isObjectTreeOpen}
        onClose={() => setIsObjectTreeOpen(false)}
        manager={chartRef.current?.getDrawingManager()}
        onSelectDrawing={(id) => {
          chartRef.current?.selectDrawing(id);
          setIsObjectTreeOpen(false);
        }}
      />

      <SymbolSearchSheet
        isOpen={isSymbolSheetOpen}
        onClose={() => setIsSymbolSearchOpen(false)}
        onSelect={onSelectSymbol}
        onSelectFixed={handleSelectFixed}
        exchange={isBinance ? 'BINANCE' : 'BITGET'}
        isFutures={isFutures}
      />
    </main>
    </PullToRefresh>
  );
}
