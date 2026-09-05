import { useEffect, useRef, useState } from 'react';
import type { DepthPrecision } from '../../../api/exchange/bitget/bitgetMergeDepth';
import { krwDecimals } from '../../../api/exchange/krw/krwTickers';
import { EXCHANGES } from '../../../shared/constants/exchanges';
import { useOrderbook } from '../../../hooks/market/useOrderbook';
import { useFundingRate } from '../../../hooks/market/useFundingRate';
import { usePricePrecision } from '../../../hooks/market/usePricePrecision';
import { depthLabelFor, aggregateLevels } from '../lib/orderbook';
import type { DesktopExchange } from './useDesktopCandles';

// Desktop 호가 — 구독·펀딩·묶음(aggregate)·자릿수·통합 스냅샷(OB). DesktopApp에서 옮김 (wp-06 d03).
// livePrice·loadedSymbol은 useLivePrice 결과(거래소 티커 현재가·seed 완료 종목)를 받는다 — wp-08 d02 전엔 useDesktopCandles 결과였다.
export function useOrderbookSnapshot({ symbol, exchange, isFutures, isKrw, livePrice, loadedSymbol }: {
  symbol: string;
  exchange: DesktopExchange;
  isFutures: boolean;
  isKrw: boolean;
  livePrice: number | null;
  loadedSymbol: string | null | undefined;
}) {
  const [depthScale, setDepthScale] = useState<DepthPrecision>('scale3'); // 디폴트=가장 굵은 단위
  const { getTickDecimals } = usePricePrecision(2);
  const orderbook = useOrderbook(symbol, depthScale, isFutures, true, exchange, false);
  const funding = useFundingRate(
    symbol,
    (exchange === 'BITGET' || exchange === 'BINANCE') && isFutures,
    exchange === 'BINANCE' ? 'BINANCE' : 'BITGET',
  );
  const scaleIndex = Number(depthScale.replace('scale', ''));
  // 종목별 틱 소수점(precisionMap 조회). KRW는 맵에 없어 기본값으로 빠지므로 원(정수)=0으로 보정.
  const symbolDecimals = isKrw ? 0 : getTickDecimals(symbol);
  const obStep = Math.pow(10, scaleIndex - symbolDecimals); // 선택 단위(묶음 크기)
  // 호가 가격 소수자리는 KRW일 때 현재가 기준(krwDec)이 필요해 centerPrice 이후에서 계산(아래).
  // Bitget=API 묶음(precision), Binance=클라 묶음(obStep), KRW(업비트/빗썸)=네이티브 호가 그대로
  // (호가 개수가 적어(30/15) 묶으면 행이 확 줄어 의미 없음 → 묶음 미적용·드롭다운 숨김).
  const useClientAgg = exchange === 'BINANCE';
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
  const depthSelectable = !isKrw;
  // ×100(scale3)은 Bitget 선물 전용(서버 묶음). 그 외(Bitget 현물/타 거래소)는 ×10까지 —
  // 타 거래소는 클라 묶음이라 ×100이면 받는 범위($)가 부족해 6행을 못 채움.
  const depthSteps = (exchange === 'BITGET' && isFutures) ? [0, 1, 2, 3] : [0, 1, 2];
  const depthOptions = depthSteps.map((i) => ({ scale: `scale${i}` as DepthPrecision, label: depthLabelFor(i, symbolDecimals) }));
  const depthLabel = depthLabelFor(scaleIndex, symbolDecimals);

  // 호가 중앙 현재가 = 티커 현재가(livePrice)로 헤더와 통일. livePrice 없을 때만 호가 mid 폴백.
  const centerPrice = livePrice ?? midPrice;
  // KRW 표시 소수자리 = 마켓 리스트와 동일 함수(krwDecimals(현재가)) — 저가 코인(100원 미만) 소수자리 일치.
  // (차트축·헤더·호가가 전부 이 값을 써서 실시간마켓과 어긋나지 않음. 100원 이상은 0자리라 무영향)
  const krwDec = krwDecimals(centerPrice ?? 0);
  // 호가 가격 소수자리: KRW=krwDec, 그 외=선택 단위에 맞춰(틱×10^i)
  const obDecimals = isKrw ? krwDec : Math.max(0, symbolDecimals - scaleIndex);
  const midDecimals = isKrw ? krwDec : symbolDecimals;

  // 자릿수(묶음) 단위: 종목 바뀌면 기본(scale2), 현물은 scale3 미지원 → scale2로
  // 종목/거래소/마켓이 바뀌면 그 조합의 "가장 굵은 단위"를 디폴트로(Bitget 선물=scale3, 그 외=scale2)
  useEffect(() => {
    setDepthScale((exchange === 'BITGET' && isFutures) ? 'scale3' : 'scale2');
  }, [symbol, exchange, isFutures]);

  // ── 호가 통합 스냅샷(OB) — 헤더처럼 "현재 종목 호가+현재가가 준비되면" 좌·우 통째 교체 ──
  // obReady: 현재 호가(orderbook.key가 현재 거래소|심볼|선물여부)와 현재가(livePrice)가 모두 현재 종목 것.
  // 준비 전(전환 중)엔 직전 스냅샷(행/소수자리/라벨/펀딩 묶음)을 그대로 유지 → 부분 도착으로 칸 밀림/섞임 없음.
  const obKey = `${exchange}|${symbol}|${isFutures}`;
  const obReady = orderbook?.key === obKey && loadedSymbol === symbol && livePrice != null;
  const obRef = useRef<{
    asks: { price: number; size: number }[]; bids: { price: number; size: number }[];
    maxLevelSize: number; buyPct: number; center: number; obDec: number; midDec: number;
    depthLabel: string; quoteLabel: string; funding: string;
  } | null>(null);
  // 원시 호가가 비워졌으면(useOrderbook이 빈 응답 3회 뒤 null) 표시 스냅샷도 비운다 — clearOnChange=false라 종목 전환으로는 null이 되지 않으므로 전환 중 유지 동작과 충돌하지 않는다(4차 리뷰 P1)
  if (orderbook === null) obRef.current = null;
  if (obReady) {
    obRef.current = {
      asks: askRows, bids: bidRows, maxLevelSize, buyPct, center: livePrice,
      obDec: obDecimals, midDec: midDecimals, depthLabel,
      quoteLabel: EXCHANGES[exchange].quote, funding,
    };
  }
  const OB = obRef.current;
  const obFmtPrice = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: OB?.obDec ?? 2, maximumFractionDigits: OB?.obDec ?? 2 });
  const obFmtMid = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: OB?.midDec ?? 2, maximumFractionDigits: OB?.midDec ?? 2 });

  return { OB, obFmtPrice, obFmtMid, centerPrice, krwDec, getTickDecimals, depthScale, setDepthScale, depthSelectable, depthOptions, depthLabel, orderbook, funding };
}
