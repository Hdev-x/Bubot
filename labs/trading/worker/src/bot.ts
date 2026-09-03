// AutoTrade Bot — 4h OB → 1h Entry (20x Fullseed)
// 실행: npm run bot

import 'dotenv/config';
import { CandleFeed }                                    from './lib/candle-feed.ts';
import type { Candle }                                   from './lib/candle-feed.ts';
import { SignalEngine }                                  from './lib/signal-engine.ts';
import { warmUpEngine }                                  from './lib/warmup.ts';
import { executeEntry, executeSL2Exit }                  from './lib/order-executor.ts';
import { getFuturesBalance, getMainFuturesBalance, getPositions, getPendingOrders, cancelOrder, setCredentials, setMainCredentials } from './lib/bitget.ts';
import { startApiServer }                                from './lib/api-server.ts';
import { loadBotCredentials, loadMainCredentials }       from './lib/credentials.ts';
import { store }                                         from './lib/state-store.ts';
import { BitgetPrivateWS }                               from './lib/bitget-ws.ts';
import type { EntrySignal, ExitSignal }                  from './lib/signal-engine.ts';

// ── 설정 ─────────────────────────────────────────────────
const TARGET_SYMBOL = process.env.TARGET_SYMBOL || 'SOLUSDT';
const PORT = parseInt(process.env.PORT || '3001', 10);
const INITIAL_CAPITAL = parseFloat(process.env.INITIAL_CAPITAL || '10'); // 총수익률 기준 초기자본(USDT)

// ── API 키 주입 ───────────────────────────────────────────
// 심볼별 서브계정 키 매핑: BITGET_SOL_API_KEY → SOLUSDT
const SYMBOL_TO_ENV_PREFIX: Record<string, string> = {
  'SOLUSDT':      'SOL',
  'NEARUSDT':     'NEAR',
  'LTCUSDT':      'LTC',
  'WLDUSDT':      'WLD',
  'INJUSDT':      'INJ',
  'BTCUSDT':      'BTC',
  '1000SHIBUSDT': 'SHIB',
};
const prefix = SYMBOL_TO_ENV_PREFIX[TARGET_SYMBOL];
if (!prefix) {
  console.error(`[Bot] ❌ TARGET_SYMBOL=${TARGET_SYMBOL}에 대한 API 키 prefix 매핑이 없습니다.`);
  process.exit(1);
}

// 자격증명 주입: Spring 내부 API(DB 키) 우선, 실패 시 env fallback
async function injectCredentials() {
  const creds = await loadBotCredentials(TARGET_SYMBOL, prefix);
  if (!creds) {
    console.error(`[Bot] ❌ ${TARGET_SYMBOL} 자격증명을 서버/env 어디에서도 찾지 못했습니다.`);
    process.exit(1);
  }
  setCredentials(creds);

  const mainCreds = await loadMainCredentials();
  if (mainCreds) setMainCredentials(mainCreds);

  return creds;
}

const SYMBOLS   = [TARGET_SYMBOL];
const INTERVALS = ['4h', '1h'];

const ALL_SYMBOL_CONFIGS: Record<string, { tpPercent: number, slPercent: number }> = {
  'SOLUSDT':      { tpPercent: 0.5, slPercent: 3.0 },
  'NEARUSDT':     { tpPercent: 0.5, slPercent: 2.6 },
  'LTCUSDT':      { tpPercent: 0.5, slPercent: 2.6 },
  'WLDUSDT':      { tpPercent: 0.5, slPercent: 2.6 },
  'INJUSDT':      { tpPercent: 0.5, slPercent: 2.9 },
  'BTCUSDT':      { tpPercent: 0.3, slPercent: 3.0 },
  '1000SHIBUSDT': { tpPercent: 0.4, slPercent: 2.6 },
};

const activeConfig = ALL_SYMBOL_CONFIGS[TARGET_SYMBOL] || { tpPercent: 0.5, slPercent: 3.0 };

