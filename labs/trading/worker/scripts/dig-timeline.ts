// 한 XABC가 시간(현재가)에 따라 어느 족으로 잡히는지 타임라인 재현.
// 매 캔들마다 그 시점 버퍼+현재가로 predict를 돌려, 타깃 XABC에 매칭되는 족과 touched를 출력.
// 사용: node --experimental-strip-types scripts/dig-timeline.ts BTCUSDT 4h X_A_B_C_bool

import { fetchCandles } from '../src/lib/warmup.ts';
import { predictHarmonicPatterns } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';

const SCAN = [55, 34, 21, 13, 8, 5];
const sym = process.argv[2], tf = process.argv[3], target = process.argv[4];
const [Xt] = target.split('_');
const Ct = Number(target.split('_')[3]);

const candles = (await fetchCandles(sym, tf, 1200)).slice(0, -1);
const xk = (p: any) => `${p.points.X.time}_${p.points.A.time}_${p.points.B.time}_${p.points.C.time}_${p.isBullish}`;
const d = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ');

console.log(`[${sym} ${tf}] 타깃 XABC=${target}`);
console.log('시각              | 현재가     | 그 시점 이 XABC에 잡힌 족 (touched여부)');
let prev = '';
for (let i = 0; i < candles.length; i++) {
  const t = Number(candles[i].time);
  if (t < Ct) continue;                       // C 형성 이후만
  const buf = candles.slice(0, i + 1);
  const price = candles[i].close;
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const len of SCAN) {
    if (buf.length <= len * 2) continue;
    for (const p of predictHarmonicPatterns(getPivots(buf, len, 'wick'), price, true, buf)) {
      if (xk(p) !== target) continue;
      if (seen.has(p.name)) continue; seen.add(p.name);
      hits.push(`${p.name}${p.isPrzTouched ? '●터치' : '○'}`);
    }
  }
  const line = hits.length ? hits.join(', ') : '(없음)';
  if (line !== prev) {                          // 변할 때만 출력
    console.log(`${d(t)} | ${String(price).padStart(9)} | ${line}`);
    prev = line;
  }
}
