import { useLayoutEffect, useRef, useState } from 'react';
import type { StrategyConfig } from '../constants/strategyConstants';
import {
  DEFAULT_STRATEGY, DEFAULT_STRATEGY_18, DEFAULT_STRATEGY_19,
  DEFAULT_STRATEGY_20, DEFAULT_STRATEGY_21, DEFAULT_STRATEGY_CE, DEFAULT_STRATEGY_EQ,
  DEFAULT_STRATEGY_HARMONIC, DEFAULT_STRATEGY_HARMONIC_PURE,
  DEFAULT_STRATEGY_HARMONIC_PURE_LINEAR, DEFAULT_STRATEGY_ABCD
} from '../constants/strategyConstants';

import { StrategyPanel } from '../components/strategy/StrategyPanel';
import { BacktestPanel } from '../components/strategy/BacktestPanel';
import { AnalysisPanel } from '../components/strategy/AnalysisPanel';
import ExperimentsPanel from '../components/strategy/ExperimentsPanel';
import PullToRefresh from '@web/components/PullToRefresh';
import LivePage from './LivePage';
import type { TrackerState } from '@web/types/bot';

import TradeConfigManager from '../components/settings/TradeConfigManager';
import KillSwitchPanel from '../components/settings/KillSwitchPanel';
import TradingTogglePanel from '../components/settings/TradingTogglePanel';
import WorkerStatusPanel from '../components/settings/WorkerStatusPanel';
import { PaperStatusPanel } from '../components/PaperStatusPanel';

type PageTab = 'bots' | 'strategy' | 'trade_config' | 'backtest' | 'experiments' | 'analysis' | 'live' | 'paper';

