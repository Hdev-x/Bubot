// Binance Futures WebSocket → 캔들 close 이벤트 수신
// 4h OB 감지용 + 1h 진입 조건 체크용 + 모니터링 관찰 TF 공유

import { toBinanceFuturesSymbol } from './warmup.ts';

const BINANCE_WS = 'wss://fstream.binance.com/stream';

export interface Candle {
  symbol:    string;
  interval:  string;
  time:      number;   // open time (unix sec)
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  isClosed:  boolean;  // true = 캔들 확정 (close 이벤트)
}

type CandleHandler = (candle: Candle) => void;

// 워치독: bookTicker가 상시 흐르므로 이 시간 동안 무메시지 = 죽은(침묵) 소켓으로 간주.
const STALE_TIMEOUT_MS = 180_000;
const WATCHDOG_INTERVAL_MS = 60_000;

export class CandleFeed {
  private wss: WebSocket[] = [];
  private handlers: CandleHandler[] = [];
  private symbols: string[];
  private apiSymbols: string[];
  private streamSymbolToAppSymbol: Map<string, string>;
  private intervals: string[];
  private stopped = false;  // 의도적 stop() 후 onclose 자동재연결 방지
  private lastMessageAt = Date.now();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 스테일 감지로 강제 재연결할 때 호출 (알림용) */
  onStale: ((silentMs: number) => void) | null = null;

  constructor(symbols: string[], intervals: string[]) {
    this.symbols = symbols.map(s => s.toUpperCase());
    this.apiSymbols = this.symbols.map(toBinanceFuturesSymbol);
    this.streamSymbolToAppSymbol = new Map(this.apiSymbols.map((apiSymbol, i) => [apiSymbol, this.symbols[i]]));
    this.intervals = intervals;
  }

  onCandle(handler: CandleHandler) {
    this.handlers.push(handler);
  }

  start() {
    const allStreams = this.apiSymbols.map(s => s.toLowerCase()).flatMap(sym => [
      ...this.intervals.filter(iv => iv !== 'ticker').map(iv => `${sym}@kline_${iv}`),
      `${sym}@bookTicker`
    ]);

    console.log(`[CandleFeed] 연결 중... (${this.symbols.length}개 심볼 × ${this.intervals.length}개 타임프레임, 총 ${allStreams.length}개 스트림)`);

    const CHUNK_SIZE = 150; // Binance max is 1024, but keeping it safe at 150
    let connectedCount = 0;
    const totalChunks = Math.ceil(allStreams.length / CHUNK_SIZE);

    for (let i = 0; i < allStreams.length; i += CHUNK_SIZE) {
      const streams = allStreams.slice(i, i + CHUNK_SIZE).join('/');
      const url = `${BINANCE_WS}?streams=${streams}`;

      const ws = new WebSocket(url);
      this.wss.push(ws);

      ws.onopen = () => {
        connectedCount++;
        if (connectedCount === totalChunks) {
          console.log('[CandleFeed] ✅ 모든 웹소켓 연결됨');
        }
      };

      ws.onmessage = (event) => {
        this.lastMessageAt = Date.now();
        try {
          const msg  = JSON.parse(event.data as string);

          if (msg.data?.e === '24hrTicker') {
          const t = msg.data;
          // ⚠️ 24hrTicker의 h/l은 "24시간" 고저라 실시간 청산 판정(꼬리 터치)에 쓰면 안 됨.
          // 이 캔들은 현재가 1점으로만 취급 → high/low를 현재가(c)로 둔다. (24h고저로 SL/TP 헛터짐 방지)
          const lastPx = parseFloat(t.c);
          const candle: Candle = {
            symbol:   this.toAppSymbol(t.s),
            interval: 'ticker',
            time:     Math.floor(t.E / 1000),
            open:     lastPx,
            high:     lastPx,
            low:      lastPx,
            close:    lastPx,
            volume:   parseFloat(t.v),
            isClosed: false
          };
          this.handlers.forEach(h => h(candle));
          return;
        } else if (msg.data?.e === 'bookTicker') {
          const t = msg.data;
          const price = (parseFloat(t.b) + parseFloat(t.a)) / 2;
          const candle: Candle = {
            symbol:   this.toAppSymbol(t.s),
            interval: 'ticker',
            time:     Math.floor(t.E / 1000),
            open:     price,
            high:     price,
            low:      price,
            close:    price,
            volume:   0,
            isClosed: false
          };
          this.handlers.forEach(h => h(candle));
          return;
        }

        const k    = msg.data?.k;
        if (!k) return;

        const candle: Candle = {
          symbol:   this.toAppSymbol(msg.data.s as string),
          interval: k.i,
          time:     Math.floor(k.t / 1000),
          open:     parseFloat(k.o),
          high:     parseFloat(k.h),
          low:      parseFloat(k.l),
          close:    parseFloat(k.c),
          volume:   parseFloat(k.v),
          isClosed: k.x,
        };

        this.handlers.forEach(h => h(candle));
      } catch {}
    };

    ws.onerror = (e) => console.error('[CandleFeed] 에러:', e);

    ws.onclose = (event) => {
      if (this.stopped) return;
      this.scheduleReconnect(`[CandleFeed] 연결 끊김. code:${event?.code} reason:${event?.reason}`);
    };
    }

    this.lastMessageAt = Date.now();
    this.startWatchdog();
  }

  private scheduleReconnect(message: string): void {
    if (this.reconnectTimer) return;
    console.warn(`${message} 5초 후 재연결...`);
    const sockets = this.wss;
    this.wss = [];
    sockets.forEach(ws => { try { ws.close(); } catch {} });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.start();
    }, 5000);
  }

  private toAppSymbol(apiSymbol: string): string {
    const upper = apiSymbol.toUpperCase();
    return this.streamSymbolToAppSymbol.get(upper) ?? upper;
  }

  /** WS가 열려 있어도 일정 시간 무메시지면 강제 재연결 (onclose 경유로 5초 후 start) */
  private startWatchdog() {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.stopped) return;
      const silentMs = Date.now() - this.lastMessageAt;
      if (silentMs >= STALE_TIMEOUT_MS) {
        console.warn(`[CandleFeed] ⚠️ ${Math.round(silentMs / 1000)}초 무메시지 — 스테일 소켓 강제 재연결`);
        this.onStale?.(silentMs);
        this.lastMessageAt = Date.now(); // 재연결 동안 중복 발동 방지
        this.scheduleReconnect('[CandleFeed] 스테일 소켓 정리');
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  stop() {
    this.stopped = true;
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.wss.forEach(ws => { try { ws.close(); } catch {} });
    this.wss = [];
  }
}
