import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WebApp from './WebApp';
import WebLogin from './WebLogin';
import WebSignup from './WebSignup';
import { fetchMe, logout } from '../api/authApi';
import type { AuthUser } from '../api/authApi';
import './web.css';

// 앱은 로그인 없이도 표시(마켓/차트 공개). 로그인/회원가입은 헤더 버튼 → 오버레이로 띄운다.
// 내투자·전략·관심·커뮤니티 글쓰기 등 계정 기능은 WebApp 안에서 로그인 게이트.
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
    return <WebLogin onLogin={(u) => { setUser(u); setAuth('none'); }} onSignupClick={() => setAuth('signup')} onClose={() => setAuth('none')} />;
  }
  if (auth === 'signup') {
    return <WebSignup onSignup={(u) => { setUser(u); setAuth('none'); }} onBackToLogin={() => setAuth('login')} onClose={() => setAuth('none')} />;
  }
  return <WebApp user={user} onLoginClick={() => setAuth('login')} onLogout={() => { logout(); window.location.reload(); }} />;
}

createRoot(document.getElementById('web-root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
