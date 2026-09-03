import { useEffect, useRef, useState } from 'react';
import {
  fetchMergeDepth,
  type OrderbookSnapshot,
  type DepthPrecision,
} from '../api/bitgetMergeDepth';
import { fetchBinanceDepth } from '../api/marketApi';
import { subscribeKrwOrderbook } from '../api/krwRealtime';

const POLL_MS = 500;

type OrderbookExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

/**
 * 호가창 — 거래소별 공개 API를 폴링해 갱신. 심볼/마켓이 바뀌면 즉시 재조회.
 * BITGET은 merge-depth(precision 단위), 그 외는 고정 레벨 호가.
 */
export function useOrderbook(
  symbol: string,
  precision: DepthPrecision,
  isFutures = true,
  enabled = true,
  exchange: OrderbookExchange = 'BITGET',
  clearOnChange = true,
): OrderbookSnapshot | null {
  const [book, setBook] = useState<OrderbookSnapshot | null>(null);
  const keyRef = useRef('');

  useEffect(() => {
    if (!symbol || !enabled) return;
    let cancelled = false;
    let timer: number | undefined;

    // 종목/마켓/거래소가 바뀌면 비운다(기본). clearOnChange=false면 이전 호가 유지하다 새 호가로 직접 교체(빈화면 없음).
    const bookKey = `${exchange}|${symbol}|${isFutures}`;
    if (keyRef.current !== bookKey) {
      keyRef.current = bookKey;
      if (clearOnChange) setBook(null);
    }

    // 업비트/빗썸은 직결 WebSocket으로 실시간 호가 구독(폴링 대신)
    if (exchange === 'UPBIT' || exchange === 'BITHUMB') {
      const sub = subscribeKrwOrderbook(exchange, symbol, (snap) => {
        if (!cancelled) setBook({ ...snap, key: bookKey });
      });
      return () => { cancelled = true; sub.close(); };
    }

    const fetchByExchange = (): Promise<OrderbookSnapshot | null> => {
      switch (exchange) {
        case 'BINANCE': return fetchBinanceDepth(symbol, isFutures);
        default:        return fetchMergeDepth(symbol, precision, isFutures);
      }
    };

    const poll = async () => {
      const snap = await fetchByExchange();
      if (cancelled) return;
      if (snap) setBook({ ...snap, key: bookKey }); // key 태그 — 호출부가 "현재 종목 호가인지" 판별
      timer = window.setTimeout(poll, POLL_MS);
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [symbol, precision, isFutures, enabled, exchange, clearOnChange]);

  return book;
}