const ENGINE_PARAMS = {
  tpPercent:      activeConfig.tpPercent,
  slPercent:      activeConfig.slPercent,
  maxWaitCandles: 40,
  maxHoldCandles: 100,
  longOnly:       false,
  useSl3:         false,
  useBbStrategy:  false,
  useFvgStrategy: false,
  symbolConfigs: {
    [TARGET_SYMBOL]: activeConfig
  }
};

// ── 상태 ─────────────────────────────────────────────────
let warmupDone = false;
let activeEntry: EntrySignal | null = null;  // 현재 보유 포지션의 진입 신호
let heldKey:     string | null      = null;  // 보유 포지션 트래커 키 (type-obTime)
let entrySize    = 0;                         // 보유 수량
let entering     = false;                     // 시장가 진입 중복 방지
let closing      = false;                     // SL2/SL3/timeout 청산 진행 중 (WS 중복기록 방지)

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('=== AutoTrade Bot ===');
  console.log(`대상 심볼: ${TARGET_SYMBOL} | API Port: ${PORT} | 20x Fullseed\n`);

  // 0. 자격증명 주입 (서버 DB 키 우선, env fallback)
  const creds = await injectCredentials();

  // 1. 신호 엔진 생성
  const engine = new SignalEngine(ENGINE_PARAMS);

  // 2. API 서버 시작
  startApiServer(engine, PORT);
  store.setSettings({ tpPercent: ENGINE_PARAMS.tpPercent, slPercent: ENGINE_PARAMS.slPercent, useBbStrategy: ENGINE_PARAMS.useBbStrategy });
  store.setSymbolConfigs(ENGINE_PARAMS.symbolConfigs);
  store.initPersistence(TARGET_SYMBOL, INITIAL_CAPITAL); // 거래기록 로드 + 누적 통계 복원

  // 3. 잔고 확인
  const balance = await getFuturesBalance();
  console.log(`💰 Bitget 선물 잔고: ${balance.toFixed(4)} USDT\n`);
  store.setBalance(balance);
  const mainBalance = await getMainFuturesBalance().catch(() => null);
  if (mainBalance !== null) {
    console.log(`💰 Bitget 메인 계정 잔고: ${mainBalance.toFixed(4)} USDT\n`);
    store.setMainBalance(mainBalance);
  }

  // 4. 신호 핸들러 (모니터링용 로그 — 주문은 안 함. 실거래 진입은 실시간 mid 터치 워처가 담당)
  engine.on('signal', (signal: EntrySignal) => {
    console.log(`📌 신호 | ${signal.symbol} ${signal.direction.toUpperCase()} @ mid=${signal.entryPrice.toFixed(4)} | TP=${signal.tpPrice.toFixed(4)} SL1=${signal.sl1Price.toFixed(4)}`);
  });

  // 4-1. 신호 취소 (대기 초과) — 미체결 주문이 없으니 모니터링 정리만
  engine.on('signal_cancel', ({ symbol }: { symbol: string }) => {
    console.log(`[Bot] ⏱ 신호 취소(대기 초과) | ${symbol}`);
  });

  // 4-2. 진입(active) 폴백 — 같은 캔들 신호+진입 등 실시간 워처가 못 잡은 경우 종가 시장가 진입
  engine.on('entry', async (sig: EntrySignal) => {
    if (!warmupDone) return;
    await tryMarketEntry(sig, SignalEngine.key(sig.ob));
  });

  // 5. 청산 신호 (엔진 감지) — 내 보유 트래커의 sl2/sl3/timeout만 시장가 청산.
  //    tp/sl1은 거래소 preset이 체결 → positionUpdate WS가 기록/정리
  engine.on('exit', async (signal: ExitSignal) => {
    if (!warmupDone) return;
    if (!activeEntry || heldKey !== SignalEngine.key(signal.ob)) return; // 내 포지션 아님 → 모니터링만
    if (signal.reason === 'tp' || signal.reason === 'sl1') return;        // 거래소 preset 담당
    console.log(`\n🛑 청산(${signal.reason.toUpperCase()}) | ${signal.symbol} @ ${signal.price.toFixed(4)}`);
    closing = true;
    try {
      await executeSL2Exit(signal.symbol);
      recordTrade(signal.symbol, signal.reason, signal.price, signal.time);
    } finally {
      activeEntry = null; heldKey = null; entrySize = 0; closing = false;
    }
  });

  // 6. 웜업
  console.log('🔄 웜업 시작...\n');
  await warmUpEngine(engine, SYMBOLS);
  warmupDone = true;
  store.setEngineStatus(engine.getStatus());
  console.log('\n엔진 상태:', engine.getStatus());

  // 6-1. 재시작 reconciliation — 거래소 실포지션/잔여주문과 in-memory 동기화 (중복 진입 방지)
  await reconcileOnStartup(engine);

  // 7. 실시간 캔들 피드
  const feed = new CandleFeed(SYMBOLS, INTERVALS);

  // 실시간 mid 터치 감지 → 시장가 진입 (포지션 없을 때만, 한 번에 하나)
  const watchEntry = async (c: Candle) => {
    if (!warmupDone || activeEntry || entering) return;
    const status = engine.getStatus();
    for (const t of status.trackersList) {
      if (t.symbol !== c.symbol || t.phase !== 'waiting_entry') continue;
      const touched = t.type === 'bull' ? c.low <= t.mid : c.high >= t.mid;
      if (!touched) continue;
      const key = `${t.type}-${t.obTime}`;
      const sig = engine.markEntered(c.symbol, key); // 엔진 즉시 active 전환(모니터링 동기화)
      if (!sig) continue;
      await tryMarketEntry(sig, key);
      store.setEngineStatus(engine.getStatus());
      break; // 한 번에 하나만
    }
  };

  feed.onCandle(c => {
    // 현재가 업데이트 (live 캔들 포함)
    store.setPrice(c.symbol, c.close);
    // 신호 엔진은 확정 캔들만 처리 (내부에서 isClosed 필터)
    engine.feed(c);
    store.setEngineStatus(engine.getStatus());
    // live/확정 무관하게 mid 터치 감시 (live 1h 캔들의 장중 저·고점 사용)
    void watchEntry(c);
  });
  feed.start();

  // 8. 포지션 웹소켓 연동 — 거래소 preset(TP/SL1) 체결로 종료 감지
  const bitgetWs = new BitgetPrivateWS(creds);

  bitgetWs.on('positionUpdate', (pos) => {
    const sym = pos.instId;
    if (!activeEntry || activeEntry.symbol !== sym) return;  // 내 포지션 아님
    if (parseFloat(pos.total) !== 0) return;                 // 아직 보유 중
    if (closing) return;                                     // SL2/SL3/timeout 청산은 exit 핸들러가 기록

    // 거래소 preset TP/SL1 체결로 종료된 케이스 — 현재가로 TP/SL1 판별
    const currentPrice = store.get().lastPrice[sym] ?? activeEntry.tpPrice;
    const outcome = Math.abs(currentPrice - activeEntry.tpPrice) < Math.abs(currentPrice - activeEntry.sl1Price)
      ? 'tp' : 'sl1';
    const exitPrice = outcome === 'tp' ? activeEntry.tpPrice : activeEntry.sl1Price;
    console.log(`\n[Bot] 📊 포지션 종료 감지 (WS, ${outcome.toUpperCase()}) | ${sym}`);
    recordTrade(sym, outcome, exitPrice, Math.floor(Date.now() / 1000));
    activeEntry = null; heldKey = null; entrySize = 0;
    store.setEngineStatus(engine.getStatus());
  });

  bitgetWs.connect();

  // 8-1. 잔고 업데이트용 1분 폴링
  setInterval(async () => {
    const bal = await getFuturesBalance().catch(() => store.get().balance);
    store.setBalance(bal);
    const mainBal = await getMainFuturesBalance().catch(() => null);
    if (mainBal !== null) {
      store.setMainBalance(mainBal);
    }
  }, 60_000);

  // 9. 상태 출력 (10분마다)
  setInterval(() => {
    const s  = store.get();
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    console.log(`\n[${ts}] 잔고=${s.balance.toFixed(4)} USDT | 엔진:`, s.engineStatus);
  }, 10 * 60 * 1000);

  console.log('\n✅ 봇 실행 중. Ctrl+C로 종료.\n');
}

