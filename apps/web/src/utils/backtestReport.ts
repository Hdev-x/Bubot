import type { BacktestResult, TradeResult } from './backtestEngine';

/** 통계적으로 의미 있다고 볼 최소 거래수 */
export const MIN_MEANINGFUL_TRADES = 30;

export type PeriodRow = {
  period: string;      // 'YYYY-MM'
  trades: number;
  wins: number;
  winRate: number;     // %
  netPnl: number;      // USDT
};

export type BacktestReport = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;        // 거래 가중 승률 %
  netProfit: number;
  grossProfit: number;
  grossLoss: number;      // 양수
  profitFactor: number;   // grossLoss 0이면 Infinity
  avgWin: number;
  avgLoss: number;        // 양수
  payoff: number;         // 손익비 = avgWin / avgLoss
  maxDrawdownPct: number; // 포트폴리오 MDD % (전 심볼 시간순 병합 에쿼티 기준)
  maxLoseStreak: number;
  lowSample: boolean;     // 거래수 30건 미만
  totalMonths: number;
  positiveMonths: number;
  positiveMonthRate: number; // 월별 순손익 양수 비율 %
  worstMonthNetPnl: number;
  avgMonthNetPnl: number;
  monthlyNetPnlStdDev: number;
  monthly: PeriodRow[];
  /** 과최적화 가드 (M3 3단계) — 러너가 채움. 없으면 가드 미검증 결과 */
  segments?: SegmentReports | null;
  costStress?: CostStress;
};

export type CostStress = { multiplier: number; report: ReportSummary };

// ── 우상향 후보 점수 — 기준의 원본 (리더보드·실험 대시보드 공용) ──

export type StabilityVerdict = '후보' | '관찰' | '제외';

