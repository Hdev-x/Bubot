// 통합 워커 — 1프로세스가 N개의 매매설정을 동시에 운용한다.
// 구조: Spring 활성설정 폴링 → 엔진 레지스트리(중복제거) + 공유 시세 → 신호 fan-out → 설정별 creds로 주문.
// 레거시 bot.ts와 완전히 별개의 진입점. 전역 CREDS를 쓰지 않고 항상 설정별 creds를 명시 전달한다.
//
// 실행: node --experimental-strip-types src/unified-worker.ts
import 'dotenv/config';

import { MarketFeed }                                  from './lib/market-feed.ts';
import { EngineRegistry, type RegistryEvent }          from './lib/engine-registry.ts';
import { HarmonicEngine }                              from './lib/harmonic-engine.ts';
import { MonitoringRegistry }                          from './lib/monitoring-registry.ts';
import { ConfigStateStore, type ConfigState }          from './lib/config-state.ts';
import { SignalEngine }                                from './lib/signal-engine.ts';
import type { EntrySignal, ExitSignal }                from './lib/signal-engine.ts';
import type { Candle }                                 from './lib/candle-feed.ts';
import { executeEntry, executeSL2Exit, executeTP1PartialExit, hasOpenPosition } from './lib/order-executor.ts';
import { paperAccount, paperOpen, paperClose, paperClosePartial, decidePaperRisk, sizePaperPosition } from './lib/paper-executor.ts';
import { getFuturesBalance, getPendingOrders, getPositions, request } from './lib/bitget.ts';
import { fetchActiveConfigs, fetchKillSwitch, fetchTradingEnabled, fetchHarmonicAlertTfs, reportPatternUpsert, reportPnl, reportStatus, reportTrade, reportWorkerStatus, setKillSwitch, type TradeConfig } from './lib/config-loader.ts';
import { loadBotCredentialsByTarget, loadMainCredentials, loadOperatorBotCredentials } from './lib/credentials.ts';
import type { BitgetCredentials } from './lib/bitget.ts';
import { sendNtfyMessage } from './lib/ntfy.ts';
import { sendWebPush } from './lib/push.ts';

// ── 설정 ─────────────────────────────────────────────────
const POLL_MS = parseInt(process.env.WORKER_POLL_MS || '8000', 10);  // 활성설정 폴링 주기
const POS_POLL_MS = parseInt(process.env.WORKER_POS_POLL_MS || '20000', 10); // 거래소 preset(TP/SL1) 체결 감지 폴링

// 일일 실현손실 한도 (USDT, 0=비활성). 초과 손실 시 글로벌 킬스위치 ON.
const DAILY_LOSS_LIMIT_USDT = parseFloat(process.env.DAILY_LOSS_LIMIT_USDT || '0');

const marketFeed = new MarketFeed();
const registry   = new EngineRegistry();
const monitoring = new MonitoringRegistry();
const store       = new ConfigStateStore();
const lastPrice   = new Map<string, number>();  // 심볼 → 최근가 (TP/SL1 판별용)
let mainCreds: BitgetCredentials | null = null;
let mainBalance: number | null = null;
let mainPositions: any[] = [];
let mainPendingOrders: any[] = [];
let workerPendingOrders: any[] = [];

// ── 서브계정(봇 키 슬롯) 잔고/포지션 집계 — 총자산 합산용 ──
const BOT_SLOTS = ['SOL', 'NEAR', 'LTC', 'WLD', 'INJ', 'BTC', '1000SHIB'];
const botCredsCache = new Map<string, BitgetCredentials>();
let subBalance = 0;
let subPositions: any[] = [];
let tradingEnabled = false;  // 자동매매 ON/OFF — OFF면 신규 진입만 차단(포지션 유지). 폴링으로 갱신.
// 모니터링 하모닉 신호 푸시 알림 — 켜진 TF 집합(폴링 갱신) + 발송 중복방지(패턴 signature).
let harmonicAlertTfs = new Set<string>();
const notifiedHarmonicSignals = new Set<string>();

// ── 운영 알림 (장애·안전장치 — 신호 알림과 별개) ─────────
function notifyOps(title: string, body: string): void {
  console.warn(`[Worker] 🔔 운영알림 | ${title} — ${body}`);
  void sendNtfyMessage(title, body);
  void sendWebPush(title, body);
}

// ── 일일 실현손익 누적 + 손실 한도 킬스위치 ──────────────
let dailyPnlDate = '';
let dailyPnlUsdt = 0;
let dailyLossTriggered = false;
function trackDailyPnl(realizedUsdt: number): void {
  const today = new Date().toISOString().slice(0, 10); // UTC 날짜 기준 리셋
  if (today !== dailyPnlDate) { dailyPnlDate = today; dailyPnlUsdt = 0; dailyLossTriggered = false; }
  dailyPnlUsdt += realizedUsdt;
  if (DAILY_LOSS_LIMIT_USDT > 0 && !dailyLossTriggered && dailyPnlUsdt <= -DAILY_LOSS_LIMIT_USDT) {
    dailyLossTriggered = true;
    void setKillSwitch(true, `daily-loss ${dailyPnlUsdt.toFixed(2)} USDT`).then(ok => {
      notifyOps('🛑 일일 손실 한도 초과', `당일 실현 ${dailyPnlUsdt.toFixed(2)} USDT (한도 ${DAILY_LOSS_LIMIT_USDT}) — 킬스위치 ${ok ? 'ON' : 'ON 실패(수동 확인 필요)'}`);
    });
  }
}

// ── WS 스테일 재연결 알림 (10분 스로틀) ──────────────────
let lastStaleNotifyAt = 0;
marketFeed.on('stale', (silentMs: number) => {
  const now = Date.now();
  if (now - lastStaleNotifyAt < 10 * 60 * 1000) return;
  lastStaleNotifyAt = now;
  notifyOps('⚠️ 시세 WS 스테일', `${Math.round(silentMs / 1000)}초 무수신 — 강제 재연결 수행`);
});

