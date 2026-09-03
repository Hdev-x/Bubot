// 웹 마켓/관심 공용 — 행·로고·정렬아이콘·즐겨찾기 스토어·거래소 로더.
// 모바일 거래탭 종목 시트(TradeSymbolSheet)에서 복붙·각색. 데이터/유틸은 공유 계층만 사용.
import { useCallback, useEffect, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { fetchCoinFuturesTickers, fetchCoinTickers, fetchBinanceSpotTickers, fetchBinanceFuturesTickers, fetchCoinLogos } from '../../api/tpmApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../../api/krwTickers';
import { getOfficialLogo, formatPriceWithDecimals } from '../../utils/coinFormatters';
import type { CoinTicker } from '../../types/market';
import type { ExchangeId } from '../../constants/exchanges';

export type Market = 'spot' | 'futures';

// 즐겨찾기 키 — 거래소까지 포함(관심 패널이 거래소별로 시세를 붙일 수 있게)
const FAV_KEY = 'web_market_favorites';
export const favKey = (exchange: ExchangeId, symbol: string, market: Market) => `${exchange}|${market}|${symbol}`;
export type FavParts = { exchange: ExchangeId; market: Market; symbol: string };
export function parseFav(key: string): FavParts {
  const [exchange, market, symbol] = key.split('|');
  return { exchange: exchange as ExchangeId, market: market as Market, symbol };
}
function loadFavs(): string[] {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
}

// 구분선 항목 — 즐겨찾기 배열에 같이 저장(순서 보존). 키 형식: #div#<id>#<type>::<라벨>. 심볼 키와 충돌 안 함.
// type: text(텍스트만) / line(선만) / both(텍스트+선). 구버전(#div#<id>::..)은 both로 간주.
export type DividerType = 'text' | 'line' | 'both';
const DIV_PREFIX = '#div#';
export const isDivider = (key: string) => key.startsWith(DIV_PREFIX);
export const makeDividerKey = (type: DividerType, label = '구분선') => `${DIV_PREFIX}${Date.now().toString(36)}#${type}::${label}`;
export const dividerType = (key: string): DividerType => {
  const head = key.slice(DIV_PREFIX.length).split('::')[0]; // <id>#<type> (구버전은 <id>)
  const t = head.split('#')[1];
  return t === 'text' || t === 'line' || t === 'both' ? t : 'both';
};
export const dividerLabel = (key: string) => { const i = key.indexOf('::'); return i < 0 ? '구분선' : key.slice(i + 2); };
// 라벨만 교체(id·type·위치 유지)
export const withDividerLabel = (key: string, label: string) => { const i = key.indexOf('::'); return `${i < 0 ? key : key.slice(0, i)}::${label}`; };

// 같은 탭의 여러 인스턴스(예: 관심패널 + 플로팅 미니창)가 즐겨찾기를 실시간 공유하도록 알리는 이벤트명.
const FAV_EVENT = 'web-favs-changed';

/** 즐겨찾기 스토어(localStorage). 같은 탭의 다른 인스턴스 토글도 즉시 반영(커스텀 이벤트) + 다른 탭은 storage 이벤트로 동기화. */
export function useWebFavorites() {
  const [favs, setFavs] = useState<string[]>(loadFavs);
  // 다른 인스턴스/탭에서 즐겨찾기가 바뀌면 최신값을 다시 읽어 미러링(미니창↔관심패널 양방향).
  useEffect(() => {
    const resync = () => setFavs(loadFavs());
    window.addEventListener(FAV_EVENT, resync);
    window.addEventListener('storage', resync);
    return () => { window.removeEventListener(FAV_EVENT, resync); window.removeEventListener('storage', resync); };
  }, []);
  const isFav = useCallback((exchange: ExchangeId, symbol: string, market: Market) => favs.includes(favKey(exchange, symbol, market)), [favs]);
  const toggleFav = useCallback((exchange: ExchangeId, symbol: string, market: Market) => {
    setFavs(prev => {
      const k = favKey(exchange, symbol, market);
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
      // 같은 탭의 다른 인스턴스에 즉시 통지(storage 이벤트는 같은 탭엔 안 와서 직접 디스패치).
      window.dispatchEvent(new Event(FAV_EVENT));
      return next;
    });
  }, []);
  // 편집(재정렬 등)으로 전체 순서를 교체 — 저장 + 다른 인스턴스 통지.
  const persist = useCallback((next: string[]) => {
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* 무시 */ }
    window.dispatchEvent(new Event(FAV_EVENT));
  }, []);
  const setOrder = persist;
  // 구분선(텍스트/선/둘다)을 맨 위에 추가(편집 모드에서 드래그로 원하는 위치로 이동).
  const addDivider = useCallback((type: DividerType = 'both') => {
    persist([makeDividerKey(type, type === 'line' ? '' : '구분선'), ...loadFavs()]);
  }, [persist]);
  // 키(심볼/구분선) 직접 제거.
  const removeKey = useCallback((key: string) => {
    persist(loadFavs().filter((k) => k !== key));
  }, [persist]);
  return { favs, isFav, toggleFav, setOrder, addDivider, removeKey };
}

// 백엔드 코인 로고맵(base→url) — 한 번만 fetch해 모듈 캐시. getOfficialLogo가 못 잡는 코인 보강.
let logoCache: Record<string, string> | null = null;
export function useCoinLogos(): Record<string, string> {
  const [logos, setLogos] = useState<Record<string, string>>(logoCache ?? {});
  useEffect(() => {
    if (logoCache) return;
    let ignore = false;
    fetchCoinLogos().then((m) => { logoCache = m; if (!ignore) setLogos(m); });
    return () => { ignore = true; };
  }, []);
  return logos;
}

