import { useState, type FormEvent, type CSSProperties } from 'react';
import { login } from '../api/authApi';
import type { AuthUser } from '../api/authApi';
import botzMark from '../assets/botz-mark.svg';

// 데스크톱 웹 로그인 — 같은 백엔드(/api/auth/login). 올검 배경 + 로봇 로고 + 모바일 로그인 폼(ID/PW·SNS·회원가입) 디자인.
export default function WebLogin({ onLogin, onSignupClick, onClose }: { onLogin: (user: AuthUser) => void; onSignupClick?: () => void; onClose?: () => void }) {
  // 개발 편의: 기본값 채워둠 → 로그인 버튼만 누르면 됨
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const user = await login(username.trim(), password);
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      {/* 앱 헤더(.header) 위치만 재사용 — 배경/구분선은 페이지색과 동일하게 덮어써 탑바가 없는 것처럼 */}
      <header className="header" style={{ background: 'transparent', borderBottom: 'none' }}>
        <img className="header-logo" src={botzMark} alt="Botz" />
        {onClose && <button type="button" onClick={onClose} style={styles.close} aria-label="닫기">✕</button>}
      </header>
      <div style={styles.center}>
        <div className="web-auth-from-left" style={styles.col}>
        <form style={styles.form} onSubmit={submit}>
          <h1 style={styles.title}>로그인</h1>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>이메일</span>
            <span style={styles.inputWrap}>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="이메일"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                autoFocus
              />
              {username && (
                <button type="button" style={styles.clearButton} onClick={() => setUsername('')} aria-label="입력 지우기">×</button>
              )}
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>비밀번호</span>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </label>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.primaryButton, opacity: busy ? 0.65 : 1 }} type="submit" disabled={busy}>
            {busy ? '로그인 중…' : '다음'}
          </button>

          <div style={styles.divider}>
            <span style={styles.line} />
            <span style={styles.orText}>또는</span>
            <span style={styles.line} />
          </div>

          <div style={styles.socialList}>
            <button type="button" style={styles.socialButton}>
              <span style={styles.socialIcon}>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
              </span>
              <span>Google 로그인</span>
            </button>
            <button type="button" style={styles.socialButton}>
              <span style={styles.socialIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" fill="#03C75A"/>
                </svg>
              </span>
              <span>네이버 로그인</span>
            </button>
            <button type="button" style={styles.socialButton}>
              <span style={styles.socialIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3C5.925 3 1 6.842 1 11.583c0 3.09 1.944 5.8 4.887 7.372-.158.55-1.01 3.51-1.042 3.738-.04.283.187.27.354.159.13-.087 2.766-1.895 3.864-2.658 1.472.235 2.502.296 2.937.296 6.075 0 11-3.842 11-8.583C23 6.842 18.075 3 12 3z" fill="#FEE500"/>
                </svg>
              </span>
              <span>카카오 로그인</span>
            </button>
          </div>

          <div style={styles.signupRow}>
            <span style={styles.signupText}>계정이 없으신가요?</span>
            <button type="button" style={styles.signupLink} onClick={onSignupClick}>회원가입</button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    width: '100%',
    background: '#000000',
    color: '#f4f4f5',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  // 좌측 상단 로고 — 메인 앱 헤더(.header / .header-logo)와 같은 위치
  topbar: {
    flex: '0 0 56px',
    height: 56,
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    boxSizing: 'border-box',
  },
  // 앱 .header-logo와 동일(objectFit 없음 — contain이 박스 안에서 로고를 재정렬해 미세하게 내려앉던 것 제거)
  topLogo: {
    width: 40,
    height: 40,
    display: 'block',
    flexShrink: 0,
    position: 'relative',
    top: 3,
    left: -7,
  },
  close: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    border: 'none',
    background: 'transparent',
    color: '#8a8d94',
    fontSize: 18,
    cursor: 'pointer',
    lineHeight: '32px',
    padding: 0,
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    boxSizing: 'border-box',
  },
  col: {
    width: '100%',
    maxWidth: 380,
    display: 'flex',
    flexDirection: 'column',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logoBox: {
    width: 72,
    height: 72,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 72, height: 72, objectFit: 'contain' },
  brand: { color: '#ffffff', fontSize: 24, fontWeight: 800, lineHeight: 1, letterSpacing: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 },
  title: { color: '#f5f5f5', fontSize: 30, fontWeight: 800, margin: '4px 0 18px', lineHeight: 1.1 },
  tabs: { display: 'flex', alignItems: 'flex-end', gap: 24, height: 27, marginBottom: 2 },
  tab: { position: 'relative', border: 'none', background: 'transparent', color: '#8e8e95', fontSize: 14, fontWeight: 700, padding: '0 0 8px', cursor: 'pointer' },
  activeTab: { color: '#f6f6f6', borderBottom: '2px solid #ffffff' },
  field: { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldLabel: { color: '#f5f5f5', fontSize: 14, fontWeight: 700 },
  inputWrap: { position: 'relative' },
  input: {
    width: '100%', height: 48, background: '#202126', border: '1px solid #202126', borderRadius: 8,
    padding: '0 44px 0 14px', color: '#f6f6f6', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box',
  },
  clearButton: {
    position: 'absolute', top: 14, right: 12, width: 20, height: 20, border: 'none', borderRadius: '50%',
    background: 'transparent', color: '#777980', fontSize: 18, lineHeight: '20px', padding: 0, cursor: 'pointer',
  },
  error: { color: '#f6465d', fontSize: 13, margin: '-4px 0 0' },
  primaryButton: {
    height: 48, marginTop: 0, background: '#ffffff', color: '#101114', border: 'none', borderRadius: 8,
    padding: 0, fontSize: 17, fontWeight: 500, cursor: 'pointer',
  },
  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 6px' },
  line: { height: 1, flex: 1, background: '#24262a' },
  orText: { color: '#8a8d94', fontSize: 14 },
  socialList: { display: 'flex', flexDirection: 'column', gap: 12 },
  socialButton: {
    height: 49, border: '1px solid #26282f', borderRadius: 8, background: '#000000', color: '#ffffff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  socialIcon: { width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  signupRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  signupText: { color: '#8a8d94', fontSize: 14 },
  signupLink: { border: 'none', background: 'transparent', color: '#ffffff', fontSize: 14, fontWeight: 700, padding: 0, cursor: 'pointer' },
};
