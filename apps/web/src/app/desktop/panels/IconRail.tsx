import type { Dispatch, SetStateAction } from 'react';
import botzMark from '../../../assets/botz-mark.svg';
import type { Section } from '../lib/sections';

// 왼쪽 아이콘 레일 — 사이드바 접기·섹션 전환. DesktopApp에서 JSX만 옮김 (wp-06 d02).
export function IconRail({ section, openSection, sidebarOpen, setSidebarOpen }: {
  section: Section;
  openSection: (id: Section) => void;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
        <nav className="sidebar-icons">
          <button className={`si-btn si-fold-btn${!sidebarOpen ? ' folded' : ''}`} onClick={() => setSidebarOpen((v) => !v)}>
            <svg className="si-fold-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.41 6 5 7.41 9.58 12 5 16.59 6.41 18l6-6-6-6zm8 0-1.41 1.41L17.58 12l-4.58 4.59L14.41 18l6-6-6-6z" />
            </svg>
          </button>
          <div className="si-divider" />
          <button className={`si-btn${section === 'invest' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('invest')}>
            <svg className="si-bolt" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" /></svg>
            <span>내 투자</span>
          </button>
          <div className="si-divider" />
          <button className={`si-btn${section === 'strategy' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('strategy')}>
            <img className="si-strategy-icon" src={botzMark} alt="" aria-hidden="true" />
            <span>전략</span>
          </button>
          <button className={`si-btn${section === 'market' && sidebarOpen ? ' active' : ''}`} onClick={() => openSection('market')}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.48 12.35c-1.57-4.08-7.16-4.3-5.81-10.23.1-.44-.37-.78-.75-.55C9.29 3.71 6.68 8 8.87 13.62c.18.46-.36.89-.75.59-1.81-1.37-2-3.34-1.84-4.75.06-.52-.62-.77-.91-.34C4.69 10.16 4 11.84 4 14c0 4.22 3.8 7.99 8 8 4.28.02 7.96-3.77 8-8.02.03-1.81-.35-3.9-.52-1.63z" /></svg>
            <span>실시간</span>
          </button>
        </nav>
  );
}
