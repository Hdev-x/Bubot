import axios from 'axios';
import { AxiosHeaders } from 'axios';
import type { Candle, CoinTicker } from '../../shared/types/market';
import { getToken } from '../client';

const api = axios.create({
  timeout: 12000,
  headers: {
    Accept: 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value.replace(/,/g, ''));
  }

  return 0;
}

function extractDecimals(value: unknown): number {
  if (typeof value !== 'string') return 2;
  const dot = value.indexOf('.');
  if (dot === -1) return 0;
  const decimals = value.length - dot - 1;
  // 거래소는 trailing zero를 포함해 tick size 자리수만큼 내려주므로 그대로 사용
  return Math.max(0, decimals);
}

function getCoinName(baseSymbol: string) {
  const names: Record<string, string> = {
    BTC: '비트코인',
    ETH: '이더리움',
    XRP: '리플',
    SOL: '솔라나',
    DOGE: '도지코인',
    ADA: '에이다',
    AVAX: '아발란체',
    DOT: '폴카닷',
    LINK: '체인링크',
    TRX: '트론'
  };

  return names[baseSymbol] || `${baseSymbol} / TetherUS`;
}

// 코인 부가 통계(시가총액 등) — 백엔드 CoinGecko 프록시(/coin/api/extra-stats, 10분 캐시)
export async function fetchCoinMarketCap(ticker: string): Promise<number | null> {
  try {
    const response = await api.get<any>('/coin/api/extra-stats', { params: { ticker } });
    const arr = response.data;
    const d = Array.isArray(arr) ? arr[0] : (arr?.data?.[0] ?? arr);
    const mc = d ? Number(d.market_cap) : NaN;
    return Number.isFinite(mc) ? mc : null;
  } catch {
    return null;
  }
}

export async function fetchCoinLogos(): Promise<Record<string, string>> {
  try {
    const response = await api.get<Record<string, string>>('/coin/api/logos');
    return response.data || {};
  } catch (error) {
    console.error('fetchCoinLogos failed:', error);
    return {};
  }
}

export async function fetchCoinTickers(): Promise<CoinTicker[]> {
  try {
    const response = await api.get<any>('/coin/api/tickers');
    const rawData = response.data?.data || response.data;
    const rows = Array.isArray(rawData) ? rawData : [];

    return normalizeCoinTickers(rows, 'SPOT');
  } catch (error) {
    console.error('fetchCoinTickers failed:', error);
    return [];
  }
}

type TickerSource = 'BITGET' | 'BINANCE';

function normalizeCoinTickers(
  rows: any[],
  defaultQuoteSymbol?: 'USDT' | 'USDC' | 'SPOT',
  source: TickerSource = 'BITGET'
): CoinTicker[] {
  return rows
    .map((row: any) => {
      const symbol = String(row.symbol || '');
      const baseCoin = String(row.baseCoin || '');
      const quoteCoin = String(row.quoteCoin || '');
      const rawPrice = row.lastPr ?? row.lastPrice ?? row.last ?? row.close;
      const tickDecimals = extractDecimals(rawPrice);
      const last = toNumber(rawPrice);
      const openUtc = toNumber(row.openUtc);
      const rawChangeRate = toNumber(row.changeUtc24h ?? row.change24h ?? row.priceChangePercent);
      const changeRate = source === 'BINANCE' ? rawChangeRate / 100 : rawChangeRate;
      const priceChange = toNumber(row.priceChange);
      const change = openUtc > 0 ? last - openUtc : priceChange || last * changeRate;
      const volume = toNumber(row.usdtVolume ?? row.quoteVolume ?? row.baseVolume ?? row.turnover24h);
      
      let baseSymbol = '';
      let quoteSymbol = '';
      if (baseCoin && quoteCoin) {
        baseSymbol = baseCoin;
        quoteSymbol = quoteCoin;
      } else if (symbol.endsWith('USDT')) {
        baseSymbol = symbol.slice(0, -4);
        quoteSymbol = 'USDT';
      } else if (symbol.endsWith('USDC')) {
        baseSymbol = symbol.slice(0, -4);
        quoteSymbol = 'USDC';
      } else if (defaultQuoteSymbol === 'USDT' || defaultQuoteSymbol === 'USDC') {
        baseSymbol = symbol.endsWith('PERP') ? symbol.slice(0, -4) : symbol;
        quoteSymbol = defaultQuoteSymbol;
      } else {
        baseSymbol = symbol;
        quoteSymbol = 'ETC';
      }

      return {
        symbol,
        baseSymbol,
        quoteSymbol,
        name: getCoinName(baseSymbol),
        last,
        change,
        changeRate,
        volume,
        tickDecimals
      };
    })
    .filter((ticker) => ticker.last > 0)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
}

