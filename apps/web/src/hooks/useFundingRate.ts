import { useEffect, useState } from 'react';
import { fetchFundingRate, fetchBinanceFunding, type FundingInfo } from '../api/exchange/bitget/bitgetFunding';

// 선물 펀딩비 표시 문자열 — "0.0072% / 02:30:00(8h)" 형식.
// 펀딩률은 60초마다 재조회, 카운트다운은 1초마다 갱신.
// enabled=false(현물·비활성)면 빈 문자열. exchange로 Bitget/Binance 라우팅.
export function useFundingRate(symbol: string, enabled: boolean, exchange: 'BITGET' | 'BINANCE' = 'BITGET'): string {
  const [info, setInfo] = useState<FundingInfo | null>(null);
  const [, tick] = useState(0); // 카운트다운 1초 갱신용 리렌더 트리거

  useEffect(() => {
    if (!enabled) { setInfo(null); return; }
    let ignore = false;
    const fetcher = exchange === 'BINANCE' ? fetchBinanceFunding : fetchFundingRate;
    const load = () => fetcher(symbol).then((i) => { if (!ignore) setInfo(i); });
    load();
    const id = setInterval(load, 60_000);
    return () => { ignore = true; clearInterval(id); };
  }, [symbol, enabled, exchange]);

  useEffect(() => {
    if (!enabled || !info) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled, info]);

  if (!enabled || !info) return '';
  const ratePct = (info.rate * 100).toFixed(4);
  const remain = Math.max(0, info.nextUpdate - Date.now());
  const hh = String(Math.floor(remain / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((remain % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60_000) / 1000)).padStart(2, '0');
  return `${ratePct}% / ${hh}:${mm}:${ss}(${info.intervalHours}h)`;
}
