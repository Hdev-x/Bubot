import { getBotStreamPath } from '../config/bots';
import { authHeader, getToken } from '@web/api/authApi';

// 봇 실시간 스트림(WebSocket)은 Spring 프록시(/api/bot-ws)를 경유한다.
// trader 비밀 토큰은 브라우저에 싣지 않고, 로그인 JWT만 프록시 검증용으로 보낸다.

function getBotStreamUrl(path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = encodeURIComponent(getToken() ?? '');
  return `${protocol}//${window.location.host}${path}?token=${token}`;
}

export function getBotStatusStreamUrl(botKey: string) {
  return getBotStreamUrl(getBotStreamPath(botKey));
}

export function getMainBotStreamUrl() {
  return getBotStreamUrl('/api/bot-ws/main/api/stream');
}

// 봇 상태(HTTP) 호출 — Spring 프록시(/api/bot, ADMIN 전용)로 가며 로그인 JWT를 첨부한다.
export function botFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...authHeader(),
      ...(init.headers ?? {}),
    },
  });
}
