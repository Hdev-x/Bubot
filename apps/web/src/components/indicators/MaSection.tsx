import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hexToRgba } from './settings';
import type { MASetting, MAType } from './settings';

// 참고: 여러 MA가 같은 기간이어도 종류가 달라 구분되므로, 리스트 key는 period가 아닌 index 사용.

type Props = {
  maSettings: MASetting[];
  onMaSettingsChange?: (settings: MASetting[]) => void;
};

const MA_TYPES: MAType[] = ['SMA', 'EMA', 'WMA'];

export default function MaSection({ maSettings, onMaSettingsChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const anyOn = maSettings.some(ma => ma.show);

  return (
    <div className="indicator-group">
      <button className="indicator-group-header" onClick={() => setExpanded(prev => !prev)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Moving Average</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#848e9c' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!onMaSettingsChange) return;
            if (anyOn) {
              localStorage.setItem('ma_backup', JSON.stringify(maSettings.map(ma => ma.show)));
              onMaSettingsChange(maSettings.map(ma => ({ ...ma, show: false })));
            } else {
              const backupStr = localStorage.getItem('ma_backup');
              const backup = backupStr ? JSON.parse(backupStr) : maSettings.map(() => true);
              onMaSettingsChange(maSettings.map((ma, i) => ({ ...ma, show: backup[i] ?? true })));
            }
          }}
          className={`toss-switch ${anyOn ? 'active' : ''}`}
          style={{ transform: 'scale(0.7)', transformOrigin: 'right center', cursor: 'pointer' }}
        >
          <div className="toss-switch-thumb" />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="ma-list">
              {maSettings.map((ma, idx) => {
                const upd = (patch: Partial<MASetting>) => {
                  if (!onMaSettingsChange) return;
                  const next = [...maSettings];
                  next[idx] = { ...ma, ...patch };
                  onMaSettingsChange(next);
                };
                const type = ma.type ?? 'SMA';
                const opacity = ma.opacity ?? 100;
                return (
                  <div key={idx} className={`ma-item${ma.show ? ' on' : ''}`} style={{ ['--ma' as string]: hexToRgba(ma.color, ma.show ? 100 : 40) }}>
                    <span className="ma-rail" />
                    {/* 상단: 켜기 스위치 · 종류 세그먼트 · 기간 */}
                    <div className="ma-head">
                      <div
                        className={`toss-switch ${ma.show ? 'active' : ''}`}
                        style={{ transform: 'scale(0.72)', transformOrigin: 'left center', cursor: 'pointer', flex: 'none' }}
                        onClick={() => upd({ show: !ma.show })}
                      >
                        <div className="toss-switch-thumb" />
                      </div>
                      <div className="ma-seg" role="group" aria-label="MA 종류">
                        {MA_TYPES.map(t => (
                          <button key={t} className={`ma-seg-btn${type === t ? ' active' : ''}`} onClick={() => upd({ type: t })}>{t}</button>
                        ))}
                      </div>
                      <div className="ma-period">
                        <input
                          type="number" min={1} max={1000} value={ma.period} aria-label="기간"
                          onChange={e => { const p = parseInt(e.target.value); if (Number.isFinite(p) && p >= 1) upd({ period: p }); }}
                        />
                      </div>
                    </div>
                    {/* 하단: 색 · 두께 · 불투명도 */}
                    <div className="ma-ctrls">
                      <label className="ma-color" style={{ background: hexToRgba(ma.color, opacity) }}>
                        <input type="color" value={ma.color} onChange={e => upd({ color: e.target.value })} />
                      </label>
                      <div className="ma-seg ma-seg-wt" role="group" aria-label="선 굵기">
                        {[1, 2, 3, 4].map(w => (
                          <button key={w} className={`ma-seg-btn ma-wt-btn${ma.lineWidth === w ? ' active' : ''}`} onClick={() => upd({ lineWidth: w })} title={`${w}px`} aria-label={`${w}px`}>
                            <span className="ma-wt-line" style={{ height: `${w}px` }} />
                          </button>
                        ))}
                      </div>
                      <input
                        className="ma-opacity" type="range" min={0} max={100} value={opacity}
                        style={{ accentColor: ma.color }}
                        onChange={e => upd({ opacity: parseInt(e.target.value) })}
                      />
                      <span className="ma-opacity-val">{opacity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .ma-list { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 4px; }
        .ma-item {
          position: relative; display: flex; flex-direction: column; gap: 9px;
          padding: 11px 12px 11px 15px; border-radius: 11px;
          background: rgba(255,255,255,0.022);
          border: 1px solid rgba(255,255,255,0.05);
          transition: border-color .16s, background .16s, opacity .16s;
        }
        .ma-item:not(.on) { opacity: .5; }
        .ma-item:hover { border-color: color-mix(in srgb, var(--ma) 45%, transparent); background: rgba(255,255,255,0.04); }
        .ma-rail {
          position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px; border-radius: 3px;
          background: var(--ma); box-shadow: 0 0 7px -1px var(--ma);
        }
        .ma-head { display: flex; align-items: center; gap: 10px; }
        /* 세그먼트 컨트롤(종류/두께) */
        .ma-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: rgba(255,255,255,0.05); }
        .ma-seg-btn {
          appearance: none; border: 0; cursor: pointer;
          padding: 4px 9px; border-radius: 6px; background: transparent;
          color: #8a8c90; font-size: 11px; font-weight: 700; letter-spacing: .4px;
          font-family: 'SF Mono','Fira Code',ui-monospace,monospace;
          transition: color .14s, background .14s, box-shadow .14s;
        }
        .ma-seg-btn:hover { color: #d3d6dd; }
        .ma-seg-btn.active {
          color: #0b0d10; background: var(--ma);
          box-shadow: 0 1px 6px -1px var(--ma);
        }
        .ma-seg-sm .ma-seg-btn { padding: 4px 8px; min-width: 22px; }
        /* 선 굵기 세그먼트 — 실제 두께의 가로선으로 표시 */
        .ma-wt-btn { display: flex; align-items: center; justify-content: center; width: 26px; padding: 8px 5px; }
        .ma-wt-line { display: block; width: 100%; border-radius: 2px; background: #8a8c90; transition: background .14s; }
        .ma-wt-btn:hover .ma-wt-line { background: #d3d6dd; }
        .ma-wt-btn.active .ma-wt-line { background: #0b0d10; }
        /* 기간 입력 */
        .ma-period { margin-left: auto; }
        .ma-period input {
          width: 56px; text-align: center; padding: 5px 6px;
          background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); border-radius: 7px;
          color: #eaecef; font-size: 12.5px; font-weight: 600; outline: none;
          font-family: 'SF Mono','Fira Code',ui-monospace,monospace;
          transition: border-color .14s;
          -moz-appearance: textfield;
        }
        .ma-period input::-webkit-outer-spin-button,
        .ma-period input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .ma-period input:focus { border-color: var(--ma); }
        /* 하단 컨트롤 */
        .ma-ctrls { display: flex; align-items: center; gap: 10px; }
        .ma-color {
          position: relative; width: 22px; height: 22px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.22); cursor: pointer; flex: none;
          box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25);
        }
        .ma-color input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        .ma-opacity { flex: 1; min-width: 0; height: 3px; }
        .ma-opacity-val {
          width: 26px; text-align: right; font-size: 11.5px; color: #90949d;
          font-family: 'SF Mono','Fira Code',ui-monospace,monospace; font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
