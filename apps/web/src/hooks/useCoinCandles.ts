import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeBinanceCandle, subscribeBinanceKline, subscribeCoinCandle } from '../api/coinRealtime';
import { subscribeKrwCandle } from '../api/krwRealtime';
import { subscribeBitgetKline } from '../api/klineRealtime';
import type { CandleMessage } from '../api/coinRealtime';
import { fetchHeaderTicker } from '../api/headerTicker';
import type { Candle } from '../types/market';

type TimeframeOption = {
  granularity: string;
  channel: string;
};

type LoadCandles = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;

// 과거 페이징 버퍼 상한(봉 개수). 10000봉 = 1H ~13.7개월 / 4H ~4.6년 / 1D ~27년.
// 이 이상은 더 불러오지 않아 메모리·렌더 비용을 일정하게 유지한다.
const MAX_CANDLES = 10000;

// TF별 봉 간격(초) — WS 갭 감지용. 1Mutc는 대표값 30일(실제 28~31일 편차는 1.5배 여유로 흡수).
const INTERVAL_SECONDS: Record<string, number> = {
  '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30m': 1800, '30min': 1800,
  '1h': 3600, '4h': 14400, '6h': 21600, '6Hutc': 21600, '12h': 43200, '12Hutc': 43200,
  '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
};

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
  priceFromTicker?: boolean; // 현재가를 캔들이 아닌 전용 티커(last)에서 받음(기본 false=차트 TF 종가, 모바일 보존)
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
  priceFromTicker = false,
  liveCandle = false,
}: Params) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [openPrice, setOpenPrice] = useState<number | null>(null);
  const [dailyOpenPrice, setDailyOpenPrice] = useState<number | null>(null);
  // 실제 데이터(캔들+현재가+일봉시가) 로드가 끝난 심볼. 헤더가 "준비된 종목"만 표시하도록(스테이지드 스왑).
  const [loadedSymbol, setLoadedSymbol] = useState<string | null>(null);
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
    const symbolKey = `${symbol}|${timeframe.granularity}`;
    const cleared = prevSymbolKeyRef.current !== null && prevSymbolKeyRef.current !== symbolKey;
    // 종목/타임프레임이 바뀌면 이전 종목 잔상을 즉시 비운다("차트 열리고 종목 바뀌는 느낌" 방지).
    // clearOnSymbolChange=false면 비우지 않고 새 데이터 도착 시 교체(웹: 클릭 전환 깜빡임 방지).
    if (cleared && clearOnSymbolChange) setCandles([]);
    // livePrice·dailyOpen은 비우지 않고 옛 값 유지 → 로드 완료 시 loadChart에서 함께 새 값으로 교체.
    // (그 사이 WS는 loadedKeyRef 가드로 막혀 옛 값을 안 흔듦 → 등락이 사라지거나 섞이지 않음)
    prevSymbolKeyRef.current = symbolKey;
    async function loadChart() {
      try {
        // 차트 캔들(선택 TF) + 일봉시가(등락용) + 현재가 전용 티커(last)를 한 번에 받는다.
        // priceFromTicker=true면 현재가를 캔들이 아닌 거래소 티커(last)에서 seed → 차트 TF와 완전 무관.
        const [nextCandles, dailyCandles, ticker] = await Promise.all([
          loadCandles(timeframe.granularity, initialLimit),
          loadCandles('1Dutc', 2),
          priceFromTicker ? fetchHeaderTicker(exchange ?? (isBinance ? 'BINANCE' : 'BITGET'), symbol, isFutures) : Promise.resolve(null),
        ]);
        if (ignore) return;
        // 차트 캔들
        if (nextCandles.length) {
          setCandles(nextCandles);
          candlesKeyRef.current = symbolKey; // 캔들 배열이 이 심볼|TF 것임 → WS 봉 반영 허용
          setOpenPrice(nextCandles[nextCandles.length - 1]?.open ?? null);
        } else {
          setCandles(prev => prev.length ? prev : fallbackCandles);
        }
        if (dailyCandles.length > 0) setDailyOpenPrice(dailyCandles[dailyCandles.length - 1].open);
        // 현재가: 전용 티커 last 우선, 없으면 차트 TF 마지막 종가 — 차트 TF가 비어도(미지원 TF) 현재가는 채워짐
        const px = priceFromTicker && ticker?.last
          ? ticker.last
          : nextCandles.length ? nextCandles[nextCandles.length - 1].close : null;
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
  }, [fallbackCandles, initialLimit, loadCandles, productType, symbol, timeframe.granularity, clearOnSymbolChange, priceFromTicker, exchange, isBinance, isFutures]);

  // (일봉시가 dailyOpenPrice는 loadChart에서 캔들과 원자적으로 함께 로드 — 등락 계산 옛값/새값 혼합 방지)

  useEffect(() => {
    const currentKey = `${symbol}|${timeframe.granularity}`;
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
      if (loadedKeyRef.current !== currentKey) return;
      setLivePrice(ticker.close);
      // 캔들 배열이 이전 종목/TF 것(fetch 실패로 유지 중)이면 현재가만 갱신하고 봉은 건드리지 않음
      if (candlesKeyRef.current !== currentKey) return;
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
        if (lastTime < bucketTime) {
          detectGap(lastTime, bucketTime);
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
      if (loadedKeyRef.current !== currentKey) return;
      setLivePrice(c.close);
      // 캔들 배열이 이전 종목/TF 것(fetch 실패로 유지 중)이면 현재가만 갱신하고 봉은 건드리지 않음
      if (candlesKeyRef.current !== currentKey) return;
      setCandles(currentCandles => {
        if (!currentCandles.length) return currentCandles;
        const nextCandles = [...currentCandles];
        const last = nextCandles[nextCandles.length - 1];
        const lastTime = Number(last.time);
        if (lastTime === c.time) {
          nextCandles[nextCandles.length - 1] = { time: last.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
          return nextCandles;
        }
        if (lastTime < c.time) {
          // 다른 TF의 kline이 흘러들어오면(전환 직후 잔존 소켓 등) 간격이 어긋난 가짜 봉이 생김
          // → 마지막 봉 기준 TF 간격의 배수가 아니면 버리고 재조회로 정리(1M은 간격 가변이라 제외)
          if (intervalSec && timeframe.granularity !== '1Mutc' && (c.time - lastTime) % intervalSec !== 0) {
            window.setTimeout(() => autoRefreshRef.current(), 0);
            return currentCandles;
          }
          detectGap(lastTime, c.time);
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
          if (loadedKeyRef.current !== currentKey || candlesKeyRef.current !== currentKey) return;
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
  }, [active, getBucketTime, isBinance, isFutures, productType, symbol, timeframe.channel, timeframe.granularity, exchange, liveCandle, loadCandles]);

  const refreshCandles = useCallback(async () => {
    const requestKey = `${symbol}|${timeframe.granularity}`;
    try {
      const nextCandles = await loadCandles(timeframe.granularity, initialLimit);
      // 응답 대기 중 종목/TF가 바뀌었으면 폐기 — 옛 종목 캔들이 새 차트를 덮어쓰는 것 방지
      if (prevSymbolKeyRef.current !== requestKey) return;
      if (nextCandles.length) {
        // 전량 교체하면 loadMore로 쌓은 과거 버퍼가 initialLimit개로 잘리고, 응답 대기 중
        // WS가 만든 새 봉이 한 봉 되감기며 깜빡임 → time 기준 병합(겹치는 봉은 REST 값 우선).
        setCandles(prev => {
          if (!prev.length || candlesKeyRef.current !== requestKey) return nextCandles;
          const lastRest = Number(nextCandles[nextCandles.length - 1].time);
          const iv = INTERVAL_SECONDS[timeframe.granularity];
          const byTime = new Map<number, Candle>();
          for (const c of prev) {
            const t = Number(c.time);
            // TF 간격에 어긋난 봉(다른 TF 틱이 만든 가짜 봉)과 2봉 초과 미래 봉은 병합에서 제외 — 오염 자동 청소
            // (1M은 간격이 가변이라 제외. 상대 간격 기준이라 빗썸 KST 시프트·3D 앵커에도 안전)
            if (iv && timeframe.granularity !== '1Mutc') {
              if ((t - lastRest) % iv !== 0) continue;
              if (t > lastRest + iv * 2) continue;
            }
            byTime.set(t, c);
          }
          for (const c of nextCandles) byTime.set(Number(c.time), c);
          return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
        });
        candlesKeyRef.current = requestKey;
        setLivePrice(nextCandles[nextCandles.length - 1]?.close ?? null);
        setOpenPrice(nextCandles[nextCandles.length - 1]?.open ?? null);
      } else {
        setCandles(prev => prev.length ? prev : fallbackCandles);
      }
    } catch {
      if (prevSymbolKeyRef.current === requestKey) setCandles(prev => prev.length ? prev : fallbackCandles);
    }
  }, [fallbackCandles, initialLimit, loadCandles, symbol, timeframe.granularity]);

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
    const requestKey = `${symbol}|${timeframe.granularity}`;
    // 화면 캔들이 다른 종목/TF 것(전환 직후 잔상)이면 백필 자체를 하지 않음
    if (candlesKeyRef.current !== requestKey) return;
    isLoadingMore.current = true;
    try {
      const oldestTime = candles[0].time;
      const endTimeMs = (Number(oldestTime)) * 1000 - 1000;
      const moreCandles = await loadCandles(timeframe.granularity, 500, String(endTimeMs));
      // 응답 대기 중 종목/TF가 바뀌었으면 폐기 — 다른 종목/TF 캔들이 병합되는 것(가격 절벽) 방지
      if (prevSymbolKeyRef.current !== requestKey || candlesKeyRef.current !== requestKey) return;
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
  }, [candles, loadCandles, symbol, timeframe.granularity]);

  const handleVisibleRangeChange = useCallback((range: { logicalRange: { from: number; to: number } | null }) => {
    if (!range.logicalRange || candles.length === 0) return;
    if (range.logicalRange.from < 5) loadMoreCandles();
  }, [candles.length, loadMoreCandles]);

  const clearCandles = useCallback(() => {
    setCandles([]);
  }, []);

  return {
    candles,
    livePrice,
    openPrice,
    dailyOpenPrice,
    loadedSymbol,
    clearCandles,
    refreshCandles,
    handleVisibleRangeChange,
  };
}
