// 봇 자격증명 로더
// 우선순위: Spring 내부 API(DB 저장 키) → 실패 시 env fallback
import type { BitgetCredentials } from './bitget.ts';

const INTERNAL_API_URL   = process.env.INTERNAL_API_URL;   // 예: http://localhost:8080
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN; // Spring app.bot.api-token 과 동일

// TARGET_SYMBOL → DB bot_target 슬롯명
const SYMBOL_TO_TARGET: Record<string, string> = {
  'SOLUSDT': 'SOL', 'NEARUSDT': 'NEAR', 'LTCUSDT': 'LTC', 'WLDUSDT': 'WLD',
  'INJUSDT': 'INJ', 'BTCUSDT': 'BTC', '1000SHIBUSDT': '1000SHIB',
};

async function fetchFromServer(botTarget: string): Promise<BitgetCredentials | null> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return null;
  try {
    const res = await fetch(`${INTERNAL_API_URL}/api/internal/bot-credentials/${botTarget}?exchange=BITGET`, {
      headers: { 'X-Internal-Token': INTERNAL_API_TOKEN },
    });
    if (!res.ok) {
      console.warn(`[creds] 서버 키 조회 실패(${res.status}) — env로 fallback`);
      return null;
    }
    const d = await res.json() as { apiKey: string; secretKey: string; passphrase: string };
    if (!d.apiKey || !d.secretKey || !d.passphrase) return null;
    console.log(`[creds] ✅ 서버에서 ${botTarget} 키 로드`);
    return { apiKey: d.apiKey, secretKey: d.secretKey, passphrase: d.passphrase };
  } catch (e) {
    console.warn(`[creds] 서버 키 조회 예외 — env로 fallback:`, (e as Error).message);
    return null;
  }
}

function fromEnv(prefix: string): BitgetCredentials | null {
  const apiKey = process.env[`BITGET_${prefix}_API_KEY`] || process.env.BITGET_API_KEY;
  const secretKey = process.env[`BITGET_${prefix}_SECRET_KEY`] || process.env.BITGET_SECRET_KEY;
  const passphrase = process.env[`BITGET_${prefix}_PASSPHRASE`] || process.env.BITGET_PASSPHRASE;
  if (!apiKey || !secretKey || !passphrase) return null;
  return { apiKey, secretKey, passphrase };
}

/** 서브계정(봇) 자격증명 — 서버 우선, env fallback */
export async function loadBotCredentials(targetSymbol: string, envPrefix: string): Promise<BitgetCredentials | null> {
  const botTarget = SYMBOL_TO_TARGET[targetSymbol];
  if (botTarget) {
    const fromServer = await fetchFromServer(botTarget);
    if (fromServer) return fromServer;
  }
  return fromEnv(envPrefix);
}

/**
 * 멀티유저 통합 워커용 — 특정 회원의 심볼 슬롯 자격증명을 서버에서 조회.
 * env fallback 없음(남의 키를 env로 대체하면 안 됨). 실패 시 null.
 */
export async function loadBotCredentialsByMember(
  memberId: string,
  targetSymbol: string,
  exchange = 'BITGET',
): Promise<BitgetCredentials | null> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return null;
  const botTarget = SYMBOL_TO_TARGET[targetSymbol];
  if (!botTarget) {
    console.warn(`[creds] by-member: 알 수 없는 심볼 슬롯 ${targetSymbol}`);
    return null;
  }
  try {
    const url = `${INTERNAL_API_URL}/api/internal/bot-credentials/by-member`
      + `?memberId=${encodeURIComponent(memberId)}&exchange=${exchange}&botTarget=${botTarget}`;
    const res = await fetch(url, { headers: { 'X-Internal-Token': INTERNAL_API_TOKEN } });
    if (!res.ok) {
      console.warn(`[creds] by-member 조회 실패(${res.status}) | member=${memberId} ${targetSymbol}`);
      return null;
    }
    const d = await res.json() as { apiKey: string; secretKey: string; passphrase: string };
    if (!d.apiKey || !d.secretKey || !d.passphrase) return null;
    return { apiKey: d.apiKey, secretKey: d.secretKey, passphrase: d.passphrase };
  } catch (e) {
    console.warn(`[creds] by-member 예외 | member=${memberId}:`, (e as Error).message);
    return null;
  }
}

/**
 * 봇(키 슬롯) 기준 자격증명 — 키1개=전략1개(여러 종목)용.
 * 종목이 아니라 설정의 botTarget(SOL=Bot1 ...)으로 직접 키를 로드한다. env fallback 없음.
 */
export async function loadBotCredentialsByTarget(
  memberId: string,
  botTarget: string,
  exchange = 'BITGET',
): Promise<BitgetCredentials | null> {
  if (!INTERNAL_API_URL || !INTERNAL_API_TOKEN) return null;
  if (!botTarget) {
    console.warn(`[creds] by-target: botTarget 없음 | member=${memberId}`);
    return null;
  }
  try {
    const url = `${INTERNAL_API_URL}/api/internal/bot-credentials/by-member`
      + `?memberId=${encodeURIComponent(memberId)}&exchange=${exchange}&botTarget=${botTarget}`;
    const res = await fetch(url, { headers: { 'X-Internal-Token': INTERNAL_API_TOKEN } });
    if (!res.ok) {
      console.warn(`[creds] by-target 조회 실패(${res.status}) | member=${memberId} bot=${botTarget}`);
      return null;
    }
    const d = await res.json() as { apiKey: string; secretKey: string; passphrase: string };
    if (!d.apiKey || !d.secretKey || !d.passphrase) return null;
    return { apiKey: d.apiKey, secretKey: d.secretKey, passphrase: d.passphrase };
  } catch (e) {
    console.warn(`[creds] by-target 예외 | member=${memberId}:`, (e as Error).message);
    return null;
  }
}

/** 오퍼레이터 봇(키 슬롯) 자격증명 — 총자산 합산용. 서버(operator 고정) 슬롯 키. */
export async function loadOperatorBotCredentials(botTarget: string): Promise<BitgetCredentials | null> {
  return fetchFromServer(botTarget);
}

/** 메인 계정 자격증명 — 서버(MAIN 슬롯) 우선, env fallback */
export async function loadMainCredentials(): Promise<BitgetCredentials | null> {
  const fromServer = await fetchFromServer('MAIN');
  if (fromServer) return fromServer;
  return fromEnv('MAIN');
}