// ── 시세 → 엔진 ───────────────────────────────────────────
marketFeed.on('candle', (c: Candle) => {
  if (c.close > 0) lastPrice.set(c.symbol, c.close);
  registry.feed(c);  // 레지스트리가 심볼별 공유 엔진에 라우팅
  monitoring.feed(c); // 관찰 전용 엔진 — 주문/알림 이벤트 없음
});

// ── 신호 fan-out: 엔진 이벤트 → 구독 설정별 주문 ──────────
// entry: 엔진이 active 전환 시 1회 발생 → 구독 설정 전체가 각자 creds로 진입.
registry.on('entry', (ev: RegistryEvent) => {
  const sig = ev.payload as EntrySignal;
  const key = SignalEngine.key(sig.ob);
  for (const id of ev.configIds) {
    const st = store.get(id);
    if (st) void tryEntry(st, sig, key);
  }
});

// exit: sl2/sl3/timeout만 워커가 시장가 청산. tp/sl1은 거래소 preset이 처리. tp1은 부분 청산.
// 페이퍼 모드는 거래소 preset이 없으므로 tp/sl1도 워커가 직접 페이퍼 청산한다.
registry.on('exit', (ev: RegistryEvent) => {
  const sig = ev.payload as ExitSignal;
  const key = SignalEngine.key(sig.ob);
  for (const id of ev.configIds) {
    const st = store.get(id);
    if (!st || !st.activeEntry || st.heldKey !== key) continue;
    if ((sig.reason === 'tp' || sig.reason === 'sl1') && !isPaper(st)) continue; // 실거래는 거래소 preset 담당
    if (sig.reason === 'tp1') {
      void partialCloseBySignal(st, sig);
    } else {
      void closeBySignal(st, sig);
    }
  }
});

// 모니터링 하모닉 패턴 생애주기(signal→체결→종료)를 DB 한 줄로 upsert(차트 재표시용).
// 트레이딩 구독과 무관하게 관찰 중인 모든 심볼·TF를 저장한다.
monitoring.on('patternUpsert', (ev: { signature: string; payload: unknown }) => {
  void reportPatternUpsert(ev.signature, ev.payload);
});

// ── 모니터링 하모닉 "신호" 푸시 알림 (1단계: TF 선택, 전체 구독에 발송) ──
// ev.signature = `SYMBOL|HARMONIC_<tf>`. phase==='signal'이고 그 TF가 켜져 있으면 1회 발송.
function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '';
  return v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toPrecision(4);
}
monitoring.on('patternUpsert', (ev: { signature: string; payload: unknown }) => {
  const tf = ev.signature.split('|')[1]?.replace('HARMONIC_', '') ?? '';
  if (!harmonicAlertTfs.has(tf)) return;
  const p = ev.payload as any;
  if (!p || p.phase !== 'signal') return;
  const sig = String(p.signature ?? ev.signature);
  if (notifiedHarmonicSignals.has(sig)) return;
  notifiedHarmonicSignals.add(sig);
  if (notifiedHarmonicSignals.size > 10000) notifiedHarmonicSignals.clear(); // 누수 방지(소프트 캡)

  const dir = p.type === 'bull' ? 'Bullish' : 'Bearish';
  const pat = String(p.patternName ?? '하모닉').replace(/^(Bullish|Bearish)\s+/i, '').replace(/\s*\((Emerging|Completed)\)/i, '');
  const price = fmtPrice(Number(p.entryPrice ?? p.mid ?? p.przPrice));
  const title = `${p.symbol}.P`;
  const body = `${dir} ${pat} (${tf})${price ? ` $${price}` : ''}`;
  console.log(`[Worker] 🔔 하모닉신호 알림 | ${title} - ${body}`);
  void sendWebPush(title, body);
});

registry.on('signal', (ev: RegistryEvent) => {
  const s = ev.payload as EntrySignal;
  const engine = registry.getEngine(ev.signature);
  let patternName = 'OB';
  if (engine) {
    const status = engine.getStatus() as any;
    const tracker = status.trackersList?.find((t: any) => t.obTime === s.ob.time && t.symbol === s.symbol);
    if (tracker?.patternName) patternName = tracker.patternName;
    else if (tracker?.isBb) patternName = 'BB';
    else if (s.ob && (s.ob as any).isFvg) patternName = 'FVG';
  }
  
  const baseSymbol = s.symbol.replace('USDT', '');
  const dirStr = s.direction === 'long' ? 'Bullish' : 'Bearish';
  
  // 포맷팅 변경: 제목엔 심볼, 본문엔 방향/패턴/가격
  const cleanPattern = patternName.replace(/ \((Emerging|Completed)\)/i, '');
  const title = `${s.symbol}.P`;
  const body = `${dirStr} ${cleanPattern} $${s.entryPrice.toFixed(1)}`;
  
  console.log(`[Worker] 📌 신호 | ${title} - ${body} | 구독=${ev.configIds.join(',')}`);
  void sendNtfyMessage(title, body);
  void sendWebPush(title, body);
});
registry.on('signal_cancel', (ev: RegistryEvent) => {
  console.log(`[Worker] ⏱ 신호취소 | ${ev.symbol} | 구독=${ev.configIds.join(',')}`);
});

