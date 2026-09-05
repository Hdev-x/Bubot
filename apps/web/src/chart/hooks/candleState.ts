import type { Candle } from '../../shared/types/market';

// useCoinCandles의 키 가드·병합 규칙을 순수 함수로 분리 (wp-09 d01). 훅은 이 함수들을 부르기만 한다.
// 키는 marketKey.chartKey('거래소|현선물|심볼|TF').

// TF별 봉 간격(초) — WS 갭 감지·병합 정리용. 1Mutc는 대표값 30일(실제 28~31일 편차는 1.5배 여유로 흡수).
export const INTERVAL_SECONDS: Record<string, number> = {
  '1min': 60, '3min': 180, '5min': 300, '15min': 900, '30m': 1800, '30min': 1800,
  '1h': 3600, '4h': 14400, '6h': 21600, '6Hutc': 21600, '12h': 43200, '12Hutc': 43200,
  '1Dutc': 86400, '3Dutc': 259200, '1Wutc': 604800, '1Mutc': 2592000,
};

/** WS 틱을 현재가에 반영해도 되는가 — 이 키의 로드가 끝난 뒤에만(전환 직후 옛 소켓 틱·새 소켓의 이른 틱 차단). */
export function canApplyPrice(loadedKey: string, currentKey: string): boolean {
  return loadedKey === currentKey;
}

/** WS 틱·kline을 캔들 배열에 반영해도 되는가 — 화면 캔들 배열이 이 키 것일 때만(fetch 실패로 옛 캔들이 남아 있으면 현재가만). */
export function canApplyCandle(loadedKey: string, candlesKey: string, currentKey: string): boolean {
  return loadedKey === currentKey && candlesKey === currentKey;
}

/** REST 응답(refresh·loadMore)이 도착했을 때 폐기해야 하는가 — 대기 중 선택이 바뀌었으면 폐기. */
export function shouldDropResponse(prevKey: string | null, requestKey: string): boolean {
  return prevKey !== requestKey;
}

/**
 * refresh 응답 병합 — 전량 교체하면 loadMore로 쌓은 과거 버퍼가 잘리고 응답 대기 중 WS가 만든 새 봉이 되감기므로
 * time 기준 병합(겹치는 봉은 REST 값 우선). TF 간격에 어긋난 봉(다른 TF 틱이 만든 가짜 봉)과 2봉 초과 미래 봉은 제외.
 * (1M은 간격이 가변이라 제외. 상대 간격 기준이라 빗썸 KST 시프트·3D 앵커에도 안전)
 */
export function mergeRefresh(prev: Candle[], next: Candle[], tf: string): Candle[] {
  if (!prev.length || !next.length) return next;
  const lastRest = Number(next[next.length - 1].time);
  const iv = INTERVAL_SECONDS[tf];
  const byTime = new Map<number, Candle>();
  for (const c of prev) {
    const t = Number(c.time);
    if (iv && tf !== '1Mutc') {
      if ((t - lastRest) % iv !== 0) continue;
      if (t > lastRest + iv * 2) continue;
    }
    byTime.set(t, c);
  }
  for (const c of next) byTime.set(Number(c.time), c);
  return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
}
