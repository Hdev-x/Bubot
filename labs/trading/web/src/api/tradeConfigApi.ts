// 매매설정 API — /api/user/trade-configs (로그인 JWT)
import { authHeader } from '@web/api/client';

export type StrategyType = 'OB' | 'FVG' | 'BB' | 'HARMONIC' | 'ABCD';
export type ConfigStatus = 'IDLE' | 'RUNNING' | 'STOPPED_LOSS' | 'ERROR' | 'KILLED';

// SignalEngineParams 부분집합 (trader signal-engine.ts와 매핑)
export interface TradeParams {
  tpPercent?: number;
  slPercent?: number;
  maxWaitCandles?: number;
  maxHoldCandles?: number;
  longOnly?: boolean;
  useSl3?: boolean;
  useHarmonicStrategy?: boolean;
  useAbcdStrategy?: boolean;
  harmonicEntryMode?: 'immediate' | 'close' | 'split';
  harmonicUseEqFilter?: boolean;
  abcdEntryMode?: 'immediate' | 'close';
  abcdTp1Pct?: number;
  abcdTp2Pct?: number;
  abcdEnabledRatios?: string[];
  abcdLogScale?: boolean;
}

export interface TradeConfig {
  id: number;
  exchange: string;
  symbol: string;
  botTarget: string;     // 이 설정을 돌릴 봇(키 슬롯): SOL=Bot1 ...
  strategy: StrategyType;
  params: string;        // JSON 문자열 (서버 저장형)
  investUsdt: number;
  leverage: number;
  maxLossPct: number;
  active: boolean;
  status: ConfigStatus;
  realizedPnl: number;
  createdAt?: string;
}

export interface SaveConfigInput {
  symbol: string;
  botTarget: string;
  strategy: StrategyType;
  params: TradeParams;
  investUsdt: number;
  leverage: number;
  maxLossPct: number;
  exchange?: string;
}

function toPayload(input: SaveConfigInput) {
  return { ...input, params: JSON.stringify(input.params), exchange: input.exchange ?? 'BITGET' };
}

async function unwrap(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? fallback);
  }
}

export async function fetchTradeConfigs(): Promise<TradeConfig[]> {
  const res = await fetch('/api/user/trade-configs', { headers: authHeader() });
  if (!res.ok) throw new Error('매매설정 조회 실패');
  const data = await res.json() as { configs: TradeConfig[] };
  return data.configs ?? [];
}

export async function createTradeConfig(input: SaveConfigInput): Promise<void> {
  const res = await fetch('/api/user/trade-configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(toPayload(input)),
  });
  await unwrap(res, '매매설정 저장 실패');
}

export async function updateTradeConfig(id: number, input: SaveConfigInput): Promise<void> {
  const res = await fetch(`/api/user/trade-configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(toPayload(input)),
  });
  await unwrap(res, '매매설정 수정 실패');
}

export async function setTradeConfigActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`/api/user/trade-configs/${id}/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ active }),
  });
  await unwrap(res, '활성화 변경 실패');
}

export async function deleteTradeConfig(id: number): Promise<void> {
  const res = await fetch(`/api/user/trade-configs/${id}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  await unwrap(res, '매매설정 삭제 실패');
}
