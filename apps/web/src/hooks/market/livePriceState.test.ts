import { describe, it, expect } from 'vitest';
import { EMPTY_LIVE_PRICE, applySeed, applyTick, livePriceKey, readySymbolOf } from './livePriceState';
import type { BitgetTicker } from '../../api/exchange/bitget/bitgetTicker';

const ticker = (last: number, openUtc = 0): BitgetTicker => ({ last, openUtc, high24h: 0, low24h: 0, baseVolume: 0, quoteVolume: 0 });
const BTC = livePriceKey('BITGET', 'BTCUSDT', true);
const ETH = livePriceKey('BITGET', 'ETHUSDT', true);

describe('livePriceState', () => {
  it('seed가 오기 전 WS 틱은 무시한다', () => {
    const s = applyTick(EMPTY_LIVE_PRICE, BTC, 100);
    expect(s).toBe(EMPTY_LIVE_PRICE);
  });

  it('seed → 틱 순서로 현재가가 채워지고 갱신된다', () => {
    const seeded = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(seeded).toEqual({ price: 100, dailyOpen: 90, readyKey: BTC });
    expect(readySymbolOf(seeded)).toBe('BTCUSDT');
    const ticked = applyTick(seeded, BTC, 101);
    expect(ticked.price).toBe(101);
    expect(ticked.dailyOpen).toBe(90);
  });

  it('종목 전환 직후엔 옛 값을 유지하고 새 종목 틱을 막다가 새 seed에 한 번에 바뀐다(스테이지드 스왑)', () => {
    const btc = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    // ETH로 전환 — 아직 seed 전
    const stillBtc = applyTick(btc, ETH, 3000);
    expect(stillBtc).toBe(btc);
    expect(readySymbolOf(stillBtc)).toBe('BTCUSDT'); // 헤더는 아직 BTC를 "준비된 종목"으로 본다
    const eth = applySeed(stillBtc, ETH, ETH, ticker(3000, 2900));
    expect(eth).toEqual({ price: 3000, dailyOpen: 2900, readyKey: ETH });
    expect(applyTick(eth, ETH, 3001).price).toBe(3001);
  });

  it('전환 중 늦게 도착한 옛 종목 seed는 버린다', () => {
    const lateBtcSeed = applySeed(EMPTY_LIVE_PRICE, ETH, BTC, ticker(100, 90));
    expect(lateBtcSeed).toBe(EMPTY_LIVE_PRICE);
  });

  it('seed에 last가 없거나 null이면 변화 없음, openUtc 0은 dailyOpen null', () => {
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, null)).toBe(EMPTY_LIVE_PRICE);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(0, 90))).toBe(EMPTY_LIVE_PRICE);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 0)).dailyOpen).toBeNull();
  });

  it('같은 가격 틱·0 가격은 같은 객체를 돌려 렌더를 아낀다', () => {
    const seeded = applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90));
    expect(applyTick(seeded, BTC, 100)).toBe(seeded);
    expect(applyTick(seeded, BTC, 0)).toBe(seeded);
  });

  it('호출자가 준 일봉 시가가 티커 openUtc보다 우선하고, 없으면 티커 값으로 폴백한다', () => {
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), 95).dailyOpen).toBe(95);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), null).dailyOpen).toBe(90);
    expect(applySeed(EMPTY_LIVE_PRICE, BTC, BTC, ticker(100, 90), 0).dailyOpen).toBe(90);
  });

  it('현물/선물·거래소가 다르면 다른 키다', () => {
    expect(livePriceKey('BITGET', 'BTCUSDT', true)).not.toBe(livePriceKey('BITGET', 'BTCUSDT', false));
    expect(livePriceKey('BITGET', 'BTCUSDT', true)).not.toBe(livePriceKey('BINANCE', 'BTCUSDT', true));
  });
});
