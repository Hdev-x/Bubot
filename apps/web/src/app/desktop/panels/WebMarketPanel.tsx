// 데스크톱 웹 마켓 패널 — 모바일 거래탭 종목 시트(TradeSymbolSheet) 복붙·각색 + 로고 컬럼.
// Favorites는 사이드바 '관심' 섹션(WebFavoritesPanel)으로 분리 — 여기선 Spot/Futures만.
// 데이터/유틸은 공유 계층만 사용. 행/정렬/즐겨찾기/로더는 marketShared.
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  subscribeBitgetSpotTickers, subscribeBitgetFuturesTickers,
  subscribeBinanceSpotTickers, subscribeBinanceFuturesTickers,
  type RealtimeTicker,
} from '../../../api/server/coinRealtime';
import { subscribeKrwTickers } from '../../../api/exchange/krw/krwRealtime';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { useDelayedReady } from '../../../hooks/ui/useDelayedReady';
import type { CoinTicker } from '../../../shared/types/market';
import { EXCHANGE_OPTIONS, isFuturesSupported, type ExchangeId } from '../../../shared/constants/exchanges';
import { SortIcon, WebSymbolRow, loadExchangeTickers, useWebFavorites, useCoinLogos, type Market } from './marketShared';
import './panels.css';

type Filter = 'spot' | 'futures';
type SortKey = 'name' | 'volume' | 'price' | 'change';
type Entry = { t: CoinTicker; market: Market };

