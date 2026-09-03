import { useEffect, useMemo, useState, useCallback } from 'react';
import { fetchCoinLogos } from '../api/tpmApi';
import { getWorkerStatus } from '../api/adminApi';
import { fetchMainTrade } from '../api/mainTradeApi';
import { fetchUsdKrwRate } from '../api/exchangeRate';
import { useCurrency, currencyLabel } from '../contexts/CurrencyContext';
import { useCoinDetailChart } from '../hooks/useCoinDetailChart';
import { useMarketTickers } from '../hooks/useMarketTickers';
import { usePricePrecision } from '../hooks/usePricePrecision';
import { useWatchlist } from '../hooks/useWatchlist';
import type { CoinTicker } from '../types/market';
import { EXCHANGE_SELECT_OPTIONS, isKrwExchange as isKrwExchangeId, type ExchangeId } from '../constants/exchanges';
import botzMark from '../assets/botz-mark.svg';

// Utilities
import { formatRate, formatDisplaySymbol, coinColor } from '../utils/coinFormatters';
import type { ProductFilter } from '../utils/coinFormatters';

// Components
import { CoinRow } from '../components/coin-list/CoinRow';
import { CoinListSkeleton } from '../components/coin-list/CoinListSkeleton';
import { WatchlistStorySection } from '../components/coin-list/WatchlistStorySection';
import { CoinListFilterBar } from '../components/coin-list/CoinListFilterBar';
import { ExchangeBottomSheet } from '../components/coin-list/ExchangeBottomSheet';
import { WatchlistBottomSheet } from '../components/coin-list/WatchlistBottomSheet';
import { CoinDetailPanel } from '../components/coin-list/CoinDetailPanel';
import ProfileMenu from '../components/ProfileMenu';
import PullToRefresh from '../components/PullToRefresh';
import { useDelayedReady } from '../hooks/useDelayedReady';
import { useSpotValueUsdt } from '../hooks/useSpotValueUsdt';
import { TotalAssetHero } from '../components/TotalAssetHero';

type Props = {
  active?: boolean; // 마켓 화면이 떠 있을 때만 티커 폴링·WS 구독·자산 폴링
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onOpenChart: () => void;
  onOpenTrade?: (symbol?: string, market?: 'spot' | 'futures') => void;
  onProductTypeChange?: (productType: string | undefined) => void;
  onExchangeChange?: (exchange: 'BITGET' | 'BINANCE') => void;
  onTickDecimalsChange?: (decimals: number) => void;
  onLogout: () => void;
  username?: string;
};

type WatchlistSheetSize = 'half' | 'full';
type ExchangeFilter = ExchangeId;

type AssetSummary = {
  totalAssetUsdt: number;
  usdKrw: number;
  rawMergedData?: any;
};

const ASSET_REFRESH_MS = 10_000;

const exchangeOptions = EXCHANGE_SELECT_OPTIONS;

