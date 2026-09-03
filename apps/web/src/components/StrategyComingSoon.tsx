export default function StrategyComingSoon({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      style={{
        minHeight: compact ? 240 : '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '32px',
        textAlign: 'center',
        background: compact ? 'transparent' : '#000',
      }}
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b8e97" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 1.8" />
      </svg>
      <h2 style={{ color: 'var(--text, #eaecef)', fontSize: 18, fontWeight: 700, margin: 0 }}>전략 기능 준비 중</h2>
      <p style={{ color: 'var(--muted, #8b8e97)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        자동매매·백테스트 등 전략 기능은<br />곧 만나보실 수 있어요.
      </p>
    </div>
  );
}