export async function fetchCoinFuturesTickers(): Promise<CoinTicker[]> {
  try {
    const responses = await Promise.all([
      api.get<any>('/coin/api/futures/tickers', { params: { productType: 'USDT-FUTURES' } }),
      api.get<any>('/coin/api/futures/tickers', { params: { productType: 'USDC-FUTURES' } })
    ]);

    const usdtRows = Array.isArray(responses[0].data?.data) ? responses[0].data.data : [];
    const usdcRows = Array.isArray(responses[1].data?.data) ? responses[1].data.data : [];

    return [
      ...normalizeCoinTickers(usdtRows, 'USDT'),
      ...normalizeCoinTickers(usdcRows, 'USDC')
    ].sort((a, b) => (b.volume || 0) - (a.volume || 0));
  } catch (error) {
    console.error('fetchCoinFuturesTickers failed:', error);
    return [];
  }
}

export async function fetchBinanceSpotTickers(): Promise<CoinTicker[]> {
  try {
    const response = await api.get<any>('/coin/api/binance/spot/tickers');
    const rows = Array.isArray(response.data) ? response.data : [];
    return normalizeCoinTickers(rows, 'SPOT', 'BINANCE');
  } catch (error) {
    console.error('fetchBinanceSpotTickers failed:', error);
    return [];
  }
}

export async function fetchBinanceFuturesTickers(): Promise<CoinTicker[]> {
  try {
    const response = await api.get<any>('/coin/api/binance/futures/tickers');
    const rows = Array.isArray(response.data) ? response.data : [];
    return normalizeCoinTickers(rows, 'SPOT', 'BINANCE');
  } catch (error) {
    console.error('fetchBinanceFuturesTickers failed:', error);
    return [];
  }
}

export async function fetchPricePrecision(): Promise<Map<string, number>> {
  try {
    const response = await api.get<Record<string, number>>('/coin/api/price-precision');
    return new Map(Object.entries(response.data));
  } catch (error) {
    console.error('fetchPricePrecision failed:', error);
    return new Map();
  }
}

// Binance interval 변환 (내부 granularity → Binance interval)
function toBinanceInterval(granularity: string): string {
  const map: Record<string, string> = {
    '1min': '1m', '3min': '3m', '5min': '5m', '15min': '15m', '30min': '30m',
    '15m': '15m', '30m': '30m',
    '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '6Hutc': '6h', '12h': '12h', '12Hutc': '12h',
    '1Dutc': '1d', '1D': '1d',
    '3Dutc': '3d', '3D': '3d',
    '1Wutc': '1w', '1W': '1w',
    '1Mutc': '1M', '1M': '1M',
  };
  return map[granularity] ?? granularity;
}

