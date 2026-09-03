// 라벨불일치/누락 케이스 심층 분석.
// - 같은 XABC에 차트 predict가 몇 개 족(族)을 동시 매칭하는지(=라벨 모호성)
// - 누락 케이스: 차트 패턴이 엔진 필터(SL15%/유효성)에 걸리는지
//
// 사용: node --experimental-strip-types scripts/dig-mismatch.ts SYMBOL TF X_A_B_C_bool

import { fetchCandles } from '../src/lib/warmup.ts';
import { HarmonicEngine } from '../src/lib/harmonic-engine.ts';
import { predictHarmonicPatterns, harmonicEntryPrice } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';

const SCAN = [55, 34, 21, 13, 8, 5];

const sym = process.argv[2];
const tf = process.argv[3];
const targetKey = process.argv[4]; // "X_A_B_C_true" (time들, isBullish)

const xk = (p: any) => `${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`;

const candles = (await fetchCandles(sym, tf, 1200)).slice(0, -1);
const last = candles[candles.length - 1].close;

// 차트 스냅샷: 타깃 XABC에 매칭되는 모든 족
console.log(`[${sym} ${tf}] 현재가=${last} 타깃=${targetKey}`);
console.log('=== 차트 predict가 이 XABC에 매칭한 족 전부 ===');
const seen = new Set<string>();
for (const len of SCAN) {
  if (candles.length <= len * 2) continue;
  for (const p of predictHarmonicPatterns(getPivots(candles, len, 'wick'), last, true, candles)) {
    if (xk(p) !== targetKey) continue;
    const id = `${p.name}_${len}`;
    if (seen.has(p.name)) continue; seen.add(p.name);
    const sl = p.slPrice; const entry = harmonicEntryPrice(p.przPrice, sl, 0.5, true);
    const slPct = Math.abs(entry - sl) / entry * 100;
    console.log(`  len${len} ${p.name} | touched=${p.isPrzTouched} | PRZ=${Number(p.przPrice).toFixed(4)} SL=${Number(sl).toFixed(4)} | SL폭=${slPct.toFixed(2)}% ${slPct >= 15 ? '⛔(15%컷)' : ''}`);
  }
}

// 엔진: 타깃 XABC가 어느 phase인지
const e = new HarmonicEngine({}, tf as any);
e.setWarmupMode(true); for (const c of candles) e.feed(c); e.setWarmupMode(false);
const list = ((e.getStatus() as any).trackersList ?? []) as any[];
const hit = list.find(it => `${it.xabc.X.time}_${it.xabc.A.time}_${it.xabc.B.time}_${it.xabc.C.time}_${it.type === 'bull'}` === targetKey);
console.log('=== 엔진 결과 ===');
console.log(hit ? `  ${hit.patternName} | phase=${hit.phase} | exit=${hit.exitReason ?? ''}` : '  (엔진에 이 XABC 없음 = 필터 탈락 또는 미탐지)');
