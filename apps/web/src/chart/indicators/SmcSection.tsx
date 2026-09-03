import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IndicatorSettings, TFIndicators, TFKey } from '../overlays/ChartOverlay';

const BASIC_SECTIONS: { key: keyof TFIndicators; label: string }[] = [
  { key: 'showOB', label: 'OB' },
  { key: 'showCE', label: 'CE' },
  { key: 'showEQ', label: 'EQ' },
];

const ADVANCED_SECTIONS: { key: keyof TFIndicators; label: string }[] = [
  { key: 'showFVG',   label: 'FVG'    },
  { key: 'showOBBox', label: 'OB Box' },
];

const INDICATOR_SECTIONS = [...BASIC_SECTIONS, ...ADVANCED_SECTIONS];

const TF_BTNS: { tf: TFKey; label: string }[] = [
  { tf: '1M', label: '1달' },
  { tf: '1W', label: '1주' },
  { tf: '3D', label: '3일' },
  { tf: '1D', label: '1일' },
];

type Props = {
  settings: IndicatorSettings;
  onChange: (settings: IndicatorSettings) => void;
};

export default function SmcSection({ settings, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const toggle = (tf: TFKey, key: keyof TFIndicators) => {
    onChange({
      ...settings,
      [tf]: { ...settings[tf], [key]: !settings[tf][key] },
    });
  };

  const renderSection = ({ key, label }: { key: keyof TFIndicators; label: string }) => (
    <section key={key} className="interval-section">
      <div className="interval-section-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <p className="interval-section-title" style={{ margin: 0 }}>{label}</p>
          <div
            onClick={(e) => {
              e.stopPropagation();
              const isSomeActive = TF_BTNS.some(({ tf }) => settings[tf][key]);
              if (isSomeActive) {
                localStorage.setItem(`smc_row_backup_${key}`, JSON.stringify(settings));
                const nextSettings = { ...settings };
                TF_BTNS.forEach(({ tf }) => {
                  nextSettings[tf] = { ...nextSettings[tf], [key]: false };
                });
                onChange(nextSettings);
              } else {
                const backupStr = localStorage.getItem(`smc_row_backup_${key}`);
                const nextSettings = { ...settings };
                if (backupStr) {
                  const parsed = JSON.parse(backupStr);
                  TF_BTNS.forEach(({ tf }) => {
                    nextSettings[tf] = { ...nextSettings[tf], [key]: parsed[tf]?.[key] ?? true };
                  });
                } else {
                  TF_BTNS.forEach(({ tf }) => {
                    nextSettings[tf] = { ...nextSettings[tf], [key]: true };
                  });
                }
                onChange(nextSettings);
              }
            }}
            className={`toss-switch ${TF_BTNS.some(({ tf }) => settings[tf][key]) ? 'active' : ''}`}
            style={{ transform: 'scale(0.7)', transformOrigin: 'left center', cursor: 'pointer' }}
          >
            <div className="toss-switch-thumb" />
          </div>
        </div>
      </div>
      <div className="interval-grid">
        {TF_BTNS.map(({ tf, label: tfLabel }) => (
          <button
            key={tf}
            className={`interval-button ${settings[tf][key] ? 'active' : ''}`}
            onClick={() => toggle(tf, key)}
          >
            {tfLabel}
          </button>
        ))}
      </div>
    </section>
  );

  return (
              <div className="indicator-group">
                <button
                  className="indicator-group-header"
                  onClick={() => setExpanded(prev => !prev)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Smart Money Concept</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#848e9c' }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      const isSMCOn = INDICATOR_SECTIONS.some(({ key }) => TF_BTNS.some(({ tf }) => settings[tf][key]));
                      if (isSMCOn) {
                        localStorage.setItem('smc_master_backup', JSON.stringify(settings));
                        const nextSettings = { ...settings };
                        TF_BTNS.forEach(({ tf }) => {
                          INDICATOR_SECTIONS.forEach(({ key }) => {
                            nextSettings[tf] = { ...nextSettings[tf], [key]: false };
                          });
                        });
                        onChange(nextSettings);
                      } else {
                        const backupStr = localStorage.getItem('smc_master_backup');
                        if (backupStr) {
                          onChange(JSON.parse(backupStr));
                        } else {
                          const nextSettings = { ...settings };
                          TF_BTNS.forEach(({ tf }) => {
                            INDICATOR_SECTIONS.forEach(({ key }) => {
                              const on = BASIC_SECTIONS.some(s => s.key === key) && (tf === '1M' || tf === '1W');
                              nextSettings[tf] = { ...nextSettings[tf], [key]: on };
                            });
                          });
                          onChange(nextSettings);
                        }
                      }
                    }}
                    className={`toss-switch ${INDICATOR_SECTIONS.some(({ key }) => TF_BTNS.some(({ tf }) => settings[tf][key])) ? 'active' : ''}`}
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
                      <div className="indicator-group-content">
                        <section className="interval-section">
                          <div 
                            className="interval-section-title-row" 
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onChange({ ...settings, hide1DOnLower: !settings.hide1DOnLower });
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <p className="interval-section-title" style={{ margin: 0 }}>1D선 하위 타임프레임에서만 표시</p>
                              <div
                                className={`toss-switch ${settings.hide1DOnLower ? 'active' : ''}`}
                                style={{ transform: 'scale(0.7)', transformOrigin: 'left center', pointerEvents: 'none' }}
                              >
                                <div className="toss-switch-thumb" />
                              </div>
                            </div>
                          </div>
                        </section>
                        {BASIC_SECTIONS.map(renderSection)}

                        <button
                          className="smc-advanced-toggle"
                          onClick={() => setAdvancedOpen(prev => !prev)}
                        >
                          <span>FVG · OB Box</span>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: advancedOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                        <AnimatePresence initial={false}>
                          {advancedOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              style={{ overflow: 'hidden' }}
                            >
                              {ADVANCED_SECTIONS.map(renderSection)}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  );
}