// ── 재시작 reconciliation ─────────────────────────────────
// 부팅 시 거래소 실포지션/잔여주문과 in-memory 상태를 맞춰 중복 진입을 방지.
async function reconcileOnStartup(engine: SignalEngine): Promise<void> {
  const symbol = TARGET_SYMBOL;

  // 1) 잔여 미체결(구버전 지정가 등) 정리 — 현재 모델은 미체결을 안 쓰므로 전부 취소
  try {
    const pending = await getPendingOrders(symbol);
    for (const o of pending) {
      await cancelOrder(symbol, o.orderId as string).catch(() => {});
      console.log(`[Bot] 🧹 시작 시 잔여 미체결 취소 | ${symbol} orderId=${o.orderId}`);
    }
  } catch (e) {
    console.warn('[Bot] ⚠️ 시작 미체결 조회 실패:', (e as Error).message);
  }

  // 2) 거래소 실포지션 확인
  let pos: any = null;
  try {
    const positions = await getPositions(symbol);
    pos = positions.find((p: any) => parseFloat(p.total) > 0) ?? null;
  } catch (e) {
    console.warn('[Bot] ⚠️ 시작 포지션 조회 실패 — 안전상 flat 가정 안 함, 다음 틱 재확인 필요:', (e as Error).message);
    return;
  }
  if (!pos) {
    console.log(`[Bot] ✅ 시작 reconcile | ${symbol} 보유 포지션 없음 (flat)`);
    return;
  }

  const direction: 'long' | 'short' = pos.holdSide === 'long' ? 'long' : 'short';
  const obType:    'bull' | 'bear'  = direction === 'long' ? 'bull' : 'bear';
  const entryPx = parseFloat(pos.openPriceAvg ?? pos.averageOpenPrice ?? '0');
  const size    = parseFloat(pos.total);

  // 3) 엔진 active 트래커 중 mid가 진입가에 가장 가까운 것 매칭 (3% 이내 = 동일 OB)
  let best: { mid: number; obTime: number } | null = null;
  let bestDist = Infinity;
  for (const t of engine.getStatus().trackersList) {
    if (t.symbol !== symbol || t.phase !== 'active' || t.type !== obType) continue;
    const d = Math.abs(t.mid - entryPx);
    if (d < bestDist) { bestDist = d; best = { mid: t.mid, obTime: t.obTime }; }
  }
  const matched = best && bestDist <= entryPx * 0.03 ? best : null;
  const mid     = matched ? matched.mid : entryPx;   // 매칭 실패 시 진입가를 mid로 대용
  const obTime  = matched ? matched.obTime : 0;
  const tp  = direction === 'long' ? mid * (1 + activeConfig.tpPercent / 100) : mid * (1 - activeConfig.tpPercent / 100);
  const sl1 = direction === 'long' ? mid * (1 - activeConfig.slPercent / 100) : mid * (1 + activeConfig.slPercent / 100);

  activeEntry = {
    symbol, direction,
    ob: { symbol, time: obTime, high: mid, low: mid, mid, type: obType },
    entryPrice: mid,
    tpPrice: tp, sl1Price: sl1, sl2Price: mid,
    sl3Price: ENGINE_PARAMS.useSl3 ? mid : null,
    time: Math.floor(Date.now() / 1000),
    tpPercent: activeConfig.tpPercent, slPercent: activeConfig.slPercent,
  };
  heldKey   = matched ? `${obType}-${obTime}` : null;
  entrySize = size;
  store.setPosition({
    symbol, direction, entryPrice: entryPx, size,
    tpPrice: tp, sl1Price: sl1, sl2Price: mid, entryTime: activeEntry.time,
  });

  if (matched) {
    console.log(`[Bot] ✅ 시작 reconcile | 포지션 복구 ${symbol} ${direction.toUpperCase()} size=${size} @${entryPx.toFixed(4)} (OB mid=${mid.toFixed(4)} 매칭, key=${heldKey})`);
  } else {
    console.warn(`[Bot] ⚠️ 시작 reconcile | 포지션 있으나 매칭 트래커 없음 ${symbol} ${direction.toUpperCase()} size=${size} @${entryPx.toFixed(4)} — 중복진입은 차단되나 SL2 자동청산 불가(거래소 preset TP/SL1만 유효). 모니터링 확인 요망.`);
  }
}

