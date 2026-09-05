import { describe, it, expect } from 'vitest';
import { chartKey, priceKey, priceKeyOf, resolveExchange, symbolOf } from './marketKey';

describe('marketKey', () => {
  it('같은 심볼이라도 거래소·현선물·TF가 다르면 다른 키다 (최종 리뷰 P1: symbol|TF만 쓰던 문제)', () => {
    const a = chartKey('BITGET', true, 'BTCUSDT', '1h');
    expect(chartKey('BINANCE', true, 'BTCUSDT', '1h')).not.toBe(a);
    expect(chartKey('BITGET', false, 'BTCUSDT', '1h')).not.toBe(a);
    expect(chartKey('BITGET', true, 'BTCUSDT', '4h')).not.toBe(a);
    expect(chartKey('BITGET', true, 'BTCUSDT', '1h')).toBe(a);
  });
  it('priceKeyOf는 TF만 떼고, symbolOf는 심볼만 준다', () => {
    const k = chartKey('BINANCE', false, 'ETHUSDT', '1Dutc');
    expect(priceKeyOf(k)).toBe(priceKey('BINANCE', false, 'ETHUSDT'));
    expect(symbolOf(k)).toBe('ETHUSDT');
    expect(symbolOf(null)).toBeNull();
  });
  it('exchange 미지정이면 isBinance로 파생한다(Mobile 호출부)', () => {
    expect(resolveExchange(undefined, true)).toBe('BINANCE');
    expect(resolveExchange(undefined, false)).toBe('BITGET');
    expect(resolveExchange('UPBIT', false)).toBe('UPBIT');
  });
});