// ── 재시작 reconciliation ─────────────────────────────────
// 설정 추가 시 거래소 실포지션과 인메모리 상태를 맞춰 중복 진입을 방지.
// 워커는 상태를 영속화하지 않으므로(인메모리) 재시작마다 이 동기화가 핵심.
async function reconcile(st: ConfigState): Promise<void> {
  const symbol = st.cfg.symbol;
  let positions: any[];
  try { positions = await getPositions(symbol, st.creds); }
  catch (e) {
    console.warn(`[Worker] ⚠️ reconcile 포지션 조회 실패 cfg=${st.cfg.id} — 다음 폴링 재확인:`, (e as Error).message);
    return;
  }
  const pos = positions.find((p: any) => parseFloat(p.total) > 0);
  if (!pos) return; // flat — 정상

  const direction: 'long' | 'short' = pos.holdSide === 'long' ? 'long' : 'short';
  const obType:    'bull' | 'bear'  = direction === 'long' ? 'bull' : 'bear';
  const entryPx = parseFloat(pos.openPriceAvg ?? pos.averageOpenPrice ?? '0');
  const size    = parseFloat(pos.total);

  // 웜업된 엔진의 active 트래커 중 mid가 진입가에 가장 가까운 것 매칭(3% 이내 = 동일 OB)
  const engine = registry.getEngine(st.signature);
  let best: { mid: number; obTime: number } | null = null;
  let bestDist = Infinity;
  if (engine) {
    for (const t of engine.getStatus().trackersList) {
      if (t.symbol !== symbol || t.phase !== 'active' || t.type !== obType) continue;
      const d = Math.abs(t.mid - entryPx);
      if (d < bestDist) { bestDist = d; best = { mid: t.mid, obTime: t.obTime }; }
    }
  }
  const matched = best && bestDist <= entryPx * 0.03 ? best : null;
  const mid     = matched ? matched.mid : entryPx;   // 매칭 실패 시 진입가를 mid로 대용
  const obTime  = matched ? matched.obTime : 0;

  const tpPct = pctTp(st), slPct = pctSl(st);
  const tpPrice  = direction === 'long' ? mid * (1 + tpPct / 100) : mid * (1 - tpPct / 100);
  const sl1Price = direction === 'long' ? mid * (1 - slPct / 100) : mid * (1 + slPct / 100);

  st.activeEntry = {
    symbol, direction,
    ob: { symbol, time: obTime, high: mid, low: mid, mid, type: obType },
    entryPrice: mid, tpPrice, sl1Price, sl2Price: mid,
    sl3Price: null,
    time: Math.floor(Date.now() / 1000),
    tpPercent: tpPct, slPercent: slPct,
  };
  st.heldKey   = matched ? `${obType}-${obTime}` : null;
  st.entrySize = size;

  if (matched) {
    console.log(`[Worker] ✅ reconcile 포지션 복구 | cfg=${st.cfg.id} ${symbol} ${direction.toUpperCase()} size=${size} @${entryPx.toFixed(4)} (OB mid=${mid.toFixed(4)}, key=${st.heldKey})`);
  } else {
    console.warn(`[Worker] ⚠️ reconcile | cfg=${st.cfg.id} 포지션 있으나 매칭 트래커 없음 ${symbol} ${direction.toUpperCase()} size=${size} — 중복진입은 차단되나 SL2 자동청산 불가(거래소 preset TP/SL1만 유효)`);
  }
}

// 설정 params에서 tp/sl% 추출 (config-loader toEngineParams와 동일 기본값)
function pctTp(st: ConfigState): number { const p = st.cfg.params as any; return Number(p?.tpPercent ?? 0.5); }
function pctSl(st: ConfigState): number { const p = st.cfg.params as any; return Number(p?.slPercent ?? 3.0); }

// ── 페이퍼 모드 (H-R50 실증, 인수인계 부록 F) ─────────────
// params.paperTrading=true 설정은 거래소 대신 가상계좌(paper_*)로 체결. creds 불필요.
function isPaper(st: ConfigState): boolean { return (st.cfg.params as any)?.paperTrading === true; }
function isPaperCfg(cfg: TradeConfig): boolean { return (cfg.params as any)?.paperTrading === true; }
function paperRiskPct(st: ConfigState): number { const p = st.cfg.params as any; return Number(p?.paperRiskPct ?? 1.0); } // 1R = 에쿼티 1%
const PAPER_DUMMY_CREDS: BitgetCredentials = { apiKey: '', secretKey: '', passphrase: '' };
const paperKillNotified = new Set<string>(); // memberId별 킬스위치(-45%) 알림 1회 스로틀

// 페이퍼 reconcile — 재시작 시 paper_positions와 인메모리 상태 동기화 (같은 심볼 1포지션 전제)
async function reconcilePaper(st: ConfigState): Promise<void> {
  let acc;
  try { acc = await paperAccount(st.cfg.memberId); }
  catch (e) { console.warn(`[Worker] ⚠️ 페이퍼 reconcile 실패 cfg=${st.cfg.id}:`, (e as Error).message); return; }
  const pos = acc.positions.find(p => p.symbol === st.cfg.symbol);
  if (!pos) return; // flat — 정상

  const direction = pos.direction;
  const obType: 'bull' | 'bear' = direction === 'long' ? 'bull' : 'bear';
  // 엔진 active 트래커 매칭(3% 이내) — reconcile()과 동일 규칙
  const engine = registry.getEngine(st.signature);
  let best: { mid: number; obTime: number } | null = null;
  let bestDist = Infinity;
  if (engine) {
    for (const t of engine.getStatus().trackersList) {
      if (t.symbol !== st.cfg.symbol || t.phase !== 'active' || t.type !== obType) continue;
      const d = Math.abs(t.mid - pos.entryPrice);
      if (d < bestDist) { bestDist = d; best = { mid: t.mid, obTime: t.obTime }; }
    }
  }
  const matched = best && bestDist <= pos.entryPrice * 0.03 ? best : null;
  const mid = matched ? matched.mid : pos.entryPrice;
  const obTime = matched ? matched.obTime : 0;
  const tpPct = pctTp(st), slPct = pctSl(st);
  st.activeEntry = {
    symbol: st.cfg.symbol, direction,
    ob: { symbol: st.cfg.symbol, time: obTime, high: mid, low: mid, mid, type: obType },
    entryPrice: pos.entryPrice,
    tpPrice: direction === 'long' ? mid * (1 + tpPct / 100) : mid * (1 - tpPct / 100),
    sl1Price: direction === 'long' ? mid * (1 - slPct / 100) : mid * (1 + slPct / 100),
    sl2Price: mid, sl3Price: null,
    time: Math.floor(Date.now() / 1000),
    tpPercent: tpPct, slPercent: slPct,
  };
  st.heldKey = matched ? `${obType}-${obTime}` : null;
  st.entrySize = pos.size;
  st.paperPositionId = pos.id;
  console.log(`[Worker] ✅ 페이퍼 reconcile | cfg=${st.cfg.id} ${st.cfg.symbol} ${direction.toUpperCase()} size=${pos.size} @${pos.entryPrice.toFixed(4)} (pos=${pos.id}${matched ? `, key=${st.heldKey}` : ', 트래커 미매칭'})`);
}

