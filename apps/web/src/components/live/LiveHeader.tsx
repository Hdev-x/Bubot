import type { ReactNode } from 'react';

export interface LiveHeaderProps {
  onlineCount: number;
  totalBotCount: number;
  loading: boolean;
  label?: string;
  rightAction?: ReactNode; // Worker 라인 우측 액션(알람 등)
}

export default function LiveHeader({ onlineCount, totalBotCount, loading, label = 'Online', rightAction }: LiveHeaderProps) {
  return (
    <div className="live-header" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '14px 16px 10px',
      background: '#000',
      borderBottom: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span className="live-dot-pulse" style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: onlineCount > 0 ? '#0ecb81' : '#f6465d',
          boxShadow: onlineCount > 0 ? '0 0 8px #0ecb81' : '0 0 8px #f6465d',
          display: 'inline-block'
        }} />
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#8e929a' }}>
          {onlineCount}/{totalBotCount} {label}
        </span>
        {loading && (
          <span style={{
            width: '8px', height: '8px',
            border: '1.5px solid rgba(255,255,255,0.2)',
            borderTopColor: '#3182f6', borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            display: 'inline-block', marginLeft: '4px'
          }} />
        )}
      </div>
      {rightAction}
    </div>
  );
}
