import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useOrderbook } from '../../../hooks/market/useOrderbook';
import { useFundingRate } from '../../../hooks/market/useFundingRate';
import type { DepthPrecision } from '../../../api/exchange/bitget/bitgetMergeDepth';

// 호가 단위(묶음) 라벨 — 심볼 최소 틱(소수점)을 1번으로, ×10씩. scale0=최소틱 … scale3=틱×1000.
// 예: BTC(소수1자리) → 0.1/1/10/100, ETH(소수2자리) → 0.01/0.1/1/10
function depthLabelFor(scaleIndex: number, symbolDecimals: number): string {
  const dec = Math.max(0, symbolDecimals - scaleIndex);
  const value = Math.pow(10, scaleIndex - symbolDecimals);
  return value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Mobile 거래 탭 호가 — Bitget merge-depth 폴링·펀딩비·단위 옵션·현재가 방향·원자 커밋 스냅샷.
// OrderPage에서 로직만 옮김 (wp-07 d03). depthScale 상태는 OrderPage가 소유(시트·종목 전환 effect가 같이 씀).
export function useMobileOrderbook({ symbol, active, isTradeView, isFuturesMarket, isDemoExchange, tradable, depthScale, setDepthScale, getTickDecimals, realtimePrices }: {
  symbol: string;
  active: boolean | undefined;
  isTradeView: boolean;
  isFuturesMarket: boolean;
  isDemoExchange: boolean;
  tradable: boolean;
  depthScale: DepthPrecision;
  setDepthScale: Dispatch<SetStateAction<DepthPrecision>>;
  getTickDecimals: (symbol: string) => number;
  realtimePrices: Record<string, number | undefined>;
}) {
  // ── 호가창(비트겟 merge-depth 폴링, 선택 단위로 서버 합산) ──
  // 트레이드 뷰 + 비트겟 지원 종목일 때만 폴링(미지원 종목 merge-depth 400 방지, Bot 뷰에선 불필요)
  // clearOnChange=false: 종목/마켓 전환 시 빈 호가 대신 이전 호가를 유지하다 새 호가로 교체(아래 원자 커밋과 세트)
  const orderbook = useOrderbook(symbol, depthScale, isFuturesMarket, !!active && isTradeView && tradable && !isDemoExchange, 'BITGET', false); // 선물=mix / 현물=spot
  // 펀딩비(선물 전용) — Bitget current-fund-rate 조회 + 1초 카운트다운
  const fundingStr = useFundingRate(symbol, !!active && isTradeView && isFuturesMarket && tradable && !isDemoExchange);
  // 현물은 "100"(scale3) 미지원 → 선택돼 있으면 한 단계 낮춰 호가 깨짐 방지.
  useEffect(() => {
    if (!isFuturesMarket && depthScale === 'scale3') setDepthScale('scale2');
  }, [isFuturesMarket, depthScale]); // 원본 의존성 유지(setter는 안정)
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

  return { askRows, bidRows, maxLevelSize, buyPct, centerPrice, priceDir, depthOptions, depthLabel, fmtMid, fmtPriceOb, fundingStr, obSnap };
}
