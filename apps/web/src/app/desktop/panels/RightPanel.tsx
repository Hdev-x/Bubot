import type { AuthUser } from '../../../api/server/authApi';

// 커뮤니티 채팅 목업 데이터 — DesktopApp에서 옮김 (wp-06 d05). 실제 채팅은 미구현.
const CHATS = [
  { av: 'J', bg: '', nick: 'jordan_', time: '12:34', body: '64k 저항 강함. 음봉 시작' },
  { av: 'M', bg: '#3b3f4b', nick: 'marketmkr', time: '12:35', body: '63.5k 지지 봐야할듯' },
  { av: 'T', bg: '#5a3a3a', nick: 'trader.kr', time: '12:36', body: '롱 절반 익절 👍' },
  { av: 'H', bg: '#3a5a3a', nick: 'han.dev', time: '12:38', body: '데스크톱 화면 너무 좋다' },
  { av: 'D', bg: '#3a3a5a', nick: 'delta_', time: '12:40', body: 'FOMC 다음주라 변동성 주의' },
  { av: 'R', bg: '#5a4a2a', nick: 'ronin', time: '12:41', body: '차트 + 호가 + 채팅 한 화면 만족' },
] as const;

// 오른쪽 패널 — Community 탭·채팅 목록·입력(비로그인 잠금). DesktopApp에서 JSX만 옮김 (wp-06 d05).
export function RightPanel({ user }: { user: AuthUser | null }) {
  return (
                <div className="panel panel-right">
                  <div className="right-tabs">
                    <div className="right-tab active">Community</div>
                    <span className="right-tab-status">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                      142
                    </span>
                  </div>
                  <div className="chat-messages">
                    {CHATS.map((c) => (
                      <div key={c.nick} className="chat-msg">
                        <div className="avatar" style={c.bg ? { background: c.bg } : undefined}>{c.av}</div>
                        <div className="bubble">
                          <div className="meta"><span className="nick">{c.nick}</span><span className="time">{c.time}</span></div>
                          <div className="body">{c.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {user ? (
                  <div className="chat-input">
                    <textarea
                      className="chat-textarea"
                      rows={1}
                      placeholder="메시지를 입력하세요..."
                      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                    />
                    <button className="chat-send" aria-label="전송">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z" />
                      </svg>
                    </button>
                  </div>
                  ) : (
                  <div className="chat-input chat-input-locked" aria-disabled="true">
                    <textarea className="chat-textarea" rows={1} placeholder="" readOnly />
                    <span className="chat-send" aria-label="로그인 필요">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    </span>
                  </div>
                  )}
                </div>
  );
}
