// 실험 대시보드 — 서버 backtest_runs(수동 실험 + Actions 일일 스윕 업로드)를
// 우상향 후보 점수로 정렬·필터해 보여주고, 후보를 자동매매 설정 초안으로 넘긴다.
// 점수·판정 기준의 원본은 utils/backtestReport.ts stabilityMetrics().
import React, { useEffect, useMemo, useState } from 'react';
import { fetchBacktestRuns, type BacktestRun } from '../../api/backtestRunApi';
import { stabilityMetrics, type StabilityMetrics, type StabilityVerdict } from '../../utils/backtestReport';
import { normalizeConfig, toLegacyBacktest } from '../../../../../shared/strategy-schema';
import { DEFAULT_STRATEGY_PARAMS } from '../../utils/backtestEngine';
import type { StrategyConfig } from '../../constants/strategyConstants';

type SortKey = 'score' | 'pf' | 'recent';
type VerdictFilter = '전체' | StabilityVerdict;
type GuardFilter = '전체' | '가드검증' | '미검증';

interface Row {
  run: BacktestRun;
  m: StabilityMetrics;
}

// 고정/숨김은 서버 스키마 없이 브라우저 로컬에 보관 — configHash 기준이라 재업로드에도 유지
const PIN_KEY = 'experiments.pinned';
const HIDE_KEY = 'experiments.hidden';

function loadHashSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { return new Set(); }
}

function saveHashSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
}

const verdictColor: Record<StabilityVerdict, string> = {
  후보: '#0ecb81',
  관찰: '#f0b90b',
  제외: '#666',
};

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 14,
  fontSize: 12,
  cursor: 'pointer',
  border: '1px solid #333',
  background: active ? '#2962ff' : 'transparent',
  color: active ? '#fff' : '#aaa',
});

