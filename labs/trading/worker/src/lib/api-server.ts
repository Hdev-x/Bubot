import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { store } from './state-store.ts';
import { SignalEngine } from './signal-engine.ts';
import { setCredentials } from './bitget.ts';
import type { BitgetCredentials } from './bitget.ts';

const API_TOKEN = process.env.API_TOKEN;

function json(res: http.ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',   // 프론트 cross-origin 허용
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

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

export function startApiServer(engine?: SignalEngine, port = 3001) {
  const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    const url = req.url?.split('?')[0];

    // health check (인증 불필요)
    if (req.method === 'GET' && url === '/') {
      return json(res, { ok: true });
    }

    // 이하 엔드포인트는 토큰 필요
    if (!isAuthorized(req)) {
      return json(res, { error: 'Unauthorized' }, 401);
    }

    if (req.method === 'GET' && url === '/api/status') {
      return json(res, store.get());
    }

    if (req.method === 'POST' && url === '/api/settings') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const params = JSON.parse(body);

          // ── credential swap (런타임 키 교체) ──
          if (params.credentials) {
            const c = params.credentials as BitgetCredentials;
            if (!c.apiKey || !c.secretKey || !c.passphrase) {
              return json(res, { error: 'credentials.apiKey, secretKey, passphrase 필수' }, 400);
            }
            try {
              setCredentials(c);
              console.log('[API] credentials 교체 완료');
              return json(res, { success: true });
            } catch (e: any) {
              return json(res, { error: e.message }, 400);
            }
          }

          // ── 기존 전략 설정 ──
          const tpPercent = parseFloat(params.tpPercent);
          const slPercent = parseFloat(params.slPercent);
          const useBbStrategy = params.useBbStrategy === true;

          if (isNaN(tpPercent) || isNaN(slPercent)) {
            return json(res, { error: 'Invalid settings values' }, 400);
          }

          if (engine) {
            engine.updateParams({ tpPercent, slPercent, useBbStrategy });
          }
          store.setSettings({ tpPercent, slPercent, useBbStrategy });

          return json(res, { success: true, settings: store.get().settings });
        } catch (e) {
          return json(res, { error: 'JSON parsing failed' }, 400);
        }
      });
      return;
    }

    json(res, { error: 'Not found' }, 404);
  });

  // WebSocket Server 연동
  const wss = new WebSocketServer({ server, path: '/api/stream' });

  wss.on('connection', (ws, req) => {
    if (!isAuthorized(req)) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // 초기 상태 즉시 전송
    ws.send(JSON.stringify(store.get()));
  });

  // 100ms마다 연결된 모든 클라이언트에게 상태 브로드캐스트
  let lastStateStr = '';
  setInterval(() => {
    if (wss.clients.size === 0) return;
    const stateStr = JSON.stringify(store.get());
    if (lastStateStr === stateStr) return; // 변경사항 없으면 스킵
    lastStateStr = stateStr;

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(stateStr);
      }
    });
  }, 100);

  server.listen(port, '0.0.0.0', () => {
    console.log(`[API] 서버 시작 → http://0.0.0.0:${port}`);
    if (!API_TOKEN) {
      console.warn('[API] ⚠️ API_TOKEN 미설정 — /api/status, /api/settings 모두 401 거부됩니다. .env에 API_TOKEN을 설정하세요.');
    }
  });

  server.on('error', (err) => {
    console.error('[API] 서버 에러:', err.message);
  });
}
