// Binance REST API로 과거 캔들을 받아 SignalEngine에 주입
// 봇 시작 시 최근 OB를 놓치지 않도록 웜업용으로 사용

import type { Candle } from './candle-feed.ts';
import type { SignalEngine } from './signal-engine.ts';
import type { HarmonicEngine } from './harmonic-engine.ts';
import type { AbcdEngine } from './abcd-engine.ts';

const BINANCE_BASE = 'https://fapi.binance.com';

const BINANCE_FUTURES_SYMBOL_ALIASES: Record<string, string> = {
  PEPEUSDT: '1000PEPEUSDT',
};

export function toBinanceFuturesSymbol(symbol: string): string {
  return BINANCE_FUTURES_SYMBOL_ALIASES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

// ── Binance Futures REST 캔들 조회 ──────────────────────────
export async function fetchCandles(
  symbol: string,
  interval: string,
  limit = 200,          // 최대 1500 (Binance 제한)
): Promise<Candle[]> {
  const apiSymbol = toBinanceFuturesSymbol(symbol);
  const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${apiSymbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  const rows = await res.json() as unknown;
  if (!res.ok) {
    throw new Error(`${symbol}(${apiSymbol}) ${interval} HTTP ${res.status}`);
  }
  if (!Array.isArray(rows)) {
    throw new Error(`${symbol}(${apiSymbol}) ${interval} 응답 형식 오류`);
  }

  return rows.map(r => ({
    symbol,
    interval,
    time:     Math.floor(r[0] / 1000),   // open time → unix sec
    open:     parseFloat(r[1]),
    high:     parseFloat(r[2]),
    low:      parseFloat(r[3]),
    close:    parseFloat(r[4]),
    volume:   parseFloat(r[5]),
    isClosed: true,   // REST 캔들은 모두 확정
  }));
}

// ── 엔진 웜업 ────────────────────────────────────────────────
// 과거 캔들을 순서대로 engine.feed()에 주입
// - 4h: 200개 ≈ 33일치 (OB 감지 히스토리)
// - 1h: 200개 ≈ 8일치 (signal/entry 상태 복원)
//
// 주의: REST 캔들은 마지막 캔들(현재 진행 중인 캔들)이 isClosed=false여야 하지만
//       Binance는 limit으로 가져오면 마지막 캔들이 미완성일 수 있음.
//       여기서는 마지막 캔들 제외 처리.
export async function warmUpEngine(
  engine: SignalEngine | HarmonicEngine | AbcdEngine,
  symbols: string[],
  {
    limit4h = 1000,  // 하모닉 장기 피벗(len 55/34) 히스토리 확보 (≈166일)
    limit1h = 200,
  } = {},
) {
  if ('setWarmupMode' in engine) engine.setWarmupMode(true);

  // 레짐 게이트(HarmonicEngine) 사용 시 마감 1D 히스토리도 주입 (SMA50 + 여유)
  const wantDaily = 'needsDailyCandles' in engine && (engine as HarmonicEngine).needsDailyCandles();

  for (const symbol of symbols) {
    const candles4h = (await fetchCandles(symbol, '4h', limit4h)).slice(0, -1);
    const candles1h = (await fetchCandles(symbol, '1h', limit1h)).slice(0, -1);
    const candles1d = wantDaily ? (await fetchCandles(symbol, '1d', 300)).slice(0, -1) : [];
    const merged = [...candles4h, ...candles1h, ...candles1d].sort((a, b) => a.time - b.time);
    for (const c of merged) engine.feed(c);
  }

  if ('setWarmupMode' in engine) engine.setWarmupMode(false);
}
