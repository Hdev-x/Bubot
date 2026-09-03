// API 키 관리 API — /api/user/api-keys
// 로그인 JWT를 사용하며, bot proxy를 경유하지 않음.

import { authHeader } from '../client';

export interface ApiKeyItem {
  id: number;
  exchange: string;
  botTarget: string;
  maskedApiKey: string;
  label: string | null;
  active: boolean;
  createdAt: string;
}

export interface ApiKeyListResponse {
  keys: ApiKeyItem[];
}

export async function fetchApiKeys(): Promise<ApiKeyItem[]> {
  const res = await fetch('/api/user/api-keys', {
    headers: authHeader(),
  });
  if (!res.ok) throw new Error('API 키 목록 조회 실패');
  const data = await res.json() as ApiKeyListResponse;
  return data.keys ?? [];
}

export async function saveApiKey(params: {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  label?: string;
  exchange?: string;
  botTarget?: string;
}): Promise<void> {
  const res = await fetch('/api/user/api-keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? 'API 키 저장 실패');
  }
}

export async function activateApiKey(id: number): Promise<void> {
  const res = await fetch(`/api/user/api-keys/${id}/activate`, {
    method: 'PUT',
    headers: authHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? 'API 키 활성화 실패');
  }
}

export async function deleteApiKey(id: number): Promise<void> {
  const res = await fetch(`/api/user/api-keys/${id}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error ?? 'API 키 삭제 실패');
  }
}