// ── 진입 ──────────────────────────────────────────────────
async function tryEntry(st: ConfigState, sig: EntrySignal, key: string): Promise<void> {
  // 자동매매 OFF — 신규 진입 차단(기존 포지션·청산관리는 계속). 페이퍼는 실자산 보호 목적과 무관하므로 통과.
  if (!tradingEnabled && !isPaper(st)) return;
  if (st.cfg.params?.tradeEnabled === false) {
    console.log(`[Worker] ⚠️ 매매 옵션 OFF — 진입 스킵 | cfg=${st.cfg.id} ${sig.symbol}`);
    return;
  }
  if (st.activeEntry || st.entering) return;

  // 동시 포지션 최대 4개 제한 (BotTarget 기준)
  const activeCount = store.withPosition().filter(c => c.cfg.botTarget === st.cfg.botTarget).length;
  if (activeCount >= 4) {
    console.log(`[Worker] ⚠️ 봇 ${st.cfg.botTarget} 최대 포지션(4개) 초과. 진입 보류: ${sig.symbol}`);
    return;
  }

  st.entering = true;
  try {
    // ── 페이퍼 모드: 가상계좌 체결 + F3 리스크 엔진(1%·DD감속·KS-45%) ──
    if (isPaper(st)) {
      const acc = await paperAccount(st.cfg.memberId);
      const risk = decidePaperRisk(acc, paperRiskPct(st));
      if (risk.blocked) {
        if (!paperKillNotified.has(st.cfg.memberId)) {
          paperKillNotified.add(st.cfg.memberId);
          notifyOps('🛑 페이퍼 킬스위치(-45%)', `${st.cfg.memberId} 실현에쿼티 DD ${(risk.drawdown * 100).toFixed(1)}% — 신규 진입 중단, 수동 점검 필요`);
        }
        console.warn(`[Worker] 🛑 페이퍼 KS | cfg=${st.cfg.id} DD=${(risk.drawdown * 100).toFixed(1)}% — 진입 차단`);
        return;
      }
      paperKillNotified.delete(st.cfg.memberId); // 회복 시 재무장
      // 체결가 = 현재 시세(없으면 0.5 라인가). 0.5 라인가와의 차 = 슬리피지 실측(F5④).
      const fillPrice = lastPrice.get(sig.symbol) ?? sig.entryPrice;
      const sized = sizePaperPosition(risk.riskUsdt, fillPrice, sig.sl1Price, acc.balance);
      if (!sized) {
        console.warn(`[Worker] ⚠️ 페이퍼 사이징 불가 | cfg=${st.cfg.id} ${sig.symbol} risk=${risk.riskUsdt.toFixed(2)} SL거리=${Math.abs(fillPrice - sig.sl1Price).toFixed(6)}`);
        return;
      }
      const opened = await paperOpen(st.cfg.memberId, sig.symbol, sig.direction, +sized.marginUsdt.toFixed(4), sized.leverage, fillPrice);
      st.activeEntry = { ...sig, entryPrice: fillPrice }; // 손익·본절 기준 = 실제 페이퍼 체결가
      st.heldKey = key;
      st.entrySize = opened.size;
      st.paperPositionId = opened.positionId;
      const slipPct = sig.entryPrice > 0 ? ((fillPrice - sig.entryPrice) / sig.entryPrice * 100) : 0;
      // F5④ 체결 현실성 실측 — 0.5라인가/실체결가/슬리피지/리스크 상태를 매매 기록에 남긴다
      st.entryMeta = {
        entryLinePrice: sig.entryPrice, fillPrice, slippagePct: +slipPct.toFixed(4),
        riskUsdt: +risk.riskUsdt.toFixed(2), riskMultiplier: risk.multiplier, ddAtEntry: +(risk.drawdown * 100).toFixed(2),
      };
      console.log(`[Worker] 🟢 페이퍼 진입 | cfg=${st.cfg.id} ${sig.symbol} ${sig.direction.toUpperCase()} size=${opened.size.toFixed(6)} @${fillPrice.toFixed(4)} (0.5라인 ${sig.entryPrice.toFixed(4)}, 슬리피지 ${slipPct.toFixed(3)}%) 1R=${risk.riskUsdt.toFixed(2)}U x${risk.multiplier} DD=${(risk.drawdown * 100).toFixed(1)}%`);
      return;
    }

    // DB의 params에서 복리(compound) 및 비중(positionPct) 파싱
    let posPct: number | undefined;
    if (st.cfg.params?.capitalMode === 'compound' && st.cfg.params?.positionPct) {
      posPct = Number(st.cfg.params.positionPct);
    }

    // 'entry' 이벤트는 엔진이 0.5 라인 체결을 확정한 시점에만 발생 → 전량 시장가 진입.
    const result = await executeEntry(sig, {
      creds:      st.creds,
      investUsdt: st.cfg.investUsdt,
      leverage:   st.cfg.leverage,
      positionPct: posPct,
    });
    if (!result) return;
    st.activeEntry = sig;
    st.heldKey     = key;
    st.entrySize   = result.size;
    console.log(`[Worker] 🟢 진입 | cfg=${st.cfg.id} ${st.cfg.memberId} ${sig.symbol} ${sig.direction.toUpperCase()} size=${result.size} @≈${sig.entryPrice.toFixed(4)}`);
  } catch (e) {
    console.error(`[Worker] ❌ 진입 실패 cfg=${st.cfg.id}:`, (e as Error).message);
  } finally {
    st.entering = false;
  }
}

