import 'dotenv/config';
import crypto from 'crypto';

const BASE_URL = 'https://api.bitget.com';
const API_KEY    = process.env.BITGET_API_KEY!;
const SECRET_KEY = process.env.BITGET_SECRET_KEY!;
const PASSPHRASE = process.env.BITGET_PASSPHRASE!;

function sign(ts: string, method: string, path: string) {
  return crypto.createHmac('sha256', SECRET_KEY).update(ts + method + path).digest('base64');
}

async function get(path: string) {
  const ts = Date.now().toString();
  const res = await fetch(BASE_URL + path, {
    headers: {
      'ACCESS-KEY':        API_KEY,
      'ACCESS-SIGN':       sign(ts, 'GET', path),
      'ACCESS-TIMESTAMP':  ts,
      'ACCESS-PASSPHRASE': PASSPHRASE,
      'Content-Type':      'application/json',
    },
  });
  return res.json();
}

const endpoints = [
  '/api/v2/account/info',
  '/api/v2/mix/account/accounts?productType=USDT-FUTURES',
  '/api/v2/mix/account/accounts?productType=usdt-futures',
];

for (const ep of endpoints) {
  console.log(`\n--- ${ep} ---`);
  const r = await get(ep);
  console.log(`code: ${r.code} | msg: ${r.msg}`);
  if (r.data) console.log('data:', JSON.stringify(r.data).slice(0, 200));
}
