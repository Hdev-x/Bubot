import { useEffect, useRef, useState } from 'react';
import BottomTabBar, { type AppRoute } from './components/BottomTabBar';
import AssetsPage from './pages/AssetsPage';
import CoinChartPage from './pages/CoinChartPage';
import CoinListPage from './pages/CoinListPage';
import OrderPage from './pages/OrderPage';
import StrategyComingSoon from './components/StrategyComingSoon';
import LoginPage from './pages/LoginPage';
import { getToken } from './api/client';
import { fetchMe, logout as authLogout, type AuthUser } from './api/server/authApi';
import { prefetchBitgetSymbols } from './api/exchange/bitget/bitgetSymbols';
import { prefetchBinanceSymbols } from './api/exchange/binance/binanceSymbols';
import { useDocumentVisible } from './hooks/ui/usePageVisible';
import { useRealtimeTickers } from './hooks/market/useRealtimePrices';

function getRoute(hash: string): AppRoute {
  const path = hash.replace(/^#/, '');
  if (path === '/chart' || path === '/orders' || path === '/strategy' || path === '/assets') {
    return path as AppRoute;
  }

  return '/';
}

export default function App() {
  // 인증 상태: checking(토큰 확인 중) → user 있음(앱) / 없음(로그인 화면)
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // 앱 로딩 시 저장된 토큰 유효성 확인.
    // 서버 순단(배포 중 재기동 등)으로 실패했지만 토큰이 살아 있으면(401/403 아님)
    // 짧게 재시도해 순단을 흡수 — 멀쩡한 세션이 로그인 화면으로 떨어지는 것 방지.
    let cancelled = false;
    (async () => {
      let u = await fetchMe();
      if (!u && getToken()) {
        for (const delayMs of [1500, 4000]) {
          await new Promise((r) => setTimeout(r, delayMs));
          if (cancelled) return;
          u = await fetchMe();
          if (u || !getToken()) break; // 성공했거나 토큰이 진짜 무효(삭제됨)면 종료
        }
      }
      if (cancelled) return;
      setUser(u);
      setAuthChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);

  function handleLogout() {
    authLogout();
    setUser(null);
  }

  const [route, setRoute] = useState<AppRoute>(() => getRoute(window.location.hash));
  // 앱이 보일 때만 true. 각 페이지 active = (현재 라우트) && visible → 화면 밖/백그라운드면 폴링·구독 정지.
  const visible = useDocumentVisible();
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedProductType, setSelectedProductType] = useState<string | undefined>('USDT-FUTURES');
  const [selectedExchange, setSelectedExchange] = useState<'BITGET' | 'BINANCE'>('BINANCE');
  const [selectedTickDecimals, setSelectedTickDecimals] = useState<number>(2);

  // 실시간 탭 타이틀 업데이트
  const isFutures = selectedProductType?.includes('FUTURES') ?? true;
  const tickers = useRealtimeTickers([selectedSymbol], isFutures);
  const currentTicker = tickers[selectedSymbol];

  useEffect(() => {
    if (selectedSymbol && currentTicker && currentTicker.price) {
      const formattedPrice = currentTicker.price.toLocaleString(undefined, {
        minimumFractionDigits: selectedTickDecimals,
        maximumFractionDigits: selectedTickDecimals
      });

      let rateStr = '';
      if (currentTicker.changeRate !== undefined) {
        const ratePercent = currentTicker.changeRate * 100;
        const sign = ratePercent > 0 ? '+' : '';
        // 스크린샷 요구사항: 등락률에 () 감싸고 화살표 제거 (예: (-0.61%) )
        rateStr = ` (${sign}${ratePercent.toFixed(2)}%)`;
      }
      document.title = `${selectedSymbol} ${formattedPrice}${rateStr}`;
    } else {
      document.title = 'Botz';
    }
  }, [selectedSymbol, currentTicker, selectedTickDecimals]);

  // 차트·마켓에서 트레이드 진입 시 현물/선물 마켓 지정(seq로 매번 재적용). 거래소는 항상 비트겟.
  const [tradeMarketReq] = useState<{ market: 'spot' | 'futures'; seq: number } | null>(null);

  const [visitedRoutes, setVisitedRoutes] = useState<Set<AppRoute>>(new Set([getRoute(window.location.hash)]));

  // 거래/자산/전략 탭바 공유 슬라이드 인디케이터 — 각 페이지가 활성 탭 위치(뷰포트 x,y)를 보고하면
  // App이 단일 바를 그 자리로 슬라이드시킨다(페이지 전환 시에도 바가 미끄러져 이동).
  const [tabBar, setTabBar] = useState<{ x: number; y: number } | null>(null);
  const showTabBar = (route === '/orders' || route === '/assets' || route === '/strategy') && tabBar !== null;

  useEffect(() => {
    // 트레이드 가용성 가드용 비트겟 심볼 + 차트 거래소 우선순위용 바이낸스 선물 심볼 미리 받기(즉시 판정)
    prefetchBitgetSymbols();
    prefetchBinanceSymbols();

    // iOS PWA 하단 탭바 붕 뜨는 버그(Ghost Safe Area) 강제 재계산
    if ((window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches) {
      const fixViewport = () => window.scrollTo(0, 0);
      setTimeout(fixViewport, 50);
      setTimeout(fixViewport, 300);
    }

    function syncRoute() {
      const nextRoute = getRoute(window.location.hash);
      setRoute(nextRoute);
      setVisitedRoutes(prev => new Set(prev).add(nextRoute));
    }

    // 모바일 기기(iOS/웹뷰)의 좌우 가장자리 뒤로가기/앞으로가기 스와이프 제스처 무력화
    let isEdgeTouch = false;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (touch) {
        // 좌측 끝 24px 이내 또는 우측 끝 24px 이내에서 터치 시작 시 플래그 켬
        if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
          isEdgeTouch = true;
        } else {
          isEdgeTouch = false;
        }
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (isEdgeTouch) {
        // 가장자리 터치 시작 후 움직일 때 브라우저 기본 내비게이션(뒤로가기 등) 차단
        e.preventDefault();
      }
    }

    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // 페이지를 display로만 토글하는 구조라 window.scrollY가 페이지 간에 공유된다.
  // 라우트별로 스크롤을 저장/복원해 "이전 페이지 스크롤이 남아 내려간 채 열리는" 튐을 막는다.
  // (처음 가는 페이지는 0에서 시작)
  const scrollPositionsRef = useRef<Partial<Record<AppRoute, number>>>({});
  const prevRouteRef = useRef(route);
  useEffect(() => {
    const prev = prevRouteRef.current;
    if (prev !== route) {
      scrollPositionsRef.current[prev] = window.scrollY;
      prevRouteRef.current = route;
    }
    const saved = scrollPositionsRef.current[route] ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, saved));
  }, [route]);

  function navigate(nextRoute: AppRoute) {
    if (nextRoute === route) {
      return;
    }

    window.location.hash = nextRoute === '/' ? '' : nextRoute;
    setRoute(nextRoute);
    setVisitedRoutes(prev => new Set(prev).add(nextRoute));
  }

  // 토큰 확인 중에는 빈 화면(깜빡임 방지)
  if (!authChecked) {
    return <div className="app-frame" style={{ background: '#0b0e11' }} />;
  }

  // 미로그인 → 로그인 화면만 노출 (탭/마켓/차트/거래/전략/자산 접근 차단)
  if (!user) {
    return (
      <div className="app-frame">
        <LoginPage onSuccess={setUser} />
      </div>
    );
  }

  return (
    <div className="app-frame">
      <div style={{ display: route === '/' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/') && <CoinListPage active={route === '/' && visible} selectedSymbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} onOpenChart={() => navigate('/chart')} onProductTypeChange={setSelectedProductType} onExchangeChange={setSelectedExchange} onTickDecimalsChange={setSelectedTickDecimals} onLogout={handleLogout} username={user.username} />}
      </div>
      <div style={{ display: route === '/chart' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/chart') && <CoinChartPage active={route === '/chart' && visible} symbol={selectedSymbol} onSelectSymbol={setSelectedSymbol} productType={selectedProductType} exchange={selectedExchange} tickDecimals={selectedTickDecimals} onExchangeChange={setSelectedExchange} onProductTypeChange={setSelectedProductType} focusTracker={null} />}
      </div>
      <div style={{ display: route === '/orders' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/orders') && <OrderPage symbol={selectedSymbol} active={route === '/orders' && visible} onSelectSymbol={setSelectedSymbol} onProductTypeChange={setSelectedProductType} onExchangeChange={setSelectedExchange} onOpenChart={() => navigate('/chart')} tradeMarketReq={tradeMarketReq} onTabBar={setTabBar} />}
      </div>
      <div style={{ display: route === '/strategy' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/strategy') && <StrategyComingSoon />}
      </div>
      <div style={{ display: route === '/assets' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/assets') && <AssetsPage active={route === '/assets' && visible} onTabBar={setTabBar} />}
      </div>

      {/* 거래/자산 공유 탭 인디케이터 — 페이지가 바뀌어도 같은 바가 새 활성탭 자리로 슬라이드 */}
      {showTabBar && tabBar && (
        <span style={{ position: 'fixed', left: 0, top: 0, width: 22, height: 3, borderRadius: 3, background: '#fff', zIndex: 25, pointerEvents: 'none', transform: `translate(${tabBar.x}px, ${tabBar.y}px)`, transition: 'transform 0.26s ease' }} />
      )}

      <BottomTabBar activeRoute={route} onNavigate={navigate} />
    </div>
  );
}