// ── 청산 (sl2/sl3/timeout — 페이퍼는 tp/sl1 포함 전량) ─────
async function closeBySignal(st: ConfigState, sig: ExitSignal): Promise<void> {
  if (st.closing || !st.activeEntry) return;
  st.closing = true;
  try {
    console.log(`[Worker] 🛑 ${isPaper(st) ? '페이퍼 ' : ''}청산(${sig.reason.toUpperCase()}) | cfg=${st.cfg.id} ${sig.symbol} @ ${sig.price.toFixed(4)}`);
    if (isPaper(st)) {
      if (st.paperPositionId != null) await paperClose(st.cfg.memberId, st.paperPositionId, sig.price);
    } else {
      await executeSL2Exit(sig.symbol, st.creds);
    }
    await settle(st, sig.price, sig.reason);
  } catch (e) {
    console.error(`[Worker] ❌ 청산 실패 cfg=${st.cfg.id}:`, (e as Error).message);
  } finally {
    st.closing = false;
  }
}

// ── 부분 청산 (tp1) ───────────────────────────────────────
async function partialCloseBySignal(st: ConfigState, sig: ExitSignal): Promise<void> {
  if (st.closing || !st.activeEntry) return;
  st.closing = true;
  try {
    const newSlPrice = sig.ob.mid; // TP1 exit signal 의 ob.mid 에는 본절(PRZ) 가격이 담겨있음
    const newTpPrice = st.activeEntry.tpPrice;

    console.log(`[Worker] ✂️ ${isPaper(st) ? '페이퍼 ' : ''}부분청산(TP1) | cfg=${st.cfg.id} ${sig.symbol} @ ${sig.price.toFixed(4)}`);
    if (isPaper(st)) {
      // 페이퍼: 50% 부분청산 (본절 이동은 엔진 상태머신이 담당 — 이후 sl1 이벤트가 본절가로 옴)
      if (st.paperPositionId != null) await paperClosePartial(st.cfg.memberId, st.paperPositionId, sig.price, 0.5);
    } else {
      await executeTP1PartialExit(sig.symbol, newSlPrice, newTpPrice, st.creds);
    }

    // 내부 상태의 entrySize 를 절반으로 깎음 (수익 계산용)
    st.entrySize = st.entrySize / 2;

    // 부분 청산 정산 보고
    await settlePartial(st, sig.price, sig.reason);
  } catch (e) {
    console.error(`[Worker] ❌ 부분 청산 실패 cfg=${st.cfg.id}:`, (e as Error).message);
  } finally {
    st.closing = false;
  }
}

// ── F4 매매당 태깅 — 하모닉 메타(패턴/신호시각/레짐) + 진입 부가기록(슬리피지 등) ──
function buildTradeTags(st: ConfigState): string | undefined {
  const e = st.activeEntry;
  if (!e) return undefined;
  const tags: Record<string, unknown> = {};
  if (e.patternName) tags.pattern = e.patternName;
  if (e.signalTime) tags.signalTime = e.signalTime;
  if (e.przPrice) tags.przPrice = e.przPrice;
  if (e.tp1Price) tags.tp1Price = e.tp1Price;
  if (e.patternName) { tags.tp2Price = e.tpPrice; tags.slPrice = e.sl1Price; }
  if (e.regimeAtArm) tags.regimeAtArm = e.regimeAtArm;
  if (e.regime) tags.regimeAtFill = e.regime;
  if (st.entryMeta) Object.assign(tags, st.entryMeta);
  if (isPaper(st)) tags.paper = true;
  return Object.keys(tags).length ? JSON.stringify(tags) : undefined;
}

// ── 부분 청산 정산 ───────────────────────────────────────
async function settlePartial(st: ConfigState, exitPrice: number, reason: string): Promise<void> {
  const e = st.activeEntry;
  if (!e) return;
  const dir = e.direction === 'long' ? 1 : -1;
  // st.entrySize 가 위에서 절반으로 깎였으므로, 방금 팔린 절반 수량에 대한 수익
  const realizedUsdt = dir * (exitPrice - e.entryPrice) * st.entrySize;
  trackDailyPnl(realizedUsdt);
  await reportPnl(st.cfg.id, +realizedUsdt.toFixed(4));
  await reportTrade(st.cfg.id, {
    memberId:   st.cfg.memberId,
    symbol:     e.symbol,
    direction:  e.direction,
    entryPrice: e.entryPrice,
    exitPrice,
    size:       st.entrySize,          // 방금 청산된 절반 수량
    pnlUsdt:    +realizedUsdt.toFixed(4),
    outcome:    reason,
    entryTime:  e.time,
    exitTime:   Math.floor(Date.now() / 1000),
    tags:       buildTradeTags(st),
  });
}

// ── 청산 정산: 실현손익 계산 + Spring 보고(손실한도 판정은 DB) ──
async function settle(st: ConfigState, exitPrice: number, reason: string): Promise<void> {
  const e = st.activeEntry;
  if (!e) return;
  const dir = e.direction === 'long' ? 1 : -1;
  const realizedUsdt = dir * (exitPrice - e.entryPrice) * st.entrySize;
  trackDailyPnl(realizedUsdt);
  await reportPnl(st.cfg.id, +realizedUsdt.toFixed(4));
  await reportTrade(st.cfg.id, {
    memberId:   st.cfg.memberId,
    symbol:     e.symbol,
    direction:  e.direction,
    entryPrice: e.entryPrice,
    exitPrice,
    size:       st.entrySize,
    pnlUsdt:    +realizedUsdt.toFixed(4),
    outcome:    reason,
    entryTime:  e.time,
    exitTime:   Math.floor(Date.now() / 1000),
    tags:       buildTradeTags(st),
  });
  console.log(`[Worker] 📊 정산 cfg=${st.cfg.id} ${reason.toUpperCase()} | 실현=${realizedUsdt >= 0 ? '+' : ''}${realizedUsdt.toFixed(4)} USDT`);
  st.activeEntry = null; st.heldKey = null; st.entrySize = 0; st.paperPositionId = null; st.entryMeta = null;
}

