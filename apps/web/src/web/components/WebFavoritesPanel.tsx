// 사이드바 '관심' 섹션 — 마켓에서 별표로 담은 즐겨찾기 목록.
// 즐겨찾기 키(거래소|마켓|심볼)별로 해당 거래소 종목을 로드해 시세를 붙이고, 비트겟/바이낸스는 WS로 실시간 갱신.
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  subscribeBitgetSpotTickers, subscribeBitgetFuturesTickers,
  subscribeBinanceSpotTickers, subscribeBinanceFuturesTickers,
  type RealtimeTicker,
} from '../../api/server/coinRealtime';
import { usePricePrecision } from '../../hooks/market/usePricePrecision';
import { useDelayedReady } from '../../hooks/ui/useDelayedReady';
import type { CoinTicker } from '../../types/market';
import type { ExchangeId } from '../../constants/exchanges';
import { WebSymbolRow, loadExchangeTickers, parseFav, isDivider, dividerType, dividerLabel, withDividerLabel, useWebFavorites, useCoinLogos, type Market } from './marketShared';

// 드래그한 키를 타깃 키 위치로 이동(필터 무관하게 키 기준으로 favs 재배치)
function moveKey(arr: string[], fromKey: string, toKey: string): string[] {
  if (fromKey === toKey) return arr;
  const next = arr.filter((k) => k !== fromKey);
  const ti = next.indexOf(toKey);
  if (ti < 0) return arr;
  next.splice(ti, 0, fromKey);
  return next;
}

