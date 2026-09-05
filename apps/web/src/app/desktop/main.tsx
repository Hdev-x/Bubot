import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import './styles/desktop.css'; // 앱 셸 CSS를 화면 컴포넌트보다 먼저 로드 — 컴포넌트 옆 CSS가 뒤에 와서 원본 cascade(셸 → 화면) 유지 (리뷰 P0 수정)
import DesktopApp from './DesktopApp';
import DesktopLogin from './DesktopLogin';
import DesktopSignup from './DesktopSignup';
import { fetchMe, logout } from '../../api/server/authApi';
import type { AuthUser } from '../../api/server/authApi';

// 앱은 로그인 없이도 표시(마켓/차트 공개). 로그인/회원가입은 헤더 버튼 → 오버레이로 띄운다.
// 내투자·전략·관심·커뮤니티 글쓰기 등 계정 기능은 DesktopApp 안에서 로그인 게이트.
function Root() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [auth, setAuth] = useState<'none' | 'login' | 'signup'>('none');
  useEffect(() => {
    fetchMe().then((u) => setUser(u));
  }, []);

  if (user === undefined) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a8c90', background: '#000' }}>불러오는 중…</div>;
  }
  if (auth === 'login') {
    return <DesktopLogin onLogin={(u) => { setUser(u); setAuth('none'); }} onSignupClick={() => setAuth('signup')} onClose={() => setAuth('none')} />;
  }
  if (auth === 'signup') {
    return <DesktopSignup onSignup={(u) => { setUser(u); setAuth('none'); }} onBackToLogin={() => setAuth('login')} onClose={() => setAuth('none')} />;
  }
  return <DesktopApp user={user} onLoginClick={() => setAuth('login')} onLogout={() => { logout(); window.location.reload(); }} />;
}

// dev HMR 주의: 이 파일은 컴포넌트(Root)를 담고 있어 Vite React 플러그인이 HMR 경계로 삼는다. 훅·lib 파일이 바뀌면
// main.tsx가 다시 실행되는데, 그때 createRoot를 또 부르면 같은 컨테이너에 앱이 두 개 그려져 탭 제목이 두 종목으로
// 번갈아 바뀌었다(2026-09-06 사용자 관찰, 콘솔 'createRoot() on a container that has already been passed'). 루트는 하나만 만들어 재사용한다.
declare global { interface Window { __bubitDesktopRoot?: Root } }
const root = (window.__bubitDesktopRoot ??= createRoot(document.getElementById('desktop-root')!));
root.render(
  <StrictMode>
    <Root />
  </StrictMode>
);
