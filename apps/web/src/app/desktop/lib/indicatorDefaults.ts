import { PRESET_THEMES } from '../../../chart/settings/ChartSettingsSheet';
import type { IndicatorSettings } from '../../../chart/overlays/ChartOverlay';
import type { MASetting, PivotSetting } from '../../../chart/indicators/IndicatorSheet';

// 웹 기본/비로그인 고정 테마 = '다크'(id:dark). 없으면 첫 프리셋 폴백.
export const DARK_THEME = PRESET_THEMES.find((t) => t.id === 'dark') ?? PRESET_THEMES[0];

// 비로그인 시 차트에 표시할 "모두 꺼짐" 지표 설정(저장값은 그대로, 표시만 차단)
export const INDICATORS_OFF: IndicatorSettings = {
  '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
};
export const MA_OFF: MASetting[] = [];
export function pivotOff(p: PivotSetting): PivotSetting {
  return {
    ...p, show: false, showWave: false, showHarmonic: false, showHarmonicScanning: false,
    showHarmonicSignal: false, showHarmonicCompleted: false, showHarmonicStoploss: false,
    showHarmonicPrediction: false, showHarmonicLines: false, showHarmonicFill: false,
    showElliottWave: false, showAbcWave: false, showAbcCompleted: false, showAbcPrediction: false,
    showAbcText: false, showAbcLines: false, showTpLine: false, showTpLabel: false,
    showSlLine: false, showSlLabel: false,
  };
}
