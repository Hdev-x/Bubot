import React, { useEffect, useMemo, useState } from 'react';
import { getWorkerStatus, type WorkerStatus } from '../../api/adminApi';
import { usePricePrecision } from '@web/hooks/market/usePricePrecision';
import { useRealtimePrices } from '@web/hooks/market/useRealtimePrices';
import LiveMonitoringTab from '../../components/live/LiveMonitoringTab';

// ── LivePage에서 옮겨온 필터·조립 로직(모바일과 동일 규칙) ──
type SignalTypeFilter = 'HARMONIC' | 'ABCD' | 'SMC';
type PatternTfFilter = '30m' | '4h' | '1d' | '1w';
type SmcKindFilter = 'SMC_1M' | 'SMC_1w' | 'SMC_1d';

function getSignalType(tracker: any): SignalTypeFilter {
  const strategy = String(tracker.strategy ?? '').toUpperCase();
  const patternName = String(tracker.patternName ?? '');
  if (strategy === 'ABCD' || patternName.startsWith('AB=CD')) return 'ABCD';
  if (strategy === 'HARMONIC' || /^Bullish|Bearish/.test(patternName)) return 'HARMONIC';
  return 'SMC';
}

function filterBySignalTypes<T extends { strategy?: string; patternName?: string; monitorKind?: string }>(
  trackers: T[], selected: SignalTypeFilter, patternTf: PatternTfFilter, smcKind: SmcKindFilter,
): T[] {
  return trackers.filter(tracker => {
    if (getSignalType(tracker) !== selected) return false;
    if (selected === 'SMC' && tracker.monitorKind) return tracker.monitorKind === smcKind;
    if ((selected === 'HARMONIC' || selected === 'ABCD') && tracker.monitorKind) {
      return tracker.monitorKind === `${selected}_${patternTf}`;
    }
    return true;
  });
}

function doneRetentionSeconds(tracker: { monitorKind?: string }): number {
  // 종료 목록 보존기간 TF별 (M-H7): 30m=2일 / 4h=15일 / 1d=60일. 그 외 기본 2일.
  const k = String(tracker.monitorKind ?? '');
  if (k.endsWith('_30m')) return 2 * 24 * 60 * 60;
  if (k.endsWith('_4h')) return 15 * 24 * 60 * 60;
  if (k.endsWith('_1d')) return 60 * 24 * 60 * 60;
  return 2 * 24 * 60 * 60;
}

// ── 필터바 스타일(모바일 LiveControlBar와 동일) ──
const segmentGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  padding: '2px',
};
const segmentStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease, color 0.15s ease',
  background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
  color: active ? '#fff' : '#8b95a1',
});

interface WebMonitoringPanelProps {
  active?: boolean; // 전략 섹션이 열려 있을 때만 폴링
  onSelectSymbol?: (symbol: string) => void;
  onOpenTrackerChart?: (tracker: any) => void; // 패턴 클릭 → 차트 solo 포커스
}

