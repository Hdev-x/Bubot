// Order Executor — Bitget 선물 주문 실행
// 진입: 시장가 + preset TP/SL1 (거래소 자동 관리)
// 청산: SL2 발생 시 시장가 청산

import { request, placeOrder, setLeverage, setMarginMode, getFuturesBalance, getPositions, cancelOrder as bitgetCancelOrder, getPendingOrders, cancelAllPlanOrders, cancelAllSymbolOrders, placeTPSLOrder } from './bitget.ts';
import type { OrderSide, BitgetCredentials } from './bitget.ts';
import type { EntrySignal, ExitSignal } from './signal-engine.ts';

// ── 설정 ─────────────────────────────────────────────────
const LEVERAGE = 10;
const LOT_STEP = 0.01;  // 최소 주문 단위 (SOLUSDT: 0.01 SOL)
const MIN_SIZE  = 0.001;  // 최소 주문 수량 (BTC 등 비싼 코인 진입을 위해 하향)

// 주문 실행 옵션 — 통합 워커는 설정별 creds/investUsdt/leverage를 명시 전달.
// 미전달 시 레거시(bot.ts) 동작 유지: 전역 creds + fullseed + LEVERAGE 상수.
export interface ExecOptions {
  creds?:      BitgetCredentials;
  investUsdt?: number;  // 고정 금액 진입 시 (positionPct가 우선함)
  leverage?:   number;  // 미전달 시 LEVERAGE 상수(5)
  positionPct?: number; // 현재 지갑 잔고 대비 퍼센트 진입 (예: 25)
}

function floorLot(size: number): number {
  return Math.floor(size / LOT_STEP) * LOT_STEP;
}

// ── 진입 주문 ─────────────────────────────────────────────
// 시장가 진입 + preset TP / SL1 (Bitget이 자동 관리)
// SL1이 먼저 체결되면 TP 자동 취소, 반대도 동일
export async function executeEntry(signal: EntrySignal, opts: ExecOptions = {}): Promise<{ orderId: string; size: number } | null> {
  const { symbol, direction, entryPrice, tpPrice, sl1Price } = signal;
  const { creds } = opts;
  let leverage = opts.leverage ?? LEVERAGE;

  // 비트겟(Bitget) 상장 및 리스크 정책에 따른 레버리지 강제 조정 (기본 20배를 지원하지 않는 예외 종목들)
  const LEVERAGE_OVERRIDES: Record<string, number> = {
    'SIRENUSDT': 10, 'LABUSDT': 10, 'SKYAIUSDT': 10, 
    'BLESSUSDT': 10, 'ESPORTSUSDT': 10, 'PIPPINUSDT': 10
  };

  if (LEVERAGE_OVERRIDES[symbol] && leverage > LEVERAGE_OVERRIDES[symbol]) {
    console.log(`[Executor] ⚠️ ${symbol} 레버리지 제한 감지: 사용자가 요청한 ${leverage}x -> 거래소 허용치 ${LEVERAGE_OVERRIDES[symbol]}x 로 강제 하향 조정`);
    leverage = LEVERAGE_OVERRIDES[symbol];
  }

  try {
    // 2. 마진 모드 / 레버리지 설정
    await setMarginMode(symbol, creds).catch(() => {}); // 이미 설정돼 있으면 오류 무시
    await setLeverage(symbol, leverage, creds);

    // 3. 수량 계산
    //    positionPct 지정 시: 현재 봇 잔고의 N% 를 증거금으로 사용
    //    investUsdt 지정 시: (investUsdt * leverage) / price  (설정별 고정 자금)
    //    미지정 시(레거시): fullseed = (잔고 * leverage) / price
    let rawSize: number;
    if (opts.positionPct && opts.positionPct > 0) {
      const balance = await getFuturesBalance(creds);
      const marginToUse = balance * (opts.positionPct / 100);
      rawSize = (marginToUse * leverage) / entryPrice;
      console.log(`[Executor] 📊 비중=${opts.positionPct}% (${marginToUse.toFixed(2)} USDT) × ${leverage}x`);
    } else if (opts.investUsdt != null) {
      rawSize = (opts.investUsdt * leverage) / entryPrice;
      console.log(`[Executor] 💵 투자금=${opts.investUsdt} USDT × ${leverage}x`);
    } else {
      const balance = await getFuturesBalance(creds);
      console.log(`[Executor] 💰 잔고(fullseed): ${balance.toFixed(4)} USDT × ${leverage}x`);
      rawSize = (balance * leverage) / entryPrice;
    }
    const size = floorLot(rawSize);
    if (size < MIN_SIZE) {
      console.warn(`[Executor] ⚠️ 수량 부족 (${size.toFixed(3)} < min ${MIN_SIZE}) — 주문 스킵`);
      return null;
    }

    const marginUsed = (size * entryPrice) / leverage;
    console.log(`[Executor] 📋 수량=${size} ${symbol} | 필요 마진≈${marginUsed.toFixed(2)} USDT`);
    console.log(`[Executor]    진입≈${entryPrice.toFixed(4)} | TP=${tpPrice.toFixed(4)} | SL1=${sl1Price.toFixed(4)}`);

    // 4. 진입 시장가 주문 (preset TP/SL 포함)
    const side: OrderSide = direction === 'long' ? 'buy' : 'sell';
    const body: Record<string, unknown> = {
      symbol,
      productType: 'USDT-FUTURES',
      marginMode:  'isolated',
      marginCoin:  'USDT',
      size:        String(size),
      side,
      tradeSide:   'open',
      orderType:   'market',
      // Bitget preset TP/SL — 둘 중 하나 체결 시 나머지 자동 취소
      presetStopSurplusPrice: tpPrice.toFixed(4),
      presetStopLossPrice:    sl1Price.toFixed(4),
    };

    const result = await request('POST', '/api/v2/mix/order/place-order', body, creds);
    const orderId = result.orderId as string;
    console.log(`[Executor] ✅ 진입 주문 완료 | orderId=${orderId}`);
    return { orderId, size };

  } catch (err: any) {
    console.error(`[Executor] ❌ 진입 주문 실패: ${err.message}`);
    return null;
  }
}

