// 인증(JWT) API — 로그인·회원가입·내 정보·로그아웃. 토큰 저장과 인증 헤더는 ../client 가 담당한다.

import { getToken, setToken, clearToken, authHeader } from '../client';

export interface AuthUser {
  username: string;
  name?: string;
  role: 'USER' | 'ADMIN' | string;
}

type JsonRequestOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
};

type JsonResponse<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};
function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function requestJson<T>(url: string, options: JsonRequestOptions = {}): Promise<JsonResponse<T>> {
  const method = options.method ?? 'GET';
  const headers = options.headers ?? {};
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);

  if (typeof globalThis.fetch === 'function') {
    const res = await globalThis.fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: parseJson<T>(text) };
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    if (body) xhr.setRequestHeader('Content-Type', 'application/json');
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data: parseJson<T>(xhr.responseText),
      });
    };
    xhr.onerror = () => reject(new Error('네트워크 요청에 실패했습니다.'));
    xhr.send(body);
  });
}

/** 로그인: 성공 시 토큰을 저장하고 사용자 정보를 반환 */
export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await requestJson<{ token?: string; username?: string; name?: string; role?: string; message?: string }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: { username, password },
    },
  );

  if (!res.ok) {
    const message = res.data?.message ?? `로그인에 실패했습니다. (${res.status})`;
    throw new Error(message);
  }

  if (!res.data?.token || !res.data.username || !res.data.role) {
    throw new Error('로그인 응답 형식이 올바르지 않습니다.');
  }

  setToken(res.data.token);
  return { username: res.data.username, name: res.data.name, role: res.data.role };
}

/** 자체 회원가입 — POST /api/auth/register. 성공 시 토큰 저장 후 자동 로그인(AuthUser 반환). username = 이메일(로그인 ID). */
export async function signup(username: string, password: string, name: string): Promise<AuthUser> {
  const res = await requestJson<{ token?: string; username?: string; name?: string; role?: string; message?: string }>(
    '/api/auth/register',
    {
      method: 'POST',
      body: { username, password, name },
    },
  );

  if (!res.ok) {
    const message = res.data?.message ?? `회원가입에 실패했습니다. (${res.status})`;
    throw new Error(message);
  }

  if (!res.data?.token || !res.data.username || !res.data.role) {
    throw new Error('회원가입 응답 형식이 올바르지 않습니다.');
  }

  setToken(res.data.token);
  return { username: res.data.username, name: res.data.name, role: res.data.role };
}

/** 저장된 토큰으로 현재 사용자 확인. 유효하지 않으면 null 반환 */
export async function fetchMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await requestJson<{ username?: string; role?: string }>('/api/auth/me', { headers: authHeader() });
    if (!res.ok) {
      // 토큰이 실제로 무효(401/403)일 때만 삭제. 5xx(배포 중 재기동·서버 순단)에 지우면
      // 멀쩡한 세션이 풀려 "가끔 로그인 풀림/실패"로 보이므로 유지하고 다음 재시도에 맡긴다.
      if (res.status === 401 || res.status === 403) clearToken();
      return null;
    }
    if (!res.data?.username || !res.data.role) return null;
    return { username: res.data.username, role: res.data.role };
  } catch {
    return null;
  }
}

/** 로그아웃: 토큰 제거 */
export function logout(): void {
  clearToken();
}
