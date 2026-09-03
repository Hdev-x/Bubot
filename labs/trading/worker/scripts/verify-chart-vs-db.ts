// 차트 ↔ 저장대상 ↔ DB 3-way 정합 검증 (읽기 전용, 거래·DB쓰기 없음)
//
// 1) 차트 목록   : shared/harmonic.ts predictHarmonicPatterns를 같은 캔들에 돌린 결과(차트가 그리는 기하 전체)
// 2) 저장 목록   : 실제 HarmonicEngine을 같은 캔들로 라이브 재생해 patternUpsert로 뱉는 것(워커가 DB에 쓸 것)
// 3) 표시 목록   : getMonitoringSnapshot()이 화면에 노출하는 표시 생명주기
//
// 사용: node --experimental-strip-types ops/verify/verify-chart-vs-db.ts [SYMBOL] [INTERVAL]
//   예: node --experimental-strip-types ops/verify/verify-chart-vs-db.ts BTCUSDT 4h
// DB(harmonic_closed_patterns)는 출력된 signature 목록을 neon/psql로 따로 대조한다.

import { HarmonicEngine } from '../src/lib/harmonic-engine.ts';
import { fetchCandles } from '../src/lib/warmup.ts';
import { predictHarmonicPatterns } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';

const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
const WARMUP_LIMIT: Record<string, number> = { '30m': 1200, '4h': 1200, '1d': 1200 };

const symbol = (process.argv[2] ?? 'BTCUSDT').toUpperCase();
const interval = (process.argv[3] ?? '4h') as '30m' | '4h' | '1d';
const isLog = true; // HarmonicEngine 기본 harmonicLogScale=true

function familyOf(name: string): string {
  return name.replace(/^Bullish\s+|^Bearish\s+/, '').replace(/\s+\(Emerging\)$/, '');
}
function xabcKeyOf(p: any): string {
  const { X, A, B, C } = p.points;
  return `${X.time}_${A.time}_${B.time}_${C.time}_${p.isBullish}`;
}
function sigOf(p: any): string {
  return `${symbol}|${interval}|${xabcKeyOf(p)}|${p.name}`;
}

async function main() {
  const limit = WARMUP_LIMIT[interval] ?? 1000;
  const candles = (await fetchCandles(symbol, interval, limit)).slice(0, -1);
  if (!candles.length) throw new Error('캔들 없음');
  const lastClose = candles[candles.length - 1].close;

  // ── 1) 차트 목록: 마지막 캔들 기준 전체 스캔 + 엔진과 동일 dedup(X_A_B_C_name_isBullish) ──
  const chartMap = new Map<string, any>();
  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    const pivots = getPivots(candles, len, 'wick');
    for (const p of predictHarmonicPatterns(pivots, lastClose, isLog, candles)) {
      const dedup = `${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.name}_${p.isBullish}`;
      if (!chartMap.has(dedup)) chartMap.set(dedup, p);
    }
  }
  const chartAll = [...chartMap.values()];
  const chartTouched = chartAll.filter(p => p.isPrzTouched === true);

  // ── 2) 저장 목록: 표시용 생명주기를 라이브 재생해 patternUpsert 수집 ──
  const engine = new HarmonicEngine({}, interval);
  const saved: any[] = [];
  engine.on('patternUpsert', (payload: any) => saved.push(payload));
  const originalLog = console.log;
  console.log = () => {};
  try {
    for (const c of candles) engine.feed(c);
  } finally {
    console.log = originalLog;
  }
  const list = (engine.getMonitoringSnapshot() ?? []) as any[];
  const displayByPhase = list.reduce((a, it) => ((a[it.phase] = (a[it.phase] || 0) + 1), a), {} as Record<string, number>);
  const sigOfStatus = (it: any) => {
    const x = it.xabc;
    return `${symbol}|${interval}|${x.X.time}_${x.A.time}_${x.B.time}_${x.C.time}_${it.type === 'bull'}|${it.patternName}`;
  };
  const byPhaseList = (ph: string) => list.filter(it => it.phase === ph);
  const doneSigs = byPhaseList('done').map(sigOfStatus);
  const allStatusSigs = new Set(list.map(sigOfStatus));

  // ── 3) 비교 ──
  const savedSigs = new Set(saved.map(s => s.signature));
  const chartTouchedSigs = new Set(chartTouched.map(sigOf));

  // 차트엔 터치인데 저장 안 됨 (표시/저장 격차)
  const touchedNotSaved = chartTouched.filter(p => !savedSigs.has(sigOf(p)));
  // 저장됐는데 차트(현재 스냅샷)엔 없음 (과거 패턴 — persistence 존재 이유)
  const savedNotInChart = saved.filter(s => !chartTouchedSigs.has(s.signature) &&
    !chartAll.some(p => sigOf(p) === s.signature));

  const out = {
    symbol, interval, candles: candles.length, lastClose,
    chart: {
      all: chartAll.length,
      touched: chartTouched.length,
      touchedList: chartTouched.map(p => ({ sig: sigOf(p), name: p.name, dir: p.isBullish ? 'bull' : 'bear', prz: p.przPrice })),
    },
    engineSaved: {
      count: saved.length,
      byPhase: saved.reduce((a, s) => ((a[s.phase] = (a[s.phase] || 0) + 1), a), {} as Record<string, number>),
      list: saved.map(s => ({ sig: s.signature, phase: s.phase, name: s.patternName })),
    },
    display: {
      byPhase: displayByPhase,
      active: byPhaseList('active').length,
      signalDisplay: byPhaseList('signal').length,
      scanning: byPhaseList('scanning').length,
      done: byPhaseList('done').length,
    },
    diff: {
      // 차트 터치 패턴이 엔진의 어느 단계에 있는지.
      // enginePhase: 같은 signature(XABC+이름) 매칭 / xabcMatch: 이름 무시 XABC만 매칭(=라벨만 다른 동일 패턴)
      touchedVsEngine: chartTouched.map(p => {
        const sig = sigOf(p);
        const xk = xabcKeyOf(p);
        const exact = list.find(it => sigOfStatus(it) === sig);
        const xabcOnly = list.find(it => {
          const x = it.xabc;
          return `${x.X.time}_${x.A.time}_${x.B.time}_${x.C.time}_${it.type === 'bull'}` === xk;
        });
        return {
          name: p.name, saved: savedSigs.has(sig),
          enginePhase: exact?.phase ?? 'NONE',
          xabcMatch: xabcOnly ? `${xabcOnly.patternName}(${xabcOnly.phase})` : 'NONE',
        };
      }),
      savedNotInChart: savedNotInChart.map(s => ({ sig: s.signature, phase: s.phase })),
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('ERR', e?.message || e); process.exit(1); });
