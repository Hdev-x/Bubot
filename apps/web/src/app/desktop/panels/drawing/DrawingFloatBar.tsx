import { useEffect, useRef, useState } from 'react';
// 드로잉 플로팅 툴바 — DrawingToolbar.tsx에서 분리 (wp-07 d01).
import type { IDrawing } from '../../../../chart/drawing';
import { ColorPicker, WIDTHS, LINE_STYLES, LinePreview } from './ColorPicker';
import type { GetManager } from './types';
import '../panels.css';

// ═══════════════════════════════════════════════════════
// 플로팅 툴바 — 도형 선택 시 차트 상단 중앙에 표시
// ═══════════════════════════════════════════════════════
const FLOATBAR_POS_KEY = 'web_drawbar_pos';
function loadBarPos(): { x: number; y: number } {
  try {
    const v = JSON.parse(localStorage.getItem(FLOATBAR_POS_KEY) ?? '');
    if (typeof v?.x === 'number' && typeof v?.y === 'number') return v;
  } catch { /* 기본값 */ }
  return { x: 0, y: 0 };
}

export function DrawingFloatBar({ getManager, selectedId, onOpenSettings }: {
  getManager: GetManager;
  selectedId: string;
  onOpenSettings: () => void;
}) {
  const [pop, setPop] = useState<'color' | 'width' | 'style' | null>(null);
  const [, force] = useState(0); // 스타일 변경 즉시 반영용
  const ref = useRef<HTMLDivElement>(null);
  const manager = getManager();
  const drawing = manager?.getDrawing(selectedId);
  // 그립 드래그 — 기본 위치(상단 중앙) 대비 오프셋, localStorage에 유지
  const [barPos, setBarPos] = useState(loadBarPos);
  const gripStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    gripStartRef.current = { px: e.clientX, py: e.clientY, ox: barPos.x, oy: barPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const s = gripStartRef.current;
    if (!s) return;
    setBarPos({ x: s.ox + e.clientX - s.px, y: Math.max(-6, s.oy + e.clientY - s.py) });
  };
  const onGripUp = () => {
    if (!gripStartRef.current) return;
    gripStartRef.current = null;
    setBarPos((p) => { try { localStorage.setItem(FLOATBAR_POS_KEY, JSON.stringify(p)); } catch { /* 무시 */ } return p; });
  };

  useEffect(() => {
    if (!pop) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPop(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pop]);

  if (!manager || !drawing) return null;
  const st = drawing.style;
  const upd = (patch: Parameters<IDrawing['updateStyle']>[0]) => { drawing.updateStyle(patch); force((v) => v + 1); };

  return (
    <div
      className="wdt-floatbar"
      ref={ref}
      style={{ left: `calc(50% + ${barPos.x}px)`, top: 10 + barPos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 이동 그립 */}
      <div
        className="wdt-fb-grip"
        title="툴바 이동"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
          <circle cx="4.5" cy="3" r="1.3" /><circle cx="9.5" cy="3" r="1.3" />
          <circle cx="4.5" cy="8" r="1.3" /><circle cx="9.5" cy="8" r="1.3" />
          <circle cx="4.5" cy="13" r="1.3" /><circle cx="9.5" cy="13" r="1.3" />
        </svg>
      </div>
      <div className="wdt-fb-sep" />
      {/* 색 */}
      <div className="wdt-fb-item">
        <button className={`wdt-fb-btn${pop === 'color' ? ' active' : ''}`} title="색" onClick={() => setPop(pop === 'color' ? null : 'color')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
          <span className="wdt-fb-underline" style={{ background: st.lineColor ?? '#2962ff' }} />
        </button>
        {pop === 'color' && (
          <div className="wdt-popover">
            <ColorPicker value={st.lineColor} onPick={(c) => upd({ lineColor: c, labelColor: c })} />
          </div>
        )}
      </div>
      {/* 두께 */}
      <div className="wdt-fb-item">
        <button className={`wdt-fb-btn wdt-fb-text${pop === 'width' ? ' active' : ''}`} title="두께" onClick={() => setPop(pop === 'width' ? null : 'width')}>
          {st.lineWidth ?? 1}px
        </button>
        {pop === 'width' && (
          <div className="wdt-popover wdt-popover-list">
            {WIDTHS.map((w) => (
              <button key={w} className={`wdt-pop-item${(st.lineWidth ?? 1) === w ? ' active' : ''}`} onClick={() => { upd({ lineWidth: w }); setPop(null); }}>
                <LinePreview dash="none" width={w} /><span>{w}px</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* 라인 스타일 */}
      <div className="wdt-fb-item">
        <button className={`wdt-fb-btn${pop === 'style' ? ' active' : ''}`} title="라인 스타일" onClick={() => setPop(pop === 'style' ? null : 'style')}>
          <LinePreview dash={LINE_STYLES.find((l) => l.v === (st.lineStyle ?? 0))?.dash ?? 'none'} />
        </button>
        {pop === 'style' && (
          <div className="wdt-popover wdt-popover-list">
            {LINE_STYLES.map((l) => (
              <button key={l.v} className={`wdt-pop-item${(st.lineStyle ?? 0) === l.v ? ' active' : ''}`} onClick={() => { upd({ lineStyle: l.v }); setPop(null); }}>
                <LinePreview dash={l.dash} /><span>{l.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="wdt-fb-sep" />
      {/* 설정 */}
      <button className="wdt-fb-btn" title="설정" onClick={onOpenSettings}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 2.69l5.66 4.2c.38.28.61.73.61 1.2v8.52c0 .47-.23.92-.61 1.2L12 21.31l-5.66-4.2a1.5 1.5 0 0 1-.61-1.2V8.09c0-.47.23-.92.61-1.2L12 2.69z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
      {/* 잠금 */}
      <button
        className={`wdt-fb-btn${drawing.options.locked ? ' locked' : ''}`}
        title={drawing.options.locked ? '잠금 해제' : '잠금'}
        onClick={() => { drawing.updateOptions({ locked: !drawing.options.locked }); force((v) => v + 1); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="11" width="18" height="11" rx="2" /><path d={drawing.options.locked ? 'M7 11V7a5 5 0 0 1 10 0v4' : 'M7 11V7a5 5 0 0 1 9.9-1'} /></svg>
      </button>
      {/* 삭제 */}
      <button className="wdt-fb-btn danger" title="삭제" onClick={() => manager.removeDrawing(selectedId)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 설정 다이얼로그 — 모습 / 문자 / 좌표 탭
// ═══════════════════════════════════════════════════════
