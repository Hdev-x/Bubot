import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import PullToRefresh from '../components/PullToRefresh';
import { useOrderbook } from '../hooks/useOrderbook';
import { useMainTrade } from '../hooks/useMainTrade';
import { useSpotTrade } from '../hooks/useSpotTrade';
import TradeOrderbook from '../components/trade/TradeOrderbook';
import PositionCard from '../components/trade/PositionCard';
import PlanOrderCard from '../components/trade/PlanOrderCard';
import TradeSymbolHeader from '../components/trade/TradeSymbolHeader';
import TradeSymbolSheet from '../components/trade/TradeSymbolSheet';
import TradeExchangeSheet from '../components/trade/TradeExchangeSheet';
import DemoTradeView from '../components/trade/DemoTradeView';
import TradeTabEditSheet, { TAB_LABELS, type TradeTab } from '../components/trade/TradeTabEditSheet';
import DepthSheet from '../components/trade/DepthSheet';
import { isFuturesSupported, isKrwExchange, type ExchangeId } from '../constants/exchanges';
import TradeAccountSummary from '../components/trade/TradeAccountSummary';
import SpotAccountSummary from '../components/trade/SpotAccountSummary';
import SpotHoldingCard from '../components/trade/SpotHoldingCard';
import SpotCostSheet from '../components/trade/SpotCostSheet';
import type { SpotHolding } from '../api/spotTradeApi';
import { isBitgetSymbolSupported } from '../api/bitgetSymbols';
import { resolveTradeChartTarget } from '../api/chartPolicy';
import { usePricePrecision } from '../hooks/usePricePrecision';
import { useRealtimePrices } from '../hooks/useRealtimePrices';
import { useFundingRate } from '../hooks/useFundingRate';
import type { DepthPrecision } from '../api/bitgetMergeDepth';
import type { TradeLog } from '../types/bot';

// 호가 단위(묶음) 라벨 — 심볼 최소 틱(소수점)을 1번으로, ×10씩. scale0=최소틱 … scale3=틱×1000.
// 예: BTC(소수1자리) → 0.1/1/10/100, ETH(소수2자리) → 0.01/0.1/1/10
function depthLabelFor(scaleIndex: number, symbolDecimals: number): string {
  const dec = Math.max(0, symbolDecimals - scaleIndex);
  const value = Math.pow(10, scaleIndex - symbolDecimals);
  return value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

type Props = {
  symbol: string;
  active?: boolean; // /orders 라우트가 현재 활성인지 — 트레이드 차트 정책을 화면에 떠있을 때만 적용
  onSelectSymbol?: (symbol: string) => void;
  // 차트용 마켓 토큰('USDT-FUTURES' | undefined) — App selectedProductType와 동일 체계
  onProductTypeChange?: (productType: string | undefined) => void;
  // 차트 거래소 — 트레이드 시트 선택 시 "바이낸스 선물 우선" 정책 반영용
  onExchangeChange?: (exchange: 'BITGET' | 'BINANCE') => void;
  onOpenChart?: () => void;
  tradeMarketReq?: { market: 'spot' | 'futures'; seq: number } | null;
  onTabBar?: (p: { x: number; y: number } | null) => void; // App 공유 탭 인디케이터로 활성 탭 위치 보고
};

function fmt(sec: number) {
  return new Date(sec * 1000).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ago(sec: number) {
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60)  return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  return `${Math.floor(diff / 3600)}시간 전`;
}

function outcomeLabel(o: string) {
  return { tp: 'TP', sl1: 'SL1', sl2: 'SL2', sl3: 'SL3', timeout: '타임아웃', '취소': '취소', '진입': '진입' }[o] ?? o;
}

// 포지션·미체결(계정) 가격 표기 — 큰 값은 천단위, 작은 값은 소수 유지.
// (호가용 fmtPrice는 컴포넌트 안에 따로 있음 — 단위 묶음에 종속이라 계정 표시엔 부적합)
function fmtAcctPrice(n: number) {
  if (!Number.isFinite(n)) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

// 거래탭 순서 — 유저가 편집(드래그) 가능, localStorage 저장. 기본 = 선물·현물·주식.
const DEFAULT_TAB_ORDER: TradeTab[] = ['futures', 'spot', 'stock'];
const TAB_ORDER_KEY = 'trade_tab_order';
function loadTabOrder(): TradeTab[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || 'null');
    if (Array.isArray(saved) && saved.length === DEFAULT_TAB_ORDER.length
      && DEFAULT_TAB_ORDER.every((t) => saved.includes(t))) return saved as TradeTab[];
  } catch { /* 무시 */ }
  return DEFAULT_TAB_ORDER;
}

