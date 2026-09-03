import { botFetch } from './botApi';
import { BOT_KEYS, getBotStatusUrl } from '../config/bots';
import type { BotState, MainAccountStatus } from '../types/bot';

export interface BotStatusResult {
  botKey: string;
  data: BotState | null;
  error: unknown;
}

export async function fetchBotStatus(botKey: string, timeoutMs = 5000): Promise<BotState> {
  const res = await botFetch(getBotStatusUrl(botKey), { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Bot status request failed: ${botKey} ${res.status}`);
  }
  return res.json() as Promise<BotState>;
}

export async function fetchAllBotStatuses(timeoutMs = 5000): Promise<BotStatusResult[]> {
  return Promise.all(
    BOT_KEYS.map(async (botKey) => {
      try {
        return { botKey, data: await fetchBotStatus(botKey, timeoutMs), error: null };
      } catch (error) {
        return { botKey, data: null, error };
      }
    })
  );
}

export async function fetchMainBotStatus(timeoutMs = 5000): Promise<MainAccountStatus> {
  const res = await botFetch('/api/bot/main/api/status', { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Main bot status request failed: ${res.status}`);
  }
  return res.json() as Promise<MainAccountStatus>;
}
