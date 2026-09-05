// 업비트/빗썸 공개 WebSocket — 브라우저에서 직접 연결(REST와 동일하게). 백엔드 릴레이 불필요.
// 업비트/빗썸(신) 둘 다 동일 포맷: 요청 [{ticket},{type,codes:["KRW-BTC"]},{format}], 응답 ticker/orderbook.
import type { OrderbookSnapshot } from '../bitget/bitgetMergeDepth';
import type { CandleMessage, RealtimeTicker, Subscription } from '../../server/coinRealtime';

type KrwExchange = 'UPBIT' | 'BITHUMB';

const WS_URL: Record<KrwExchange, string> = {
  UPBIT: 'wss://api.upbit.com/websocket/v1',
  BITHUMB: 'wss://ws-api.bithumb.com/websocket/v1', // 업비트 호환 신규 엔드포인트
};

// "BTCKRW" → "KRW-BTC"
function toMarketCode(symbol: string): string {
  return `KRW-${symbol.replace(/KRW$/, '')}`;
}
// "KRW-BTC" → "BTCKRW"
function fromMarketCode(code: string): string {
  return `${code.replace(/^KRW-/, '')}KRW`;
}

function connectKrw(
  exchange: KrwExchange,
  type: 'ticker' | 'orderbook',
  codes: string[],
  onData: (data: Record<string, unknown>) => void,
): Subscription {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;

  function connect() {
    socket = new WebSocket(WS_URL[exchange]);
    socket.binaryType = 'arraybuffer'; // 업비트는 바이너리 프레임으로 응답

    socket.onopen = () => {
      const ticket = `bubit-${type}-${Math.random().toString(36).slice(2)}`;
      socket?.send(JSON.stringify([{ ticket }, { type, codes }, { format: 'DEFAULT' }]));
    };

    socket.onmessage = (event) => {
      const text = typeof event.data === 'string'
        ? event.data
        : new TextDecoder().decode(event.data as ArrayBuffer);
      if (!text || text === 'PONG') return;
      try {
        const data = JSON.parse(text);
        if (data && typeof data === 'object' && !data.status) onData(data);
      } catch { /* ignore */ }
    };

    socket.onclose = () => {
      if (!closedByClient) reconnectTimer = window.setTimeout(() => { if (!closedByClient) connect(); }, 2000);
    };
  }
  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    },
  };
}

// 현재가(ticker) → 가격틱을 CandleMessage로 변환(Bitget/Binance 캔들 구독과 동일 인터페이스). 단일 종목(차트용).
export function subscribeKrwCandle(exchange: KrwExchange, symbol: string, onCandle: (c: CandleMessage) => void): Subscription {
  return connectKrw(exchange, 'ticker', [toMarketCode(symbol)], (d) => {
    const price = Number(d.trade_price);
    if (!price) return;
    const ts = Number(d.timestamp ?? d.trade_timestamp ?? Date.now());
    onCandle({ time: Math.floor(ts / 1000), open: price, high: price, low: price, close: price, volume: Number(d.acc_trade_volume_24h ?? 0) });
  });
}

// 마켓 리스트용 — 여러 종목을 한 WS로 구독(보이는 행만). symbol은 "BTCKRW" 포맷으로 반환(liveMap 키 일치).
export function subscribeKrwTickers(exchange: KrwExchange, symbols: string[], onTicker: (t: RealtimeTicker) => void): Subscription {
  if (!symbols.length) return { close: () => {} };
  return connectKrw(exchange, 'ticker', symbols.map(toMarketCode), (d) => {
    const price = Number(d.trade_price);
    if (!price || typeof d.code !== 'string') return;
    onTicker({ symbol: fromMarketCode(d.code), price, changeRate: Number(d.signed_change_rate) || 0 });
  });
}

// 실시간 호가(orderbook) → OrderbookSnapshot. 단일 종목(호가창용).
export function subscribeKrwOrderbook(exchange: KrwExchange, symbol: string, onBook: (b: OrderbookSnapshot) => void): Subscription {
  return connectKrw(exchange, 'orderbook', [toMarketCode(symbol)], (d) => {
    const units = d.orderbook_units as Array<Record<string, number>> | undefined;
    if (!units?.length) return;
    onBook({
      asks: units.map((u) => ({ price: Number(u.ask_price), size: Number(u.ask_size) })), // 오름차순
      bids: units.map((u) => ({ price: Number(u.bid_price), size: Number(u.bid_size) })), // 내림차순
      ts: Number(d.timestamp) || Date.now(),
      scale: '',
    });
  });
}