// Binance 선물 전체 캔들 페이지네이션 fetch
export async function fetchAllBinanceFuturesCandles(
  symbol: string,
  granularity: string,
  maxCandles = 20000,
  onProgress?: (count: number) => void,
): Promise<Candle[]> {
  const PER_PAGE = 1500;
  const interval = toBinanceInterval(granularity);
  let allCandles: Candle[] = [];
  let endTime: string | undefined;

  while (allCandles.length < maxCandles) {
    const limit = Math.min(PER_PAGE, maxCandles - allCandles.length);
    const params: Record<string, string> = { symbol, interval, limit: String(limit) };
    if (endTime) params.endTime = endTime;

    const response = await api.get<any>('/coin/api/binance/futures/candles', { params });
    const rows: any[] = Array.isArray(response.data) ? response.data : [];
    if (!rows.length) break;

    const candles: Candle[] = rows
      .map((row): Candle => ({
        time: Math.floor(Number(row[0]) / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter(c => c.close > 0);

    allCandles = [...candles, ...allCandles];
    onProgress?.(allCandles.length);

    if (rows.length < limit) break;

    endTime = String(Number(rows[0][0]) - 1);
    await new Promise(r => setTimeout(r, 100));
  }

  const seen = new Set<number>();
  return allCandles
    .filter(c => {
      const t = Number(c.time);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .sort((a, b) => Number(a.time) - Number(b.time));
}

// Binance 단일 페이지 캔들 fetch (fetchCoinCandles와 동일한 시그니처, 차트 페이지용)
export async function fetchBinanceCandles(
  symbol: string,
  granularity = '1Dutc',
  limit = 120,
  endTime?: string,
  isFutures = true,
): Promise<Candle[]> {
  const interval = toBinanceInterval(granularity);
  const path = isFutures ? '/coin/api/binance/futures/candles' : '/coin/api/binance/spot/candles';
  const params: Record<string, string> = { symbol, interval, limit: String(limit) };
  if (endTime) params.endTime = endTime;

  try {
    const response = await api.get<any>(path, { params });
    const rows: any[] = Array.isArray(response.data) ? response.data : [];
    return rows
      .map((row): Candle | null => {
        const item = Array.isArray(row) ? row : [];
        if (item.length < 5) return null;
        return {
          time: Math.floor(toNumber(item[0]) / 1000),
          open: toNumber(item[1]),
          high: toNumber(item[2]),
          low: toNumber(item[3]),
          close: toNumber(item[4]),
          volume: toNumber(item[5]),
        };
      })
      .filter((candle): candle is Candle => candle !== null && Number(candle.time) > 0 && candle.close > 0)
      .sort((a, b) => Number(a.time) - Number(b.time));
  } catch (error) {
    console.error('fetchBinanceCandles failed:', error);
    return [];
  }
}

export async function fetchCoinCandles(symbol: string, granularity = '1min', limit = 120, endTime?: string, productType?: string): Promise<Candle[]> {
  let allCandles: Candle[] = [];
  let currentEndTime = endTime;

  // Bitget API 한 번에 내려오는 개수가 적은 경우를 대비한 자동 페이지네이션 (최대 3회로 제한하여 로딩 지연 방지)
  for (let i = 0; i < 3; i++) {
    const params: Record<string, string> = { symbol, granularity, limit: String(limit) };
    if (currentEndTime) params.endTime = currentEndTime;
    if (productType) params.productType = productType;

    try {
      const response = await api.get<any>('/coin/api/candles', { params });
      const rawData = response.data?.data || response.data;
      const rows = Array.isArray(rawData) ? rawData : [];

      const batch = rows
        .map((row): Candle | null => {
          const item = Array.isArray(row) ? row : [];
          if (item.length < 5) return null;
          return {
            time: Math.floor(toNumber(item[0]) / 1000),
            open: toNumber(item[1]),
            high: toNumber(item[2]),
            low: toNumber(item[3]),
            close: toNumber(item[4]),
            volume: toNumber(item[5])
          };
        })
        .filter((candle): candle is Candle => candle !== null && Number(candle.time) > 0 && candle.close > 0)
        .sort((a, b) => Number(a.time) - Number(b.time));

      if (batch.length === 0) break;

      allCandles = [...batch, ...allCandles];

      // 필요한 개수(limit)를 채웠거나, 서버에서 내려준 캔들 수가 극히 적으면 더 이상 과거가 없다고 판단
      if (allCandles.length >= limit) {
        allCandles = allCandles.slice(allCandles.length - limit);
        break;
      }
      if (batch.length < 2) break; // 1개 이하로 내려오면 끝

      // 다음 페이지를 위해 endTime 업데이트
      const oldestTime = Number(batch[0].time) * 1000;
      currentEndTime = String(oldestTime - 1);
    } catch (error) {
      console.error('fetchCoinCandles failed:', error);
      break;
    }
  }

  // 중복 제거 및 최종 정렬
  const seen = new Set<number>();
  return allCandles
    .filter(c => {
      const t = Number(c.time);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .sort((a, b) => Number(a.time) - Number(b.time));
}

// ───────────────── Binance 호가(depth) — 공개 REST 직접 호출 ─────────────────
export async function fetchBinanceDepth(symbol: string, isFutures: boolean): Promise<import('../exchange/bitget/bitgetMergeDepth').OrderbookSnapshot | null> {
  // 백엔드 프록시 경유 — 브라우저가 Binance(fapi/api.binance.com)에 직접 붙으면 지역차단(예: 한국)에 걸려
  // 호가가 동결됨. EC2 백엔드는 Binance 접속이 정상이라 서버를 통해 받는다.
  // limit=500 — 묶음(자릿수 ×10/×100) 시에도 6행을 채울 수 있도록 충분히 받는다(표시는 6행만).
  const path = isFutures ? '/coin/api/binance/futures/depth' : '/coin/api/binance/spot/depth';
  try {
    const res = await api.get<{ asks?: [string, string][]; bids?: [string, string][] }>(path, {
      params: { symbol, limit: 500 },
    });
    const d = res.data;
    if (!d || !d.asks || !d.bids) return null;
    return {
      asks: d.asks.map(([p, s]) => ({ price: Number(p), size: Number(s) })), // 오름차순
      bids: d.bids.map(([p, s]) => ({ price: Number(p), size: Number(s) })), // 내림차순
      ts: Date.now(),
      scale: '',
    };
  } catch { return null; }
}