export function WebMarketPanel({ active, onSelect }: { active: boolean; onSelect?: (symbol: string, market: Market, exchange: ExchangeId) => void }) {
  const [exchange, setExchange] = useState<ExchangeId>('BINANCE');
  const [filter, setFilter] = useState<Filter>('futures');
  const [spotTickers, setSpotTickers] = useState<CoinTicker[]>([]);
  const [futuresTickers, setFuturesTickers] = useState<CoinTicker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [liveMap, setLiveMap] = useState<Record<string, RealtimeTicker>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const { isFav, toggleFav } = useWebFavorites();
  const logos = useCoinLogos();
  const { precisionMap } = usePricePrecision();
  const getDecimals = useCallback((t: CoinTicker) => precisionMap.get(t.symbol) ?? t.tickDecimals, [precisionMap]);

  // 선물 미지원(업비트/빗썸) → 현물 강제
  useEffect(() => {
    if (!isFuturesSupported(exchange) && filter === 'futures') setFilter('spot');
  }, [exchange, filter]);

  // 거래소별 현물·선물 종목 로드 — 5초 폴링
  useEffect(() => {
    if (!active) return;
    let ignore = false;
    // 거래소 전환 즉시 목록을 비워 스켈레톤을 띄운다(이전 거래소 목록이 남아 'stale→툭 교체'되는 어색함 제거)
    setSpotTickers([]);
    setFuturesTickers([]);
    const load = () => {
      loadExchangeTickers(exchange).then(({ spot, futures }) => {
        if (ignore) return;
        setSpotTickers(spot);
        setFuturesTickers(futures);
      }).catch(() => { /* 폴링 실패(429 등) 시 이전 목록 유지 — 빈 화면으로 안 덮음 */ });
    };
    load();
    const id = setInterval(load, 5000);
    return () => { ignore = true; clearInterval(id); };
  }, [active, exchange]);

  useEffect(() => { setVisibleCount(40); }, [sortKey, sortDir, searchTerm, filter, exchange]);
  useEffect(() => { setLiveMap({}); }, [exchange]); // 거래소 전환 시 실시간값 초기화
  // 전환·정렬·검색 변경 시 리스트 스크롤을 맨 위로 (이전 위치 유지로 인한 어색함 제거)
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [exchange, filter, sortKey, sortDir, searchTerm]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const entries: Entry[] = useMemo(() => {
    const src = filter === 'spot' ? spotTickers : futuresTickers;
    return src.map(t => ({ t, market: filter as Market }));
  }, [filter, spotTickers, futuresTickers]);

  const sorted = useMemo(() => {
    const list = [...entries];
    const sign = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'name') cmp = a.t.symbol.localeCompare(b.t.symbol);
      else if (sortKey === 'price') cmp = (a.t.last || 0) - (b.t.last || 0);
      else if (sortKey === 'change') cmp = a.t.changeRate - b.t.changeRate;
      else cmp = (a.t.volume || 0) - (b.t.volume || 0);
      return cmp * sign;
    });
    return list;
  }, [entries, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const term = searchTerm.toUpperCase();
    if (!term) return sorted;
    return sorted.filter(e => e.t.symbol.includes(term) || (e.t.name && e.t.name.toUpperCase().includes(term)));
  }, [sorted, searchTerm]);

  const visible = filtered.slice(0, visibleCount);

  // 현재 필터(현물/선물) 종목 데이터 도착 전까지 스켈레톤 (빈 응답 대비 1500ms 폴백)
  const listReady = useDelayedReady((filter === 'spot' ? spotTickers : futuresTickers).length > 0);

  // 보이는 종목만 WS 구독(실시간). 비트겟·바이낸스=백엔드 STOMP, 업비트·빗썸=직결 WS(현물만). 거래량 컬럼은 5초 REST 유지.
  const visibleSpotKey = visible.filter(e => e.market === 'spot').map(e => e.t.symbol).join(',');
  const visibleFuturesKey = visible.filter(e => e.market === 'futures').map(e => e.t.symbol).join(',');
  useEffect(() => {
    if (!active || !visibleSpotKey) return;
    const onTk = (tk: RealtimeTicker) => setLiveMap(prev => ({ ...prev, [`spot|${tk.symbol}`]: tk }));
    const sub = exchange === 'BITGET' ? subscribeBitgetSpotTickers(visibleSpotKey.split(','), onTk)
      : exchange === 'BINANCE' ? subscribeBinanceSpotTickers(visibleSpotKey.split(','), onTk)
      : (exchange === 'UPBIT' || exchange === 'BITHUMB') ? subscribeKrwTickers(exchange, visibleSpotKey.split(','), onTk)
      : null;
    return () => sub?.close();
  }, [active, exchange, visibleSpotKey]);
  useEffect(() => {
    if (!active || !visibleFuturesKey) return;
    const sub = exchange === 'BITGET' ? subscribeBitgetFuturesTickers(visibleFuturesKey.split(','), (tk) => setLiveMap(prev => ({ ...prev, [`futures|${tk.symbol}`]: tk })))
      : exchange === 'BINANCE' ? subscribeBinanceFuturesTickers(visibleFuturesKey.split(','), (tk) => setLiveMap(prev => ({ ...prev, [`futures|${tk.symbol}`]: tk })))
      : null;
    return () => sub?.close();
  }, [active, exchange, visibleFuturesKey]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300 && visibleCount < filtered.length) {
      setVisibleCount(prev => prev + 40);
    }
  }

  return (
    <div className="wm">
      <div className="wm-search">
        <div className="wm-search-box">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input type="text" placeholder="검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="wm-chips">
        {EXCHANGE_OPTIONS.map((ex) => (
          <button key={ex.id} type="button" className={`wm-chip${exchange === ex.id ? ' on' : ''}`} onClick={() => setExchange(ex.id)}>
            <img src={ex.logo} alt="" aria-hidden="true" />{ex.label}
          </button>
        ))}
      </div>

      <div className="wm-tabs">
        <button className={filter === 'spot' ? 'active' : ''} onClick={() => setFilter('spot')}>Spot</button>
        {isFuturesSupported(exchange) && (
          <button className={filter === 'futures' ? 'active' : ''} onClick={() => setFilter('futures')}>Futures</button>
        )}
      </div>

      <div className="wm-colhead">
        <div className="wm-colgroup">
          <button className={sortKey === 'name' ? 'active' : ''} onClick={() => toggleSort('name')}>Name<SortIcon active={sortKey === 'name'} dir={sortDir} /></button>
          <span className="wm-colsep">/</span>
          <button className={sortKey === 'volume' ? 'active' : ''} onClick={() => toggleSort('volume')}>Volume<SortIcon active={sortKey === 'volume'} dir={sortDir} /></button>
        </div>
        <div className="wm-colgroup">
          <button className={sortKey === 'price' ? 'active' : ''} onClick={() => toggleSort('price')}>Last price<SortIcon active={sortKey === 'price'} dir={sortDir} /></button>
          <span className="wm-colsep">/</span>
          <button className={sortKey === 'change' ? 'active' : ''} onClick={() => toggleSort('change')}>Change %<SortIcon active={sortKey === 'change'} dir={sortDir} /></button>
        </div>
      </div>

      <div className="wm-list" ref={listRef} onScroll={handleScroll}>
        {!listReady ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="wm-row wm-row-skel">
              <span className="wm-row-logo skeleton-shimmer" />
              <div className="wm-row-info">
                <div className="wm-row-name"><span className="wm-sk-bar wm-sk-name skeleton-shimmer" /></div>
                <span className="wm-sk-bar wm-sk-vol skeleton-shimmer" />
              </div>
              <div className="wm-row-price">
                <span className="wm-sk-bar wm-sk-price skeleton-shimmer" />
                <span className="wm-sk-bar wm-sk-chg skeleton-shimmer" />
              </div>
            </div>
          ))
        ) : (
          <div className="wm-list-fade">
            {visible.map(({ t, market }) => {
              const live = liveMap[`${market}|${t.symbol}`];
              // 거래대금은 REST(24h, 5초 폴링) 값 유지. WS volume은 kline UTC누적치라 24h와 충돌 → 가격·등락만 실시간 갱신.
              const view: CoinTicker = live ? { ...t, last: live.price ?? t.last, changeRate: live.changeRate ?? t.changeRate } : t;
              return (
                <WebSymbolRow
                  key={`${market}|${t.symbol}`}
                  ticker={view}
                  market={market}
                  decimals={getDecimals(t)}
                  faved={isFav(exchange, t.symbol, market)}
                  onToggleFav={() => toggleFav(exchange, t.symbol, market)}
                  onClick={() => onSelect?.(t.symbol, market, exchange)}
                  logoUrl={logos[t.baseSymbol]}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
