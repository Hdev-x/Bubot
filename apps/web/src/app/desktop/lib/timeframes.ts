import type { Candle } from '../../../shared/types/market';

// ── 차트 — 타임프레임 맵(버튼 라벨 → granularity/channel) ──
export type Tf = { label: string; value: string; granularity: string; channel: string; category: 'min' | 'hour' | 'day' | 'week' | 'month' };
export const WEB_TIMEFRAMES: Record<string, Tf> = {
  '1m': { label: '1m', value: '1m', granularity: '1min', channel: 'candle1m', category: 'min' },
  '3m': { label: '3m', value: '3m', granularity: '3min', channel: 'candle3m', category: 'min' },
  '5m': { label: '5m', value: '5m', granularity: '5min', channel: 'candle5m', category: 'min' },
  '15m': { label: '15m', value: '15m', granularity: '15min', channel: 'candle15m', category: 'min' },
  '30m': { label: '30m', value: '30m', granularity: '30min', channel: 'candle30m', category: 'min' },
  '1H': { label: '1H', value: '1h', granularity: '1h', channel: 'candle1H', category: 'hour' },
  '4H': { label: '4H', value: '4h', granularity: '4h', channel: 'candle4H', category: 'hour' },
  '6H': { label: '6H', value: '6h', granularity: '6Hutc', channel: 'candle6Hutc', category: 'hour' },
  '12H': { label: '12H', value: '12h', granularity: '12Hutc', channel: 'candle12Hutc', category: 'hour' },
  '1D': { label: '1D', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' },
  '3D': { label: '3D', value: '3d', granularity: '3Dutc', channel: 'candle3Dutc', category: 'day' },
  '1W': { label: '1W', value: '1w', granularity: '1Wutc', channel: 'candle1Wutc', category: 'week' },
  '1M': { label: '1M', value: '1mo', granularity: '1Mutc', channel: 'candle1Mutc', category: 'month' },
};
export function getIntervalSeconds(granularity: string): number {
  const map: Record<string, number> = {
    '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30min': 1800, '30m': 1800,
    '1h': 3600, '4h': 14400, '6Hutc': 21600, '12Hutc': 43200,
    '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
  };
  return map[granularity] ?? 60;
}
export function getBucketTime(timestamp: number, granularity: string): number {
  const s = timestamp;
  switch (granularity) {
    case '1min': return Math.floor(s / 60) * 60;
    case '3min': return Math.floor(s / 180) * 180;
    case '5min': return Math.floor(s / 300) * 300;
    case '15min': return Math.floor(s / 900) * 900;
    case '30min': return Math.floor(s / 1800) * 1800;
    case '1h': return Math.floor(s / 3600) * 3600;
    case '4h': return Math.floor(s / 14400) * 14400;
    case '6Hutc': return Math.floor(s / 21600) * 21600;
    case '12Hutc': return Math.floor(s / 43200) * 43200;
    case '1Dutc': return Math.floor(s / 86400) * 86400;
    case '3Dutc': return Math.floor(s / 259200) * 259200;
    case '1Wutc': {
      const d = new Date(s * 1000);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff) / 1000);
    }
    case '1Mutc': {
      // 월봉 — 케이스 누락 시 default(1분 버킷)로 떨어져 KRW 월봉 차트에 분 단위 봉이 자라남
      const d = new Date(s * 1000);
      return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
    }
    default: return Math.floor(s / 60) * 60;
  }
}
export const CHART_FALLBACK: Candle[] = [];

export const TF = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '6H', '12H', '1D', '3D', '1W', '1M'];
// 거래소별 미지원 타임프레임(공개 캔들 API에 없음) — 버튼 숨김(누르면 빈 차트라).
export const UNSUPPORTED_TF: Record<string, string[]> = {
  UPBIT: ['6H', '12H', '3D'],
  BITHUMB: ['3D'], // v1 API 전환으로 15m·4H·6H·12H·주·월 지원(3D만 미지원)
};
