import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IndicatorSettings } from './ChartOverlay';
import { hexToRgba, DEFAULT_PIVOT_SETTING, DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING } from './indicators/settings';
import type { MASetting, BBSetting, PivotSetting } from './indicators/settings';
import BbSection from './indicators/BbSection';
import MaSection from './indicators/MaSection';
import SmcSection from './indicators/SmcSection';
import PivotSection from './indicators/PivotSection';
import HarmonicSection from './indicators/HarmonicSection';
import ElliottSection from './indicators/ElliottSection';
import AbcSection from './indicators/AbcSection';

// 공용 설정 타입/기본값/헬퍼는 indicators/settings로 이동. 기존 import 경로 호환을 위해 재export한다.
export { hexToRgba, DEFAULT_PIVOT_SETTING, DEFAULT_MA_SETTINGS, DEFAULT_BB_SETTING };
export type { MASetting, BBSetting, PivotSetting } from './indicators/settings';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  settings: IndicatorSettings;
  onChange: (settings: IndicatorSettings) => void;
  maSettings?: MASetting[];
  onMaSettingsChange?: (settings: MASetting[]) => void;
  bbSetting?: BBSetting;
  onBbSettingChange?: (setting: BBSetting) => void;
  pivotSetting?: PivotSetting;
  onPivotSettingChange?: (setting: PivotSetting) => void;
};

type SheetSize = 'compact' | 'full';

export default function IndicatorSheet({
  isOpen, onClose, settings, onChange,
  maSettings = DEFAULT_MA_SETTINGS, onMaSettingsChange,
  bbSetting = DEFAULT_BB_SETTING, onBbSettingChange,
  pivotSetting = DEFAULT_PIVOT_SETTING, onPivotSettingChange
}: Props) {
  const [sheetSize, setSheetSize] = useState<SheetSize>('compact');
  const [openGroups, setOpenGroups] = useState({ favorites: true, basic: true, custom: false });

  const toggleGroup = (key: keyof typeof openGroups) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (!isOpen) return;
    setSheetSize('compact');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

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
            className={`interval-sheet ${sheetSize}`}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{ 
              y: 0, 
              opacity: 1, 
              height: sheetSize === 'full' ? '100dvh' : '73dvh', 
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20, 
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20 
            }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -78 || info.velocity.y < -650) {
                setSheetSize('full');
                return;
              }
              if (info.offset.y > 92 || info.velocity.y > 700) {
                if (sheetSize === 'full') {
                  setSheetSize('compact');
                } else {
                  onClose();
                }
              }
            }}
          >
            <div className="interval-drag-zone"><div className="sheet-handle" /></div>
            <header className="interval-sheet-header">
              <h3>보조지표</h3>
              <button className="interval-close-btn" type="button" onClick={onClose} aria-label="닫기">✕</button>
            </header>
            <div className="interval-sheet-content">
              <button className="indicator-group-label" onClick={() => toggleGroup('favorites')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openGroups.favorites ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <AnimatePresence initial={false}>
                {openGroups.favorites && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden', paddingBottom: '30px' }}>
                    <SmcSection settings={settings} onChange={onChange} />
                    <HarmonicSection pivotSetting={pivotSetting} onPivotSettingChange={onPivotSettingChange} />
                    <AbcSection pivotSetting={pivotSetting} onPivotSettingChange={onPivotSettingChange} />
                  </motion.div>
                )}
              </AnimatePresence>

              <button className="indicator-group-label" onClick={() => toggleGroup('basic')}>
                기본
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openGroups.basic ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <AnimatePresence initial={false}>
                {openGroups.basic && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden', paddingBottom: '30px' }}>
                    <MaSection maSettings={maSettings} onMaSettingsChange={onMaSettingsChange} />
                    <BbSection bbSetting={bbSetting} onBbSettingChange={onBbSettingChange} />
                  </motion.div>
                )}
              </AnimatePresence>

              <button className="indicator-group-label" onClick={() => toggleGroup('custom')}>
                커스텀
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: openGroups.custom ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <AnimatePresence initial={false}>
                {openGroups.custom && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <PivotSection pivotSetting={pivotSetting} onPivotSettingChange={onPivotSettingChange} />
                    <ElliottSection pivotSetting={pivotSetting} onPivotSettingChange={onPivotSettingChange} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
