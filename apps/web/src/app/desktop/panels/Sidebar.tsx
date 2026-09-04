import type { Dispatch, SetStateAction } from 'react';
import StrategyComingSoon from '../../mobile/components/StrategyComingSoon';
import { MarketPanel } from './MarketPanel';
import { InvestSection, type InvestSectionProps } from './InvestSection';
import { SECTIONS, type Section } from '../lib/sections';

// 사이드바 패널 — 로그인 게이트·섹션 제목·통화 토글·섹션 본문. DesktopApp에서 JSX만 옮김 (wp-06 d02).
export function Sidebar({ sidebarOpen, section, sectionLocked, krw, setKrw, marketActive, handleSelectChart, invest }: {
  sidebarOpen: boolean;
  section: Section;
  sectionLocked: boolean;
  krw: boolean;
  setKrw: Dispatch<SetStateAction<boolean>>;
  marketActive: boolean;
  handleSelectChart: (symbol: string, market: string, exchange: string) => void;
  invest: InvestSectionProps;
}) {
  return (
        <aside className={`sidebar-panel${sidebarOpen ? ' open' : ''}`}>
          {sectionLocked && (
            <div className="sidebar-login-gate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <p className="sidebar-login-gate-msg">로그인이 필요한 서비스입니다</p>
            </div>
          )}
          <div className="sidebar-header">
            <span className="sidebar-title-wrap">
              {SECTIONS.find((s) => s.id === section)?.title}
            </span>
            {/* 원화/USD 전환은 내 잔고에만 적용되므로 내투자 섹션에서만 노출 */}
            {section === 'invest' && (
              <div className="sidebar-header-btns">
                <div className={`cur-switch${krw ? ' krw' : ''}`} onClick={() => setKrw((v) => !v)}>
                  <span className="cur-switch-label">$</span>
                  <span className="cur-switch-label">원</span>
                  <div className="cur-switch-thumb" />
                </div>
              </div>
            )}
          </div>

          {/* 내 투자 */}
          {section === 'invest' && <InvestSection {...invest} />}

          {section === 'market' && (
            <div className="sidebar-section web-market">
              <MarketPanel active={marketActive} onSelect={handleSelectChart} />
            </div>
          )}
          {section === 'strategy' && (
            <div className="sidebar-section">
              <StrategyComingSoon compact />
            </div>
          )}
        </aside>
  );
}
