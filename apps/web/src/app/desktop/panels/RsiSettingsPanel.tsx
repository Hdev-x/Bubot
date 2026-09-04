import { useState } from 'react';
import type { RsiSettings, RsiGuideLine } from '../../../shared/utils/rsiCandles';
import './panels.css';

// 색 유틸 — rgba/hex 문자열 ↔ {hex, alpha}
function parseColor(color: string): { hex: string; alpha: number } {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    return { hex, alpha: m[4] != null ? parseFloat(m[4]) : 1 };
  }
  return { hex: color[0] === '#' ? color : '#969696', alpha: 1 };
}
function toRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const PALETTE = [
  '#ffffff', '#c4c4c4', '#787b86', '#4e4e4e', '#000000',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981',
  '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63',
];
const WIDTHS = [1, 2, 3, 4];
const STYLES = [{ v: 0, label: '실선' }, { v: 2, label: '대시' }, { v: 1, label: '점선' }];

// 작은 색 스와치 + 팝오버(팔레트 + 불투명도). 값은 rgba/hex, 100%면 hex로 저장.
function ColorPick({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const { hex, alpha } = parseColor(value);
  return (
    <div className="rsi-color-wrap">
      <button className="rsi-swatch" style={{ background: value }} onClick={() => setOpen((o) => !o)} />
      {open && (
        <>
          <div className="rsi-color-backdrop" onClick={() => setOpen(false)} />
          <div className="rsi-color-pop">
            <div className="rsi-color-grid">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={`rsi-color-cell${hex.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
                  style={{ background: c }}
                  onClick={() => onPick(toRgba(c, alpha))}
                />
              ))}
            </div>
            <div className="rsi-opacity">
              <span>불투명도</span>
              <input
                type="range" min={0} max={100} value={Math.round(alpha * 100)}
                onChange={(e) => onPick(toRgba(hex, Number(e.target.value) / 100))}
              />
              <em>{Math.round(alpha * 100)}%</em>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function RsiSettingsPanel({ settings, onChange, onClose }: {
  settings: RsiSettings;
  onChange: (next: RsiSettings) => void;
  onClose: () => void;
}) {
  // 취소용 스냅샷
  const [snapshot] = useState<RsiSettings>(() => JSON.parse(JSON.stringify(settings)));
  const patchLine = (i: number, patch: Partial<RsiGuideLine>) => {
    const lines = settings.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    onChange({ ...settings, lines });
  };

  return (
    <div className="wdt-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { onChange(snapshot); onClose(); } }}>
      <div className="wdt-dialog" onPointerDown={(e) => e.stopPropagation()}>
        <div className="wdt-dlg-head">
          <span className="wdt-dlg-title">RSI 설정</span>
          <button className="wdt-dlg-x" onClick={() => { onChange(snapshot); onClose(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="wdt-dlg-body">
          {/* 기간 */}
          <div className="wdt-row">
            <span className="wdt-label">기간</span>
            <input
              className="wdt-input" type="number" min={2} max={100} value={settings.period}
              onChange={(e) => { const p = parseInt(e.target.value); if (Number.isFinite(p) && p >= 2) onChange({ ...settings, period: p }); }}
            />
          </div>

          {/* 캔들 색 */}
          <div className="wdt-row">
            <span className="wdt-label">캔들 상승</span>
            <ColorPick value={settings.upColor} onPick={(c) => onChange({ ...settings, upColor: c })} />
            <span className="wdt-label" style={{ width: 'auto', marginLeft: 8 }}>하락</span>
            <ColorPick value={settings.downColor} onPick={(c) => onChange({ ...settings, downColor: c })} />
          </div>

          {/* 가격축 스케일 */}
          <div className="wdt-row">
            <span className="wdt-label">스케일</span>
            <select
              className="wdt-select wdt-select-wide"
              value={settings.logScale ? 'log' : 'linear'}
              onChange={(e) => onChange({ ...settings, logScale: e.target.value === 'log' })}
            >
              <option value="linear">선형</option>
              <option value="log">로그</option>
            </select>
          </div>

          <div className="wdt-sep-line" />

          {/* 기준선 70/50/30 */}
          {settings.lines.map((ln, i) => (
            <div key={ln.value} className="wdt-row rsi-line-row">
              <label className="rsi-line-check">
                <input type="checkbox" checked={ln.visible} onChange={(e) => patchLine(i, { visible: e.target.checked })} />
                <span>{ln.value} 선</span>
              </label>
              <ColorPick value={ln.color} onPick={(c) => patchLine(i, { color: c })} />
              <select className="wdt-select" value={ln.width} onChange={(e) => patchLine(i, { width: Number(e.target.value) })}>
                {WIDTHS.map((w) => <option key={w} value={w}>{w}px</option>)}
              </select>
              <select className="wdt-select" value={ln.style} onChange={(e) => patchLine(i, { style: Number(e.target.value) })}>
                {STYLES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="wdt-dlg-foot">
          <button className="wdt-btn" onClick={() => { onChange(snapshot); onClose(); }}>취소</button>
          <button className="wdt-btn primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
