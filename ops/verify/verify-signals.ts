/**
 * M1 DoD — 신호 동일성 회귀 검증
 *
 * 고정 캔들 픽스처(3종목 × 3시점 단면)를 차트·백테스트·워커가 공통으로 쓰는
 * 파이프라인(scanLen 6종 × getPivots wick → shared detect/predict 4함수)에 넣고
 * 결정적 신호 목록을 산출해 기준(baseline)과 비교한다.
 *
 * 실행:   node --experimental-strip-types ops/verify/verify-signals.ts          # 기준과 비교 (불일치 시 exit 1)
 * 갱신:   node --experimental-strip-types ops/verify/verify-signals.ts --update # 기준 재생성 (의도된 로직 변경 시, baseline을 같이 커밋)
 *
 * shared/ 감지기를 수정하면 반드시 이 스크립트를 돌려서
 * 의도된 변화인지 확인하고, 맞으면 --update로 기준을 갱신해 함께 커밋한다.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPivots } from '../../shared/pivots.ts';
import { detectHarmonicPatterns, predictHarmonicPatterns } from '../../shared/harmonic.ts';
import { detectAbcWave, predictAbcWave, detectElliottWave } from '../../shared/waves.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(HERE, 'fixtures', 'expected-signals.json');

// 3경로 공통 파라미터 (차트 useAutoPatterns / 백테스트 backtestEngine / 워커 harmonic-engine)
const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
const BASIS = 'wick';
const IS_LOG = true; // 워커 기본값 (harmonicLogScale=true)

// 픽스처 종목: fixtures/ 안의 *-4h.json 전부 (워커 모니터링 종목 47개, 2026-06-11 수집)
const SYMBOLS = readdirSync(join(HERE, 'fixtures'))
  .filter((f) => f.endsWith('-4h.json'))
  .map((f) => f.replace('-4h.json', ''))
  .sort();
// 평가 단면: 픽스처 끝 + 과거 2개 시점. 예측(emerging) 신호는 시점 단면에 민감해서
// 마지막 시점만 보면 0건일 수 있음 → 과거 단면을 포함해 baseline에 예측 신호를 확보한다.
const END_OFFSETS = [0, 60, 120]; // 끝에서 N봉 전

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

function collect(candles: Candle[], tag: string, out: Record<string, string[]>) {
  const currentPrice = candles[candles.length - 1].close;

  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    const pivots = getPivots(candles, len, BASIS);

    for (const p of detectHarmonicPatterns(pivots, IS_LOG, candles)) {
      out.harmonicDetect.push(`${tag} len${len} ${p.name} X${p.points.X.time} A${p.points.A.time} B${p.points.B.time} C${p.points.C.time} D${p.points.D.time} prz${round(p.przPrice)}`);
    }
    for (const p of predictHarmonicPatterns(pivots, currentPrice, IS_LOG, candles)) {
      out.harmonicPredict.push(`${tag} len${len} ${p.name} X${p.points.X.time} A${p.points.A.time} B${p.points.B.time} C${p.points.C.time} prz${round(p.przPrice)} sl${round(p.slPrice)} touched${p.isPrzTouched ? 1 : 0}`);
    }
    for (const w of detectAbcWave(pivots, IS_LOG, candles)) {
      out.abcdDetect.push(`${tag} len${len} ${w.isBullish ? 'bull' : 'bear'} ${w.label} A${w.points.A.time} B${w.points.B.time} C${w.points.C.time} D${w.points.D.time}`);
    }
    for (const w of predictAbcWave(pivots, currentPrice, IS_LOG, candles)) {
      out.abcdPredict.push(`${tag} len${len} ${w.isBullish ? 'bull' : 'bear'} ${w.targetLabel} A${w.points.A.time} B${w.points.B.time} C${w.points.C.time} prz${round(w.przPrice)} touched${w.isPrzTouched ? 1 : 0}`);
    }
    for (const e of detectElliottWave(pivots, IS_LOG)) {
      out.elliott.push(`${tag} len${len} ${e.isBullish ? 'bull' : 'bear'} P0_${e.points.P0.time} P5_${e.points.P5.time}`);
    }
  }
}

function round(n: number | undefined): string {
  return n === undefined ? '-' : n.toFixed(2);
}

function run(): Record<string, string[]> {
  const out: Record<string, string[]> = {
    harmonicDetect: [], harmonicPredict: [],
    abcdDetect: [], abcdPredict: [], elliott: [],
  };
  for (const sym of SYMBOLS) {
    const full: Candle[] = JSON.parse(readFileSync(join(HERE, 'fixtures', `${sym}-4h.json`), 'utf8'));
    for (const off of END_OFFSETS) {
      collect(full.slice(0, full.length - off), `${sym}@-${off}`, out);
    }
  }
  return out;
}

const actual = run();
const counts = Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, v.length]));

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_PATH, JSON.stringify(actual, null, 1));
  console.log('✅ baseline 갱신:', BASELINE_PATH);
  console.log('   신호 수:', JSON.stringify(counts));
} else {
  let baseline: Record<string, string[]>;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    console.error('❌ baseline 없음 — 먼저 --update로 생성하세요.');
    process.exit(1);
  }
  const keys = new Set([...Object.keys(baseline!), ...Object.keys(actual)]);
  let failed = false;
  for (const k of keys) {
    const exp = baseline![k] ?? [];
    const act = actual[k] ?? [];
    const missing = exp.filter((s) => !act.includes(s));
    const added = act.filter((s) => !exp.includes(s));
    if (missing.length || added.length) {
      failed = true;
      console.error(`❌ ${k}: 기준 ${exp.length}개 vs 현재 ${act.length}개`);
      for (const s of missing.slice(0, 5)) console.error(`   - 사라짐: ${s}`);
      for (const s of added.slice(0, 5)) console.error(`   + 새로 생김: ${s}`);
    }
  }
  if (failed) {
    console.error('\n의도된 로직 변경이면: node --experimental-strip-types ops/verify/verify-signals.ts --update');
    process.exit(1);
  }
  console.log('✅ 신호 동일성 통과 —', JSON.stringify(counts));
}
