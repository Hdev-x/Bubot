import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../../api/server/authApi';
import { useCoinLogos } from './panels/marketShared';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { EXCHANGES } from '../../shared/constants/exchanges';
import { useMainTrade } from '../../hooks/account/useMainTrade';
import { useUsdKrw } from '../../hooks/market/useUsdKrw';
import { useRealtimePrices } from '../../hooks/market/useRealtimePrices';
import { useDelayedReady } from '../../hooks/ui/useDelayedReady';
import { PRESET_THEMES } from '../../chart/settings/ChartSettingsSheet';

import MarketChart from '../../chart/MarketChart';
import type { MarketChartRef } from '../../chart/MarketChart';
import type { TrackerState } from '../../shared/types/bot';
import { DrawingFloatBar, DrawingSettings } from './panels/DrawingToolbar';
import { RsiSettingsPanel } from './panels/RsiSettingsPanel';
import { DEFAULT_RSI_SETTINGS } from '../../shared/utils/rsiCandles';
import type { RsiSettings } from '../../shared/utils/rsiCandles';
import { usePersistentState } from '../../hooks/ui/usePersistentState';
import { useMtfCandles } from '../../chart/hooks/useMtfCandles';
import { DEFAULT_OB_OPTIONS } from '../../chart/analysis/chartIndicators';
import type { IndicatorLayer, TFKey, OBOptions } from '../../chart/overlays/ChartOverlay';
import SmcSection from '../../chart/indicators/SmcSection';
import HarmonicSection from '../../chart/indicators/HarmonicSection';
import AbcSection from '../../chart/indicators/AbcSection';
import MaSection from '../../chart/indicators/MaSection';
import BbSection from '../../chart/indicators/BbSection';
import PivotSection from '../../chart/indicators/PivotSection';
import ElliottSection from '../../chart/indicators/ElliottSection';
import TradeOrderbook from '../mobile/components/trade/TradeOrderbook';
import { useSpotTrade } from '../../hooks/account/useSpotTrade';
import type { MainPosition } from '../../api/server/mainTradeApi';
import type { SpotHolding } from '../../api/server/spotTradeApi';
import type { Candle } from '../../shared/types/market';
import { getIntervalSeconds, TF, UNSUPPORTED_TF } from './lib/timeframes';
import { fmtAsset } from './lib/format';
import { WEB_DRAW_TOOLS } from './lib/drawTools';
import { ObjectTree } from './panels/ObjectTree';
import { MiniCandles } from './panels/MiniCandles';
import { HeaderLogo, HdSk, Chevron } from './panels/SidebarBits';
import { DesktopHeader } from './panels/DesktopHeader';
import { IconRail } from './panels/IconRail';
import { Sidebar } from './panels/Sidebar';
import { type Section, type InvestTab } from './lib/sections';
import { useDesktopCandles } from './hooks/useDesktopCandles';
import { useOrderbookSnapshot } from './hooks/useOrderbookSnapshot';
import { useHeaderSnapshot } from './hooks/useHeaderSnapshot';
import { useDrawingState } from './hooks/useDrawingState';
import { useIndicatorState } from './hooks/useIndicatorState';
import { useChartViewState } from './hooks/useChartViewState';
import './DesktopApp.css';

// ── 데스크톱 웹 — 모바일 훅/컴포넌트를 그대로 재사용해 같은 데이터를 다룸(화면만 다름) ──
// 실데이터: 내 투자(선물=useMainTrade, 현물=useSpotTrade) · 호가(useOrderbook) · 차트(useCoinCandles)
//           · 마켓 리스트(useMarketTickers, BITGET 현물).
// 목업: 커뮤니티 채팅 / 헤더 검색(요청상 보류).

const CHATS = [
  { av: 'J', bg: '', nick: 'jordan_', time: '12:34', body: '64k 저항 강함. 음봉 시작' },
  { av: 'M', bg: '#3b3f4b', nick: 'marketmkr', time: '12:35', body: '63.5k 지지 봐야할듯' },
  { av: 'T', bg: '#5a3a3a', nick: 'trader.kr', time: '12:36', body: '롱 절반 익절 👍' },
  { av: 'H', bg: '#3a5a3a', nick: 'han.dev', time: '12:38', body: '데스크톱 화면 너무 좋다' },
  { av: 'D', bg: '#3a3a5a', nick: 'delta_', time: '12:40', body: 'FOMC 다음주라 변동성 주의' },
  { av: 'R', bg: '#5a4a2a', nick: 'ronin', time: '12:41', body: '차트 + 호가 + 채팅 한 화면 만족' },
] as const;

