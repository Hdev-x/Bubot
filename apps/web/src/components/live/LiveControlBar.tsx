import React from 'react';
import { BOT_KEYS, SUB_ACCOUNT_NAMES } from '../../config/bots';

export type LiveTab = 'position' | 'pending' | 'monitoring';
type SignalTypeFilter = 'HARMONIC' | 'ABCD' | 'SMC';
type PatternTfFilter = '30m' | '4h' | '1d' | '1w';
type SmcKindFilter = 'SMC_1M' | 'SMC_1w' | 'SMC_1d';

// 세그먼트 컨트롤 스타일 — 한 컨테이너 안에 칸이 나뉜 단일 선택 토글
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

export interface LiveControlBarProps {
  tab: LiveTab;
  setTab: (val: LiveTab) => void;
  displayPositionsCount: number;
  mainPositionsCount: number;
  mainPendingCount: number;
  subPendingCount: number;
  scanningCount: number;
  signalCount: number;
  activeCount: number;
  doneCount: number;
  phaseFilter: string;
  setPhaseFilter: (val: string) => void;
  signalTypeFilter: SignalTypeFilter;
  setSignalTypeFilter: (val: SignalTypeFilter) => void;
  patternTfFilter: PatternTfFilter;
  setPatternTfFilter: (val: PatternTfFilter) => void;
  smcTfFilter: SmcKindFilter;
  setSmcTfFilter: (val: SmcKindFilter) => void;
  selectedBot: string;
  setSelectedBot: (val: string) => void;
  combinedTrackersLength: number;
  useWorkerSnapshot?: boolean;
}

