// Bitget 캔들(kline) WebSocket — 브라우저 직결. 티커(가격틱)와 달리 현재 캔들의 OHLCV(거래량 포함)를
// 실시간으로 받는다. 업비트/빗썸은 공개 캔들 WS가 없어 별도(REST 폴링)로 처리.
// (Binance kline은 지역차단 때문에 백엔드 릴레이로 — coinRealtime.subscribeBinanceKline)
import type { CandleMessage, Subscription } from './coinRealtime';

/** Bitget kline WS — data:[[ts,o,h,l,c,baseVol,...]]. ping/pong 25s. channel은 candle1H 등(WEB_TIMEFRAMES.channel). */
export function subscribeBitgetKline(symbol: string, isFutures: boolean, channel: string, onCandle: (c: CandleMessage) => void): Subscription {
  const instType = isFutures ? 'USDT-FUTURES' : 'SPOT';
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let pingTimer: number | undefined;

  function connect() {
    socket = new WebSocket('wss://ws.bitget.com/v2/ws/public');
    socket.onopen = () => {
      socket?.send(JSON.stringify({ op: 'subscribe', args: [{ instType, channel, instId: symbol }] }));
      pingTimer = window.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send('ping'); }, 25000);
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data !== 'string' || ev.data === 'pong') return;
      let d: { data?: unknown };
      try { d = JSON.parse(ev.data); } catch { return; }
      const rows = d.data as string[][] | undefined;
      if (!Array.isArray(rows) || !rows.length) return;
      const r = rows[rows.length - 1]; // 최신(현재) 캔들
      if (!Array.isArray(r)) return;
      onCandle({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
    };
    socket.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (!closedByClient) reconnectTimer = window.setTimeout(() => { if (!closedByClient) connect(); }, 2000);
    };
  }
  connect();
  return { close: () => { closedByClient = true; if (reconnectTimer) clearTimeout(reconnectTimer); if (pingTimer) clearInterval(pingTimer); socket?.close(); } };
}
