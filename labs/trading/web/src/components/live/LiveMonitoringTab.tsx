import React, { useState, useMemo } from 'react';
import { SUB_ACCOUNT_NAMES } from '../../config/bots';
import type { TrackerState } from '@web/types/bot';

export interface LiveMonitoringTabProps {
  combinedTrackers: any[];
  trackersToDisplay: any[];
  botResults: Record<string, any>;
  getTickDecimals: (symbol: string) => number;
  phaseFilter?: string;
  realtimePrices?: Record<string, number>;
  onSelectSymbol?: (symbol: string) => void;
  onProductTypeChange?: (type: 'spot' | 'futures') => void;
  onOpenChart?: () => void;
  onOpenTrackerChart?: (tracker: TrackerState) => void;
}

function doneRetentionSeconds(tracker: { monitorKind?: string }): number {
  // 종료 목록 보존기간 TF별 (M-H7): 30m=2일 / 4h=15일 / 1d=60일. 그 외 기본 2일.
  const k = String(tracker.monitorKind ?? '');
  if (k.endsWith('_30m')) return 2 * 24 * 60 * 60;
  if (k.endsWith('_4h')) return 15 * 24 * 60 * 60;
  if (k.endsWith('_1d')) return 60 * 24 * 60 * 60;
  return 2 * 24 * 60 * 60;
}

// ── 생애주기 라벨/손익: 레이아웃은 공유하고 "라벨 로직만" 전략별로 분리(M-H2 P3) ──
type LabelOut = { timeLabel: string; timeColor: string; displayTime: number };

// 하모닉 트래커 판별: strategy=HARMONIC, 또는 미지정 워커 + Bullish/Bearish 패턴명.
function isHarmonicTracker(t: any): boolean {
  const strategy = String(t.strategy ?? '').toUpperCase();
  if (strategy) return strategy === 'HARMONIC';
  return t.botName === 'Worker' && /^(Bullish|Bearish)/.test(t.patternName ?? '');
}

