import { useState, type FormEvent, type CSSProperties } from 'react';
import { signup } from '../../api/server/authApi';
import type { AuthUser } from '../../api/server/authApi';
import botzMark from '../../assets/botz-mark.svg';
import './DesktopLogin.css';

// 데스크톱 웹 자체 회원가입 — POST /api/auth/register. 로그인 ID = 이메일. 성공 시 자동 로그인.
export default function DesktopSignup({ onSignup, onBackToLogin, onClose }: { onSignup: (user: AuthUser) => void; onBackToLogin: () => void; onClose?: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('이메일과 비밀번호를 입력하세요.'); return; }
    if (password.length < 4) { setError('비밀번호는 4자 이상이어야 합니다.'); return; }
    if (password !== confirm) { setError('비밀번호가 일치하지 않습니다.'); return; }
    setBusy(true);
    try {
      const user = await signup(email.trim(), password, name.trim() || email.trim());
      onSignup(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      {/* 앱 헤더(.header) 위치만 재사용 — 배경/구분선은 페이지색과 동일하게 덮어써 탑바가 없는 것처럼 */}
      <header className="header" style={{ background: 'transparent', borderBottom: 'none' }}>
        <img className="header-logo" src={botzMark} alt="Bubit" />
        {onClose && <button type="button" onClick={onClose} style={styles.close} aria-label="닫기">✕</button>}
      </header>
      <div style={styles.center}>
        <div className="web-auth-from-right" style={styles.col}>
          <form style={styles.form} onSubmit={submit}>
            <h1 style={styles.title}>회원가입</h1>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>이메일</span>
              <input
                style={styles.input}
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="이메일 (로그인 ID)"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                autoFocus
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>닉네임 <span style={styles.optional}>(선택)</span></span>
              <input
                style={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="표시 이름"
                autoComplete="nickname"
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>비밀번호</span>
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 (4자 이상)"
                autoComplete="new-password"
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>비밀번호 확인</span>
              <input
                style={styles.input}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="비밀번호 다시 입력"
                autoComplete="new-password"
              />
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <button style={{ ...styles.primaryButton, opacity: busy ? 0.65 : 1 }} type="submit" disabled={busy}>
              {busy ? '가입 중…' : '회원가입'}
            </button>

            <div style={styles.loginRow}>
              <span style={styles.loginText}>이미 계정이 있으신가요?</span>
              <button type="button" style={styles.loginLink} onClick={onBackToLogin}>로그인</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: '100vh', width: '100%', background: '#000000', color: '#f4f4f5', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  topbar: { flex: '0 0 56px', height: 56, display: 'flex', alignItems: 'center', padding: '0 24px', boxSizing: 'border-box' },
  topLogo: { width: 40, height: 40, display: 'block', flexShrink: 0, position: 'relative', top: 3, left: -7 },
  close: { marginLeft: 'auto', width: 32, height: 32, border: 'none', background: 'transparent', color: '#8a8d94', fontSize: 18, cursor: 'pointer', lineHeight: '32px', padding: 0 },
  center: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', boxSizing: 'border-box' },
  // 로그인 폼(탭+SNS로 더 김)과 같은 높이로 맞춰, 가운데 정렬 시 타이틀이 로그인과 같은 위치에서 시작하게 함.
  col: { width: '100%', maxWidth: 380, minHeight: 588, display: 'flex', flexDirection: 'column' },
  form: { display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 },
  title: { color: '#f5f5f5', fontSize: 30, fontWeight: 800, margin: '4px 0 14px', lineHeight: 1.1 },
  field: { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldLabel: { color: '#f5f5f5', fontSize: 14, fontWeight: 700 },
  optional: { color: '#8a8d94', fontSize: 12, fontWeight: 500 },
  input: {
    width: '100%', height: 48, background: '#202126', border: '1px solid #202126', borderRadius: 8,
    padding: '0 14px', color: '#f6f6f6', fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box',
  },
  error: { color: '#f6465d', fontSize: 13, margin: '-4px 0 0' },
  primaryButton: { height: 48, marginTop: 4, background: '#ffffff', color: '#101114', border: 'none', borderRadius: 8, padding: 0, fontSize: 17, fontWeight: 500, cursor: 'pointer' },
  loginRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  loginText: { color: '#8a8d94', fontSize: 14 },
  loginLink: { border: 'none', background: 'transparent', color: '#ffffff', fontSize: 14, fontWeight: 700, padding: 0, cursor: 'pointer' },
};
