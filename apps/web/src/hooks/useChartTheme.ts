import { useCallback, useState } from 'react';
import type { ChartTheme } from '../components/ChartSettingsSheet';

const STORAGE_KEY = 'chart_theme';

// 쿠키 헬퍼 (모바일 인앱 웹뷰 등 localStorage 소실 대비)
function setCookie(name: string, value: string, days = 365) {
  try {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = '; expires=' + date.toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
  } catch { /* ignore */ }
}

function getCookie(name: string): string | null {
  try {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1);
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length));
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * 차트 테마 상태. localStorage 우선, 없으면 쿠키 폴백으로 복원하고
 * 변경 시 두 저장소에 모두 기록한다.
 */
export function useChartTheme(defaultTheme: ChartTheme): [ChartTheme, (theme: ChartTheme) => void] {
  const [chartTheme, setChartThemeState] = useState<ChartTheme>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }

    try {
      const savedCookie = getCookie(STORAGE_KEY);
      if (savedCookie) return JSON.parse(savedCookie);
    } catch { /* ignore */ }

    return defaultTheme;
  });

  const setChartTheme = useCallback((theme: ChartTheme) => {
    setChartThemeState(theme);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch { /* ignore */ }
    try {
      setCookie(STORAGE_KEY, JSON.stringify(theme));
    } catch { /* ignore */ }
  }, []);

  return [chartTheme, setChartTheme];
}
