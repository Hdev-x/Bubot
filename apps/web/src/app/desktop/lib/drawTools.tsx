import type { ReactNode } from 'react';

// ── 그리기 도구(자체 드로잉 엔진) — 타입 문자열은 모바일 DrawingSheet와 동일 ──
export const WEB_DRAW_TOOLS: { type: string; name: string; icon: ReactNode }[] = [
  {
    type: 'horizontal-line', name: '수평선',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="2" y1="12" x2="22" y2="12" /><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'horizontal-ray', name: '수평 레이',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="7" y1="12" x2="22" y2="12" /><circle cx="5" cy="12" r="2.4" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'trend-line', name: '추세선',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="5" y1="19" x2="19" y2="5" /><circle cx="5" cy="19" r="2.2" fill="currentColor" stroke="none" /><circle cx="19" cy="5" r="2.2" fill="currentColor" stroke="none" /></svg>,
  },
  {
    type: 'parallel-channel', name: '평행 채널',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="21" x2="17" y2="7" /><line x1="7" y1="17" x2="21" y2="3" opacity="0.55" /></svg>,
  },
  {
    type: 'rectangle', name: '직사각형',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="10" rx="1" /></svg>,
  },
  {
    type: 'price-range', name: '가격 범위',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="4" x2="12" y2="20" /><polyline points="8.5 7.5 12 4 15.5 7.5" /><polyline points="8.5 16.5 12 20 15.5 16.5" /></svg>,
  },
  {
    type: 'fib-retracement', name: '피보나치 되돌림',
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="5" x2="21" y2="5" /><line x1="3" y1="12" x2="21" y2="12" opacity="0.65" /><line x1="3" y1="19" x2="21" y2="19" /></svg>,
  },
];