// ── TP/SL1(거래소 preset) 체결 감지 — 보유 설정 포지션 폴링 ──
async function pollPositionCloses(): Promise<void> {
  for (const st of store.withPosition()) {
    if (st.closing || !st.activeEntry) continue;
    if (isPaper(st)) continue; // 페이퍼는 거래소 preset이 없음 — tp/sl1도 엔진 exit 이벤트로 청산됨
    const open = await hasOpenPosition(st.activeEntry.symbol, st.creds);
    if (open === null) continue;       // 조회 실패 — 다음 폴링 재시도
    if (open) continue;                // 아직 보유
    // 포지션이 사라짐 = 거래소 preset(TP 또는 SL1) 체결. 현재가로 판별.
    const e = st.activeEntry;
    const px = lastPrice.get(e.symbol) ?? e.tpPrice;
    const outcome  = Math.abs(px - e.tpPrice) < Math.abs(px - e.sl1Price) ? 'tp' : 'sl1';
    const exitPx   = outcome === 'tp' ? e.tpPrice : e.sl1Price;
    console.log(`[Worker] 📊 포지션 종료 감지(폴링, ${outcome.toUpperCase()}) | cfg=${st.cfg.id} ${e.symbol}`);
    st.closing = true;
    try { await settle(st, exitPx, outcome); }
    finally { st.closing = false; }
  }
}

// ── 메인 계정 상태 — 프론트가 레거시 main-account-api에 의존하지 않게 Worker snapshot에 포함한다.
async function refreshMainAccountStatus(): Promise<void> {
  if (!mainCreds) {
    const loaded = await loadMainCredentials();
    if (!loaded) return;
    mainCreds = loaded;
  }
  try {
    const [balance, allPositions, rawPendingOrders] = await Promise.all([
      getFuturesBalance(mainCreds),
      request<any[]>('GET', '/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT', undefined, mainCreds),
      request<any>('GET', '/api/v2/mix/order/orders-pending?productType=USDT-FUTURES', undefined, mainCreds),
    ]);

    mainBalance = balance;
    mainPositions = ((allPositions as any[]) || [])
      .filter(p => Number(p.total ?? 0) > 0)
      .map(p => ({
        symbol:       p.symbol,
        direction:    p.holdSide === 'short' ? 'short' : 'long',
        entryPrice:   Number(p.openPriceAvg ?? p.averageOpenPrice ?? 0),
        size:         Number(p.total ?? 0),
        markPrice:    Number(p.markPrice ?? p.openPriceAvg ?? 0),
        unrealizedPl: Number(p.unrealizedPL ?? 0),
        leverage:     Number(p.leverage ?? 1),
        marginMode:   p.marginMode ?? 'isolated',
      }));

    const orderList = Array.isArray(rawPendingOrders)
      ? rawPendingOrders
      : (rawPendingOrders?.entrustedList ?? []);
    mainPendingOrders = orderList.map((o: any) => ({
      orderId:    o.orderId,
      symbol:     o.symbol,
      direction:  o.side === 'sell' ? 'short' : 'long',
      price:      Number(o.price ?? 0),
      size:       Number(o.size ?? 0),
      tpPrice:    o.presetStopSurplusPrice ? Number(o.presetStopSurplusPrice) : null,
      sl1Price:   o.presetStopLossPrice ? Number(o.presetStopLossPrice) : null,
      createTime: Number(o.cTime ?? Date.now()),
      orderType:  o.orderType ?? 'limit',
    }));
  } catch (e) {
    console.warn('[Worker] 메인 계정 상태 조회 실패:', (e as Error).message);
  }
}

// 등록된 봇 키 슬롯(Bot1~7) 전부의 선물잔고+포지션을 합산. 총자산에 서브계정 반영용.
async function refreshSubAccounts(): Promise<void> {
  let balSum = 0;
  const posAll: any[] = [];
  for (const slot of BOT_SLOTS) {
    let creds = botCredsCache.get(slot);
    if (!creds) {
      const loaded = await loadOperatorBotCredentials(slot);
      if (!loaded) continue;  // 미등록 슬롯은 건너뜀
      creds = loaded;
      botCredsCache.set(slot, creds);
    }
    try {
      const [bal, positions] = await Promise.all([
        getFuturesBalance(creds),
        request<any[]>('GET', '/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT', undefined, creds),
      ]);
      balSum += bal;
      for (const p of ((positions as any[]) || []).filter(p => Number(p.total ?? 0) > 0)) {
        posAll.push({
          symbol:       p.symbol,
          direction:    p.holdSide === 'short' ? 'short' : 'long',
          entryPrice:   Number(p.openPriceAvg ?? p.averageOpenPrice ?? 0),
          size:         Number(p.total ?? 0),
          markPrice:    Number(p.markPrice ?? p.openPriceAvg ?? 0),
          unrealizedPl: Number(p.unrealizedPL ?? 0),
          leverage:     Number(p.leverage ?? 1),
          marginMode:   p.marginMode ?? 'isolated',
          botTarget:    slot,
        });
      }
    } catch (e) {
      console.warn(`[Worker] 서브계정 ${slot} 조회 실패:`, (e as Error).message);
    }
  }
  subBalance = balSum;
  subPositions = posAll;
}

