// 마켓 키 — "이 데이터가 현재 선택(거래소·현선물·심볼·TF) 것인가"를 판정하는 유일한 식별자 (wp-09 d01).
// 예전엔 `${symbol}|${tf}`만 써서 같은 심볼로 거래소(Bitget↔Binance)나 현선물을 바꾸면 옛 WS 틱·늦은 응답이
// 새 차트에 섞였다(최종 리뷰 P1). 순수 함수라 React 없이 테스트한다.

export type MarketExchange = 'BITGET' | 'BINANCE' | 'UPBIT' | 'BITHUMB';

/** exchange 미지정 호출부(Mobile)는 isBinance로 파생. KRW는 항상 명시된다. */
export function resolveExchange(exchange: MarketExchange | undefined, isBinance: boolean): MarketExchange {
  return exchange ?? (isBinance ? 'BINANCE' : 'BITGET');
}

/** 현재가·지표 단위 키: 'BINANCE|F|BTCUSDT' */
export function priceKey(exchange: MarketExchange, isFutures: boolean, symbol: string): string {
  return `${exchange}|${isFutures ? 'F' : 'S'}|${symbol}`;
}

/** 캔들 단위 키(TF 포함): 'BINANCE|F|BTCUSDT|1h' */
export function chartKey(exchange: MarketExchange, isFutures: boolean, symbol: string, tf: string): string {
  return `${priceKey(exchange, isFutures, symbol)}|${tf}`;
}

/** chartKey → priceKey (TF 제거). 지표(mtf)는 TF가 여러 개라 priceKey 단위로 게이팅한다. */
export function priceKeyOf(chartKeyValue: string): string {
  return chartKeyValue.split('|').slice(0, 3).join('|');
}

export function symbolOf(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.split('|')[2] ?? null;
}
