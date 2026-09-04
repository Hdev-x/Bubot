import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AuthUser } from '../../api/server/authApi';
import { MarketPanel } from './panels/MarketPanel';
import { useCoinLogos } from './panels/marketShared';
import { WatchlistPanel } from './panels/WatchlistPanel';
import StrategyComingSoon from '../mobile/components/StrategyComingSoon';
import botzMark from '../../assets/botz-mark.svg';
import { EXCHANGES } from '../../shared/constants/exchanges';
import { getOfficialLogo } from '../../shared/utils/coinFormatters';
import { type BitgetTicker } from '../../api/exchange/bitget/bitgetTicker';
import { fetchHeaderTicker } from '../../api/exchange/headerTicker';
import { krwDecimals } from '../../api/exchange/krw/krwTickers';
import { fetchCoinMarketCap } from '../../api/server/marketApi';
import { useMainTrade } from '../../hooks/account/useMainTrade';
import { useUsdKrw } from '../../hooks/market/useUsdKrw';
import { useOrderbook } from '../../hooks/market/useOrderbook';
import { useFundingRate } from '../../hooks/market/useFundingRate';
import { useRealtimePrices } from '../../hooks/market/useRealtimePrices';
import { usePricePrecision } from '../../hooks/market/usePricePrecision';
import { useCandleLoader } from '../../chart/hooks/useCandleLoader';
import { useCoinCandles } from '../../chart/hooks/useCoinCandles';
import { useChartTheme } from '../../chart/hooks/useChartTheme';
import { useDelayedReady } from '../../hooks/ui/useDelayedReady';
import { PRESET_THEMES } from '../../chart/settings/ChartSettingsSheet';
import type { ChartTheme } from '../../chart/settings/ChartSettingsSheet';

// 웹 기본/비로그인 고정 테마 = '다크'(id:dark). 없으면 첫 프리셋 폴백.
const DARK_THEME = PRESET_THEMES.find((t) => t.id === 'dark') ?? PRESET_THEMES[0];
import MarketChart from '../../chart/MarketChart';
import type { MarketChartRef } from '../../chart/MarketChart';
import type { TrackerState } from '../../shared/types/bot';
import type { DrawingManager } from '../../chart/drawing';
import { DrawingFloatBar, DrawingSettings } from './panels/DrawingToolbar';
import { RsiSettingsPanel } from './panels/RsiSettingsPanel';
import { DEFAULT_RSI_SETTINGS } from '../../shared/utils/rsiCandles';
import type { RsiSettings } from '../../shared/utils/rsiCandles';
import { usePersistentState } from '../../hooks/ui/usePersistentState';
import { useMtfCandles } from '../../chart/hooks/useMtfCandles';
import { DEFAULT_OB_OPTIONS } from '../../chart/analysis/chartIndicators';
import type { IndicatorSettings, IndicatorLayer, TFKey, OBOptions } from '../../chart/overlays/ChartOverlay';
import { DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING, DEFAULT_PIVOT_SETTING } from '../../chart/indicators/IndicatorSheet';
import type { MASetting, BBSetting, PivotSetting } from '../../chart/indicators/IndicatorSheet';
import SmcSection from '../../chart/indicators/SmcSection';
import HarmonicSection from '../../chart/indicators/HarmonicSection';
import AbcSection from '../../chart/indicators/AbcSection';
import MaSection from '../../chart/indicators/MaSection';
import BbSection from '../../chart/indicators/BbSection';
import PivotSection from '../../chart/indicators/PivotSection';
import ElliottSection from '../../chart/indicators/ElliottSection';
import TradeOrderbook from '../mobile/components/trade/TradeOrderbook';
import { useSpotTrade } from '../../hooks/account/useSpotTrade';
import type { DepthPrecision } from '../../api/exchange/bitget/bitgetMergeDepth';
import type { MainPosition } from '../../api/server/mainTradeApi';
import type { SpotHolding } from '../../api/server/spotTradeApi';
import type { Candle } from '../../shared/types/market';
import './DesktopApp.css';

// ── 차트 — 타임프레임 맵(버튼 라벨 → granularity/channel) ──
type Tf = { label: string; value: string; granularity: string; channel: string; category: 'min' | 'hour' | 'day' | 'week' | 'month' };
const WEB_TIMEFRAMES: Record<string, Tf> = {
  '1m': { label: '1m', value: '1m', granularity: '1min', channel: 'candle1m', category: 'min' },
  '3m': { label: '3m', value: '3m', granularity: '3min', channel: 'candle3m', category: 'min' },
  '5m': { label: '5m', value: '5m', granularity: '5min', channel: 'candle5m', category: 'min' },
  '15m': { label: '15m', value: '15m', granularity: '15min', channel: 'candle15m', category: 'min' },
  '30m': { label: '30m', value: '30m', granularity: '30min', channel: 'candle30m', category: 'min' },
  '1H': { label: '1H', value: '1h', granularity: '1h', channel: 'candle1H', category: 'hour' },
  '4H': { label: '4H', value: '4h', granularity: '4h', channel: 'candle4H', category: 'hour' },
  '6H': { label: '6H', value: '6h', granularity: '6Hutc', channel: 'candle6Hutc', category: 'hour' },
  '12H': { label: '12H', value: '12h', granularity: '12Hutc', channel: 'candle12Hutc', category: 'hour' },
  '1D': { label: '1D', value: '1d', granularity: '1Dutc', channel: 'candle1Dutc', category: 'day' },
  '3D': { label: '3D', value: '3d', granularity: '3Dutc', channel: 'candle3Dutc', category: 'day' },
  '1W': { label: '1W', value: '1w', granularity: '1Wutc', channel: 'candle1Wutc', category: 'week' },
  '1M': { label: '1M', value: '1mo', granularity: '1Mutc', channel: 'candle1Mutc', category: 'month' },
};
function getIntervalSeconds(granularity: string): number {
  const map: Record<string, number> = {
    '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30min': 1800, '30m': 1800,
    '1h': 3600, '4h': 14400, '6Hutc': 21600, '12Hutc': 43200,
    '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
  };
  return map[granularity] ?? 60;
}
function getBucketTime(timestamp: number, granularity: string): number {
  const s = timestamp;
  switch (granularity) {
    case '1min': return Math.floor(s / 60) * 60;
    case '3min': return Math.floor(s / 180) * 180;
    case '5min': return Math.floor(s / 300) * 300;
    case '15min': return Math.floor(s / 900) * 900;
    case '30min': return Math.floor(s / 1800) * 1800;
    case '1h': return Math.floor(s / 3600) * 3600;
    case '4h': return Math.floor(s / 14400) * 14400;
    case '6Hutc': return Math.floor(s / 21600) * 21600;
    case '12Hutc': return Math.floor(s / 43200) * 43200;
    case '1Dutc': return Math.floor(s / 86400) * 86400;
    case '3Dutc': return Math.floor(s / 259200) * 259200;
    case '1Wutc': {
      const d = new Date(s * 1000);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff) / 1000);
    }
    case '1Mutc': {
      // 월봉 — 케이스 누락 시 default(1분 버킷)로 떨어져 KRW 월봉 차트에 분 단위 봉이 자라남
      const d = new Date(s * 1000);
      return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
    }
    default: return Math.floor(s / 60) * 60;
  }
}
const CHART_FALLBACK: Candle[] = [];

