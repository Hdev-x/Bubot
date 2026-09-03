import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PivotSetting } from './settings';

type Props = {
  pivotSetting: PivotSetting;
  onPivotSettingChange?: (setting: PivotSetting) => void;
};

export default function AbcSection({ pivotSetting, onPivotSettingChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
              <div className="indicator-group">
                <button
                  className="indicator-group-header"
                  onClick={() => setExpanded(prev => !prev)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>AB=CD</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#848e9c' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onPivotSettingChange) {
                        onPivotSettingChange({ ...pivotSetting, showAbcWave: !pivotSetting.showAbcWave });
                      }
                    }}
                    className={`toss-switch ${pivotSetting.showAbcWave ? 'active' : ''}`}
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
                      <div className="indicator-group-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>

                        <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingBottom: '8px', paddingTop: '8px' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                          e.stopPropagation();
                          if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showAbcWave: !pivotSetting.showAbcWave });
                        }}>
                          <div className={`toss-switch ${pivotSetting.showAbcWave ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                            <div className="toss-switch-thumb" />
                          </div>
                          <span className="color-picker-label">가장 최근 완성된 AB=CD 파동 표시 (마스터)</span>
                        </label>

                        <div style={{ paddingLeft: '32px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '12px' }}>
                           <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                             e.stopPropagation();
                             if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showAbcLines: pivotSetting.showAbcLines === false ? true : false });
                           }}>
                             <div className={`toss-switch ${pivotSetting.showAbcLines !== false ? 'active' : ''}`} style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}>
                               <div className="toss-switch-thumb" />
                             </div>
                             <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d' }}>파동 선 표시</span>
                           </label>

                           <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                             e.stopPropagation();
                             if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showAbcText: !pivotSetting.showAbcText });
                           }}>
                             <div className={`toss-switch ${pivotSetting.showAbcText ? 'active' : ''}`} style={{ transform: 'scale(0.7)', transformOrigin: 'left center' }}>
                               <div className="toss-switch-thumb" />
                             </div>
                             <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d' }}>A, B, C, D 텍스트 표시</span>
                           </label>
                        </div>
                        <div className="color-picker-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', paddingLeft: '32px' }}>
                          <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d' }}>탐색 모드</span>
                          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                              e.stopPropagation();
                              if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, abcMode: 'single' });
                            }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `4px solid ${pivotSetting.abcMode !== 'multi' ? '#fff' : 'rgba(255,255,255,0.2)'}`, background: pivotSetting.abcMode !== 'multi' ? '#3182f6' : 'transparent', boxSizing: 'border-box' }} />
                              <span style={{ fontSize: '12px', color: pivotSetting.abcMode !== 'multi' ? '#fff' : '#8e929a' }}>단일 크기</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                              e.stopPropagation();
                              if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, abcMode: 'multi' });
                            }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: `4px solid ${pivotSetting.abcMode === 'multi' ? '#fff' : 'rgba(255,255,255,0.2)'}`, background: pivotSetting.abcMode === 'multi' ? '#3182f6' : 'transparent', boxSizing: 'border-box' }} />
                              <span style={{ fontSize: '12px', color: pivotSetting.abcMode === 'multi' ? '#fff' : '#8e929a' }}>다중 크기 (하모닉 방식)</span>
                            </label>
                          </div>

                          {pivotSetting.abcMode !== 'multi' && (
                            <>
                              <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d', marginTop: '4px' }}>단일 탐색 캔들 수 (크기)</span>
                              <div className="color-picker-right" style={{ gap: '6px', width: '100%', justifyContent: 'flex-end' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                                <div style={{ position: 'relative', flex: 1, maxWidth: '120px' }}>
                                  <select
                                    value={pivotSetting.abcLength || 21}
                                    onChange={e => {
                                      const val = parseInt(e.target.value);
                                      if (!isNaN(val) && onPivotSettingChange) {
                                        onPivotSettingChange({ ...pivotSetting, abcLength: val });
                                      }
                                    }}
                                    style={{ width: '100%', appearance: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit', outline: 'none', borderRadius: '8px', padding: '8px 32px 8px 12px', fontSize: '13px', cursor: 'pointer' }}
                                  >
                                    {Array.from({ length: 100 }, (_, i) => i + 1).map(n => (
                                      <option key={n} value={n} style={{ color: '#000' }}>
                                        {n}개
                                      </option>
                                    ))}
                                  </select>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#8e929a' }}>
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                  </svg>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingBottom: '8px', paddingTop: '8px', paddingLeft: '32px' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                          e.stopPropagation();
                          const currentVal = pivotSetting.showAbcCompleted !== false;
                          if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showAbcCompleted: !currentVal });
                        }}>
                          <div className={`toss-switch ${(pivotSetting.showAbcCompleted !== false) ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                            <div className="toss-switch-thumb" />
                          </div>
                          <span className="color-picker-label">완성된 패턴 표시</span>
                        </label>

                        <label className="indicator-toggle-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingBottom: '8px', paddingTop: '8px', paddingLeft: '32px' }} onPointerDown={e => e.stopPropagation()} onClick={e => {
                          e.stopPropagation();
                          const currentVal = pivotSetting.showAbcPrediction !== false;
                          if (onPivotSettingChange) onPivotSettingChange({ ...pivotSetting, showAbcPrediction: !currentVal });
                        }}>
                          <div className={`toss-switch ${(pivotSetting.showAbcPrediction !== false) ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                            <div className="toss-switch-thumb" />
                          </div>
                          <span className="color-picker-label">진행 중인 파동 실시간 예측 표시</span>
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  );
}
