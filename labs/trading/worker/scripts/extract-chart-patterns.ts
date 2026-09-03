// 차트에 그려지는 하모닉 지표(완성 + 예측 터치/미터치)를 현재 시점 기준으로 추출 → JSON.
// 차트(useAutoPatterns)와 동일 함수·스캔길이·basis(wick)·dedup을 써서 화면과 일치시킨다.
//
// 사용: node --experimental-strip-types scripts/extract-chart-patterns.ts [SYM1,SYM2,...|ALL]
//   기본: ALL(trade_configs 전 종목), 30m·4h·1d, 1200봉, wick

import { fetchCandles } from '../src/lib/warmup.ts';
import { detectHarmonicPatterns, predictHarmonicPatterns } from '../../../../shared/harmonic.ts';
import { getPivots } from '../../../../shared/pivots.ts';
import { writeFileSync } from 'node:fs';

const SCAN_LENGTHS = [55, 34, 21, 13, 8, 5];
const BASIS = 'wick' as const;
const LIMIT = 1200;
const TFS = ['30m', '4h', '1d'] as const;

// trade_configs 전 종목(2026-06-14 기준 48종). neon 조회 결과 하드코딩(스크립트 DB 비의존).
const ALL_SYMBOLS = [
  'AAVEUSDT','ADAUSDT','ALLOUSDT','ASTERUSDT','AVAXUSDT','BANKUSDT','BCHUSDT','BLESSUSDT','BTCUSDT',
  'DASHUSDT','DOGEUSDT','DOTUSDT','ESPORTSUSDT','ETHUSDT','FARTCOINUSDT','FETUSDT','FIDAUSDT','FILUSDT',
  'HOLOUSDT','HOMEUSDT','HYPEUSDT','INJUSDT','JTOUSDT','LABUSDT','LINKUSDT','LITUSDT','LTCUSDT','NEARUSDT',
  'ONDOUSDT','OPGUSDT','OPNUSDT','PEPEUSDT','PIPPINUSDT','PORTALUSDT','PUMPUSDT','SIRENUSDT','SKYAIUSDT',
  'SOLUSDT','SUIUSDT','TAOUSDT','TONUSDT','TRXUSDT','VVVUSDT','WIFUSDT','WLDUSDT','XLMUSDT','XPLUSDT','ZECUSDT',
];

const arg = (process.argv[2] ?? 'ALL').toUpperCase();
const symbols = (arg === 'ALL') ? ALL_SYMBOLS : arg.split(',').map(s => s.trim()).filter(Boolean);

function extractTf(candles: any[]) {
  const lastClose = candles[candles.length - 1].close;

  // 완성 패턴: 내림차순 스캔(큰 길이 우선), 같은 X·A·B·C·이름 겹치면 메이저 유지
  const completed = new Map<string, any>();
  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    for (const p of detectHarmonicPatterns(getPivots(candles, len, BASIS), true, candles)) {
      const { X, A, B, C } = p.points;
      const k = `${X.time}_${A.time}_${B.time}_${C.time}_${p.name}`;
      if (!completed.has(k)) completed.set(k, { scanLen: len, ...p });
    }
  }

  // 예측 패턴: 차트와 동일 dedup(A·B·이름·방향), 큰 스캔 우선
  const emerging = new Map<string, any>();
  for (const len of SCAN_LENGTHS) {
    if (candles.length <= len * 2) continue;
    for (const p of predictHarmonicPatterns(getPivots(candles, len, BASIS), lastClose, true, candles)) {
      const k = `${p.points.A.time}_${p.points.B.time}_${p.name}_${p.isBullish}`;
      if (!emerging.has(k)) emerging.set(k, { scanLen: len, ...p });
    }
  }
  const emg = [...emerging.values()];

  return {
    candles: candles.length,
    lastClose,
    completed: [...completed.values()],
    emergingTouched: emg.filter(p => p.isPrzTouched === true),
    emergingUntouched: emg.filter(p => p.isPrzTouched !== true),
  };
}

async function main() {
  const out: any = {
    generatedAt: new Date().toISOString(), basis: BASIS, candleLimit: LIMIT,
    scanLengths: SCAN_LENGTHS, source: 'binance-futures', symbols: {},
  };
  const failed: { symbol: string; reason: string }[] = [];
  const rows: string[] = [];

  for (const symbol of symbols) {
    try {
      const tfData: any = {};
      let totC = 0, totT = 0, totU = 0;
      for (const tf of TFS) {
        const candles = (await fetchCandles(symbol, tf, LIMIT)).slice(0, -1);
        if (!candles.length) throw new Error('빈 캔들');
        const r = extractTf(candles);
        tfData[tf] = r;
        totC += r.completed.length; totT += r.emergingTouched.length; totU += r.emergingUntouched.length;
      }
      out.symbols[symbol] = tfData;
      rows.push(`  ${symbol.padEnd(14)} 완성 ${String(totC).padStart(3)} | 터치 ${String(totT).padStart(2)} | 미터치 ${String(totU).padStart(2)}`);
    } catch (e) {
      failed.push({ symbol, reason: (e as Error).message });
    }
  }

  out.failed = failed;
  const path = symbols.length === 1 ? `scripts/chart-patterns-${symbols[0]}.json` : `scripts/chart-patterns-ALL.json`;
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`basis=${BASIS} limit=${LIMIT} source=binance | 성공 ${Object.keys(out.symbols).length} / 실패 ${failed.length}`);
  console.log(rows.join('\n'));
  if (failed.length) console.log('\n[실패(Binance 선물 미지원 등)]\n  ' + failed.map(f => `${f.symbol}(${f.reason})`).join(', '));
  console.log(`\n→ 저장: labs/trading/worker/${path}`);
}

main().catch(e => { console.error('ERR', e?.message || e); process.exit(1); });
