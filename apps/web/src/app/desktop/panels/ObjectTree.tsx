import { useEffect, useState } from 'react';
import type { DrawingManager } from '../../../chart/drawing';
import { WEB_DRAW_TOOLS } from '../lib/drawTools';

// 웹 오브젝트 트리 — 드로잉 목록(보이기/잠금/삭제/선택). manager는 ref라 폴링으로 동기화(모바일 시트와 동일 방식).
export function ObjectTree({ getManager, onSelect }: { getManager: () => DrawingManager | null | undefined; onSelect: (id: string) => void }) {
  const [items, setItems] = useState<{ id: string; type: string; visible: boolean; locked: boolean }[]>([]);
  useEffect(() => {
    const update = () => {
      const m = getManager();
      setItems(m ? m.getAllDrawings().map((d) => ({
        id: d.id, type: d.type,
        visible: d.options.visible !== false,
        locked: d.options.locked === true,
      })) : []);
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [getManager]);

  const nameOf = (type: string) => WEB_DRAW_TOOLS.find((t) => t.type === type)?.name ?? type;

  if (!items.length) return <div className="draw-obj-empty">작도 객체 없음</div>;
  return (
    <div className="draw-obj-list">
      {[...items].reverse().map((d) => (
        <div key={d.id} className={`draw-obj-row${d.visible ? '' : ' dimmed'}`} onClick={() => onSelect(d.id)}>
          <span className="draw-obj-name">{nameOf(d.type)}</span>
          <button
            className="draw-obj-btn" title={d.visible ? '감추기' : '보이기'}
            onClick={(e) => { e.stopPropagation(); getManager()?.getDrawing(d.id)?.updateOptions({ visible: !d.visible }); }}
          >
            {d.visible ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            )}
          </button>
          <button
            className={`draw-obj-btn${d.locked ? ' locked' : ''}`} title={d.locked ? '잠금 해제' : '잠금'}
            onClick={(e) => { e.stopPropagation(); getManager()?.getDrawing(d.id)?.updateOptions({ locked: !d.locked }); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="11" width="18" height="11" rx="2" /><path d={d.locked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'} /></svg>
          </button>
          <button
            className="draw-obj-btn danger" title="삭제"
            onClick={(e) => { e.stopPropagation(); getManager()?.removeDrawing(d.id); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </button>
        </div>
      ))}
    </div>
  );
}
