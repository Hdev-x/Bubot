export type MAType = 'SMA' | 'EMA' | 'WMA';

export type MASetting = {
  period: number;
  show: boolean;
  color: string;
  opacity?: number;
  lineWidth: number;
  type?: MAType; // 이동평균 종류(기본 SMA — 구버전 저장값 호환)
};

export type BBSetting = {
  show: boolean;
  period: number;
  multiplier: number;
  lineColor: string;
  lineOpacity?: number;
  fillColor: string;
  fillOpacity?: number;
  lineWidth: number;
};

export type PivotSetting = {
  show: boolean;
  showWave?: boolean;
  showHarmonic?: boolean;
  showHarmonicScanning?: boolean;   // 탐색(미터치 후보)
  showHarmonicSignal?: boolean;     // 신호·체결
  showHarmonicCompleted?: boolean;  // 완성(TP·시간만료)
  showHarmonicStoploss?: boolean;   // 손절(SL)
  showHarmonicPrediction?: boolean; // (deprecated: 탐색/신호로 분리, 미사용)
  showHarmonicLines?: boolean;
  showHarmonicFill?: boolean;
  showElliottWave?: boolean;
  showAbcWave?: boolean;
  showAbcCompleted?: boolean;
  showAbcPrediction?: boolean;
  showAbcText?: boolean;
  showAbcLines?: boolean;
  abcMode?: 'single' | 'multi';
  elliottLength?: number;
  abcLength?: number;
  showTpLine?: boolean;
  showTpLabel?: boolean;
  showSlLine?: boolean;
  showSlLabel?: boolean;
  length: number;
  basis?: 'wick' | 'body';
};

export const DEFAULT_PIVOT_SETTING: PivotSetting = {
  show: false,
  showWave: true,
  showHarmonic: true,
  showHarmonicScanning: true,
  showHarmonicSignal: true,
  showHarmonicCompleted: true,
  showHarmonicStoploss: true,
  showHarmonicPrediction: true,
  showHarmonicLines: true,
  showHarmonicFill: true,
  showElliottWave: false,
  showAbcWave: true,
  showAbcCompleted: true,
  showAbcPrediction: false,
  showAbcText: false,
  showAbcLines: true,
  abcMode: 'single',
  elliottLength: 21,
  abcLength: 21,
  showTpLine: false,
  showTpLabel: false,
  showSlLine: true,
  showSlLabel: false,
  length: 10,
  basis: 'wick',
};

export function hexToRgba(hex: string, opacity: number): string {
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d.]+\)$/, `${opacity / 100})`);
  }
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(0,0,0,${opacity/100})`;
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity/100})`;
}

export const DEFAULT_MA_SETTINGS: MASetting[] = [
  { period: 5,   show: false, color: '#f85149', opacity: 100, lineWidth: 1, type: 'SMA' },
  { period: 20,  show: true,  color: '#f6b146', opacity: 100, lineWidth: 2, type: 'SMA' },
  { period: 50,  show: false, color: '#4caf50', opacity: 100, lineWidth: 2, type: 'SMA' },
  { period: 100, show: false, color: '#3182f6', opacity: 100, lineWidth: 2, type: 'SMA' },
  { period: 200, show: false, color: '#9c27b0', opacity: 100, lineWidth: 2, type: 'SMA' },
  { period: 240, show: false, color: '#e91e63', opacity: 100, lineWidth: 2, type: 'SMA' },
];

export const DEFAULT_BB_SETTING: BBSetting = {
  show: false,
  period: 20,
  multiplier: 2,
  lineColor: '#3182f6',
  lineOpacity: 100,
  fillColor: '#3182f6',
  fillOpacity: 10,
  lineWidth: 1
};
