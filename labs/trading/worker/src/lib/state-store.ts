// 봇 인메모리 상태 저장소 — API 서버가 읽어서 프론트에 전달
// 청산 거래는 JSONL 파일로 영속화하여 재시작에도 누적 통계 유지

import * as fs from 'fs';
import * as path from 'path';

export interface PositionState {
  symbol:     string;
  direction:  'long' | 'short';
  entryPrice: number;
  size:       number;
  tpPrice:    number;
  sl1Price:   number;
  sl2Price:   number;
  entryTime:  number;
}

export interface TradeLog {
  symbol:     string;
  direction:  'long' | 'short';
  entryPrice: number;
  exitPrice:  number;
  outcome:    'tp1' | 'tp2' | 'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout' | '취소' | '진입';
  entryTime:  number;
  exitTime:   number;
  pnlPct:     number;  // 비레버리지 손익 %  ((exit-entry)/entry*100)
  realizedUsdt?: number;  // 실현 손익 USDT (청산 거래만 기록)
}

// 누적 매매 통계 (청산 거래 기준)
export interface BotStats {
  completed:         number;  // 청산 완료 거래 수 (진입/취소 제외)
  wins:              number;  // pnl > 0
  winRate:           number;  // %
  tpCount:           number;  // 레거시용 (tp1Count 사용 권장)
  tp1Count:          number;
  tp2Count:          number;
  sl1Count:          number;
  sl2Count:          number;
  sl3Count:          number;
  timeoutCount:      number;
  totalRealizedUsdt: number;  // 실현 손익 합
  initialCapital:    number;  // 초기 자본 (총수익률 기준)
  totalReturnPct:    number;  // (totalRealizedUsdt / initialCapital) × 100
}

export interface BotSettings {
  tpPercent: number;
  slPercent: number;
  useBbStrategy?: boolean;
  useFvgStrategy?: boolean;
}

export interface PendingOrderState {
  orderId:   string;
  symbol:    string;
  direction: 'long' | 'short';
  price:     number;
  tpPrice:   number;
  sl1Price:  number;
}

export interface BotState {
  status:           'running' | 'stopped';
  startedAt:        number;
  balance:          number;
  balanceUpdatedAt: number;
  mainBalance?:     number | null;
  position:         PositionState | null;
  pendingOrder:     PendingOrderState | null;
  lastPrice:        Record<string, number>;
  engineStatus: {
    trackers:        number;
    activePositions: string[];
    byPhase:         Record<string, number>;
    trackersList?:   {
      symbol:        string;
      type:          'bull' | 'bear';
      phase:         'waiting' | 'scanning' | 'waiting_entry' | 'active' | 'done';
      mid:           number;
      obTime:        number;
      lookAfterTime: number;
      waitCount:     number;
      holdCount:     number;
    }[];
  };
  trades: TradeLog[];  // 최근 20개, 최신순
  settings: BotSettings;
  symbolConfigs?: Record<string, BotSettings>;
  stats: BotStats;
}

const state: BotState = {
  status:           'running',
  startedAt:        Math.floor(Date.now() / 1000),
  balance:          0,
  balanceUpdatedAt: 0,
  mainBalance:      null,
  position:         null,
  pendingOrder:     null,
  lastPrice:        {},
  engineStatus:     { trackers: 0, activePositions: [], byPhase: {} },
  trades:           [],
  settings:         { tpPercent: 0.5, slPercent: 3.0, useBbStrategy: false },
  symbolConfigs:    {},
  stats:            { completed: 0, wins: 0, winRate: 0, tpCount: 0, tp1Count: 0, tp2Count: 0, sl1Count: 0, sl2Count: 0, sl3Count: 0, timeoutCount: 0, totalRealizedUsdt: 0, initialCapital: 0, totalReturnPct: 0 },
};

// ── 청산 거래 영속화 (JSONL) ──────────────────────────────
const DATA_DIR = process.env.TRADE_DATA_DIR || path.resolve(process.cwd(), 'data');
let tradeFile: string | null = null;
const CLOSED = new Set(['tp', 'tp1', 'tp2', 'sl1', 'sl2', 'sl3', 'timeout']);