export default function OrderPage({ symbol, active, onSelectSymbol, onProductTypeChange, onExchangeChange, onOpenChart, tradeMarketReq, onTabBar }: Props) {
  // 톱 탭: Futures(선물) / Spot(현물) / Stock(주식, 준비중). 기본 선물. (Bot은 전략 탭으로 이동)
  const [activeTab, setActiveTab] = useState<TradeTab>('futures');
  // 탭 순서(유저 편집) + 편집 시트
  const [tabOrder, setTabOrder] = useState<TradeTab[]>(loadTabOrder);
  const [tabEditOpen, setTabEditOpen] = useState(false);
  const applyTabOrder = (next: TradeTab[]) => {
    setTabOrder(next);
    try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
  };

  // 거래소 선택(실거래는 현재 Bitget만 — 나머지는 데모). 헤더 배지(▾)로 전환.
  const [tradeExchange, setTradeExchange] = useState<ExchangeId>('BITGET');
  const [exchangeSheetOpen, setExchangeSheetOpen] = useState(false);
  const [demoSymbol, setDemoSymbol] = useState(''); // 데모 거래소에서 시트로 고른 종목(없으면 기본값)
  const exchangeSupportsFutures = isFuturesSupported(tradeExchange);
  const isDemoExchange = tradeExchange !== 'BITGET'; // Bitget 외엔 더미/데모(실 API 연결은 후속)
  // 데모 호가창에 쓸 종목 — 시트 선택값 우선, 없으면 거래소 기본(KRW=BTCKRW / USDT=현재 전역 심볼)
  const demoSym = demoSymbol || (isKrwExchange(tradeExchange) ? 'BTCKRW' : symbol);

  // 선물 미지원 거래소(업비트/빗썸)로 전환 시 현물 탭으로 강제 — 선물 탭 자체도 숨김.
  useEffect(() => {
    if (!exchangeSupportsFutures && activeTab === 'futures') setActiveTab('spot');
  }, [exchangeSupportsFutures, activeTab]);
  // 차트·마켓에서 트레이드 진입 시 그 종목의 마켓(현물/선물) 탭으로 전환
  const tradeMarketSeqRef = useRef(tradeMarketReq?.seq);
  useEffect(() => {
    if (tradeMarketReq && tradeMarketReq.seq !== tradeMarketSeqRef.current) {
      tradeMarketSeqRef.current = tradeMarketReq.seq;
      setActiveTab(tradeMarketReq.market);
    }
  }, [tradeMarketReq]);

  // 선물↔현물 탭 슬라이드: 전환 시 나가는 화면을 DOM 스냅샷으로 떠서(ghost) 새 화면과 같이 옆으로 민다.
  // dir = 새 화면이 들어오는 방향(Spot=오른쪽/Futures=왼쪽). ghost는 반대로 빠져나감.
  const [slide, setSlide] = useState<{ html: string; dir: 'left' | 'right' } | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const switchMarket = (tab: TradeTab) => {
    if (tab === activeTab) return;
    const node = paneRef.current;
    // 들어오는 방향 = 탭 순서상 위치 기준(오른쪽 탭이면 오른쪽에서 입장). 순서 편집해도 일관 유지.
    const dir = tabOrder.indexOf(tab) > tabOrder.indexOf(activeTab) ? 'right' : 'left';
    if (node) setSlide({ html: node.innerHTML, dir });
    setActiveTab(tab);
  };

  // 상단 탭 인디케이터 바(고정 길이 22px) — 활성 탭 중앙으로 슬라이드(콘텐츠 전환과 동일 0.26s).
  // 헤더(구분선 보유) 기준 좌표로 측정해 바를 구분선에 붙인다.
  const tabsRef = useRef<HTMLElement>(null);
  // 활성 탭 위치를 App에 보고 — App의 공유 인디케이터가 그 자리로 슬라이드(거래↔자산 공유)
  useLayoutEffect(() => {
    if (!active) return;
    const header = tabsRef.current;
    if (!header) return;
    const btn = header.querySelector(`.tabs-scroll-container button[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    if (br.width === 0) return;
    onTabBar?.({ x: br.left + br.width / 2 - 11, y: header.getBoundingClientRect().bottom - 6 });
  }, [activeTab, active, exchangeSupportsFutures, tabOrder, onTabBar]);

  // 호가 단위(묶음) 선택 상태 + 선택 시트
  const [depthScale, setDepthScale] = useState<DepthPrecision>('scale2'); // 기본 = 틱×100
  const [depthSheetOpen, setDepthSheetOpen] = useState(false);
  const { getTickDecimals } = usePricePrecision(2);
  const isFuturesMarket = activeTab === 'futures';
  const realtimePrices = useRealtimePrices(active ? [symbol] : [], isFuturesMarket); // 가운데 현재가용 실시간 시세 — 탭에 맞는 선물/현물 티커 (비활성 시 구독 해제)

  // 하단 탭 상태 및 옵션
  const [positionActiveTab, setPositionActiveTab] = useState<'positions' | 'orders'>('positions');
  const [showCurrentOnly, setShowCurrentOnly] = useState(false);

  // MAIN 키(수동) 데이터 — 해당 마켓일 때만 폴링(보기 전용). (Bot 제거로 거래 뷰는 항상 true)
  const isTradeView = true;

  // 비트겟 거래 가능 종목 가드 — 진입 경로(툴바/하단탭) 무관하게 여기서 한 번에 검사.
  // 차트에서 바이낸스 전용 종목을 보다 하단탭으로 넘어오면 비트겟에 없는 심볼이 올 수 있어,
  // 미지원이면 호가·주문 대신 안내를 띄운다(종목명 헤더는 유지). 목록 못 받으면 fail-open(통과).
  const [tradable, setTradable] = useState(true);
  useEffect(() => {
    if (!isTradeView || isDemoExchange) return; // 데모 거래소는 비트겟 종목 검사 불필요
    let ignore = false;
    const market = isFuturesMarket ? 'futures' : 'spot';
    isBitgetSymbolSupported(symbol, market).then(ok => { if (!ignore) setTradable(ok); });
    return () => { ignore = true; };
  }, [isTradeView, isFuturesMarket, symbol, isDemoExchange]);

  // 종목이 바뀌면 호가 단위를 기본값으로 되돌린다. 이전 종목 단위를 들고 가면
  // 새 종목이 그 단위를 지원 안 할 때 merge-depth가 계속 null이라 호가창이 빈 채 멈춘다.
  useEffect(() => { setDepthScale('scale2'); }, [symbol]);

  // 트레이드 화면이 실제 활성(/orders)이고 거래 뷰일 때, 차트 거래소를 트레이드 정책으로 맞춘다.
  // (선물=바이낸스 우선, 현물=비트겟) — 첫 트레이드 진입·시트 선택·마켓→트레이드·탭전환 전부 여기서 커버.
  // active 게이팅: 차트 화면에 있을 땐 발화 안 함 → 차트 버튼(마켓 존중) 커밋을 덮어쓰지 않음.
  useEffect(() => {
    if (!active || !isTradeView || isDemoExchange) return;
    let ignore = false;
    const market = isFuturesMarket ? 'futures' : 'spot';
    resolveTradeChartTarget(symbol, market).then(t => {
      if (ignore) return;
      onExchangeChange?.(t.exchange);
      onProductTypeChange?.(t.productType);
    });
    return () => { ignore = true; };
  }, [active, isTradeView, isFuturesMarket, symbol, isDemoExchange, onExchangeChange, onProductTypeChange]);
  const { data: mainTrade, refetch: refetchMainTrade } = useMainTrade(!!active && isTradeView && isFuturesMarket && !isDemoExchange);
  const { data: spotTrade, refetch: refetchSpotTrade } = useSpotTrade(!!active && isTradeView && !isFuturesMarket && !isDemoExchange);
  // "Show current" 켜짐 시 현재 종목만 표시
  const visiblePositions = showCurrentOnly
    ? mainTrade.positions.filter((p) => p.symbol === symbol)
    : mainTrade.positions;
  const visibleOrders = showCurrentOnly
    ? mainTrade.orders.filter((o) => o.symbol === symbol)
    : mainTrade.orders;
  // TP/SL 플랜(트리거) 주문 — 일반 미체결과 함께 Orders 탭에 표시
  const visiblePlanOrders = showCurrentOnly
    ? mainTrade.planOrders.filter((o) => o.symbol === symbol)
    : mainTrade.planOrders;
  // 현물 미체결도 동일 필터
  const visibleSpotOrders = showCurrentOnly
    ? spotTrade.orders.filter((o) => o.symbol === symbol)
    : spotTrade.orders;
  
  // 우측 거래 내역 사이드 탭 상태
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [symbolSheetOpen, setSymbolSheetOpen] = useState(false); // 종목명 탭 → 종목 선택 시트
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [trades, setTrades] = useState<TradeLog[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoadingTrades(true);
    // 통합 워커의 체결 이력 영속화는 아직 미구현이다.
    // 기존 7개 단일 봇 API는 DeepSeek 통합 워커 체계에서 거래탭 표시 소스로 쓰지 않는다.
    setTrades([]);
    setLoadingTrades(false);
  }, []);

  // 종목 헤더 아래 콘텐츠를 당겨서 새로고침. 호가창은 WS 실시간이라 자동이고,
  // 포지션·미체결(②③) 실데이터 연결 후 여기서 재조회를 트리거한다.
  const handleTradeRefresh = useCallback(async () => {
    await (isFuturesMarket ? refetchMainTrade() : refetchSpotTrade());
  }, [isFuturesMarket, refetchMainTrade, refetchSpotTrade]);

  useEffect(() => {
    if (isHistoryOpen) {
      fetchTrades();
      const intervalId = setInterval(fetchTrades, 10000);
      return () => clearInterval(intervalId);
    }
  }, [isHistoryOpen, fetchTrades]);

  // 사이드바(거래 내역) 열림 상태에 따라 뒷 배경 스크롤 방지
  useEffect(() => {
    if (isHistoryOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHistoryOpen]);

  // 필터가 적용된 최근 내역
  const displayTrades = trades.filter(t => outcomeFilter === 'ALL' || t.outcome === outcomeFilter);

  // ── 호가창(비트겟 merge-depth 폴링, 선택 단위로 서버 합산) ──
  // 트레이드 뷰 + 비트겟 지원 종목일 때만 폴링(미지원 종목 merge-depth 400 방지, Bot 뷰에선 불필요)
  // clearOnChange=false: 종목/마켓 전환 시 빈 호가 대신 이전 호가를 유지하다 새 호가로 교체(아래 원자 커밋과 세트)
  const orderbook = useOrderbook(symbol, depthScale, isFuturesMarket, !!active && isTradeView && tradable && !isDemoExchange, 'BITGET', false); // 선물=mix / 현물=spot
  // 펀딩비(선물 전용) — Bitget current-fund-rate 조회 + 1초 카운트다운
  const fundingStr = useFundingRate(symbol, !!active && isTradeView && isFuturesMarket && tradable && !isDemoExchange);
  // 현물 보유자산 평가용 실시간가 — 하단 Holdings 카드. 현금(USDT/USDC) 제외.
  const spotHoldingSymbols = !isFuturesMarket
    ? spotTrade.holdings.filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC').map((h) => `${h.coin}USDT`)
    : [];
  const spotHoldingPrices = useRealtimePrices(spotHoldingSymbols, false); // 현물 보유 평가 — 현물 티커
  const spotPriceOf = (coin: string) => (coin === 'USDT' || coin === 'USDC' ? 1 : spotHoldingPrices[`${coin}USDT`] ?? 0);
  // 하단 Holdings 상세카드는 코인만 — 현금(USDT/USDC)은 손익 개념이 없어 제외(총자산/원금엔 포함, 자산탭서 별도).
  const spotCoinHoldings = spotTrade.holdings.filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC');
  // 현물은 "100"(scale3) 미지원 → 선택돼 있으면 한 단계 낮춰 호가 깨짐 방지.
  useEffect(() => {
    if (!isFuturesMarket && depthScale === 'scale3') setDepthScale('scale2');
  }, [isFuturesMarket, depthScale]);
  const [costEditHolding, setCostEditHolding] = useState<SpotHolding | null>(null); // 매수평균가 입력 시트 대상

  // 다른 탭(차트 등)으로 이동하면 열린 시트 전부 닫는다. OrderPage는 visitedRoutes로
  // 계속 마운트돼 있어, 시트를 연 채 나가면 isOpen이 true로 남아 스크롤락(body fixed)이
  // 풀리지 않고 차트 등 다른 화면 레이아웃을 망가뜨림.
  useEffect(() => {
    if (active) return;
    setTabEditOpen(false);
    setExchangeSheetOpen(false);
    setSymbolSheetOpen(false);
    setDepthSheetOpen(false);
    setIsHistoryOpen(false);
    setCostEditHolding(null);
  }, [active]);
  const symbolDecimals = getTickDecimals(symbol); // 심볼 기본 소수점(=최소 틱). BTC 1, ETH 2
  const scaleIndex = Number(depthScale.replace('scale', ''));
  // 단위 선택지: 심볼마다 [틱, 틱×10, 틱×100, 틱×1000].
  // 현물은 최상단(scale3="100") 제외 — +1 시프트하면 Bitget scale4가 되는데 미지원(BTC 등)이라.
  const depthScaleSteps = isFuturesMarket ? [0, 1, 2, 3] : [0, 1, 2];
  const depthOptions = depthScaleSteps.map((i) => ({
    scale: `scale${i}` as DepthPrecision,
    label: depthLabelFor(i, symbolDecimals),
  }));
  const depthLabel = depthOptions.find((o) => o.scale === depthScale)?.label ?? '';
  // 호가 행 소수점 = 현재 선택 단위 따라(틱×10^i). 가운데 현재가는 심볼 고정.
  const obDecimals = Math.max(0, symbolDecimals - scaleIndex);
  const fmtMid = useCallback(
    (p: number) =>
      p.toLocaleString('en-US', {
        minimumFractionDigits: symbolDecimals,
        maximumFractionDigits: symbolDecimals,
      }),
    [symbolDecimals]
  );
  const askLevels = orderbook ? orderbook.asks.slice(0, 6) : [];
  const bidLevels = orderbook ? orderbook.bids.slice(0, 6) : [];
  const maxLevelSize = Math.max(
    1,
    ...askLevels.map(l => l.size),
    ...bidLevels.map(l => l.size)
  );
  const askRows = [...askLevels].reverse(); // 최우선 매도가가 현재가 근처(아래)에 오도록
  const bidRows = bidLevels;
  const bestAsk = orderbook?.asks[0]?.price;
  const bestBid = orderbook?.bids[0]?.price;
  const midPrice =
    bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid;
  // 이 호가가 "현재 종목" 것인지(clearOnChange=false라 전환 직후엔 이전 종목 호가가 남아 있음)
  const obCurrent = orderbook?.key === `BITGET|${symbol}|${isFuturesMarket}`;
  // 가운데 현재가: 실시간 시세 우선(그룹 단위 무관·심볼 고정 소수점). 없으면 "현재 종목" 호가 중간값 폴백.
  const centerPrice = realtimePrices[symbol] ?? (obCurrent ? midPrice : undefined);
  // 현재가 등락 방향(직전 틱 대비): 상승 초록 / 하락 빨강 / 보합 흰색.
  // 변동 후 FLAT_RESET_MS 동안 추가 변동 없으면 보합(흰색)으로 되돌림(비트겟 동작).
  const FLAT_RESET_MS = 1500;
  const prevPriceRef = useRef<number | null>(null);
  const flatTimerRef = useRef<number | undefined>(undefined);
  const [priceDir, setPriceDir] = useState<'up' | 'down' | 'flat'>('flat');
  useEffect(() => {
    if (centerPrice == null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = centerPrice;
    if (prev == null || centerPrice === prev) return;
    setPriceDir(centerPrice > prev ? 'up' : 'down');
    if (flatTimerRef.current) window.clearTimeout(flatTimerRef.current);
    flatTimerRef.current = window.setTimeout(() => setPriceDir('flat'), FLAT_RESET_MS);
  }, [centerPrice]);
  useEffect(() => () => { if (flatTimerRef.current) window.clearTimeout(flatTimerRef.current); }, []);
  const askVol = askLevels.reduce((s, l) => s + l.size, 0);
  const bidVol = bidLevels.reduce((s, l) => s + l.size, 0);
  const buyPct = askVol + bidVol > 0 ? Math.round((bidVol / (askVol + bidVol)) * 100) : 50;

  // ── 호가 원자 커밋(웹 obRef 패턴) ─────────────────────────
  // 현재 종목의 호가가 완전히 도착한 프레임에만 표시 스냅샷(행/소수점/비율)을 한 번에 교체.
  // 종목·마켓 전환 직후엔 이전 스냅샷을 유지 → 빈 호가·행 밀림·소수점 섞임 없이 전환된다.
  const obSnapRef = useRef<{
    askRows: typeof askRows; bidRows: typeof bidRows;
    maxLevelSize: number; obDecimals: number; buyPct: number;
  } | null>(null);
  if (obCurrent && (askRows.length > 0 || bidRows.length > 0)) {
    obSnapRef.current = { askRows, bidRows, maxLevelSize, obDecimals, buyPct };
  }
  const obSnap = obSnapRef.current;
  const obShowDecimals = obSnap?.obDecimals ?? obDecimals;
  const fmtPriceOb = useCallback(
    (p: number) =>
      p.toLocaleString('en-US', {
        minimumFractionDigits: obShowDecimals,
        maximumFractionDigits: obShowDecimals,
      }),
    [obShowDecimals]
  );

  return (
    <main className="trade-page">
      {/* 1. 최상단 카테고리 탭바 */}
      <header className="trade-market-tabs" ref={tabsRef}>
        <div className="tabs-scroll-container">
          {/* 유저가 정한 순서대로 렌더. 선물 미지원 거래소(업비트/빗썸)는 Futures를
              회색 비활성으로 유지(숨기면 자리가 밀려 어색 → 자리 고정 + 클릭만 차단). */}
          {tabOrder.map((tab) => {
            const disabled = tab === 'futures' && !exchangeSupportsFutures;
            return (
              <button
                key={tab}
                data-tab={tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => !disabled && switchMarket(tab)}
                disabled={disabled}
                style={disabled ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
              >{TAB_LABELS[tab]}</button>
            );
          })}
        </div>
        {/* 탭 라인 오른쪽 끝 "+": 탭 순서 편집 시트 오픈 */}
        <button
          type="button"
          className="trade-tab-edit-btn"
          onClick={() => setTabEditOpen(true)}
          aria-label="탭 순서 편집"
          style={{ flex: '0 0 auto', background: 'none', border: 'none', color: '#848e9c', fontSize: 22, lineHeight: 1, padding: '0 2px 4px', cursor: 'pointer' }}
        >+</button>
      </header>

      <div style={{ display: isTradeView ? 'block' : 'none', height: '100%', overflowX: 'clip', position: 'relative' }}>
        {/* 나가는 화면 스냅샷(ghost) — 새 화면과 같이 옆으로 빠져나감 */}
        {slide && (
          <div
            className={`trade-pane trade-pane-ghost ${slide.dir === 'right' ? 'exit-left' : 'exit-right'}`}
            dangerouslySetInnerHTML={{ __html: slide.html }}
            onAnimationEnd={() => setSlide(null)}
          />
        )}
        {/* 들어오는 실제 화면 — Spot=오른쪽에서, Futures=왼쪽에서 */}
        <div
          ref={paneRef}
          key={activeTab}
          className={`trade-pane ${slide ? (slide.dir === 'right' ? 'enter-right' : 'enter-left') : ''}`}
        >
          {activeTab === 'stock' ? (
            /* 주식 탭 — 준비 중 placeholder (실데이터·연동은 향후) */
            <div className="trade-unsupported">
              <p className="trade-unsupported-title">주식 거래는 준비 중이에요.<br />곧 만나요 📈</p>
            </div>
          ) : (
          <>
          {/* 3. 심볼 표시 영역 — 선물/현물 공유 헤더 (마켓은 톱 탭이 결정) */}
          <TradeSymbolHeader
            symbol={isDemoExchange ? demoSym : symbol}
            market={isFuturesMarket ? 'futures' : 'spot'}
            changePct="-2.30%"
            exchange={tradeExchange}
            onSymbolClick={() => setSymbolSheetOpen(true)}
            onExchangeClick={() => setExchangeSheetOpen(true)}
            mmr={isFuturesMarket ? mainTrade.positions.find((p) => p.symbol === symbol)?.mmr : undefined}
          />

          {isDemoExchange ? (
            /* Bitget 외 거래소 — 실거래 미연동(데모). 더미 호가창 표시. */
            <DemoTradeView exchange={tradeExchange} symbol={demoSym} market={isFuturesMarket ? 'futures' : 'spot'} />
          ) : !tradable ? (
            /* 비트겟 미지원 종목 — 호가·주문 대신 안내(종목명 헤더는 위에 그대로) */
            <div className="trade-unsupported">
              <p className="trade-unsupported-title">
                {symbol}는 Bitget {isFuturesMarket ? '선물' : '현물'}에서<br />거래를 지원하지 않습니다.
              </p>
              <button type="button" className="trade-unsupported-btn" onClick={() => setSymbolSheetOpen(true)}>
                다른 종목 선택
              </button>
            </div>
          ) : (
          /* 종목 헤더 아래 콘텐츠(호가·주문 + 포지션)를 당겨서 새로고침 */
          <PullToRefresh onRefresh={handleTradeRefresh}>
          {/* 4. 2열 그리드 본문 */}
          <section className="trade-grid">
            {/* 좌측: 조회 전용 현황 패널(주문 티켓 대체) — 현물/선물 */}
            {!isFuturesMarket ? (
              <SpotAccountSummary
                holdings={spotTrade.holdings}
                usdtAvailable={spotTrade.usdtAvailable}
                hasKey={spotTrade.hasKey}
                onOpenChart={onOpenChart}
              />
            ) : (
              <TradeAccountSummary
                equity={mainTrade.equity}
                available={mainTrade.available}
                hasKey={mainTrade.hasKey}
                positions={mainTrade.positions}
                onOpenChart={onOpenChart}
              />
            )}

            {/* 우측: 오더북 (Orderbook) — 선물/현물 공유 컴포넌트 */}
            <TradeOrderbook
              askRows={obSnap?.askRows ?? askRows}
              bidRows={obSnap?.bidRows ?? bidRows}
              maxLevelSize={obSnap?.maxLevelSize ?? maxLevelSize}
              fmtPrice={fmtPriceOb}
              fmtMid={fmtMid}
              centerPrice={centerPrice}
              priceDir={priceDir}
              buyPct={obSnap?.buyPct ?? buyPct}
              depthLabel={depthLabel}
              onOpenDepthSheet={() => setDepthSheetOpen(true)}
              funding={isFuturesMarket ? (fundingStr || '—') : undefined}
            />
          </section>

          {/* 5. 하단 포지션/주문 현황 영역 */}
          <section className="positions-panel">
            {/* 종목 헤더 아래에 함께 고정되는 헤더 스택(탭줄 + Show current/Close all). 그 밑으로 목록만 스크롤 */}
            <div className="positions-header">
            <div className="position-tabs">
              <button 
                className={positionActiveTab === 'positions' ? 'active' : ''} 
                onClick={() => setPositionActiveTab('positions')}
              >
                {isFuturesMarket ? 'Positions' : 'Holdings'}({isFuturesMarket ? visiblePositions.length : spotCoinHoldings.length})
              </button>
              <button
                className={positionActiveTab === 'orders' ? 'active' : ''}
                onClick={() => setPositionActiveTab('orders')}
              >
                Orders({isFuturesMarket ? visibleOrders.length + visiblePlanOrders.length : visibleSpotOrders.length}) <span className="tab-arrow-down">▾</span>
              </button>
              {/* 거래내역 — 채운 시계(바늘만 공백). 탭 줄 우측 끝(거터)에 정렬 */}
              <button className="tabs-history-btn" aria-label="거래내역" onClick={() => setIsHistoryOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 Z M10.8 7 H13.2 V10.8 H16.8 V13.2 H10.8 Z" />
                </svg>
              </button>
            </div>

            <div className="position-tools">
              <label className="show-current-label">
                <input
                  type="checkbox"
                  checked={showCurrentOnly}
                  onChange={(e) => setShowCurrentOnly(e.target.checked)}
                />
                <span className="checkbox-dummy" />
                Show current
              </label>
            </div>
            </div>

            {/* 헤더(스냅 고정) 아래 콘텐츠만 영역 내부 스크롤 — 포지션 많을 때만 스크롤 */}
            <div className="positions-scroll">
            {/* Positions 탭 (선물) — 실데이터 있으면 행, 없으면 빈 상태 */}
            {positionActiveTab === 'positions' && isFuturesMarket && (
              visiblePositions.length > 0 ? (
                <div className="position-list">
                  {visiblePositions.map((p) => (
                    <PositionCard key={p.symbol + p.direction} position={p} onOpen={() => onSelectSymbol?.(p.symbol)} />
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    {/* 입체적인 다크 폴더/서류철 아이콘 */}
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                      <rect x="22" y="32" width="20" height="2" rx="1" fill="#2C313C" />
                      <rect x="26" y="38" width="12" height="2" rx="1" fill="#2C313C" />
                    </svg>
                  </div>
                  <p className="available-balance-text">Available: {mainTrade.available.toFixed(4)} USDT</p>
                  <p className="description-text">
                    {mainTrade.hasKey ? 'No open positions' : 'MAIN 키를 등록하면 실시간 포지션이 표시됩니다.'}
                  </p>

                  <div className="empty-action-buttons">
                    <button type="button" className="empty-action-btn">Copy/Bot</button>
                    <button type="button" className="empty-action-btn">Demo trading</button>
                    <button type="button" className="empty-action-btn">Futures Kickoff</button>
                  </div>
                </div>
              )
            )}

            {/* Holdings 탭 (현물 보유자산) */}
            {positionActiveTab === 'positions' && !isFuturesMarket && (
              spotCoinHoldings.length > 0 ? (
                <div className="position-list">
                  {(() => {
                    const totalValue = spotTrade.holdings.reduce(
                      (s, h) => s + (h.available + h.frozen) * spotPriceOf(h.coin), 0);
                    return [...spotCoinHoldings]
                      .sort((a, b) => (b.available + b.frozen) * spotPriceOf(b.coin) - (a.available + a.frozen) * spotPriceOf(a.coin))
                      .map((h) => (
                        <SpotHoldingCard
                          key={h.coin}
                          holding={h}
                          price={spotPriceOf(h.coin)}
                          weight={totalValue > 0 ? ((h.available + h.frozen) * spotPriceOf(h.coin)) / totalValue * 100 : 0}
                          onOpen={() => onSelectSymbol?.(`${h.coin}USDT`)}
                          onEditCost={() => setCostEditHolding(h)}
                        />
                      ));
                  })()}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="available-balance-text">Available: {spotTrade.usdtAvailable.toFixed(4)} USDT</p>
                  <p className="description-text">
                    {spotTrade.hasKey ? 'No spot holdings' : 'MAIN 키를 등록하면 현물 보유자산이 표시됩니다.'}
                  </p>
                </div>
              )
            )}

            {/* Orders 탭 (선물) — 미체결 주문 */}
            {positionActiveTab === 'orders' && isFuturesMarket && (
              (visiblePlanOrders.length + visibleOrders.length) > 0 ? (
                <div className="order-list">
                  {/* TP/SL 플랜(트리거) 주문 — Bitget 미체결 카드 디자인 */}
                  {visiblePlanOrders.map((o) => (
                    <PlanOrderCard
                      key={o.orderId}
                      order={o}
                      leverage={mainTrade.positions.find((p) => p.symbol === o.symbol)?.leverage}
                      marginMode={mainTrade.positions.find((p) => p.symbol === o.symbol)?.marginMode}
                      onOpen={onOpenChart}
                    />
                  ))}
                  {/* 일반 지정가·시장가 미체결 */}
                  {visibleOrders.map((o) => (
                    <div className="position-row" key={o.orderId}>
                      <div className="pos-row-top">
                        <span className={`pos-side ${o.side === 'buy' ? 'long' : 'short'}`}>
                          {o.side === 'buy' ? 'Buy' : 'Sell'}{o.tradeSide ? ` · ${o.tradeSide}` : ''}
                        </span>
                        <span className="pos-symbol">{o.symbol}</span>
                        <span className="pos-lev">{o.orderType}</span>
                      </div>
                      <div className="pos-row-grid">
                        <div className="pos-cell">
                          <span className="k">Price</span><span className="v">{fmtAcctPrice(o.price)}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Amount</span><span className="v">{o.size}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Filled</span><span className="v">{o.filledQty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="description-text">No open orders</p>
                </div>
              )
            )}

            {/* Orders 탭 (현물) — 미체결 주문 */}
            {positionActiveTab === 'orders' && !isFuturesMarket && (
              visibleSpotOrders.length > 0 ? (
                <div className="order-list">
                  {visibleSpotOrders.map((o) => (
                    <div className="position-row" key={o.orderId}>
                      <div className="pos-row-top">
                        <span className={`pos-side ${o.side === 'buy' ? 'long' : 'short'}`}>
                          {o.side === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                        <span className="pos-symbol">{o.symbol}</span>
                        <span className="pos-lev">{o.orderType}</span>
                      </div>
                      <div className="pos-row-grid">
                        <div className="pos-cell">
                          <span className="k">Price</span><span className="v">{fmtAcctPrice(o.price)}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Amount</span><span className="v">{o.size}</span>
                        </div>
                        <div className="pos-cell">
                          <span className="k">Filled</span><span className="v">{o.filledQty}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="positions-empty-state">
                  <div className="folder-icon-wrapper">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                      <path d="M8 12C8 9.79086 9.79086 8 12 8H24L30 16H52C54.2091 16 56 17.7909 56 20V52C56 54.2091 54.2091 56 52 56H12C9.79086 56 8 54.2091 8 52V12Z" fill="#1C1E22" />
                      <path d="M12 20H52V52H12V20Z" fill="#242830" />
                      <path d="M16 26H48V46H16V26Z" fill="#14161B" />
                    </svg>
                  </div>
                  <p className="description-text">No open orders</p>
                </div>
              )
            )}
            </div>
          </section>
          </PullToRefresh>
          )}
          </>
          )}

        </div>
      </div>

      {/* 8. 거래 내역 우측 사이드 탭 */}
      <div 
        className={`side-drawer-overlay ${isHistoryOpen ? 'open' : ''}`} 
        onClick={() => setIsHistoryOpen(false)}
      />
      <div className={`side-drawer ${isHistoryOpen ? 'open' : ''}`}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: '800' }}>
            거래내역
          </h3>
          <button 
            onClick={() => setIsHistoryOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#8e929a',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {([
            {
              value: outcomeFilter,
              onChange: (v: string) => setOutcomeFilter(v),
              isActive: outcomeFilter !== 'ALL',
              options: [
                { value: 'ALL', label: '전체 결과' },
                { value: '진입', label: '진입' },
                { value: '취소', label: '취소' },
                { value: 'tp', label: 'TP' },
                { value: 'sl1', label: 'SL1' },
                { value: 'sl2', label: 'SL2' },
                { value: 'timeout', label: '타임아웃' },
              ],
            },
          ] as const).map((f, i) => (
            <div key={i} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={f.value}
                onChange={(e) => f.onChange(e.target.value)}
                style={{
                  appearance: 'none', WebkitAppearance: 'none',
                  background: f.isActive ? 'rgba(49,130,246,0.08)' : '#16181d',
                  color: f.isActive ? '#3182f6' : '#8b95a1',
                  border: f.isActive ? '1px solid rgba(49,130,246,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '20px', padding: '5px 28px 5px 12px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', outline: 'none',
                }}
              >
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <svg
                style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                width="8" height="5" viewBox="0 0 8 5" fill="none"
              >
                <path d="M1 1L4 4L7 1" stroke={f.isActive ? '#3182f6' : '#8b95a1'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          ))}
        </div>

        {/* 목록 스크롤 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {loadingTrades && trades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8e929a' }}>
              내역을 불러오는 중...
            </div>
          ) : displayTrades.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#58606c', fontSize: '14px' }}>
              최근 체결 내역이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {displayTrades.map((t, i) => {
                const isWin = t.pnlPct >= 0;
                const isEntry = t.outcome === '진입';
                const isCancel = t.outcome === '취소';
                const isNoResult = isEntry || isCancel;

                return (
                  <div
                    key={i}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      padding: '12px 2px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    {/* 상단: 봇 이름 + 종목 + 방향 + PnL */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="sub-account-badge bot3" style={{ fontSize: '9px', padding: '1px 4px' }}>
                          {t.botName || 'Worker'}
                        </span>
                        <strong style={{ fontWeight: '700', color: '#fff', fontSize: '14px' }}>
                          {t.symbol.replace('USDT', '')}
                        </strong>
                        <span style={{
                          fontSize: '9px', fontWeight: '700',
                          color: t.direction === 'long' ? '#0ecb81' : '#f6465d',
                          background: t.direction === 'long' ? 'rgba(14, 203, 129, 0.1)' : 'rgba(246, 70, 93, 0.1)',
                          padding: '2px 4px', borderRadius: '2px', marginLeft: '4px'
                        }}>
                          {t.direction === 'long' ? 'Long' : 'Short'}
                        </span>
                      </div>
                      <div style={{ fontWeight: '800', fontSize: '14px', color: isNoResult ? '#8e929a' : (isWin ? '#0ecb81' : '#f6465d') }}>
                        {isNoResult ? '—' : `${isWin ? '+' : ''}${t.pnlPct.toFixed(3)}%`}
                      </div>
                    </div>

                    {/* 중간 가격 정보 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#8e929a', borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: '8px' }}>
                      <div>
                        <span style={{ color: '#58606c', marginRight: '4px' }}>{isCancel ? '주문가:' : '진입가:'}</span>
                        <span style={{ color: '#edf1f7', fontWeight: '500' }}>{t.entryPrice.toFixed(4)}</span>
                      </div>
                      {!isNoResult && (
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#58606c', marginRight: '4px' }}>청산가:</span>
                          <span style={{ color: '#edf1f7', fontWeight: '500' }}>{t.exitPrice.toFixed(4)}</span>
                        </div>
                      )}
                    </div>

                    {/* 하단: 결과 라벨 + 시간 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#58606c', marginTop: '2px' }}>
                      <span style={{
                        color: isEntry ? '#0ecb81' : isCancel ? '#8e929a' : t.outcome === 'tp' ? '#0ecb81' : t.outcome?.startsWith('sl') ? '#f6465d' : '#8e929a',
                        fontWeight: '600'
                      }}>
                        {outcomeLabel(t.outcome)}
                      </span>
                      <span>{fmt(t.exitTime)} ({ago(t.exitTime)})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* 종목명 탭 → 종목 선택 시트 (비트겟 전용, Spot/Futures 필터). 선택 시 종목 + 마켓 탭 전환 */}
      <TradeSymbolSheet
        isOpen={symbolSheetOpen}
        onClose={() => setSymbolSheetOpen(false)}
        initialMarket={isFuturesMarket ? 'futures' : 'spot'}
        exchange={tradeExchange}
        onSelect={(sym, mkt, ex) => {
          // 거래소·마켓 전환 + 종목 선택. 차트 거래소(트레이드 정책)는 위 active 게이팅 effect가 일괄 적용.
          setTradeExchange(ex);
          setActiveTab(mkt);
          if (ex === 'BITGET') {
            setDemoSymbol('');
            onSelectSymbol?.(sym);
          } else {
            // 데모 거래소: 더미 호가창에 쓸 종목만 로컬 보관(전역 심볼 미전파).
            setDemoSymbol(sym);
            if (ex === 'BINANCE') onSelectSymbol?.(sym); // 바이낸스는 USDT 심볼이라 전역과 호환
          }
          setSymbolSheetOpen(false);
        }}
      />

      {/* 탭 순서 편집 바텀시트 — 탭 라인 "+"에서 오픈 */}
      <TradeTabEditSheet
        isOpen={tabEditOpen}
        order={tabOrder}
        onReorder={applyTabOrder}
        onClose={() => setTabEditOpen(false)}
      />

      {/* 거래소 선택 바텀시트 — 헤더 거래소 배지(▾)에서 오픈 */}
      <TradeExchangeSheet
        isOpen={exchangeSheetOpen}
        current={tradeExchange}
        onSelect={(ex) => { setTradeExchange(ex); setDemoSymbol(''); }}
        onClose={() => setExchangeSheetOpen(false)}
      />

      {/* 호가 단위(묶음) 선택 바텀시트 — 비트겟 Order book depth */}
      <DepthSheet
        open={depthSheetOpen}
        options={depthOptions}
        current={depthScale}
        onSelect={setDepthScale}
        onClose={() => setDepthSheetOpen(false)}
      />

      {/* 현물 매수평균가 직접 입력 시트 (조회불가/수동값 편집) */}
      {costEditHolding && (
        <SpotCostSheet
          holding={costEditHolding}
          price={spotPriceOf(costEditHolding.coin)}
          onClose={() => setCostEditHolding(null)}
          onSaved={() => { setCostEditHolding(null); refetchSpotTrade(); }}
        />
      )}
    </main>
  );
}
