export type CandleMessage = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Subscription = {
  close: () => void;
};

export type RealtimeTicker = {
  symbol: string;
  price: number;
  change?: number;
  changeRate?: number;
  volume?: number;
  ts?: number; // 거래소 이벤트 시각(ms) — 캔들 버킷팅을 클라 시계 대신 서버 시각으로
};

function getWebSocketUrl() {
  // vite dev 모드면 포트(5173/5174/5175 등) 무관하게 8081로 직접 연결 (프록시 ws 업그레이드 우회)
  const isViteDev = import.meta.env.DEV;
  const token = encodeURIComponent(getToken() ?? '');

  if (isViteDev) {
    return `ws://${window.location.hostname}:8081/ws-coin?token=${token}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws-coin?token=${token}`;
}

function parseStompFrames(raw: string) {
  return raw
    .split('\0')
    .map((frame) => frame.trim())
    .filter(Boolean);
}

function getFrameCommand(frame: string) {
  return frame.split('\n', 1)[0];
}

function getFrameBody(frame: string) {
  const separatorIndex = frame.indexOf('\n\n');
  if (separatorIndex < 0) {
    return '';
  }

  return frame.slice(separatorIndex + 2);
}

// 백엔드가 외부 거래소 스트림을 받아 발행하는 심볼별 STOMP 토픽을 구독한다.
function subscribeStompTopics(
  symbols: string[],
  topicPrefix: string,
  subIdPrefix: string,
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;

  function send(frame: string) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(`${frame}\0`);
    }
  }

  function connect() {
    socket = new WebSocket(getWebSocketUrl(), ['v12.stomp']);

    socket.onopen = () => {
      send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n');
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;

      for (const frame of parseStompFrames(event.data)) {
        const command = getFrameCommand(frame);

        if (command === 'CONNECTED') {
          symbols.forEach(symbol => {
            send(`SUBSCRIBE\nid:${subIdPrefix}-${symbol}\ndestination:${topicPrefix}/${symbol}\n\n`);
          });
          heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send('\n');
          }, 10000);
          continue;
        }

        if (command !== 'MESSAGE') continue;

        try {
          const data = JSON.parse(getFrameBody(frame));
          if (data.symbol && data.price) {
            onTicker({
              symbol: String(data.symbol),
              price: Number(data.price),
              change: data.change == null ? undefined : Number(data.change),
              changeRate: data.changeRate == null ? undefined : Number(data.changeRate),
              volume: data.volume == null ? undefined : Number(data.volume),
              ts: data.ts == null ? undefined : Number(data.ts)
            });
          }
        } catch {
          // ignore
        }
      }
    };

    socket.onclose = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (!closedByClient) {
        reconnectTimer = window.setTimeout(() => {
          if (!closedByClient) connect();
        }, 2000);
      }
    };
  }

  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        symbols.forEach(symbol => send(`UNSUBSCRIBE\nid:${subIdPrefix}-${symbol}\n\n`));
        send('DISCONNECT\n\n');
      }
      socket?.close();
    }
  };
}

export function subscribeBitgetFuturesTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/coin-futures', 'bgf', onTicker);
}

export function subscribeBitgetSpotTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/coin', 'bgs', onTicker);
}

export function subscribeBinanceSpotTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/binance-spot', 'bns', onTicker);
}

export function subscribeBinanceFuturesTickers(
  symbols: string[],
  onTicker: (ticker: RealtimeTicker) => void
): Subscription {
  if (!symbols.length) return { close: () => {} };
  return subscribeStompTopics(symbols, '/topic/binance-futures', 'bnf', onTicker);
}

/**
 * 바이낸스 실시간 캔들 구독.
 * 백엔드가 발행하는 심볼별 티커 토픽(/topic/binance-{futures|spot}/SYMBOL)을 구독해
 * 가격 틱을 받아 캔들 메시지로 변환한다. (Bitget의 subscribeCoinCandle과 동일한 가격틱 방식)
 */
export function subscribeBinanceCandle(
  symbol: string,
  isFutures: boolean,
  onCandle: (candle: CandleMessage) => void
): Subscription {
  const prefix = isFutures ? '/topic/binance-futures' : '/topic/binance-spot';
  const idPrefix = isFutures ? 'bnfc' : 'bnsc';
  return subscribeStompTopics([symbol], prefix, idPrefix, (ticker) => {
    const price = ticker.price;
    onCandle({
      // 기기 시계가 어긋나면 봉 마감 즈음 가짜 캔들 생성/새 봉 지연 → 서버 이벤트 시각(ts) 우선
      time: Math.floor((ticker.ts ?? Date.now()) / 1000),
      open: price,
      high: price,
      low: price,
      close: price,
      volume: ticker.volume ?? 0,
    });
  });
}

// web granularity → Binance kline interval
const BINANCE_KLINE_INTERVAL: Record<string, string> = {
  '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
  '1h': '1h', '4h': '4h', '6Hutc': '6h', '12Hutc': '12h',
  '1Dutc': '1d', '3Dutc': '3d', '1Wutc': '1w', '1Mutc': '1M',
};

