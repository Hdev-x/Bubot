import crypto from 'crypto';

export interface BitgetCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

// 모듈 레벨 기본 credentials — setCredentials()로 주입해야 사용 가능
let CREDS: BitgetCredentials | null = null;

export function setCredentials(creds: BitgetCredentials): void {
  CREDS = creds;
}

function getCreds(): BitgetCredentials {
  if (!CREDS) throw new Error('[bitget] setCredentials() 호출 전입니다. 먼저 API 키를 주입하세요.');
  return CREDS;
}

const BASE_URL = 'https://api.bitget.com';

function sign(ts: string, method: string, path: string, body: string, secretKey: string) {
  const msg = ts + method.toUpperCase() + path + body;
  return crypto.createHmac('sha256', secretKey).update(msg).digest('base64');
}

export async function request<T = any>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
  creds?: BitgetCredentials,
): Promise<T> {
  const c = creds ?? getCreds();
  const ts       = Date.now().toString();
  const bodyStr  = body ? JSON.stringify(body) : '';
  const fullPath = path;

  const res = await fetch(BASE_URL + fullPath, {
    method,
    headers: {
      'ACCESS-KEY':        c.apiKey,
      'ACCESS-SIGN':       sign(ts, method, fullPath, bodyStr, c.secretKey),
      'ACCESS-TIMESTAMP':  ts,
      'ACCESS-PASSPHRASE': c.passphrase,
      'Content-Type':      'application/json',
    },
    body: bodyStr || undefined,
  });

  const data = await res.json() as any;

  if (data.code !== '00000') {
    throw new Error(`Bitget API 오류 [${data.code}]: ${data.msg}`);
  }

  return data.data as T;
}

export async function getFuturesBalance(creds?: BitgetCredentials): Promise<number> {
  const accounts = await request<any[]>(
    'GET',
    '/api/v2/mix/account/accounts?productType=USDT-FUTURES',
    undefined,
    creds,
  );
  const usdt = accounts.find(a => a.marginCoin === 'USDT');
  return parseFloat(usdt?.available ?? '0');
}

export async function setLeverage(symbol: string, leverage: number, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/account/set-leverage', {
    symbol,
    productType: 'USDT-FUTURES',
    marginCoin:  'USDT',
    leverage:    String(leverage),
  }, creds);
}

export async function setMarginMode(symbol: string, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/account/set-margin-mode', {
    symbol,
    productType: 'USDT-FUTURES',
    marginCoin:  'USDT',
    marginMode:  'isolated',
  }, creds);
}

export type OrderSide = 'buy' | 'sell';
export type TradeSide = 'open' | 'close';

export async function placeOrder(params: {
  symbol:    string;
  side:      OrderSide;
  tradeSide: TradeSide;
  size:      string;
  orderType: 'market' | 'limit';
  price?:    string;
}, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/place-order', {
    symbol:      params.symbol,
    productType: 'USDT-FUTURES',
    marginMode:  'isolated',
    marginCoin:  'USDT',
    size:        params.size,
    side:        params.side,
    tradeSide:   params.tradeSide,
    orderType:   params.orderType,
    price:       params.price,
  }, creds);
}

export async function cancelOrder(symbol: string, orderId: string, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/cancel-order', {
    symbol,
    productType: 'USDT-FUTURES',
    orderId,
  }, creds);
}

export async function cancelAllSymbolOrders(symbol: string, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/cancel-all-orders', {
    symbol,
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
  }, creds);
}

export async function getPendingOrders(symbol: string, creds?: BitgetCredentials): Promise<any[]> {
  return request<any[]>(
    'GET',
    `/api/v2/mix/order/orders-pending?symbol=${symbol}&productType=USDT-FUTURES`,
    undefined,
    creds,
  );
}

export async function getPendingPlanOrders(symbol: string, creds?: BitgetCredentials): Promise<any[]> {
  return request<any[]>(
    'GET',
    `/api/v2/mix/order/orders-plan-pending?symbol=${symbol}&productType=USDT-FUTURES`,
    undefined,
    creds,
  );
}

export async function cancelAllPlanOrders(symbol: string, planType: string, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/cancel-all-plan-order', {
    symbol,
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
    planType,
  }, creds);
}

export async function cancelPlanOrder(symbol: string, orderId: string, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/cancel-plan-order', {
    symbol,
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
    orderId,
  }, creds);
}

export async function placeTPSLOrder(params: {
  symbol: string;
  planType: 'pos_loss' | 'pos_profit' | 'normal_plan' | 'profit_plan' | 'loss_plan';
  triggerPrice: string;
  triggerType: 'fill_price' | 'mark_price';
  holdSide: 'long' | 'short';
}, creds?: BitgetCredentials) {
  return request('POST', '/api/v2/mix/order/place-tpsl-order', {
    symbol: params.symbol,
    productType: 'USDT-FUTURES',
    marginCoin: 'USDT',
    planType: params.planType,
    triggerPrice: params.triggerPrice,
    triggerType: params.triggerType,
    holdSide: params.holdSide,
  }, creds);
}

export async function getPositions(symbol: string, creds?: BitgetCredentials) {
  return request<any[]>(
    'GET',
    `/api/v2/mix/position/single-position?symbol=${symbol}&productType=USDT-FUTURES&marginCoin=USDT`,
    undefined,
    creds,
  );
}

// ── 메인 계정 잔고 조회 (별도 credentials) ──────────────
let MAIN_CREDS: BitgetCredentials | null = null;

export function setMainCredentials(creds: BitgetCredentials): void {
  MAIN_CREDS = creds;
}

export async function getMainFuturesBalance(): Promise<number | null> {
  if (!MAIN_CREDS) return null;
  const ts = Date.now().toString();
  const fullPath = '/api/v2/mix/account/accounts?productType=USDT-FUTURES';
  try {
    const res = await fetch(BASE_URL + fullPath, {
      method: 'GET',
      headers: {
        'ACCESS-KEY':        MAIN_CREDS.apiKey,
        'ACCESS-SIGN':       sign(ts, 'GET', fullPath, '', MAIN_CREDS.secretKey),
        'ACCESS-TIMESTAMP':  ts,
        'ACCESS-PASSPHRASE': MAIN_CREDS.passphrase,
        'Content-Type':      'application/json',
      }
    });
    const data = await res.json() as any;
    if (data.code !== '00000') {
      console.error(`[Main Balance API] 오류 [${data.code}]: ${data.msg}`);
      return null;
    }
    const usdt = data.data?.find((a: any) => a.marginCoin === 'USDT');
    return parseFloat(usdt?.available ?? '0');
  } catch (e: any) {
    console.error(`[Main Balance API] 요청 실패: ${e.message}`);
    return null;
  }
}