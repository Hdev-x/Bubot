// 페이퍼 실행기 — H-R50 실증(인수인계 부록 F)용 워커→Spring 내부 페이퍼 API 클라이언트 + 리스크 엔진.
// 실거래(order-executor.ts)와 같은 자리에서 호출되는 대체 실행 계층:
// 진입/청산 신호는 동일 엔진 이벤트를 쓰고, 체결만 가상계좌(paper_accounts/positions)로 간다.
//
// 리스크 엔진(F3): 1R = 실현에쿼티 1% × DD 감속(-15%→½, -30%→¼) / 킬스위치 -45%(신규 진입 중단).
// DD 기준 = 실현 에쿼티(잔고+잠긴 증거금)의 역대 고점(peak_equity, 서버 관리) — 미실현 제외.
const INTERNAL_API_URL   = process.env.INTERNAL_API_URL;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

function headers(): Record<string, string> {
  return { 'X-Internal-Token': INTERNAL_API_TOKEN ?? '', 'Content-Type': 'application/json' };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) throw new Error('내부 API 미설정(INTERNAL_API_URL/TOKEN)');
  const res = await fetch(`${INTERNAL_API_URL}/api/internal/paper${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new Error(`paper${path} ${res.status}: ${data?.error ?? '알 수 없는 오류'}`);
  return data as T;
}

export interface PaperAccountInfo {
  balance: number;      // 자유 잔고
  peakEquity: number;   // 실현 에쿼티 역대 고점
  equity: number;       // 현재 실현 에쿼티 = balance + Σ(포지션 margin)
  positions: Array<{ id: number; symbol: string; direction: 'long' | 'short'; entryPrice: number; size: number; margin: number }>;
}

/** 계좌 스냅샷 — 리스크 판정·reconcile용. */
export async function paperAccount(memberId: string): Promise<PaperAccountInfo> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) throw new Error('내부 API 미설정(INTERNAL_API_URL/TOKEN)');
  const res = await fetch(`${INTERNAL_API_URL}/api/internal/paper/account?memberId=${encodeURIComponent(memberId)}`, { headers: headers() });
  const data = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new Error(`paper/account ${res.status}: ${data?.error ?? '알 수 없는 오류'}`);
  const positions = (data.overview?.positions ?? []).map((p: any) => ({
    id: Number(p.id), symbol: String(p.symbol), direction: p.direction as 'long' | 'short',
    entryPrice: Number(p.entryPrice), size: Number(p.size), margin: Number(p.margin),
  }));
  const balance = Number(data.balance);
  const equity = balance + positions.reduce((s: number, p: any) => s + p.margin, 0);
  return { balance, peakEquity: Number(data.peakEquity), equity, positions };
}

export async function paperOpen(memberId: string, symbol: string, direction: 'long' | 'short',
                                marginUsdt: number, leverage: number, price: number): Promise<{ positionId: number; size: number }> {
  const r = await post<{ positionId: number; size: number }>('/open', { memberId, symbol, direction, marginUsdt, leverage, price });
  return { positionId: Number(r.positionId), size: Number(r.size) };
}

export async function paperClose(memberId: string, positionId: number, price: number): Promise<number> {
  const r = await post<{ pnl: number }>('/close', { memberId, positionId, price });
  return Number(r.pnl);
}

export async function paperClosePartial(memberId: string, positionId: number, price: number, fraction: number): Promise<number> {
  const r = await post<{ pnl: number }>('/close-partial', { memberId, positionId, price, fraction });
  return Number(r.pnl);
}

// ── 리스크 엔진 (F3) ─────────────────────────────────────
export const PAPER_MAX_LEVERAGE = 5;      // 배율 상한(결과값) — F3
const DD_HALF = 0.15;                     // 고점比 -15% → 리스크 ½
const DD_QUARTER = 0.30;                  // -30% → ¼
const DD_KILL = 0.45;                     // -45% → 신규 진입 중단

export interface PaperRiskDecision {
  blocked: boolean;         // 킬스위치(-45%) 도달 — 신규 진입 금지
  drawdown: number;         // 현재 DD (0~1)
  riskUsdt: number;         // 이번 매매 1R 허용액(감속 반영)
  multiplier: number;       // 감속 배수 (1 / 0.5 / 0.25)
}

/** F3 리스크 판정 — 기본 riskPct(%)에 DD 감속 적용. (경계 부동소수점 방어용 엡실론) */
export function decidePaperRisk(acc: PaperAccountInfo, riskPct: number): PaperRiskDecision {
  const EPS = 1e-9;
  const peak = Math.max(acc.peakEquity, acc.equity);
  const dd = peak > 0 ? Math.max(0, 1 - acc.equity / peak) : 0;
  if (dd >= DD_KILL - EPS) return { blocked: true, drawdown: dd, riskUsdt: 0, multiplier: 0 };
  const multiplier = dd >= DD_QUARTER - EPS ? 0.25 : dd >= DD_HALF - EPS ? 0.5 : 1;
  return { blocked: false, drawdown: dd, riskUsdt: acc.equity * (riskPct / 100) * multiplier, multiplier };
}

/** 사이징 — size = 1R ÷ 손절거리, 명목가 기반 증거금(레버리지 5x 고정 상한). 잔고 부족 시 축소. */
export function sizePaperPosition(riskUsdt: number, entryPrice: number, slPrice: number, freeBalance: number):
  { size: number; marginUsdt: number; leverage: number } | null {
  const slDist = Math.abs(entryPrice - slPrice);
  if (slDist <= 0 || entryPrice <= 0 || riskUsdt <= 0) return null;
  let size = riskUsdt / slDist;
  let marginUsdt = size * entryPrice / PAPER_MAX_LEVERAGE;
  // 증거금이 가용 잔고 초과 → 잔고 95%로 캡 (리스크는 그만큼 줄어듦 — 로그로 노출)
  const cap = freeBalance * 0.95;
  if (marginUsdt > cap) {
    if (cap <= 0) return null;
    size = size * (cap / marginUsdt);
    marginUsdt = cap;
  }
  if (size <= 0 || marginUsdt <= 0) return null;
  return { size, marginUsdt, leverage: PAPER_MAX_LEVERAGE };
}
