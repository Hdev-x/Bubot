import { useEffect, useRef, useState } from 'react';
import { type BitgetTicker } from '../../../api/exchange/bitget/bitgetTicker';
import { fetchHeaderTicker } from '../../../api/exchange/headerTicker';
import { fetchCoinMarketCap } from '../../../api/server/marketApi';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import type { useCandleLoader } from '../../../chart/hooks/useCandleLoader';
import type { DesktopExchange } from './useDesktopCandles';

// Desktop 종목 헤더 데이터 — 24h 티커·일봉 2개·시총 폴링과 통합 스냅샷(H). DesktopApp에서 옮김 (wp-06 d03).
// livePrice·dailyOpenPrice·loadedSymbol·loadCandles는 useDesktopCandles 결과, fmtPx는 DesktopApp의 가격 포맷터.
export function useHeaderSnapshot({ symbol, exchange, isFutures, base, loadCandles, livePrice, dailyOpenPrice, loadedSymbol, fmtPx }: {
  symbol: string;
  exchange: DesktopExchange;
  isFutures: boolean;
  base: string;
  loadCandles: ReturnType<typeof useCandleLoader>;
  livePrice: number | null;
  dailyOpenPrice: number | null;
  loadedSymbol: string | null | undefined;
  fmtPx: (n: number | null | undefined) => string;
}) {
  // ── 헤더 정보 — 거래소별 24h 티커(고가/저가/거래량/거래대금) ──
  // sym 태그 — 어느 종목에 대한 값인지. 실패해도 {sym, t:null}로 resolve해 헤더 통합 스왑이 멈추지 않게.
  const [tkr, setTkr] = useState<{ sym: string; t: BitgetTicker | null } | null>(null);
  useEffect(() => {
    let ignore = false;
    const load = () => {
      fetchHeaderTicker(exchange, symbol, isFutures)
        .then((t) => { if (!ignore) setTkr({ sym: symbol, t: t ?? null }); })
        .catch(() => { if (!ignore) setTkr({ sym: symbol, t: null }); });
    };
    load();
    const id = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(id); };
  }, [symbol, exchange, isFutures]);
  const fmtVol = (n: number) => {
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  // ── 헤더 정보 — 전날 종가/당일 시가(일봉 2개), 시가총액(백엔드 CoinGecko 프록시) ──
  // 실패/없음도 null 값으로 resolve(sym/base는 채움) → 통합 스왑이 멈추지 않음
  const [dayStats, setDayStats] = useState<{ sym: string; prevClose: number | null; todayOpen: number | null } | null>(null);
  const [marketCap, setMarketCap] = useState<{ base: string; cap: number | null } | null>(null);
  useEffect(() => {
    let ignore = false;
    // loadCandles는 거래소별 라우팅(Bitget/Binance/업비트/빗썸) — KRW도 일봉 2개로 전날종가/당일시가 산출
    const loadDay = () => {
      loadCandles('1Dutc', 2)
        .then((cs) => {
          if (ignore) return;
          if (cs.length < 1) { setDayStats({ sym: symbol, prevClose: null, todayOpen: null }); return; }
          const prev = cs[cs.length - 2] ?? cs[0];
          const today = cs[cs.length - 1];
          setDayStats({ sym: symbol, prevClose: prev.close, todayOpen: today.open });
        })
        .catch(() => { if (!ignore) setDayStats({ sym: symbol, prevClose: null, todayOpen: null }); });
    };
    const loadCap = () => {
      fetchCoinMarketCap(base)
        .then((mc) => { if (!ignore) setMarketCap({ base, cap: mc ?? null }); })
        .catch(() => { if (!ignore) setMarketCap({ base, cap: null }); });
    };
    loadDay(); loadCap();
    const idDay = setInterval(loadDay, 60000);   // 일봉 60초
    const idCap = setInterval(loadCap, 300000);  // 시총 5분(백엔드 10분 캐시)
    return () => { ignore = true; clearInterval(idDay); clearInterval(idCap); };
  }, [symbol, base, loadCandles]);

  // ── 헤더 통합 스냅샷(H) — 좌측·우측 전부 한 종목으로, 모든 데이터가 준비됐을 때만 통째 교체 ──
  // allReady: 현재 종목(symbol)에 대해 현재가·일봉시가·티커·일봉통계·시총이 전부 도착(실패는 null로 resolve).
  // 준비되면 모든 표시값을 미리 포맷해 headRef에 통째로 커밋(현재 종목이면 매 렌더 재커밋 → 가격 실시간 갱신).
  // 준비 전(전환 중)엔 직전 종목 스냅샷을 그대로 유지 → 부분적으로 들어와 칸이 밀리는 레이아웃 시프트 없음.
  const allReady =
    loadedSymbol === symbol && livePrice != null && dailyOpenPrice != null &&
    tkr?.sym === symbol &&
    dayStats?.sym === symbol &&
    marketCap?.base === base;
  const headRef = useRef<{
    symbol: string; title: string; isFutures: boolean;
    exchange: DesktopExchange; base: string;
    px: string; chg: { abs: string; pct: string; up: boolean } | null;
    prevClose: string; todayOpen: string; high: string; low: string;
    baseLabel: string; quoteLabel: string; baseVol: string; quoteVol: string; cap: string;
  } | null>(null);
  if (allReady) {
    const abs = livePrice - dailyOpenPrice;
    const pct = dailyOpenPrice !== 0 ? (abs / dailyOpenPrice) * 100 : 0;
    const t = tkr!.t;
    headRef.current = {
      symbol,
      title: isFutures ? `${symbol}.P` : symbol,
      isFutures,
      exchange,
      base,
      px: fmtPx(livePrice),
      chg: { abs: fmtPx(abs), pct: pct.toFixed(2), up: pct >= 0 },
      prevClose: dayStats!.prevClose != null ? fmtPx(dayStats!.prevClose) : '—',
      todayOpen: dayStats!.todayOpen != null ? fmtPx(dayStats!.todayOpen) : fmtPx(dailyOpenPrice),
      high: t ? fmtPx(t.high24h) : '—',
      low: t ? fmtPx(t.low24h) : '—',
      baseLabel: base,
      quoteLabel: EXCHANGES[exchange].quote,
      baseVol: t ? fmtVol(t.baseVolume) : '—',
      quoteVol: t ? fmtVol(t.quoteVolume) : '—',
      cap: marketCap!.cap != null ? '$' + fmtVol(marketCap!.cap) : '—',
    };
  }
  const H = headRef.current;

  return { H, fmtVol };
}
