import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchUsdKrwRate } from '@web/api/exchange/exchangeRate';
import { getWorkerStatus, type WorkerStatus } from '../api/adminApi';
import { useBotStreams } from '../hooks/useBotStreams';
import { useMainTrade } from '@web/hooks/account/useMainTrade';
import { usePricePrecision } from '@web/hooks/market/usePricePrecision';
import { useRealtimePrices } from '@web/hooks/market/useRealtimePrices';
import { getActiveSymbols, getLiveBotAggregates } from '../utils/botAggregates';

// Components
import LiveHeader from '../components/live/LiveHeader';
import LiveAssetSummary from '../components/live/LiveAssetSummary';
import LiveControlBar, { LiveTab } from '../components/live/LiveControlBar';
import LivePositionTab from '../components/live/LivePositionTab';
import LivePendingTab from '../components/live/LivePendingTab';
import LiveMonitoringTab from '../components/live/LiveMonitoringTab';
import LiveTradesModal from '../components/live/LiveTradesModal';
import AlertSheet from '../components/AlertSheet';
import PullToRefresh from '@web/components/PullToRefresh';
import type { TrackerState } from '@web/types/bot';

const LEVERAGE = 5;
const SEED_RATIO = 100;
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

// 신호 타입은 항상 하나만 선택 — 전체보기 없음 (표시량 과다 방지)
// HARMONIC은 30m·4h·일봉, ABCD는 4h·일봉·주봉, SMC는 월봉·주봉·일봉만 표시한다.
// monitorKind 없는 트래커(레거시)는 통과.
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

interface LivePageProps {
  active?: boolean; // Bot 탭이 화면에 떠 있을 때만 워커 상태 폴링·실시간 시세 구독
  onOpenHistory?: () => void;
  onSelectSymbol?: (symbol: string) => void;
  onProductTypeChange?: (type: 'spot' | 'futures') => void;
  onOpenChart?: () => void;
  onOpenTrackerChart?: (tracker: TrackerState) => void;
}