// 하모닉 종료 — 차트(buildCompletedEmergingShapes)와 동일 사유 + 단일 포지션 손익%.
// (부분청산 상세 손익은 M-H2 후속 — ROADMAP 아이디어 보관함)
function harmonicDoneLabel(t: any): LabelOut {
  const dir = t.type === 'bull' ? 1 : -1;
  if (t.exitReason === 'cancelled') {
    return { timeLabel: '미체결: TP1 선도달', timeColor: '#8b95a1', displayTime: t.exitTime || t.przHitTime || t.obTime };
  }
  const hasExit = t.exitPrice && t.mid;
  const pct = hasExit ? ((t.exitPrice - t.mid) / t.mid) * 100 * dir : 0;
  let reasonStr = '종료';
  let color = '#8b95a1';
  if (t.exitReason === 'sl') {
    reasonStr = t.slBroken ? 'SL 이탈' : t.slHunted ? 'SL 헌팅' : '손절';
    color = t.slHunted ? '#f5a623' : '#f6465d';
  } else if (t.exitReason === 'tp') {
    reasonStr = '익절(TP)'; color = '#0ecb81';
  } else if (t.exitReason === 'timeout') {
    reasonStr = '시간만료'; color = '#f59e0b';
  }
  const profitPct = hasExit ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)` : '';
  return { timeLabel: `종료: ${reasonStr}${profitPct}`, timeColor: color, displayTime: t.exitTime || t.entryTime || t.obTime };
}

// ABCD/SMC 종료 — 부분청산(tp1Hit) 포함 기존 로직 유지.
function genericDoneLabel(t: any): LabelOut {
  const dir = t.type === 'bull' ? 1 : -1;
  if (t.exitReason === 'cancelled') {
    return { timeLabel: '미체결: TP1 선도달', timeColor: '#8b95a1', displayTime: t.exitTime || t.przHitTime || t.obTime };
  }
  if (t.exitReason === 'invalidated') {
    return { timeLabel: '미체결: 존 무효(종가 돌파)', timeColor: '#8b95a1', displayTime: t.exitTime || t.przHitTime || t.obTime };
  }
  let reasonStr = '기간만료';
  let pct = 0;
  const hasExit = t.exitReason && t.exitPrice && t.mid;
  if (hasExit) {
    const exitPct = ((t.exitPrice - t.mid) / t.mid) * 100 * dir;
    const tp1Pct = t.tp1Price ? ((t.tp1Price - t.mid) / t.mid) * 100 * dir : 0;
    if (t.exitReason === 'tp2') { pct = (tp1Pct + exitPct) / 2; reasonStr = '전량익절(TP2)'; }
    else if (t.exitReason === 'tp1') {
      if (t.tp1Hit) { pct = exitPct * 0.5; reasonStr = 'TP1익절+본절'; }
      else { pct = exitPct; reasonStr = '전량익절(TP1)'; }
    } else if (t.exitReason === 'sl1') {
      if (t.tp1Hit) { pct = (tp1Pct + exitPct) / 2; reasonStr = '부분익절후손절'; }
      else { pct = exitPct; reasonStr = '손절'; }
    } else if (t.exitReason === 'timeout') { pct = exitPct * (t.tp1Hit ? 0.5 : 1); reasonStr = '타임아웃'; }
    else if (t.exitReason === 'sl') { pct = exitPct; reasonStr = '손절'; }
    else if (t.exitReason === '본절') { reasonStr = '본절 종료'; }
    else if (t.exitReason === 'tp') { pct = exitPct; reasonStr = '익절'; }
  }
  const profitPct = hasExit ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)` : '';
  const timeColor = t.exitReason?.startsWith('tp') ? '#0ecb81'
    : t.exitReason === 'sl1' || t.exitReason === 'sl' ? (t.tp1Hit ? '#f5a623' : '#f6465d')
    : '#8b95a1';
  return { timeLabel: `종료: ${reasonStr}${profitPct}`, timeColor, displayTime: t.exitTime || t.entryTime || t.obTime };
}

// 생애주기 → 라벨 디스패처. 종료(done)만 전략별, 나머지는 공유.
function resolveLabel(t: any): LabelOut {
  if (t.phase === 'active') return { timeLabel: '체결', timeColor: '#0ecb81', displayTime: t.entryTime || t.obTime };
  if (t.phase === 'completed') return { timeLabel: '완성', timeColor: '#7c8cff', displayTime: t.xabc?.D?.time || t.cTime || t.obTime };
  if (t.phase === 'done') return isHarmonicTracker(t) ? harmonicDoneLabel(t) : genericDoneLabel(t);
  if (t.phase === 'waiting_entry' || t.phase === 'signal') return { timeLabel: '신호 (PRZ 터치)', timeColor: '#f5a623', displayTime: t.przHitTime || t.obTime };
  return { timeLabel: '포착', timeColor: '#a2a7b0', displayTime: t.cTime || t.obTime };
}