async function refreshPendingOrders(): Promise<void> {
  const next: any[] = [];
  for (const st of store.all()) {
    // 실주문 비활성 설정은 거래소 미체결이 존재할 수 없음 → 헛호출(429) 방지를 위해 폴링 스킵.
    // tradeEnabled가 undefined인 설정도 실주문이 없으므로 truthy일 때만 폴링한다.
    // 모니터링은 엔진의 캔들 기반 상태머신(탐색/신호/체결/종료)만으로 이루어진다.
    if (!st.cfg.params?.tradeEnabled) continue;
    if (isPaper(st)) continue; // 페이퍼 설정은 거래소 미체결이 없음(dummy creds — 호출 금지)
    try {
      const rawOrders = await getPendingOrders(st.cfg.symbol, st.creds) as any;
      const orders = Array.isArray(rawOrders) ? rawOrders : (rawOrders?.entrustedList ?? []);
      for (const o of orders) {
        next.push({
          configId:   st.cfg.id,
          memberId:   st.cfg.memberId,
          symbol:     o.symbol ?? st.cfg.symbol,
          orderId:    o.orderId,
          direction:  o.side === 'buy' ? 'long' : 'short',
          price:      Number(o.price ?? 0),
          size:       Number(o.size ?? 0),
          tpPrice:    o.presetStopSurplusPrice ? Number(o.presetStopSurplusPrice) : null,
          sl1Price:   o.presetStopLossPrice ? Number(o.presetStopLossPrice) : null,
          createTime: Number(o.cTime ?? Date.now()),
          orderType:  o.orderType ?? 'limit',
          botName:    'Worker',
        });
      }
    } catch (e) {
      console.warn(`[Worker] 미체결 조회 실패 cfg=${st.cfg.id}:`, (e as Error).message);
    }
  }
  workerPendingOrders = next;
}

// ── 설정 동기화: 추가/삭제 반영 ───────────────────────────
// 웜업(REST)·정리(주문)로 한 사이클이 폴링 간격보다 길어질 수 있어 재진입을 막는다.
let syncing = false;
async function syncConfigs(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    await doSyncConfigs();
  } finally {
    syncing = false;
  }
}

async function doSyncConfigs(): Promise<void> {
  let active: TradeConfig[] | null;
  try { active = await fetchActiveConfigs(); }
  catch (e) { console.warn('[Worker] 활성설정 조회 실패:', (e as Error).message); return; }

  // 조회 실패(null) = 배포 중 Tomcat 순단 등. "진짜 0개"가 아니므로 reconcile 스킵 —
  // 엔진·포지션 그대로 유지하고 다음 폴링에서 재시도. (전 엔진 재웜업·포지션 강제청산 방지)
  if (active === null) { console.warn('[Worker] 활성설정 조회 실패 — reconcile 스킵(엔진·포지션 유지)'); return; }

  // 글로벌 kill switch ON → 활성설정을 빈 것으로 취급 → 아래 정리 로직이 전 포지션 청산·구독해제.
  // (DB is_active는 그대로라 OFF 시 자동 재개되는 비상 일시정지)
  tradingEnabled = await fetchTradingEnabled();  // 자동매매 ON/OFF 갱신 (진입 차단 판정용)
  harmonicAlertTfs = await fetchHarmonicAlertTfs();  // 하모닉 신호 알림 TF 선택 갱신

  const killed = await fetchKillSwitch();
  if (killed !== lastKilled) {
    notifyOps(killed ? '🚨 킬스위치 ON' : '✅ 킬스위치 OFF',
      killed ? '전 설정 정지·전 포지션 청산 진행' : '자동매매 재개 가능 상태');
  }
  lastKilled = killed;
  if (killed) {
    if (store.ids().length > 0) console.warn('[Worker] 🚨 KILL SWITCH ON — 전 설정 정지·전 포지션 청산');
    active = [];
  }

  const activeIds = new Set(active.map(c => c.id));

  // 1) 사라진 설정 → 포지션 정리 후 구독 해제 (손실한도 STOPPED_LOSS·삭제·킬스위치 포함)
  for (const id of store.ids()) {
    if (activeIds.has(id)) continue;
    const st = store.get(id)!;
    if (st.activeEntry) {
      console.log(`[Worker] 🧹 비활성 설정 포지션 정리 | cfg=${id} ${st.activeEntry.symbol}`);
      st.closing = true;
      try {
        const exitPx = lastPrice.get(st.activeEntry.symbol) ?? st.activeEntry.entryPrice;
        if (isPaper(st)) {
          if (st.paperPositionId != null) await paperClose(st.cfg.memberId, st.paperPositionId, exitPx);
        } else {
          await executeSL2Exit(st.activeEntry.symbol, st.creds);
        }
        await settle(st, exitPx, 'stopped');
      } catch (e) { console.error(`[Worker] 정리 실패 cfg=${id}:`, (e as Error).message); }
      finally { st.closing = false; }
    }
    registry.unsubscribe(id, st.signature);
    store.delete(id);
    console.log(`[Worker] ➖ 설정 제거 | cfg=${id}`);
  }

  // 2) 새 설정 → creds 로드 + 엔진 구독 (페이퍼 설정은 creds 불필요 — 가상계좌 체결)
  const credsCache = new Map();
  for (const cfg of active) {
    if (store.has(cfg.id)) continue;

    let creds;
    if (isPaperCfg(cfg)) {
      creds = PAPER_DUMMY_CREDS;
    } else {
      creds = credsCache.get(cfg.botTarget);
      if (!creds) {
        creds = await loadBotCredentialsByTarget(cfg.memberId, cfg.botTarget, cfg.exchange);
        if (creds) credsCache.set(cfg.botTarget, creds);
      }
      if (!creds) {
        console.warn(`[Worker] ⚠️ creds 없음 — 설정 건너뜀 | cfg=${cfg.id} ${cfg.memberId} bot=${cfg.botTarget} ${cfg.symbol}`);
        await reportStatus(cfg.id, 'ERROR');
        continue;
      }
    }
    const signature = await registry.subscribe(cfg);
    const st = store.add(cfg, creds, signature);
    if (isPaper(st)) await reconcilePaper(st);  // 재시작 시 paper_positions와 동기화
    else await reconcile(st);                    // 재시작 시 거래소 실포지션과 동기화(중복진입 방지)
    await new Promise(resolve => setTimeout(resolve, 150)); // API Rate Limit 과부하 방지 (150ms 딜레이)
    await reportStatus(cfg.id, cfg.params?.tradeEnabled ? 'RUNNING' : 'SCANNING');
    console.log(`[Worker] ➕ 설정 추가 | cfg=${cfg.id} ${cfg.memberId} ${cfg.symbol} ${cfg.strategy} (sig=${signature}) tradeEnabled=${!!cfg.params?.tradeEnabled}`);
  }

  // 3) 공유 시세 심볼 집합 갱신
  const activeSymbols = registry.activeSymbols();
  await monitoring.setSymbols(activeSymbols);
  marketFeed.setSymbols([...new Set([...activeSymbols, ...monitoring.activeSymbols()])]);
}