export default function CoinListPage({ active = true, selectedSymbol, onSelectSymbol, onOpenChart, onOpenTrade, onProductTypeChange, onExchangeChange, onTickDecimalsChange, onLogout, username }: Props) {
  const { precisionMap } = usePricePrecision();
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  const [displayCount, setDisplayCount] = useState(25);
  const [detailOpen, setDetailOpen] = useState(false);
  // 디테일 패널 전용 로컬 종목 — 코인 탭 시 여기만 바뀌고, 전역(차트·트레이드)에는
  // 차트/트레이드 버튼을 눌러야 커밋된다(탭만으로 새던 문제 차단).
  const [detailSymbol, setDetailSymbol] = useState(selectedSymbol);
  const [detailDragEnabled, setDetailDragEnabled] = useState(false);
  const { displayCurrency, setDisplayCurrency, isHideBalance, toggleHideBalance } = useCurrency();

  // Filters
  const [exchangeFilter, setExchangeFilter] = useState<ExchangeFilter>('BINANCE');
  const [productFilter, setProductFilter] = useState<ProductFilter>('FUTURES');
  const [marketFilter, setMarketFilter] = useState<'USDT' | 'USDC' | 'KRW'>('USDT');
  const [sortFilter, setSortFilter] = useState<'VOLUME' | 'TOP' | 'BOTTOM'>('VOLUME');
  const [activeSheet, setActiveSheet] = useState<'EXCHANGE' | 'MARKET' | 'SORT' | 'WATCHLIST' | null>(null);
  const [watchlistSheetSize, setWatchlistSheetSize] = useState<WatchlistSheetSize>('half');
  const [watchlistDragEnabled, setWatchlistDragEnabled] = useState(false);
  const [realtimeSymbols, setRealtimeSymbols] = useState<string[]>([]);
  const [assetSummary, setAssetSummary] = useState<AssetSummary>(() => {
    return { totalAssetUsdt: 0, usdKrw: 1380 };
  });

  // 업비트/빗썸 = KRW 현물 전용(선물 없음). 견적통화·세그먼트 처리에 사용.
  const isKrwExchange = isKrwExchangeId(exchangeFilter);

  const {
    allTickers,
    sortSnapshot,
    isTickerLoading,
  } = useMarketTickers({ exchangeFilter, productFilter, realtimeSymbols, active });
  const { watchlist, toggleWatchlist, isWatched } = useWatchlist();

  // 거래소 전환 시 견적통화·상품 보정 — KRW 거래소면 마켓=KRW/현물 고정,
  // USDT 거래소로 돌아오면 KRW였던 마켓필터를 USDT로 복구.
  useEffect(() => {
    if (isKrwExchange) {
      setProductFilter('SPOT');
      setMarketFilter('KRW');
    } else {
      setMarketFilter(prev => (prev === 'KRW' ? 'USDT' : prev));
    }
  }, [exchangeFilter, isKrwExchange]);

  // 마켓 탭 비활성(다른 탭 이동) 시 열린 바텀시트 닫기 — CoinListPage도 계속 마운트돼 있어,
  // 거래소 시트(useScrollLock=body fixed)를 연 채 나가면 잠금이 안 풀려 다른 화면이 깨짐.
  useEffect(() => {
    if (!active) setActiveSheet(null);
  }, [active]);

  useEffect(() => {
    if (activeSheet !== 'WATCHLIST') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeSheet]);

  const getDecimals = useCallback((ticker: CoinTicker) => {
    const key = (exchangeFilter === 'BINANCE' && productFilter === 'FUTURES')
      ? 'BN_' + ticker.symbol
      : ticker.symbol;
    return precisionMap.get(key) ?? ticker.tickDecimals;
  }, [exchangeFilter, productFilter, precisionMap]);

  useEffect(() => {
    let ignoreRequest = false;
    fetchCoinLogos().then((logosData) => {
      if (!ignoreRequest) setLogoMap(logosData);
    });
    return () => { ignoreRequest = true; };
  }, []);

  const refreshAssetSummary = useCallback(async () => {
    const [usdKrw, workerStatus] = await Promise.all([
      fetchUsdKrwRate(1380),
      getWorkerStatus().catch(() => null),
    ]);

    const snapshot = workerStatus?.snapshot;
    if (!snapshot) {
      // 워커 오프라인: MAIN 직접조회 equity로 총자산 표시(워커 없이도)
      const main = await fetchMainTrade().catch(() => null);
      setAssetSummary(prev => ({
        ...prev,
        usdKrw,
        totalAssetUsdt: main?.hasKey ? main.equity : 0,
        rawMergedData: undefined,
      }));
      return;
    }

    // 총자산 미실현손익은 메인계정 실제 포지션(mainPositions) 단일 소스로 계산.
    // (configs 기반은 실제 포지션을 못 담아 누락되던 버그가 있어 폐기 — 거래탭과 동일 기준)
    const positions = [...(snapshot.mainPositions ?? []), ...(snapshot.subPositions ?? [])]
      .filter(p => p.direction && p.entryPrice != null && p.size != null)
      .map(p => ({
        symbol: p.symbol,
        direction: p.direction,
        entryPrice: p.entryPrice ?? 0,
        size: p.size ?? 0,
      }));

    const rawMergedData = {
      mainBalance: snapshot.mainBalance ?? 0,
      balance: snapshot.subBalance ?? 0,
      mainUnrealized: 0,
      positions,
      lastPrice: {},
    };

    setAssetSummary({
      totalAssetUsdt: (snapshot.mainBalance ?? 0) + (snapshot.subBalance ?? 0),
      usdKrw,
      rawMergedData,
    });
  }, []);

  useEffect(() => {
    if (!active) return; // 마켓 화면 밖이면 자산 요약 폴링 중단
    refreshAssetSummary();
    const intervalId = window.setInterval(refreshAssetSummary, ASSET_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [active, refreshAssetSummary]);

  const filteredTickers = useMemo(() => {
    const liveBySymbol = new Map(allTickers.map(ticker => [ticker.symbol, ticker]));
    // 업비트/빗썸은 KRW 현물뿐 → 견적통화 KRW로 고정(USDT/USDC 마켓필터 무시)
    const effectiveQuote = isKrwExchange ? 'KRW' : marketFilter;
    let ordered = sortSnapshot.filter(t => t.quoteSymbol === effectiveQuote);
    if (sortFilter === 'VOLUME') {
      ordered = [...ordered].sort((a, b) => (b.volume || 0) - (a.volume || 0));
    } else if (sortFilter === 'TOP') {
      ordered = [...ordered].sort((a, b) => b.changeRate - a.changeRate);
    } else if (sortFilter === 'BOTTOM') {
      ordered = [...ordered].sort((a, b) => a.changeRate - b.changeRate);
    }
    return ordered.map(ticker => liveBySymbol.get(ticker.symbol) ?? ticker);
  }, [allTickers, sortSnapshot, exchangeFilter, marketFilter, sortFilter]);

  // 현물 평가(USDT) — 총자산에 합산(선물+봇 + 현물). 워커 연결과 무관.
  const spot = useSpotValueUsdt(active);
  // 선물+봇(현물 제외) 기준액 — 게이팅용으로 별도 분리.
  const baseAssetUsdt = useMemo(() => {
    if (!assetSummary.rawMergedData) return assetSummary.totalAssetUsdt;
    const merged = assetSummary.rawMergedData;
    const botUnrealizedUsdt = (merged.positions ?? []).reduce((sum: number, pos: any) => {
       const ticker = allTickers.find(t => t.symbol === pos.symbol);
       const currentPrice = ticker ? ticker.last : (merged.lastPrice[pos.symbol] ?? pos.entryPrice);
       return sum + (pos.direction === 'long' ? 1 : -1) * (currentPrice - pos.entryPrice) * pos.size;
    }, 0);
    return (merged.mainBalance ?? 0) + merged.balance + (merged.mainUnrealized ?? 0) + botUnrealizedUsdt;
  }, [assetSummary.rawMergedData, assetSummary.totalAssetUsdt, allTickers]);
  const realtimeTotalAssetUsdt = baseAssetUsdt + spot.value;
  // 선물(base) + 현물 시세 둘 다 도착한 뒤에만 표시(부분합 점프 방지). 1.5초 폴백.
  const assetReady = useDelayedReady(baseAssetUsdt > 0 && spot.priced);

  const displayedTickers = useMemo(() => filteredTickers.slice(0, displayCount), [filteredTickers, displayCount]);
  const watchlistTickers = useMemo(() => allTickers.filter(t => watchlist.includes(t.symbol)), [allTickers, watchlist]);
  const visibleRealtimeSymbols = useMemo(() => Array.from(new Set([...displayedTickers, ...watchlistTickers].map(t => t.symbol))), [displayedTickers, watchlistTickers]);

  useEffect(() => {
    setRealtimeSymbols(prev => {
      if (prev.length === visibleRealtimeSymbols.length && prev.every((symbol, index) => symbol === visibleRealtimeSymbols[index])) {
        return prev;
      }
      return visibleRealtimeSymbols;
    });
  }, [visibleRealtimeSymbols]);

  const selected = useMemo(() => allTickers.find((t) => t.symbol === detailSymbol) || allTickers[0], [detailSymbol, allTickers]);
  const {
    miniCandles,
    chartPeriod,
    chartType,
    chartExchange,
    chartProductType,
    resetDetailChart,
    selectChartPeriod,
    toggleChartType,
  } = useCoinDetailChart({
    detailOpen,
    selectedSymbol: selected?.symbol,
    exchangeFilter,
    productFilter,
  });

  // Infinite scroll
  useEffect(() => {
    function handleScroll() {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
        if (displayCount < filteredTickers.length) setDisplayCount(prev => prev + 25);
      }
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [displayCount, filteredTickers.length]);

  // 코인 탭 = 디테일 패널만 연다(로컬 종목). 전역(차트·트레이드)에는 아직 반영 안 함.
  const openDetail = useCallback((symbol: string) => {
    setDetailSymbol(symbol);
    setDetailDragEnabled(false);
    resetDetailChart();
    setDetailOpen(true);
  }, [resetDetailChart]);

  // 디테일 패널의 "차트/트레이드" 버튼을 눌러야 비로소 전역으로 커밋한다.
  const commitToGlobal = useCallback(() => {
    onSelectSymbol(detailSymbol);
    onExchangeChange?.(chartExchange);
    onProductTypeChange?.(chartProductType);
  }, [onSelectSymbol, onExchangeChange, onProductTypeChange, detailSymbol, chartExchange, chartProductType]);

  const handleOpenChart = useCallback(() => {
    commitToGlobal();
    onOpenChart();
  }, [commitToGlobal, onOpenChart]);

  const handleOpenTrade = useCallback(() => {
    // 트레이드 진입만 트리거(마켓은 리스트 필터로 판별). 차트 거래소는 OrderPage의 트레이드 정책
    // effect가 /orders 활성 시 일괄 적용 → 마켓 거래소는 따르지 않고 트레이드 정책(선물 바이낸스 우선) 적용.
    const market: 'spot' | 'futures' = productFilter === 'FUTURES' ? 'futures' : 'spot';
    onOpenTrade?.(detailSymbol, market);
  }, [onOpenTrade, detailSymbol, productFilter]);

  return (
    <main className="coin-list-page">
      <div className="sticky-top-section">
        <header className="tv-list-header">
          <div style={{ width: '48px' }} />
          <div className="header-center botz-brand">
            <img className="at-brand-logo" src={botzMark} alt="" />
          </div>
          <ProfileMenu
            username={username}
            onLogout={onLogout}
            onAccount={() => alert('내 계정 기능은 준비 중입니다.')}
          />
        </header>
      </div>

      <PullToRefresh onRefresh={refreshAssetSummary} excludeSelector=".coin-list">
        <section className="market-asset-summary">
          {/* 총자산 — 거래탭 디자인 공유(사이즈업 + 눈) */}
          <TotalAssetHero totalUsdt={realtimeTotalAssetUsdt} ready={assetReady} label="총자산" />
        </section>

        <div className="sticky-tabs-section">
          <WatchlistStorySection
            watchlistTickers={watchlistTickers}
            logoMap={logoMap}
            openDetail={openDetail}
            onOpenAll={() => {
              setWatchlistSheetSize('half');
              setWatchlistDragEnabled(false);
              setActiveSheet('WATCHLIST');
            }}
          />

          <CoinListFilterBar
            exchangeFilter={exchangeFilter}
            productFilter={productFilter}
            marketFilter={marketFilter}
            sortFilter={sortFilter}
            activeSheet={activeSheet}
            exchangeOptions={exchangeOptions}
            isKrwExchange={isKrwExchange}
            setActiveSheet={setActiveSheet}
            setProductFilter={setProductFilter}
            setMarketFilter={setMarketFilter}
            setSortFilter={setSortFilter}
            setDisplayCount={setDisplayCount}
            setDetailOpen={setDetailOpen}
          />
        </div>

        <section className="coin-list">
          {isTickerLoading ? (
            <CoinListSkeleton />
          ) : displayedTickers.length === 0 ? (
            <div className="no-data"><p>표시할 종목이 없습니다.</p></div>
          ) : (
            displayedTickers.map((ticker) => (
              <CoinRow
                key={ticker.symbol}
                ticker={ticker}
                isWatched={isWatched(ticker.symbol)}
                onToggleWatch={(symbol) => toggleWatchlist(symbol)}
                onClick={openDetail}
                decimals={getDecimals(ticker)}
                formatRate={formatRate}
                coinColor={coinColor}
                logoUrl={logoMap[ticker.baseSymbol]}
                displaySymbol={formatDisplaySymbol(ticker.symbol, productFilter)}
              />
            ))
          )}
        </section>
      </PullToRefresh>

      <ExchangeBottomSheet 
        activeSheet={activeSheet}
        exchangeFilter={exchangeFilter}
        exchangeOptions={exchangeOptions}
        setActiveSheet={setActiveSheet}
        setExchangeFilter={setExchangeFilter}
        setMarketFilter={setMarketFilter}
        setDisplayCount={setDisplayCount}
      />

      <WatchlistBottomSheet 
        activeSheet={activeSheet}
        watchlistSheetSize={watchlistSheetSize}
        watchlistDragEnabled={watchlistDragEnabled}
        watchlistTickers={watchlistTickers}
        logoMap={logoMap}
        productFilter={productFilter}
        getDecimals={getDecimals}
        openDetail={openDetail}
        setActiveSheet={setActiveSheet}
        setWatchlistSheetSize={setWatchlistSheetSize}
        setWatchlistDragEnabled={setWatchlistDragEnabled}
      />

      <CoinDetailPanel 
        detailOpen={detailOpen}
        selected={selected}
        detailDragEnabled={detailDragEnabled}
        isWatched={isWatched}
        logoMap={logoMap}
        productFilter={productFilter}
        getDecimals={getDecimals}
        chartType={chartType}
        chartPeriod={chartPeriod}
        miniCandles={miniCandles}
        toggleWatchlist={toggleWatchlist}
        toggleChartType={toggleChartType}
        selectChartPeriod={selectChartPeriod}
        setDetailOpen={setDetailOpen}
        setDetailDragEnabled={setDetailDragEnabled}
        onTickDecimalsChange={onTickDecimalsChange}
        onOpenChart={handleOpenChart}
        onOpenTrade={handleOpenTrade}
      />
    </main>
  );
}

function formatAssetAmount(value: number) {
  if (value > 0 && value < 1) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
