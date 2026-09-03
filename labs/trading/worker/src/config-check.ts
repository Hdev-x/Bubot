// Phase 1 검증 스크립트 (라이브 봇 루프 미수정)
// 흐름: Spring 활성 설정 조회 → SignalEngineParams 변환 → 키 유효성 게이트
// 실행: INTERNAL_API_URL/INTERNAL_API_TOKEN 설정 후  npx tsx src/config-check.ts
import 'dotenv/config';
import { fetchActiveConfigs, toEngineParams } from './lib/config-loader.ts';
import { verifyTradingKey } from './lib/key-guard.ts';
import type { BitgetCredentials } from './lib/bitget.ts';

const INTERNAL_API_URL   = process.env.INTERNAL_API_URL!;
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN!;

// 심볼 → 운영자 키 슬롯 (Phase 1: 설정은 운영자 키로 검증)
const SYMBOL_TO_SLOT: Record<string, string> = {
  SOLUSDT: 'SOL', NEARUSDT: 'NEAR', LTCUSDT: 'LTC', WLDUSDT: 'WLD',
  INJUSDT: 'INJ', BTCUSDT: 'BTC', '1000SHIBUSDT': '1000SHIB',
};

async function credsForSlot(slot: string): Promise<BitgetCredentials | null> {
  const res = await fetch(`${INTERNAL_API_URL}/api/internal/bot-credentials/${slot}`, {
    headers: { 'X-Internal-Token': INTERNAL_API_TOKEN },
  });
  if (!res.ok) return null;
  return res.json() as Promise<BitgetCredentials>;
}

async function main() {
  console.log('=== Phase 1: 매매설정 → 엔진파라미터 → 키 게이트 검증 ===');
  const configs = (await fetchActiveConfigs()) ?? [];
  console.log(`활성 설정 ${configs.length}건\n`);

  for (const cfg of configs) {
    console.log(`[설정 #${cfg.id}] ${cfg.symbol} | 전략=${cfg.strategy} | 투자금=${cfg.investUsdt} | ${cfg.leverage}x | 손실한도=${cfg.maxLossPct}%`);
    const ep = toEngineParams(cfg);
    console.log(`  엔진파라미터: tp=${ep.tpPercent} sl=${ep.slPercent} longOnly=${ep.longOnly} useSl3=${ep.useSl3} useBb=${ep.useBbStrategy}`);

    const slot = SYMBOL_TO_SLOT[cfg.symbol];
    const creds = slot ? await credsForSlot(slot) : null;
    if (!creds) { console.log('  ⚠️ 키 없음 — 게이트 스킵\n'); continue; }
    const check = await verifyTradingKey(creds);
    console.log(`  키 게이트: ${check.ok ? '✅ 거래가능' : '❌ ' + check.reason}\n`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
