import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrawingManager, IDrawing, FibLevel, Anchor } from '../../../chart/drawing';
import { DEFAULT_FIB_LEVELS, DEFAULT_CHANNEL_LEVELS, setFibLogScaleDefault } from '../../../chart/drawing';
import './panels.css';

// ── 색 유틸 ──────────────────────────────────────────────
function mix(hex: string, target: number, ratio: number): string {
  // target: 255(밝게) 또는 0(어둡게), ratio 0~1
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const ch = (i: number) => Math.round(parseInt(h.slice(i, i + 2), 16) * (1 - ratio) + target * ratio);
  return `#${[ch(0), ch(2), ch(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function toRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// rgba/hex → {hex, alpha}
function parseColor(color: string | undefined): { hex: string; alpha: number } {
  if (!color) return { hex: '#2962ff', alpha: 1 };
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const hex = `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
    return { hex, alpha: m[4] != null ? parseFloat(m[4]) : 1 };
  }
  return { hex: color, alpha: 1 };
}

// TV식 팔레트 — 1행 그레이스케일, 2행 원색, 아래로 밝은/어두운 셰이드
const BASE_HUES = ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#009688', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'];
const PALETTE: string[][] = [
  ['#ffffff', '#e1e1e1', '#c4c4c4', '#a6a6a6', '#898989', '#6b6b6b', '#4e4e4e', '#303030', '#131313', '#000000'],
  BASE_HUES,
  BASE_HUES.map((c) => mix(c, 255, 0.6)),
  BASE_HUES.map((c) => mix(c, 255, 0.35)),
  BASE_HUES.map((c) => mix(c, 0, 0.2)),
  BASE_HUES.map((c) => mix(c, 0, 0.4)),
];

