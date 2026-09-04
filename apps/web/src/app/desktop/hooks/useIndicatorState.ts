import { useRef, useState } from 'react';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';
import type { IndicatorSettings } from '../../../chart/overlays/ChartOverlay';
import { DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING, DEFAULT_PIVOT_SETTING } from '../../../chart/indicators/IndicatorSheet';
import type { MASetting, BBSetting, PivotSetting } from '../../../chart/indicators/IndicatorSheet';
import { INDICATORS_OFF, MA_OFF, pivotOff } from '../lib/indicatorDefaults';

// Desktop 지표 상태 — SMC·MA·BB·피벗 설정(저장), 비관리자용 eff* 차단값, 툴바 드롭다운·그룹 접힘. DesktopApp에서 옮김 (wp-06 d04a).
// 저장 키는 Mobile CoinChartPage와 같아 종목 이동·새로고침에도 유지된다.
export function useIndicatorState({ indiOff }: { indiOff: boolean }) {
  const [indiOpen, setIndiOpen] = useState(false);
  const indiRef = useRef<HTMLDivElement>(null);
  const [indicatorSettings, setIndicatorSettings] = usePersistentState<IndicatorSettings>('chart_indicators', {
    '1M': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1W': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '3D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
    '1D': { showOB: false, showOBBox: false, showFVG: false, showCE: false, showEQ: false },
  }, true);
  const [maSettings, setMaSettings] = usePersistentState<MASetting[]>('chart_ma_settings', DEFAULT_MA_SETTINGS);
  const [bbSetting, setBbSetting] = usePersistentState<BBSetting>('chart_bb_setting', DEFAULT_BB_SETTING, true);
  const [pivotSetting, setPivotSetting] = usePersistentState<PivotSetting>('chart_pivot_setting', DEFAULT_PIVOT_SETTING, true);
  // 지표는 관리자(ADMIN)에게만 공개. 일반 유저·비로그인은 차트 지표 전부 끔(저장값은 유지, 표시만 차단)
  const effIndicatorSettings = indiOff ? INDICATORS_OFF : indicatorSettings;
  const effMaSettings = indiOff ? MA_OFF : maSettings;
  const effBbSetting = indiOff ? { ...bbSetting, show: false } : bbSetting;
  const effPivotSetting = indiOff ? pivotOff(pivotSetting) : pivotSetting;
  // 차트 툴바 드롭다운 그룹 접힘 상태
  const [indiGroups, setIndiGroups] = useState({ favorites: true, basic: true, custom: false });
  const toggleIndiGroup = (k: keyof typeof indiGroups) => setIndiGroups((p) => ({ ...p, [k]: !p[k] }));
  return {
    indiOpen, setIndiOpen, indiRef,
    indicatorSettings, setIndicatorSettings, maSettings, setMaSettings, bbSetting, setBbSetting, pivotSetting, setPivotSetting,
    effIndicatorSettings, effMaSettings, effBbSetting, effPivotSetting,
    indiGroups, toggleIndiGroup,
  };
}

export type IndicatorState = ReturnType<typeof useIndicatorState>;
