import React, { useEffect, useRef, useState } from 'react';
import type { DrawingManager } from '../drawing';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  manager: DrawingManager | null;
  onSelectDrawing: (id: string) => void;
};

const toolNameMap: Record<string, string> = {
  'price-range': '가격 범위',
  'date-price-range': '날짜 및 가격 범위',
  'date-range': '날짜 범위',
  'trend-line': '추세선',
  'horizontal-line': '수평선',
  'vertical-line': '수직선',
  'rectangle': '직사각형',
  'text-annotation': '텍스트'
};

export default function ObjectTreeSheet({ isOpen, onClose, manager, onSelectDrawing }: Props) {
  const [drawings, setDrawings] = useState<any[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 오른쪽 스와이프로 닫기 — 마우스·터치·펜 모두 동작하도록 pointer 이벤트 사용.
  // pointermove에서 임계를 넘으면 즉시 닫는다.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !isOpen) return;

    let start: { x: number; y: number } | null = null;
    let fired = false;

    const onDown = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
      fired = false;
    };
    const evalSwipe = (x: number, y: number) => {
      if (fired || !start) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (dx > 90 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        fired = true;
        start = null;
        onClose();
      }
    };
    const onMove = (e: PointerEvent) => evalSwipe(e.clientX, e.clientY);
    const onUp = (e: PointerEvent) => {
      evalSwipe(e.clientX, e.clientY);
      start = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [isOpen, onClose]);

  // Update drawings list whenever sheet opens or state changes
  useEffect(() => {
    if (!isOpen || !manager) return;
    
    const updateList = () => {
      setDrawings(manager.getAllDrawings().map(d => ({
        id: d.id,
        type: d.type,
        visible: d.options.visible !== false,
        locked: d.options.locked === true
      })));
    };
    
    updateList();
    
    // We poll briefly because manager might not emit specific events for visibility/lock changes
    const interval = setInterval(updateList, 500);
    return () => clearInterval(interval);
  }, [isOpen, manager]);

  if (!isOpen) return null;

  const toggleVisibility = (e: React.MouseEvent, id: string, currentVisible: boolean) => {
    e.stopPropagation();
    manager?.getDrawing(id)?.updateOptions({ visible: !currentVisible });
  };

  const toggleLock = (e: React.MouseEvent, id: string, currentLocked: boolean) => {
    e.stopPropagation();
    manager?.getDrawing(id)?.updateOptions({ locked: !currentLocked });
  };

  const deleteDrawing = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    manager?.removeDrawing(id);
    setDrawings(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#000000', zIndex: 1100,
        display: 'flex', flexDirection: 'column', color: '#d1d4dc', fontFamily: 'sans-serif'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', paddingTop: 'max(16px, env(safe-area-inset-top))', borderBottom: '1px solid #2b3139' }}>
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>오브젝트 트리</span>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a3a6af', cursor: 'pointer', padding: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {drawings.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#a3a6af' }}>
            표시할 작도 객체가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {drawings.reverse().map(d => (
              <div 
                key={d.id} 
                onClick={() => {
                  manager?.deselectAll();
                  manager?.selectDrawing(d.id);
                  onSelectDrawing(d.id);
                }}
                style={{
                  display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #1e222d',
                  cursor: 'pointer', opacity: d.visible ? 1 : 0.5
                }}
              >
                <div style={{ marginRight: '16px', color: '#a3a6af' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                </div>
                <div style={{ flex: 1 }}>
                  {toolNameMap[d.type] || d.type}
                </div>
                <div style={{ display: 'flex', gap: '16px', color: '#a3a6af' }}>
                  <button onClick={(e) => toggleVisibility(e, d.id, d.visible)} style={{ background: 'none', border: 'none', color: d.visible ? '#a3a6af' : '#2962ff', cursor: 'pointer', padding: 0 }}>
                    {d.visible ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    )}
                  </button>
                  <button onClick={(e) => toggleLock(e, d.id, d.locked)} style={{ background: 'none', border: 'none', color: d.locked ? '#ef4444' : '#a3a6af', cursor: 'pointer', padding: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  </button>
                  <button onClick={(e) => deleteDrawing(e, d.id)} style={{ background: 'none', border: 'none', color: '#a3a6af', cursor: 'pointer', padding: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
