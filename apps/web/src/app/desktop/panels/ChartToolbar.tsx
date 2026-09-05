import type { AuthUser } from '../../../api/server/authApi';
import { PRESET_THEMES } from '../../../chart/settings/ChartSettingsSheet';
import SmcSection from '../../../chart/indicators/SmcSection';
import HarmonicSection from '../../../chart/indicators/HarmonicSection';
import AbcSection from '../../../chart/indicators/AbcSection';
import MaSection from '../../../chart/indicators/MaSection';
import BbSection from '../../../chart/indicators/BbSection';
import PivotSection from '../../../chart/indicators/PivotSection';
import ElliottSection from '../../../chart/indicators/ElliottSection';
import { DESKTOP_DRAW_TOOLS } from '../lib/drawTools';
import type { DrawingState } from '../hooks/useDrawingState';
import type { IndicatorState } from '../hooks/useIndicatorState';
import type { ChartViewState } from '../hooks/useChartViewState';
import type { ChartRef, RankGroup, RsiGroup, SoloGroup } from './chartProps';
import { ObjectTree } from './ObjectTree';
import { MiniCandles } from './MiniCandles';
import { Chevron } from './SidebarBits';

// 차트 툴바 — 타임프레임·solo 칩·신뢰선·RSI·캡쳐·그리기/지표/차트설정 드롭다운. DesktopApp에서 JSX만 옮김 (wp-06 d04b).
// 상태는 묶음(draw·indi·view·rsi·rank·solo)으로 받고 첫 줄에서 풀어 쓴다. 본문은 그대로.
export function ChartToolbar({ draw, indi, view, rsi, rank, solo, user, onLoginClick, isAdmin, visibleTFs, chartRef, handleCaptureChart }: {
  draw: DrawingState;
  indi: IndicatorState;
  view: ChartViewState;
  rsi: RsiGroup;
  rank: RankGroup;
  solo: SoloGroup;
  user: AuthUser | null;
  onLoginClick: () => void;
  isAdmin: boolean;
  visibleTFs: string[];
  chartRef: ChartRef;
  handleCaptureChart: () => void;
}) {
  const { drawOpen, setDrawOpen, drawTool, setDrawTool, drawHistory, magnetOn, setMagnetOn, drawRef } = draw;
  const { indiOpen, setIndiOpen, indiRef, indicatorSettings, setIndicatorSettings, maSettings, setMaSettings, bbSetting, setBbSetting, pivotSetting, setPivotSetting, indiGroups, toggleIndiGroup } = indi;
  const { activeTf, setActiveTf, chartSetOpen, setChartSetOpen, chartSetRef, chartTheme, setChartTheme, isCustomTheme, isLogScale, setIsLogScale, priceLineOn, setPriceLineOn } = view;
  const { rsiOn, setRsiOn, setRsiSettingsOpen } = rsi;
  const { rankMasterOn, setRankMasterOn, rankTiers, setRankTiers } = rank;
  const { soloOn, focusTracker, setFocusTracker, setSoloActive, frameForTf, soloUserViewRef } = solo;
  return (
                <div className="chart-toolbar">
                  <div className="tf-bar">
                    {visibleTFs.map((t) => (
                      <button key={t} className={`tf-btn${activeTf === t ? ' active' : ''}`} onClick={() => {
                        if (soloOn) {
                          // 전환 직전 뷰(사용자가 팬/줌했을 수 있는 상태)를 캡처해 TF 넘어가도 유지.
                          const r = chartRef.current?.getVisibleRawTimeRange();
                          if (r) soloUserViewRef.current = r;
                          // setActiveTf보다 먼저 동기 호출 → 새 TF 캔들 도착 시 바로 정위치(튐 방지).
                          frameForTf(t);
                        }
                        setActiveTf(t);
                      }}>{t}</button>
                    ))}
                  </div>
                  {soloOn && (
                    <button
                      className="chart-solo-chip"
                      title="이 패턴만 보기 해제"
                      onClick={() => { setSoloActive(false); setFocusTracker(null); soloUserViewRef.current = null; chartRef.current?.resetPriceAutoScale(); }}
                    >
                      <span className="chart-solo-dot" />
                      {String((focusTracker as any)?.symbol ?? '').replace('USDT', '')} {(focusTracker as any)?.patternName ?? '패턴'} 집중
                      <span className="chart-solo-x">✕</span>
                    </button>
                  )}
                  {user && (
                  <div className="chart-tools">
                    {/* 신뢰선(기준선 랭킹) 토글 — 임시. 켜면 체급 버튼 노출 */}
                    <div className="chart-rsi-group">
                      <button
                        className={`chart-rsi-btn${rankMasterOn ? ' active' : ''}`}
                        aria-label="신뢰선"
                        title="기준선 신뢰도 랭킹 선 (스캐너 산출)"
                        onClick={() => setRankMasterOn((v: boolean) => !v)}
                      >
                        신뢰선
                      </button>
                      {rankMasterOn && (['1M', '1W', '3D', '1d'] as const).map((tier) => (
                        <button
                          key={tier}
                          className={`chart-rsi-btn${rankTiers[tier] ? ' active' : ''}`}
                          style={rankTiers[tier] ? { color: { '1M': '#b07cf0', '1W': '#4fc3f7', '3D': '#e6a23c', '1d': '#66d9a3' }[tier], borderColor: 'currentColor' } : undefined}
                          title={`${tier} 체급 신뢰선`}
                          onClick={() => setRankTiers((prev: Record<string, boolean>) => ({ ...prev, [tier]: !prev[tier] }))}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                    {/* RSI 캔들 토글 — 드로잉 버튼 바로 왼쪽. 켜면 차트 하단 페인에 표시 */}
                    <div className="chart-rsi-group">
                      <button
                        className={`chart-rsi-btn${rsiOn ? ' active' : ''}`}
                        aria-label="RSI 캔들"
                        title="RSI 캔들"
                        onClick={() => setRsiOn((v: boolean) => !v)}
                      >
                        RSI
                      </button>
                      {/* 켜져 있을 때만 설정 톱니 노출 */}
                      {rsiOn && (
                        <button
                          className="chart-rsi-gear"
                          aria-label="RSI 설정"
                          title="RSI 설정"
                          onClick={() => setRsiSettingsOpen(true)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* 차트 캡쳐 — 현재 화면을 PNG로 저장 */}
                    <button
                      className="chart-capture-btn"
                      aria-label="차트 캡쳐"
                      title="차트 캡쳐 (PNG 저장)"
                      onClick={handleCaptureChart}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                    {/* 그리기 도구 드롭다운 — 자체 드로잉 엔진(7종) + 오브젝트 트리 */}
                    <div className="chart-dd" ref={drawRef}>
                      <button
                        className={`chart-gear${drawOpen || drawTool ? ' active' : ''}`}
                        aria-label="그리기 도구"
                        title="그리기 도구"
                        onClick={() => { setDrawOpen((o) => !o); setIndiOpen(false); setChartSetOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="4" y1="20" x2="20" y2="4" />
                          <circle cx="4" cy="20" r="2" fill="currentColor" stroke="none" />
                          <circle cx="20" cy="4" r="2" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                      {drawOpen && (
                        <div className="chart-dd-panel draw-panel">
                          <div className="draw-panel-scroll">
                            <button
                              className={`draw-item${drawTool === null ? ' active' : ''}`}
                              onClick={() => { setDrawTool(null); setDrawOpen(false); }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3l14 9-6.5 1.5L9 20z" /></svg>
                              <span>커서 (그리기 해제)</span>
                            </button>
                            <button
                              className={`draw-item${magnetOn ? ' active' : ''}`}
                              onClick={() => setMagnetOn((v: boolean) => !v)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><path d="M6 3h4v5H6zM14 3h4v5h-4z" fill="currentColor" stroke="none" /></svg>
                              <span>자석 (캔들 OHLC 스냅)</span>
                              <em className="draw-item-state">{magnetOn ? 'ON' : 'OFF'}</em>
                            </button>
                            <div className="draw-sep" />
                            {DESKTOP_DRAW_TOOLS.map((t) => (
                              <button
                                key={t.type}
                                className={`draw-item${drawTool === t.type ? ' active' : ''}`}
                                onClick={() => { setDrawTool(t.type); setDrawOpen(false); }}
                              >
                                {t.icon}
                                <span>{t.name}</span>
                              </button>
                            ))}
                            <div className="draw-sep" />
                            <div className="draw-actions">
                              <button className="draw-act-btn" disabled={!drawHistory.canUndo} onClick={() => chartRef.current?.undo()} title="되돌리기">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 7.5 4.5 12 9 16.5" /><path d="M4.5 12h8.8c4.1 0 6.2 2.7 6.2 6.2" /></svg>
                              </button>
                              <button className="draw-act-btn" disabled={!drawHistory.canRedo} onClick={() => chartRef.current?.redo()} title="다시 실행">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 7.5 19.5 12 15 16.5" /><path d="M19.5 12h-8.8c-4.1 0-6.2 2.7-6.2 6.2" /></svg>
                              </button>
                              <button className="draw-act-btn danger" onClick={() => chartRef.current?.clearAll()} title="모두 삭제">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                              </button>
                            </div>
                            <div className="draw-sep" />
                            <div className="draw-section-title">오브젝트 트리</div>
                            <ObjectTree
                              getManager={() => chartRef.current?.getDrawingManager()}
                              onSelect={(id) => chartRef.current?.selectDrawing(id)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 지표 드롭다운 — 관리자(ADMIN)에게만 노출 */}
                    {isAdmin && (
                    <div className="chart-dd" ref={indiRef}>
                      <button
                        className={`chart-gear${indiOpen ? ' active' : ''}`}
                        aria-label="지표"
                        title="지표"
                        onClick={() => { if (!user) { onLoginClick(); return; } setIndiOpen((o) => !o); setChartSetOpen(false); setDrawOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="2.5 12 7 12 10 5 14.5 19 17 12 21.5 12" />
                        </svg>
                      </button>
                      {indiOpen && (
                        <div className="chart-dd-panel indi-panel">
                          <div className="indi-panel-scroll">
                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('favorites')}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                              <Chevron open={indiGroups.favorites} />
                            </button>
                            {indiGroups.favorites && (
                              <div className="indi-group-body">
                                <SmcSection settings={indicatorSettings} onChange={setIndicatorSettings} />
                                <HarmonicSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                                <AbcSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                              </div>
                            )}

                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('basic')}>
                              기본
                              <Chevron open={indiGroups.basic} />
                            </button>
                            {indiGroups.basic && (
                              <div className="indi-group-body">
                                <MaSection maSettings={maSettings} onMaSettingsChange={setMaSettings} />
                                <BbSection bbSetting={bbSetting} onBbSettingChange={setBbSetting} />
                              </div>
                            )}

                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('custom')}>
                              커스텀
                              <Chevron open={indiGroups.custom} />
                            </button>
                            {indiGroups.custom && (
                              <div className="indi-group-body">
                                <PivotSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                                <ElliottSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    )}

                    {/* 차트설정(톱니) 드롭다운 */}
                    <div className="chart-dd" ref={chartSetRef}>
                      <button
                        className={`chart-gear${chartSetOpen ? ' active' : ''}`}
                        aria-label="차트 설정"
                        onClick={() => { if (!user) { onLoginClick(); return; } setChartSetOpen((o) => !o); setIndiOpen(false); setDrawOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>
                      {chartSetOpen && (
                        <div className="chart-dd-panel settings-panel">
                          <div className="settings-sheet-content">
                            {/* 테마 프리셋 */}
                            <section className="settings-section">
                              <p className="settings-section-title">테마</p>
                              <div className="theme-presets-grid">
                                {PRESET_THEMES.map((preset) => (
                                  <button
                                    key={preset.id}
                                    className={`theme-preset-card ${chartTheme.id === preset.id ? 'active' : ''}`}
                                    onClick={() => setChartTheme(preset)}
                                  >
                                    <MiniCandles upColor={preset.upColor} downColor={preset.downColor} bgColor={preset.bgColor} />
                                    <span className="theme-preset-name">{preset.name}</span>
                                  </button>
                                ))}
                                <button
                                  className={`theme-preset-card ${isCustomTheme ? 'active' : ''}`}
                                  onClick={() => setChartTheme({ ...chartTheme, id: 'custom' })}
                                >
                                  <div className="theme-preset-custom-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                      <circle cx="12" cy="12" r="9" />
                                      <path d="M12 8v8M8 12h8" />
                                    </svg>
                                  </div>
                                  <span className="theme-preset-name">커스텀</span>
                                </button>
                              </div>
                            </section>

                            {/* 캔들 색상 */}
                            <section className="settings-section">
                              <p className="settings-section-title">캔들 색상</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row">
                                  <span className="color-picker-label">상승</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.upColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.upColor }} />
                                    <input type="color" value={chartTheme.upColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', upColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                                <label className="color-picker-row">
                                  <span className="color-picker-label">하락</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.downColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.downColor }} />
                                    <input type="color" value={chartTheme.downColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', downColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                              </div>
                            </section>

                            {/* 배경색 */}
                            <section className="settings-section">
                              <p className="settings-section-title">배경색</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row">
                                  <span className="color-picker-label">배경</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.bgColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.bgColor, border: '1.5px solid rgba(0,0,0,0.12)' }} />
                                    <input type="color" value={chartTheme.bgColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', bgColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                              </div>
                            </section>

                            {/* 스케일 */}
                            <section className="settings-section">
                              <p className="settings-section-title">스케일</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsLogScale((v) => !v); }}>
                                  <span className="color-picker-label">로그 차트 (Log Scale)</span>
                                  <div className="color-picker-right">
                                    <div className={`toss-switch ${isLogScale ? 'active' : ''}`}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                  </div>
                                </label>
                                <label className="color-picker-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setPriceLineOn((v: boolean) => !v); }}>
                                  <span className="color-picker-label">현재가 라인</span>
                                  <div className="color-picker-right">
                                    <div className={`toss-switch ${priceLineOn ? 'active' : ''}`}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                  </div>
                                </label>
                              </div>
                            </section>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
  );
}
