import { useEffect, useRef, useState } from 'react';

interface Props {
  username?: string;
  onLogout: () => void;
  onAccount?: () => void;
}

/** ============================================================
 * 프로필 아바타 버튼 + 드롭다운 메뉴.
 * - 스퀘어클(둥근 사각) 아바타 버튼
 * - 드롭다운: 사용자 이름 / 내 정보 / 로그아웃
 * ============================================================ */
export default function ProfileMenu({ username, onLogout, onAccount }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥 영역 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="pm">
      <button type="button" aria-label="프로필" className="pm-btn" onClick={() => setOpen((v) => !v)}>
        <UserIcon size={22} />
      </button>

      {open && (
        <div className="pm-menu">
          <div className="pm-head">
            <div className="pm-avatar">
              <UserIcon size={22} />
            </div>
            <div className="pm-meta">
              <span className="pm-name">{username ?? '사용자'}</span>
              <span className="pm-sub">로그인됨</span>
            </div>
          </div>

          <div className="pm-sep" />

          <button
            type="button"
            className="pm-item"
            onClick={() => {
              setOpen(false);
              onAccount?.();
            }}
          >
            내 정보 <span className="pm-arrow">›</span>
          </button>

          <button
            type="button"
            className="pm-item"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

/** 기본 프로필 실루엣 (아웃라인) */
function UserIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} width={size} height={size}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </svg>
  );
}