// ── 상태 스냅샷 (대시보드용) ──────────────────────────────
let lastKilled = false;
function buildSnapshot() {
  const trackers = monitoring.getStatus().flatMap(e =>
    e.status.trackersList.map(t => ({
      ...t,
      signature: e.signature,
      strategy: e.strategy,
      monitorKind: e.kind,
      configIds: e.subscribers,
      botName: 'Worker',
    }))
  );

  // 페이퍼 설정의 진입대기(0.5 라인 체결 대기) 셋업 — 실증 현황 패널 표시용.
  // 심볼당 엔진 1개 공유이므로 signature 기준 중복 제거.
  const paperWaiting: any[] = [];
  const seenSig = new Set<string>();
  for (const st of store.all()) {
    if (!isPaper(st) || seenSig.has(st.signature)) continue;
    seenSig.add(st.signature);
    const eng = registry.getEngine(st.signature);
    if (eng instanceof HarmonicEngine) paperWaiting.push(...eng.getArmedSetups());
  }

  return {
    paperWaiting,
    ts: Date.now(),
    killed: lastKilled,
    tradingEnabled,
    mainBalance,
    mainPositions,
    mainPendingOrders,
    subBalance,
    subPositions,
    engineCount: registry.getStatus().length,
    monitorEngineCount: monitoring.getStatus().length,
    symbols: marketFeed.getSymbols(),
    pendingOrders: workerPendingOrders,
    trackers,
    configs: store.all().map(st => ({
      id:         st.cfg.id,
      memberId:   st.cfg.memberId,
      symbol:     st.cfg.symbol,
      strategy:   st.cfg.strategy,
      investUsdt: st.cfg.investUsdt,
      leverage:   st.cfg.leverage,
      hasPosition: st.activeEntry !== null,
      direction:  st.activeEntry?.direction ?? null,
      entryPrice: st.activeEntry?.entryPrice ?? null,
      tpPrice:    st.activeEntry?.tpPrice ?? null,
      sl1Price:   st.activeEntry?.sl1Price ?? null,
      sl2Price:   st.activeEntry?.sl2Price ?? null,
      size:       st.entrySize || null,
      botName:    'Worker',
    })),
  };
}

// ── 메인 ─────────────────────────────────────────────────
async function main() {
  console.log('=== AutoTrade 통합 워커 (멀티유저) ===');
  console.log(`폴링: 설정 ${POLL_MS}ms | 포지션 ${POS_POLL_MS}ms`);
  if (!process.env.INTERNAL_API_URL || !process.env.INTERNAL_API_TOKEN) {
    console.error('[Worker] ❌ INTERNAL_API_URL / INTERNAL_API_TOKEN 미설정 — Spring 연동 불가');
    
  }

  mainCreds = await loadMainCredentials();
  if (mainCreds) {
    await refreshMainAccountStatus();
  } else {
    console.warn('[Worker] ⚠️ MAIN 자격증명 없음 — 메인 잔고는 스냅샷에 표시되지 않음');
  }
  setInterval(() => { void refreshMainAccountStatus(); }, 10_000);

  await refreshSubAccounts();
  setInterval(() => { void refreshSubAccounts(); }, 10_000);

  // 대시보드용 상태 push (10초) — warmup(syncConfigs) 앞에 배치.
  // warmup 중에도 스냅샷을 보고(빈→부분→full)하고, syncConfigs가 오래 걸리거나(전 엔진 warmup)
  // 특정 심볼에서 멈춰도 모니터링은 죽지 않는다. (이전: syncConfigs 뒤라 warmup 내내·멈추면 영영 0)
  void reportWorkerStatus(buildSnapshot());
  setInterval(() => { void reportWorkerStatus(buildSnapshot()); }, 10_000);

  await syncConfigs();
  setInterval(() => { void syncConfigs(); }, POLL_MS);
  setInterval(() => { void pollPositionCloses(); }, POS_POLL_MS);
  void refreshPendingOrders();
  setInterval(() => { void refreshPendingOrders(); }, 10_000);

  // 상태 출력 (5분)
  setInterval(() => {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
    console.log(`\n[${ts}] 설정=${store.ids().length} | 엔진=${registry.getStatus().length} | 심볼=[${marketFeed.getSymbols().join(',')}] | 보유=${store.withPosition().length}`);
  }, 5 * 60 * 1000);

  console.log('\n✅ 통합 워커 실행 중. Ctrl+C로 종료.\n');
  notifyOps('🟢 워커 시작', `설정폴링 ${POLL_MS}ms · 일일손실한도 ${DAILY_LOSS_LIMIT_USDT > 0 ? `${DAILY_LOSS_LIMIT_USDT} USDT` : '비활성'} (재시작이면 직전 비정상 종료 여부 확인)`);
}

// ── 비정상 종료 알림 — 프로세스 재기동은 pm2/systemd 책임 ──
process.on('uncaughtException', (err) => {
  console.error('[Worker] 💥 uncaughtException:', err);
  notifyOps('💥 워커 비정상 종료', `uncaughtException: ${err?.message ?? err}`);
  setTimeout(() => process.exit(1), 2000); // 알림 발송 시간 확보 후 종료
});
process.on('unhandledRejection', (reason: any) => {
  console.error('[Worker] 💥 unhandledRejection:', reason);
  notifyOps('💥 워커 unhandledRejection', `${reason?.message ?? reason}`);
  // rejection은 즉시 종료하지 않음 — 일시적 네트워크 실패가 다수라 로그·알림만
});

main().catch(err => { console.error('Fatal:', err);  });
