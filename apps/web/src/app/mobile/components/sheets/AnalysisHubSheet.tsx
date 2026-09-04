import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import './sheets.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onOpenIndicators: () => void;
  onOpenChartSettings: () => void;
  onOpenObjectTree: () => void;
};

type SheetSize = 'compact' | 'full';

export default function AnalysisHubSheet({
  isOpen, onClose, onOpenIndicators, onOpenChartSettings, onOpenObjectTree
}: Props) {
  const [sheetSize, setSheetSize] = useState<SheetSize>('compact');
  const dragControls = useDragControls();

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
            data-ptr-exclude="true"
            className={`interval-sheet analysis-hub-sheet ${sheetSize}`}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{
              y: 0,
              opacity: 1,
              height: sheetSize === 'full' ? '100dvh' : '73dvh',
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20,
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20,
            }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
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
            <div className="interval-drag-zone" onPointerDown={(e) => dragControls.start(e)}>
              <div className="sheet-handle" />
            </div>
            <header className="interval-sheet-header" onPointerDown={(e) => dragControls.start(e)}>
              <h3>분석 허브</h3>
              <button className="interval-close-btn" type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label="닫기">✕</button>
            </header>

            <div className="interval-sheet-content analysis-hub-content">
              <p className="analysis-hub-section-title">툴</p>
              <div className="analysis-hub-grid">
                <button className="hub-btn" onClick={() => { onClose(); onOpenChartSettings(); }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="8" width="5" height="10"></rect><rect x="14" y="5" width="5" height="12"></rect><line x1="7.5" y1="3" x2="7.5" y2="8"></line><line x1="7.5" y1="18" x2="7.5" y2="21"></line><line x1="16.5" y1="2" x2="16.5" y2="5"></line><line x1="16.5" y1="17" x2="16.5" y2="22"></line></svg>
                  <span>차트 타입 / 설정</span>
                </button>
                <button className="hub-btn" onClick={() => { onClose(); onOpenObjectTree(); }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                  <span>오브젝트 트리</span>
                </button>
              </div>
              <div className="analysis-hub-grid analysis-hub-secondary-grid">
                <button className="hub-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                  <span>얼러트</span>
                </button>
                <button className="hub-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="11 19 2 12 11 5 11 19"></polygon><polygon points="22 19 13 12 22 5 22 19"></polygon></svg>
                  <span>바 리플레이</span>
                </button>
              </div>
              <div className="analysis-hub-divider" />
              <p className="analysis-hub-section-title">임시</p>
              <div className="analysis-hub-grid">
                <button className="hub-btn" onClick={() => { onClose(); onOpenIndicators(); }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4v16h16"></path><path d="M6 15l4-4 3 2 5-6" strokeWidth="2"></path></svg>
                  <span>인디케이터</span>
                </button>
                <button className="hub-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                  <span>비교</span>
                </button>
                <button className="hub-btn">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  <span>인디케이터 템플릿</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
