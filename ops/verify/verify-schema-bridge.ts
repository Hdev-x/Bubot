import { normalizeConfig, toLegacyBacktest, fromLegacyBacktest, defaultDetector, validateConfig } from '../../shared/strategy-schema.ts';
const kinds = ['HARMONIC','ABCD','OB','FVG','BB'] as const;
// kind별로 레거시 폼이 실제 표현 가능한 실행 필드
const execFields: Record<string, string[]> = {
  HARMONIC: ['entryMode','tp1Pct','tp2Pct','moveStopToBreakeven','slCapPct','maxWaitCandles','maxHoldCandles'],
  ABCD: ['entryMode','tp1Pct','tp2Pct','maxWaitCandles','maxHoldCandles'],
  OB: ['tpPricePct','slPricePct','maxWaitCandles','maxHoldCandles'],
  FVG: ['tpPricePct','slPricePct','maxWaitCandles','maxHoldCandles'],
  BB: ['tpPricePct','slPricePct','maxWaitCandles','maxHoldCandles'],
};
let fail = 0;
for (const kind of kinds) {
  const cfg = normalizeConfig({
    name: `${kind} 테스트`, symbol: 'BTCUSDT', timeframe: '4h', zoneTimeframe: '1d',
    risk: { investUsdt: 150, leverage: 10, maxLossPct: 0, capitalMode: 'fixed', positionPct: 10, initialCapital: 500 },
    execution: { entryMode: 'close', tp1Pct: 60, tp2Pct: 40, slCapPct: 8, moveStopToBreakeven: true, maxWaitCandles: 30, maxHoldCandles: 80,
      ...(kind==='HARMONIC'||kind==='ABCD' ? {} : { tpPricePct: 2.5, slPricePct: 3.5 }) },
    cost: { feePct: 0.05, slippagePct: 0.03, fundingPctPer8h: 0.015 },
    detector: defaultDetector(kind),
  });
  if (validateConfig(cfg).length) { console.log(kind, 'validate 실패'); fail++; continue; }
  const back = fromLegacyBacktest(toLegacyBacktest(cfg), 'BTCUSDT');
  const probs: string[] = [];
  if (JSON.stringify(back.detector) !== JSON.stringify(cfg.detector)) probs.push('detector');
  if (back.timeframe !== cfg.timeframe || back.zoneTimeframe !== cfg.zoneTimeframe) probs.push('timeframe');
  for (const k of ['investUsdt','leverage','capitalMode','positionPct','initialCapital'])
    if ((back.risk as any)[k] !== (cfg.risk as any)[k]) probs.push(`risk.${k}`);
  for (const k of execFields[kind])
    if ((back.execution as any)[k] !== (cfg.execution as any)[k]) probs.push(`execution.${k}`);
  for (const k of ['feePct','slippagePct','fundingPctPer8h'])
    if ((back.cost as any)[k] !== (cfg.cost as any)[k]) probs.push(`cost.${k}`);
  if (probs.length) { fail++; console.log('❌', kind, probs.join(', ')); }
  else console.log('✅', kind);
}
process.exit(fail ? 1 : 0);