const fmtUsd = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}`;

export interface ExperimentsPanelProps {
  onApplyLive?: (cfg: StrategyConfig, symbols: string[]) => void;
}

export default function ExperimentsPanel({ onApplyLive }: ExperimentsPanelProps) {
  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>('전체');
  const [guardFilter, setGuardFilter] = useState<GuardFilter>('전체');
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [pinned, setPinned] = useState<Set<string>>(() => loadHashSet(PIN_KEY));
  const [hidden, setHidden] = useState<Set<string>>(() => loadHashSet(HIDE_KEY));
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const togglePin = (hash: string) => {
    const next = new Set(pinned);
    next.has(hash) ? next.delete(hash) : next.add(hash);
    saveHashSet(PIN_KEY, next);
    setPinned(next);
  };

  const toggleHide = (hash: string) => {
    const next = new Set(hidden);
    next.has(hash) ? next.delete(hash) : next.add(hash);
    saveHashSet(HIDE_KEY, next);
    setHidden(next);
  };

  useEffect(() => {
    fetchBacktestRuns(500)
      .then(setRuns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const all = runs.map(run => ({ run, m: stabilityMetrics(run.report) }));
    const q = query.trim().toLowerCase();
    const hasGuard = (r: Row) => !!(r.run.report.segments && r.run.report.costStress);
    const filtered = all.filter(r =>
      (verdictFilter === '전체' || r.m.verdict === verdictFilter) &&
      (guardFilter === '전체' || (guardFilter === '가드검증') === hasGuard(r)) &&
      (!q || (r.run.name ?? '').toLowerCase().includes(q)) &&
      (showHidden || !hidden.has(r.run.configHash))
    );
    const pfOf = (r: Row) => Number.isFinite(r.run.report.profitFactor) ? r.run.report.profitFactor : 999;
    return [...filtered].sort((a, b) => {
      // 고정 항목은 정렬 기준과 무관하게 항상 위
      const pinDiff = Number(pinned.has(b.run.configHash)) - Number(pinned.has(a.run.configHash));
      if (pinDiff) return pinDiff;
      if (sortKey === 'score') return b.m.score - a.m.score;
      if (sortKey === 'pf') return pfOf(b) - pfOf(a);
      return b.run.createdAt.localeCompare(a.run.createdAt);
    });
  }, [runs, sortKey, verdictFilter, guardFilter, query, pinned, hidden, showHidden]);

  const counts = useMemo(() => {
    const c: Record<StabilityVerdict, number> = { 후보: 0, 관찰: 0, 제외: 0 };
    for (const run of runs) c[stabilityMetrics(run.report).verdict]++;
    return c;
  }, [runs]);

  const applyLive = (run: BacktestRun) => {
    const legacy = toLegacyBacktest(normalizeConfig(run.config));
    onApplyLive?.({
      name: legacy.name,
      obGranularity: legacy.obGranularity,
      entryGranularity: legacy.entryGranularity,
      initialCapital: legacy.initialCapital,
      params: { ...DEFAULT_STRATEGY_PARAMS, ...legacy.params },
    } as StrategyConfig, run.symbols);
  };

  if (loading) return <div style={{ padding: 24, color: '#888' }}>실험 이력 불러오는 중...</div>;
  if (error) return <div style={{ padding: 24, color: '#f6465d' }}>조회 실패: {error}</div>;

  return (
    <div style={{ padding: '0 16px 120px' }}>
      <p style={{ fontSize: 12, color: '#888', margin: '8px 0 12px' }}>
        우상향 후보 점수: 생존성(PF·MDD)과 월별 지속성을 우선. 후보 {counts.후보} · 관찰 {counts.관찰} · 제외 {counts.제외}
        {' '}— 일일 자동 실험 결과는 매일 06:00 KST 누적됩니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['전체', '후보', '관찰', '제외'] as VerdictFilter[]).map(v => (
          <span key={v} style={chipStyle(verdictFilter === v)} onClick={() => setVerdictFilter(v)}>
            {v}{v !== '전체' ? ` ${counts[v]}` : ''}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {([['score', '점수순'], ['pf', 'PF순'], ['recent', '최신순']] as [SortKey, string][]).map(([k, label]) => (
          <span key={k} style={chipStyle(sortKey === k)} onClick={() => setSortKey(k)}>{label}</span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['전체', '가드검증', '미검증'] as GuardFilter[]).map(g => (
          <span key={g} style={chipStyle(guardFilter === g)} onClick={() => setGuardFilter(g)}
            title="가드검증 = holdout·비용 스트레스 데이터가 있는 실험">{g}</span>
        ))}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="실험 이름 검색 (예: auto-search, depth=0.236)"
          style={{
            flex: 1, minWidth: 160, padding: '5px 10px', borderRadius: 14, fontSize: 12,
            border: '1px solid #333', background: 'transparent', color: '#ddd', outline: 'none',
          }}
        />
        {hidden.size > 0 && (
          <span style={chipStyle(showHidden)} onClick={() => setShowHidden(v => !v)}>
            숨김 {hidden.size}개 {showHidden ? '표시중' : '보기'}
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>
          표시할 실험이 없습니다. 백테스트를 실행하거나 일일 자동 실험을 기다리세요.
        </div>
      )}

      {rows.map(({ run, m }) => {
        const r = run.report;
        const pf = Number.isFinite(r.profitFactor) ? r.profitFactor.toFixed(2) : '∞';
        const expanded = expandedId === run.id;
        return (
          <div key={run.id} style={{ border: '1px solid #222', borderRadius: 8, marginBottom: 8, background: '#0a0a0a' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
              onClick={() => setExpandedId(expanded ? null : run.id)}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                color: '#000', background: verdictColor[m.verdict], flexShrink: 0,
              }}>{m.verdict}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.name ?? `실험 #${run.id}`}
                </div>
                <div style={{ fontSize: 11, color: '#777' }}>
                  {run.createdAt} · {run.symbols.length}심볼 · {r.trades}건
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, flexShrink: 0 }}>
                <div style={{ fontWeight: 700 }}>{m.score.toFixed(1)}점</div>
                <div style={{ color: '#999' }}>PF {pf} · MDD {r.maxDrawdownPct.toFixed(1)}%</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <span
                  onClick={() => togglePin(run.configHash)}
                  title={pinned.has(run.configHash) ? '고정 해제' : '상단 고정'}
                  style={{ cursor: 'pointer', fontSize: 14, opacity: pinned.has(run.configHash) ? 1 : 0.35 }}
                >📌</span>
                <span
                  onClick={() => toggleHide(run.configHash)}
                  title={hidden.has(run.configHash) ? '숨김 해제' : '목록에서 숨김'}
                  style={{ cursor: 'pointer', fontSize: 14, opacity: hidden.has(run.configHash) ? 1 : 0.35 }}
                >🙈</span>
              </div>
            </div>

            {expanded && (
              <div style={{ borderTop: '1px solid #1c1c1c', padding: '10px 12px', fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                  <span>순손익 <b style={{ color: r.netProfit >= 0 ? '#0ecb81' : '#f6465d' }}>{fmtUsd(r.netProfit)}</b></span>
                  <span>승률 {r.winRate.toFixed(1)}%</span>
                  <span>손익비 {Number.isFinite(r.payoff) ? r.payoff.toFixed(2) : '∞'}</span>
                  <span>양수월 {m.positiveMonths}/{m.totalMonths} ({m.positiveMonthRate.toFixed(0)}%)</span>
                  <span>최악월 {fmtUsd(m.worstMonthNetPnl)}</span>
                  <span>연속손실 {r.maxLoseStreak}</span>
                  <span>holdout PF {r.segments ? r.segments.holdout.report.profitFactor.toFixed(2) : '-'}</span>
                  <span>스트레스 {r.costStress ? `×${r.costStress.multiplier} ${fmtUsd(r.costStress.report.netProfit)}` : '-'}</span>
                </div>

                {r.segments && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                    {(['train', 'validation', 'holdout'] as const).map(seg => {
                      const s = r.segments![seg];
                      return (
                        <div key={seg} style={{ background: '#111', borderRadius: 6, padding: '6px 8px' }}
                          title={`${s.rangeStart} ~ ${s.rangeEnd}`}>
                          <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>
                            {seg === 'train' ? 'train (60%)' : seg === 'validation' ? 'valid (25%)' : 'holdout (15%)'}
                          </div>
                          <div>PF {s.report.profitFactor.toFixed(2)} · {s.report.trades}건</div>
                          <div style={{ color: s.report.netProfit >= 0 ? '#0ecb81' : '#f6465d' }}>
                            {fmtUsd(s.report.netProfit)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {m.reasons.length > 0 && (
                  <div style={{ marginBottom: 10, padding: '6px 8px', background: '#111', borderRadius: 6, color: m.verdict === '후보' ? '#0ecb81' : '#999' }}>
                    {m.verdict === '후보' ? '승격 근거' : '판정 사유'}: {m.reasons.join(' · ')}
                  </div>
                )}

                {r.monthly?.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 36, marginBottom: 10 }}
                    title="월별 순손익">
                    {r.monthly.map(mo => {
                      const max = Math.max(...r.monthly.map(x => Math.abs(x.netPnl)), 1);
                      const h = Math.max(2, Math.abs(mo.netPnl) / max * 32);
                      return (
                        <div key={mo.period}
                          title={`${mo.period}: ${fmtUsd(mo.netPnl)} (${mo.trades}건)`}
                          style={{
                            flex: 1, height: h, alignSelf: mo.netPnl >= 0 ? 'flex-end' : 'flex-end',
                            background: mo.netPnl >= 0 ? '#0ecb81' : '#f6465d', borderRadius: 1, opacity: 0.85,
                          }} />
                      );
                    })}
                  </div>
                )}

                <details style={{ marginBottom: 10 }}>
                  <summary style={{ cursor: 'pointer', color: '#999' }}>설정 JSON</summary>
                  <pre style={{ fontSize: 10, overflow: 'auto', maxHeight: 200, background: '#111', padding: 8, borderRadius: 6 }}>
                    {JSON.stringify(run.config, null, 2)}
                  </pre>
                </details>

                {onApplyLive && (
                  <button
                    onClick={() => applyLive(run)}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                      background: m.verdict === '제외' ? '#333' : '#2962ff', color: '#fff', fontWeight: 600, cursor: 'pointer',
                    }}
                    title="이 실험 설정으로 자동매매 설정 화면으로 이동 (저장 전까지 서버 변경 없음)"
                  >실전 설정 초안 만들기</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
