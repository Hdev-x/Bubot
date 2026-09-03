// 서버 API 공통 클라이언트 — JWT 토큰 저장과 인증 헤더, 인증 GET/변경 요청 래퍼.
// 토큰은 localStorage에 저장하고, 인증이 필요한 요청에 Authorization: Bearer 헤더로 전송한다.

const TOKEN_KEY = 'bubot_token';
let memoryToken: string | null = null;


export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY);
    return memoryToken;
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 메모리 토큰으로 현재 세션 유지 */
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * 인증 헤더 + 쿠키 포함 GET → JSON 파싱. 실패(non-2xx) 시 throw.
 * 트레이드 조회류 API의 fetch+auth+ok 검사 보일러플레이트를 단일화한다.
 * 호출측은 catch에서 빈값 폴백을 처리한다.
 */
export async function authedGetJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: authHeader() });
  if (!res.ok) throw new Error(`GET ${url} 실패 (${res.status})`);
  return res.json() as Promise<T>;
}

/**
 * 인증 헤더 + 쿠키 포함 변경요청(POST/PUT/DELETE) → JSON 파싱(본문 없으면 null). 실패 시 throw.
 */
export async function authedMutate<T = unknown>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T | null> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...authHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} 실패 (${res.status})`);
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}
