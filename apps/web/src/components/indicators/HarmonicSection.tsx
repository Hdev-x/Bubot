import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PivotSetting } from './settings';

type Props = {
  pivotSetting: PivotSetting;
  onPivotSettingChange?: (setting: PivotSetting) => void;
};

export default function HarmonicSection({ pivotSetting, onPivotSettingChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  // 하모닉 마스터 토글 (헤더/내부 공용) — showHarmonic만 제어.
  // 마스터가 꺼지면 차트에 하모닉이 통째로 안 그려지므로 TP/SL·카테고리 토글 값은 건드리지 않음(독립).
  const toggleHarmonicMaster = () => {
    if (!onPivotSettingChange) return;
    onPivotSettingChange({ ...pivotSetting, showHarmonic: !pivotSetting.showHarmonic });
  };

  return (
              <div className="indicator-group">
                <button
                  className="indicator-group-header"
                  onClick={() => setExpanded(prev => !prev)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Harmonic</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#848e9c' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHarmonicMaster();
                    }}
                    className={`toss-switch ${pivotSetting.showHarmonic ? 'active' : ''}`}
                    style={{ transform: 'scale(0.7)', transformOrigin: 'right center', cursor: 'pointer' }}
                  >
                    <div className="toss-switch-thumb" />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div className="indicator-group-content" style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
                        {/* 표시 종류 — 카테고리 segmented 버튼 (탐색/신호/완성/손절) */}
                        <div>
                          <div className="harmonic-sec-title">표시 종류</div>
                          <div className="harmonic-seg-grid" onPointerDown={e => e.stopPropagation()}>
                            {([
                              { flag: 'showHarmonicScanning', label: '탐색', sub: '미터치 후보' },
                              { flag: 'showHarmonicSignal', label: '신호', sub: '신호·체결' },
                              { flag: 'showHarmonicCompleted', label: '완성', sub: 'TP·시간만료' },
                              { flag: 'showHarmonicStoploss', label: '손절', sub: 'SL 종료' },
                            ] as const).map(({ flag, label, sub }) => {
                              const on = pivotSetting[flag] !== false;
                              return (
                                <button
                                  key={flag}
                                  type="button"
                                  title={sub}
                                  className={`harmonic-seg-button ${on ? 'active' : ''}`}
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, [flag]: !on });
                                  }}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* 패턴 스타일 — 외곽선/배경 */}
                        <div>
                          <div className="harmonic-sec-title">패턴 스타일</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '4px' }}>
                            <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                              e.stopPropagation();
                              if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showHarmonicLines: pivotSetting.showHarmonicLines === false ? true : false });
                            }}>
                              <div className={`toss-switch ${pivotSetting.showHarmonicLines !== false ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                                <div className="toss-switch-thumb" />
                              </div>
                              <span className="color-picker-label" style={{ fontSize: '13px' }}>패턴 외곽선</span>
                            </label>

                            <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                              e.stopPropagation();
                              if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showHarmonicFill: pivotSetting.showHarmonicFill === false ? true : false });
                            }}>
                              <div className={`toss-switch ${pivotSetting.showHarmonicFill !== false ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                                <div className="toss-switch-thumb" />
                              </div>
                              <span className="color-picker-label" style={{ fontSize: '13px' }}>배경색 채우기</span>
                            </label>
                          </div>
                        </div>

                        {/* TP·SL 표시 — 한 카드 안에 좌우 2컬럼 */}
                        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {([
                              { title: 'TP', full: 'Take Profit', color: '#4ea674', lineKey: 'showTpLine', labelKey: 'showTpLabel' },
                              { title: 'SL', full: 'Stop Loss', color: '#c25b5b', lineKey: 'showSlLine', labelKey: 'showSlLabel' },
                            ] as const).map(({ title, full, color, lineKey, labelKey }, idx) => (
                              <div key={title} style={idx === 0 ? { borderRight: '1px solid rgba(255,255,255,0.07)', paddingRight: '12px' } : { paddingLeft: '4px' }}>
                                <div className="harmonic-col-title" style={{ color }}>{title} <span style={{ fontSize: '10px', fontWeight: 400, color: '#6b6f78' }}>{full}</span></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                                    e.stopPropagation();
                                    if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, [lineKey]: !pivotSetting[lineKey] });
                                  }}>
                                    <div className={`toss-switch ${pivotSetting[lineKey] ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                    <span className="color-picker-label" style={{ fontSize: '13px' }}>라인</span>
                                  </label>

                                  <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                                    e.stopPropagation();
                                    if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, [labelKey]: !pivotSetting[labelKey] });
                                  }}>
                                    <div className={`toss-switch ${pivotSetting[labelKey] ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                    <span className="color-picker-label" style={{ fontSize: '13px' }}>라벨</span>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  );
}
