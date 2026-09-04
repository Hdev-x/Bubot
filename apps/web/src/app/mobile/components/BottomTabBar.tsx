import botzMark from '../../../assets/botz-mark.svg';
import './components.css';

export type AppRoute = '/' | '/chart' | '/orders' | '/strategy' | '/assets';

type TabItem = {
  route: AppRoute;
  label: string;
  icon: React.ReactNode;
  iconClassName?: string;
};

const tabs: TabItem[] = [
  {
    route: '/',
    label: '마켓',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        {/* 채워진 2x2 그리드 (LayoutGrid Solid) */}
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ) 
  },
  { 
    route: '/chart', 
    label: '차트', 
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        {/* 채워진 2캔들 차트 (Candlestick Solid) */}
        <rect x="5" y="8" width="5" height="10" rx="1" />
        <rect x="7" y="3" width="1" height="5" />
        <rect x="7" y="18" width="1" height="3" />
        
        <rect x="14" y="5" width="5" height="12" rx="1" />
        <rect x="16" y="2" width="1" height="3" />
        <rect x="16" y="17" width="1" height="5" />
      </svg>
    ) 
  },
  {
    route: '/orders',
    label: '거래',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        {/* 거래 — 번개(Bolt Solid). 빠른 체결·실시간 매매 */}
        <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" />
      </svg>
    )
  },
  {
    route: '/strategy',
    label: '전략',
    iconClassName: 'botz-trade-icon',
    icon: (
      <img src={botzMark} alt="" />
    )
  },
  { 
    route: '/assets',
    label: '자산',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        {/* 채워진 카드지갑 (Wallet Solid) */}
        <path d="M19 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h15c1.66 0 3-1.34 3-3V8c0-1.66-1.34-3-3-3zm-2 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
      </svg>
    ) 
  }
];

type Props = {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onReselect?: (route: AppRoute) => void; // 이미 활성인 탭을 다시 탭 (예: 거래탭 재탭 → Bot↔Trade 토글)
};

export default function BottomTabBar({ activeRoute, onNavigate, onReselect }: Props) {
  return (
    <nav className="bottom-tabbar" aria-label="주요 화면">
      {tabs.map((tab) => (
        <button
          key={tab.route}
          className={activeRoute === tab.route ? 'active' : ''}
          aria-current={activeRoute === tab.route ? 'page' : undefined}
          onClick={() => (activeRoute === tab.route ? onReselect?.(tab.route) : onNavigate(tab.route))}
        >
          <span className={`tab-icon${tab.iconClassName ? ` ${tab.iconClassName}` : ''}`} aria-hidden="true">
            {tab.icon}
          </span>
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
