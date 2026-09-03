// 거래탭 순서 편집 시트 — 탭 라인 오른쪽 "+"에서 오픈. 드래그로 순서 변경(영구저장은 부모).
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { useScrollLock } from '../../../../hooks/ui/useScrollLock';
import { SHEET_ENTER_TRANSITION, SHEET_EXIT_TRANSITION } from '../../../../shared/utils/sheetMotion';

export type TradeTab = 'futures' | 'spot' | 'stock';

export const TAB_LABELS: Record<TradeTab, string> = {
  futures: 'Futures',
  spot: 'Spot',
  stock: 'Stock',
};

type Props = {
  isOpen: boolean;
  order: TradeTab[];
  onReorder: (next: TradeTab[]) => void;
  onClose: () => void;
};

// 배경색은 framer(animate/whileDrag)가 제어 — style에 두면 드래그 후 복원이 안 됨.
const itemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '14px', borderRadius: 10, cursor: 'grab',
  border: '1px solid rgba(255,255,255,0.06)',
  color: 'var(--text, #eaecef)', fontSize: 15, fontWeight: 600,
};

export default function TradeTabEditSheet({ isOpen, order, onReorder, onClose }: Props) {
  // 입장 애니메이션(y 변환) 중엔 레이아웃 보정을 꺼야(시트를 그대로 따라가 오버슈트 없음),
  // 입장이 끝난 뒤에야 켜서 재정렬 시 이웃이 부드럽게 비키게 한다.
  const [ready, setReady] = useState(false);
  useEffect(() => { if (!isOpen) setReady(false); }, [isOpen]);
  // 핸들에서만 드래그 시작(시트 본문/Reorder 항목 드래그와 충돌 방지)
  const dragControls = useDragControls();

  // 열려 있는 동안 배경 스크롤 완전 차단(position:fixed 바디 고정)
  useScrollLock(isOpen);

  // 입장 완료 후 켜지는 레이아웃 트랜지션(재정렬용). 전엔 즉시(스냅).
  const itemTransition = ready
    ? { layout: { type: 'spring' as const, stiffness: 700, damping: 42 }, backgroundColor: { duration: 0.15 }, scale: { duration: 0.15 } }
    : { layout: { duration: 0 }, backgroundColor: { duration: 0.15 }, scale: { duration: 0.15 } };

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
            /* .bottom-sheet의 CSS animation(slideUp forwards)이 framer의 exit transform을
               덮어 닫을 때 안 내려가고 팝 → CSS 애니메이션 끄고 framer로 입·퇴장 모두 제어 */
            style={{ touchAction: 'none', animation: 'none' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: SHEET_EXIT_TRANSITION }}
            transition={SHEET_ENTER_TRANSITION}
            onAnimationComplete={(def) => { if (def && (def as { y?: number | string }).y === 0) setReady(true); }}
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
            {/* 전역 .sheet-title의 좌우 30px 패딩 제거 — 본문(설명·행)과 좌측 정렬 */}
            <h3 className="sheet-title" style={{ padding: '0 0 14px' }}>탭 순서 편집</h3>
            <p style={{ color: 'var(--muted, #8b8e97)', fontSize: 12, margin: '0 0 12px' }}>
              드래그해서 순서를 바꾸세요.
            </p>
            <Reorder.Group
              axis="y"
              values={order}
              onReorder={onReorder}
              style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {order.map((tab) => (
                <Reorder.Item
                  key={tab}
                  value={tab}
                  style={itemStyle}
                  /* 기본 배경을 animate에 명시 → 드래그 끝나면 파란색이 이 값으로 복원.
                     레이아웃 보정만 즉시(스냅)로 둬 입장 오버슈트 방지, 배경/스케일은 짧게. */
                  animate={{ backgroundColor: 'rgba(255,255,255,0.04)', scale: 1 }}
                  whileDrag={{ scale: 1.03, backgroundColor: 'rgba(49,130,246,0.14)', cursor: 'grabbing' }}
                  transition={itemTransition}
                >
                  <span aria-hidden="true" style={{ color: 'var(--muted, #8b8e97)', fontSize: 18, lineHeight: 1 }}>⠿</span>
                  {TAB_LABELS[tab]}
                  {tab === 'stock' && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted, #8b8e97)' }}>준비 중</span>
                  )}
                </Reorder.Item>
              ))}
            </Reorder.Group>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
