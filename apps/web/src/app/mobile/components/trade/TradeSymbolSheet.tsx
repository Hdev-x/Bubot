// 트레이드 페이지 전용 종목 선택 시트 — 비트겟 전용(거래는 항상 비트겟).
// 필터: Favorites / Spot / Futures. 즐겨찾기는 현물·선물 섞일 수 있어 양쪽 로드.
// 각 행 오른쪽 별표로 즐겨찾기 토글(localStorage 'trade_favorites', `${market}|${symbol}` 키).
import { useEffect, useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { fetchCoinFuturesTickers, fetchCoinTickers, fetchBinanceSpotTickers, fetchBinanceFuturesTickers } from '../../../../api/server/marketApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../../../../api/exchange/krw/krwTickers';
import { subscribeBitgetSpotTickers, subscribeBitgetFuturesTickers, type RealtimeTicker } from '../../../../api/server/coinRealtime';
import { usePricePrecision } from '../../../../hooks/market/usePricePrecision';
import { formatPriceWithDecimals } from '../../../../shared/utils/coinFormatters';
import type { CoinTicker } from '../../../../shared/types/market';
import { EXCHANGE_OPTIONS, isFuturesSupported, type ExchangeId } from '../../../../shared/constants/exchanges';

type Market = 'spot' | 'futures';
type Filter = 'favorites' | 'spot' | 'futures';
type SortKey = 'name' | 'volume' | 'price' | 'change';
type Entry = { t: CoinTicker; market: Market };

const FAV_KEY = 'trade_favorites';
const favKey = (symbol: string, market: Market) => `${market}|${symbol}`;

// 토큰화 주식/지수 추정 — "변동 정확히 0% + 거래대금 있음"(>1M). 토큰화 주식은 거래대금이 큰데도
// 변동이 정확히 0(시장 휴장/페그)이라 정렬 상위를 독식한다. 실제 코인은 거래량이 있으면 변동이
// 정확히 0이 아니다. (코인만 보기용 휴리스틱)
function isLikelyStock(t: CoinTicker): boolean {
  return Math.abs(t.changeRate) < 1e-9 && (t.volume || 0) > 1e6;
}

// 정렬 표시 — 위/아래 세모가 가운데 뚫린 마름모. 정렬 방향의 세모만 밝게.
function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  const on = '#eaecef';
  const off = '#54565c';
  const up = active && dir === 'asc' ? on : off;
  const down = active && dir === 'desc' ? on : off;
  return (
    <svg width="6.5" height="9.75" viewBox="0 0 8 12" aria-hidden="true" style={{ display: 'block', flexShrink: 0, position: 'relative', top: '1px' }}>
      <path d="M4 1 L7.5 4.5 L0.5 4.5 Z" fill={up} stroke={up} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M4 11 L7.5 7.5 L0.5 7.5 Z" fill={down} stroke={down} strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}

// 거래대금(USDT)을 K/M/B로 압축 표기
function formatVolume(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(0);
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialMarket: Market;                               // 열릴 때 기본 마켓(현재 트레이드 탭)
  exchange?: ExchangeId;                                              // 현재 거래소(시트 진입 시 기본)
  onSelect: (symbol: string, market: Market, exchange: ExchangeId) => void;  // 선택 → 종목 + 마켓 + 거래소
};

export default function TradeSymbolSheet({ isOpen, onClose, initialMarket, exchange = 'BITGET', onSelect }: Props) {
  // 시트 내부 거래소 선택 — 칩으로 전환. 진입 시 현재 거래소로 초기화.
  const [sheetExchange, setSheetExchange] = useState<ExchangeId>(exchange);
  const [filter, setFilter] = useState<Filter>(initialMarket);
  const [spotTickers, setSpotTickers] = useState<CoinTicker[]>([]);
  const [futuresTickers, setFuturesTickers] = useState<CoinTicker[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [sheetSize, setSheetSize] = useState<'compact' | 'full'>('compact');
  // 실시간 WS 시세 — `${market}|${symbol}` → 최신 ticker(price/change/volume). 보이는 행에 덮어씀.
  const [liveMap, setLiveMap] = useState<Record<string, RealtimeTicker>>({});
  // 가격 소수점 — 마켓과 동일: precisionMap(백엔드) 우선, 없으면 ticker.tickDecimals. (비트겟 전용이라 BN_ 분기 없음)
  const { precisionMap } = usePricePrecision();
  const getDecimals = useCallback(
    (t: CoinTicker) => precisionMap.get(t.symbol) ?? t.tickDecimals,
    [precisionMap],
  );
  const dragControls = useDragControls();

  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm('');
    setVisibleCount(40);
    setSheetSize('compact');
    setFilter(initialMarket);
    setSheetExchange(exchange);
    try { setFavorites(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { setFavorites([]); }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [isOpen, initialMarket, exchange]);

  // 선물 미지원(업비트/빗썸) 거래소면 현물 필터로 강제
  useEffect(() => {
    if (!isFuturesSupported(sheetExchange) && filter === 'futures') setFilter('spot');
  }, [sheetExchange, filter]);

  // 거래소별 현물·선물 종목 로드 (즐겨찾기 탭에서 섞여 필요) — 5초 폴링. 업비트/빗썸은 KRW 현물만.
  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    const load = () => {
      if (sheetExchange === 'BITGET') {
        fetchCoinTickers().then(d => { if (!ignore) setSpotTickers(d.filter(t => t.quoteSymbol === 'USDT' && !isLikelyStock(t))); });
        fetchCoinFuturesTickers().then(d => { if (!ignore) setFuturesTickers(d.filter(t => t.quoteSymbol === 'USDT' && !isLikelyStock(t))); });
      } else if (sheetExchange === 'BINANCE') {
        fetchBinanceSpotTickers().then(d => { if (!ignore) setSpotTickers(d.filter(t => t.quoteSymbol === 'USDT')); });
        fetchBinanceFuturesTickers().then(d => { if (!ignore) setFuturesTickers(d.filter(t => t.quoteSymbol === 'USDT')); });
      } else if (sheetExchange === 'UPBIT') {
        fetchUpbitSpotTickers().then(d => { if (!ignore) { setSpotTickers(d); setFuturesTickers([]); } });
      } else if (sheetExchange === 'BITHUMB') {
        fetchBithumbSpotTickers().then(d => { if (!ignore) { setSpotTickers(d); setFuturesTickers([]); } });
      }
    };
    load();
    // 리스트 구조(어떤 코인이 있나 + 정렬 기준)용 폴링. 보이는 행의 실시간값은 WS가 담당(비트겟만).
    const id = setInterval(load, 5000);
    return () => { ignore = true; clearInterval(id); };
  }, [isOpen, sheetExchange]);

  useEffect(() => { setVisibleCount(40); }, [sortKey, sortDir, searchTerm, filter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const isFav = useCallback((symbol: string, market: Market) => favorites.includes(favKey(symbol, market)), [favorites]);
  const toggleFav = useCallback((symbol: string, market: Market) => {
    setFavorites(prev => {
      const k = favKey(symbol, market);
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      return next;
    });
  }, []);

  // 현재 필터의 엔트리(ticker + market)
  const entries: Entry[] = useMemo(() => {
    if (filter === 'spot') return spotTickers.map(t => ({ t, market: 'spot' as Market }));
    if (filter === 'futures') return futuresTickers.map(t => ({ t, market: 'futures' as Market }));
    return [
      ...futuresTickers.filter(t => favorites.includes(favKey(t.symbol, 'futures'))).map(t => ({ t, market: 'futures' as Market })),
      ...spotTickers.filter(t => favorites.includes(favKey(t.symbol, 'spot'))).map(t => ({ t, market: 'spot' as Market })),
    ];
  }, [filter, spotTickers, futuresTickers, favorites]);

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

  // 보이는 종목만 마켓별 WS 구독(가격·변동·거래대금 실시간). 심볼 셋 바뀔 때만 재구독.
  const visibleSpotKey = visible.filter(e => e.market === 'spot').map(e => e.t.symbol).join(',');
  const visibleFuturesKey = visible.filter(e => e.market === 'futures').map(e => e.t.symbol).join(',');
  useEffect(() => {
    // 실시간 WS는 백엔드 릴레이가 있는 비트겟만. 그 외 거래소는 폴링값으로 표시.
    if (!isOpen || sheetExchange !== 'BITGET' || !visibleSpotKey) return;
    const sub = subscribeBitgetSpotTickers(visibleSpotKey.split(','), (tk) => {
      setLiveMap(prev => ({ ...prev, [`spot|${tk.symbol}`]: tk }));
    });
    return () => sub.close();
  }, [isOpen, sheetExchange, visibleSpotKey]);
  useEffect(() => {
    if (!isOpen || sheetExchange !== 'BITGET' || !visibleFuturesKey) return;
    const sub = subscribeBitgetFuturesTickers(visibleFuturesKey.split(','), (tk) => {
      setLiveMap(prev => ({ ...prev, [`futures|${tk.symbol}`]: tk }));
    });
    return () => sub.close();
  }, [isOpen, sheetExchange, visibleFuturesKey]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300 && visibleCount < filtered.length) {
      setVisibleCount(prev => prev + 40);
    }
  }

  function choose(symbol: string, market: Market) {
    onSelect(symbol, market, sheetExchange);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className={`interval-sheet trade-symbol-sheet ${sheetSize}`}
            initial={{ y: '100%', height: '92dvh' }}
            animate={{
              y: 0,
              height: sheetSize === 'full' ? '100dvh' : '92dvh',
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20,
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20,
            }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -78 || info.velocity.y < -650) { setSheetSize('full'); return; }
              if (info.offset.y > 92 || info.velocity.y > 700) {
                if (sheetSize === 'full') setSheetSize('compact');
                else onClose();
              }
            }}
          >
            <div className="interval-drag-zone" onPointerDown={(e) => dragControls.start(e)}>
              <div className="sheet-handle" />
            </div>

            {/* 검색창(맨 위). 타이틀·X 없음 */}
            <div className="trade-symbol-search-row">
              <div className="symbol-search-input-wrapper">
                <span className="trade-search-icon" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* 거래소 칩 — 4종 가로 스크롤. 선택 시 해당 거래소 종목으로 전환 */}
            <div className="trade-symbol-exchange-row" style={{ display: 'flex', gap: 8, padding: '4px 16px 8px', overflowX: 'auto' }}>
              {EXCHANGE_OPTIONS.map((ex) => {
                const on = sheetExchange === ex.id;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setSheetExchange(ex.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                      border: on ? '1px solid var(--blue, #3182F6)' : '1px solid var(--border, rgba(255,255,255,0.1))',
                      background: on ? 'rgba(49,130,246,0.12)' : 'transparent',
                      color: on ? 'var(--text, #eaecef)' : 'var(--muted, #8b8e97)',
                      fontSize: 13, fontWeight: on ? 700 : 500,
                    }}
                  >
                    <img src={ex.logo} alt="" aria-hidden="true" style={{ width: 16, height: 16 }} />
                    {ex.label}
                  </button>
                );
              })}
            </div>

            {/* Favorites / Spot / Futures 필터 (Bitget식 텍스트 탭). 선물 미지원 거래소는 Futures 숨김 */}
            <div className="trade-symbol-market-tabs">
              <button className={filter === 'favorites' ? 'active' : ''} onClick={() => setFilter('favorites')}>Favorites</button>
              <button className={filter === 'spot' ? 'active' : ''} onClick={() => setFilter('spot')}>Spot</button>
              {isFuturesSupported(sheetExchange) && (
                <button className={filter === 'futures' ? 'active' : ''} onClick={() => setFilter('futures')}>Futures</button>
              )}
            </div>

            {/* 컬럼 헤더 정렬 (Bitget식) — Name/Volume · Last price/Change% */}
            <div className="trade-symbol-colhead">
              <div className="colhead-group">
                <button className={sortKey === 'name' ? 'active' : ''} onClick={() => toggleSort('name')}>
                  Name<SortIcon active={sortKey === 'name'} dir={sortDir} />
                </button>
                <span className="colhead-sep">/</span>
                <button className={sortKey === 'volume' ? 'active' : ''} onClick={() => toggleSort('volume')}>
                  Volume<SortIcon active={sortKey === 'volume'} dir={sortDir} />
                </button>
              </div>
              <div className="colhead-group">
                <button className={sortKey === 'price' ? 'active' : ''} onClick={() => toggleSort('price')}>
                  Last price<SortIcon active={sortKey === 'price'} dir={sortDir} />
                </button>
                <span className="colhead-sep">/</span>
                <button className={sortKey === 'change' ? 'active' : ''} onClick={() => toggleSort('change')}>
                  Change %<SortIcon active={sortKey === 'change'} dir={sortDir} />
                </button>
              </div>
            </div>

            {/* 검색·필터·정렬까지 고정, 아래 리스트만 스크롤 */}
            <div className="interval-sheet-content" onScroll={handleScroll}>
              <section className="interval-section">
                {filter === 'favorites' && visible.length === 0 && (
                  <p className="trade-symbol-empty">관심종목이 없어요. 별표를 눌러 추가하세요.</p>
                )}
                <div className="symbol-row-list">
                  {visible.map(({ t, market }) => {
                    // WS 실시간값 우선, 없으면 폴링값 폴백(가격은 항상 옴, 변동·거래대금은 백엔드가 보낼 때만)
                    const live = liveMap[`${market}|${t.symbol}`];
                    const price = live?.price ?? t.last;
                    const changeRate = live?.changeRate ?? t.changeRate;
                    const volume = live?.volume ?? t.volume;
                    return (
                    <div
                      key={`${market}|${t.symbol}`}
                      className="symbol-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => choose(t.symbol, market)}
                    >
                      <div className="symbol-row-info">
                        <div className="symbol-row-name">
                          <strong>{market === 'futures' ? `${t.symbol}.P` : t.symbol}</strong>
                          {market === 'futures' && <span className="trade-row-market-badge">Perpetual</span>}
                        </div>
                        <span>{formatVolume(volume)}</span>
                      </div>
                      <div className="symbol-row-price">
                        <strong className="last-price">{formatPriceWithDecimals(price, getDecimals(t))}</strong>
                        <span className={changeRate >= 0 ? 'up' : 'down'}>
                          {changeRate >= 0 ? '+' : ''}{(changeRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`symbol-row-star ${isFav(t.symbol, market) ? 'on' : ''}`}
                        onClick={(ev) => { ev.stopPropagation(); toggleFav(t.symbol, market); }}
                        aria-label="관심종목"
                      >
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
                          <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
                        </svg>
                      </button>
                    </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