export type StabilityMetrics = {
  positiveMonths: number;
  totalMonths: number;
  positiveMonthRate: number;
  worstMonthNetPnl: number;
  avgMonthNetPnl: number;
  monthlyNetPnlStdDev: number;
  score: number;
  verdict: StabilityVerdict;
  /** 왜 이 판정인지 — 후보면 통과 근거, 관찰/제외면 막힌 기준 */
  reasons: string[];
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function finiteProfitFactor(r: BacktestReport): number {
  if (Number.isFinite(r.profitFactor)) return r.profitFactor;
  return r.grossProfit > 0 ? 3 : 0;
}

/** 폭발적 수익보다 생존성·월별 지속성·낮은 낙폭을 우선하는 점수와 후보/관찰/제외 판정.
 *  월별 필드가 없는 구버전 report도 monthly 배열에서 재계산해 처리한다. */
export function stabilityMetrics(r: BacktestReport): StabilityMetrics {
  const totalMonths = r.totalMonths ?? r.monthly?.length ?? 0;
  const positiveMonths = r.positiveMonths ?? r.monthly?.filter(row => row.netPnl > 0).length ?? 0;
  const positiveMonthRate = r.positiveMonthRate ?? (totalMonths > 0 ? (positiveMonths / totalMonths) * 100 : 0);
  const avgMonthNetPnl = r.avgMonthNetPnl ?? (totalMonths > 0 ? r.monthly.reduce((sum, row) => sum + row.netPnl, 0) / totalMonths : 0);
  const monthlyNetPnlStdDev = r.monthlyNetPnlStdDev ?? (() => {
    if (!totalMonths) return 0;
    const variance = r.monthly.reduce((sum, row) => sum + Math.pow(row.netPnl - avgMonthNetPnl, 2), 0) / totalMonths;
    return Math.sqrt(variance);
  })();
  const worstMonthNetPnl = r.worstMonthNetPnl ?? (totalMonths > 0 ? Math.min(...r.monthly.map(row => row.netPnl)) : 0);
  const pf = finiteProfitFactor(r);

  let score =
    30 * clamp01((pf - 1) / 0.35) +
    30 * clamp01((40 - r.maxDrawdownPct) / 40) +
    25 * clamp01(positiveMonthRate / 100) +
    15 * clamp01((20 - r.maxLoseStreak) / 20);

  if (r.netProfit <= 0) score *= 0.35;
  if (r.trades < 200) score *= clamp01(r.trades / 200);
  if (r.maxDrawdownPct > 40) score *= 0.75;
  score = Math.round(score * 10) / 10;

  // ── 판정 + 사유 ──
  // 1) 기본 지표로 후보/관찰/제외 가닥을 잡고
  // 2) 과최적화 가드(holdout·비용 스트레스)로 강등/탈락시킨다.
  //    가드 데이터가 없는 결과(3단계 이전 실행)는 후보로 못 올라간다 — 최대 관찰.
  const reasons: string[] = [];
  const fail = (msg: string) => reasons.push(msg);

  let verdict: StabilityVerdict;
  if (r.netProfit <= 0) {
    verdict = '제외'; fail(`순손익 음수 (${r.netProfit.toFixed(0)})`);
  } else if (r.trades < 200) {
    verdict = '제외'; fail(`거래수 부족 (${r.trades} < 200)`);
  } else if (r.maxDrawdownPct > 40) {
    verdict = '제외'; fail(`MDD 초과 (${r.maxDrawdownPct.toFixed(1)}% > 40%)`);
  } else if (pf < 1.05) {
    verdict = '제외'; fail(`PF 부족 (${pf.toFixed(2)} < 1.05)`);
  } else if (positiveMonthRate < 45) {
    verdict = '제외'; fail(`양수월 부족 (${positiveMonthRate.toFixed(0)}% < 45%)`);
  } else if (pf >= 1.15 && r.maxDrawdownPct <= 30 && positiveMonthRate >= 55) {
    verdict = '후보';
  } else {
    verdict = '관찰';
    if (pf < 1.15) fail(`후보 기준 PF 미달 (${pf.toFixed(2)} < 1.15)`);
    if (r.maxDrawdownPct > 30) fail(`후보 기준 MDD 초과 (${r.maxDrawdownPct.toFixed(1)}% > 30%)`);
    if (positiveMonthRate < 55) fail(`후보 기준 양수월 미달 (${positiveMonthRate.toFixed(0)}% < 55%)`);
  }

  // 과최적화 가드 — 제외가 아닌 경우에만 검사
  if (verdict !== '제외') {
    const holdout = r.segments?.holdout?.report;
    const stress = r.costStress?.report;

    if (stress && stress.netProfit <= 0) {
      verdict = '제외'; fail(`비용 ${r.costStress!.multiplier}배 스트레스에서 손실 (${stress.netProfit})`);
    } else if (holdout && holdout.netProfit < 0) {
      verdict = '제외'; fail(`holdout 구간 손실 (${holdout.netProfit})`);
    } else if (verdict === '후보') {
      if (!holdout || !stress) {
        verdict = '관찰'; fail('holdout·스트레스 검증 데이터 없음 — 후보 보류');
      } else if (holdout.profitFactor < 1.0) {
        verdict = '관찰'; fail(`holdout PF 미달 (${holdout.profitFactor.toFixed(2)} < 1.0)`);
      } else {
        reasons.push(
          `PF ${pf.toFixed(2)} · MDD ${r.maxDrawdownPct.toFixed(1)}% · 양수월 ${positiveMonthRate.toFixed(0)}%`,
          `holdout PF ${holdout.profitFactor.toFixed(2)} · 스트레스 순손익 +${stress.netProfit}`,
        );
      }
    }
  }

  return {
    positiveMonths,
    totalMonths,
    positiveMonthRate,
    worstMonthNetPnl,
    avgMonthNetPnl,
    monthlyNetPnlStdDev,
    score,
    verdict,
    reasons,
  };
}

type FlatTrade = TradeResult & { symbol: string };

/** buildReport가 실제로 사용하는 최소 형태 — 구간 분리 시 부분 결과를 만들기 위함 */
export type ReportInput = Pick<BacktestResult, 'symbol' | 'trades'>;

// ── 구간 분리 리포트 (train/validation/holdout) + 요약 ──

/** 결과 JSON·대시보드에 싣는 압축 지표 — 전체 BacktestReport는 구간마다 담기엔 무겁다 */
export type ReportSummary = {
  trades: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  maxDrawdownPct: number;
  positiveMonthRate: number;
};

export function summarizeReport(r: BacktestReport): ReportSummary {
  return {
    trades: r.trades,
    winRate: Math.round(r.winRate * 10) / 10,
    profitFactor: Number.isFinite(r.profitFactor) ? Math.round(r.profitFactor * 100) / 100 : 999,
    netProfit: Math.round(r.netProfit),
    maxDrawdownPct: Math.round(r.maxDrawdownPct * 10) / 10,
    positiveMonthRate: Math.round(r.positiveMonthRate),
  };
}

export type SegmentName = 'train' | 'validation' | 'holdout';

export type SegmentReport = {
  rangeStart: string; // ISO 날짜 (구간 시작, 포함)
  rangeEnd: string;   // ISO 날짜 (구간 끝, 포함)
  report: ReportSummary;
};

export type SegmentReports = Record<SegmentName, SegmentReport>;

/** 기본 분할: train 60% / validation 25% / holdout 최근 15% */
export const DEFAULT_SEGMENT_FRACTIONS = { train: 0.6, validation: 0.25 };

/**
 * 전 심볼 거래를 시간축 기준으로 train/validation/holdout 구간으로 나눠 구간별 지표를 만든다.
 * 분할 기준은 거래수가 아니라 전체 거래 시간 범위(첫 진입~마지막 진입)의 비율 —
 * 거래가 몰린 구간이 있어도 시장 기간 기준으로 나뉘게 하기 위함.
 * 거래가 없으면 null.
 */
export function buildSegmentReports(
  results: ReportInput[],
  initialCapital: number,
  fractions: { train: number; validation: number } = DEFAULT_SEGMENT_FRACTIONS,
): SegmentReports | null {
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const r of results) {
    for (const t of r.trades) {
      if (t.entryTime < minTime) minTime = t.entryTime;
      if (t.entryTime > maxTime) maxTime = t.entryTime;
    }
  }
  if (!Number.isFinite(minTime) || maxTime <= minTime) return null;

  const span = maxTime - minTime;
  const trainEnd = minTime + span * fractions.train;
  const validationEnd = minTime + span * (fractions.train + fractions.validation);

  const segmentOf = (entryTime: number): SegmentName =>
    entryTime <= trainEnd ? 'train' : entryTime <= validationEnd ? 'validation' : 'holdout';

  const build = (name: SegmentName, start: number, end: number): SegmentReport => {
    const partial: ReportInput[] = results.map(r => ({
      symbol: r.symbol,
      trades: r.trades.filter(t => segmentOf(t.entryTime) === name),
    }));
    const date = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);
    return {
      rangeStart: date(start),
      rangeEnd: date(end),
      report: summarizeReport(buildReport(partial, initialCapital)),
    };
  };

  return {
    train: build('train', minTime, trainEnd),
    validation: build('validation', trainEnd, validationEnd),
    holdout: build('holdout', validationEnd, maxTime),
  };
}

