import type { Dispatch, SetStateAction } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import MarketChart from '../../../chart/MarketChart';
import type { IndicatorLayer, TFKey, OBOptions } from '../../../chart/overlays/ChartOverlay';
import type { useMtfCandles } from '../../../chart/hooks/useMtfCandles';
import type { Candle } from '../../../shared/types/market';
import { getIntervalSeconds, type Tf } from '../lib/timeframes';
import type { useDesktopCandles } from '../hooks/useDesktopCandles';
import type { DrawingState } from '../hooks/useDrawingState';
import type { IndicatorState } from '../hooks/useIndicatorState';
import type { ChartViewState } from '../hooks/useChartViewState';
import type { ChartRef, ChartSel, RankGroup, RsiGroup, SoloGroup } from './chartProps';
import { DrawingFloatBar } from './drawing/DrawingFloatBar';
import { DrawingSettings } from './drawing/DrawingSettings';
import { RsiSettingsPanel } from './RsiSettingsPanel';

export type ChartDataGroup = {
  candles: Candle[];
  timeframe: Tf;
  loadedSymbol: string | null | undefined;
  handleVisibleRangeChange: ReturnType<typeof useDesktopCandles>['handleVisibleRangeChange'];
  mtfCandles: ReturnType<typeof useMtfCandles>['mtfCandles'];
  mtfSymbol: ReturnType<typeof useMtfCandles>['mtfSymbol'];
  chartTickDecimals: number;
  obOptions: OBOptions;
};

// 차트 무대 — 드로잉 플로팅바·설정, RSI 설정 패널, OHLC 오버레이, MarketChart. DesktopApp에서 JSX만 옮김 (wp-06 d04b).
export function ChartStage({ draw, indi, view, rsi, rank, solo, data, sel, user, webChartRef, ohlc, setHoveredCandle, fmtPx, fmtVol }: {
  draw: DrawingState;
  indi: IndicatorState;
  view: ChartViewState;
  rsi: RsiGroup;
  rank: RankGroup;
  solo: SoloGroup;
  data: ChartDataGroup;
  sel: ChartSel & { productType: string | undefined };
  user: AuthUser | null;
  webChartRef: ChartRef;
  ohlc: Candle | undefined;
  setHoveredCandle: Dispatch<SetStateAction<Candle | null>>;
  fmtPx: (n: number | null | undefined) => string;
  fmtVol: (n: number) => string;
}) {
  const { drawTool, setDrawTool, setDrawHistory, selDrawId, setSelDrawId, drawSettingsOpen, setDrawSettingsOpen, magnetOn } = draw;
  const { effIndicatorSettings, effMaSettings, effBbSetting, effPivotSetting } = indi;
  const { effChartTheme, isLogScale, priceLineOn } = view;
  const { rsiOn, rsiSettings, setRsiSettings, rsiSettingsOpen, setRsiSettingsOpen } = rsi;
  const { rankMasterOn, rankTiers } = rank;
  const { soloOn, focusTracker, highlightTracker } = solo;
  const { candles, timeframe, loadedSymbol, handleVisibleRangeChange, mtfCandles, mtfSymbol, chartTickDecimals, obOptions } = data;
  const CHART_SYMBOL = sel.symbol;
  const CHART_PRODUCT = sel.productType;
  const chartSel = sel;
  return (
                <div className="chart-stage">
                  {/* 드로잉 플로팅 툴바 + 설정 다이얼로그 — 도형 선택 시 */}
                  {selDrawId && (
                    <DrawingFloatBar
                      getManager={() => webChartRef.current?.getDrawingManager()}
                      selectedId={selDrawId}
                      onOpenSettings={() => setDrawSettingsOpen(true)}
                    />
                  )}
                  {selDrawId && drawSettingsOpen && (
                    <DrawingSettings
                      getManager={() => webChartRef.current?.getDrawingManager()}
                      drawingId={selDrawId}
                      onClose={() => setDrawSettingsOpen(false)}
                    />
                  )}
                  {rsiSettingsOpen && (
                    <RsiSettingsPanel
                      settings={rsiSettings}
                      onChange={setRsiSettings}
                      onClose={() => setRsiSettingsOpen(false)}
                    />
                  )}
                  {/* OHLC 오버레이 — 크로스헤어가 가리키는 캔들(없으면 마지막) */}
                  {ohlc && (
                    <div className="chart-overlay-ohlc">
                      <div className="ohlc-values-row">
                        <span>시 <em>{fmtPx(ohlc.open)}</em></span>
                        <span>고 <em>{fmtPx(ohlc.high)}</em></span>
                        <span>저 <em>{fmtPx(ohlc.low)}</em></span>
                        <span>종 <em>{fmtPx(ohlc.close)}</em></span>
                      </div>
                      {(() => {
                        const ch = ohlc.close - ohlc.open;
                        const chPct = ohlc.open ? (ch / ohlc.open) * 100 : 0;
                        const up = ch >= 0;
                        return (
                          <div className="ohlc-change-row">
                            <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                              {up ? '+' : ''}{fmtPx(ch)} ({up ? '+' : ''}{chPct.toFixed(2)}%)
                            </span>
                            <span className="ohlc-vol">거래량 {fmtVol(ohlc.volume)}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* lightweight-charts (모바일 MarketChart 재사용) */}
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <MarketChart
                      ref={webChartRef}
                      candles={candles}
                      symbol={CHART_SYMBOL}
                      period={timeframe.value}
                      activeTool={drawTool}
                      magnet={magnetOn}
                      onToolChange={setDrawTool}
                      onHistoryChange={setDrawHistory}
                      onDrawingSelect={(id) => { setSelDrawId(id); if (!id) setDrawSettingsOpen(false); }}
                      drawingStorageKey={user ? `web_${chartSel.exchange}_${CHART_SYMBOL}` : undefined}
                      marketKey={`${chartSel.exchange}-${CHART_PRODUCT ?? 'spot'}`}
                      variant="dark"
                      isLogScale={isLogScale}
                      showPriceLine={priceLineOn}
                      chartTheme={effChartTheme}
                      tickDecimals={chartTickDecimals}
                      currentTfSeconds={getIntervalSeconds(timeframe.granularity)}
                      focusTracker={soloOn ? focusTracker : null}
                      highlightTracker={highlightTracker}
                      soloDimAll={soloOn}
                      soloPreserve={soloOn}
                      active
                      indicatorSettings={effIndicatorSettings}
                      indicatorLayers={
                        // 지표 데이터(mtfSymbol)가 표시 중인 차트(loadedSymbol)와 일치할 때만 그림 —
                        // 전환 중 옛 지표가 새 차트에 잠깐 얹혀 튀는 것 방지(안정화 후 표시).
                        mtfSymbol === loadedSymbol
                          ? (['1M', '1W', '3D', '1D'] as TFKey[])
                              .filter((tf) => !!mtfCandles[tf])
                              .map((tf) => ({ tf, candles: mtfCandles[tf]! } satisfies IndicatorLayer))
                          : []
                      }
                      obOptions={obOptions}
                      maSettings={effMaSettings}
                      bbSetting={effBbSetting}
                      pivotSetting={effPivotSetting}
                      onCrosshairMove={setHoveredCandle}
                      futureTimeAxis
                      keepDataOnSymbolChange
                      showVolume
                      rankTiersOn={rankMasterOn ? rankTiers : undefined}
                      showRsiCandles={rsiOn}
                      rsiSettings={rsiSettings}
                      onVisibleRangeChange={handleVisibleRangeChange}
                    />
                  </div>
                </div>
  );
}
