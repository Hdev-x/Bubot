import { describe, it, expect } from 'vitest';
import { canApplyCandle, canApplyPrice, mergeRefresh, shouldDropResponse } from './candleState';
import { chartKey } from './marketKey';
import type { Candle } from '../../shared/types/market';

const c = (time: number, close: number): Candle => ({ time, open: close, high: close, low: close, close, volume: 0 });
const BG = chartKey('BITGET', true, 'BTCUSDT', '1h');
const BN = chartKey('BINANCE', true, 'BTCUSDT', '1h');

describe('candleState — 최종 리뷰 시나리오: Bitget BTCUSDT 표시 중 Binance BTCUSDT로 전환', () => {
  it('(a) 옛 거래소 소켓의 틱은 새 선택에 붙지 않는다', () => {
    // 전환 직후: loadedKey·candlesKey는 아직 Bitget, 현재 키는 Binance
    expect(canApplyPrice(BG, BN)).toBe(false);
    expect(canApplyCandle(BG, BG, BN)).toBe(false);
    // 옛 소켓 콜백은 자기 키(BG)로 판정하는데, Binance 로드가 끝나면 loadedKey=BN이라 역시 거부
    expect(canApplyPrice(BN, BG)).toBe(false);
    // Binance 로드 완료 뒤 새 소켓 틱만 통과
    expect(canApplyPrice(BN, BN)).toBe(true);
    expect(canApplyCandle(BN, BN, BN)).toBe(true);
  });
  it('(b) 옛 거래소의 refresh·loadMore 응답은 폐기된다', () => {
    expect(shouldDropResponse(BN, BG)).toBe(true);   // 현재 Binance인데 Bitget 요청 응답
    expect(shouldDropResponse(BG, BG)).toBe(false);
    expect(shouldDropResponse(null, BG)).toBe(true); // 아직 아무 선택도 기록 전
  });
  it('캔들 fetch가 실패해 옛 캔들이 남아 있으면 현재가만 갱신하고 봉은 건드리지 않는다', () => {
    expect(canApplyPrice(BN, BN)).toBe(true);
    expect(canApplyCandle(BN, BG, BN)).toBe(false); // candlesKey가 아직 옛 것
  });
});

describe('mergeRefresh', () => {
  it('겹치는 봉은 REST 우선, 과거 버퍼는 유지, 정렬', () => {
    const prev = [c(0, 1), c(3600, 2), c(7200, 3)];
    const next = [c(7200, 30), c(10800, 4)];
    const out = mergeRefresh(prev, next, '1h');
    expect(out.map(x => [Number(x.time), x.close])).toEqual([[0, 1], [3600, 2], [7200, 30], [10800, 4]]);
  });
  it('TF 간격에 어긋난 봉과 2봉 초과 미래 봉은 버린다(1M 제외)', () => {
    const prev = [c(0, 1), c(1800, 9), c(7200 + 3600 * 3, 9)];
    const next = [c(3600, 2), c(7200, 3)];
    expect(mergeRefresh(prev, next, '1h').map(x => Number(x.time))).toEqual([0, 3600, 7200]);
    const prevM = [c(0, 1), c(1000, 9)];
    expect(mergeRefresh(prevM, [c(2592000, 2)], '1Mutc').map(x => Number(x.time))).toEqual([0, 1000, 2592000]);
  });
  it('prev나 next가 비면 next를 그대로', () => {
    expect(mergeRefresh([], [c(0, 1)], '1h')).toEqual([c(0, 1)]);
    expect(mergeRefresh([c(0, 1)], [], '1h')).toEqual([]);
  });
});