export function WebFavoritesPanel({ active, onSelect, editMode = false }: { active: boolean; onSelect?: (symbol: string, market: Market, exchange: ExchangeId) => void; editMode?: boolean }) {
  const { favs, isFav, toggleFav, setOrder, removeKey } = useWebFavorites();
  const dragKeyRef = useRef<string | null>(null);
  const logos = useCoinLogos();
  // 거래소|마켓|심볼 → ticker (폴링 기준값) / liveMap (WS 실시간 덮어쓰기)
  const [tickerMap, setTickerMap] = useState<Record<string, CoinTicker>>({});
  const [liveMap, setLiveMap] = useState<Record<string, RealtimeTicker>>({});
  const { precisionMap } = usePricePrecision();
  const getDecimals = useCallback((t: CoinTicker) => precisionMap.get(t.symbol) ?? t.tickDecimals, [precisionMap]);

  const favsKey = favs.join(',');

  // 즐겨찾기에 등장하는 거래소만 로드(기준값) — 5초 폴링
  useEffect(() => {
    if (!active || favs.length === 0) { setTickerMap({}); return; }
    let ignore = false;
    const exchanges = Array.from(new Set(favs.filter(f => !isDivider(f)).map(f => parseFav(f).exchange)));
    const load = async () => {
      const map: Record<string, CoinTicker> = {};
      await Promise.all(exchanges.map(async (ex) => {
        const { spot, futures } = await loadExchangeTickers(ex);
        spot.forEach(t => { map[`${ex}|spot|${t.symbol}`] = t; });
        futures.forEach(t => { map[`${ex}|futures|${t.symbol}`] = t; });
      }));
      if (!ignore) setTickerMap(map);
    };
    load();
    const id = setInterval(load, 5000);
    return () => { ignore = true; clearInterval(id); };
  }, [active, favsKey]);

  // 거래소|마켓 → 심볼[] 그룹 (WS 구독 단위)
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    favs.forEach(f => { if (isDivider(f)) return; const { exchange, market } = parseFav(f); const k = `${exchange}|${market}`; (g[k] ||= []).push(parseFav(f).symbol); });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favsKey]);
  const groupsKey = JSON.stringify(groups);

  // 비트겟/바이낸스 WS 구독(업비트/빗썸은 백엔드 WS 없음 → 폴링값)
  useEffect(() => {
    if (!active) return;
    const subs: Array<{ close: () => void }> = [];
    Object.entries(groups).forEach(([k, symbols]) => {
      if (!symbols.length) return;
      const [ex, market] = k.split('|');
      const cb = (tk: RealtimeTicker) => setLiveMap(prev => ({ ...prev, [`${ex}|${market}|${tk.symbol}`]: tk }));
      if (ex === 'BITGET') subs.push(market === 'spot' ? subscribeBitgetSpotTickers(symbols, cb) : subscribeBitgetFuturesTickers(symbols, cb));
      else if (ex === 'BINANCE') subs.push(market === 'spot' ? subscribeBinanceSpotTickers(symbols, cb) : subscribeBinanceFuturesTickers(symbols, cb));
    });
    return () => subs.forEach(s => s.close());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, groupsKey]);

  // 즐겨찾기 순서대로 항목 생성 — 구분선은 항상, 심볼은 시세 매칭된 것만 (WS 실시간값 우선)
  type Item =
    | { type: 'divider'; key: string; label: string; dtype: ReturnType<typeof dividerType> }
    | { type: 'symbol'; key: string; exchange: ExchangeId; market: Market; t: CoinTicker };
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const key of favs) {
      if (isDivider(key)) { out.push({ type: 'divider', key, label: dividerLabel(key), dtype: dividerType(key) }); continue; }
      const { exchange, market, symbol } = parseFav(key);
      const mapKey = `${exchange}|${market}|${symbol}`;
      const base = tickerMap[mapKey];
      if (!base) continue;
      const live = liveMap[mapKey];
      // 거래대금은 REST(24h) 유지 — WS volume은 kline UTC누적이라 24h와 충돌(가격·등락만 실시간)
      const t: CoinTicker = live ? { ...base, last: live.price ?? base.last, changeRate: live.changeRate ?? base.changeRate } : base;
      out.push({ type: 'symbol', key, exchange, market, t });
    }
    return out;
  }, [favs, tickerMap, liveMap]);

  // 실시간 패널과 동일: 시세 매칭 전엔 스켈레톤, 준비되면 .wm-list-fade로 페이드인
  const listReady = useDelayedReady(items.length > 0);

  if (favs.length === 0) {
    return <p className="wm-empty">관심종목이 없어요.<br />마켓에서 별표를 눌러 추가하세요.</p>;
  }

  return (
    <div className="wm">
      <div className="wm-list" style={{ paddingTop: 4 }}>
        {!listReady ? (
          Array.from({ length: Math.min(favs.length, 12) }).map((_, i) => (
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
            {items.map((item) => {
              const key = item.key;
              const dragProps = editMode ? {
                draggable: true,
                onDragStart: () => { dragKeyRef.current = key; },
                onDragOver: (e: React.DragEvent) => e.preventDefault(),
                onDragEnter: (e: React.DragEvent<HTMLDivElement>) => { if (dragKeyRef.current && dragKeyRef.current !== key) e.currentTarget.classList.add('wm-row-dragover'); },
                onDragLeave: (e: React.DragEvent<HTMLDivElement>) => e.currentTarget.classList.remove('wm-row-dragover'),
                onDrop: (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.classList.remove('wm-row-dragover'); const from = dragKeyRef.current; if (from) setOrder(moveKey(favs, from, key)); dragKeyRef.current = null; },
                onDragEnd: () => { dragKeyRef.current = null; },
              } : undefined;
              if (item.type === 'divider') {
                // 라벨 편집이 가능해야 하므로 행 전체 draggable 대신 드롭 핸들러만 행에, 드래그 소스는 ≡ 핸들에.
                const dropProps = dragProps ? { onDragOver: dragProps.onDragOver, onDragEnter: dragProps.onDragEnter, onDragLeave: dragProps.onDragLeave, onDrop: dragProps.onDrop } : undefined;
                const hasText = item.dtype !== 'line'; // text · both
                const hasRule = item.dtype === 'line';  // line만 가로 줄(both은 border-top)
                return (
                  <div key={key} className={`wm-divider wm-divider-${item.dtype}${editMode ? ' wm-divider-edit' : ''}`} {...(dropProps ?? {})}>
                    {editMode && (
                      <span className="wm-drag" aria-hidden="true" draggable onDragStart={() => { dragKeyRef.current = key; }} onDragEnd={() => { dragKeyRef.current = null; }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
                      </span>
                    )}
                    {hasText && (
                      <span
                        className="wm-divider-label"
                        contentEditable={editMode}
                        suppressContentEditableWarning
                        spellCheck={false}
                        onBlur={(e) => { const v = e.currentTarget.textContent?.trim() || '구분선'; if (v !== item.label) setOrder(favs.map((k) => (k === key ? withDividerLabel(key, v) : k))); }}
                      >{item.label}</span>
                    )}
                    {hasRule && <span className="wm-divider-rule" aria-hidden="true" />}
                    {editMode && (
                      <button type="button" className="wm-row-remove" onClick={() => removeKey(key)} aria-label="구분선 삭제">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    )}
                  </div>
                );
              }
              const { exchange, market, t } = item;
              return (
                <WebSymbolRow
                  key={key}
                  ticker={t}
                  market={market}
                  decimals={getDecimals(t)}
                  faved={isFav(exchange, t.symbol, market)}
                  onToggleFav={() => toggleFav(exchange, t.symbol, market)}
                  onClick={() => onSelect?.(t.symbol, market, exchange)}
                  logoUrl={logos[t.baseSymbol]}
                  editMode={editMode}
                  onRemove={() => toggleFav(exchange, t.symbol, market)}
                  dragProps={dragProps}
                  hideStar
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