export function WebMonitoringPanel({ active = true, onSelectSymbol, onOpenTrackerChart }: WebMonitoringPanelProps) {
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [signalTypeFilter, setSignalTypeFilter] = useState<SignalTypeFilter>('HARMONIC');
  const [patternTfFilter, setPatternTfFilter] = useState<PatternTfFilter>('4h');
  const [smcTfFilter, setSmcTfFilter] = useState<SmcKindFilter>('SMC_1M');
  const [phaseFilter, setPhaseFilter] = useState<string>('signal');

  const { getTickDecimals } = usePricePrecision();

  // 워커 스냅샷 폴링 (모바일과 동일한 /api/admin/worker/status)
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const load = () => {
      getWorkerStatus().then(s => { if (!stopped) setWorkerStatus(s); }).catch(() => {});
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [active]);

  const workerTrackers: any[] = workerStatus?.snapshot?.trackers ?? [];

  const signalFiltered = useMemo(
    () => filterBySignalTypes(workerTrackers, signalTypeFilter, patternTfFilter, smcTfFilter),
    [workerTrackers, signalTypeFilter, patternTfFilter, smcTfFilter],
  );

  // 실시간가 — 표시 대상 심볼만 구독
  const activeSymbols = useMemo(
    () => Array.from(new Set(signalFiltered.map(t => t.symbol))),
    [signalFiltered],
  );
  const realtimePrices = useRealtimePrices(active ? activeSymbols : [], true);

  const scanningCount = signalFiltered.filter(t => t.phase === 'scanning' || t.phase === 'waiting').length;
  const signalCount = signalFiltered.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal').length;
  const activeCount = signalFiltered.filter(t => t.phase === 'active').length;
  const doneTrackers = useMemo(() => signalFiltered.filter(t => {
    if (t.phase !== 'done') return false;
    const doneTime = t.exitTime || t.przHitTime || t.entryTime || t.obTime;
    return (Date.now() / 1000) - doneTime <= doneRetentionSeconds(t);
  }).sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)), [signalFiltered]);
  const doneCount = doneTrackers.length;

  const trackersToDisplay = phaseFilter === 'scanning'
    ? signalFiltered.filter(t => t.phase === 'scanning' || t.phase === 'waiting')
    : phaseFilter === 'signal'
      ? signalFiltered.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal')
      : phaseFilter === 'active'
        ? signalFiltered.filter(t => t.phase === 'active')
        : phaseFilter === 'done'
          ? doneTrackers
          : signalFiltered;

  const signalOptions: { key: SignalTypeFilter; label: string }[] = [
    { key: 'HARMONIC', label: 'Harmonic' },
    { key: 'ABCD', label: 'AB=CD' },
    { key: 'SMC', label: 'SMC' },
  ];
  const patternTfOptions: { key: PatternTfFilter; label: string }[] = signalTypeFilter === 'HARMONIC'
    ? [{ key: '30m', label: '30m' }, { key: '4h', label: '4h' }, { key: '1d', label: '일봉' }]
    : [{ key: '4h', label: '4h' }, { key: '1d', label: '일봉' }, { key: '1w', label: '주봉' }];

  const handleSignalTypeSelect = (next: SignalTypeFilter) => {
    setSignalTypeFilter(next);
    if (next === 'HARMONIC' && patternTfFilter === '1w') setPatternTfFilter('4h');
    if (next === 'ABCD' && patternTfFilter === '30m') setPatternTfFilter('4h');
  };

  return (
    <div className="web-monitoring">
      {/* 신호 타입 + TF 세그먼트 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '4px 0 10px' }}>
        <div style={segmentGroupStyle}>
          {signalOptions.map(o => (
            <span key={o.key} style={segmentStyle(signalTypeFilter === o.key)} onClick={() => handleSignalTypeSelect(o.key)}>{o.label}</span>
          ))}
        </div>
        {(signalTypeFilter === 'HARMONIC' || signalTypeFilter === 'ABCD') && (
          <div style={segmentGroupStyle}>
            {patternTfOptions.map(o => (
              <span key={o.key} style={segmentStyle(patternTfFilter === o.key)} onClick={() => setPatternTfFilter(o.key)}>{o.label}</span>
            ))}
          </div>
        )}
        {signalTypeFilter === 'SMC' && (
          <div style={segmentGroupStyle}>
            {([{ key: 'SMC_1M', label: '월봉' }, { key: 'SMC_1w', label: '주봉' }, { key: 'SMC_1d', label: '일봉' }] as { key: SmcKindFilter; label: string }[]).map(o => (
              <span key={o.key} style={segmentStyle(smcTfFilter === o.key)} onClick={() => setSmcTfFilter(o.key)}>{o.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* phase 칩 (탐색/신호/체결/종료) */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px' }}>
        <span className={`live-ob-chip phase-waiting ${phaseFilter === 'scanning' ? 'active' : ''}`} onClick={() => setPhaseFilter('scanning')}>탐색 {scanningCount}</span>
        <span className={`live-ob-chip phase-waiting ${phaseFilter === 'signal' ? 'active' : ''}`} onClick={() => setPhaseFilter('signal')}>신호 {signalCount}</span>
        <span className={`live-ob-chip phase-waiting ${phaseFilter === 'active' ? 'active' : ''}`} onClick={() => setPhaseFilter('active')}>체결 {activeCount}</span>
        <span className={`live-ob-chip phase-waiting ${phaseFilter === 'done' ? 'active' : ''}`} onClick={() => setPhaseFilter('done')}>종료 {doneCount}</span>
      </div>

      <div className="web-monitoring-list">
        <LiveMonitoringTab
          combinedTrackers={signalFiltered}
          trackersToDisplay={trackersToDisplay}
          botResults={{}}
          getTickDecimals={getTickDecimals}
          phaseFilter={phaseFilter}
          realtimePrices={realtimePrices}
          onSelectSymbol={onSelectSymbol}
          onOpenTrackerChart={onOpenTrackerChart}
        />
      </div>
    </div>
  );
}