// ── 지정가 진입 주문 ──────────────────────────────────────
// mid 지정가 + preset TP/SL1 — 거래소가 체결 및 TP/SL 관리
export async function executeLimitEntry(signal: EntrySignal, opts: ExecOptions = {}): Promise<{ orderId: string; size: number } | null> {
  const { symbol, direction, entryPrice, tpPrice, sl1Price } = signal;
  const { creds } = opts;
  const leverage = opts.leverage ?? LEVERAGE;

  try {
    await setMarginMode(symbol, creds).catch(() => {});
    await setLeverage(symbol, leverage, creds);

    let rawSize: number;
    if (opts.positionPct && opts.positionPct > 0) {
      const balance = await getFuturesBalance(creds);
      const marginToUse = balance * (opts.positionPct / 100);
      rawSize = (marginToUse * leverage) / entryPrice;
      console.log(`[Executor] 📊 비중=${opts.positionPct}% (${marginToUse.toFixed(2)} USDT) × ${leverage}x`);
    } else if (opts.investUsdt != null) {
      rawSize = (opts.investUsdt * leverage) / entryPrice;
      console.log(`[Executor] 💵 투자금=${opts.investUsdt} USDT × ${leverage}x`);
    } else {
      const balance = await getFuturesBalance(creds);
      console.log(`[Executor] 💰 잔고(fullseed): ${balance.toFixed(4)} USDT × ${leverage}x`);
      rawSize = (balance * leverage) / entryPrice;
    }
    const size = floorLot(rawSize);
    if (size < MIN_SIZE) {
      console.warn(`[Executor] ⚠️ 수량 부족 (${size.toFixed(3)} < min ${MIN_SIZE}) — 주문 스킵`);
      return null;
    }

    const marginUsed = (size * entryPrice) / leverage;
    console.log(`[Executor] 📋 수량=${size} | 필요 마진≈${marginUsed.toFixed(2)} USDT`);
    console.log(`[Executor]    지정가=${entryPrice.toFixed(4)} | TP=${tpPrice.toFixed(4)} | SL1=${sl1Price.toFixed(4)}`);

    const side: OrderSide = direction === 'long' ? 'buy' : 'sell';
    const body: Record<string, unknown> = {
      symbol,
      productType: 'USDT-FUTURES',
      marginMode:  'isolated',
      marginCoin:  'USDT',
      size:        String(size),
      side,
      tradeSide:   'open',
      orderType:   'limit',
      price:       entryPrice.toFixed(4),
      presetStopSurplusPrice: tpPrice.toFixed(4),
      presetStopLossPrice:    sl1Price.toFixed(4),
    };

    const result = await request('POST', '/api/v2/mix/order/place-order', body, creds);
    const orderId = result.orderId as string;
    console.log(`[Executor] ✅ 지정가 주문 완료 | orderId=${orderId}`);
    return { orderId, size };

  } catch (err: any) {
    console.error(`[Executor] ❌ 지정가 주문 실패: ${err.message}`);
    return null;
  }
}

// ── 지정가 주문 취소 ──────────────────────────────────────
export async function cancelLimitOrder(symbol: string, orderId: string, creds?: BitgetCredentials): Promise<void> {
  try {
    await bitgetCancelOrder(symbol, orderId, creds);
    console.log(`[Executor] ✅ 지정가 주문 취소 완료 | orderId=${orderId}`);
  } catch (err: any) {
    console.error(`[Executor] ❌ 지정가 주문 취소 실패: ${err.message}`);
  }
}

// ── 미체결 주문 존재 여부 ─────────────────────────────────
export async function hasPendingOrder(symbol: string, orderId: string, creds?: BitgetCredentials): Promise<boolean> {
  try {
    const orders = await getPendingOrders(symbol, creds);
    return orders.some((o: any) => o.orderId === orderId);
  } catch {
    return true; // 조회 실패 시 보수적으로 아직 미체결로 간주
  }
}