/**
 * Binance 차트 캔들(kline) — 백엔드 릴레이 토픽 구독. 브라우저 직결 kline이 지역차단(한국 등)이라 서버 경유.
 * 백엔드(BinanceKlineRelayService)가 구독 시 해당 심볼+TF를 Binance에 SUBSCRIBE해 OHLCV를 중계한다.
 * /topic/binance-kline/{market}/{SYMBOL}/{interval} 에서 현재 캔들 OHLCV(거래량 포함) 실시간 수신.
 */
export function subscribeBinanceKline(
  symbol: string, isFutures: boolean, granularity: string, onCandle: (c: CandleMessage) => void
): Subscription {
  const interval = BINANCE_KLINE_INTERVAL[granularity];
  if (!interval) return { close: () => {} };
  const market = isFutures ? 'futures' : 'spot';
  const destination = `/topic/binance-kline/${market}/${symbol}/${interval}`;
  const subId = `bnk-${market}-${symbol}-${interval}`;
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;

  function send(frame: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(`${frame}\0`);
  }

  function connect() {
    socket = new WebSocket(getWebSocketUrl(), ['v12.stomp']);
    socket.onopen = () => send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n');
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      for (const frame of parseStompFrames(event.data)) {
        const command = getFrameCommand(frame);
        if (command === 'CONNECTED') {
          send(`SUBSCRIBE\nid:${subId}\ndestination:${destination}\n\n`);
          heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send('\n');
          }, 10000);
          continue;
        }
        if (command !== 'MESSAGE') continue;
        try {
          const d = JSON.parse(getFrameBody(frame));
          if (d && d.time != null) {
            onCandle({
              time: Number(d.time), open: Number(d.open), high: Number(d.high),
              low: Number(d.low), close: Number(d.close), volume: Number(d.volume),
            });
          }
        } catch { /* ignore */ }
      }
    };
    socket.onclose = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (!closedByClient) reconnectTimer = window.setTimeout(() => { if (!closedByClient) connect(); }, 2000);
    };
  }

  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        send(`UNSUBSCRIBE\nid:${subId}\n\n`); // 백엔드가 refcount 줄여 Binance 구독 해제(유예 후)
        send('DISCONNECT\n\n');
      }
      socket?.close();
    },
  };
}

/**
 * [실행 흐름]
 * 1. 타임프레임(channel)에 맞는 Bitget WebSocket 채널을 구독한다.
 * 2. 서버에서 실시간 캔들 데이터가 오면 onCandle 콜백을 호출한다.
 */
export function subscribeCoinCandle(
  symbol: string,
  channel: string,
  onCandle: (candle: CandleMessage) => void,
  productType?: string
): Subscription {
  const isFutures = !!productType;
  const topic = isFutures ? `/topic/coin-futures/${symbol}` : `/topic/coin/${symbol}`;
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: number | undefined;
  let heartbeatTimer: number | undefined;

  function send(frame: string) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(`${frame}\0`);
    }
  }

  function connect() {
    socket = new WebSocket(getWebSocketUrl(), ['v12.stomp']);

    socket.onopen = () => {
      send('CONNECT\naccept-version:1.2\nheart-beat:10000,10000\n\n');
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }

      for (const frame of parseStompFrames(event.data)) {
        const command = getFrameCommand(frame);

        if (command === 'CONNECTED') {
          send(`SUBSCRIBE\nid:coin-${symbol}\ndestination:${topic}\n\n`);
          heartbeatTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send('\n');
            }
          }, 10000);
          continue;
        }

        if (command !== 'MESSAGE') {
          continue;
        }

        try {
          const data = JSON.parse(getFrameBody(frame));
          // [수정] 백엔드 CoinRealtimeWebSocketService의 페이로드 포맷 처리
          if (data.price) {
            onCandle({
              time: Math.floor((data.ts || Date.now()) / 1000),
              open: Number(data.price),
              high: Number(data.price),
              low: Number(data.price),
              close: Number(data.price),
              volume: Number(data.volume || 0)
            });
          } else if (Array.isArray(data)) {
            // Bitget 원본 포맷 지원 (폴백)
            onCandle({
              time: Math.floor(Number(data[0]) / 1000),
              open: Number(data[1]),
              high: Number(data[2]),
              low: Number(data[3]),
              close: Number(data[4]),
              volume: Number(data[5])
            });
          }
        } catch {
          // Ignore
        }
      }
    };

    socket.onclose = () => {
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
      }

      if (!closedByClient) {
        reconnectTimer = window.setTimeout(() => {
          if (!closedByClient) {
            connect();
          }
        }, 2000);
      }
    };
  }

  connect();

  return {
    close: () => {
      closedByClient = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
      }
      if (socket?.readyState === WebSocket.OPEN) {
        send(`UNSUBSCRIBE\nid:coin-${symbol}\n\n`); // SUBSCRIBE와 동일 id여야 서버가 구독 해제를 인식
        send('DISCONNECT\n\n');
      }
      socket?.close();
    }
  };
}
import { getToken } from '../client';
