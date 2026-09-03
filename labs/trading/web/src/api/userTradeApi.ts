// 사용자 체결기록(trades) API — 전략 섹션 페이퍼 실증 현황 표시용. 본인 거래만 반환됨.
import { authedGetJson } from '@web/api/client';

export interface UserTrade {
  id: number;
  configId: number;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnlUsdt: number;
  outcome: string;        // tp | tp1 | tp2 | sl1 | sl2 | timeout | stopped
  entryTime: number;      // epoch 초
  exitTime: number;       // epoch 초
  tags: PaperTradeTags | null; // F4 태깅(JSON) — 페이퍼 매매는 paper:true
}

// 워커 buildTradeTags()가 남기는 필드 (전부 optional — 실거래엔 없을 수 있음)
export interface PaperTradeTags {
  paper?: boolean;
  pattern?: string;
  signalTime?: number;
  przPrice?: number;
  tp1Price?: number;
  tp2Price?: number;
  slPrice?: number;
  regimeAtArm?: 'up' | 'down' | 'na';
  regimeAtFill?: 'up' | 'down' | 'na';
  entryLinePrice?: number;
  fillPrice?: number;
  slippagePct?: number;
  riskUsdt?: number;
  riskMultiplier?: number;
  ddAtEntry?: number;
}

export async function fetchUserTrades(limit = 200): Promise<UserTrade[]> {
  try {
    const d = await authedGetJson(`/api/user/trades?limit=${limit}`) as { trades?: unknown[] } | null;
    if (!Array.isArray(d?.trades)) return [];
    return (d!.trades as Record<string, unknown>[]).map(t => ({
      id: Number(t.id),
      configId: Number(t.configId),
      symbol: String(t.symbol ?? ''),
      direction: (t.direction === 'short' ? 'short' : 'long'),
      entryPrice: Number(t.entryPrice) || 0,
      exitPrice: Number(t.exitPrice) || 0,
      size: Number(t.size) || 0,
      pnlUsdt: Number(t.pnlUsdt) || 0,
      outcome: String(t.outcome ?? ''),
      entryTime: Number(t.entryTime) || 0,
      exitTime: Number(t.exitTime) || 0,
      tags: parseTags(t.tags),
    }));
  } catch {
    return [];
  }
}

function parseTags(raw: unknown): PaperTradeTags | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as PaperTradeTags;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as PaperTradeTags; } catch { return null; }
  }
  return null;
}
