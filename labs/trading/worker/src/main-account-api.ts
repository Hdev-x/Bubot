import 'dotenv/config';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { loadMainCredentials } from './lib/credentials.ts';

const PORT       = parseInt(process.env.PORT || '3008', 10);
// 자격증명은 서버 시작 전 주입(DB 우선, env fallback) — sign()/req()가 호출 시점에 참조
let API_KEY    = '';
let SECRET_KEY = '';
let PASSPHRASE = '';
const API_TOKEN  = process.env.API_TOKEN;
const BASE_URL   = 'https://api.bitget.com';

// Authorization: Bearer <token> 검증. API_TOKEN 미설정 시 fail-closed.
function isAuthorized(req: http.IncomingMessage): boolean {
  if (!API_TOKEN) return false;
  // URL 토큰 검증 추가 (WebSocket용)
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const urlToken = url.searchParams.get('token');
  if (urlToken && urlToken === API_TOKEN) return true;

  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return false;
  return header.slice(7) === API_TOKEN;
}

function sign(ts: string, method: string, path: string, body = '') {
  return crypto.createHmac('sha256', SECRET_KEY)
    .update(ts + method.toUpperCase() + path + body)
    .digest('base64');
}

async function req<T = any>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  const ts      = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const res     = await fetch(BASE_URL + path, {
    method,
    headers: {
      'ACCESS-KEY':        API_KEY,
      'ACCESS-SIGN':       sign(ts, method, path, bodyStr),
      'ACCESS-TIMESTAMP':  ts,
      'ACCESS-PASSPHRASE': PASSPHRASE,
      'Content-Type':      'application/json',
    },
    body: bodyStr || undefined,
  });
  const data = await res.json() as any;
  if (data.code !== '00000') throw new Error(`[${data.code}] ${data.msg}`);
  return data.data as T;
}

function jsonRes(res: http.ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

// 2초 캐시 (프론트엔드 폴링 및 WS 브로드캐스트 주기와 맞춤)
let cache: { data: any; ts: number } | null = null;
const CACHE_TTL = 2_000;

async function fetchStatus() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

  const [accounts, allPositions, pendingOrders] = await Promise.all([
    req('GET', '/api/v2/mix/account/accounts?productType=USDT-FUTURES'),
    req('GET', '/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT'),
    req('GET', '/api/v2/mix/order/orders-pending?productType=USDT-FUTURES'),
  ]);

  const usdt    = (accounts as any[]).find((a: any) => a.marginCoin === 'USDT');
  const balance = parseFloat(usdt?.available ?? '0');

  const positions = ((allPositions as any[]) || [])
    .filter(p => parseFloat(p.total) > 0)
    .map(p => ({
      symbol:       p.symbol,
      direction:    p.holdSide as 'long' | 'short',
      entryPrice:   parseFloat(p.openPriceAvg),
      size:         parseFloat(p.total),
      markPrice:    parseFloat(p.markPrice),
      unrealizedPl: parseFloat(p.unrealizedPL),
      leverage:     parseFloat(p.leverage),
      marginMode:   p.marginMode,
    }));

  const orderList = (pendingOrders as any)?.entrustedList ?? (Array.isArray(pendingOrders) ? pendingOrders : []);
  const orders = orderList.map((o: any) => ({
    orderId:    o.orderId,
    symbol:     o.symbol,
    direction:  o.side === 'buy' ? 'long' : 'short',
    price:      parseFloat(o.price),
    size:       parseFloat(o.size),
    tpPrice:    o.presetStopSurplusPrice ? parseFloat(o.presetStopSurplusPrice) : null,
    sl1Price:   o.presetStopLossPrice    ? parseFloat(o.presetStopLossPrice)    : null,
    createTime: parseInt(o.cTime),
    orderType:  o.orderType,
  }));

  const data = { balance, positions, pendingOrders: orders };
  cache = { data, ts: Date.now() };
  return data;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = req.url?.split('?')[0];

  // health check (인증 불필요)
  if (req.method === 'GET' && url === '/') return jsonRes(res, { ok: true });

  // 이하 엔드포인트는 토큰 필요
  if (!isAuthorized(req)) return jsonRes(res, { error: 'Unauthorized' }, 401);

  if (req.method === 'GET' && url === '/api/status') {
    try {
      return jsonRes(res, await fetchStatus());
    } catch (e: any) {
      return jsonRes(res, { error: e.message }, 500);
    }
  }

  jsonRes(res, { error: 'Not found' }, 404);
});

// WebSocket Server 연동
const wss = new WebSocketServer({ server, path: '/api/stream' });

wss.on('connection', async (ws, req) => {
  if (!isAuthorized(req)) {
    ws.close(1008, 'Unauthorized');
    return;
  }
  try {
    ws.send(JSON.stringify(await fetchStatus()));
  } catch (e) {}
});

// 1.5초마다 연결된 모든 클라이언트에게 상태 브로드캐스트
setInterval(async () => {
  if (wss.clients.size === 0) return;
  try {
    const data = await fetchStatus();
    const stateStr = JSON.stringify(data);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(stateStr);
      }
    }
  } catch (e) {}
}, 1500);

server.on('error', err => console.error('[Main Account API] 에러:', err.message));

async function start() {
  const creds = await loadMainCredentials();
  if (!creds) {
    console.error('[Main Account API] ❌ 메인계정 자격증명을 서버/env 어디에서도 찾지 못했습니다.');
    process.exit(1);
  }
  API_KEY = creds.apiKey;
  SECRET_KEY = creds.secretKey;
  PASSPHRASE = creds.passphrase;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Main Account API] 서버 시작 → http://0.0.0.0:${PORT}`);
    if (!API_TOKEN) {
      console.warn('[Main Account API] ⚠️ API_TOKEN 미설정 — /api/status 가 401 거부됩니다. .env에 API_TOKEN을 설정하세요.');
    }
  });
}

start();
