import { authHeader } from './authApi';
import type { StrategyConfig as SchemaConfig } from '../../../../shared/strategy-schema';
import type { BacktestReport } from '../utils/backtestReport';

/** 백테스트 실험 이력 1건 (서버 row — config/symbols/report는 파싱된 형태로 노출) */
export interface BacktestRun {
  id: number;
  name: string | null;
  config: SchemaConfig;
  symbols: string[];
  rangeStart: string | null; // 'YYYY-MM-DD'
  rangeEnd: string;
  report: BacktestReport;
  configHash: string;
  createdAt: string;
}

export interface SaveBacktestRunInput {
  name: string;
  config: SchemaConfig;
  symbols: string[];
  rangeStart?: string;
  rangeEnd: string;
  report: BacktestReport;
  configHash: string;
}

/** 설정+심볼+기간을 결정적 문자열로 만들어 해시 (djb2 → 16진수) */
export function hashRunConfig(config: SchemaConfig, symbols: string[], rangeStart?: string): string {
  const s = JSON.stringify(config) + '|' + [...symbols].sort().join(',') + '|' + (rangeStart ?? '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const parseMaybe = <T,>(v: unknown): T => typeof v === 'string' ? JSON.parse(v) as T : v as T;

export async function fetchBacktestRuns(limit = 50): Promise<BacktestRun[]> {
  const res = await fetch(`/api/user/backtest-runs?limit=${limit}`, { headers: authHeader() });
  if (!res.ok) throw new Error('실험 이력 조회 실패');
  const data = await res.json() as { runs: any[] };
  return (data.runs ?? []).map(r => ({
    ...r,
    config: parseMaybe<SchemaConfig>(r.config),
    symbols: parseMaybe<string[]>(r.symbols),
    report: parseMaybe<BacktestReport>(r.report),
  }));
}

export async function saveBacktestRun(input: SaveBacktestRunInput): Promise<void> {
  const res = await fetch('/api/user/backtest-runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({
      name: input.name,
      config: JSON.stringify(input.config),
      symbols: JSON.stringify(input.symbols),
      rangeStart: input.rangeStart ?? null,
      rangeEnd: input.rangeEnd,
      report: JSON.stringify(input.report),
      configHash: input.configHash,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? '실험 이력 저장 실패');
  }
}

export async function deleteBacktestRun(id: number): Promise<void> {
  const res = await fetch(`/api/user/backtest-runs/${id}`, { method: 'DELETE', headers: authHeader() });
  if (!res.ok) throw new Error('실험 이력 삭제 실패');
}
