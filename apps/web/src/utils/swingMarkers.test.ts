import { describe, it, expect } from 'vitest';
import type { Time } from 'lightweight-charts';
import type { Pivot } from './pivots';
import { buildSwingMarkers } from './swingMarkers';

const time = (n: number): Time => n as unknown as Time;

const pivots: Pivot[] = [
  { type: 'low', i: 0, price: 10, time: time(1) },
  { type: 'high', i: 1, price: 20, time: time(2) },
  { type: 'low', i: 2, price: 15, time: time(3) },
  { type: 'high', i: 3, price: 18, time: time(4) },
];

describe('buildSwingMarkers', () => {
  it('showWave: 첫 고/저점은 H/L, 이후는 HH/LH/HL/LL 라벨을 붙인다', () => {
    const { markers, waveData } = buildSwingMarkers(pivots, { showWave: true });

    expect(markers.map((m) => m.text)).toEqual(['L', 'H', 'HL', 'LH']);
    // 파동선 데이터는 모든 피벗을 (time, price)로 채운다
    expect(waveData).toEqual([
      { time: time(1), value: 10 },
      { time: time(2), value: 20 },
      { time: time(3), value: 15 },
      { time: time(4), value: 18 },
    ]);
  });

  it('showWave 마커의 위치/색/모양이 방향에 따라 결정된다', () => {
    const { markers } = buildSwingMarkers(pivots, { showWave: true });

    expect(markers[0]).toMatchObject({
      position: 'belowBar',
      color: '#3182f6',
      shape: 'arrowUp',
    });
    expect(markers[1]).toMatchObject({
      position: 'aboveBar',
      color: '#f85149',
      shape: 'arrowDown',
    });
  });

  it('show만 켜면 가격 라벨 마커만 만들고 파동선 데이터는 비운다', () => {
    const { markers, waveData } = buildSwingMarkers(pivots, { show: true });

    expect(markers.map((m) => m.text)).toEqual(['10', '20', '15', '18']);
    expect(waveData).toEqual([]);
  });

  it('show + showWave면 파동 라벨에 가격을 함께 표기한다', () => {
    const { markers } = buildSwingMarkers(pivots, { show: true, showWave: true });

    expect(markers.map((m) => m.text)).toEqual([
      'L (10)',
      'H (20)',
      'HL (15)',
      'LH (18)',
    ]);
  });

  it('둘 다 꺼져 있으면 아무것도 생성하지 않는다', () => {
    const { markers, waveData } = buildSwingMarkers(pivots, {});
    expect(markers).toEqual([]);
    expect(waveData).toEqual([]);
  });
});
