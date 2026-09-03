// 거래탭 거래소 선택 바텀시트 — 헤더 거래소 배지(▾) 클릭 시 올라온다.
// 마켓 ExchangeBottomSheet와 동일한 시각(bottom-sheet/exchange-list) 재사용.
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { EXCHANGE_OPTIONS, type ExchangeId } from '../../../../constants/exchanges';
import { useScrollLock } from '../../../../hooks/ui/useScrollLock';
import { SHEET_ENTER_TRANSITION, SHEET_EXIT_TRANSITION } from '../../../../utils/sheetMotion';

type Props = {
  isOpen: boolean;
  current: ExchangeId;
  onSelect: (exchange: ExchangeId) => void;
  onClose: () => void;
};

export default function TradeExchangeSheet({ isOpen, current, onSelect, onClose }: Props) {
  // 열려 있는 동안 배경 스크롤 완전 차단(position:fixed 바디 고정)
  useScrollLock(isOpen);
  // 핸들에서만 드래그 시작(끌어내려 닫기)
  const dragControls = useDragControls();
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="bottom-sheet-overlay open"
            style={{ touchAction: 'none' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className="bottom-sheet"
            /* .bottom-sheet의 CSS animation(slideUp forwards)이 framer exit를 덮어 팝 → 끔 */
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
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 500) onClose(); }}
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
              {EXCHANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`exchange-list-item ${current === opt.id ? 'active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(opt.id);
                    onClose();
                  }}
                >
                  <span className="exchange-icon-circle">
                    <img src={opt.logo} alt={`${opt.label} 로고`} />
                  </span>
                  {opt.label}
                  {!opt.supportsFutures && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--muted)' }}>현물</span>
                  )}
                  {current === opt.id && <span style={{ marginLeft: 'auto', color: '#3182F6' }}>✓</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
