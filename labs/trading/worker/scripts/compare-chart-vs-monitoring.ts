// 차트(지표) ↔ 모니터링(엔진) 비교. 동일 입력(1200봉·wick)으로 양쪽을 돌려 XABC 기준 diff.
//
// 차트: detect/predictHarmonicPatterns (완성 / 예측 터치·미터치)
// 모니터링: 실제 HarmonicEngine 웜업 후 getChartSnapshot() trackersList (completed/signal/scanning)
// 매칭: XABC(X·A·B·C·방향)만으로 — 이름이 다르면 "라벨불일치", XABC도 없으면 "누락".
//
// 사용: node --experimental-strip-types scripts/compare-chart-vs-monitoring.ts [SYM1,..|ALL]

import { fetchCandles } from '../src/lib/warmup.ts';
import { HarmonicEngine } from '../src/lib/harmonic-engine.ts';
import { detectHarmonicPatterns, predictHarmonicPatterns } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';
import { writeFileSync } from 'node:fs';

const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
const BASIS = 'wick' as const;
const LIMIT = 1200;
const TFS = ['30m', '4h', '1d'] as const;

const ALL_SYMBOLS = [
  'AAVEUSDT','ADAUSDT','ALLOUSDT','ASTERUSDT','AVAXUSDT','BANKUSDT','BCHUSDT','BLESSUSDT','BTCUSDT',
  'DASHUSDT','DOGEUSDT','DOTUSDT','ESPORTSUSDT','ETHUSDT','FARTCOINUSDT','FETUSDT','FIDAUSDT','FILUSDT',
  'HOLOUSDT','HOMEUSDT','HYPEUSDT','INJUSDT','JTOUSDT','LABUSDT','LINKUSDT','LITUSDT','LTCUSDT','NEARUSDT',
  'ONDOUSDT','OPGUSDT','OPNUSDT','PEPEUSDT','PIPPINUSDT','PORTALUSDT','PUMPUSDT','SIRENUSDT','SKYAIUSDT',
  'SOLUSDT','SUIUSDT','TAOUSDT','TONUSDT','TRXUSDT','VVVUSDT','WIFUSDT','WLDUSDT','XLMUSDT','XPLUSDT','ZECUSDT',
];

const arg = (process.argv[2] ?? 'ALL').toUpperCase();
const symbols = (arg === 'ALL') ? ALL_SYMBOLS : arg.split(',').map(s => s.trim()).filter(Boolean);

const xabcKey = (pts: any, bull: boolean) =>
  `${pts.X.time}_${pts.A.time}_${pts.B.time}_${pts.C.time}_${bull}`;

function chartSide(candles: any[]) {
  const last = candles[candles.length - 1].close;
  const comp = new Map<string, any>();
  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    for (const p of detectHarmonicPatterns(getPivots(candles, len, BASIS), true, candles)) {
      const { X, A, B, C } = p.points;
      const k = `${X.time}_${A.time}_${B.time}_${C.time}_${p.name}`;
      if (!comp.has(k)) comp.set(k, p);
    }
  }
  const emg = new Map<string, any>();
  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    for (const p of predictHarmonicPatterns(getPivots(candles, len, BASIS), last, true, candles)) {
      const k = `${p.points.A.time}_${p.points.B.time}_${p.name}_${p.isBullish}`;
      if (!emg.has(k)) emg.set(k, p);
    }
  }
  const e = [...emg.values()];
  return {
    completed: [...comp.values()],
    touched: e.filter(p => p.isPrzTouched === true),
    untouched: e.filter(p => p.isPrzTouched !== true),
  };
}

function monitorSide(candles: any[], tf: string) {
  const engine = new HarmonicEngine({}, tf as any);
  engine.setWarmupMode(true);
  for (const c of candles) engine.feed(c);
  engine.setWarmupMode(false);
  const list = (engine.getChartSnapshot() ?? []) as any[];
  // phase별 XABC 맵 (같은 XABC에 여러 패턴명이 있을 수 있음)
  const byKey = new Map<string, any[]>();
  for (const it of list) {
    const k = xabcKey(it.xabc, it.type === 'bull');
    byKey.set(k, [...(byKey.get(k) ?? []), { phase: it.phase, name: it.patternName }]);
  }
  return { list, byKey };
}

async function main() {
  const out: any = { generatedAt: new Date().toISOString(), basis: BASIS, candleLimit: LIMIT, symbols: {} };
  const agg = { touched: 0, touchedMatched: 0, touchedLabelDiff: 0, touchedMissing: 0,
                untouched: 0, untouchedMatched: 0, untouchedMissing: 0 };
  const rows: string[] = [];

  for (const symbol of symbols) {
    const symOut: any = {};
    for (const tf of TFS) {
      try {
        const candles = (await fetchCandles(symbol, tf, LIMIT)).slice(0, -1);
        if (!candles.length) continue;
        const chart = chartSide(candles);
        const mon = monitorSide(candles, tf);

        const classify = (p: any) => {
          const k = xabcKey(p.points, p.isBullish);
          const matches = mon.byKey.get(k);
          if (!matches?.length) return { status: 'MISSING', sig: k, chartName: p.name };
          const m = matches.find((item: any) => item.name === p.name);
          if (!m) return { status: 'LABEL_DIFF', sig: k, chartName: p.name, monName: matches.map((item: any) => item.name).join(' / '), monPhase: matches.map((item: any) => item.phase).join(' / ') };
          return { status: 'MATCH', sig: k, chartName: p.name, monPhase: m.phase };
        };

        const touched = chart.touched.map(classify);
        const untouched = chart.untouched.map(classify);
        symOut[tf] = {
          chartCompleted: chart.completed.length,
          monByPhase: mon.list.reduce((a: any, it: any) => ((a[it.phase] = (a[it.phase] || 0) + 1), a), {}),
          touched, untouched,
        };
        for (const t of touched) {
          agg.touched++;
          if (t.status === 'MATCH') agg.touchedMatched++;
          else if (t.status === 'LABEL_DIFF') agg.touchedLabelDiff++;
          else agg.touchedMissing++;
        }
        for (const u of untouched) {
          agg.untouched++;
          if (u.status === 'MISSING') agg.untouchedMissing++; else agg.untouchedMatched++;
        }
      } catch (e) {
        symOut[tf] = { error: (e as Error).message };
      }
    }
    out.symbols[symbol] = symOut;
  }

  out.summary = agg;
  writeFileSync('scripts/compare-chart-vs-monitoring.json', JSON.stringify(out, null, 2));
  console.log('=== 차트 예측패턴 vs 모니터링 (XABC 기준) ===');
  console.log(`터치   : 총 ${agg.touched} | 일치 ${agg.touchedMatched} | 라벨불일치 ${agg.touchedLabelDiff} | 누락 ${agg.touchedMissing}`);
  console.log(`미터치 : 총 ${agg.untouched} | 매칭 ${agg.untouchedMatched} | 누락 ${agg.untouchedMissing}`);
  console.log('→ 저장: labs/trading/worker/scripts/compare-chart-vs-monitoring.json');
}

main().catch(e => { console.error('ERR', e?.message || e); process.exit(1); });