export default function LiveMonitoringTab({ combinedTrackers, trackersToDisplay, botResults, getTickDecimals, phaseFilter, realtimePrices, onSelectSymbol, onProductTypeChange, onOpenChart, onOpenTrackerChart }: LiveMonitoringTabProps) {
  const [doneFilter, setDoneFilter] = useState<'all' | 'tp' | 'sl' | 'cancelled' | 'timeout'>('all');

  const displayTrackers = useMemo(() => {
    const now = Date.now() / 1000;
    
    // 기본적으로 done 상태인 항목 중 TF별 표시 기한이 지난 것은 숨김
    let filtered = trackersToDisplay.filter(t => {
      if (t.phase === 'done') {
        const doneTime = t.exitTime || t.przHitTime || t.entryTime || t.obTime;
        if (now - doneTime > doneRetentionSeconds(t)) return false;
      }
      return true;
    });

    if (phaseFilter === 'done' && doneFilter !== 'all') {
      filtered = filtered.filter(t => {
        if (doneFilter === 'tp') return t.exitReason?.startsWith('tp');
        if (doneFilter === 'sl') return t.exitReason === 'sl1' || t.exitReason === 'sl' || t.exitReason === '본절';
        if (doneFilter === 'cancelled') return t.exitReason === 'cancelled' || t.exitReason === 'invalidated';
        if (doneFilter === 'timeout') return t.exitReason === 'timeout';
        return true;
      });
    }
    
    return filtered;
  }, [trackersToDisplay, phaseFilter, doneFilter]);

  const displayCombined = displayTrackers;

  return (
    <div style={{ paddingBottom: '24px' }}>
      {phaseFilter === 'done' && (
        <div style={{ padding: '0 8px 16px', display: 'flex', gap: '8px' }}>
          <span 
            onClick={() => setDoneFilter('all')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', background: doneFilter === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent', color: doneFilter === 'all' ? '#fff' : '#8b95a1', border: '1px solid', borderColor: doneFilter === 'all' ? 'rgba(255,255,255,0.2)' : 'transparent' }}>
            전체
          </span>
          <span 
            onClick={() => setDoneFilter('tp')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', background: doneFilter === 'tp' ? 'rgba(14,203,129,0.1)' : 'transparent', color: doneFilter === 'tp' ? '#0ecb81' : '#8b95a1', border: '1px solid', borderColor: doneFilter === 'tp' ? 'rgba(14,203,129,0.2)' : 'transparent' }}>
            TP
          </span>
          <span 
            onClick={() => setDoneFilter('sl')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', background: doneFilter === 'sl' ? 'rgba(246,70,93,0.1)' : 'transparent', color: doneFilter === 'sl' ? '#f6465d' : '#8b95a1', border: '1px solid', borderColor: doneFilter === 'sl' ? 'rgba(246,70,93,0.2)' : 'transparent' }}>
            SL
          </span>
          <span 
            onClick={() => setDoneFilter('cancelled')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', background: doneFilter === 'cancelled' ? 'rgba(139,149,161,0.1)' : 'transparent', color: doneFilter === 'cancelled' ? '#fff' : '#8b95a1', border: '1px solid', borderColor: doneFilter === 'cancelled' ? 'rgba(139,149,161,0.2)' : 'transparent' }}>
            미체결
          </span>
          <span
            onClick={() => setDoneFilter('timeout')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', cursor: 'pointer', background: doneFilter === 'timeout' ? 'rgba(245,158,11,0.1)' : 'transparent', color: doneFilter === 'timeout' ? '#f59e0b' : '#8b95a1', border: '1px solid', borderColor: doneFilter === 'timeout' ? 'rgba(245,158,11,0.2)' : 'transparent' }}>
            시간만료
          </span>
        </div>
      )}
      {displayCombined.length === 0 ? (
        <div className="live-no-pos" style={{ paddingLeft: '2px', paddingTop: '10px' }}>내역이 없습니다.</div>
      ) : (
        <div className="live-ob-status-expanded" style={{ padding: '0 2px' }}>
          <div className="live-ob-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {Object.entries(displayTrackers.reduce((acc, t) => {
              const key = t.botName === 'Worker' ? 'Worker' : (SUB_ACCOUNT_NAMES[t.botName || ''] || t.botName || 'Unknown');
              if (!acc[key]) acc[key] = [];
              acc[key].push(t);
              return acc;
            }, {} as Record<string, any[]>)).map(([botLabel, trackers]: any, botIdx: number) => (
              <div key={botIdx} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0ecb81', boxShadow: '0 0 6px rgba(14, 203, 129, 0.5)' }} />
                    <strong style={{ color: '#fff', fontSize: '15px' }}>{botLabel}</strong>
                  </div>
                  <span style={{ fontSize: '12px', color: '#8b95a1', fontWeight: '500' }}>진행 중인 신호: <span style={{ color: '#0ecb81', fontWeight: '700' }}>{trackers.length}개</span></span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {trackers.map((t: any, idx: number) => {
                    const isBull = t.type === 'bull';
                    
                    // 생애주기 라벨/손익 — 종료(done)만 전략별(하모닉=차트식 단순 사유), 나머지 공유.
                    const { timeLabel, timeColor, displayTime } = resolveLabel(t);

                    const formattedTime = new Date(displayTime * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    
                    const res = botResults[t.botName || ''];
                    const targetSymbol = t.botName === '1000SHIB' ? '1000SHIBUSDT' : `${t.botName}USDT`;
                    const cfg = res?.data?.symbolConfigs?.[targetSymbol];
                    const isWorker = t.botName === 'Worker';
                    const strategy = String(t.strategy ?? '').toUpperCase();
                    const isAbcd = strategy === 'ABCD' || String(t.patternName ?? '').startsWith('AB=CD');
                    const isHarmonic = strategy === 'HARMONIC' || (!strategy && isWorker && /^Bullish|Bearish/.test(t.patternName ?? ''));
                    const isPatternStrategy = isHarmonic || isAbcd;
                    
                    const tpPct = cfg?.tpPercent ?? (isPatternStrategy ? 50 : 0.5);
                    const slPct = cfg?.slPercent ?? (isPatternStrategy ? 5 : 3.0);
                    
                    const tpPrice = isBull ? t.mid * (1 + tpPct / 100) : t.mid * (1 - tpPct / 100);
                    const slPrice = t.slPrice || (isBull ? t.mid * (1 - slPct / 100) : t.mid * (1 + slPct / 100));
                    
                    const actualTp1Price = t.tp1Price || (isBull ? t.mid * (1 + tpPct/2/100) : t.mid * (1 - tpPct/2/100));
                    const actualTp2Price = t.tp2Price || tpPrice;
                    const tp1PctDisplay = t.tp1Price ? Math.abs((t.tp1Price - t.mid) / t.mid * 100).toFixed(1) : (tpPct/2).toFixed(1);
                    const tp2PctDisplay = t.tp2Price ? Math.abs((t.tp2Price - t.mid) / t.mid * 100).toFixed(1) : tpPct.toFixed(1);
                    const slPctDisplay = t.slPrice ? Math.abs((t.slPrice - t.mid) / t.mid * 100).toFixed(2) : slPct.toFixed(2);
                    const patternName = t.patternName || (isHarmonic ? '하모닉 패턴' : isAbcd ? 'AB=CD' : (t.isBb ? 'BB' : strategy === 'FVG' ? 'FVG' : 'OB'));
                    return (
                      <div key={idx} className="live-ob-row" style={{ background: 'rgba(255, 255, 255, 0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <strong
                              style={{ color: '#fff', fontSize: '14px', marginLeft: '2px', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.3)', textUnderlineOffset: '3px' }}
                              onClick={() => {
                                if (onOpenTrackerChart && t.xabc) {
                                  onOpenTrackerChart(t);
                                  return;
                                }
                                if (onSelectSymbol) onSelectSymbol(t.symbol);
                                if (onProductTypeChange) onProductTypeChange('futures');
                                if (onOpenChart) onOpenChart();
                              }}
                            >{t.symbol.replace('USDT', '')}</strong>
                            <span style={{ fontSize: '10px', fontWeight: '800', color: isBull ? '#0ecb81' : '#f6465d', background: isBull ? 'rgba(14, 203, 129, 0.08)' : 'rgba(246, 70, 93, 0.08)', border: isBull ? '1px solid rgba(14, 203, 129, 0.15)' : '1px solid rgba(246, 70, 93, 0.15)', padding: '2px 5px', borderRadius: '4px' }}>
                              {isBull ? 'LONG' : 'SHORT'}
                            </span>
                            {realtimePrices?.[t.symbol] && (() => {
                              const currentPrice = realtimePrices[t.symbol];
                              const dir = isBull ? 1 : -1;
                              const diffPct = ((currentPrice - t.mid) / t.mid) * 100 * dir;
                              const pctColor = diffPct > 0 ? '#0ecb81' : diffPct < 0 ? '#f6465d' : '#8b95a1';
                              const pctSign = diffPct > 0 ? '+' : '';
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                  <span style={{ fontSize: '12px', color: '#cfd3da', fontWeight: '700' }}>
                                    {currentPrice.toFixed(getTickDecimals(t.symbol))}
                                  </span>
                                  {/* 손익%는 체결(active)부터만 — 미체결(탐색/신호)은 미진입이라 손익 아님 (이슈 8a) */}
                                  {t.phase === 'active' && (
                                    <span style={{ fontSize: '11px', color: pctColor, fontWeight: '700' }}>
                                      ({pctSign}{diffPct.toFixed(2)}%)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const isSignal = t.phase === 'waiting_entry' || t.phase === 'signal';
                            const isCompleted = t.phase === 'completed';
                            const isActive = t.phase === 'active';
                            const isDone = t.phase === 'done';
                            const lineColor  = isDone ? '#58606c' : isActive ? '#0ecb81' : isCompleted ? '#7c8cff' : isSignal ? '#f3ba2f' : 'transparent';
                            const lineWidth  = (isActive || isDone || isCompleted) ? 'calc(100% - 6px)' : isSignal ? '50%' : '0%';
                            const leftColor  = (isActive || isDone) ? (isDone ? '#58606c' : '#0ecb81') : isCompleted ? '#7c8cff' : isSignal ? '#f3ba2f' : '#fff';
                            const midColor   = (isActive || isDone) ? (isDone ? '#58606c' : '#0ecb81') : isCompleted ? '#7c8cff' : isSignal ? '#f3ba2f' : 'rgba(255,255,255,0.15)';
                            const rightColor = (isActive || isDone) ? (isDone ? timeColor : '#0ecb81') : isCompleted ? '#7c8cff' : 'rgba(255,255,255,0.15)';
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <span style={{ fontSize: '11px', color: '#fff', fontWeight: '700' }}>
                                  {isDone ? '(완료)' : isActive ? '(체결)' : isCompleted ? '(완성)' : isSignal ? '(신호)' : '(탐색 중)'}
                                </span>
                                <div style={{ position: 'relative', width: '40px', height: '8px', display: 'flex', alignItems: 'center' }}>
                                  <div style={{ position: 'absolute', left: '3px', right: '3px', height: '1.5px', background: 'rgba(255,255,255,0.08)', zIndex: 1 }} />
                                  <div style={{ position: 'absolute', left: '3px', width: lineWidth, height: '1.5px', background: lineColor, zIndex: 2, transition: 'width 0.3s ease, background 0.3s ease' }} />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', position: 'relative', zIndex: 3 }}>
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: leftColor, boxShadow: `0 0 3px ${leftColor}`, transition: 'all 0.3s' }} />
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: midColor, boxShadow: (isSignal || isActive) ? `0 0 4px ${midColor}` : 'none', transition: 'all 0.3s' }} />
                                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: rightColor, boxShadow: isActive ? `0 0 4px ${rightColor}` : 'none', transition: 'all 0.3s' }} />
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div className="live-stats-grid" style={{ display: 'grid', gridTemplateColumns: isPatternStrategy ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', rowGap: isPatternStrategy ? '12px' : '0', background: 'rgba(255, 255, 255, 0.015)', padding: '12px 4px', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}>
                              <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>{isPatternStrategy ? 'Entry' : '기준 Mid'}</span>
                              <strong style={{ fontSize: '14px', color: '#fff', fontWeight: '700' }}>{t.mid.toFixed(getTickDecimals(t.symbol))}</strong>
                            </div>

                            {isPatternStrategy ? (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>SL</span>
                                  <strong style={{ fontSize: '14px', color: '#f6465d', fontWeight: '700' }}>{slPrice.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '10px', color: '#f6465d', fontWeight: '800' }}>-{slPctDisplay}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                  <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>TP1</span>
                                  <strong style={{ fontSize: '14px', color: '#0ecb81', fontWeight: '700' }}>{actualTp1Price.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '10px', color: '#0ecb81', fontWeight: '800' }}>+{tp1PctDisplay}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>TP2</span>
                                  <strong style={{ fontSize: '14px', color: '#0ecb81', fontWeight: '700' }}>{actualTp2Price.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '10px', color: '#0ecb81', fontWeight: '800' }}>+{tp2PctDisplay}%</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                  <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>TP</span>
                                  <strong style={{ fontSize: '14px', color: '#0ecb81', fontWeight: '700' }}>{tpPrice.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '10px', color: '#0ecb81', fontWeight: '800' }}>+{tpPct.toFixed(2)}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span style={{ fontSize: '11px', color: '#8b95a1', fontWeight: '500' }}>SL</span>
                                  <strong style={{ fontSize: '14px', color: '#f6465d', fontWeight: '700' }}>{slPrice.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '10px', color: '#f6465d', fontWeight: '800' }}>-{slPctDisplay}%</span>
                                </div>
                              </>
                            )}
                          </div>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '2px', paddingLeft: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {t.patternName && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.06)', color: '#8e929a', padding: '3px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                  {/* 전략 구분은 텍스트 대신 아이콘: 하모닉=W/M 지그재그, AB=CD=3구간 지그재그, SMC=존 박스 */}
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isBull ? '#0ecb81' : '#f6465d'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    {isHarmonic ? (
                                      <path d={isBull ? 'M3 20L8 6L12 14L16 4L21 20' : 'M3 4L8 18L12 10L16 20L21 4'} />
                                    ) : isAbcd ? (
                                      <path d={isBull ? 'M3 5L9 16L14 9L21 20' : 'M3 19L9 8L14 15L21 4'} />
                                    ) : (
                                      <>
                                        <rect x="3" y="7" width="18" height="10" rx="1" />
                                        <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1.5" />
                                      </>
                                    )}
                                  </svg>
                                  {patternName}
                                </span>
                              )}
                              <span style={{ fontSize: '11px', color: '#8b95a1' }}>
                                {isPatternStrategy ? 'PRZ 0.5 체결 / 패턴 SL' : 'SMC 존 기준선 이탈 시 SL'}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: '#8b95a1', display: 'flex', alignItems: 'center' }}>
                              <span style={{ fontWeight: '500' }}>
                                <span style={{ color: timeColor, fontWeight: '700' }}>{timeLabel}</span> <span style={{ marginLeft: '6px' }}>{formattedTime}</span>
                              </span>
                            </div>
                          </div>
                          {t.xabc && (
                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${t.xabc.X ? 4 : 3}, 1fr)`, gap: '4px', background: 'rgba(255,255,255,0.015)', borderRadius: '8px', padding: '6px 4px' }}>
                              {(t.xabc.X ? ['X', 'A', 'B', 'C'] : ['A', 'B', 'C']).map((k: string, pointIdx: number, arr: string[]) => (
                                <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', borderRight: pointIdx !== arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                  <span style={{ fontSize: '10px', color: '#8b95a1', fontWeight: '700' }}>{k}</span>
                                  <strong style={{ fontSize: '12px', color: '#cfd3da', fontWeight: '700' }}>{t.xabc[k].price.toFixed(getTickDecimals(t.symbol))}</strong>
                                  <span style={{ fontSize: '8px', color: '#58606c' }}>{new Date(t.xabc[k].time * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
