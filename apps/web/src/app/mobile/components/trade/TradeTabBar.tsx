import type { RefObject } from 'react';
import { TAB_LABELS, type TradeTab } from './TradeTabEditSheet';

// 거래 탭 상단 카테고리 탭바(선물/현물/주식 + 순서 편집 "+"). OrderPage에서 JSX만 옮김 (wp-07 d03).
// tabsRef는 OrderPage의 탭 인디케이터 위치 측정 effect가 쓰므로 부모가 소유한다.
export default function TradeTabBar({ tabsRef, tabOrder, activeTab, exchangeSupportsFutures, switchMarket, onEditTabs }: {
  tabsRef: RefObject<HTMLElement | null>;
  tabOrder: TradeTab[];
  activeTab: TradeTab;
  exchangeSupportsFutures: boolean;
  switchMarket: (tab: TradeTab) => void;
  onEditTabs: () => void;
}) {
  return (
      <header className="trade-market-tabs" ref={tabsRef}>
        <div className="tabs-scroll-container">
          {/* 유저가 정한 순서대로 렌더. 선물 미지원 거래소(업비트/빗썸)는 Futures를
              회색 비활성으로 유지(숨기면 자리가 밀려 어색 → 자리 고정 + 클릭만 차단). */}
          {tabOrder.map((tab) => {
            const disabled = tab === 'futures' && !exchangeSupportsFutures;
            return (
              <button
                key={tab}
                data-tab={tab}
                className={activeTab === tab ? 'active' : ''}
                onClick={() => !disabled && switchMarket(tab)}
                disabled={disabled}
                style={disabled ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
              >{TAB_LABELS[tab]}</button>
            );
          })}
        </div>
        {/* 탭 라인 오른쪽 끝 "+": 탭 순서 편집 시트 오픈 */}
        <button
          type="button"
          className="trade-tab-edit-btn"
          onClick={onEditTabs}
          aria-label="탭 순서 편집"
          style={{ flex: '0 0 auto', background: 'none', border: 'none', color: '#848e9c', fontSize: 22, lineHeight: 1, padding: '0 2px 4px', cursor: 'pointer' }}
        >+</button>
      </header>
  );
}
