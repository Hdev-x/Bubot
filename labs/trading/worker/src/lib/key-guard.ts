// 키 안전 검증 게이트
// 매매 시작 전 키가 (1) 유효하고 (2) 선물거래 권한이 있는지 확인한다.
//
// ⚠️ 출금권한(withdraw scope) 자동 감지:
//   Bitget은 공개 API로 키의 권한 스코프를 단순 조회하는 엔드포인트가 명확하지 않다.
//   따라서 현재는 "선물 계정 접근 가능 = 거래 가능 키"만 보장한다.
//   출금권한 차단은 운영 정책상 사용자에게 "출금권한 없는 키만 등록" 안내 + 향후
//   Bitget key-info 엔드포인트 확인으로 강화한다(TODO).
import { request } from './bitget.ts';
import type { BitgetCredentials } from './bitget.ts';

export interface KeyCheckResult {
  ok: boolean;
  reason?: string;
}

/** 선물 계정 접근으로 키 유효성/거래권한 확인 */
export async function verifyTradingKey(creds: BitgetCredentials): Promise<KeyCheckResult> {
  try {
    await request('GET', '/api/v2/mix/account/accounts?productType=USDT-FUTURES', undefined, creds);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
