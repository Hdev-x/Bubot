// 사이드바 섹션·내 투자 탭 상수 — DesktopApp에서 분리 (wp-06 d02). IconRail·Sidebar·InvestSection이 공유.
export type Section = 'invest' | 'market' | 'strategy';
export const SECTIONS: { id: Section; title: string }[] = [
  { id: 'invest', title: '내 투자' },
  { id: 'market', title: '실시간' },
  { id: 'strategy', title: '전략' },
];

export const INVEST_TABS = ['전체', '선물', '현물', '주식'] as const;
export type InvestTab = (typeof INVEST_TABS)[number];
