import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeBinanceCandle, subscribeBinanceKline, subscribeCoinCandle } from '../../api/server/coinRealtime';
import { subscribeKrwCandle } from '../../api/exchange/krw/krwRealtime';
import { subscribeBitgetKline } from '../../api/exchange/bitget/klineRealtime';
import type { CandleMessage } from '../../api/server/coinRealtime';
import type { Candle } from '../../shared/types/market';
import { chartKey, resolveExchange } from './marketKey';
import { INTERVAL_SECONDS, canApplyCandle, canApplyPrice, classifyIncomingBar, mergeRefresh, shouldDropResponse } from './candleState';

type TimeframeOption = {
  granularity: string;
  channel: string;
};

type LoadCandles = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;

// 과거 페이징 버퍼 상한(봉 개수). 10000봉 = 1H ~13.7개월 / 4H ~4.6년 / 1D ~27년.
// 이 이상은 더 불러오지 않아 메모리·렌더 비용을 일정하게 유지한다.
const MAX_CANDLES = 10000;

type Ticker = {
  time: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type Params = {
  symbol: string;
  productType?: string;
  isBinance: boolean;
  isFutures: boolean;
  timeframe: TimeframeOption;
  loadCandles: LoadCandles;
  fallbackCandles: Candle[];
  getBucketTime: (timestamp: number, granularity: string) => number;
  initialLimit?: number;
  active?: boolean; // 차트 화면이 떠 있을 때만 실시간 캔들 WS 구독
  clearOnSymbolChange?: boolean; // 종목/TF 변경 시 즉시 비울지(기본 true). false면 새 데이터 도착까지 이전 캔들 유지(깜빡임 방지)
  exchange?: 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB'; // KRW는 업비트/빗썸 직결 WS로 현재가 구독(미지정 시 isBinance 기준)
  // (wp-08 d03) priceFromTicker 옵션 제거 — 거래소 티커 기반 현재가는 hooks/market/useLivePrice가 담당한다. 이 훅의 livePrice는 '차트 TF 마지막 종가'(Mobile 차트 헤더용)만 뜻한다.
  liveCandle?: boolean; // Binance/Bitget=kline WS(현재 캔들 OHLCV 실시간), KRW=REST 폴링으로 거래량 갱신(기본 false=모바일 티커 경로)
};

export function useCoinCandles({
  symbol,
  productType,
  isBinance,
  isFutures,
  timeframe,
  loadCandles,
  fallbackCandles,
  getBucketTime,
  initialLimit = 60,
  active = true,
  clearOnSymbolChange = true,
  exchange,
  liveCandle = false,
}: Params) {
  // 현재 선택의 마켓 키(거래소|현선물|심볼|TF). 모든 가드·ref가 이 키를 쓴다(wp-09 d01 — 예전 `${symbol}|${tf}`는 거래소·현선물을 구분하지 못했다).
  const marketKey = chartKey(resolveExchange(exchange, isBinance), isFutures, symbol, timeframe.granularity);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [openPrice, setOpenPrice] = useState<number | null>(null);
  const [dailyOpenPrice, setDailyOpenPrice] = useState<number | null>(null);
  // 실제 데이터(캔들+일봉시가) 로드가 끝난 심볼. Mobile 차트 헤더가 "준비된 종목"만 표시하도록(스테이지드 스왑).
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null);
  // 화면 candles 배열이 어느 마켓 키 것인지 — candlesKeyRef를 state로 미러(렌더 중 ref 접근 금지 규칙).
  // Desktop 차트 소수점·지표 스테이징이 쓴다 (wp-08 d02 → wp-09 d01: 심볼에서 키로). candlesKeyRef를 설정하는 곳에서 함께 갱신.
  const [candlesKey, setCandlesKey] = useState<string | null>(null);
  const isLoadingMore = useRef(false);
  const prevSymbolKeyRef = useRef<string | null>(null);
  // "로드가 끝난 심볼|TF" 키. WS 틱은 이 키가 현재와 일치할 때만 반영한다.
  // → 전환 직후(로드 전)엔 잔존 WS 틱이나 새 종목 WS가 livePrice를 먼저 바꾸지 못하게 막아,
  //   현재가·일봉시가가 옛 종목끼리 일관 유지되다가 로드 시 한 번에 새 값으로 교체(등락 깜빡임/섞임 방지).
  const loadedKeyRef = useRef('');
  // 화면의 candles 배열이 어느 "심볼|TF" 것인지. loadedKeyRef는 티커만 성공해도 열리므로
  // (미지원 TF에서 현재가 갱신용) 캔들 fetch가 실패해 이전 종목 캔들이 남아 있을 때
  // 새 종목 WS 봉이 그 위에 이어붙는 것(가격 절벽·초대형 꼬리)은 이 키로 따로 막는다.
  const candlesKeyRef = useRef('');
  // 자동 재조회(WS 갭 감지·탭 복귀) 레이트리밋용 마지막 실행 시각(ms)
  const lastAutoRefreshRef = useRef(0);
  // WS 콜백에서 refresh를 부르기 위한 ref(구독 effect deps에 refreshCandles를 넣으면 재구독 유발)
  const autoRefreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let ignore = false;
    // 종목/타임프레임이 바뀐 경우에만 캔들을 비운다 — 이전 종목 잔상("차트 열리고 종목 바뀌는 느낌") 방지.
    // productType/exchange가 단계적으로 settling되는 thrash엔 비우지 않아 디바운스+블랭크 억제 효과 유지.
    const symbolKey = marketKey; // 거래소·현선물이 바뀌어도 '전환'으로 본다(같은 심볼 다른 거래소 → 재로드·재구독)
    const cleared = prevSymbolKeyRef.current !== null && prevSymbolKeyRef.current !== symbolKey;
    // 종목/타임프레임이 바뀌면 이전 종목 잔상을 즉시 비운다("차트 열리고 종목 바뀌는 느낌" 방지).
    // clearOnSymbolChange=false면 비우지 않고 새 데이터 도착 시 교체(웹: 클릭 전환 깜빡임 방지).
    if (cleared && clearOnSymbolChange) setCandles([]);
    // livePrice·dailyOpen은 비우지 않고 옛 값 유지 → 로드 완료 시 loadChart에서 함께 새 값으로 교체.
    // (그 사이 WS는 loadedKeyRef 가드로 막혀 옛 값을 안 흔듦 → 등락이 사라지거나 섞이지 않음)
    prevSymbolKeyRef.current = symbolKey;
    async function loadChart() {
      try {
        // 차트 캔들(선택 TF) + 일봉시가(등락용)를 한 번에 받는다(원자적 커밋 — 등락 계산에 옛값/새값이 섞이지 않게).
        const [nextCandles, dailyCandles] = await Promise.all([
          loadCandles(timeframe.granularity, initialLimit),
          loadCandles('1Dutc', 2),
        ]);
        if (ignore) return;
        // 차트 캔들
        if (nextCandles.length) {
          setCandles(nextCandles);
          candlesKeyRef.current = symbolKey; // 캔들 배열이 이 심볼|TF 것임 → WS 봉 반영 허용
          setCandlesKey(symbolKey);
          setOpenPrice(nextCandles[nextCandles.length - 1]?.open ?? null);
        } else {
          setCandles(prev => prev.length ? prev : fallbackCandles);
        }
        if (dailyCandles.length > 0) setDailyOpenPrice(dailyCandles[dailyCandles.length - 1].open);
        // 현재가 = 차트 TF 마지막 종가(Mobile). 캔들이 비면(미지원 TF) 현재가도 갱신하지 않는다.
        const px = nextCandles.length ? nextCandles[nextCandles.length - 1].close : null;
        if (px != null) {
          setLivePrice(px);
          loadedKeyRef.current = symbolKey; // 로드 완료 → 이후 WS 틱(=최신가) 반영 허용
          setLoadedSymbol(symbol);          // 헤더 스테이지드 스왑용
        }
      } catch {
        if (!ignore) setCandles(prev => prev.length ? prev : fallbackCandles);
      }
    }
    // 종목/TF가 실제로 바뀐 경우(cleared)는 즉시 로드 — 탭하자마자 새 종목 로드를 시작해
    // 차트 도착 전에 끝나게(이전 종목 잔상 방지). productType/exchange만 단계적으로 settling되는
    // thrash(같은 종목)는 60ms 디바운스로 합쳐 다중 재로드를 막는다.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (cleared) loadChart();
    else timer = setTimeout(loadChart, 60);
    return () => { ignore = true; if (timer) clearTimeout(timer); };
  }, [fallbackCandles, initialLimit, loadCandles, productType, symbol, timeframe.granularity, clearOnSymbolChange, marketKey]);

  // (일봉시가 dailyOpenPrice는 loadChart에서 캔들과 원자적으로 함께 로드 — 등락 계산 옛값/새값 혼합 방지)

  useEffect(() => {
    const currentKey = marketKey;
    const intervalSec = INTERVAL_SECONDS[timeframe.granularity];
    // 새 봉 사이에 봉이 통째로 빠졌으면(WS 단절·절전 복귀 등) REST 재조회로 메꾼다.
    // 1.5배 여유: 월봉의 28~31일 편차 흡수 + 정상 롤오버(diff=1봉)는 통과.
    const detectGap = (lastTime: number, newTime: number) => {
      // setCandles 업데이터(순수해야 함) 안에서 불리므로 부수효과는 다음 틱으로 미룸
      if (intervalSec && newTime - lastTime > intervalSec * 1.5) {
        window.setTimeout(() => autoRefreshRef.current(), 0);
      }
    };
    const onTick = (ticker: Ticker) => {
      // 이 심볼/TF 로드가 끝나기 전(전환 직후)이나 잔존 WS 틱은 무시 — 옛 현재가가 새 종목 일봉시가와
      // 섞여 등락이 깜빡이거나 다른 종목 가격이 순간 보이는 것 방지.
      if (!canApplyPrice(loadedKeyRef.current, currentKey)) return;
      setLivePrice(ticker.close);
      // 캔들 배열이 이전 선택 것(fetch 실패로 유지 중)이면 현재가만 갱신하고 봉은 건드리지 않음
      if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
      setCandles(currentCandles => {
        if (!currentCandles.length) return currentCandles;
        const nextCandles = [...currentCandles];
        const last = nextCandles[nextCandles.length - 1];
        const lastTime = Number(last.time);
        // 빗썸 일/6h/12h봉은 KST 자정(00:00 KST=15:00 UTC) 정렬이라 UTC 버킷과 9h 어긋남 → KST로 시프트해 버킷팅.
        // (1시간봉 이하는 9h가 정수배라 무영향, Upbit/Bitget/Binance는 UTC 그대로)
        const KST = 9 * 3600;
        let bucketTime = exchange === 'BITHUMB'
          ? getBucketTime(ticker.time + KST, timeframe.granularity) - KST
          : getBucketTime(ticker.time, timeframe.granularity);
        // 3D는 거래소마다 앵커가 달라(예: Binance 3d=06-25 vs Bitget 3d=06-24) epoch 격자와 어긋날 수 있음
        // → 마지막 REST 캔들 time을 앵커로 재정렬해 봉 중간 가짜 새 캔들 생성 방지.
        if (timeframe.granularity === '3Dutc' && intervalSec) {
          bucketTime = lastTime + Math.floor((ticker.time - lastTime) / intervalSec) * intervalSec;
        }
        if (lastTime === bucketTime) {
          nextCandles[nextCandles.length - 1] = {
            ...last,
            high: Math.max(last.high, ticker.high),
            low: Math.min(last.low, ticker.low),
            close: ticker.close,
            // ticker.volume은 24h 누적이라 캔들 거래량으로 쓰면 막대가 치솟음 → 로드된 캔들 거래량 유지
            volume: last.volume
          };
          return nextCandles;
        }
        const action = classifyIncomingBar(lastTime, bucketTime, timeframe.granularity);
        if (action === 'refresh') { window.setTimeout(() => autoRefreshRef.current(), 0); return currentCandles; } // 건너뛰거나 어긋난 봉은 직접 붙이지 않고 REST로 메꿈(30초 레이트리밋)
        if (action === 'append') {
          nextCandles.push({
            time: bucketTime, open: last.close,
            high: Math.max(last.close, ticker.high),
            low: Math.min(last.close, ticker.low),
            // 새 캔들 시작 — 거래량은 0부터(다음 REST 로드 때 실제값 반영)
            close: ticker.close, volume: 0
          });
          return nextCandles;
        }
        return currentCandles;
      });
    };
    // kline WS(Binance/Bitget): 현재 캔들 OHLCV를 통째로 받아 마지막 캔들 교체/추가 — 거래량까지 실시간.
    const onKline = (c: CandleMessage) => {
      if (!canApplyPrice(loadedKeyRef.current, currentKey)) return;
      setLivePrice(c.close);
      if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
      setCandles(currentCandles => {
        if (!currentCandles.length) return currentCandles;
        const nextCandles = [...currentCandles];
        const last = nextCandles[nextCandles.length - 1];
        const lastTime = Number(last.time);
        if (lastTime === c.time) {
          nextCandles[nextCandles.length - 1] = { time: last.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
          return nextCandles;
        }
        const action = classifyIncomingBar(lastTime, c.time, timeframe.granularity);
        if (action === 'refresh') {
          // 간격이 어긋난 봉(다른 TF 잔존 소켓)이나 건너뛴 봉은 직접 붙이지 않고 재조회로 정리 — 2026-09-06 Bitget 주봉 갭
          window.setTimeout(() => autoRefreshRef.current(), 0);
          return currentCandles;
        }
        if (action === 'append') {
          nextCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
          return nextCandles;
        }
        return currentCandles;
      });
    };
    if (!active) return; // 차트 화면 밖이면 실시간 캔들 구독 안 함(열린 WS 정리)
    const isKrw = exchange === 'UPBIT' || exchange === 'BITHUMB';

    // liveCandle + Binance/Bitget: kline WS로 현재 캔들 OHLCV 실시간(거래량 포함).
    // Binance는 지역차단이라 브라우저 직결 대신 백엔드 릴레이 토픽(subscribeBinanceKline=STOMP)을 구독한다.
    if (liveCandle && !isKrw) {
      const subscription = isBinance
        ? subscribeBinanceKline(symbol, isFutures, timeframe.granularity, onKline)
        : subscribeBitgetKline(symbol, isFutures, timeframe.channel, onKline);
      return () => subscription.close();
    }

    // 그 외(모바일 전 거래소 / liveCandle KRW): 기존 티커 경로로 OHLC·현재가 갱신(거래량은 동결)
    const subscription = isKrw
      ? subscribeKrwCandle(exchange as 'UPBIT' | 'BITHUMB', symbol, onTick)
      : isBinance
        ? subscribeBinanceCandle(symbol, isFutures, onTick)
        : subscribeCoinCandle(symbol, timeframe.channel, onTick, productType);

    // liveCandle KRW: 공개 캔들 WS가 없어 REST로 최신 캔들 거래량을 5초마다 보정
    let pollTimer: number | undefined;
    if (liveCandle && isKrw) {
      const poll = () => {
        loadCandles(timeframe.granularity, 2).then(cs => {
          // 캔들이 이전 종목 것이면 skip — 같은 TF는 버킷 time이 종목 불문 일치해 거래량이 섞임
          if (!canApplyCandle(loadedKeyRef.current, candlesKeyRef.current, currentKey)) return;
          const latest = cs[cs.length - 1];
          if (!latest) return;
          setCandles(currentCandles => {
            if (!currentCandles.length) return currentCandles;
            const last = currentCandles[currentCandles.length - 1];
            if (Number(last.time) !== Number(latest.time) || last.volume === latest.volume) return currentCandles;
            const nextCandles = [...currentCandles];
            nextCandles[nextCandles.length - 1] = { ...last, volume: latest.volume };
            return nextCandles;
          });
        }).catch(() => {});
      };
      pollTimer = window.setInterval(poll, 5000);
    }
    return () => { subscription.close(); if (pollTimer) clearInterval(pollTimer); };
  }, [active, getBucketTime, isBinance, isFutures, productType, symbol, timeframe.channel, timeframe.granularity, exchange, liveCandle, loadCandles, marketKey]);

  const refreshCandles = useCallback(async () => {
    const requestKey = marketKey;
    try {
      const nextCandles = await loadCandles(timeframe.granularity, initialLimit);
      // 응답 대기 중 선택(거래소·현선물·종목·TF)이 바뀌었으면 폐기 — 옛 캔들이 새 차트를 덮어쓰는 것 방지
      if (shouldDropResponse(prevSymbolKeyRef.current, requestKey)) return;
      if (nextCandles.length) {
        // time 기준 병합(겹치는 봉은 REST 값 우선) — 규칙은 candleState.mergeRefresh
        setCandles(prev => (candlesKeyRef.current !== requestKey ? nextCandles : mergeRefresh(prev, nextCandles, timeframe.granularity)));
        candlesKeyRef.current = requestKey;
        setCandlesKey(requestKey);
        setLivePrice(nextCandles[nextCandles.length - 1]?.close ?? null);
        setOpenPrice(nextCandles[nextCandles.length - 1]?.open ?? null);
      } else {
        setCandles(prev => prev.length ? prev : fallbackCandles);
      }
    } catch {
      if (!shouldDropResponse(prevSymbolKeyRef.current, requestKey)) setCandles(prev => prev.length ? prev : fallbackCandles);
    }
  }, [fallbackCandles, initialLimit, loadCandles, timeframe.granularity, marketKey]);

  // 자동 재조회(WS 갭 감지·탭 복귀) — 30초 레이트리밋으로 연쇄 refresh 폭주 방지
  const autoRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshRef.current < 30_000) return;
    lastAutoRefreshRef.current = now;
    refreshCandles();
  }, [refreshCandles]);
  useEffect(() => { autoRefreshRef.current = autoRefresh; }, [autoRefresh]);

  // 백그라운드 복귀(active false→true) 시 캔들 히스토리를 자동 재조회한다.
  // 안 하면 백그라운드 동안 마감된 봉들이 누락되고(WS는 한 봉만 bridge), 수동 새로고침 전까지 갭이 남는다.
  const prevActiveRef = useRef(active);
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = active;
    if (active && !wasActive) refreshCandles();
  }, [active, refreshCandles]);

  // 탭/창 복귀 시에도 재조회 — 웹은 active가 상수 true라 위 effect가 한 번도 안 돌아
  // 절전·네트워크 단절로 빠진 봉이 새로고침 전까지 남던 문제 보완(모바일은 레이트리밋이 중복 흡수).
  useEffect(() => {
    if (!active) return;
    const onVisible = () => { if (document.visibilityState === 'visible') autoRefreshRef.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [active]);

  const loadMoreCandles = useCallback(async () => {
    if (isLoadingMore.current || !candles.length) return;
    if (candles.length >= MAX_CANDLES) return; // 버퍼 상한 도달 — 더 과거는 불러오지 않음
    const requestKey = marketKey;
    // 화면 캔들이 다른 선택 것(전환 직후 잔상)이면 백필 자체를 하지 않음
    if (candlesKeyRef.current !== requestKey) return;
    isLoadingMore.current = true;
    try {
      const oldestTime = candles[0].time;
      const endTimeMs = (Number(oldestTime)) * 1000 - 1000;
      const moreCandles = await loadCandles(timeframe.granularity, 500, String(endTimeMs));
      // 응답 대기 중 종목/TF가 바뀌었으면 폐기 — 다른 종목/TF 캔들이 병합되는 것(가격 절벽) 방지
      if (shouldDropResponse(prevSymbolKeyRef.current, requestKey) || candlesKeyRef.current !== requestKey) return;
      if (moreCandles.length > 0) {
        setCandles(prev => {
          const existingTimes = new Set(prev.map(c => c.time));
          const filteredMore = moreCandles.filter(c => !existingTimes.has(c.time));
          if (filteredMore.length === 0) return prev;
          return [...filteredMore, ...prev].sort((a, b) => Number(a.time) - Number(b.time));
        });
      }
    } catch (error) {
      console.error('Failed to load more candles:', error);
    } finally {
      isLoadingMore.current = false;
    }
  }, [candles, loadCandles, timeframe.granularity, marketKey]);

  const handleVisibleRangeChange = useCallback((range: { logicalRange: { from: number; to: number } | null }) => {
    if (!range.logicalRange || candles.length === 0) return;
    if (range.logicalRange.from < 5) loadMoreCandles();
  }, [candles.length, loadMoreCandles]);

  const clearCandles = useCallback(() => {
    setCandles([]);
  }, []);

  return {
    candles,
    candlesKey,
    livePrice,
    openPrice,
    dailyOpenPrice,
    loadedSymbol,
    clearCandles,
    refreshCandles,
    handleVisibleRangeChange,
  };
}
