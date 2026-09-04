import { useRef, useState } from 'react';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';
import { useChartTheme } from '../../../chart/hooks/useChartTheme';
import { PRESET_THEMES } from '../../../chart/settings/ChartSettingsSheet';
import { DARK_THEME } from '../lib/indicatorDefaults';

// Desktop 차트 보기 상태 — 타임프레임·로그축·현재가선·테마·차트설정 드롭다운. DesktopApp에서 옮김 (wp-06 d04a).
// visibleTFs·TF 폴백 effect는 solo 포커스(focusTracker)에 묶여 있어 DesktopApp에 남아 있다.
export function useChartViewState({ loggedIn }: { loggedIn: boolean }) {
  const [activeTf, setActiveTf] = useState('1H');
  const [chartSetOpen, setChartSetOpen] = useState(false);
  const chartSetRef = useRef<HTMLDivElement>(null);
  const [chartTheme, setChartTheme] = useChartTheme(DARK_THEME); // 웹 기본 테마 = 다크
  const [isLogScale, setIsLogScale] = usePersistentState('chart_log_scale', true);
  // 현재가 기준 수평 점선(priceLine) — 기본 끔, 새로고침에도 유지
  const [priceLineOn, setPriceLineOn] = usePersistentState('web_price_line', false);
  // 비로그인 시 테마는 다크(DARK_THEME)로 고정. 로그인 후엔 저장된 선택값 유지.
  const effChartTheme = loggedIn ? chartTheme : DARK_THEME;
  const isCustomTheme = !PRESET_THEMES.find((t) => t.id === chartTheme.id);
  return {
    activeTf, setActiveTf, chartSetOpen, setChartSetOpen, chartSetRef,
    chartTheme, setChartTheme, effChartTheme, isCustomTheme,
    isLogScale, setIsLogScale, priceLineOn, setPriceLineOn,
  };
}

export type ChartViewState = ReturnType<typeof useChartViewState>;
