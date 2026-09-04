import { useEffect, useMemo, useRef, useState } from 'react';
// 드로잉 설정 다이얼로그 — DrawingToolbar.tsx에서 분리 (wp-07 d01).
import type { IDrawing, FibLevel, Anchor } from '../../../../chart/drawing';
import { DEFAULT_FIB_LEVELS, DEFAULT_CHANNEL_LEVELS, setFibLogScaleDefault } from '../../../../chart/drawing';
import { ColorSwatch, WIDTHS, LINE_STYLES } from './ColorPicker';
import type { GetManager } from './types';
import '../panels.css';

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

export function DrawingSettings({ getManager, drawingId, onClose }: {
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
