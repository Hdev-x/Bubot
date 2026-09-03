import { Component, type ReactNode } from 'react';

/**
 * 앱 전역 에러 바운더리 — 컴포넌트 트리에서 렌더 에러가 나면
 * 앱 전체가 백지가 되는 대신 복구 안내 화면을 보여준다.
 * "다시 시작"은 전체 리로드(PWA 캐시 기준 재부팅)라 대부분의 일시 오류에서 복구된다.
 */
interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12,
        background: 'var(--bg, #0b0b0b)', color: 'var(--text, #eee)',
        padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>화면을 표시하는 중 문제가 발생했어요</div>
        <div style={{ fontSize: 12, color: 'var(--text3, #888)', wordBreak: 'break-all' }}>
          {this.state.error.message}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: '10px 22px', borderRadius: 10, border: 'none',
            background: '#0ecb81', color: '#04140d', fontWeight: 700, fontSize: 13,
          }}
        >
          다시 시작
        </button>
      </div>
    );
  }
}
