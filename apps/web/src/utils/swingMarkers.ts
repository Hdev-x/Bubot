import type { SeriesMarker, LineData, Time } from 'lightweight-charts';
import type { Pivot } from '../chart/analysis/pivots';

export type SwingMarkerOptions = {
  /** 가격 라벨 표시 */
  show?: boolean;
  /** 파동(HH/LH/HL/LL) 라벨 + 파동선 데이터 생성 */
  showWave?: boolean;
};

export type SwingMarkersResult = {
  markers: SeriesMarker<Time>[];
  waveData: LineData<Time>[];
};

/**
 * 필터링된 피벗 배열로부터 스윙 마커와 파동선 데이터를 만든다.
 *
 * - showWave: 직전 동일 방향 피벗과 비교해 HH/LH/HL/LL 라벨을 붙이고,
 *   파동선용 좌표(waveData)를 채운다.
 * - show: 가격 값을 라벨에 함께 표기한다.
 * 둘 중 하나라도 켜져 있으면 마커를 생성한다.
 */
export function buildSwingMarkers(
  pivots: Pivot[],
  opts: SwingMarkerOptions,
): SwingMarkersResult {
  const markers: SeriesMarker<Time>[] = [];
  const waveData: LineData<Time>[] = [];

  let prevHigh = -1;
  let prevLow = -1;

  for (const p of pivots) {
    let label = p.price.toString();

    if (opts.showWave) {
      if (p.type === 'high') {
        if (prevHigh !== -1) {
          label = p.price > prevHigh ? 'HH' : 'LH';
        } else {
          label = 'H';
        }
        prevHigh = p.price;
      } else {
        if (prevLow !== -1) {
          label = p.price > prevLow ? 'HL' : 'LL';
        } else {
          label = 'L';
        }
        prevLow = p.price;
      }
      if (opts.show) {
        label = `${label} (${p.price})`;
      }
      waveData.push({ time: p.time, value: p.price });
    } else if (opts.show) {
      label = p.price.toString();
    }

    if (opts.showWave || opts.show) {
      markers.push({
        time: p.time,
        position: p.type === 'high' ? 'aboveBar' : 'belowBar',
        color: p.type === 'high' ? '#f85149' : '#3182f6',
        shape: p.type === 'high' ? 'arrowDown' : 'arrowUp',
        text: label,
      });
    }
  }

  return { markers, waveData };
}