export default function StrategyPage({ active = true, isAdmin = false, onSelectSymbol, onProductTypeChange, onOpenChart, onOpenTrackerChart, onTabBar }: {
  active?: boolean;
  isAdmin?: boolean;
  onSelectSymbol?: (symbol: string) => void;
  onProductTypeChange?: (productType: string | undefined) => void;
  onOpenChart?: () => void;
  onOpenTrackerChart?: (tracker: TrackerState) => void;
  onTabBar?: (p: { x: number; y: number } | null) => void; // 거래/자산과 공유되는 슬라이드 인디케이터 위치 보고
}) {
  const [tab, setTab] = useState<PageTab>('bots');

  // 거래/자산과 공유되는 상단 탭 인디케이터 — 활성 탭 좌표(뷰포트)를 App에 보고
  const tabsRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const header = tabsRef.current;
    if (!header) return;
    const btn = header.querySelector(`button[data-tab="${tab}"]`) as HTMLElement | null;
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    if (br.width === 0) return;
    onTabBar?.({ x: br.left + br.width / 2 - 11, y: header.getBoundingClientRect().bottom - 6 });
  }, [tab, active, onTabBar]);
  const [strategies, setStrategies] = useState<StrategyConfig[]>([
    DEFAULT_STRATEGY_HARMONIC_PURE, DEFAULT_STRATEGY_ABCD, DEFAULT_STRATEGY_HARMONIC_PURE_LINEAR, DEFAULT_STRATEGY_HARMONIC, DEFAULT_STRATEGY_CE, DEFAULT_STRATEGY_EQ, DEFAULT_STRATEGY_21, DEFAULT_STRATEGY_20, DEFAULT_STRATEGY_19, DEFAULT_STRATEGY_18, DEFAULT_STRATEGY
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [liveConfigToApply, setLiveConfigToApply] = useState<StrategyConfig | null>(null);
  const [liveSymbolsToApply, setLiveSymbolsToApply] = useState<string[] | null>(null);

  const handleUpdate = (idx: number, cfg: StrategyConfig) => {
    setStrategies(prev => prev.map((s, i) => i === idx ? cfg : s));
  };

  const handleApplyLive = (cfg: StrategyConfig, symbols: string[]) => {
    setLiveConfigToApply(cfg);
    setLiveSymbolsToApply(symbols);
    setTab('trade_config');
  };

  const onRefresh = () => new Promise<void>(r => setTimeout(r, 600));

  // 전략 탭은 admin 전용 — 일반 유저는 준비 중 안내만 표시
  if (!isAdmin) {
    return (
      <main className="strategy-page" style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
        {/* 블러 배경 — 백테스트 패널 미리보기(비활성). 준비 중 느낌만 전달 */}
        <div aria-hidden="true" style={{ filter: 'blur(7px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.55, transform: 'scale(1.03)', transformOrigin: 'top center' }}>
          <BacktestPanel strategy={strategies[activeIdx]} strategies={strategies} activeIdx={activeIdx} onSelectStrategy={setActiveIdx} onUpdate={handleUpdate} onApplyLive={handleApplyLive} />
        </div>
        {/* 오버레이 — 준비 중 안내 (어두운 스크림으로 가독성 확보) */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 14, padding: '0 32px', background: 'rgba(0,0,0,0.6)' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b8e97" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 1.8" />
          </svg>
          <h2 style={{ color: 'var(--text, #eaecef)', fontSize: 18, fontWeight: 700, margin: 0 }}>전략 기능 준비 중</h2>
          <p style={{ color: 'var(--muted, #8b8e97)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
            자동매매·백테스트 등 전략 기능은<br />곧 만나보실 수 있어요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="strategy-page">
      {/* 거래탭과 동일한 헤더 디자인(.trade-market-tabs) — 공유 슬라이드 인디케이터(App)가 활성 탭 자리로 이동 */}
      <header className="trade-market-tabs" ref={tabsRef} aria-label="전략 분류">
        <div className="tabs-scroll-container">
          {/* 노출 탭은 Bot/Strategy/Backtest 3종만(자동매매·실험·분석·실전 봇 관리는 임시 숨김) */}
          <button data-tab="bots" className={tab === 'bots' ? 'active' : ''} onClick={() => setTab('bots')}>Bot</button>
          <button data-tab="strategy" className={tab === 'strategy' ? 'active' : ''} onClick={() => setTab('strategy')}>Strategy</button>
          <button data-tab="backtest" className={tab === 'backtest' ? 'active' : ''} onClick={() => setTab('backtest')}>Backtest</button>
          <button data-tab="paper" className={tab === 'paper' ? 'active' : ''} onClick={() => setTab('paper')}>Paper</button>
        </div>
      </header>

      {tab === 'bots' && (
        <LivePage
          active={active && tab === 'bots'}
          onSelectSymbol={onSelectSymbol}
          onProductTypeChange={onProductTypeChange}
          onOpenChart={onOpenChart}
          onOpenTrackerChart={onOpenTrackerChart}
        />
      )}
      {tab !== 'bots' && (
      <PullToRefresh onRefresh={onRefresh}>
        {tab === 'strategy' && (
          <StrategyPanel
            strategies={strategies}
            activeIdx={activeIdx}
            onUpdate={handleUpdate}
            onGoToBacktest={(idx) => { setActiveIdx(idx); setTab('backtest'); }}
            onGoToLive={(cfg) => { setLiveConfigToApply(cfg); setLiveSymbolsToApply([]); setTab('trade_config'); }}
          />
        )}
        {tab === 'backtest' && <BacktestPanel strategy={strategies[activeIdx]} strategies={strategies} activeIdx={activeIdx} onSelectStrategy={setActiveIdx} onUpdate={handleUpdate} onApplyLive={handleApplyLive} />}
        {tab === 'experiments' && <ExperimentsPanel onApplyLive={handleApplyLive} />}
        {tab === 'analysis' && <AnalysisPanel />}
        {tab === 'trade_config' && (
          <div style={{ padding: '0 16px', paddingBottom: '120px' }}>
            <TradeConfigManager initialStrategy={liveConfigToApply} initialSymbols={liveSymbolsToApply} />
          </div>
        )}
        {tab === 'live' && (
          <div style={{ padding: '0 16px', paddingBottom: '120px' }}>
            <WorkerStatusPanel />
            <TradingTogglePanel />
            <KillSwitchPanel />
          </div>
        )}
        {tab === 'paper' && (
          <div style={{ padding: '0 16px', paddingBottom: '120px' }}>
            <PaperStatusPanel
              active={active && tab === 'paper'}
              onSelectSymbol={(sym) => { onSelectSymbol?.(sym); onProductTypeChange?.('futures'); onOpenChart?.(); }}
            />
          </div>
        )}
      </PullToRefresh>
      )}
    </main>
  );
}