function applyToStats(t: TradeLog) {
  if (!CLOSED.has(t.outcome)) return;
  const s = state.stats;
  s.completed++;
  if ((t.pnlPct ?? 0) > 0) s.wins++; // 추후 덮어씌움
  if      (t.outcome === 'tp' || t.outcome === 'tp1') { s.tpCount++; s.tp1Count++; }
  else if (t.outcome === 'tp2')     s.tp2Count++;
  else if (t.outcome === 'sl1')     s.sl1Count++;
  else if (t.outcome === 'sl2')     s.sl2Count++;
  else if (t.outcome === 'sl3')     s.sl3Count++;
  else if (t.outcome === 'timeout') s.timeoutCount++;
  s.totalRealizedUsdt += (t.realizedUsdt ?? 0);
}
function finalizeStats() {
  const s = state.stats;
  s.wins = s.tp1Count + s.tp2Count; // 배타적 버킷: wins는 (TP1 + TP2) 로 재계산
  s.winRate        = s.completed > 0 ? (s.wins / s.completed) * 100 : 0;
  s.totalReturnPct = s.initialCapital > 0 ? (s.totalRealizedUsdt / s.initialCapital) * 100 : 0;
}

export const store = {
  get(): BotState {
    return {
      ...state,
      trades: [...state.trades],
      settings: { ...state.settings },
      symbolConfigs: state.symbolConfigs ? { ...state.symbolConfigs } : undefined,
      stats: { ...state.stats },
    };
  },

  // 부팅 시 1회: 파일 로드 → 누적 통계 복원
  initPersistence(symbol: string, initialCapital: number) {
    state.stats.initialCapital = initialCapital;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      tradeFile = path.join(DATA_DIR, `trades-${symbol}.jsonl`);
      if (fs.existsSync(tradeFile)) {
        const lines = fs.readFileSync(tradeFile, 'utf8').split('\n').filter(Boolean);
        const parsed: TradeLog[] = [];
        for (const ln of lines) {
          try { const t = JSON.parse(ln) as TradeLog; applyToStats(t); parsed.push(t); } catch { /* skip */ }
        }
        state.trades = parsed.slice(-20).reverse(); // UI용 최근 20개 (최신순)
        finalizeStats();
        console.log(`[Store] 📂 거래기록 로드 | ${tradeFile} | 완료거래 ${state.stats.completed}건, 승률 ${state.stats.winRate.toFixed(1)}%, 총수익률 ${state.stats.totalReturnPct.toFixed(2)}%`);
      }
    } catch (e) {
      console.error('[Store] ⚠️ 거래기록 로드 실패:', (e as Error).message);
    }
  },

  // 청산 거래 기록 — 파일 append + 통계 갱신 + UI 리스트
  addClosedTrade(trade: TradeLog) {
    state.trades.unshift(trade);
    if (state.trades.length > 20) state.trades.pop();
    if (tradeFile) {
      try { fs.appendFileSync(tradeFile, JSON.stringify(trade) + '\n'); }
      catch (e) { console.error('[Store] ⚠️ 거래기록 저장 실패:', (e as Error).message); }
    }
    applyToStats(trade);
    finalizeStats();
  },

  setBalance(balance: number) {
    state.balance          = balance;
    state.balanceUpdatedAt = Math.floor(Date.now() / 1000);
  },

  setMainBalance(balance: number | null) {
    state.mainBalance = balance;
  },

  setPrice(symbol: string, price: number) {
    state.lastPrice[symbol] = price;
  },

  setEngineStatus(status: BotState['engineStatus']) {
    state.engineStatus = status;
  },

  setPosition(pos: PositionState | null) {
    state.position = pos;
  },

  setPendingOrder(order: PendingOrderState | null) {
    state.pendingOrder = order;
  },

  addTrade(trade: TradeLog) {
    state.trades.unshift(trade);
    if (state.trades.length > 20) state.trades.pop();
  },

  setStatus(s: 'running' | 'stopped') {
    state.status = s;
  },

  setSettings(settings: BotSettings) {
    state.settings = { ...settings };
  },

  setSymbolConfigs(configs: Record<string, BotSettings>) {
    state.symbolConfigs = { ...configs };
  },
};