// 호가 단위 라벨 (OrderPage.depthLabelFor 동일)
function depthLabelFor(scaleIndex: number, symbolDecimals: number): string {
  const dec = Math.max(0, symbolDecimals - scaleIndex);
  const value = Math.pow(10, scaleIndex - symbolDecimals);
  return value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// 호가 묶음(aggregate) — Bitget은 API가 precision으로 묶어주지만, Binance/업비트/빗썸은 고정 틱만 줘서
// 프론트에서 step 단위로 직접 묶는다. 매도=올림(ceil), 매수=내림(floor)으로 중앙 겹침 없이 사다리 유지.
function aggregateLevels(levels: { price: number; size: number }[], step: number, side: 'ask' | 'bid') {
  if (!levels.length || !(step > 0)) return levels;
  const map = new Map<number, number>();
  for (const l of levels) {
    const idx = side === 'ask' ? Math.ceil(l.price / step - 1e-9) : Math.floor(l.price / step + 1e-9);
    map.set(idx, (map.get(idx) ?? 0) + l.size);
  }
  const out = [...map.entries()].map(([idx, size]) => ({ price: idx * step, size }));
  out.sort((a, b) => (side === 'ask' ? a.price - b.price : b.price - a.price));
  return out;
}

// ── 데스크톱 웹 — 모바일 훅/컴포넌트를 그대로 재사용해 같은 데이터를 다룸(화면만 다름) ──
// 실데이터: 내 투자(선물=useMainTrade, 현물=useSpotTrade) · 호가(useOrderbook) · 차트(useCoinCandles)
//           · 마켓 리스트(useMarketTickers, BITGET 현물).
// 목업: 커뮤니티 채팅 / 헤더 검색(요청상 보류).

// 자산 표기 — 1 미만 4자리, 그 외 1자리 (모바일 fmtAsset 동일)
function fmtAsset(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 1,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 1,
  });
}
// base 심볼 → 로고 클래스(색) 대략 매핑
function logoClass(base: string): string {
  if (base === 'BTC') return 'btc';
  if (base === 'ETH') return 'eth';
  if (base === 'SOL') return 'sol';
  return 'btc';
}
// 포지션 ROE(증거금 기준 근사) = 가격변화율 × 레버리지 × 방향
function calcRoe(p: MainPosition): number {
  if (p.entryPrice <= 0) return 0;
  return ((p.markPrice - p.entryPrice) / p.entryPrice) * 100 * p.leverage * (p.direction === 'long' ? 1 : -1);
}


type Section = 'invest' | 'market' | 'strategy';
const SECTIONS: { id: Section; title: string }[] = [
  { id: 'invest', title: '내 투자' },
  { id: 'market', title: '실시간' },
  { id: 'strategy', title: '전략' },
];

const INVEST_TABS = ['전체', '선물', '현물', '주식'] as const;
type InvestTab = (typeof INVEST_TABS)[number];

const CHATS = [
  { av: 'J', bg: '', nick: 'jordan_', time: '12:34', body: '64k 저항 강함. 음봉 시작' },
  { av: 'M', bg: '#3b3f4b', nick: 'marketmkr', time: '12:35', body: '63.5k 지지 봐야할듯' },
  { av: 'T', bg: '#5a3a3a', nick: 'trader.kr', time: '12:36', body: '롱 절반 익절 👍' },
  { av: 'H', bg: '#3a5a3a', nick: 'han.dev', time: '12:38', body: '데스크톱 화면 너무 좋다' },
  { av: 'D', bg: '#3a3a5a', nick: 'delta_', time: '12:40', body: 'FOMC 다음주라 변동성 주의' },
  { av: 'R', bg: '#5a4a2a', nick: 'ronin', time: '12:41', body: '차트 + 호가 + 채팅 한 화면 만족' },
] as const;

// ── 그리기 도구(자체 드로잉 엔진) — 타입 문자열은 모바일 DrawingSheet와 동일 ──
const WEB_DRAW_TOOLS: { type: string; name: string; icon: React.ReactNode }[] = [
  {
    type: 'horizontal-line', name: '수평선',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="2" y1="12" x2="22" y2="12" /><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'horizontal-ray', name: '수평 레이',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="7" y1="12" x2="22" y2="12" /><circle cx="5" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'trend-line', name: '추세선',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="5" y1="19" x2="19" y2="5" /><circle cx="5" cy="19" r="2.2" fill="currentColor" stroke="none" /><circle cx="19" cy="5" r="2.2" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'parallel-channel', name: '평행 채널',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="21" x2="17" y2="7" /><line x1="7" y1="17" x2="21" y2="3" opacity="0.55" /></svg>,
  },
  {
    type: 'rectangle', name: '직사각형',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="10" rx="1" /></svg>,
  },
  {
    type: 'price-range', name: '가격 범위',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="4" x2="12" y2="20" /><polyline points="8.5 7.5 12 4 15.5 7.5" /><polyline points="8.5 16.5 12 20 15.5 16.5" /></svg>,
  },
  {
    type: 'fib-retracement', name: '피보나치 되돌림',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="5" x2="21" y2="5" /><line x1="3" y1="12" x2="21" y2="12" opacity="0.65" /><line x1="3" y1="19" x2="21" y2="19" /></svg>,
  },
];

