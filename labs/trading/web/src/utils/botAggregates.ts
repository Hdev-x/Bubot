import type { BotPendingOrder, BotState, MainAccountStatus, PositionState, TradeLog, TrackerState } from '@web/shared/types/bot';

export type BotResultMap = Record<string, { success: boolean; data: BotState | null; error: string | null }>;
export type BotStatusResultLike = { botKey: string; data: BotState | null; error: unknown };

type PhaseFilter = 'scanning' | 'signal' | 'active' | string;

interface LiveBotAggregateParams {
  botResults: BotResultMap;
  mainStatus: MainAccountStatus | null;
  realtimePrices: Record<string, number>;
  selectedBot: string;
  tradeFilter: string;
  phaseFilter: PhaseFilter;
}

export function getMainUnrealizedUsdt(mainStatus: MainAccountStatus | null | undefined): number {
  return mainStatus?.positions.reduce((sum, p) => sum + (p.unrealizedPl || 0), 0) ?? 0;
}

export function mergeBotAssetStatus(
  results: BotStatusResultLike[],
  mainUnrealized = 0,
  mainBalanceOpt?: number,
  now = Date.now(),
): { successCount: number; data: BotState | null } {
  let totalBalance = 0;
  let maxMainBalance = mainBalanceOpt ?? 0;
  let firstPosition: PositionState | null = null;
  const mergedPositions: PositionState[] = [];
  let mergedLastPrice: Record<string, number> = {};
  let mergedTrades: TradeLog[] = [];
  let successCount = 0;

  results.forEach(({ data: botState }) => {
    if (!botState) return;

    totalBalance += botState.balance || 0;
    if (mainBalanceOpt === undefined && botState.mainBalance !== undefined) {
      maxMainBalance = Math.max(maxMainBalance, botState.mainBalance);
    }
    if (botState.position) {
      if (!firstPosition) firstPosition = botState.position;
      mergedPositions.push(botState.position);
    }
    if (botState.lastPrice) {
      mergedLastPrice = { ...mergedLastPrice, ...botState.lastPrice };
    }
    if (botState.trades) {
      mergedTrades = [...mergedTrades, ...botState.trades];
    }
    successCount++;
  });

  if (successCount === 0) {
    return { successCount, data: null };
  }

  mergedTrades.sort((a, b) => b.exitTime - a.exitTime);

  return {
    successCount,
    data: {
      status: 'running',
      startedAt: now / 1000,
      balance: totalBalance,
      mainBalance: maxMainBalance,
      mainUnrealized,
      balanceUpdatedAt: now,
      position: firstPosition,
      positions: mergedPositions,
      lastPrice: mergedLastPrice,
      engineStatus: {
        trackers: 0,
        activePositions: [],
        byPhase: {},
      },
      trades: mergedTrades,
    },
  };
}

export function getCombinedPositions(botResults: BotResultMap): PositionState[] {
  const combinedPositions: PositionState[] = [];

  Object.entries(botResults).forEach(([botName, res]) => {
    if (res.success && res.data?.position) {
      combinedPositions.push({
        ...res.data.position,
        botName,
      });
    }
  });

  return combinedPositions;
}

export function getSubPendingOrders(botResults: BotResultMap): BotPendingOrder[] {
  const subPendingOrders: BotPendingOrder[] = [];

  Object.entries(botResults).forEach(([botName, res]) => {
    if (res.success && res.data?.pendingOrder) {
      subPendingOrders.push({ ...res.data.pendingOrder, botName });
    }
  });

  return subPendingOrders;
}

export function getCombinedTrades(botResults: BotResultMap): TradeLog[] {
  let combinedTrades: TradeLog[] = [];

  Object.entries(botResults).forEach(([botName, res]) => {
    if (res.success && res.data?.trades) {
      const mapped = res.data.trades.map(t => ({ ...t, botName }));
      combinedTrades = [...combinedTrades, ...mapped];
    }
  });

  return combinedTrades.sort((a, b) => b.exitTime - a.exitTime);
}

export function getCombinedTrackers(botResults: BotResultMap): TrackerState[] {
  let combinedTrackers: TrackerState[] = [];

  Object.entries(botResults).forEach(([botName, res]) => {
    if (res.success && res.data?.engineStatus?.trackersList) {
      const mapped = res.data.engineStatus.trackersList.map(t => ({ ...t, botName }));
      combinedTrackers = [...combinedTrackers, ...mapped];
    }
  });

  return combinedTrackers
    .sort((a, b) => b.obTime - a.obTime);
}