export default function DesktopApp({ user, onLoginClick, onLogout }: { user: AuthUser | null; onLoginClick: () => void; onLogout: () => void }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mountOpenRaf = useRef(0);
  // 새로고침 시 닫힌 상태로 1프레임 그린 뒤 열어 width 트랜지션(열림 모션)을 재생
  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setSidebarOpen(true));
      mountOpenRaf.current = r2;
    });
    mountOpenRaf.current = r1;
    return () => cancelAnimationFrame(mountOpenRaf.current);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // 로그인 시 내투자, 비로그인 시 공개 섹션(실시간 마켓)으로 시작
  const [section, setSection] = useState<Section>(user ? 'invest' : 'market');
  const [krw, setKrw] = useState(true);
  const [investTab, setInvestTab] = useState<InvestTab>('선물');
  const [walletOpen, setWalletOpen] = useState(false);
  const [portfolioOn, setPortfolioOn] = useState(true);
  const [positionsOn, setPositionsOn] = useState(true);
  const [selPosIdx, setSelPosIdx] = useState(0);
  // ── 차트 상태 훅 (wp-06 d04a): 드로잉 · 지표 · 보기. 툴바·무대 컴포넌트가 이 묶음을 그대로 받는다 ──
  const isAdmin = user?.role === 'ADMIN';
  const draw = useDrawingState();
  const { drawOpen, setDrawOpen, drawTool, setDrawTool, drawHistory, setDrawHistory, selDrawId, setSelDrawId, drawSettingsOpen, setDrawSettingsOpen, magnetOn, setMagnetOn, drawRef } = draw;
  const indi = useIndicatorState({ indiOff: !isAdmin });
  const { indiOpen, setIndiOpen, indiRef, indicatorSettings, setIndicatorSettings, maSettings, setMaSettings, bbSetting, setBbSetting, pivotSetting, setPivotSetting, effIndicatorSettings, effMaSettings, effBbSetting, effPivotSetting, indiGroups, toggleIndiGroup } = indi;
  const view = useChartViewState({ loggedIn: !!user });
  const { activeTf, setActiveTf, chartSetOpen, setChartSetOpen, chartSetRef, chartTheme, setChartTheme, effChartTheme, isCustomTheme, isLogScale, setIsLogScale, priceLineOn, setPriceLineOn } = view;
  // RSI 캔들 지표(하단 페인) 토글 + 설정 — 새로고침에도 유지
  const [rsiOn, setRsiOn] = usePersistentState('web_rsi_candles', false);
  // 신뢰도 랭킹 선(임시) — 마스터 + 체급별 토글
  const [rankMasterOn, setRankMasterOn] = usePersistentState('web_rank_lines', false);
  const [rankTiers, setRankTiers] = usePersistentState<Record<string, boolean>>('web_rank_tiers', { '1M': true, '1W': true, '3D': false, '1d': false });
  const [rsiSettings, setRsiSettings] = usePersistentState<RsiSettings>('web_rsi_settings', DEFAULT_RSI_SETTINGS);
  const [rsiSettingsOpen, setRsiSettingsOpen] = useState(false);
  const webChartRef = useRef<MarketChartRef>(null);

  // 현재 차트 화면 캡쳐 → PNG 다운로드 (캔들·지표·패턴·가격축·시간축 통째로)
  const handleCaptureChart = () => {
    const canvas = webChartRef.current?.captureImage();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
      a.href = url;
      a.download = `${CHART_SYMBOL}_${timeframe.value}_${stamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const bothOn = portfolioOn && positionsOn;

  // 프로필 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // 차트 드롭다운(그리기/지표/차트설정) 바깥 클릭 시 닫기
  useEffect(() => {
    if (!indiOpen && !chartSetOpen && !drawOpen) return;
    const onDown = (e: MouseEvent) => {
      if (indiRef.current && !indiRef.current.contains(e.target as Node)) setIndiOpen(false);
      if (chartSetRef.current && !chartSetRef.current.contains(e.target as Node)) setChartSetOpen(false);
      if (drawRef.current && !drawRef.current.contains(e.target as Node)) setDrawOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [indiOpen, chartSetOpen, drawOpen]);

  // ── 실데이터 — 총자산/포지션 (모바일과 동일 세션) ──
  const { data: trade } = useMainTrade(section === 'invest' && sidebarOpen);
  const usdKrw = useUsdKrw();
  const { hasKey, positions, available, equity } = trade;
  // 모바일과 동일: 데이터(equity>0) 도착 전까지 스켈레톤, 빈 계정은 1500ms 폴백
  const mainReady = useDelayedReady(equity > 0);
  const unrealTotal = positions.reduce((s, p) => s + p.unrealizedPl, 0);

  const curLabel = krw ? '원' : 'USDT';
  const mainVal = !hasKey ? '—' : krw ? Math.round(equity * usdKrw).toLocaleString() : fmtAsset(equity);
  const approx = !hasKey ? '' : krw
    ? `≈ ${fmtAsset(equity)} USDT`
    : `≈ ${Math.round(equity * usdKrw).toLocaleString()}원`;
  // 통화 연동 금액 포맷
  const fmtCur = (usdt: number) => krw
    ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
    : `${usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  const approxCur = (usdt: number) => krw
    ? `≈ ${usdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`
    : `≈ ${Math.round(usdt * usdKrw).toLocaleString()}원`;
  const selPos: MainPosition | undefined = positions[selPosIdx] ?? positions[0];

  // ── 차트/호가 선택 종목 (실시간 마켓 클릭 시 변경). 지원: BITGET/BINANCE/UPBIT/BITHUMB ──
  const [chartSel, setChartSel] = useState<{ symbol: string; exchange: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; isFutures: boolean }>({
    symbol: 'BTCUSDT', exchange: 'BINANCE', isFutures: true,
  });
  const CHART_SYMBOL = chartSel.symbol;
  const chartIsBinance = chartSel.exchange === 'BINANCE';
  const chartIsKrw = chartSel.exchange === 'UPBIT' || chartSel.exchange === 'BITHUMB';
  const chartIsFutures = chartSel.isFutures;

  // (탭 타이틀 effect는 pxDecimals 선언 뒤 — 차트 livePrice(전 거래소 WS) 기반으로 실시간 갱신)

  const CHART_PRODUCT = (chartIsFutures && !chartIsKrw) ? 'USDT-FUTURES' : undefined; // KRW 거래소는 현물만
  const chartBase = CHART_SYMBOL.replace(/USDT$|USDC$|KRW$/, '');
  const coinLogos = useCoinLogos(); // 백엔드 gecko 로고맵(실시간 마켓과 동일 소스)
  const handleSelectChart = useCallback((symbol: string, market: string, exchange: string) => {
    const ex = exchange as 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';
    setChartSel({ symbol, exchange: ex, isFutures: (ex === 'UPBIT' || ex === 'BITHUMB') ? false : market === 'futures' });
  }, []);

  // ── 모니터링 패턴 solo 포커스 ──
  // 클릭한 패턴만 원색, 나머지 흐림. TF 바꿔도 유지, 종목 바꾸거나 직접 끌 때만 해제.
  const [focusTracker, setFocusTracker] = useState<TrackerState | null>(null);
  const [soloActive, setSoloActive] = useState(false);
  // 사용자가 solo에서 수동으로 팬/줌한 시간범위(raw 캔들시간 도메인). TF 바뀔 때 이게 있으면
  // 패턴(X~D) 자동 프레이밍 대신 이 범위를 복원 — "움직인 위치가 고정되어 TF 넘어가도 유지".
  // 새 패턴 클릭·solo 종료 시 초기화(그 패턴은 기본 프레이밍부터 다시 시작).
  const soloUserViewRef = useRef<{ from: number; to: number } | null>(null);
  // 종목이 포커스 패턴과 달라지면(수동 종목 변경) 해제. TF 변경엔 안 풀림.
  useEffect(() => {
    if (soloActive && focusTracker && focusTracker.symbol !== CHART_SYMBOL) {
      setSoloActive(false);
      setFocusTracker(null);
      soloUserViewRef.current = null;
      webChartRef.current?.resetPriceAutoScale();
    }
  }, [CHART_SYMBOL, soloActive, focusTracker]);
  const soloOn = soloActive && focusTracker?.symbol === CHART_SYMBOL;
  const highlightTracker = soloOn ? focusTracker : null;
  const focusScrollKeyRef = useRef<string>('');

  // ── 실데이터 — 차트 캔들 + 호가 (useDesktopCandles → useOrderbookSnapshot 순서로 현재가를 넘긴다) ──
  const { timeframe, loadCandles, candles, livePrice, dailyOpenPrice, loadedSymbol, handleVisibleRangeChange } = useDesktopCandles({
    activeTf, symbol: CHART_SYMBOL, productType: CHART_PRODUCT, exchange: chartSel.exchange, isBinance: chartIsBinance, isFutures: chartIsFutures,
  });
  const [depthOpen, setDepthOpen] = useState(false); // 자릿수(묶음) 선택 드롭다운
  const { OB, obFmtPrice, obFmtMid, krwDec, getTickDecimals, depthScale, setDepthScale, depthSelectable, depthOptions, depthLabel, funding } = useOrderbookSnapshot({
    symbol: CHART_SYMBOL, exchange: chartSel.exchange, isFutures: chartIsFutures, isKrw: chartIsKrw, livePrice, loadedSymbol,
  });
  // solo 포커스: 그 패턴 TF에서 "한 단계 아래"까지만 TF 선택 허용 (drill-down 노이즈 방지)
  // 1D→4H / 4H→30m / 30m→5m / 1W→1D / 1M→1W. 범위=[하한 ~ 패턴TF] 인덱스 구간.
  const soloTfRange = useMemo<string[] | null>(() => {
    if (!soloOn || !focusTracker) return null;
    const kind = String((focusTracker as any).monitorKind ?? '');
    const patTf = kind.endsWith('_30m') ? '30m' : kind.endsWith('_4h') ? '4H'
      : kind.endsWith('_1d') ? '1D' : kind.endsWith('_1w') ? '1W' : kind.endsWith('_1M') ? '1M' : null;
    if (!patTf) return null;
    const lowerMap: Record<string, string> = { '30m': '5m', '4H': '30m', '1D': '4H', '1W': '1D', '1M': '1W' };
    const lo = TF.indexOf(lowerMap[patTf]); const hi = TF.indexOf(patTf);
    if (lo < 0 || hi < 0) return null;
    return TF.slice(lo, hi + 1);
  }, [soloOn, focusTracker]);
  // 거래소가 지원하는 TF만 노출 + (solo면) 패턴 drill-down 범위로 제한 + 현재 선택이 벗어나면 폴백
  const visibleTFs = TF.filter((t) =>
    !(UNSUPPORTED_TF[chartSel.exchange] ?? []).includes(t) && (!soloTfRange || soloTfRange.includes(t)));
  useEffect(() => {
    if (!visibleTFs.includes(activeTf)) setActiveTf(soloTfRange ? soloTfRange[soloTfRange.length - 1] : '1H');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartSel.exchange, soloTfRange]);

  // solo: 시간축 프레이밍 계산+적용을 한 함수로. 기본은 패턴 구간(X~D)으로 TF 바뀔 때마다 다시 맞춤
  // (같은 자리·크기 고정). 사용자가 solo에서 팬/줌해뒀으면(soloUserViewRef) 그 위치를 그대로 복원.
  // TF onClick에서 "동기적으로" 호출 → setActiveTf보다 먼저 focusRef가 세팅돼, 새 캔들이 로드되는
  // 순간 MarketChart 내부에서 바로 정위치로 그려짐(이펙트+RAF로 한 프레임 늦게 스냅되는 튐 방지).
  const frameForTf = useCallback((tf: string) => {
    if (!focusTracker) return;
    const x = (focusTracker as any).xabc;
    if (!x?.X) return;
    const key = `${(focusTracker as any).symbol}|${(focusTracker as any).signature ?? (focusTracker as any).obTime}|${tf}`;
    focusScrollKeyRef.current = key;
    if (soloUserViewRef.current) {
      const { from, to } = soloUserViewRef.current;
      webChartRef.current?.focusTimeWindow(from, to, 0);
      return;
    }
    const fromT = Number(x.X.time);
    const toT = Number((focusTracker as any).exitTime ?? (focusTracker as any).przHitTime ?? x.D?.time ?? x.C?.time ?? fromT);
    if (fromT && toT) webChartRef.current?.focusTimeWindow(fromT, toT, 0.3);
  }, [focusTracker]);
  // solo 진입 등 activeTf 변경 없이 focusTracker/candles가 바뀌는 케이스의 안전망(중복 시 key 일치로 no-op).
  useEffect(() => {
    if (!soloOn || !focusTracker) { focusScrollKeyRef.current = ''; return; }
    if (!candles.length) return;
    const key = `${(focusTracker as any).symbol}|${(focusTracker as any).signature ?? (focusTracker as any).obTime}|${activeTf}`;
    if (focusScrollKeyRef.current === key) return;
    frameForTf(activeTf);
  }, [soloOn, focusTracker, candles.length, activeTf, frameForTf]);

  // 차트 소수점도 "표시 중인 캔들(loadedSymbol)"과 함께만 바뀌게 스테이징 — 데이터보다 소수점이 먼저 바뀌어
  // 옛 캔들이 새 소수점으로 재포맷되며 가격축 폭이 흔들리는 것 방지. KRW는 원(정수)=0.
  const chartDecimalsTarget = chartIsKrw ? krwDec : getTickDecimals(CHART_SYMBOL);
  const chartDecimalsRef = useRef(chartDecimalsTarget);
  if (loadedSymbol === CHART_SYMBOL) chartDecimalsRef.current = chartDecimalsTarget;
  const chartTickDecimals = chartDecimalsRef.current;

  // 관심 미니 시세창 — hidden(숨김) / float(떠있는 창) / dock(왼쪽 사이드바). 비로그인은 관심 잠금이라 항상 숨김.
  const [watchMode, setWatchMode] = usePersistentState<'hidden' | 'float' | 'dock'>('web_watch_mode', 'hidden');
  const effWatchMode = user ? watchMode : 'hidden';
  // dock 슬라이드 애니메이션(사이드바처럼): dock이면 마운트→다음 프레임에 펼침, 벗어나면 접은 뒤 언마운트.
  const dockOpen = effWatchMode === 'dock';
  const [dockRender, setDockRender] = useState(dockOpen);
  const [dockExpanded, setDockExpanded] = useState(dockOpen);
  useEffect(() => {
    if (dockOpen) {
      setDockRender(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setDockExpanded(true)));
      return () => cancelAnimationFrame(id);
    }
    setDockExpanded(false);
    const t = setTimeout(() => setDockRender(false), 440); // width transition(0.42s) 후 언마운트
    return () => clearTimeout(t);
  }, [dockOpen]);

  const [obOptions] = useState<OBOptions>(DEFAULT_OB_OPTIONS);
  // atomic: 활성 TF 전부 로드 후 한번에 커밋 + 그 심볼(mtfSymbol) 반환. 표시 중인 차트(loadedSymbol)와 일치할 때만 그림.
  const { mtfCandles, mtfSymbol } = useMtfCandles(CHART_SYMBOL, effIndicatorSettings, loadCandles, true);

  const lastCandle = candles[candles.length - 1];
  // 크로스헤어가 가리키는 캔들의 OHLC (없으면 마지막 캔들)
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const ohlc = hoveredCandle ?? lastCandle;
  const pxDecimals = chartIsKrw ? krwDec : getTickDecimals(CHART_SYMBOL);
  const fmtPx = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: pxDecimals, maximumFractionDigits: pxDecimals }));

  // 브라우저 탭 타이틀 — 차트 현재가(livePrice, 전 거래소 WS)로 실시간 갱신.
  // 소수 자릿수는 차트 헤더와 동일한 종목별 정밀도(pxDecimals), 등락률도 헤더와 동일 기준(일봉시가).
  useEffect(() => {
    if (CHART_SYMBOL && livePrice != null) {
      const formattedPrice = livePrice.toLocaleString('en-US', {
        minimumFractionDigits: pxDecimals,
        maximumFractionDigits: pxDecimals
      });
      let rateStr = '';
      if (dailyOpenPrice != null && dailyOpenPrice !== 0) {
        const ratePercent = ((livePrice - dailyOpenPrice) / dailyOpenPrice) * 100;
        const sign = ratePercent > 0 ? '+' : '';
        rateStr = ` (${sign}${ratePercent.toFixed(2)}%)`;
      }
      const p = chartIsFutures ? '.P' : '';
      document.title = `${CHART_SYMBOL}${p} ${formattedPrice}${rateStr}`;
    } else {
      document.title = 'Botz';
    }
  }, [CHART_SYMBOL, livePrice, dailyOpenPrice, chartIsFutures, pxDecimals]);

  // ── 헤더 정보·통합 스냅샷(H) — useHeaderSnapshot ──
  const { H, fmtVol } = useHeaderSnapshot({
    symbol: CHART_SYMBOL, exchange: chartSel.exchange, isFutures: chartIsFutures, base: chartBase,
    loadCandles, livePrice, dailyOpenPrice, loadedSymbol, fmtPx,
  });

  // ── 마켓 — 모바일 거래탭 종목 시트 디자인 그대로(MarketPanel이 자체 데이터/필터 관리) ──
  const marketActive = section === 'market' && sidebarOpen;

  // ── 실데이터 — 현물 보유자산 (투자탭 '현물' 선택 시) ──
  const spotActive = section === 'invest' && investTab === '현물' && sidebarOpen;
  const { data: spot } = useSpotTrade(spotActive);
  const spotPriceSymbols = spot.holdings
    .filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC')
    .map((h) => `${h.coin}USDT`);
  const spotPrices = useRealtimePrices(spotPriceSymbols, spotActive);
  const spotPriceOf = (coin: string) => (coin === 'USDT' || coin === 'USDC' ? 1 : spotPrices[`${coin}USDT`] ?? 0);
  const spotValueOf = (h: SpotHolding) => (h.available + h.frozen) * spotPriceOf(h.coin);
  const spotTotal = spot.holdings.reduce((s, h) => s + spotValueOf(h), 0);
  const spotSorted = [...spot.holdings].sort((a, b) => spotValueOf(b) - spotValueOf(a));

  // 현물 시세 평가 도착 전까지 스켈레톤(보유 없으면 즉시 ready)
  const spotReady = useDelayedReady(spot.holdings.length === 0 || spotTotal > 0);

  // 사이드바 자산 스켈레톤 표시 여부
  const mainSkeleton = section === 'invest' && sidebarOpen && !mainReady && investTab === '선물';
  const spotSkeleton = spotActive && !spotReady;

  // 아이콘 클릭 → 섹션 선택 + 패널 열기
  // 로그인 필요한 섹션 — 내투자/전략/관심. (실시간 마켓은 공개) 섹션은 열리되 오버레이로 막는다.
  const GATED: Section[] = ['invest', 'strategy'];
  const sectionLocked = !user && GATED.includes(section);
  function openSection(id: Section) {
    // 같은 활성 섹션 아이콘 재클릭 → 접기. 다른 섹션이면 전환(열림 유지). 닫혀 있으면 열기.
    if (sidebarOpen && section === id) { setSidebarOpen(false); return; }
    setSection(id);
    setSidebarOpen(true);
  }
  // 표시 필터 — 마지막 하나는 끌 수 없음
  function togglePortfolio() {
    if (portfolioOn && !positionsOn) return;
    setPortfolioOn((v) => !v);
  }
  function togglePositions() {
    if (positionsOn && !portfolioOn) return;
    setPositionsOn((v) => !v);
  }

  return (
    <div className="app">
      <div className="main-area">

        {/* 메인 컬럼 (헤더 + 본문) */}
        <div className="app-main">
          <DesktopHeader
            user={user} onLoginClick={onLoginClick} onLogout={onLogout}
            menuOpen={menuOpen} setMenuOpen={setMenuOpen} menuRef={menuRef}
            effWatchMode={effWatchMode} setWatchMode={setWatchMode}
          />

          {/* 탑바(헤더)는 고정 — 그 아래 본문(sub-header+차트)만 dock 컬럼과 가로로 묶어 오른쪽으로 민다 */}
          <div className="app-body-row">
          {dockRender && (
            <aside className={`watch-dock${dockExpanded ? ' open' : ''}`}>
              <WatchlistPanel
                mode="dock"
                onSelect={handleSelectChart}
                onClose={() => setWatchMode('hidden')}
                onToggleDock={() => setWatchMode('float')}
              />
            </aside>
          )}
          <div className="app-body-col">

          {/* 차트 헤더 — 거래탭 종목 헤더 디자인 이식. H(통합 스냅샷)가 준비되면 좌·우 전부 통째 교체 */}
          <div className="sub-header trade-symbol-row">
            <div className="sh-left">
              <HeaderLogo base={H ? H.base : chartBase} logoUrl={coinLogos[H ? H.base : chartBase]} />
              <div className="symbol-info">
                <div className="symbol-selector">
                  <h1>{H ? H.title : (chartIsFutures ? `${CHART_SYMBOL}.P` : CHART_SYMBOL)}</h1>
                  {(H ? H.isFutures : chartIsFutures) && <span className="sh-perp-badge">Perpetual</span>}
                  {(() => { const ex = H ? H.exchange : chartSel.exchange; return (
                    <span className="trade-exchange-badge" style={{ color: EXCHANGES[ex].color }}>
                      <img className="trade-exchange-logo" src={EXCHANGES[ex].logo} alt="" aria-hidden="true" />
                      <span className="trade-exchange-name">{EXCHANGES[ex].label}</span>
                    </span>
                  ); })()}
                </div>
                <div className="sh-price-row">
                  <span className="sh-px">{H ? H.px : <HdSk w={120} h={20} />}</span>
                  {H?.chg && (
                    <span className="sh-chg" style={{ color: H.chg.up ? 'var(--up)' : 'var(--down)' }}>
                      {H.chg.up ? '+' : ''}{H.chg.abs} ({H.chg.up ? '+' : ''}{H.chg.pct}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="ph-right">
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">전날 종가</span><span className="ph-value">{H ? H.prevClose : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">당일 시가</span><span className="ph-value">{H ? H.todayOpen : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">24h 고가</span><span className="ph-value">{H ? H.high : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">24h 저가</span><span className="ph-value">{H ? H.low : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">24h 거래량 ({H ? H.baseLabel : chartBase})</span><span className="ph-value">{H ? H.baseVol : <HdSk />}</span></div>
                <div className="ph-item"><span className="ph-label">24h 거래대금 ({H ? H.quoteLabel : EXCHANGES[chartSel.exchange].quote})</span><span className="ph-value">{H ? H.quoteVol : <HdSk />}</span></div>
              </div>
              <div className="ph-vdivider" />
              <div className="ph-group">
                <div className="ph-item"><span className="ph-label">시가총액</span><span className="ph-value">{H ? H.cap : <HdSk />}</span></div>
              </div>
            </div>
          </div>

          <div className="body">
            <main className="main-layout">

              {/* 차트 패널 — 실데이터(비트겟 BTCUSDT 선물) */}
              <section className="panel panel-chart">
                <div className="chart-toolbar">
                  <div className="tf-bar">
                    {visibleTFs.map((t) => (
                      <button key={t} className={`tf-btn${activeTf === t ? ' active' : ''}`} onClick={() => {
                        if (soloOn) {
                          // 전환 직전 뷰(사용자가 팬/줌했을 수 있는 상태)를 캡처해 TF 넘어가도 유지.
                          const r = webChartRef.current?.getVisibleRawTimeRange();
                          if (r) soloUserViewRef.current = r;
                          // setActiveTf보다 먼저 동기 호출 → 새 TF 캔들 도착 시 바로 정위치(튐 방지).
                          frameForTf(t);
                        }
                        setActiveTf(t);
                      }}>{t}</button>
                    ))}
                  </div>
                  {soloOn && (
                    <button
                      className="chart-solo-chip"
                      title="이 패턴만 보기 해제"
                      onClick={() => { setSoloActive(false); setFocusTracker(null); soloUserViewRef.current = null; webChartRef.current?.resetPriceAutoScale(); }}
                    >
                      <span className="chart-solo-dot" />
                      {String((focusTracker as any)?.symbol ?? '').replace('USDT', '')} {(focusTracker as any)?.patternName ?? '패턴'} 집중
                      <span className="chart-solo-x">✕</span>
                    </button>
                  )}
                  {user && (
                  <div className="chart-tools">
                    {/* 신뢰선(기준선 랭킹) 토글 — 임시. 켜면 체급 버튼 노출 */}
                    <div className="chart-rsi-group">
                      <button
                        className={`chart-rsi-btn${rankMasterOn ? ' active' : ''}`}
                        aria-label="신뢰선"
                        title="기준선 신뢰도 랭킹 선 (스캐너 산출)"
                        onClick={() => setRankMasterOn((v: boolean) => !v)}
                      >
                        신뢰선
                      </button>
                      {rankMasterOn && (['1M', '1W', '3D', '1d'] as const).map((tier) => (
                        <button
                          key={tier}
                          className={`chart-rsi-btn${rankTiers[tier] ? ' active' : ''}`}
                          style={rankTiers[tier] ? { color: { '1M': '#b07cf0', '1W': '#4fc3f7', '3D': '#e6a23c', '1d': '#66d9a3' }[tier], borderColor: 'currentColor' } : undefined}
                          title={`${tier} 체급 신뢰선`}
                          onClick={() => setRankTiers((prev: Record<string, boolean>) => ({ ...prev, [tier]: !prev[tier] }))}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                    {/* RSI 캔들 토글 — 드로잉 버튼 바로 왼쪽. 켜면 차트 하단 페인에 표시 */}
                    <div className="chart-rsi-group">
                      <button
                        className={`chart-rsi-btn${rsiOn ? ' active' : ''}`}
                        aria-label="RSI 캔들"
                        title="RSI 캔들"
                        onClick={() => setRsiOn((v: boolean) => !v)}
                      >
                        RSI
                      </button>
                      {/* 켜져 있을 때만 설정 톱니 노출 */}
                      {rsiOn && (
                        <button
                          className="chart-rsi-gear"
                          aria-label="RSI 설정"
                          title="RSI 설정"
                          onClick={() => setRsiSettingsOpen(true)}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    {/* 차트 캡쳐 — 현재 화면을 PNG로 저장 */}
                    <button
                      className="chart-capture-btn"
                      aria-label="차트 캡쳐"
                      title="차트 캡쳐 (PNG 저장)"
                      onClick={handleCaptureChart}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                    {/* 그리기 도구 드롭다운 — 자체 드로잉 엔진(7종) + 오브젝트 트리 */}
                    <div className="chart-dd" ref={drawRef}>
                      <button
                        className={`chart-gear${drawOpen || drawTool ? ' active' : ''}`}
                        aria-label="그리기 도구"
                        title="그리기 도구"
                        onClick={() => { setDrawOpen((o) => !o); setIndiOpen(false); setChartSetOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="4" y1="20" x2="20" y2="4" />
                          <circle cx="4" cy="20" r="2" fill="currentColor" stroke="none" />
                          <circle cx="20" cy="4" r="2" fill="currentColor" stroke="none" />
                        </svg>
                      </button>
                      {drawOpen && (
                        <div className="chart-dd-panel draw-panel">
                          <div className="draw-panel-scroll">
                            <button
                              className={`draw-item${drawTool === null ? ' active' : ''}`}
                              onClick={() => { setDrawTool(null); setDrawOpen(false); }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3l14 9-6.5 1.5L9 20z" /></svg>
                              <span>커서 (그리기 해제)</span>
                            </button>
                            <button
                              className={`draw-item${magnetOn ? ' active' : ''}`}
                              onClick={() => setMagnetOn((v: boolean) => !v)}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><path d="M6 3h4v5H6zM14 3h4v5h-4z" fill="currentColor" stroke="none" /></svg>
                              <span>자석 (캔들 OHLC 스냅)</span>
                              <em className="draw-item-state">{magnetOn ? 'ON' : 'OFF'}</em>
                            </button>
                            <div className="draw-sep" />
                            {WEB_DRAW_TOOLS.map((t) => (
                              <button
                                key={t.type}
                                className={`draw-item${drawTool === t.type ? ' active' : ''}`}
                                onClick={() => { setDrawTool(t.type); setDrawOpen(false); }}
                              >
                                {t.icon}
                                <span>{t.name}</span>
                              </button>
                            ))}
                            <div className="draw-sep" />
                            <div className="draw-actions">
                              <button className="draw-act-btn" disabled={!drawHistory.canUndo} onClick={() => webChartRef.current?.undo()} title="되돌리기">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 7.5 4.5 12 9 16.5" /><path d="M4.5 12h8.8c4.1 0 6.2 2.7 6.2 6.2" /></svg>
                              </button>
                              <button className="draw-act-btn" disabled={!drawHistory.canRedo} onClick={() => webChartRef.current?.redo()} title="다시 실행">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 7.5 19.5 12 15 16.5" /><path d="M19.5 12h-8.8c-4.1 0-6.2 2.7-6.2 6.2" /></svg>
                              </button>
                              <button className="draw-act-btn danger" onClick={() => webChartRef.current?.clearAll()} title="모두 삭제">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                              </button>
                            </div>
                            <div className="draw-sep" />
                            <div className="draw-section-title">오브젝트 트리</div>
                            <ObjectTree
                              getManager={() => webChartRef.current?.getDrawingManager()}
                              onSelect={(id) => webChartRef.current?.selectDrawing(id)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 지표 드롭다운 — 관리자(ADMIN)에게만 노출 */}
                    {isAdmin && (
                    <div className="chart-dd" ref={indiRef}>
                      <button
                        className={`chart-gear${indiOpen ? ' active' : ''}`}
                        aria-label="지표"
                        title="지표"
                        onClick={() => { if (!user) { onLoginClick(); return; } setIndiOpen((o) => !o); setChartSetOpen(false); setDrawOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="2.5 12 7 12 10 5 14.5 19 17 12 21.5 12" />
                        </svg>
                      </button>
                      {indiOpen && (
                        <div className="chart-dd-panel indi-panel">
                          <div className="indi-panel-scroll">
                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('favorites')}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                              <Chevron open={indiGroups.favorites} />
                            </button>
                            {indiGroups.favorites && (
                              <div className="indi-group-body">
                                <SmcSection settings={indicatorSettings} onChange={setIndicatorSettings} />
                                <HarmonicSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                                <AbcSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                              </div>
                            )}

                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('basic')}>
                              기본
                              <Chevron open={indiGroups.basic} />
                            </button>
                            {indiGroups.basic && (
                              <div className="indi-group-body">
                                <MaSection maSettings={maSettings} onMaSettingsChange={setMaSettings} />
                                <BbSection bbSetting={bbSetting} onBbSettingChange={setBbSetting} />
                              </div>
                            )}

                            <button className="indicator-group-label" onClick={() => toggleIndiGroup('custom')}>
                              커스텀
                              <Chevron open={indiGroups.custom} />
                            </button>
                            {indiGroups.custom && (
                              <div className="indi-group-body">
                                <PivotSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                                <ElliottSection pivotSetting={pivotSetting} onPivotSettingChange={setPivotSetting} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    )}

                    {/* 차트설정(톱니) 드롭다운 */}
                    <div className="chart-dd" ref={chartSetRef}>
                      <button
                        className={`chart-gear${chartSetOpen ? ' active' : ''}`}
                        aria-label="차트 설정"
                        onClick={() => { if (!user) { onLoginClick(); return; } setChartSetOpen((o) => !o); setIndiOpen(false); setDrawOpen(false); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>
                      {chartSetOpen && (
                        <div className="chart-dd-panel settings-panel">
                          <div className="settings-sheet-content">
                            {/* 테마 프리셋 */}
                            <section className="settings-section">
                              <p className="settings-section-title">테마</p>
                              <div className="theme-presets-grid">
                                {PRESET_THEMES.map((preset) => (
                                  <button
                                    key={preset.id}
                                    className={`theme-preset-card ${chartTheme.id === preset.id ? 'active' : ''}`}
                                    onClick={() => setChartTheme(preset)}
                                  >
                                    <MiniCandles upColor={preset.upColor} downColor={preset.downColor} bgColor={preset.bgColor} />
                                    <span className="theme-preset-name">{preset.name}</span>
                                  </button>
                                ))}
                                <button
                                  className={`theme-preset-card ${isCustomTheme ? 'active' : ''}`}
                                  onClick={() => setChartTheme({ ...chartTheme, id: 'custom' })}
                                >
                                  <div className="theme-preset-custom-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                      <circle cx="12" cy="12" r="9" />
                                      <path d="M12 8v8M8 12h8" />
                                    </svg>
                                  </div>
                                  <span className="theme-preset-name">커스텀</span>
                                </button>
                              </div>
                            </section>

                            {/* 캔들 색상 */}
                            <section className="settings-section">
                              <p className="settings-section-title">캔들 색상</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row">
                                  <span className="color-picker-label">상승</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.upColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.upColor }} />
                                    <input type="color" value={chartTheme.upColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', upColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                                <label className="color-picker-row">
                                  <span className="color-picker-label">하락</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.downColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.downColor }} />
                                    <input type="color" value={chartTheme.downColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', downColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                              </div>
                            </section>

                            {/* 배경색 */}
                            <section className="settings-section">
                              <p className="settings-section-title">배경색</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row">
                                  <span className="color-picker-label">배경</span>
                                  <div className="color-picker-right">
                                    <span className="color-picker-hex">{chartTheme.bgColor}</span>
                                    <span className="color-picker-swatch" style={{ background: chartTheme.bgColor, border: '1.5px solid rgba(0,0,0,0.12)' }} />
                                    <input type="color" value={chartTheme.bgColor} onChange={(e) => setChartTheme({ ...chartTheme, id: 'custom', bgColor: e.target.value })} className="color-picker-input" />
                                  </div>
                                </label>
                              </div>
                            </section>

                            {/* 스케일 */}
                            <section className="settings-section">
                              <p className="settings-section-title">스케일</p>
                              <div className="color-picker-list">
                                <label className="color-picker-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setIsLogScale((v) => !v); }}>
                                  <span className="color-picker-label">로그 차트 (Log Scale)</span>
                                  <div className="color-picker-right">
                                    <div className={`toss-switch ${isLogScale ? 'active' : ''}`}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                  </div>
                                </label>
                                <label className="color-picker-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setPriceLineOn((v: boolean) => !v); }}>
                                  <span className="color-picker-label">현재가 라인</span>
                                  <div className="color-picker-right">
                                    <div className={`toss-switch ${priceLineOn ? 'active' : ''}`}>
                                      <div className="toss-switch-thumb" />
                                    </div>
                                  </div>
                                </label>
                              </div>
                            </section>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
                <div className="chart-stage">
                  {/* 드로잉 플로팅 툴바 + 설정 다이얼로그 — 도형 선택 시 */}
                  {selDrawId && (
                    <DrawingFloatBar
                      getManager={() => webChartRef.current?.getDrawingManager()}
                      selectedId={selDrawId}
                      onOpenSettings={() => setDrawSettingsOpen(true)}
                    />
                  )}
                  {selDrawId && drawSettingsOpen && (
                    <DrawingSettings
                      getManager={() => webChartRef.current?.getDrawingManager()}
                      drawingId={selDrawId}
                      onClose={() => setDrawSettingsOpen(false)}
                    />
                  )}
                  {rsiSettingsOpen && (
                    <RsiSettingsPanel
                      settings={rsiSettings}
                      onChange={setRsiSettings}
                      onClose={() => setRsiSettingsOpen(false)}
                    />
                  )}
                  {/* OHLC 오버레이 — 크로스헤어가 가리키는 캔들(없으면 마지막) */}
                  {ohlc && (
                    <div className="chart-overlay-ohlc">
                      <div className="ohlc-values-row">
                        <span>시 <em>{fmtPx(ohlc.open)}</em></span>
                        <span>고 <em>{fmtPx(ohlc.high)}</em></span>
                        <span>저 <em>{fmtPx(ohlc.low)}</em></span>
                        <span>종 <em>{fmtPx(ohlc.close)}</em></span>
                      </div>
                      {(() => {
                        const ch = ohlc.close - ohlc.open;
                        const chPct = ohlc.open ? (ch / ohlc.open) * 100 : 0;
                        const up = ch >= 0;
                        return (
                          <div className="ohlc-change-row">
                            <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                              {up ? '+' : ''}{fmtPx(ch)} ({up ? '+' : ''}{chPct.toFixed(2)}%)
                            </span>
                            <span className="ohlc-vol">거래량 {fmtVol(ohlc.volume)}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* lightweight-charts (모바일 MarketChart 재사용) */}
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <MarketChart
                      ref={webChartRef}
                      candles={candles}
                      symbol={CHART_SYMBOL}
                      period={timeframe.value}
                      activeTool={drawTool}
                      magnet={magnetOn}
                      onToolChange={setDrawTool}
                      onHistoryChange={setDrawHistory}
                      onDrawingSelect={(id) => { setSelDrawId(id); if (!id) setDrawSettingsOpen(false); }}
                      drawingStorageKey={user ? `web_${chartSel.exchange}_${CHART_SYMBOL}` : undefined}
                      marketKey={`${chartSel.exchange}-${CHART_PRODUCT ?? 'spot'}`}
                      variant="dark"
                      isLogScale={isLogScale}
                      showPriceLine={priceLineOn}
                      chartTheme={effChartTheme}
                      tickDecimals={chartTickDecimals}
                      currentTfSeconds={getIntervalSeconds(timeframe.granularity)}
                      focusTracker={soloOn ? focusTracker : null}
                      highlightTracker={highlightTracker}
                      soloDimAll={soloOn}
                      soloPreserve={soloOn}
                      active
                      indicatorSettings={effIndicatorSettings}
                      indicatorLayers={
                        // 지표 데이터(mtfSymbol)가 표시 중인 차트(loadedSymbol)와 일치할 때만 그림 —
                        // 전환 중 옛 지표가 새 차트에 잠깐 얹혀 튀는 것 방지(안정화 후 표시).
                        mtfSymbol === loadedSymbol
                          ? (['1M', '1W', '3D', '1D'] as TFKey[])
                              .filter((tf) => !!mtfCandles[tf])
                              .map((tf) => ({ tf, candles: mtfCandles[tf]! } satisfies IndicatorLayer))
                          : []
                      }
                      obOptions={obOptions}
                      maSettings={effMaSettings}
                      bbSetting={effBbSetting}
                      pivotSetting={effPivotSetting}
                      onCrosshairMove={setHoveredCandle}
                      futureTimeAxis
                      keepDataOnSymbolChange
                      showVolume
                      rankTiersOn={rankMasterOn ? rankTiers : undefined}
                      showRsiCandles={rsiOn}
                      rsiSettings={rsiSettings}
                      onVisibleRangeChange={handleVisibleRangeChange}
                    />
                  </div>
                </div>
              </section>

              {/* 가운데: 호가 + Market/Community */}
              <section className="panel-middle">
                <aside className="panel-orderbook">
                  <TradeOrderbook
                    askRows={OB ? OB.asks : []}
                    bidRows={OB ? OB.bids : []}
                    maxLevelSize={OB ? OB.maxLevelSize : 1}
                    fmtPrice={obFmtPrice}
                    fmtMid={obFmtMid}
                    centerPrice={OB ? OB.center : null}
                    priceDir="flat"
                    buyPct={OB ? OB.buyPct : 50}
                    depthLabel={OB ? OB.depthLabel : depthLabel}
                    showDepth={depthSelectable}
                    onOpenDepthSheet={() => setDepthOpen((v) => !v)}
                    funding={OB ? OB.funding : funding}
                    quoteLabel={OB ? OB.quoteLabel : EXCHANGES[chartSel.exchange].quote}
                  />
                  {/* 자릿수(묶음) 선택 드롭다운 — Bitget 전용. 버튼(우하단) 위로 펼침 */}
                  {depthOpen && depthSelectable && (
                    <>
                      <div className="ob-depth-backdrop" onClick={() => setDepthOpen(false)} />
                      <div className="ob-depth-dd" role="listbox">
                        {depthOptions.map((o) => (
                          <button
                            key={o.scale}
                            type="button"
                            className={`ob-depth-dd-item${depthScale === o.scale ? ' active' : ''}`}
                            onClick={() => { setDepthScale(o.scale); setDepthOpen(false); }}
                          >
                            <span>{o.label}</span>
                            {depthScale === o.scale && <span className="ob-depth-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </aside>

                <div className="panel panel-right">
                  <div className="right-tabs">
                    <div className="right-tab active">Community</div>
                    <span className="right-tab-status">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                      142
                    </span>
                  </div>
                  <div className="chat-messages">
                    {CHATS.map((c) => (
                      <div key={c.nick} className="chat-msg">
                        <div className="avatar" style={c.bg ? { background: c.bg } : undefined}>{c.av}</div>
                        <div className="bubble">
                          <div className="meta"><span className="nick">{c.nick}</span><span className="time">{c.time}</span></div>
                          <div className="body">{c.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {user ? (
                  <div className="chat-input">
                    <textarea
                      className="chat-textarea"
                      rows={1}
                      placeholder="메시지를 입력하세요..."
                      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                    />
                    <button className="chat-send" aria-label="전송">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z" />
                      </svg>
                    </button>
                  </div>
                  ) : (
                  <div className="chat-input chat-input-locked" aria-disabled="true">
                    <textarea className="chat-textarea" rows={1} placeholder="" readOnly />
                    <span className="chat-send" aria-label="로그인 필요">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </span>
                  </div>
                  )}
                </div>
              </section>

            </main>
          </div>
          </div>{/* app-body-col */}
          </div>{/* app-body-row */}
        </div>

        {/* tpm 스타일 사이드바 패널 */}
        <Sidebar
          sidebarOpen={sidebarOpen} section={section} sectionLocked={sectionLocked}
          krw={krw} setKrw={setKrw} marketActive={marketActive} handleSelectChart={handleSelectChart}
          invest={{
            main: { trade, hasKey, positions, available, unrealTotal, mainVal, approx, mainSkeleton, selPos },
            spot: { spot, spotSorted, spotTotal, spotValueOf, spotPriceOf, spotSkeleton },
            currency: { krw, usdKrw, curLabel, fmtCur, approxCur },
            view: { investTab, setInvestTab, portfolioOn, positionsOn, togglePortfolio, togglePositions, bothOn, walletOpen, setWalletOpen },
            actions: { handleSelectChart, setSelPosIdx },
          }}
        />

        {/* 아이콘 레일 (항상 보임) */}
        <IconRail section={section} openSection={openSection} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      </div>

      <footer className="app-footer">
        <span>© 2026 Bullum · Web</span>
        <span>v0.1</span>
      </footer>

      {/* 관심 미니 시세창 — float 모드: 화면 위에 떠있는 드래그 창 */}
      {effWatchMode === 'float' && (
        <WatchlistPanel
          mode="float"
          onSelect={handleSelectChart}
          onClose={() => setWatchMode('hidden')}
          onToggleDock={() => setWatchMode('dock')}
        />
      )}
    </div>
  );
}
