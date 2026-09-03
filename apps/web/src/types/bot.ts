export interface PositionState {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  tpPrice: number;
  sl1Price: number;
  sl2Price: number;
  entryTime: number;
  botName?: string;
}

export interface TradeLog {
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  outcome: string;
  entryTime: number;
  exitTime: number;
  pnlPct: number;
  botName?: string;
}

export interface TrackerState {
  symbol: string;
  type: 'bull' | 'bear';
  phase: 'waiting' | 'scanning' | 'waiting_entry' | 'signal' | 'active' | 'done' | 'completed';
  mid: number;
  obTime: number;
  lookAfterTime: number;
  waitCount: number;
  holdCount: number;
  exitTime?: number;
  strategy?: string;
  patternName?: string;
  slPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  exitReason?: string;
  exitPrice?: number;
  przHitTime?: number;
  przPrice?: number;
  entryTime?: number;
  entryPrice?: number;
  monitorKind?: string;
  signature?: string;
  xabc?: {
    X?: { time: number; price: number };
    A?: { time: number; price: number };
    B?: { time: number; price: number };
    C?: { time: number; price: number };
    D?: { time: number; price: number };
  };
  cTime?: number;
  botName?: string;
}

export interface SymbolConfig {
  tpPercent: number;
  slPercent: number;
}

export interface BotPendingOrder {
  orderId: string;
  symbol: string;
  direction: 'long' | 'short';
  price: number;
  tpPrice: number;
  sl1Price: number;
  botName?: string;
}

export interface BotStats {
  completed: number;
  wins: number;
  winRate: number;
  tpCount: number;
  sl1Count: number;
  sl2Count: number;
  sl3Count: number;
  timeoutCount: number;
  totalRealizedUsdt: number;
  initialCapital: number;
  totalReturnPct: number;
}

export interface BotState {
  status: 'running' | 'stopped';
  startedAt: number;
  balance: number;
  balanceUpdatedAt: number;
  mainBalance?: number;
  mainUnrealized?: number;
  /** 메인계정 실제 포지션. 총자산(미실현손익) 계산의 단일 소스. */
  mainPositions?: MainPosition[];
  position: PositionState | null;
  positions?: PositionState[];
  pendingOrder?: BotPendingOrder | null;
  lastPrice: Record<string, number>;
  engineStatus: {
    trackers: number;
    activePositions: string[];
    byPhase: Record<string, number>;
    trackersList?: TrackerState[];
  };
  trades: TradeLog[];
  symbolConfigs?: Record<string, SymbolConfig>;
  stats?: BotStats;
}

export interface MainPosition {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  size: number;
  markPrice: number;
  unrealizedPl: number;
  leverage: number;
  marginMode: string;
}

export interface PendingOrder {
  orderId: string;
  symbol: string;
  direction: 'long' | 'short';
  price: number;
  size: number;
  tpPrice: number | null;
  sl1Price: number | null;
  createTime: number;
  orderType: string;
}

export interface MainAccountStatus {
  balance: number;
  positions: MainPosition[];
  pendingOrders: PendingOrder[];
}
