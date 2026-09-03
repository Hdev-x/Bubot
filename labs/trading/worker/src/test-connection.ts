import 'dotenv/config';
import crypto from 'crypto';

const BASE_URL = 'https://api.bitget.com';
const API_KEY    = process.env.BITGET_API_KEY!;
const SECRET_KEY = process.env.BITGET_SECRET_KEY!;
const PASSPHRASE = process.env.BITGET_PASSPHRASE!;

function sign(timestamp: string, method: string, path: string, body = ''): string {
  const message = timestamp + method.toUpperCase() + path + body;
  return crypto.createHmac('sha256', SECRET_KEY).update(message).digest('base64');
}

async function request(method: string, path: string) {
  const timestamp = Date.now().toString();
  const signature = sign(timestamp, method, path);
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      'ACCESS-KEY':        API_KEY,
      'ACCESS-SIGN':       signature,
      'ACCESS-TIMESTAMP':  timestamp,
      'ACCESS-PASSPHRASE': PASSPHRASE,
      'Content-Type':      'application/json',
    },
  });
  return res.json();
}

async function main() {
  console.log('=== Bitget 연결 테스트 ===\n');

  // 1. 계정 확인
  const account = await request('GET', '/api/v2/spot/account/info');
  console.log(`✅ 계정 연결 성공 (userId: ${account.data?.userId})`);

  // 2. 선물 잔고 조회
  const futures = await request('GET', '/api/v2/mix/account/accounts?productType=USDT-FUTURES');
  if (futures.code === '00000' && futures.data?.length > 0) {
    for (const acc of futures.data) {
      console.log(`💰 선물 잔고: ${acc.available} USDT (마진: ${acc.marginCoin})`);
    }
  } else {
    console.log('선물 잔고:', JSON.stringify(futures, null, 2));
  }
}

main().catch(console.error);
