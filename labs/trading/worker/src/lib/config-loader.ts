// 매매설정 로더 — Spring 내부 API(/api/internal/trade-configs)에서 활성 설정을 가져온다.
// 내부 토큰(INTERNAL_API_TOKEN = Spring app.bot.api-token)으로만 접근.
import type { SignalEngineParams } from './signal-engine.ts';

const INTERNAL_API_URL   = process.env.INTERNAL_API_URL;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

export interface TradeConfig {
  id: number;
  memberId: string;
  exchange: string;
  symbol: string;
  botTarget: string;                 // 이 설정을 돌릴 봇(키 슬롯): SOL=Bot1 ...
  strategy: 'OB' | 'FVG' | 'BB' | 'HARMONIC' | 'ABCD';
  params: Record<string, unknown>;   // SignalEngineParams 부분집합
  investUsdt: number;
  leverage: number;
  maxLossPct: number;
  status: string;
}

function headers(): Record<string, string> {
  return { 'X-Internal-Token': INTERNAL_API_TOKEN ?? '', 'Content-Type': 'application/json' };
}

/** 전체 활성 설정 조회. 내부 API 미설정 시 빈 배열. */
// 성공(200) 시에만 배열 반환. 실패(네트워크·5xx·미설정)는 null → 호출부가 "진짜 0개"와 구분해
// 엔진·포지션을 함부로 정리하지 않도록 한다. (배포 중 Tomcat 순단 시 전 엔진 재웜업·포지션 청산 방지)
export async function fetchActiveConfigs(): Promise<TradeConfig[] | null> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return null;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/active`, { headers: headers() });
    if (!res.ok) {
      console.warn(`[config] 활성 설정 조회 실패(${res.status}) — reconcile 스킵`);
      return null;
    }
    const data = await res.json() as { configs: any[] };
    return (data.configs ?? []).map(parseConfig);
  } catch (e) {
    console.warn(`[config] 활성 설정 조회 예외:`, (e as Error).message);
    return null;
  }
}

/** 통합 워커 상태 스냅샷을 Spring에 보고(대시보드 표시용). 실패해도 무시. */
export async function reportWorkerStatus(snapshot: unknown): Promise<void> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return;
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/worker/status`, {
      method: 'POST', headers: headers(), body: JSON.stringify(snapshot),
    });
  } catch { /* 대시보드용이라 실패 무시 */ }
}

/** 글로벌 kill switch 상태. 조회 실패 시 false(안전: 기존 동작 유지). */
export async function fetchKillSwitch(): Promise<boolean> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return false;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/kill-switch`, { headers: headers() });
    if (!res.ok) return false;
    const d = await res.json() as { active?: boolean };
    return Boolean(d.active);
  } catch {
    return false;
  }
}

/** 글로벌 kill switch 설정 — 워커 안전장치(일일 손실 한도 등) 발동용. 성공 여부 반환. */
export async function setKillSwitch(active: boolean, reason: string): Promise<boolean> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return false;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/kill-switch`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ active, reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 자동매매 ON/OFF 상태. 조회 실패 시 false(안전: 신규 진입 차단). */
export async function fetchTradingEnabled(): Promise<boolean> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return false;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/trading-enabled`, { headers: headers() });
    if (!res.ok) return false;
    const d = await res.json() as { enabled?: boolean };
    return Boolean(d.enabled);
  } catch {
    return false;
  }
}

/** 모니터링 하모닉 신호 푸시 알림이 켜진 TF 집합. 조회 실패 시 빈 set(발송 안 함). */
export async function fetchHarmonicAlertTfs(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return out;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/harmonic-alerts`, { headers: headers() });
    if (!res.ok) return out;
    const d = await res.json() as { m30?: boolean; h4?: boolean; d1?: boolean };
    if (d.m30) out.add('30m');
    if (d.h4) out.add('4h');
    if (d.d1) out.add('1d');
    return out;
  } catch {
    return out;
  }
}

function parseConfig(raw: any): TradeConfig {
  let params: Record<string, unknown> = {};
  try { params = typeof raw.params === 'string' ? JSON.parse(raw.params) : (raw.params ?? {}); }
  catch { params = {}; }
  return {
    id: raw.id,
    memberId: raw.memberId,
    exchange: raw.exchange ?? 'BITGET',
    symbol: raw.symbol,
    botTarget: raw.botTarget ?? 'SOL',
    strategy: raw.strategy ?? 'OB',
    params,
    investUsdt: Number(raw.investUsdt ?? 0),
    leverage: Number(raw.leverage ?? 5),
    maxLossPct: Number(raw.maxLossPct ?? 0),
    status: raw.status ?? 'IDLE',
  };
}

