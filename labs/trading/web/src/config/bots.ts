export const BOT_MAP: Record<string, { port: number; path: string }> = {
  SOL: { port: 3001, path: 'sol' },
  NEAR: { port: 3002, path: 'near' },
  LTC: { port: 3003, path: 'ltc' },
  WLD: { port: 3004, path: 'wld' },
  INJ: { port: 3005, path: 'inj' },
  BTC: { port: 3006, path: 'btc' },
  '1000SHIB': { port: 3007, path: 'shib' },
};

export const BOT_KEYS = Object.keys(BOT_MAP);

export const SUB_ACCOUNT_NAMES: Record<string, string> = {
  SOL: 'Bot 1',
  NEAR: 'Bot 2',
  LTC: 'Bot 3',
  WLD: 'Bot 4',
  INJ: 'Bot 5',
  BTC: 'Bot 6',
  '1000SHIB': 'Bot 7',
};

// 봇 상태 조회(HTTP) — Spring 프록시(/api/bot, ADMIN 전용) 경유
export function getBotStatusUrl(botKey: string) {
  const bot = BOT_MAP[botKey] || BOT_MAP.SOL;
  return `/api/bot/${bot.path}/api/status`;
}

// 봇 실시간 스트림(WebSocket) — Spring 프록시(/api/bot-ws, ADMIN 전용) 경유
export function getBotStreamPath(botKey: string) {
  const bot = BOT_MAP[botKey] || BOT_MAP.SOL;
  return `/api/bot-ws/${bot.path}/api/stream`;
}