// ── 색 선택 팝오버(그리드 + 불투명도) ────────────────────
function ColorPicker({ value, showOpacity = true, onPick }: {
  value?: string;
  showOpacity?: boolean;
  onPick: (color: string) => void; // 불투명도 반영된 rgba/hex
}) {
  const parsed = parseColor(value);
  const [hex, setHex] = useState(parsed.hex);
  const [opacity, setOpacity] = useState(Math.round(parsed.alpha * 100));
  const emit = (h: string, o: number) => onPick(o >= 100 ? h : toRgba(h, o / 100));
  return (
    <div className="wdt-colorpicker" onPointerDown={(e) => e.stopPropagation()}>
      {PALETTE.map((row, i) => (
        <div key={i} className="wdt-color-row">
          {row.map((c) => (
            <button
              key={c}
              className={`wdt-color-cell${hex.toLowerCase() === c.toLowerCase() ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => { setHex(c); emit(c, opacity); }}
            />
          ))}
        </div>
      ))}
      {showOpacity && (
        <div className="wdt-opacity">
          <span>불투명성</span>
          <input
            type="range" min={0} max={100} value={opacity}
            onChange={(e) => { const o = Number(e.target.value); setOpacity(o); emit(hex, o); }}
          />
          <em>{opacity}%</em>
        </div>
      )}
    </div>
  );
}

// 색 스와치 버튼(팝오버 토글)
// 팝오버는 position:fixed — 다이얼로그 본문(overflow:auto)에 잘리지 않고 TV처럼 바깥으로 넘친다.
// 화면 경계 클램프: 아래 공간이 부족하면 위로 뒤집고, 좌우는 8px 여백 안으로 이동.
const PICKER_W = 258;
function ColorSwatch({ value, showOpacity = true, onPick }: { value?: string; showOpacity?: boolean; onPick: (c: string) => void }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null); // null=닫힘
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPos(null); };
    const close = () => setPos(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', close); };
  }, [pos]);
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const pickerH = showOpacity ? 240 : 200;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - PICKER_W / 2, window.innerWidth - PICKER_W - 8));
    const top = r.bottom + pickerH + 8 > window.innerHeight
      ? Math.max(8, r.top - pickerH - 8)  // 아래 공간 부족 → 위로
      : r.bottom + 6;
    setPos({ left, top });
  };
  return (
    <div className="wdt-swatch-wrap" ref={ref}>
      <button ref={btnRef} className="wdt-swatch" style={{ background: value ?? '#2962ff' }} onClick={toggle} />
      {pos && (
        <div className="wdt-popover wdt-popover-fixed" style={{ left: pos.left, top: pos.top }}>
          <ColorPicker value={value} showOpacity={showOpacity} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

// ── 공용 소품 ────────────────────────────────────────────
const WIDTHS = [1, 2, 3, 4];
const LINE_STYLES = [
  { v: 0, label: '실선', dash: 'none' },
  { v: 2, label: '대시', dash: '6,5' },
  { v: 1, label: '점선', dash: '2,3' },
];

function LinePreview({ dash, width = 2 }: { dash: string; width?: number }) {
  return (
    <svg width="34" height="10" viewBox="0 0 34 10">
      <line x1="1" y1="5" x2="33" y2="5" stroke="currentColor" strokeWidth={width} strokeDasharray={dash === 'none' ? undefined : dash} />
    </svg>
  );
}

type GetManager = () => DrawingManager | null | undefined;

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

export function WebDrawingFloatBar({ getManager, selectedId, onOpenSettings }: {
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
const TYPE_NAMES: Record<string, string> = {
  'horizontal-line': '수평선', 'horizontal-ray': '수평 레이', 'trend-line': '추세선',
  'rectangle': '직사각형', 'price-range': '가격 범위', 'fib-retracement': '피보나치 되돌림',
  'parallel-channel': '평행 채널',
};
const TEXT_TYPES = new Set(['trend-line', 'rectangle', 'parallel-channel']);
const FONT_SIZES = [8, 10, 11, 12, 14, 16, 20, 24];

// 차트 Time(로컬 오프셋 시프트됨) ↔ datetime-local 문자열
function timeToInput(t: number): string {
  try { return new Date(t * 1000).toISOString().slice(0, 16); } catch { return ''; }
}
function inputToTime(v: string): number | null {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function WebDrawingSettings({ getManager, drawingId, onClose }: {
  getManager: GetManager;
  drawingId: string;
  onClose: () => void;
}) {
  const manager = getManager();
  const drawing = manager?.getDrawing(drawingId);
  const [tab, setTab] = useState<'모습' | '문자' | '좌표'>('모습');
  const [, force] = useState(0);
  const rerender = () => force((v) => v + 1);
  // 헤더 드래그로 다이얼로그 이동(중앙 기준 오프셋)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const onHeadPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // X 버튼은 제외
    dragStartRef.current = { px: e.clientX, py: e.clientY, ox: dragOffset.x, oy: dragOffset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeadPointerMove = (e: React.PointerEvent) => {
    const s = dragStartRef.current;
    if (!s) return;
    setDragOffset({ x: s.ox + e.clientX - s.px, y: s.oy + e.clientY - s.py });
  };
  const onHeadPointerUp = () => { dragStartRef.current = null; };
  // 취소용 스냅샷(열 때 상태)
  const snapRef = useRef<{ style: IDrawing['style']; options: IDrawing['options']; anchors: Anchor[] } | null>(null);
  useEffect(() => {
    if (drawing && !snapRef.current) {
      snapRef.current = {
        style: JSON.parse(JSON.stringify(drawing.style)),
        options: JSON.parse(JSON.stringify(drawing.options)),
        anchors: drawing.anchors.map((a) => ({ ...a })),
      };
    }
  }, [drawing]);

  const levelDefaults = drawing?.type === 'parallel-channel' ? DEFAULT_CHANNEL_LEVELS : DEFAULT_FIB_LEVELS;
  const levels = useMemo<FibLevel[]>(() => {
    const src = drawing?.style.levels?.length ? drawing.style.levels : levelDefaults;
    return src.map((l) => ({ ...l }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing?.style.levels, drawingId]);

  if (!manager || !drawing) return null;
  const st = drawing.style;
  const opt = drawing.options;
  const upd = (patch: IDrawing['style']) => { drawing.updateStyle(patch); rerender(); };
  const updOpt = (patch: IDrawing['options']) => { drawing.updateOptions(patch); rerender(); };
  const setLevels = (next: FibLevel[]) => upd({ levels: next });

  const cancel = () => {
    const snap = snapRef.current;
    if (snap) {
      drawing.style = { ...snap.style };
      drawing.options = { ...snap.options };
      drawing.setAnchors(snap.anchors);
      drawing.requestUpdate();
      drawing.onChange?.(drawing); // 저장 반영
    }
    onClose();
  };

  const setAnchorField = (i: number, field: 'price' | 'time', v: string) => {
    const next = drawing.anchors.map((a) => ({ ...a }));
    if (field === 'price') {
      const p = parseFloat(v);
      if (!Number.isFinite(p)) return;
      next[i] = { ...next[i], price: p };
    } else {
      const t = inputToTime(v);
      if (t == null) return;
      next[i] = { ...next[i], time: t as Anchor['time'] };
    }
    drawing.setAnchors(next);
    drawing.onChange?.(drawing); // 저장 반영
    rerender();
  };

  const isFibOrChannel = drawing.type === 'fib-retracement' || drawing.type === 'parallel-channel';
  const tabs: Array<'모습' | '문자' | '좌표'> = TEXT_TYPES.has(drawing.type) ? ['모습', '문자', '좌표'] : ['모습', '좌표'];

  return (
    <div className="wdt-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div
        className="wdt-dialog"
        // transform은 내부 fixed 팝오버(색 팔레트)의 기준점을 깨므로 relative+left/top으로 이동
        style={{ position: 'relative', left: dragOffset.x, top: dragOffset.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="wdt-dlg-head wdt-dlg-head-drag"
          onPointerDown={onHeadPointerDown}
          onPointerMove={onHeadPointerMove}
          onPointerUp={onHeadPointerUp}
        >
          <span className="wdt-dlg-title">{TYPE_NAMES[drawing.type] ?? drawing.type}</span>
          <button className="wdt-dlg-x" onClick={cancel}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="wdt-dlg-tabs">
          {tabs.map((t) => (
            <button key={t} className={`wdt-dlg-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="wdt-dlg-body">
          {/* ── 모습 ── */}
          {tab === '모습' && (
            <>
              <div className="wdt-row">
                {/* 배경이 있는 도형은 선을 끄고 배경만 표시 가능(체크박스) */}
                {(drawing.type === 'rectangle' || drawing.type === 'price-range' || drawing.type === 'parallel-channel') ? (
                  <label className="wdt-check wdt-check-inline">
                    <input type="checkbox" checked={st.showLine !== false} onChange={(e) => upd({ showLine: e.target.checked })} />
                    <span>라인</span>
                  </label>
                ) : (
                  <span className="wdt-label">라인</span>
                )}
                <ColorSwatch value={st.lineColor} onPick={(c) => upd({ lineColor: c, labelColor: c })} />
                <select className="wdt-select" value={st.lineWidth ?? 1} onChange={(e) => upd({ lineWidth: Number(e.target.value) })}>
                  {WIDTHS.map((w) => <option key={w} value={w}>{w}px</option>)}
                </select>
                <select className="wdt-select" value={st.lineStyle ?? 0} onChange={(e) => upd({ lineStyle: Number(e.target.value) })}>
                  {LINE_STYLES.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                </select>
              </div>

              {(drawing.type === 'horizontal-line') && (
                <label className="wdt-row wdt-check">
                  <input type="checkbox" checked={st.showLabels !== false} onChange={(e) => upd({ showLabels: e.target.checked })} />
                  <span>가격라벨</span>
                </label>
              )}

              {drawing.type === 'trend-line' && (
                <>
                  <div className="wdt-row">
                    <span className="wdt-label">확장</span>
                    <select
                      className="wdt-select wdt-select-wide"
                      value={st.extendLeft && st.extendRight ? 'both' : st.extendLeft ? 'left' : st.extendRight ? 'right' : 'none'}
                      onChange={(e) => {
                        const v = e.target.value;
                        upd({ extendLeft: v === 'left' || v === 'both', extendRight: v === 'right' || v === 'both' });
                      }}
                    >
                      <option value="none">연장 안함</option>
                      <option value="right">라인 오른쪽 늘리기</option>
                      <option value="left">라인 왼쪽 늘리기</option>
                      <option value="both">양쪽 늘리기</option>
                    </select>
                  </div>
                  <label className="wdt-row wdt-check">
                    <input type="checkbox" checked={st.showLabels === true} onChange={(e) => upd({ showLabels: e.target.checked })} />
                    <span>프라이스 라벨</span>
                  </label>
                </>
              )}

              {(drawing.type === 'rectangle' || drawing.type === 'price-range' || drawing.type === 'parallel-channel') && (
                <div className="wdt-row">
                  <label className="wdt-check wdt-check-inline">
                    <input
                      type="checkbox"
                      checked={drawing.type === 'rectangle' ? st.showBackground !== false : st.showBackground === true}
                      onChange={(e) => upd({ showBackground: e.target.checked })}
                    />
                    <span>배경</span>
                  </label>
                  <ColorSwatch value={st.fillColor ?? 'rgba(41, 98, 254, 0.15)'} onPick={(c) => upd({ fillColor: c })} />
                </div>
              )}

              {drawing.type === 'price-range' && (
                <div className="wdt-row">
                  <span className="wdt-label">라벨</span>
                  <ColorSwatch value={st.labelColor ?? st.lineColor} showOpacity={false} onPick={(c) => upd({ labelColor: c })} />
                  <select className="wdt-select" value={st.labelSize ?? 10} onChange={(e) => upd({ labelSize: Number(e.target.value) })}>
                    {FONT_SIZES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}

              {isFibOrChannel && (
                <>
                  {drawing.type === 'fib-retracement' && (
                    <label className="wdt-row wdt-check">
                      <input type="checkbox" checked={st.showTrendLine !== false} onChange={(e) => upd({ showTrendLine: e.target.checked })} />
                      <span>트렌드라인</span>
                    </label>
                  )}
                  <div className="wdt-row">
                    <span className="wdt-label">확장</span>
                    <select
                      className="wdt-select wdt-select-wide"
                      value={st.extendRight ? 'right' : 'none'}
                      onChange={(e) => upd({ extendRight: e.target.value === 'right' })}
                    >
                      <option value="none">연장 안함</option>
                      <option value="right">라인 오른쪽 늘리기</option>
                    </select>
                  </div>
                  {/* 레벨 편집 — 2열 그리드 */}
                  <div className="wdt-levels">
                    {levels.map((l, i) => (
                      <div key={i} className="wdt-level-row">
                        <input
                          type="checkbox" checked={l.visible}
                          onChange={(e) => { const n = levels.map((x) => ({ ...x })); n[i].visible = e.target.checked; setLevels(n); }}
                        />
                        <input
                          className="wdt-input" type="number" step="any" value={l.value}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isFinite(v)) return;
                            const n = levels.map((x) => ({ ...x })); n[i].value = v; setLevels(n);
                          }}
                        />
                        <ColorSwatch value={l.color} showOpacity={false} onPick={(c) => { const n = levels.map((x) => ({ ...x })); n[i].color = c; setLevels(n); }} />
                      </div>
                    ))}
                  </div>
                  <div className="wdt-row">
                    <span className="wdt-label">전체 색</span>
                    <ColorSwatch value={levels[0]?.color} showOpacity={false} onPick={(c) => setLevels(levels.map((l) => ({ ...l, color: c })))} />
                    <span className="wdt-hint">모든 레벨 색 일괄 변경</span>
                  </div>
                  <div className="wdt-row">
                    <label className="wdt-check wdt-check-inline">
                      <input type="checkbox" checked={st.showBackground !== false} onChange={(e) => upd({ showBackground: e.target.checked })} />
                      <span>배경</span>
                    </label>
                    <input
                      type="range" min={0} max={40} value={Math.round((st.bgOpacity ?? 0.07) * 100)}
                      onChange={(e) => upd({ bgOpacity: Number(e.target.value) / 100 })}
                      style={{ flex: 1 }}
                    />
                  </div>
                  {drawing.type === 'fib-retracement' && (
                    <>
                      <label className="wdt-row wdt-check">
                        <input type="checkbox" checked={st.reverse === true} onChange={(e) => upd({ reverse: e.target.checked })} />
                        <span>리버스</span>
                      </label>
                      <label className="wdt-row wdt-check">
                        <input
                          type="checkbox"
                          checked={st.logScale !== false}
                          onChange={(e) => {
                            upd({ logScale: e.target.checked });
                            setFibLogScaleDefault(e.target.checked); // 다음에 그리는 피보나치 기본값으로 이어짐
                          }}
                        />
                        <span>로그 스케일</span>
                      </label>
                      <label className="wdt-row wdt-check">
                        <input type="checkbox" checked={st.showLevelPrices !== false} onChange={(e) => upd({ showLevelPrices: e.target.checked })} />
                        <span>가격</span>
                      </label>
                      <label className="wdt-row wdt-check">
                        <input type="checkbox" checked={st.showLevelValues !== false} onChange={(e) => upd({ showLevelValues: e.target.checked })} />
                        <span>레벨</span>
                      </label>
                      <div className="wdt-row">
                        <span className="wdt-label">라벨</span>
                        <select className="wdt-select" value={st.labelAlignH ?? 'left'} onChange={(e) => upd({ labelAlignH: e.target.value as 'left' | 'center' | 'right' })}>
                          <option value="left">왼쪽</option><option value="center">센터</option><option value="right">오른쪽</option>
                        </select>
                        <select className="wdt-select" value={st.labelAlignV ?? 'middle'} onChange={(e) => upd({ labelAlignV: e.target.value as 'top' | 'middle' | 'bottom' })}>
                          <option value="top">위</option><option value="middle">미들</option><option value="bottom">아래</option>
                        </select>
                        <select className="wdt-select" value={st.labelSize ?? 10} onChange={(e) => upd({ labelSize: Number(e.target.value) })}>
                          {FONT_SIZES.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── 문자 ── */}
          {tab === '문자' && (
            <>
              <div className="wdt-row">
                <ColorSwatch value={st.textColor ?? '#9aa4b2'} showOpacity={false} onPick={(c) => upd({ textColor: c })} />
                <select className="wdt-select" value={st.textSize ?? 12} onChange={(e) => upd({ textSize: Number(e.target.value) })}>
                  {FONT_SIZES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <button className={`wdt-toggle${st.textBold ? ' active' : ''}`} onClick={() => upd({ textBold: !st.textBold })}><b>B</b></button>
                <button className={`wdt-toggle${st.textItalic ? ' active' : ''}`} onClick={() => upd({ textItalic: !st.textItalic })}><i>I</i></button>
              </div>
              <textarea
                className="wdt-textarea"
                placeholder="텍스트 넣기"
                value={opt.text ?? ''}
                onChange={(e) => updOpt({ text: e.target.value })}
              />
              <div className="wdt-row">
                <span className="wdt-label">텍스트 얼라인</span>
                <select className="wdt-select" value={st.textAlignV ?? 'bottom'} onChange={(e) => upd({ textAlignV: e.target.value as 'top' | 'middle' | 'bottom' })}>
                  <option value="top">위</option><option value="middle">미들</option><option value="bottom">아래</option>
                </select>
                <select className="wdt-select" value={st.textAlignH ?? 'center'} onChange={(e) => upd({ textAlignH: e.target.value as 'left' | 'center' | 'right' })}>
                  <option value="left">왼쪽</option><option value="center">센터</option><option value="right">오른쪽</option>
                </select>
              </div>
            </>
          )}

          {/* ── 좌표 ── */}
          {tab === '좌표' && (
            <>
              {drawing.anchors.map((a, i) => (
                <div key={i} className="wdt-row">
                  <span className="wdt-label">#{i + 1} (프라이스, 시간)</span>
                  <input
                    className="wdt-input wdt-input-price"
                    type="number" step="any" defaultValue={a.price}
                    key={`p${i}-${a.price}`}
                    onBlur={(e) => setAnchorField(i, 'price', e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                  <input
                    className="wdt-input wdt-input-time"
                    type="datetime-local"
                    key={`t${i}-${String(a.time)}`}
                    defaultValue={timeToInput(Number(a.time))}
                    onBlur={(e) => e.target.value && setAnchorField(i, 'time', e.target.value)}
                  />
                </div>
              ))}
              <p className="wdt-hint">값 입력 후 포커스를 벗어나면 도형이 이동합니다.</p>
            </>
          )}
        </div>

        <div className="wdt-dlg-foot">
          <button className="wdt-btn" onClick={cancel}>취소</button>
          <button className="wdt-btn primary" onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