export default function LiveControlBar({
  tab, setTab,
  displayPositionsCount, mainPositionsCount,
  mainPendingCount, subPendingCount,
  scanningCount, signalCount, activeCount, doneCount,
  phaseFilter, setPhaseFilter,
  signalTypeFilter, setSignalTypeFilter,
  patternTfFilter, setPatternTfFilter,
  smcTfFilter, setSmcTfFilter,
  selectedBot, setSelectedBot,
  combinedTrackersLength,
  useWorkerSnapshot = false
}: LiveControlBarProps) {
  // 신호 타입은 항상 정확히 하나만 선택 (전체보기 없음)
  const signalOptions: { key: SignalTypeFilter; label: string }[] = [
    { key: 'HARMONIC', label: 'Harmonic' },
    { key: 'ABCD', label: 'AB=CD' },
    { key: 'SMC', label: 'SMC' },
  ];
  const patternTfOptions: { key: PatternTfFilter; label: string }[] = signalTypeFilter === 'HARMONIC'
    ? [
        { key: '30m', label: '30m' },
        { key: '4h', label: '4h' },
        { key: '1d', label: '일봉' },
      ]
    : [
        { key: '4h', label: '4h' },
        { key: '1d', label: '일봉' },
        { key: '1w', label: '주봉' },
      ];

  const handleSignalTypeSelect = (next: SignalTypeFilter) => {
    setSignalTypeFilter(next);
    if (next === 'HARMONIC' && patternTfFilter === '1w') setPatternTfFilter('4h');
    if (next === 'ABCD' && patternTfFilter === '30m') setPatternTfFilter('4h');
  };

  return (
    <div className="live-control-bar" style={{ position: 'sticky', top: 0, zIndex: 45, background: '#000' }}>
      <nav style={{ background: '#000', display: 'flex', gap: '20px', padding: '14px 20px 8px', borderBottom: 'none', alignItems: 'baseline' }}>
        <div
          className="live-card-label"
          onClick={() => setTab('position')}
          style={{ color: tab === 'position' ? '#fff' : '#58606c', fontWeight: '600', fontSize: '15px', cursor: 'pointer', transition: 'color 0.2s ease', userSelect: 'none' }}
        >
          포지션 ({displayPositionsCount})
        </div>
        <div
          className="live-card-label"
          onClick={() => setTab('pending')}
          style={{ color: tab === 'pending' ? '#fff' : '#58606c', fontWeight: '600', fontSize: '15px', cursor: 'pointer', transition: 'color 0.2s ease', userSelect: 'none' }}
        >
          미체결 ({mainPendingCount + subPendingCount})
        </div>
        <div
          className="live-card-label"
          onClick={() => setTab('monitoring')}
          style={{ color: tab === 'monitoring' ? '#fff' : '#58606c', fontWeight: '600', fontSize: '15px', cursor: 'pointer', transition: 'color 0.2s ease', userSelect: 'none' }}
        >
          모니터링 ({scanningCount + signalCount + activeCount + doneCount})
        </div>
      </nav>

      {tab === 'monitoring' && (
        <>
        {/* 패턴 필터(상위) — 단일 선택임을 모양으로 보여주는 세그먼트 컨트롤. 아랫줄 단계 칩과 구분 */}
        <div style={{ padding: '6px 14px 10px', display: 'flex', gap: '8px', alignItems: 'center', background: '#000', overflowX: 'auto' }}>
          <div style={segmentGroupStyle}>
            {signalOptions.map(option => (
              <span
                key={option.key}
                style={segmentStyle(signalTypeFilter === option.key)}
                onClick={() => handleSignalTypeSelect(option.key)}
              >
                {option.label}
              </span>
            ))}
          </div>
          {/* 하모닉은 30m·4h·일봉, AB=CD는 4h·일봉·주봉까지만 관찰 */}
          {(signalTypeFilter === 'HARMONIC' || signalTypeFilter === 'ABCD') && (
            <div style={segmentGroupStyle}>
              {patternTfOptions.map(option => (
                <span
                  key={option.key}
                  style={segmentStyle(patternTfFilter === option.key)}
                  onClick={() => setPatternTfFilter(option.key)}
                >
                  {option.label}
                </span>
              ))}
            </div>
          )}
          {/* SMC 선택 시 존 타임프레임 하위 세그먼트 — 월봉/주봉/일봉만 허용 */}
          {signalTypeFilter === 'SMC' && (
            <div style={segmentGroupStyle}>
              {([
                { key: 'SMC_1M', label: '월봉' },
                { key: 'SMC_1w', label: '주봉' },
                { key: 'SMC_1d', label: '일봉' },
              ] as { key: SmcKindFilter; label: string }[]).map(option => (
                <span
                  key={option.key}
                  style={segmentStyle(smcTfFilter === option.key)}
                  onClick={() => setSmcTfFilter(option.key)}
                >
                  {option.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '6px 14px 12px', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', background: '#000' }}>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
            <span className={`live-ob-chip phase-waiting ${phaseFilter === 'scanning' ? 'active' : ''}`} onClick={() => setPhaseFilter('scanning')}>
              탐색 {scanningCount}
            </span>
            <span className={`live-ob-chip phase-waiting ${phaseFilter === 'signal' ? 'active' : ''}`} onClick={() => setPhaseFilter('signal')}>
              신호 {signalCount}
            </span>
            <span className={`live-ob-chip phase-waiting ${phaseFilter === 'active' ? 'active' : ''}`} onClick={() => setPhaseFilter('active')}>
              체결 {activeCount}
            </span>
            <span className={`live-ob-chip phase-waiting ${phaseFilter === 'done' ? 'active' : ''}`} onClick={() => setPhaseFilter('done')}>
              종료 {doneCount}
            </span>
          </div>
          {/* 통합 워커 모드에선 모든 항목이 botName='Worker'라 봇 필터가 무의미 → 숨김 */}
          {!useWorkerSnapshot && (
            <div className="premium-select-wrapper" style={{ flexShrink: 0 }}>
              <select value={selectedBot} onChange={(e) => { setSelectedBot(e.target.value); setPhaseFilter('scanning'); }} className="premium-select">
                <option value="ALL">전체</option>
                {BOT_KEYS.map(key => (
                  <option key={key} value={key}>{SUB_ACCOUNT_NAMES[key] || key}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
