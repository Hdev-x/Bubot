import { useState, type FormEvent, type CSSProperties } from 'react';
import { login, type AuthUser } from '../../../api/server/authApi';
import PullToRefresh from '../components/PullToRefresh';
import botzMark from '../../../assets/botz-mark.svg';

interface Props {
  onSuccess: (user: AuthUser) => void;
}

/** ============================================================
 * 로그인 화면. 로그인 성공 전에는 이 화면만 보이고,
 * 성공하면 onSuccess로 사용자 정보를 올려보내 앱(탭)으로 진입한다.
 * ============================================================ */
export default function LoginPage({ onSuccess }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshPage() {
    await new Promise(resolve => setTimeout(resolve, 250));
    window.location.reload();
  }

  return (
    <PullToRefresh onRefresh={refreshPage} fill>
      <div style={styles.wrap}>
        <main style={styles.shell}>
          <header style={styles.header}>
            <div style={styles.brand}>
              <span style={styles.logoBox}>
                <img src={botzMark} alt="" style={styles.logo} />
              </span>
              <span style={styles.brandText}>Botz</span>
            </div>
            <button type="button" style={styles.linkButton}>회원가입</button>
          </header>

          <form style={styles.form} onSubmit={handleSubmit}>
            <h1 style={styles.title}>로그인</h1>

            <div style={styles.tabs} aria-label="로그인 방식">
              <button type="button" style={{ ...styles.tab, ...styles.activeTab }}>이메일/휴대폰</button>
              <button type="button" style={styles.tab}>서브 계정</button>
            </div>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>이메일/휴대폰</span>
              <span style={styles.inputWrap}>
              <input
                style={styles.input}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="이메일 또는 휴대폰"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
              />
              {username && (
                <button type="button" style={styles.clearButton} onClick={() => setUsername('')} aria-label="입력 지우기">
                  ×
                </button>
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

            <button style={{ ...styles.primaryButton, opacity: loading ? 0.65 : 1 }} type="submit" disabled={loading}>
              {loading ? '로그인 중...' : '다음'}
            </button>

            <div style={styles.divider}>
              <span style={styles.line} />
              <span style={styles.orText}>또는</span>
              <span style={styles.line} />
            </div>

            <div style={styles.socialList}>
              {/* Google */}
              <button type="button" style={styles.socialButton}>
                <span style={styles.socialIcon}>
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                </span>
                <span>Google 로그인</span>
              </button>
              {/* Naver */}
              <button type="button" style={styles.socialButton}>
                <span style={styles.socialIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" fill="#03C75A"/>
                  </svg>
                </span>
                <span>네이버 로그인</span>
              </button>
              {/* Kakao */}
              <button type="button" style={styles.socialButton}>
                <span style={styles.socialIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3C5.925 3 1 6.842 1 11.583c0 3.09 1.944 5.8 4.887 7.372-.158.55-1.01 3.51-1.042 3.738-.04.283.187.27.354.159.13-.087 2.766-1.895 3.864-2.658 1.472.235 2.502.296 2.937.296 6.075 0 11-3.842 11-8.583C23 6.842 18.075 3 12 3z" fill="#FEE500"/>
                  </svg>
                </span>
                <span>카카오 로그인</span>
              </button>
            </div>
          </form>
        </main>
      </div>
    </PullToRefresh>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    minHeight: '100%',
    width: '100%',
    background: '#000000',
    color: '#f4f4f5',
    boxSizing: 'border-box',
  },
  shell: {
    position: 'relative',
    minHeight: '100dvh',
    width: '100%',
    maxWidth: 500,
    margin: '0 auto',
    padding: 'calc(12px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  logoBox: {
    width: 36,
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 36,
    height: 36,
    objectFit: 'contain',
  },
  brandText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: 0,
    transform: 'translateY(-1px)',
  },
  linkButton: {
    border: 'none',
    background: 'transparent',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 600,
    padding: 0,
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    paddingTop: 4,
  },
  title: {
    color: '#f5f5f5',
    fontSize: 30,
    fontWeight: 800,
    margin: '4px 0 18px',
    lineHeight: 1.1,
    letterSpacing: 0,
  },
  tabs: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 24,
    height: 27,
    marginBottom: 2,
  },
  tab: {
    position: 'relative',
    border: 'none',
    background: 'transparent',
    color: '#8e8e95',
    fontSize: 14,
    fontWeight: 700,
    padding: '0 0 8px',
    cursor: 'pointer',
  },
  activeTab: {
    color: '#f6f6f6',
    borderBottom: '2px solid #ffffff',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  fieldLabel: {
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: 700,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    height: 48,
    background: '#202126',
    border: '1px solid #202126',
    borderRadius: 8,
    padding: '0 44px 0 14px',
    color: '#f6f6f6',
    fontSize: 16,
    fontWeight: 700,
    outline: 'none',
    boxSizing: 'border-box',
  },
  clearButton: {
    position: 'absolute',
    top: 14,
    right: 12,
    width: 20,
    height: 20,
    border: 'none',
    borderRadius: '50%',
    background: 'transparent',
    color: '#777980',
    fontSize: 18,
    lineHeight: '20px',
    padding: 0,
    cursor: 'pointer',
  },
  error: {
    color: '#f6465d',
    fontSize: 13,
    margin: '-4px 0 0',
  },
  primaryButton: {
    height: 48,
    marginTop: 0,
    background: '#ffffff',
    color: '#101114',
    border: 'none',
    borderRadius: 8,
    padding: 0,
    fontSize: 17,
    fontWeight: 500,
    cursor: 'pointer',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '18px 0 6px',
  },
  line: {
    height: 1,
    flex: 1,
    background: '#24262a',
  },
  orText: {
    color: '#8a8d94',
    fontSize: 14,
  },
  socialList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  socialButton: {
    height: 49,
    border: '1px solid #26282f',
    borderRadius: 8,
    background: '#000000',
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  socialIcon: {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 900,
  },
  appleIcon: {
    width: 18,
    height: 18,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: 13,
  },
};