/** 전 심볼 결과를 시간순 단일 시퀀스로 병합해 표준 지표를 산출한다 */
export function buildReport(results: ReportInput[], initialCapital: number): BacktestReport {
  const trades: FlatTrade[] = results
    .flatMap(r => r.trades.map(t => ({ ...t, symbol: r.symbol })))
    .sort((a, b) => a.entryTime - b.entryTime);

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let loseStreak = 0;
  let maxLoseStreak = 0;

  // 포트폴리오 에쿼티: 심볼별 독립 시뮬이지만, 시간순 병합 손익 누적을 단일 계좌로 본 근사
  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdownPct = 0;

  const monthlyMap = new Map<string, PeriodRow>();

  for (const t of trades) {
    const delta = t.capitalDelta ?? 0;
    if (delta > 0) {
      grossProfit += delta;
      wins++;
      loseStreak = 0;
    } else if (delta < 0) {
      grossLoss += -delta;
      loseStreak++;
      if (loseStreak > maxLoseStreak) maxLoseStreak = loseStreak;
    }

    equity += delta;
    if (equity > peak) peak = equity;
    else if (peak > 0) {
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }

    const d = new Date(t.entryTime * 1000);
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let row = monthlyMap.get(period);
    if (!row) {
      row = { period, trades: 0, wins: 0, winRate: 0, netPnl: 0 };
      monthlyMap.set(period, row);
    }
    row.trades++;
    if (delta > 0) row.wins++;
    row.netPnl += delta;
  }

  const n = trades.length;
  const losses = n - wins;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;

  const monthly = Array.from(monthlyMap.values());
  for (const row of monthly) row.winRate = row.trades > 0 ? (row.wins / row.trades) * 100 : 0;
  const totalMonths = monthly.length;
  const positiveMonths = monthly.filter(row => row.netPnl > 0).length;
  const avgMonthNetPnl = totalMonths > 0
    ? monthly.reduce((sum, row) => sum + row.netPnl, 0) / totalMonths
    : 0;
  const monthlyVariance = totalMonths > 0
    ? monthly.reduce((sum, row) => sum + Math.pow(row.netPnl - avgMonthNetPnl, 2), 0) / totalMonths
    : 0;

  return {
    trades: n,
    wins,
    losses,
    winRate: n > 0 ? (wins / n) * 100 : 0,
    netProfit: grossProfit - grossLoss,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0),
    avgWin,
    avgLoss,
    payoff: avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0),
    maxDrawdownPct,
    maxLoseStreak,
    lowSample: n < MIN_MEANINGFUL_TRADES,
    totalMonths,
    positiveMonths,
    positiveMonthRate: totalMonths > 0 ? (positiveMonths / totalMonths) * 100 : 0,
    worstMonthNetPnl: totalMonths > 0 ? Math.min(...monthly.map(row => row.netPnl)) : 0,
    avgMonthNetPnl,
    monthlyNetPnlStdDev: Math.sqrt(monthlyVariance),
    monthly,
  };
}