/** TradeConfig → SignalEngineParams 변환 (심볼별 TP/SL 포함) */
export function toEngineParams(cfg: TradeConfig): SignalEngineParams {
  const p = cfg.params as any;
  const tpPercent = Number(p.tpPercent ?? 50.0);
  const slPercent = Number(p.slPercent ?? 5.0);
  const isHarmonic = cfg.strategy === 'HARMONIC' || Boolean(p.useHarmonicStrategy);
  const isAbcd = cfg.strategy === 'ABCD' || Boolean(p.useAbcdStrategy);
  
  return {
    tpPercent,
    slPercent,
    maxWaitCandles: Number(p.maxWaitCandles ?? 40),
    maxHoldCandles: Number(p.maxHoldCandles ?? 100),
    longOnly: Boolean(p.longOnly ?? false),
    useSl3: Boolean(p.useSl3 ?? false),
    useBbStrategy: cfg.strategy === 'BB' || Boolean(p.useBbStrategy),
    ...(cfg.strategy === 'FVG' || p.useFvgStrategy ? { useFvgStrategy: true } : {}),
    ...(isHarmonic ? {
      useHarmonicStrategy: true,
      harmonicEntryMode: p.harmonicEntryMode ?? 'immediate',
      harmonicUseEqFilter: Boolean(p.harmonicUseEqFilter ?? false),
      harmonicTp1Pct: Number(p.harmonicTp1Pct ?? 50),
      harmonicTp2Pct: Number(p.harmonicTp2Pct ?? 50),
      harmonicMoveStopToBreakeven: Boolean(p.harmonicMoveStopToBreakeven ?? true),
      harmonicSlCapPct: Number(p.harmonicSlCapPct ?? 10.0),
      harmonicEnabledPatterns: Array.isArray(p.harmonicEnabledPatterns) ? p.harmonicEnabledPatterns : [],
      harmonicLogScale: p.harmonicLogScale !== undefined ? Boolean(p.harmonicLogScale) : true,
      harmonicEntryDepth: Number(p.harmonicEntryDepth ?? 0),
      harmonicRegimeSmaPeriod: Number(p.harmonicRegimeSmaPeriod ?? 0),
    } : {}),
    ...(isAbcd ? {
      useAbcdStrategy: true,
      abcdEntryMode: p.abcdEntryMode ?? 'immediate',
      abcdTp1Pct: Number(p.abcdTp1Pct ?? 50),
      abcdTp2Pct: Number(p.abcdTp2Pct ?? 50),
      abcdEnabledRatios: Array.isArray(p.abcdEnabledRatios) ? p.abcdEnabledRatios : [],
      abcdLogScale: p.abcdLogScale !== undefined ? Boolean(p.abcdLogScale) : true,
    } : {}),
    symbolConfigs: { [cfg.symbol]: { tpPercent, slPercent } },
  } as SignalEngineParams;
}

/** 워커가 설정 상태를 Spring에 보고 (RUNNING/ERROR/...) */
export async function reportStatus(configId: number, status: string): Promise<void> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return;
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/${configId}/status`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ status }),
    });
  } catch (e) { console.warn(`[config] 상태 보고 실패:`, (e as Error).message); }
}

/** 청산 실현손익 보고 (손실한도 판정은 Spring(DB)에서 수행) */
export async function reportPnl(configId: number, pnl: number): Promise<void> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return;
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/${configId}/pnl`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ pnl }),
    });
  } catch (e) { console.warn(`[config] 손익 보고 실패:`, (e as Error).message); }
}

/** 체결 1건 상세 보고 (체결기록 표시용). 시각은 epoch 초. 실패해도 무시. */
export interface TradeReport {
  memberId:   string;
  symbol:     string;
  direction:  'long' | 'short';
  entryPrice: number;
  exitPrice:  number;
  size:       number;
  pnlUsdt:    number;
  outcome:    string;
  entryTime:  number;  // epoch 초
  exitTime:   number;  // epoch 초
  tags?:      string;  // F4 매매당 태깅 JSON 문자열 (패턴/신호시각/own50/슬리피지 등)
}
export async function reportTrade(configId: number, trade: TradeReport): Promise<void> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return;
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/trade-configs/${configId}/trade`, {
      method: 'POST', headers: headers(), body: JSON.stringify(trade),
    });
  } catch (e) { console.warn(`[config] 체결기록 보고 실패:`, (e as Error).message); }
}

// 하모닉 패턴 생애주기(signal→체결→종료)를 DB 한 줄로 upsert하도록 Spring 내부 API로 보고.
// 차트가 자동 지표로 더 이상 못 그리는 과거/종료 패턴을 다시 불러오기 위함.
export async function reportPatternUpsert(signature: string, pattern: unknown): Promise<void> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return;
  try {
    await fetch(`${INTERNAL_API_URL}/api/internal/worker/closed-pattern`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ signature, pattern }),
    });
  } catch (e) { console.warn(`[config] 패턴 보고 실패:`, (e as Error).message); }
}