// ── 시장가 진입 ───────────────────────────────────────────
// 포지션이 없을 때만 시장가 진입(+거래소 preset TP/SL1). 중복 진입 방지 가드 포함.
async function tryMarketEntry(sig: EntrySignal, key: string): Promise<void> {
  if (activeEntry || entering) return;
  entering = true;
  try {
    const result = await executeEntry(sig);   // 시장가 + preset TP/SL1
    if (!result) return;
    activeEntry = sig;
    heldKey     = key;
    entrySize   = result.size;
    store.setPosition({
      symbol:     sig.symbol,
      direction:  sig.direction,
      entryPrice: sig.entryPrice,
      size:       result.size,
      tpPrice:    sig.tpPrice,
      sl1Price:   sig.sl1Price,
      sl2Price:   sig.sl2Price,
      entryTime:  sig.time,
    });
    store.addTrade({
      symbol:     sig.symbol,
      direction:  sig.direction,
      entryPrice: sig.entryPrice,
      exitPrice:  sig.entryPrice,
      outcome:    '진입',
      entryTime:  sig.time,
      exitTime:   Math.floor(Date.now() / 1000),
      pnlPct:     0,
    });
    console.log(`[Bot] 🟢 시장가 진입 | ${sig.symbol} ${sig.direction.toUpperCase()} size=${result.size} @≈${sig.entryPrice.toFixed(4)}`);
  } finally {
    entering = false;
  }
}

// ── 거래 기록 ─────────────────────────────────────────────
function recordTrade(
  symbol:    string,
  outcome:   'tp' | 'sl1' | 'sl2' | 'sl3' | 'timeout',
  exitPrice: number,
  exitTime:  number,
) {
  const pos = store.get().position;
  if (!pos) return;

  const dir  = pos.direction === 'long' ? 1 : -1;
  const pnl  = dir * (exitPrice - pos.entryPrice) / pos.entryPrice * 100;
  const realizedUsdt = dir * (exitPrice - pos.entryPrice) * pos.size; // 실현 손익(USDT, 레버리지 내재)

  store.addClosedTrade({
    symbol,
    direction:  pos.direction,
    entryPrice: pos.entryPrice,
    exitPrice,
    outcome,
    entryTime:  pos.entryTime,
    exitTime,
    pnlPct:        +pnl.toFixed(4),
    realizedUsdt:  +realizedUsdt.toFixed(4),
  });

  store.setPosition(null);
  activeEntry = null;
  console.log(`[Bot] 기록 | ${symbol} ${outcome.toUpperCase()} | pnl=${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)}% | 실현=${realizedUsdt >= 0 ? '+' : ''}${realizedUsdt.toFixed(4)} USDT`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
