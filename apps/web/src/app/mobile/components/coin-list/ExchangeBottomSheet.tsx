import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { useScrollLock } from '../../../../hooks/ui/useScrollLock';
import { SHEET_ENTER_TRANSITION, SHEET_EXIT_TRANSITION } from '../../../../shared/utils/sheetMotion';
import './coin-list.css';

interface ExchangeBottomSheetProps {
  activeSheet: string | null;
  exchangeFilter: string;
  exchangeOptions: { label: string; value: string; logo: string }[];
  setActiveSheet: (val: any) => void;
  setExchangeFilter: (val: any) => void;
  setMarketFilter: (val: any) => void;
  setDisplayCount: (val: number) => void;
}

export const ExchangeBottomSheet = ({
  activeSheet,
  exchangeFilter,
  exchangeOptions,
  setActiveSheet,
  setExchangeFilter,
  setMarketFilter,
  setDisplayCount
}: ExchangeBottomSheetProps) => {
  const isOpen = activeSheet === 'EXCHANGE';
  useScrollLock(isOpen);
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="bottom-sheet-overlay open"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => setActiveSheet(null)}
          />
          <motion.div
            className="bottom-sheet"
            /* CSS slideUp(forwards)이 framer exit를 덮어 닫힘이 팝 → 끔. 입·퇴장 모두 framer. */
            style={{ touchAction: 'none', animation: 'none' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: SHEET_EXIT_TRANSITION }}
            transition={SHEET_ENTER_TRANSITION}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) setActiveSheet(null); }}
          >
            {/* 핸들 영역 — 여기서만 드래그 시작(끌어내려 닫기) */}
            <div
              style={{ padding: '4px 0 8px', margin: '-4px 0 0', cursor: 'grab', touchAction: 'none' }}
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="sheet-handle" />
            </div>
            <h3 className="sheet-title">거래소 선택</h3>
            <div className="exchange-list">
              {exchangeOptions.map(opt => (
                <button
                  key={opt.value}
                  className={`exchange-list-item ${exchangeFilter === opt.value ? 'active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setExchangeFilter(opt.value);
                    setMarketFilter('USDT');
                    setDisplayCount(25);
                    setActiveSheet(null);
                  }}
                >
                  <span className="exchange-icon-circle">
                    <img src={opt.logo} alt={`${opt.label} 로고`} />
                  </span>
                  {opt.label}
                  {exchangeFilter === opt.value && <span style={{ marginLeft: 'auto', color: '#3182F6' }}>✓</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
