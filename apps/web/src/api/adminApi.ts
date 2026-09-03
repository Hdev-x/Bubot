// 운영자(admin) 전용 API — 글로벌 kill switch
import { authHeader } from './authApi';
import type { MainPosition, PendingOrder, TrackerState } from '../types/bot';

export async function getKillSwitch(): Promise<boolean> {
  const res = await fetch('/api/admin/kill-switch', { headers: authHeader() });
  if (!res.ok) throw new Error('kill switch 상태 조회 실패');
  const d = await res.json();
  return Boolean(d.active);
}

export async function setKillSwitch(active: boolean): Promise<boolean> {
  const res = await fetch('/api/admin/kill-switch', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error('kill switch 변경 실패');
  const d = await res.json();
  return Boolean(d.active);
}

// ── 자동매매 ON/OFF ───────────────────────────────────────
export async function getTradingEnabled(): Promise<boolean> {
  const res = await fetch('/api/admin/trading-enabled', { headers: authHeader() });
  if (!res.ok) throw new Error('자동매매 상태 조회 실패');
  const d = await res.json();
  return Boolean(d.enabled);
}

export async function setTradingEnabled(enabled: boolean): Promise<boolean> {
  const res = await fetch('/api/admin/trading-enabled', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('자동매매 변경 실패');
  const d = await res.json();
  return Boolean(d.enabled);
}

// ── 모니터링 하모닉 신호 푸시 알림 TF 설정 ────────────────
export interface HarmonicAlertTfs { m30: boolean; h4: boolean; d1: boolean; }

export async function getHarmonicAlerts(): Promise<HarmonicAlertTfs> {
  const res = await fetch('/api/admin/harmonic-alerts', { headers: authHeader() });
  if (!res.ok) throw new Error('하모닉 알림 설정 조회 실패');
  const d = await res.json();
  return { m30: Boolean(d.m30), h4: Boolean(d.h4), d1: Boolean(d.d1) };
}

export async function setHarmonicAlerts(tfs: HarmonicAlertTfs): Promise<HarmonicAlertTfs> {
  const res = await fetch('/api/admin/harmonic-alerts', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(tfs),
  });
  if (!res.ok) throw new Error('하모닉 알림 설정 변경 실패');
  const d = await res.json();
  return { m30: Boolean(d.m30), h4: Boolean(d.h4), d1: Boolean(d.d1) };
}

// ── 통합 워커 상태 ────────────────────────────────────────
export interface WorkerConfig {
  id: number;
  memberId: string;
  symbol: string;
  strategy: string;
  investUsdt: number;
  leverage: number;
  hasPosition: boolean;
  direction: 'long' | 'short' | null;
  entryPrice: number | null;
  tpPrice: number | null;
  sl1Price: number | null;
  sl2Price: number | null;
  size: number | null;
  botName?: string;
}

export interface WorkerPendingOrder {
  configId: number;
  memberId: string;
  symbol: string;
  orderId: string;
  direction: 'long' | 'short';
  price: number;
  size: number;
  tpPrice: number | null;
  sl1Price: number | null;
  createTime: number;
  orderType: string;
  botName?: string;
}

export interface WorkerTracker {
  symbol: string;
  type: 'bull' | 'bear';
  isBb?: boolean;
  phase: 'waiting' | 'scanning' | 'waiting_entry' | 'signal' | 'completed' | 'active' | 'done';
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
  cTime?: number;
  xabc?: {
    X?: { time: number; price: number };
    A?: { time: number; price: number };
    B?: { time: number; price: number };
    C?: { time: number; price: number };
    D?: { time: number; price: number };
  };
  signature: string;
  configIds: number[];
  monitorKind?: string;  // 관찰 엔진 종류 (HARMONIC_30m, ABCD_1w, SMC_1d 등) — 타임프레임 필터용
  botName?: string;
}

export interface WorkerStatus {
  alive: boolean;
  updatedAt: number;
  snapshot: {
    ts: number;
    killed: boolean;
    tradingEnabled?: boolean;
    mainBalance: number | null;
    subBalance: number | null;
    mainPositions?: MainPosition[];
    subPositions?: MainPosition[];
    mainPendingOrders?: PendingOrder[];
    engineCount: number;
    symbols: string[];
    pendingOrders: WorkerPendingOrder[];
    trackers: WorkerTracker[];
    configs: WorkerConfig[];
    paperWaiting?: PaperWaitingSetup[];
  } | null;
}

/** 페이퍼 진입대기(0.5 라인 체결 대기) 셋업 — 워커 스냅샷 paperWaiting */
export interface PaperWaitingSetup {
  symbol: string;
  patternName: string;
  direction: 'long' | 'short';
  entryPrice: number;
  przPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  signalTime: number;
  regimeAtArm?: 'up' | 'down' | 'na' | null;
}

/** 페이퍼 진입대기 목록만 조회 (워커 상태 실패 시 빈 배열 — 비admin/워커 다운 안전) */
export async function fetchPaperWaiting(): Promise<PaperWaitingSetup[]> {
  try {
    const s = await getWorkerStatus();
    return s.snapshot?.paperWaiting ?? [];
  } catch {
    return [];
  }
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const res = await fetch('/api/admin/worker/status', { headers: authHeader() });
  if (!res.ok) throw new Error('워커 상태 조회 실패');
  return res.json();
}

export async function fetchHarmonicClosedPatterns(params: {
  symbol: string;
  interval: string;
  exitReason?: 'sl' | 'tp' | 'cancelled';
  limit?: number;
}): Promise<TrackerState[]> {
  const query = new URLSearchParams({
    symbol: params.symbol,
    interval: params.interval,
    exitReason: params.exitReason ?? 'sl',
    limit: String(params.limit ?? 200),
  });
  const res = await fetch(`/api/admin/harmonic-closed-patterns?${query.toString()}`, { headers: authHeader() });
  if (!res.ok) throw new Error('하모닉 종료 패턴 조회 실패');
  const data = await res.json() as { patterns?: any[] };
  return (data.patterns ?? []).map((p): TrackerState => ({
    ...p,
    symbol: String(p.symbol ?? params.symbol).toUpperCase(),
    type: p.type === 'bear' ? 'bear' : 'bull',
    phase: 'done',
    mid: Number(p.mid ?? p.entryPrice ?? p.przPrice ?? 0),
    obTime: Number(p.obTime ?? p.przHitTime ?? p.exitTime ?? p.cTime ?? 0),
    lookAfterTime: Number(p.lookAfterTime ?? 0),
    waitCount: Number(p.waitCount ?? 0),
    holdCount: Number(p.holdCount ?? 0),
    exitReason: String(p.exitReason ?? params.exitReason ?? 'sl'),
    monitorKind: p.monitorKind ?? `HARMONIC_${p.interval ?? params.interval}`,
    signature: p.signature,
  }));
}