export function getActiveSymbols(botResults: BotResultMap, mainStatus: MainAccountStatus | null): string[] {
  const combinedPositions = getCombinedPositions(botResults);
  return Array.from(new Set([
    ...(mainStatus?.positions.map(p => p.symbol) || []),
    ...combinedPositions.map(p => p.symbol),
  ]));
}

export function getLiveBotAggregates({
  botResults,
  mainStatus,
  realtimePrices,
  selectedBot,
  tradeFilter,
  phaseFilter,
}: LiveBotAggregateParams) {
  let totalSubBalance = 0;
  let mainBalance = 0;
  let hasMainBalance = false;

  Object.values(botResults).forEach((res) => {
    if (res.success && res.data) {
      totalSubBalance += res.data.balance;
      if (!mainStatus && res.data.mainBalance !== undefined) {
        mainBalance = Math.max(mainBalance, res.data.mainBalance);
        hasMainBalance = true;
      }
    }
  });

  if (mainStatus && mainStatus.balance !== undefined) {
    mainBalance = mainStatus.balance;
    hasMainBalance = true;
  }

  const combinedPositions = getCombinedPositions(botResults);

  const mainUnrealizedUsdt = getMainUnrealizedUsdt(mainStatus);

  const subUnrealizedUsdt = combinedPositions.reduce((sum, pos) => {
    const currentPrice = realtimePrices[pos.symbol] || pos.entryPrice;
    const unrealizedUsdt = (pos.direction === 'long' ? 1 : -1) * (currentPrice - pos.entryPrice) * pos.size;
    return sum + unrealizedUsdt;
  }, 0);

  const totalUnrealizedUsdt = mainUnrealizedUsdt + subUnrealizedUsdt;
  const totalAssets = mainBalance + totalSubBalance + totalUnrealizedUsdt;
  const mainTotalEquity = mainBalance + mainUnrealizedUsdt;
  const subTotalEquity = totalSubBalance + subUnrealizedUsdt;

  const subPendingOrders = getSubPendingOrders(botResults);
  const combinedTrades = getCombinedTrades(botResults);
  const combinedTrackers = getCombinedTrackers(botResults);

  const displayPositions = selectedBot === 'ALL'
    ? combinedPositions
    : combinedPositions.filter(p => p.botName === selectedBot);

  const displayTrades = (selectedBot === 'ALL' ? combinedTrades : combinedTrades.filter(t => t.botName === selectedBot))
    .filter(t => tradeFilter === 'ALL' || t.outcome === tradeFilter);

  let filteredTrackers = selectedBot === 'ALL'
    ? combinedTrackers
    : combinedTrackers.filter(t => t.botName === selectedBot);

  const scanningCount = filteredTrackers.filter(t => t.phase === 'scanning' || t.phase === 'waiting').length;
  const signalCount = filteredTrackers.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal').length;
  const completedCount = filteredTrackers.filter(t => t.phase === 'completed').length;
  const activeCount = filteredTrackers.filter(t => t.phase === 'active').length;
  const doneTrackers = filteredTrackers.filter(t => {
    if (t.phase !== 'done') return false;
    const doneTime = t.exitTime || (t as any).przHitTime || (t as any).entryTime || (t as any).obTime;
    return (Date.now() / 1000) - doneTime <= 7 * 24 * 60 * 60;
  }).sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)).slice(0, 50);
  const doneCount = doneTrackers.length;

  if (phaseFilter === 'scanning') {
    filteredTrackers = filteredTrackers.filter(t => t.phase === 'scanning' || t.phase === 'waiting');
  } else if (phaseFilter === 'signal') {
    filteredTrackers = filteredTrackers.filter(t => t.phase === 'waiting_entry' || t.phase === 'signal');
  } else if (phaseFilter === 'completed') {
    filteredTrackers = filteredTrackers.filter(t => t.phase === 'completed');
  } else if (phaseFilter === 'active') {
    filteredTrackers = filteredTrackers.filter(t => t.phase === 'active');
  } else if (phaseFilter === 'done') {
    filteredTrackers = doneTrackers;
  }

  const activeSymbols = getActiveSymbols(botResults, mainStatus);

  return {
    totalSubBalance,
    mainBalance,
    hasMainBalance,
    combinedPositions,
    mainUnrealizedUsdt,
    subUnrealizedUsdt,
    totalUnrealizedUsdt,
    totalAssets,
    mainTotalEquity,
    subTotalEquity,
    subPendingOrders,
    combinedTrades,
    combinedTrackers,
    displayPositions,
    displayTrades,
    trackersToDisplay: filteredTrackers,
    scanningCount,
    signalCount,
    completedCount,
    activeCount,
    doneCount,
    activeSymbols,
  };
}
