import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { hexToRgba } from './settings';
import type { BBSetting } from './settings';

type Props = {
  bbSetting: BBSetting;
  onBbSettingChange?: (setting: BBSetting) => void;
};

export default function BbSection({ bbSetting, onBbSettingChange }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="indicator-group">
      <button
        className="indicator-group-header"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Bollinger Bands</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#848e9c' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onBbSettingChange) {
              onBbSettingChange({ ...bbSetting, show: !bbSetting.show });
            }
          }}
          className={`toss-switch ${bbSetting.show ? 'active' : ''}`}
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
            <div className="indicator-group-content color-picker-list" style={{ paddingTop: '8px' }}>
              <div className="color-picker-row" style={{ alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }} onClick={(e) => {
                  e.stopPropagation();
                  if (onBbSettingChange) {
                    onBbSettingChange({ ...bbSetting, show: !bbSetting.show });
                  }
                }}>
                  <div className={`toss-switch ${bbSetting.show ? 'active' : ''}`} style={{ transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                    <div className="toss-switch-thumb" />
                  </div>
                  <span className="color-picker-label">볼린저 밴드 (20, 2)</span>
                </label>
              </div>

              <div className="color-picker-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', paddingLeft: '32px' }}>
                <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d' }}>선 두께/색상</span>
                <div className="color-picker-right" style={{ gap: '12px', width: '100%', justifyContent: 'flex-start' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                  <select
                    value={bbSetting.lineWidth}
                    onChange={e => {
                      if (onBbSettingChange) {
                        onBbSettingChange({ ...bbSetting, lineWidth: parseInt(e.target.value) });
                      }
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', outline: 'none', cursor: 'pointer', fontSize: '13px' }}
                  >
                    <option value="1">1px</option>
                    <option value="2">2px</option>
                    <option value="3">3px</option>
                    <option value="4">4px</option>
                  </select>
                  <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                    <span className="color-picker-swatch" style={{ background: hexToRgba(bbSetting.lineColor, bbSetting.lineOpacity ?? 100), margin: 0 }} />
                    <input
                      type="color"
                      value={bbSetting.lineColor}
                      onChange={e => {
                        if (onBbSettingChange) {
                          onBbSettingChange({ ...bbSetting, lineColor: e.target.value });
                        }
                      }}
                      className="color-picker-input"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'none' }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={bbSetting.lineOpacity ?? 100}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={e => {
                      if (onBbSettingChange) {
                        onBbSettingChange({ ...bbSetting, lineOpacity: parseInt(e.target.value) });
                      }
                    }}
                    style={{ flex: 1, minWidth: 0, accentColor: bbSetting.lineColor }}
                  />
                  <span style={{ fontSize: '12px', color: '#90949d', width: '32px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {bbSetting.lineOpacity ?? 100}%
                  </span>
                </div>
              </div>

              <div className="color-picker-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', paddingLeft: '32px' }}>
                <span className="color-picker-label" style={{ fontSize: '13px', color: '#90949d' }}>배경 색상</span>
                <div className="color-picker-right" style={{ gap: '12px', width: '100%', justifyContent: 'flex-start' }} onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                  <div style={{ position: 'relative', width: '22px', height: '22px' }}>
                    <span className="color-picker-swatch" style={{ background: hexToRgba(bbSetting.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting.fillColor, bbSetting.fillOpacity ?? 10), margin: 0 }} />
                    <input
                      type="color"
                      value={bbSetting.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting.fillColor}
                      onChange={e => {
                        if (onBbSettingChange) {
                          onBbSettingChange({ ...bbSetting, fillColor: e.target.value });
                        }
                      }}
                      className="color-picker-input"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'none' }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0" max="100"
                    value={bbSetting.fillOpacity ?? 10}
                    onPointerDown={e => e.stopPropagation()}
                    onChange={e => {
                      if (onBbSettingChange) {
                        onBbSettingChange({ ...bbSetting, fillOpacity: parseInt(e.target.value) });
                      }
                    }}
                    style={{ flex: 1, minWidth: 0, accentColor: bbSetting.fillColor.startsWith('rgba') ? '#3182f6' : bbSetting.fillColor }}
                  />
                  <span style={{ fontSize: '12px', color: '#90949d', width: '32px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {bbSetting.fillOpacity ?? 10}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