// 토큰화 주식/지수 추정 — "변동 정확히 0% + 거래대금 큼(>1M)". 비트겟 xStocks 정렬 독식 제거.
export function isLikelyStock(t: CoinTicker): boolean {
  return Math.abs(t.changeRate) < 1e-9 && (t.volume || 0) > 1e6;
}

export function formatVolume(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(0);
}

// 원화 거래대금 — 조/억/만 단위 + '원' (업비트·빗썸). 예: "1조 2,345억원", "3,456억원", "1,234만원"
export function formatVolumeKrw(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1e12) {
    const jo = Math.floor(v / 1e12);
    const eok = Math.round((v % 1e12) / 1e8);
    return eok > 0 ? `${jo}조 ${eok.toLocaleString()}억원` : `${jo}조원`;
  }
  if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString()}억원`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${Math.round(v).toLocaleString()}원`;
}

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
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

function RowLogo({ base, logoUrl }: { base: string; logoUrl?: string }) {
  // 후보 순서: 공식(메이저) → 백엔드 gecko 맵(시총 상위 ~1500) → 유지되는 CDN(jsdelivr) → 글자.
  // onError마다 다음 후보로 넘어가고, 다 실패하면 컬러 글자 폴백.
  const candidates = [
    getOfficialLogo(base) || undefined,
    logoUrl,
    `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/${base.toLowerCase()}.png`,
  ].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  // 심볼/백엔드맵이 바뀌면 가장 좋은 후보부터 다시 시도
  useEffect(() => { setIdx(0); }, [base, logoUrl]);
  const url = candidates[idx];
  if (!url) return <span className="wm-row-logo wm-row-logo--fallback">{base.slice(0, 2)}</span>;
  return <span className="wm-row-logo"><img src={url} alt={base} onError={() => setIdx((i) => i + 1)} /></span>;
}

/** 종목 1행 — 로고 + (이름/거래대금) + (현재가/등락%) + 별표. 마켓·관심 공용.
 *  editMode: 좌측 드래그 핸들(≡) + 우측 별표→✕(제거), 행 draggable(dragProps). 기본 off=마켓 패널 보존. */
export function WebSymbolRow({
  ticker, market, decimals, faved, onToggleFav, onClick, logoUrl, editMode, onRemove, dragProps, hideStar,
}: {
  ticker: CoinTicker;
  market: Market;
  decimals: number;
  faved: boolean;
  onToggleFav: () => void;
  onClick?: () => void;
  logoUrl?: string;
  editMode?: boolean;
  onRemove?: () => void;
  dragProps?: HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
  hideStar?: boolean; // 보기 모드에서 별표 숨김(관심 목록은 이미 즐겨찾기라 불필요)
}) {
  // 원화 거래소(업비트·빗썸): 현재가에 '원' + 거래대금 조/억 표기
  const isKrw = ticker.quoteSymbol === 'KRW';
  return (
    <div className={`wm-row${editMode ? ' wm-row-edit' : ''}`} role="button" tabIndex={0} onClick={editMode ? undefined : onClick} {...(editMode ? dragProps : {})}>
      {editMode && (
        <span className="wm-drag" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </span>
      )}
      <RowLogo base={ticker.baseSymbol} logoUrl={logoUrl} />
      <div className="wm-row-info">
        <div className="wm-row-name">
          <strong>{isKrw ? (ticker.name || ticker.symbol) : (market === 'futures' ? `${ticker.symbol}.P` : ticker.symbol)}</strong>
          {market === 'futures' && <span className="wm-badge">Perp</span>}
        </div>
        <span>{isKrw ? formatVolumeKrw(ticker.volume) : formatVolume(ticker.volume)}</span>
      </div>
      <div className="wm-row-price">
        <strong>{formatPriceWithDecimals(ticker.last, decimals)}{isKrw ? '원' : ''}</strong>
        <span className={ticker.changeRate >= 0 ? 'up' : 'down'}>{ticker.changeRate >= 0 ? '+' : ''}{(ticker.changeRate * 100).toFixed(2)}%</span>
      </div>
      {editMode ? (
        <button type="button" className="wm-row-remove" onClick={(ev) => { ev.stopPropagation(); onRemove?.(); }} aria-label="관심 해제">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      ) : hideStar ? null : (
        <button type="button" className={`wm-row-star${faved ? ' on' : ''}`} onClick={(ev) => { ev.stopPropagation(); onToggleFav(); }} aria-label="관심종목">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** 거래소별 현물/선물 종목 로드 (관심 패널이 거래소별로 시세 매칭에 사용) */
export async function loadExchangeTickers(ex: ExchangeId): Promise<{ spot: CoinTicker[]; futures: CoinTicker[] }> {
  if (ex === 'BITGET') {
    const [spot, futures] = await Promise.all([fetchCoinTickers(), fetchCoinFuturesTickers()]);
    return {
      spot: spot.filter(t => t.quoteSymbol === 'USDT' && !isLikelyStock(t)),
      futures: futures.filter(t => t.quoteSymbol === 'USDT' && !isLikelyStock(t)),
    };
  }
  if (ex === 'BINANCE') {
    const [spot, futures] = await Promise.all([fetchBinanceSpotTickers(), fetchBinanceFuturesTickers()]);
    return { spot: spot.filter(t => t.quoteSymbol === 'USDT'), futures: futures.filter(t => t.quoteSymbol === 'USDT') };
  }
  if (ex === 'UPBIT') return { spot: await fetchUpbitSpotTickers(), futures: [] };
  if (ex === 'BITHUMB') return { spot: await fetchBithumbSpotTickers(), futures: [] };
  return { spot: [], futures: [] };
}