// 웹 오브젝트 트리 — 드로잉 목록(보이기/잠금/삭제/선택). manager는 ref라 폴링으로 동기화(모바일 시트와 동일 방식).
function ObjectTree({ getManager, onSelect }: { getManager: () => DrawingManager | null | undefined; onSelect: (id: string) => void }) {
  const [items, setItems] = useState<{ id: string; type: string; visible: boolean; locked: boolean }[]>([]);
  useEffect(() => {
    const update = () => {
      const m = getManager();
      setItems(m ? m.getAllDrawings().map((d) => ({
        id: d.id, type: d.type,
        visible: d.options.visible !== false,
        locked: d.options.locked === true,
      })) : []);
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [getManager]);

  const nameOf = (type: string) => WEB_DRAW_TOOLS.find((t) => t.type === type)?.name ?? type;

  if (!items.length) return <div className="draw-obj-empty">작도 객체 없음</div>;
  return (
    <div className="draw-obj-list">
      {[...items].reverse().map((d) => (
        <div key={d.id} className={`draw-obj-row${d.visible ? '' : ' dimmed'}`} onClick={() => onSelect(d.id)}>
          <span className="draw-obj-name">{nameOf(d.type)}</span>
          <button
            className="draw-obj-btn" title={d.visible ? '감추기' : '보이기'}
            onClick={(e) => { e.stopPropagation(); getManager()?.getDrawing(d.id)?.updateOptions({ visible: !d.visible }); }}
          >
            {d.visible ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            )}
          </button>
          <button
            className={`draw-obj-btn${d.locked ? ' locked' : ''}`} title={d.locked ? '잠금 해제' : '잠금'}
            onClick={(e) => { e.stopPropagation(); getManager()?.getDrawing(d.id)?.updateOptions({ locked: !d.locked }); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d={d.locked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'} /></svg>
          </button>
          <button
            className="draw-obj-btn danger" title="삭제"
            onClick={(e) => { e.stopPropagation(); getManager()?.removeDrawing(d.id); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}

const TF = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '6H', '12H', '1D', '3D', '1W', '1M'];
// 거래소별 미지원 타임프레임(공개 캔들 API에 없음) — 버튼 숨김(누르면 빈 차트라).
const UNSUPPORTED_TF: Record<string, string[]> = {
  UPBIT: ['6H', '12H', '3D'],
  BITHUMB: ['3D'], // v1 API 전환으로 15m·4H·6H·12H·주·월 지원(3D만 미지원)
};

// 테마 프리셋 카드 미리보기 캔들 (모바일 ChartSettingsSheet의 MiniCandles 복사)
function MiniCandles({ upColor, downColor, bgColor }: Pick<ChartTheme, 'upColor' | 'downColor' | 'bgColor'>) {
  const candles = [
    { bull: true, y: 3, h: 14 }, { bull: false, y: 5, h: 12 }, { bull: true, y: 2, h: 16 },
    { bull: false, y: 6, h: 10 }, { bull: true, y: 1, h: 15 },
  ];
  return (
    <div className="mini-candles-wrap" style={{ background: bgColor }}>
      {candles.map((c, i) => (
        <svg key={i} width="5" height="24" viewBox="0 0 5 24">
          <line x1="2.5" y1="0" x2="2.5" y2={c.y} stroke={c.bull ? upColor : downColor} strokeWidth="1" />
          <rect x="0.5" y={c.y} width="4" height={c.h} fill={c.bull ? upColor : downColor} rx="0.5" />
          <line x1="2.5" y1={c.y + c.h} x2="2.5" y2="24" stroke={c.bull ? upColor : downColor} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );
}

// 사이드바 자산(선물/현물) 로드 스켈레톤 — 모바일 TradeAccountSummary 패턴
function SidebarAssetSkeleton() {
  return (
    <div className="assets-scroll">
      <div className="tas-hero">
        <span className="tas-hero-label">총자산</span>
        <div className="tas-hero-row">
          <span className="tas-hero-val tas-hero-skeleton skeleton-shimmer" aria-label="불러오는 중" />
        </div>
        <span className="tas-hero-approx tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />
      </div>
      <div className="view-group">
        <div className="tas-divider" />
        <div className="tas-mkt-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tas-mkt-row tas-mkt-skel">
              <span className="tas-mkt-logo skeleton-shimmer" />
              <span className="sk-bar sk-sym skeleton-shimmer" />
              <span className="sk-bar sk-amt skeleton-shimmer" />
              <span className="sk-bar sk-roe skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 차트 헤더 코인 로고 — 신뢰도 높은 소스(공식 → 백엔드 gecko맵)만 사용. 없으면 바로 글자(2글자).
// 404로 엑박 깜빡이던 CDN 후보는 제거. 드물게 url이 죽으면 onError로 글자 폴백.
function HeaderLogo({ base, logoUrl }: { base: string; logoUrl?: string }) {
  const url = getOfficialLogo(base) || logoUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return (
    <span className="sh-coin-logo">
      {url && !failed
        ? <img src={url} alt={base} onError={() => setFailed(true)} />
        : <span className="sh-coin-logo-fallback">{base.slice(0, 2)}</span>}
    </span>
  );
}

// 차트 헤더 정보 스켈레톤 바 (값 도착 전, skeleton-shimmer 재사용)
function HdSk({ w = 56, h = 13 }: { w?: number; h?: number }) {
  return <span className="hd-sk skeleton-shimmer" style={{ width: w, height: h }} />;
}

// 드롭다운 접힘 그룹 헤더의 셰브론
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// 비로그인 시 차트에 표시할 "모두 꺼짐" 지표 설정(저장값은 그대로, 표시만 차단)
const INDICATORS_OFF: IndicatorSettings = {
  '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
};
const MA_OFF: MASetting[] = [];
function pivotOff(p: PivotSetting): PivotSetting {
  return {
    ...p, show: false, showWave: false, showHarmonic: false, showHarmonicScanning: false,
    showHarmonicSignal: false, showHarmonicCompleted: false, showHarmonicStoploss: false,
    showHarmonicPrediction: false, showHarmonicLines: false, showHarmonicFill: false,
    showElliottWave: false, showAbcWave: false, showAbcCompleted: false, showAbcPrediction: false,
    showAbcText: false, showAbcLines: false, showTpLine: false, showTpLabel: false,
    showSlLine: false, showSlLabel: false,
  };
}

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
  const [activeTf, setActiveTf] = useState('1H');
  const [selPosIdx, setSelPosIdx] = useState(0);
  // 차트 툴바 드롭다운(그리기 / 지표 / 차트설정) 열림 상태
  const [indiOpen, setIndiOpen] = useState(false);
  const [chartSetOpen, setChartSetOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  // 활성 그리기 도구(null=커서). 도형 완성 시 MarketChart가 onToolChange(null)로 되돌림.
  const [drawTool, setDrawTool] = useState<string | null>(null);
  // 드로잉 undo/redo 가능 여부(그리기 패널 버튼 활성화)
  const [drawHistory, setDrawHistory] = useState({ canUndo: false, canRedo: false });
  // 선택된 드로잉(플로팅 툴바 표시) + 설정 다이얼로그
  const [selDrawId, setSelDrawId] = useState<string | null>(null);
  const [drawSettingsOpen, setDrawSettingsOpen] = useState(false);
  // 자석(OHLC 약스냅) — TV처럼 토글, 새로고침에도 유지
  const [magnetOn, setMagnetOn] = usePersistentState('web_draw_magnet', true);
  // RSI 캔들 지표(하단 페인) 토글 + 설정 — 새로고침에도 유지
  const [rsiOn, setRsiOn] = usePersistentState('web_rsi_candles', false);
  // 신뢰도 랭킹 선(임시) — 마스터 + 체급별 토글
  const [rankMasterOn, setRankMasterOn] = usePersistentState('web_rank_lines', false);
  const [rankTiers, setRankTiers] = usePersistentState<Record<string, boolean>>('web_rank_tiers', { '1M': true, '1W': true, '3D': false, '1d': false });
  const [rsiSettings, setRsiSettings] = usePersistentState<RsiSettings>('web_rsi_settings', DEFAULT_RSI_SETTINGS);
  const [rsiSettingsOpen, setRsiSettingsOpen] = useState(false);
  const indiRef = useRef<HTMLDivElement>(null);
  const chartSetRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLDivElement>(null);
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

  // ── 실데이터 — 호가 (선택 종목/거래소) ──
  const [depthScale, setDepthScale] = useState<DepthPrecision>('scale3'); // 디폴트=가장 굵은 단위
  const [depthOpen, setDepthOpen] = useState(false); // 자릿수(묶음) 선택 드롭다운
  const { getTickDecimals } = usePricePrecision(2);
  const orderbook = useOrderbook(CHART_SYMBOL, depthScale, chartIsFutures, true, chartSel.exchange, false);
  const funding = useFundingRate(
    CHART_SYMBOL,
    (chartSel.exchange === 'BITGET' || chartSel.exchange === 'BINANCE') && chartIsFutures,
    chartSel.exchange === 'BINANCE' ? 'BINANCE' : 'BITGET',
  );
  const scaleIndex = Number(depthScale.replace('scale', ''));
  // 종목별 틱 소수점(precisionMap 조회). KRW는 맵에 없어 기본값으로 빠지므로 원(정수)=0으로 보정.
  const symbolDecimals = chartIsKrw ? 0 : getTickDecimals(CHART_SYMBOL);
  const obStep = Math.pow(10, scaleIndex - symbolDecimals); // 선택 단위(묶음 크기)
  // 호가 가격 소수자리는 KRW일 때 현재가 기준(krwDec)이 필요해 centerPrice 이후에서 계산(아래).
  // Bitget=API 묶음(precision), Binance=클라 묶음(obStep), KRW(업비트/빗썸)=네이티브 호가 그대로
  // (호가 개수가 적어(30/15) 묶으면 행이 확 줄어 의미 없음 → 묶음 미적용·드롭다운 숨김).
  const useClientAgg = chartSel.exchange === 'BINANCE';
  const rawAsks = orderbook ? orderbook.asks : [];
  const rawBids = orderbook ? orderbook.bids : [];
  const askLevels = (useClientAgg ? aggregateLevels(rawAsks, obStep, 'ask') : rawAsks).slice(0, 6);
  const bidLevels = (useClientAgg ? aggregateLevels(rawBids, obStep, 'bid') : rawBids).slice(0, 6);
  const maxLevelSize = Math.max(1, ...askLevels.map((l) => l.size), ...bidLevels.map((l) => l.size));
  const askRows = [...askLevels].reverse();
  const bidRows = bidLevels;
  const bestAsk = orderbook?.asks[0]?.price;
  const bestBid = orderbook?.bids[0]?.price;
  const midPrice = bestAsk != null && bestBid != null ? (bestAsk + bestBid) / 2 : bestAsk ?? bestBid;
  const askVol = askLevels.reduce((s, l) => s + l.size, 0);
  const bidVol = bidLevels.reduce((s, l) => s + l.size, 0);
  const buyPct = askVol + bidVol > 0 ? Math.round((bidVol / (askVol + bidVol)) * 100) : 50;
  // 자릿수(묶음) 선택 — KRW(업비트/빗썸)는 호가 개수가 적어 묶음 미지원(드롭다운 숨김).
  const depthSelectable = !chartIsKrw;
  // ×100(scale3)은 Bitget 선물 전용(서버 묶음). 그 외(Bitget 현물/타 거래소)는 ×10까지 —
  // 타 거래소는 클라 묶음이라 ×100이면 받는 범위($)가 부족해 6행을 못 채움.
  const depthSteps = (chartSel.exchange === 'BITGET' && chartIsFutures) ? [0, 1, 2, 3] : [0, 1, 2];
  const depthOptions = depthSteps.map((i) => ({ scale: `scale${i}` as DepthPrecision, label: depthLabelFor(i, symbolDecimals) }));
  const depthLabel = depthLabelFor(scaleIndex, symbolDecimals);

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

  // ── 실데이터 — 차트 캔들 (선택 종목, clearOnSymbolChange:false로 전환 깜빡임 방지) ──
  const timeframe = WEB_TIMEFRAMES[activeTf] ?? WEB_TIMEFRAMES['1H'];
  const loadCandles = useCandleLoader({ symbol: CHART_SYMBOL, productType: CHART_PRODUCT, exchange: chartSel.exchange });
  const { candles, livePrice, dailyOpenPrice, loadedSymbol, handleVisibleRangeChange } = useCoinCandles({
    symbol: CHART_SYMBOL,
    productType: CHART_PRODUCT,
    isBinance: chartIsBinance,
    isFutures: chartIsFutures,
    timeframe,
    loadCandles,
    fallbackCandles: CHART_FALLBACK,
    getBucketTime,
    initialLimit: 600,
    active: true,
    clearOnSymbolChange: false,
    exchange: chartSel.exchange,
    priceFromTicker: true, // 현재가(헤더·호가중앙)는 캔들이 아닌 거래소 티커(last)에서 — 차트 TF 무관
    liveCandle: true, // 현재 캔들 거래량 실시간(Binance/Bitget=kline WS, 업비트/빗썸=REST 폴링)
  });
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

  // 호가 중앙 현재가 = 캔들 종가(livePrice)로 헤더와 통일. livePrice 없을 때만 호가 mid 폴백.
  const centerPrice = livePrice ?? midPrice;
  // KRW 표시 소수자리 = 마켓 리스트와 동일 함수(krwDecimals(현재가)) — 저가 코인(100원 미만) 소수자리 일치.
  // (차트축·헤더·호가가 전부 이 값을 써서 실시간마켓과 어긋나지 않음. 100원 이상은 0자리라 무영향)
  const krwDec = krwDecimals(centerPrice ?? 0);
  // 호가 가격 소수자리: KRW=krwDec, 그 외=선택 단위에 맞춰(틱×10^i)
  const obDecimals = chartIsKrw ? krwDec : Math.max(0, symbolDecimals - scaleIndex);
  const midDecimals = chartIsKrw ? krwDec : symbolDecimals;

  // 자릿수(묶음) 단위: 종목 바뀌면 기본(scale2), 현물은 scale3 미지원 → scale2로
  // 종목/거래소/마켓이 바뀌면 그 조합의 "가장 굵은 단위"를 디폴트로(Bitget 선물=scale3, 그 외=scale2)
  useEffect(() => {
    setDepthScale((chartSel.exchange === 'BITGET' && chartIsFutures) ? 'scale3' : 'scale2');
  }, [CHART_SYMBOL, chartSel.exchange, chartIsFutures]);

  // ── 호가 통합 스냅샷(OB) — 헤더처럼 "현재 종목 호가+현재가가 준비되면" 좌·우 통째 교체 ──
  // obReady: 현재 호가(orderbook.key가 현재 거래소|심볼|선물여부)와 현재가(livePrice)가 모두 현재 종목 것.
  // 준비 전(전환 중)엔 직전 스냅샷(행/소수자리/라벨/펀딩 묶음)을 그대로 유지 → 부분 도착으로 칸 밀림/섞임 없음.
  const obKey = `${chartSel.exchange}|${CHART_SYMBOL}|${chartIsFutures}`;
  const obReady = orderbook?.key === obKey && loadedSymbol === CHART_SYMBOL && livePrice != null;
  const obRef = useRef<{
    asks: { price: number; size: number }[]; bids: { price: number; size: number }[];
    maxLevelSize: number; buyPct: number; center: number; obDec: number; midDec: number;
    depthLabel: string; quoteLabel: string; funding: string;
  } | null>(null);
  if (obReady) {
    obRef.current = {
      asks: askRows, bids: bidRows, maxLevelSize, buyPct, center: livePrice,
      obDec: obDecimals, midDec: midDecimals, depthLabel,
      quoteLabel: EXCHANGES[chartSel.exchange].quote, funding,
    };
  }
  const OB = obRef.current;
  const obFmtPrice = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: OB?.obDec ?? 2, maximumFractionDigits: OB?.obDec ?? 2 });
  const obFmtMid = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: OB?.midDec ?? 2, maximumFractionDigits: OB?.midDec ?? 2 });

  // 차트 소수점도 "표시 중인 캔들(loadedSymbol)"과 함께만 바뀌게 스테이징 — 데이터보다 소수점이 먼저 바뀌어
  // 옛 캔들이 새 소수점으로 재포맷되며 가격축 폭이 흔들리는 것 방지. KRW는 원(정수)=0.
  const chartDecimalsTarget = chartIsKrw ? krwDec : getTickDecimals(CHART_SYMBOL);
  const chartDecimalsRef = useRef(chartDecimalsTarget);
  if (loadedSymbol === CHART_SYMBOL) chartDecimalsRef.current = chartDecimalsTarget;
  const chartTickDecimals = chartDecimalsRef.current;

  const [chartTheme, setChartTheme] = useChartTheme(DARK_THEME); // 웹 기본 테마 = 다크

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

  // ── 차트 설정/지표 상태 (모바일 CoinChartPage와 동일 저장키 — 종목 이동·새로고침 유지) ──
  const [isLogScale, setIsLogScale] = usePersistentState('chart_log_scale', true);
  // 현재가 기준 수평 점선(priceLine) — 기본 끔, 새로고침에도 유지
  const [priceLineOn, setPriceLineOn] = usePersistentState('web_price_line', false);
  const [indicatorSettings, setIndicatorSettings] = usePersistentState<IndicatorSettings>('chart_indicators', {
    '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  }, true);
  const [maSettings, setMaSettings] = usePersistentState<MASetting[]>('chart_ma_settings', DEFAULT_MA_SETTINGS);
  const [bbSetting, setBbSetting] = usePersistentState<BBSetting>('chart_bb_setting', DEFAULT_BB_SETTING, true);
  const [pivotSetting, setPivotSetting] = usePersistentState<PivotSetting>('chart_pivot_setting', DEFAULT_PIVOT_SETTING, true);
  const [obOptions] = useState<OBOptions>(DEFAULT_OB_OPTIONS);
  // 지표는 관리자(ADMIN)에게만 공개. 일반 유저·비로그인은 차트 지표 전부 끔(저장값은 유지, 표시만 차단)
  const isAdmin = user?.role === 'ADMIN';
  const indiOff = !isAdmin;
  const effIndicatorSettings = indiOff ? INDICATORS_OFF : indicatorSettings;
  const effMaSettings = indiOff ? MA_OFF : maSettings;
  const effBbSetting = indiOff ? { ...bbSetting, show: false } : bbSetting;
  const effPivotSetting = indiOff ? pivotOff(pivotSetting) : pivotSetting;
  // 비로그인 시 테마는 다크(DARK_THEME)로 고정. 로그인 후엔 저장된 선택값 유지.
  const effChartTheme = user ? chartTheme : DARK_THEME;
  // atomic: 활성 TF 전부 로드 후 한번에 커밋 + 그 심볼(mtfSymbol) 반환. 표시 중인 차트(loadedSymbol)와 일치할 때만 그림.
  const { mtfCandles, mtfSymbol } = useMtfCandles(CHART_SYMBOL, effIndicatorSettings, loadCandles, true);

  // 차트 툴바 드롭다운 그룹 접힘 상태
  const [indiGroups, setIndiGroups] = useState({ favorites: true, basic: true, custom: false });
  const toggleIndiGroup = (k: keyof typeof indiGroups) => setIndiGroups((p) => ({ ...p, [k]: !p[k] }));
  const isCustomTheme = !PRESET_THEMES.find((t) => t.id === chartTheme.id);
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

  // ── 헤더 정보 — 거래소별 24h 티커(고가/저가/거래량/거래대금) ──
  // sym 태그 — 어느 종목에 대한 값인지. 실패해도 {sym, t:null}로 resolve해 헤더 통합 스왑이 멈추지 않게.
  const [tkr, setTkr] = useState<{ sym: string; t: BitgetTicker | null } | null>(null);
  useEffect(() => {
    let ignore = false;
    const load = () => {
      fetchHeaderTicker(chartSel.exchange, CHART_SYMBOL, chartIsFutures)
        .then((t) => { if (!ignore) setTkr({ sym: CHART_SYMBOL, t: t ?? null }); })
        .catch(() => { if (!ignore) setTkr({ sym: CHART_SYMBOL, t: null }); });
    };
    load();
    const id = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(id); };
  }, [CHART_SYMBOL, chartSel.exchange, chartIsFutures]);
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
          if (cs.length < 1) { setDayStats({ sym: CHART_SYMBOL, prevClose: null, todayOpen: null }); return; }
          const prev = cs[cs.length - 2] ?? cs[0];
          const today = cs[cs.length - 1];
          setDayStats({ sym: CHART_SYMBOL, prevClose: prev.close, todayOpen: today.open });
        })
        .catch(() => { if (!ignore) setDayStats({ sym: CHART_SYMBOL, prevClose: null, todayOpen: null }); });
    };
    const loadCap = () => {
      fetchCoinMarketCap(chartBase)
        .then((mc) => { if (!ignore) setMarketCap({ base: chartBase, cap: mc ?? null }); })
        .catch(() => { if (!ignore) setMarketCap({ base: chartBase, cap: null }); });
    };
    loadDay(); loadCap();
    const idDay = setInterval(loadDay, 60000);   // 일봉 60초
    const idCap = setInterval(loadCap, 300000);  // 시총 5분(백엔드 10분 캐시)
    return () => { ignore = true; clearInterval(idDay); clearInterval(idCap); };
  }, [CHART_SYMBOL, chartBase, loadCandles]);

  // ── 헤더 통합 스냅샷(H) — 좌측·우측 전부 한 종목으로, 모든 데이터가 준비됐을 때만 통째 교체 ──
  // allReady: 현재 종목(CHART_SYMBOL)에 대해 현재가·일봉시가·티커·일봉통계·시총이 전부 도착(실패는 null로 resolve).
  // 준비되면 모든 표시값을 미리 포맷해 headRef에 통째로 커밋(현재 종목이면 매 렌더 재커밋 → 가격 실시간 갱신).
  // 준비 전(전환 중)엔 직전 종목 스냅샷을 그대로 유지 → 부분적으로 들어와 칸이 밀리는 레이아웃 시프트 없음.
  const allReady =
    loadedSymbol === CHART_SYMBOL && livePrice != null && dailyOpenPrice != null &&
    tkr?.sym === CHART_SYMBOL &&
    dayStats?.sym === CHART_SYMBOL &&
    marketCap?.base === chartBase;
  const headRef = useRef<{
    symbol: string; title: string; isFutures: boolean;
    exchange: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; base: string;
    px: string; chg: { abs: string; pct: string; up: boolean } | null;
    prevClose: string; todayOpen: string; high: string; low: string;
    baseLabel: string; quoteLabel: string; baseVol: string; quoteVol: string; cap: string;
  } | null>(null);
  if (allReady) {
    const abs = livePrice - dailyOpenPrice;
    const pct = dailyOpenPrice !== 0 ? (abs / dailyOpenPrice) * 100 : 0;
    const t = tkr!.t;
    headRef.current = {
      symbol: CHART_SYMBOL,
      title: chartIsFutures ? `${CHART_SYMBOL}.P` : CHART_SYMBOL,
      isFutures: chartIsFutures,
      exchange: chartSel.exchange,
      base: chartBase,
      px: fmtPx(livePrice),
      chg: { abs: fmtPx(abs), pct: pct.toFixed(2), up: pct >= 0 },
      prevClose: dayStats!.prevClose != null ? fmtPx(dayStats!.prevClose) : '—',
      todayOpen: dayStats!.todayOpen != null ? fmtPx(dayStats!.todayOpen) : fmtPx(dailyOpenPrice),
      high: t ? fmtPx(t.high24h) : '—',
      low: t ? fmtPx(t.low24h) : '—',
      baseLabel: chartBase,
      quoteLabel: EXCHANGES[chartSel.exchange].quote,
      baseVol: t ? fmtVol(t.baseVolume) : '—',
      quoteVol: t ? fmtVol(t.quoteVolume) : '—',
      cap: marketCap!.cap != null ? '$' + fmtVol(marketCap!.cap) : '—',
    };
  }
  const H = headRef.current;

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
          <header className="header">
            <img className="header-logo" src={botzMark} alt="Botz" />
            <div className="header-right">
              <div className="header-search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                <input placeholder="검색" />
              </div>
              {user && (
                <button
                  className={`header-watch-btn${effWatchMode !== 'hidden' ? ' active' : ''}`}
                  title="관심 시세창"
                  onClick={() => setWatchMode((m) => (m === 'hidden' ? 'float' : 'hidden'))}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill={effWatchMode !== 'hidden' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                    <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
                  </svg>
                </button>
              )}
              {!user ? (
                <button className="header-login-btn" onClick={onLoginClick}>로그인</button>
              ) : (
              <div className="header-avatar-wrap" ref={menuRef}>
                <button
                  className="header-avatar"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="프로필"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                </button>
                {menuOpen && (
                  <div className="header-menu" role="menu">
                    <div className="header-menu-user">
                      <div className="header-menu-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                      </div>
                      <div className="header-menu-meta">
                        <div className="header-menu-name">{user.name || user.username}</div>
                        <div className="header-menu-sub">@{user.username}</div>
                      </div>
                    </div>
                    <div className="header-menu-divider" />
                    <button className="header-menu-item" role="menuitem" onClick={onLogout}>
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </header>

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
        <aside className={`sidebar-panel${sidebarOpen ? ' open' : ''}`}>
          {sectionLocked && (
            <div className="sidebar-login-gate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <p className="sidebar-login-gate-msg">로그인이 필요한 서비스입니다</p>
            </div>
          )}
          <div className="sidebar-header">
            <span className="sidebar-title-wrap">
              {SECTIONS.find((s) => s.id === section)?.title}
            </span>
            {/* 원화/USD 전환은 내 잔고에만 적용되므로 내투자 섹션에서만 노출 */}
            {section === 'invest' && (
              <div className="sidebar-header-btns">
                <div className={`cur-switch${krw ? ' krw' : ''}`} onClick={() => setKrw((v) => !v)}>
                  <span className="cur-switch-label">$</span>
                  <span className="cur-switch-label">원</span>
                  <div className="cur-switch-thumb" />
                </div>
              </div>
            )}
          </div>

          {/* 내 투자 */}
          {section === 'invest' && (
            <div className={`sidebar-section${bothOn ? ' both-on' : ''}`} id="sidebar-invest">
              <div className="invest-tabs">
                {INVEST_TABS.map((t) => (
                  <button key={t} className={`invest-tab${investTab === t ? ' active' : ''}`} onClick={() => setInvestTab(t)}>{t}</button>
                ))}
              </div>

              {(investTab === '현물') ? (
                spotSkeleton ? <SidebarAssetSkeleton /> : (
                <div className="assets-scroll">
                  <div className="tas-hero">
                    <span className="tas-hero-label">총자산</span>
                    <div className="tas-hero-row">
                      <strong className="tas-hero-val">{spot.hasKey ? (krw ? Math.round(spotTotal * usdKrw).toLocaleString() : fmtAsset(spotTotal)) : '—'}</strong>
                      <span className="tas-cur">{curLabel}</span>
                    </div>
                    {spot.hasKey && (
                      <span className="tas-hero-approx">{krw ? `≈ ${fmtAsset(spotTotal)} USDT` : `≈ ${Math.round(spotTotal * usdKrw).toLocaleString()}원`}</span>
                    )}
                  </div>
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="tas-pos-title"><span>보유자산</span><span className="cnt">{spot.holdings.length}개</span></div>
                    <div className="tas-mkt-list">
                      {spotSorted.length === 0 && (
                        <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                          {spot.hasKey ? '보유 자산 없음' : 'API 키를 등록하면 표시됩니다.'}
                        </div>
                      )}
                      {spotSorted.map((h) => {
                        const cash = h.coin === 'USDT' || h.coin === 'USDC';
                        const costOk = h.avgCost != null && h.costReliable === true;
                        const price = spotPriceOf(h.coin);
                        const pnlPct = costOk ? (price / (h.avgCost as number) - 1) * 100 : null;
                        const pnlAmount = costOk ? (price - (h.avgCost as number)) * (h.available + h.frozen) : null;
                        const valStr = pnlAmount != null ? `${pnlAmount >= 0 ? '+' : '-'}${fmtCur(Math.abs(pnlAmount))}` : '—';
                        return (
                          <div
                            key={h.coin}
                            className="tas-mkt-row"
                            onClick={cash ? undefined : () => handleSelectChart(`${h.coin}USDT`, 'spot', 'BITGET')}
                            style={cash ? undefined : { cursor: 'pointer' }}
                          >
                            <span className={`tas-mkt-logo ${logoClass(h.coin)}`}>{h.coin.slice(0, 1)}</span>
                            <strong className="tas-mkt-sym">{h.coin}</strong>
                            <span className="tas-mkt-pnlval">{valStr}</span>
                            <span className="tas-mkt-amount">{fmtCur(spotValueOf(h))}</span>
                            <span className={`tas-mkt-roe-spot ${pnlPct != null ? (pnlPct >= 0 ? 'up' : 'down') : 'na'}`}>
                              {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : cash ? '' : '원가 조회불가'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                )
              ) : (
                <>
              <div className="view-filters">
                <button className={`view-chip${portfolioOn ? ' on' : ''}`} onClick={togglePortfolio}>포트폴리오</button>
                <button className={`view-chip${positionsOn ? ' on' : ''}`} onClick={togglePositions}>포지션</button>
              </div>

              {mainSkeleton ? <SidebarAssetSkeleton /> : (
              <div className="assets-scroll">
                <div className="tas-hero">
                  <span className="tas-hero-label">총자산</span>
                  <div className="tas-hero-row">
                    <strong className={`tas-hero-val${mainVal.length > 11 ? ' tas-hero-val--compact' : ''}`}>{mainVal}</strong>
                    <span className="tas-cur">{curLabel}
                      <svg className="tas-cur-ico" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 3 20 7 16 11" />
                        <line x1="20" y1="7" x2="5" y2="7" />
                        <polyline points="8 21 4 17 8 13" />
                        <line x1="4" y1="17" x2="19" y2="17" />
                      </svg>
                    </span>
                    {hasKey && (
                      <button type="button" className={`tas-wallet-toggle${walletOpen ? ' open' : ''}`} aria-label="지갑 상세" onClick={() => setWalletOpen((v) => !v)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {hasKey && <span className="tas-hero-approx">{approx}</span>}
                  <div className={`tas-wallet-wrap${walletOpen ? ' open' : ''}`}>
                    <div className="tas-wallet-detail">
                      <div className="tas-wallet-col">
                        <span className="tas-wallet-k">지갑 잔고</span>
                        <span className="tas-wallet-v">{fmtCur(available)}</span>
                        <span className="tas-wallet-approx">{approxCur(available)}</span>
                      </div>
                      <div className="tas-wallet-col">
                        <span className="tas-wallet-k">미실현 손익</span>
                        <span className={`tas-wallet-v ${unrealTotal >= 0 ? 'up' : 'down'}`}>{unrealTotal >= 0 ? '+' : '-'}{fmtCur(Math.abs(unrealTotal))}</span>
                        <span className="tas-wallet-approx">{approxCur(unrealTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {portfolioOn && (
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="tas-pos-title">
                      <span>포트폴리오</span>
                      <span className="cnt">{positions.length}개</span>
                    </div>
                    <div className="tas-mkt-list">
                      {positions.length === 0 && (
                        <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                          {hasKey ? '보유 포지션 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
                        </div>
                      )}
                      {positions.map((p, i) => {
                        const base = p.symbol.replace(/USDT$|USDC$/, '');
                        const up = p.unrealizedPl >= 0;
                        const roe = calcRoe(p);
                        return (
                          <div key={p.symbol + p.direction} className="tas-mkt-row" onClick={() => { setSelPosIdx(i); handleSelectChart(p.symbol, 'futures', 'BITGET'); }}>
                            <span className={`tas-mkt-logo ${logoClass(base)}`}>{base.slice(0, 1)}</span>
                            <span className="tas-mkt-sym">{base}</span>
                            <span className={`tas-mkt-pnlval ${up ? 'up' : 'down'}`}>{up ? '+' : '-'}{fmtCur(Math.abs(p.unrealizedPl))}</span>
                            <span className="tas-mkt-badges">
                              <span className={`tas-mkt-badge dir ${p.direction}`}>{p.direction === 'long' ? 'Long' : 'Short'}</span>
                              <span className="tas-mkt-badge lev">{Math.round(p.leverage)}x</span>
                            </span>
                            <span className={`tas-mkt-roe ${roe >= 0 ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {positionsOn && (
                  <div className="view-group">
                    <div className="tas-divider" />
                    <div className="pos-tabs">
                      <span className="pos-tab active">Positions <span className="cnt">({positions.length})</span></span>
                      <span className="pos-tab">Orders <span className="cnt">({trade.orders.length})</span></span>
                      <span className="pos-show"><input type="checkbox" /> Show current</span>
                    </div>
                    {selPos ? (() => {
                      const up = selPos.unrealizedPl >= 0;
                      const roe = calcRoe(selPos);
                      return (
                        <div className="pos-card">
                          <div className="pos-sym">{selPos.symbol} &nbsp;›</div>
                          <div className="pos-badges">
                            <span className={`tas-mkt-badge dir ${selPos.direction}`}>{selPos.direction === 'long' ? 'Long' : 'Short'}</span>
                            <span className="tas-mkt-badge lev">{Math.round(selPos.leverage)}x</span>
                            <span className="tas-mkt-badge lev">{selPos.marginMode === 'isolated' ? 'Isolated' : 'Cross'}</span>
                            <span className="tas-mkt-badge lev">USDT</span>
                          </div>
                          <div className="pos-row">
                            <div>
                              <div className="pos-k">Unrealized PnL ({curLabel})</div>
                              <div className={`pos-v ${up ? 'up' : 'down'}`}>{up ? '+' : '-'}{fmtCur(Math.abs(selPos.unrealizedPl))}</div>
                              <div className="pos-vsub">≈ ${selPos.unrealizedPl.toFixed(2)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="pos-k">ROE</div>
                              <div className={`pos-v ${roe >= 0 ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</div>
                            </div>
                          </div>
                          <div className="pos-grid3">
                            <div><div className="pos-k">Size (USDT)</div><div className="pos-v2">{selPos.size.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div></div>
                            <div><div className="pos-k">Margin (USDT)</div><div className="pos-v2">{selPos.margin.toLocaleString('en-US', { maximumFractionDigits: 4 })}</div></div>
                            <div style={{ textAlign: 'right' }}><div className="pos-k">MMR</div><div className="pos-v2">{(selPos.mmr * 100).toFixed(2)}%</div></div>
                          </div>
                          <div className="pos-grid3">
                            <div><div className="pos-k">Entry price</div><div className="pos-v2">{selPos.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
                            <div><div className="pos-k">Mark price</div><div className="pos-v2">{selPos.markPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div></div>
                            <div style={{ textAlign: 'right' }}><div className="pos-k">Est. liq. price</div><div className="pos-v2" style={{ color: '#f0a030' }}>{selPos.liqPrice > 0 ? selPos.liqPrice.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</div></div>
                          </div>
                          <div className="pos-realized">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>Realized PnL ({curLabel})</span>
                              <span className="v" style={{ color: selPos.realizedPl >= 0 ? 'var(--up)' : 'var(--down)' }}>{selPos.realizedPl >= 0 ? '+' : '-'}{fmtCur(Math.abs(selPos.realizedPl))}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                              <span>Entire TP/SL</span>
                              <span className="v">
                                <span style={{ color: 'var(--up)' }}>{selPos.takeProfit > 0 ? selPos.takeProfit.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                                {' / '}
                                <span style={{ color: 'var(--down)' }}>{selPos.stopLoss > 0 ? selPos.stopLoss.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <div style={{ color: 'var(--text3)', fontSize: 12, padding: '12px 0' }}>
                        {hasKey ? '보유 포지션 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
                </>
              )}

              <div className="tas-notice">조회 전용 · 주문은 거래소 앱에서</div>
            </div>
          )}

          {section === 'market' && (
            <div className="sidebar-section web-market">
              <MarketPanel active={marketActive} onSelect={handleSelectChart} />
            </div>
          )}
          {section === 'strategy' && (
            <div className="sidebar-section">
              <StrategyComingSoon compact />
            </div>
          )}
        </aside>

        {/* 아이콘 레일 (항상 보임) */}
        <nav className="sidebar-icons">
          <button className={`si-btn si-fold-btn${!sidebarOpen ? ' folded' : ''}`} onClick={() => setSidebarOpen((v) => !v)}>
            <svg className="si-fold-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.41 6 5 7.41 9.58 12 5 16.59 6.41 18l6-6-6-6zm8 0-1.41 1.41L17.58 12l-4.58 4.59L14.41 18l6-6-6-6z" />
            </svg>
          </button>
          <div className="si-divider" />
          <button className={`si-btn${section === 'invest' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('invest')}>
            <svg className="si-bolt" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" /></svg>
            <span>내 투자</span>
          </button>
          <div className="si-divider" />
          <button className={`si-btn${section === 'strategy' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('strategy')}>
            <img className="si-strategy-icon" src={botzMark} alt="" aria-hidden="true" />
            <span>전략</span>
          </button>
          <button className={`si-btn${section === 'market' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('market')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14c0 4.22 3.8 7.99 8 8 4.28.02 7.96-3.77 8-8.02.03-1.81-.35-3.9-.52-1.63z" /></svg>
            <span>실시간</span>
          </button>
        </nav>

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
