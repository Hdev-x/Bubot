import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import PullToRefresh from '../components/PullToRefresh';
import { useMainTrade } from '../../../hooks/account/useMainTrade';
import { useSpotTrade } from '../../../hooks/account/useSpotTrade';
import TradeOrderbook from '../components/trade/TradeOrderbook';
import TradeSymbolHeader from '../components/trade/TradeSymbolHeader';
import TradeSymbolSheet from '../components/trade/TradeSymbolSheet';
import TradeExchangeSheet from '../components/trade/TradeExchangeSheet';
import DemoTradeView from '../components/trade/DemoTradeView';
import TradeTabEditSheet, { type TradeTab } from '../components/trade/TradeTabEditSheet';
import DepthSheet from '../components/trade/DepthSheet';
import { isFuturesSupported, isKrwExchange, type ExchangeId } from '../../../shared/constants/exchanges';
import TradeAccountSummary from '../components/trade/TradeAccountSummary';
import SpotAccountSummary from '../components/trade/SpotAccountSummary';
import SpotCostSheet from '../components/trade/SpotCostSheet';
import type { SpotHolding } from '../../../api/server/spotTradeApi';
import { isBitgetSymbolSupported } from '../../../api/exchange/bitget/bitgetSymbols';
import { resolveTradeChartTarget } from '../../../config/chartPolicy';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { useRealtimePrices } from '../../../hooks/market/useRealtimePrices';
import type { DepthPrecision } from '../../../api/exchange/bitget/bitgetMergeDepth';
import type { TradeLog } from '../../../shared/types/bot';
import TradeTabBar from '../components/trade/TradeTabBar';
import PositionsPanel from '../components/trade/PositionsPanel';
import TradeHistoryDrawer from '../components/trade/TradeHistoryDrawer';
import { useMobileOrderbook } from '../hooks/useMobileOrderbook';
import './OrderPage.css';

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

  // ── 호가창 — useMobileOrderbook (wp-07 d03): 폴링·펀딩·단위 옵션·현재가 방향·원자 커밋 ──
  const { askRows, bidRows, maxLevelSize, buyPct, centerPrice, priceDir, depthOptions, depthLabel, fmtMid, fmtPriceOb, fundingStr, obSnap } = useMobileOrderbook({
    symbol, active, isTradeView, isFuturesMarket, isDemoExchange, tradable, depthScale, setDepthScale, getTickDecimals, realtimePrices,
  });
  // 현물 보유자산 평가용 실시간가 — 하단 Holdings 카드. 현금(USDT/USDC) 제외.
  const spotHoldingSymbols = !isFuturesMarket
    ? spotTrade.holdings.filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC').map((h) => `${h.coin}USDT`)
    : [];
  const spotHoldingPrices = useRealtimePrices(spotHoldingSymbols, false); // 현물 보유 평가 — 현물 티커
  const spotPriceOf = (coin: string) => (coin === 'USDT' || coin === 'USDC' ? 1 : spotHoldingPrices[`${coin}USDT`] ?? 0);
  // 하단 Holdings 상세카드는 코인만 — 현금(USDT/USDC)은 손익 개념이 없어 제외(총자산/원금엔 포함, 자산탭서 별도).
  const spotCoinHoldings = spotTrade.holdings.filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC');
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

  return (
    <main className="trade-page">
      {/* 1. 최상단 카테고리 탭바 */}
      <TradeTabBar tabsRef={tabsRef} tabOrder={tabOrder} activeTab={activeTab} exchangeSupportsFutures={exchangeSupportsFutures} switchMarket={switchMarket} onEditTabs={() => setTabEditOpen(true)} />

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
          <PositionsPanel
            trade={{ mainTrade, spotTrade, visiblePositions, visibleOrders, visiblePlanOrders, visibleSpotOrders, spotCoinHoldings, spotPriceOf }}
            view={{ isFuturesMarket, positionActiveTab, setPositionActiveTab, showCurrentOnly, setShowCurrentOnly }}
            actions={{ onOpenChart, onSelectSymbol, setCostEditHolding, setIsHistoryOpen }}
          />
          </PullToRefresh>
          )}
          </>
          )}

        </div>
      </div>

      {/* 8. 거래 내역 우측 사이드 탭 */}
      <TradeHistoryDrawer
        isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)}
        trades={trades} displayTrades={displayTrades} loadingTrades={loadingTrades}
        outcomeFilter={outcomeFilter} setOutcomeFilter={setOutcomeFilter}
      />

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
