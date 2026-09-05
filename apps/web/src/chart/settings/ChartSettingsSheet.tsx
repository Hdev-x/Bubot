import type React from 'react';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import './ChartSettingsSheet.css';

export type ChartTheme = {
  id: string;
  upColor: string;
  downColor: string;
  bgColor: string;
};

export const PRESET_THEMES: (ChartTheme & { name: string })[] = [
  { id: 'github_dark', name: 'GitHub 다크', upColor: '#b4dbfc', downColor: '#79c0ff', bgColor: '#000000' },
  { id: 'light',  name: '라이트', upColor: '#0ecb81', downColor: '#f6465d', bgColor: '#ffffff' },
  { id: 'dark',   name: '다크',   upColor: '#0ecb81', downColor: '#f6465d', bgColor: '#000000' },
  { id: 'github', name: 'GitHub', upColor: '#58a6ff', downColor: '#f85149', bgColor: '#0d1117' },
];

export function getDerivedThemeColors(theme: ChartTheme) {
  const r = parseInt(theme.bgColor.slice(1, 3), 16) || 0;
  const g = parseInt(theme.bgColor.slice(3, 5), 16) || 0;
  const b = parseInt(theme.bgColor.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isDark = brightness < 128;
  return {
    isDark,
    textColor: isDark ? '#9aa4b2' : '#9a9a9a',
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    crosshairColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
  };
}

export function getThemeCssVars(theme: ChartTheme): React.CSSProperties {
  const r = parseInt(theme.bgColor.slice(1, 3), 16) || 0;
  const g = parseInt(theme.bgColor.slice(3, 5), 16) || 0;
  const b = parseInt(theme.bgColor.slice(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const isDark = brightness < 128;
  return {
    '--chart-bg':           theme.bgColor,
    '--chart-text-main':    isDark ? '#e6edf3' : '#111111',
    '--chart-text-sub':     isDark ? '#8b949e' : '#6b7684',
    '--chart-text-muted':   isDark ? '#8b96a8' : '#8b95a1',
    '--chart-border':       isDark ? 'rgba(255,255,255,0.08)' : '#e8e8e8',
    '--chart-badge-border': isDark ? 'rgba(255,255,255,0.14)' : '#e5e8eb',
    '--chart-up':           theme.upColor,
    '--chart-down':         theme.downColor,
  } as React.CSSProperties;
}

export function MiniCandles({ upColor, downColor, bgColor }: Pick<ChartTheme, 'upColor' | 'downColor' | 'bgColor'>) {
  const candles = [
    { bull: true,  y: 3,  h: 14 },
    { bull: false, y: 5,  h: 12 },
    { bull: true,  y: 2,  h: 16 },
    { bull: false, y: 6,  h: 10 },
    { bull: true,  y: 1,  h: 15 },
  ];
  return (
    <div className="mini-candles-wrap" style={{ background: bgColor }}>
      {candles.map((c, i) => (
        <svg key={i} width="5" height="24" viewBox="0 0 5 24">
          <line x1="2.5" y1="0" x2="2.5" y2={c.y} stroke={c.bull ? upColor : downColor} strokeWidth="1" />
          <rect x="0.5" y={c.y} width="4" height={c.h} fill={c.bull ? upColor : downColor} rx="0.5" />
          <line x1="2.5" y1={c.y + c.h} x2="2.5" y2="24" stroke={c.bull ? upColor : downColor} strokeWidth="1" />
        </svg>
      ))}
    </div>
  );
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  theme: ChartTheme;
  onThemeChange: (theme: ChartTheme) => void;
  isLogScale?: boolean;
  onLogScaleToggle?: () => void;
};

export default function ChartSettingsSheet({ isOpen, onClose, theme, onThemeChange, isLogScale = false, onLogScaleToggle }: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const isCustom = !PRESET_THEMES.find(t => t.id === theme.id);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className="interval-sheet"
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{ y: 0, opacity: 1, height: '62dvh', borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 92 || info.velocity.y > 700) onClose();
            }}
          >
            <div className="interval-drag-zone">
              <div className="sheet-handle" />
            </div>
            <header className="interval-sheet-header">
              <h3>차트 설정</h3>
              <button className="interval-close-btn" type="button" onClick={onClose}>✕</button>
            </header>

            <div className="interval-sheet-content settings-sheet-content">

              {/* 테마 프리셋 */}
              <section className="settings-section">
                <p className="settings-section-title">테마</p>
                <div className="theme-presets-grid">
                  {PRESET_THEMES.map(preset => (
                    <button
                      key={preset.id}
                      className={`theme-preset-card ${theme.id === preset.id ? 'active' : ''}`}
                      onClick={() => onThemeChange(preset)}
                    >
                      <MiniCandles upColor={preset.upColor} downColor={preset.downColor} bgColor={preset.bgColor} />
                      <span className="theme-preset-name">{preset.name}</span>
                    </button>
                  ))}
                  <button
                    className={`theme-preset-card ${isCustom ? 'active' : ''}`}
                    onClick={() => onThemeChange({ ...theme, id: 'custom' })}
                  >
                    <div className="theme-preset-custom-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v8M8 12h8" />
                      </svg>
                    </div>
                    <span className="theme-preset-name">커스텀</span>
                  </button>
                </div>
              </section>

              {/* 캔들 색상 */}
              <section className="settings-section">
                <p className="settings-section-title">캔들 색상</p>
                <div className="color-picker-list">
                  <label className="color-picker-row">
                    <span className="color-picker-label">상승</span>
                    <div className="color-picker-right">
                      <span className="color-picker-hex">{theme.upColor}</span>
                      <span className="color-picker-swatch" style={{ background: theme.upColor }} />
                      <input
                        type="color"
                        value={theme.upColor}
                        onChange={e => onThemeChange({ ...theme, id: 'custom', upColor: e.target.value })}
                        className="color-picker-input"
                      />
                    </div>
                  </label>
                  <label className="color-picker-row">
                    <span className="color-picker-label">하락</span>
                    <div className="color-picker-right">
                      <span className="color-picker-hex">{theme.downColor}</span>
                      <span className="color-picker-swatch" style={{ background: theme.downColor }} />
                      <input
                        type="color"
                        value={theme.downColor}
                        onChange={e => onThemeChange({ ...theme, id: 'custom', downColor: e.target.value })}
                        className="color-picker-input"
                      />
                    </div>
                  </label>
                </div>
              </section>

              {/* 배경색 */}
              <section className="settings-section">
                <p className="settings-section-title">배경색</p>
                <div className="color-picker-list">
                  <label className="color-picker-row">
                    <span className="color-picker-label">배경</span>
                    <div className="color-picker-right">
                      <span className="color-picker-hex">{theme.bgColor}</span>
                      <span className="color-picker-swatch" style={{ background: theme.bgColor, border: '1.5px solid rgba(0,0,0,0.12)' }} />
                      <input
                        type="color"
                        value={theme.bgColor}
                        onChange={e => onThemeChange({ ...theme, id: 'custom', bgColor: e.target.value })}
                        className="color-picker-input"
                      />
                    </div>
                  </label>
                </div>
              </section>

              {/* 스케일 설정 */}
              <section className="settings-section">
                <p className="settings-section-title">스케일</p>
                <div className="color-picker-list">
                  <label className="color-picker-row" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onLogScaleToggle?.(); }}>
                    <span className="color-picker-label">로그 차트 (Log Scale)</span>
                    <div className="color-picker-right">
                      <div className={`toss-switch ${isLogScale ? 'active' : ''}`}>
                        <div className="toss-switch-thumb" />
                      </div>
                    </div>
                  </label>
                </div>
              </section>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