export default function LivePage({ active = true, onOpenHistory, onSelectSymbol, onProductTypeChange, onOpenChart, onOpenTrackerChart }: LivePageProps) {
  const { botResults, mainStatus, loading } = useBotStreams();
  const [selectedBot, setSelectedBot] = useState<string>('ALL');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [isTradesModalOpen, setIsTradesModalOpen] = useState<boolean>(false);
  const [phaseFilter, setPhaseFilter] = useState<string>('scanning');
  const [signalTypeFilter, setSignalTypeFilter] = useState<SignalTypeFilter>('HARMONIC');
  const [patternTfFilter, setPatternTfFilter] = useState<PatternTfFilter>('4h');
  const [smcTfFilter, setSmcTfFilter] = useState<SmcKindFilter>('SMC_1M');
  const [expandedTrackers, setExpandedTrackers] = useState<Record<string, boolean>>({});
  const [usdKrw, setUsdKrw] = useState<number>(1380);
  const [tab, setTab] = useState<LiveTab>('position');
  const [tradeFilter, setTradeFilter] = useState<string>('ALL');
  const [isAccountExpanded, setIsAccountExpanded] = useState<boolean>(false);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [workerLoading, setWorkerLoading] = useState<boolean>(true);
  const [alertOpen, setAlertOpen] = useState(false); // 알람(종) — 트레이드 헤더에서 이동
  // 워커가 죽으면 워커 스냅샷이 비어 포지션이 안 보인다 → 그때만 MAIN 키로 비트겟 직접 조회해 폴백.
  // (워커 살아있으면 스냅샷이 우선이라 직접조회 폴링은 멈춤)
  const { data: directMain } = useMainTrade(active && !(workerStatus?.alive ?? false));

  const { getTickDecimals } = usePricePrecision(4);
  const workerRealtimeSymbols = Array.from(new Set([
    ...(workerStatus?.snapshot?.mainPositions ?? []).map(position => position.symbol),
    ...(workerStatus?.snapshot?.mainPendingOrders ?? []).map(order => order.symbol),
    ...(workerStatus?.snapshot?.configs ?? []).map(config => config.symbol),
    ...(workerStatus?.snapshot?.pendingOrders ?? []).map(order => order.symbol),
    ...(workerStatus?.snapshot?.trackers ?? []).map(tracker => tracker.symbol),
  ]));
  const activeSymbols = Array.from(new Set([
    ...getActiveSymbols(botResults, mainStatus),
    ...workerRealtimeSymbols,
  ]));
  const realtimePrices = useRealtimePrices(active ? activeSymbols : []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshAll = useCallback(async () => {
    const [krw, status] = await Promise.all([
      fetchUsdKrwRate(1380),
      getWorkerStatus().catch(() => null),
    ]);
    setUsdKrw(krw);
    if (status) setWorkerStatus(status);
    setWorkerLoading(false);
  }, []);

  useEffect(() => {
    fetchUsdKrwRate(1380).then(setUsdKrw);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!active) return; // Bot 탭이 화면 밖이면 워커 상태 폴링 중단
    let stopped = false;

    async function loadWorkerStatus() {
      try {
        const status = await getWorkerStatus();
        if (!stopped) setWorkerStatus(status);
      } catch {
        if (!stopped) setWorkerStatus(null);
      } finally {
        if (!stopped) setWorkerLoading(false);
      }
    }

    loadWorkerStatus();
    const intervalId = window.setInterval(loadWorkerStatus, 5000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [active]);

  useEffect(() => {
    const newExpanded: Record<string, boolean> = { ...expandedTrackers };
    let changed = false;
    Object.entries(botResults).forEach(([botName, res]) => {
      if (res.success && res.data?.engineStatus?.trackersList) {
        res.data.engineStatus.trackersList.forEach((t: any) => {
          const key = `${botName}_${t.symbol}_${t.type}_${t.obTime}`;
          if (newExpanded[key] === undefined) {
            newExpanded[key] = t.phase === 'active';
            changed = true;
          }
        });
      }
    });
    if (changed) setExpandedTrackers(newExpanded);
  }, [botResults]);

  const {
    hasMainBalance, combinedPositions, totalAssets, mainTotalEquity,
    mainUnrealizedUsdt, subTotalEquity, subPendingOrders, combinedTrackers, displayPositions,
    displayTrades, trackersToDisplay, scanningCount, signalCount, activeCount, doneCount,
  } = getLiveBotAggregates({ botResults, mainStatus, realtimePrices, selectedBot, tradeFilter, phaseFilter });

  const mainOnline = mainStatus !== null;
  const workerOnline = workerStatus?.alive ?? false;
  const workerMainBalance = workerStatus?.snapshot
    ? workerStatus.snapshot.mainBalance ?? 0
    : undefined;
  const workerSubBalance = workerStatus?.snapshot
    ? workerStatus.snapshot.subBalance ?? 0
    : undefined;
  const workerMainStatus = workerStatus?.snapshot
    ? {
        balance: workerStatus.snapshot.mainBalance ?? 0,
        positions: workerStatus.snapshot.mainPositions ?? [],
        pendingOrders: workerStatus.snapshot.mainPendingOrders ?? [],
      }
    : null;
  // 워커 스냅샷이 없으면(워커 오프라인) MAIN 직접조회를 폴백으로. 둘 다 없으면 레거시 mainStatus.
  const directMainStatus = (directMain.hasKey && (directMain.positions.length > 0 || directMain.orders.length > 0))
    ? { balance: directMain.available, positions: directMain.positions, pendingOrders: directMain.orders }
    : null;
  const displayMainStatus = workerMainStatus ?? directMainStatus ?? mainStatus;
  const workerMainUnrealizedUsdt = (workerMainStatus?.positions ?? []).reduce((sum, pos) => sum + (pos.unrealizedPl || 0), 0);
  const workerPositions = (workerStatus?.snapshot?.configs ?? [])
    .filter(c => c.hasPosition && c.direction && c.entryPrice && c.size)
    .map(c => ({
      symbol: c.symbol,
      direction: c.direction!,
      entryPrice: c.entryPrice!,
      size: c.size!,
      tpPrice: c.tpPrice ?? c.entryPrice!,
      sl1Price: c.sl1Price ?? c.entryPrice!,
      sl2Price: c.sl2Price ?? c.entryPrice!,
      entryTime: Math.floor((workerStatus?.snapshot?.ts ?? Date.now()) / 1000),
      botName: c.botName ?? 'Worker',
      leverage: c.leverage,
    }));
  const workerPendingOrders = workerStatus?.snapshot?.pendingOrders ?? [];
  const workerTrackers = (workerStatus?.snapshot?.trackers ?? []);
  const signalFilteredWorkerTrackers = filterBySignalTypes(workerTrackers, signalTypeFilter, patternTfFilter, smcTfFilter);
  const signalFilteredCombinedTrackers = filterBySignalTypes(combinedTrackers, signalTypeFilter, patternTfFilter, smcTfFilter);
  const signalFilteredTrackersToDisplay = filterBySignalTypes(trackersToDisplay, signalTypeFilter, patternTfFilter, smcTfFilter);

  const workerScanningCount = signalFilteredWorkerTrackers.filter(t => t.phase === 'scanning' || t.phase === 'waiting').length;
  const workerSignalCount = signalFilteredWorkerTrackers.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal').length;
  const workerActiveCount = signalFilteredWorkerTrackers.filter(t => t.phase === 'active').length;
  const workerDoneTrackers = signalFilteredWorkerTrackers.filter(t => {
    if (t.phase !== 'done') return false;
    const doneTime = t.exitTime || (t as any).przHitTime || (t as any).entryTime || (t as any).obTime;
    return (Date.now() / 1000) - doneTime <= doneRetentionSeconds(t);
  }).sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0));
  const workerDoneCount = workerDoneTrackers.length;
  const workerTrackersToDisplay = phaseFilter === 'scanning'
    ? signalFilteredWorkerTrackers.filter(t => t.phase === 'scanning' || t.phase === 'waiting')
    : phaseFilter === 'signal'
      ? signalFilteredWorkerTrackers.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal')
      : phaseFilter === 'completed'
        ? signalFilteredWorkerTrackers.filter(t => t.phase === 'completed')
        : phaseFilter === 'active'
          ? signalFilteredWorkerTrackers.filter(t => t.phase === 'active')
          : phaseFilter === 'done'
            ? workerDoneTrackers
            : signalFilteredWorkerTrackers;
  const useWorkerSnapshot = workerStatus?.snapshot !== null && workerStatus?.snapshot !== undefined;
  // 워커 오프라인이면 MAIN 직접조회 equity로 총 자산 표시(워커 없이도). 봇 계좌는 활성 봇 없으면 0.
  const directEquity = directMain.hasKey ? directMain.equity : null;
  const displayTotalAssets = workerMainBalance !== null && workerMainBalance !== undefined
    ? workerMainBalance + workerMainUnrealizedUsdt + (workerSubBalance ?? 0)
    : (directEquity != null ? directEquity : totalAssets);
  const displayMainTotalEquity = workerMainBalance !== null && workerMainBalance !== undefined
    ? workerMainBalance + workerMainUnrealizedUsdt
    : (directEquity != null ? directEquity : mainTotalEquity);
  const displaySubTotalEquity = workerSubBalance !== null && workerSubBalance !== undefined
    ? workerSubBalance
    : subTotalEquity;
  const displayHasMainBalance = (workerMainBalance !== null && workerMainBalance !== undefined) || directEquity != null
    ? true
    : hasMainBalance;
  const onlineCount = workerOnline ? 1 : 0;
  const totalBotCount = 1;

  const handleOpenHistory = () => {
    setIsTradesModalOpen(true);
    onOpenHistory?.();
  };

  return (
    <PullToRefresh onRefresh={refreshAll} scrollTarget={scrollRef}>
    <div className="live-page" style={{ background: '#000' }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', touchAction: 'pan-y', overscrollBehavior: 'contain', paddingBottom: 'calc(60px + env(safe-area-inset-bottom))' }}>
        <div className="live-top-section" style={{ paddingBottom: '18px' }}>
          <LiveHeader
            onlineCount={onlineCount}
            totalBotCount={totalBotCount}
            loading={loading || workerLoading}
            label="Worker"
            rightAction={
              <button
                type="button"
                aria-label="알림"
                onClick={() => setAlertOpen(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#8e929a', cursor: 'pointer', display: 'inline-flex' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
            }
          />
          
          <LiveAssetSummary
            totalAssets={displaySubTotalEquity} usdKrw={usdKrw}
            showCurrencyDropdown={showCurrencyDropdown} 
            setShowCurrencyDropdown={setShowCurrencyDropdown} onOpenHistory={handleOpenHistory}
          />
          
        </div>

        <LiveControlBar 
          tab={tab} setTab={setTab} 
          displayPositionsCount={useWorkerSnapshot ? workerPositions.length : displayPositions.length} 
          mainPositionsCount={displayMainStatus?.positions.length ?? 0}
          mainPendingCount={displayMainStatus?.pendingOrders.length ?? 0} 
          subPendingCount={useWorkerSnapshot ? workerPendingOrders.length : subPendingOrders.length}
          scanningCount={useWorkerSnapshot ? workerScanningCount : scanningCount}
          signalCount={useWorkerSnapshot ? workerSignalCount : signalCount}
          activeCount={useWorkerSnapshot ? workerActiveCount : activeCount}
          doneCount={useWorkerSnapshot ? workerDoneCount : doneCount}
          phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter} 
          signalTypeFilter={signalTypeFilter} setSignalTypeFilter={setSignalTypeFilter}
          patternTfFilter={patternTfFilter} setPatternTfFilter={setPatternTfFilter}
          smcTfFilter={smcTfFilter} setSmcTfFilter={setSmcTfFilter}
          selectedBot={selectedBot} setSelectedBot={setSelectedBot} 
          combinedTrackersLength={useWorkerSnapshot ? signalFilteredWorkerTrackers.length : signalFilteredCombinedTrackers.length}
          useWorkerSnapshot={useWorkerSnapshot}
        />

        <div style={{ padding: '12px 14px 0', minHeight: 'calc(100dvh - max(60px, max(18px, env(safe-area-inset-top)) + 32px) - 60px)' }}>
          {tab === 'position' && (
            <LivePositionTab 
              mainStatus={displayMainStatus}
              displayPositions={useWorkerSnapshot ? workerPositions : displayPositions} 
              realtimePrices={realtimePrices} botResults={botResults} 
              usdKrw={usdKrw} getTickDecimals={getTickDecimals}
              onSelectSymbol={onSelectSymbol} onProductTypeChange={onProductTypeChange} onOpenChart={onOpenChart}
            />
          )}
          {tab === 'pending' && (
            <LivePendingTab 
              mainStatus={displayMainStatus}
              subPendingOrders={useWorkerSnapshot ? workerPendingOrders : subPendingOrders}
              getTickDecimals={getTickDecimals}
            />
          )}
          {tab === 'monitoring' && (
            <LiveMonitoringTab 
              combinedTrackers={useWorkerSnapshot ? signalFilteredWorkerTrackers : signalFilteredCombinedTrackers}
              trackersToDisplay={useWorkerSnapshot ? workerTrackersToDisplay : signalFilteredTrackersToDisplay} 
              botResults={botResults} getTickDecimals={getTickDecimals}
              phaseFilter={phaseFilter}
              realtimePrices={realtimePrices}
              onSelectSymbol={onSelectSymbol} onProductTypeChange={onProductTypeChange} onOpenChart={onOpenChart}
              onOpenTrackerChart={onOpenTrackerChart}
            />
          )}
        </div>
      </div>

      <LiveTradesModal
        isTradesModalOpen={isTradesModalOpen} setIsTradesModalOpen={setIsTradesModalOpen}
        tradeFilter={tradeFilter} setTradeFilter={setTradeFilter}
        selectedBot={selectedBot} displayTrades={displayTrades} getTickDecimals={getTickDecimals}
      />
      <AlertSheet isOpen={alertOpen} onClose={() => setAlertOpen(false)} />
    </div>
    </PullToRefresh>
  );
}
