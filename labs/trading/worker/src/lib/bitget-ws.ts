import crypto from 'crypto';
import { EventEmitter } from 'events';
import type { BitgetCredentials } from './bitget.ts';

const WS_URL = 'wss://ws.bitget.com/v2/ws/private';

export class BitgetPrivateWS extends EventEmitter {
  private ws: WebSocket | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected = false;
  private creds: BitgetCredentials;

  constructor(creds: BitgetCredentials) {
    super();
    this.creds = creds;
  }

  private generateSign(ts: string) {
    const msg = ts + 'GET' + '/user/verify';
    return crypto.createHmac('sha256', this.creds.secretKey).update(msg).digest('base64');
  }

  public connect() {
    console.log('[Bitget WS] 연결 중...');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('[Bitget WS] ✅ 연결됨. 로그인 요청...');
      this.login();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data as string);
    };

    this.ws.onerror = (error) => {
      console.error('[Bitget WS] 에러:', error);
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.clearPing();
      console.warn('[Bitget WS] 연결 끊김. 5초 후 재연결...');
      setTimeout(() => this.connect(), 5000);
    };
  }

  public disconnect() {
    this.clearPing();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private login() {
    const timestamp = Date.now().toString();
    const sign = this.generateSign(timestamp);

    const loginReq = {
      op: 'login',
      args: [{
        apiKey: this.creds.apiKey,
        passphrase: this.creds.passphrase,
        timestamp,
        sign,
      }]
    };
    this.ws?.send(JSON.stringify(loginReq));
  }

  private subscribeChannels() {
    const subReq = {
      op: 'subscribe',
      args: [
        { instType: 'USDT-FUTURES', channel: 'orders', instId: 'default' },
        { instType: 'USDT-FUTURES', channel: 'positions', instId: 'default' },
      ]
    };
    this.ws?.send(JSON.stringify(subReq));
    console.log('[Bitget WS] 📡 orders, positions 채널 구독 완료');
  }

  private startPing() {
    this.clearPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 20_000);
  }

  private clearPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(dataStr: string) {
    if (dataStr === 'pong') return;

    try {
      const msg = JSON.parse(dataStr);

      if (msg.event === 'login') {
        if (msg.code === 0) {
          console.log('[Bitget WS] ✅ 로그인 성공');
          this.isConnected = true;
          this.subscribeChannels();
          this.startPing();
          this.emit('ready');
        } else {
          console.error('[Bitget WS] ❌ 로그인 실패:', msg);
        }
        return;
      }

      if (msg.action === 'snapshot' || msg.action === 'update') {
        const channel = msg.arg?.channel;
        const dataList = msg.data || [];

        if (channel === 'orders') {
          for (const order of dataList) {
            this.emit('orderUpdate', order);
          }
        } else if (channel === 'positions') {
          for (const pos of dataList) {
            this.emit('positionUpdate', pos);
          }
        }
      }
    } catch (e) {
      console.error('[Bitget WS] 메시지 파싱 에러:', e, dataStr);
    }
  }
}