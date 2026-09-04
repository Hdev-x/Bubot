import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AuthUser } from '../../../api/server/authApi';
import botzMark from '../../../assets/botz-mark.svg';

export type WatchMode = 'hidden' | 'float' | 'dock';

// 상단 헤더 — 로고·검색·관심 시세창 토글·프로필 메뉴. DesktopApp에서 JSX만 옮김 (wp-06 d02).
// menuRef는 DesktopApp의 바깥 클릭 감지 effect가 같이 쓰므로 부모가 소유한다.
export function DesktopHeader({ user, onLoginClick, onLogout, menuOpen, setMenuOpen, menuRef, effWatchMode, setWatchMode }: {
  user: AuthUser | null;
  onLoginClick: () => void;
  onLogout: () => void;
  menuOpen: boolean;
  setMenuOpen: Dispatch<SetStateAction<boolean>>;
  menuRef: RefObject<HTMLDivElement | null>;
  effWatchMode: WatchMode;
  setWatchMode: Dispatch<SetStateAction<WatchMode>>;
}) {
  return (
          <header className="header">
            <img className="header-logo" src={botzMark} alt="Botz" />
            <div className="header-right">
              <div className="header-search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                <input placeholder="검색" />
              </div>
              {user && (
                <button
                  className={`header-watch-btn${effWatchMode !== 'hidden' ? ' active' : ''}`}
                  title="관심 시세창"
                  onClick={() => setWatchMode((m) => (m === 'hidden' ? 'float' : 'hidden'))}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill={effWatchMode !== 'hidden' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                    <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
                  </svg>
                </button>
              )}
              {!user ? (
                <button className="header-login-btn" onClick={onLoginClick}>로그인</button>
              ) : (
              <div className="header-avatar-wrap" ref={menuRef}>
                <button
                  className="header-avatar"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="프로필"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                </button>
                {menuOpen && (
                  <div className="header-menu" role="menu">
                    <div className="header-menu-user">
                      <div className="header-menu-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                      </div>
                      <div className="header-menu-meta">
                        <div className="header-menu-name">{user.name || user.username}</div>
                        <div className="header-menu-sub">@{user.username}</div>
                      </div>
                    </div>
                    <div className="header-menu-divider" />
                    <button className="header-menu-item" role="menuitem" onClick={onLogout}>
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
          </header>
  );
}
