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

export type BarAction = 'update' | 'append' | 'refresh' | 'ignore';

/**
 * WS로 들어온 봉(또는 틱의 버킷)을 마지막 봉과 비교해 무엇을 할지 — 같은 봉이면 갱신, 정확히 다음 봉이면 추가,
 * 봉을 건너뛰었거나 간격이 어긋나면 직접 붙이지 않고 REST 재조회로 메꾼다(2026-09-06: Bitget 주봉에서 WS가 만든 봉이
 * 어긋난 자리에 들어가 갭처럼 보이던 문제 — 예전엔 TF 배수이면 몇 봉을 건너뛰어도 그냥 붙였다). 과거 봉은 무시.
 * 1Mutc는 달 길이가 가변이라 28~31일 사이면 다음 봉으로 본다. 간격 정보가 없는 TF는 예전처럼 추가.
 */
export function classifyIncomingBar(lastTime: number, newTime: number, tf: string): BarAction {
  if (newTime === lastTime) return 'update';
  if (newTime < lastTime) return 'ignore';
  const iv = INTERVAL_SECONDS[tf];
  if (!iv) return 'append';
  const gap = newTime - lastTime;
  if (tf === '1Mutc') return gap >= 28 * 86400 && gap <= 31 * 86400 ? 'append' : 'refresh';
  return gap === iv ? 'append' : 'refresh';
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