// ── SL2 청산 ──────────────────────────────────────────────
// 신호 엔진이 SL2(1h 종가 ob.mid 이탈) 감지 시 호출
// 포지션 전량 시장가 청산
export async function executeSL2Exit(symbol: string, creds?: BitgetCredentials): Promise<void> {
  try {
    // 현재 포지션 조회 (실제 수량 확인)
    const positions = await getPositions(symbol, creds);
    const pos = positions.find((p: any) => parseFloat(p.total) > 0);

    if (!pos) {
      console.warn(`[Executor] ⚠️ SL2 청산 요청 — 포지션 없음 (이미 체결?)`);
      return;
    }

    const size     = parseFloat(pos.total);
    const holdSide = pos.holdSide as string; // 'long' | 'short'
    const side: OrderSide = holdSide === 'long' ? 'sell' : 'buy';

    console.log(`[Executor] 🛑 SL2 청산 | ${symbol} ${holdSide} size=${size}`);

    await placeOrder({
      symbol,
      side,
      tradeSide: 'close',
      size:      String(size),
      orderType: 'market',
    }, creds);

    console.log(`[Executor] ✅ SL2 청산 완료`);

  } catch (err: any) {
    console.error(`[Executor] ❌ SL2 청산 실패: ${err.message}`);
  }
}

// ── 포지션 상태 조회 ─────────────────────────────────────
// 포지션이 있으면 true, 없으면 false, 조회 실패 시 null (불확실)
export async function hasOpenPosition(symbol: string, creds?: BitgetCredentials): Promise<boolean | null> {
  try {
    const positions = await getPositions(symbol, creds);
    return positions.some((p: any) => parseFloat(p.total) > 0);
  } catch {
    return null; // 조회 실패 — 호출부가 다음 틱에 재시도하도록 불확실 처리
  }
}

// ── TP1 절반 익절 및 본절 스탑 ──────────────────────────────────
// TP1 도달 시 50% 시장가 청산 후, 기존 예약 주문 모두 취소
// 남은 수량에 대해 본절(SL) 및 최종 목표가(TP2) 설정
export async function executeTP1PartialExit(
  symbol: string,
  newSlPrice: number,
  newTpPrice: number,
  creds?: BitgetCredentials
): Promise<void> {
  try {
    const positions = await getPositions(symbol, creds);
    const pos = positions.find((p: any) => parseFloat(p.total) > 0);

    if (!pos) {
      console.warn(`[Executor] ⚠️ TP1 반익절 요청 — 포지션 없음 (이미 전체 체결?)`);
      return;
    }

    const totalSize = parseFloat(pos.total);
    const partialSize = floorLot(totalSize * 0.5); // 절반

    if (partialSize < MIN_SIZE) {
      console.warn(`[Executor] ⚠️ TP1 반익절 수량 부족 (${partialSize} < min ${MIN_SIZE}) — 청산 보류`);
      return;
    }

    const holdSide = pos.holdSide as string; // 'long' | 'short'
    const side: OrderSide = holdSide === 'long' ? 'sell' : 'buy';

    console.log(`[Executor] 🎯 TP1 도달 — ${symbol} 50% 반익절 실행 (${partialSize})`);

    // 1. 50% 수량 시장가 청산
    await placeOrder({
      symbol,
      side,
      tradeSide: 'close',
      size: String(partialSize),
      orderType: 'market',
    }, creds);
    console.log(`[Executor] ✅ 50% 시장가 청산 완료`);

    // 2. 기존 예약(Plan) 주문 및 미체결(Limit) 지정가 일괄 취소 (에러 무시)
    await cancelAllPlanOrders(symbol, 'normal_plan', creds).catch(() => {});
    await cancelAllPlanOrders(symbol, 'profit_plan', creds).catch(() => {});
    await cancelAllPlanOrders(symbol, 'loss_plan', creds).catch(() => {});
    await cancelAllSymbolOrders(symbol, creds).catch(() => {});
    console.log(`[Executor] 🧹 기존 TP/SL 예약 주문 및 미체결 지정가 취소 시도`);

    // 3. 남은 물량에 대해 새로운 TPSL 세팅
    await placeTPSLOrder({
      symbol,
      planType: 'pos_loss',
      triggerPrice: newSlPrice.toFixed(4),
      triggerType: 'mark_price',
      holdSide: holdSide as 'long' | 'short',
    }, creds).catch(e => console.error(`[Executor] ❌ 새로운 SL 세팅 실패: ${e.message}`));

    await placeTPSLOrder({
      symbol,
      planType: 'pos_profit',
      triggerPrice: newTpPrice.toFixed(4),
      triggerType: 'mark_price',
      holdSide: holdSide as 'long' | 'short',
    }, creds).catch(e => console.error(`[Executor] ❌ 새로운 TP 세팅 실패: ${e.message}`));

    console.log(`[Executor] 🛡️ 본절 스탑(${newSlPrice.toFixed(4)}) 및 최종 TP2(${newTpPrice.toFixed(4)}) 세팅 완료`);

  } catch (err: any) {
    console.error(`[Executor] ❌ TP1 반익절 로직 실행 실패: ${err.message}`);
  }
}
