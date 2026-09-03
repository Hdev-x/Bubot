// 플로팅/도킹 미니 시세창 — 관심탭(WebFavoritesPanel) 미러. 본 화면(내투자 등)을 보면서 관심 종목 시세를
// 동시에 관찰한다. 목록 디자인·데이터는 실시간/관심 패널과 동일하게 WebFavoritesPanel을 그대로 임베드.
// float(드래그 떠있는 창, 딱 10행 고정+스크롤) ↔ dock(왼쪽 컬럼, 전체 높이) 전환.
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePersistentState } from '../../hooks/ui/usePersistentState';
import type { ExchangeId } from '../../constants/exchanges';
import { WebFavoritesPanel } from './WebFavoritesPanel';
import { snapFloat } from './snapFloat';
import { useWebFavorites, type Market } from './marketShared';

type Mode = 'float' | 'dock';

const WATCH_W = 299; // 미니창 가로(.watch-float와 일치) — 우측은 레일에 딱 붙고 줄인 px은 좌측에서 빠짐
const ROW_H = 54;    // 행 1줄 높이(.wm-row)
const HEAD_H = 65;   // 헤더 높이(.watch-head)
const MIN_ROWS = 5, MAX_ROWS = 15; // 플로팅 세로 리사이즈 범위(행 수)
const RAIL_W = 45;   // 우측 레일 기준 — 우측 끝을 레일쪽으로 1px 더 붙임(레일 폭 46 - 1)
const FOOTER_H = 27; // 하단 푸터 높이(26+보더) — 플로팅이 이 영역 침범 금지

export function WebWatchlist({ mode, onSelect, onClose, onToggleDock }: {
  mode: Mode;
  onSelect: (symbol: string, market: Market, exchange: ExchangeId) => void;
  onClose: () => void;
  onToggleDock: () => void;
}) {
  // 플로팅 위치(드래그) — localStorage 저장. dock 모드에선 무시.
  const [pos, setPos] = usePersistentState<{ x: number; y: number }>('web_watch_pos', { x: 80, y: 96 });
  // 플로팅 세로 크기(행 수, 5~15) — localStorage 저장.
  const [rows, setRows] = usePersistentState<number>('web_watch_rows', 10);
  const [dragPx, setDragPx] = useState<number | null>(null); // 리사이즈 중 자유 픽셀 높이(놓으면 행으로 스냅)
  const dragPxRef = useRef<number | null>(null);
  const [snapping, setSnapping] = useState(false); // 놓은 직후 스냅 애니메이션 구간
  const [half, setHalf] = useState<'top' | 'bottom' | null>(null); // 커서가 위/아래 절반 중 어디 → 해당 핸들만 노출
  const [editMode, setEditMode] = useState(false); // 편집 모드(드래그 재정렬 + 제거)
  const [addOpen, setAddOpen] = useState(false);    // + 드롭다운(구분선 추가 등)
  const { addDivider } = useWebFavorites();
  useEffect(() => {
    if (!addOpen) return;
    const close = () => setAddOpen(false); // 메뉴/버튼은 mousedown stopPropagation이라 바깥 클릭만 닫음
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [addOpen]);
  const bodyPx = dragPx ?? rows * ROW_H;  // 본문(목록) 높이 px
  const watchH = HEAD_H + bodyPx;         // 현재 플로팅 세로(푸터 클램프용)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const floatRef = useRef<HTMLDivElement>(null); // 스냅 시 자기 자신 제외용
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (mode !== 'float') return;
    if ((e.target as HTMLElement).closest('.watch-hbtn')) return; // 헤더 버튼 클릭은 드래그 시작 안 함
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      // 우측 사이드바 아이콘 레일(46px)은 침범 못 하게 — 창 오른쪽 끝이 레일 왼쪽까지만.
      const maxX = window.innerWidth - RAIL_W - WATCH_W;
      const maxY = window.innerHeight - FOOTER_H - (HEAD_H + rows * ROW_H); // 창 아래 끝이 푸터 위까지만
      const s = snapFloat(ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy, WATCH_W, HEAD_H + rows * ROW_H, floatRef.current); // 다른 미니창에 스냅
      const x = Math.max(0, Math.min(maxX, s.x));
      const y = Math.max(0, Math.min(maxY, s.y));
      setPos({ x, y });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [mode, pos.x, pos.y, rows, setPos]);

  // 상/하단 핸들 드래그로 세로 크기 조절 — 드래그 중엔 픽셀 단위로 부드럽게, 놓으면 가까운 행(5~15)으로 스냅.
  // top은 하단을 고정한 채 위로 커짐.
  const onResizeStart = (edge: 'top' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // 헤더 드래그(이동)와 겹치지 않게
    const startY = e.clientY;
    const base = rows * ROW_H;
    const startBottom = pos.y + watchH; // top 리사이즈 시 고정할 하단 위치
    const minPx = MIN_ROWS * ROW_H, maxPx = MAX_ROWS * ROW_H;
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      const deltaPx = edge === 'bottom' ? dy : -dy; // 아래핸들=아래로 끌면↑, 위핸들=위로 끌면↑
      const px = Math.max(minPx, Math.min(maxPx, base + deltaPx));
      dragPxRef.current = px;
      setDragPx(px); // 자유 픽셀 → 부드럽게
      if (edge === 'top') setPos((p) => ({ ...p, y: Math.max(0, startBottom - (HEAD_H + px)) }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const px = dragPxRef.current ?? base;
      const snapped = Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.round(px / ROW_H)));
      setRows(snapped);
      if (edge === 'top') setPos((p) => ({ ...p, y: Math.max(0, startBottom - (HEAD_H + snapped * ROW_H)) }));
      dragPxRef.current = null;
      setDragPx(null);            // 행 높이로 복귀(스냅)
      setSnapping(true);          // 스냅 구간 동안 height/top 트랜지션 켬
      window.setTimeout(() => setSnapping(false), 200);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // 내부 .wm-list 스크롤 상태 추적 → 아래로 더 볼 게 있으면 아래화살표 노출.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [canDown, setCanDown] = useState(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const recompute = () => {
      const list = body.querySelector('.wm-list');
      if (!list) { setCanDown(false); return; }
      setCanDown(list.scrollHeight - list.scrollTop - list.clientHeight > 4);
    };
    recompute();
    body.addEventListener('scroll', recompute, true); // scroll은 버블 안 함 → capture
    const ro = new ResizeObserver(recompute);
    ro.observe(body);
    const mo = new MutationObserver(recompute); // 비동기 로드/관심 변동으로 행 수 바뀔 때
    mo.observe(body, { childList: true, subtree: true });
    return () => { body.removeEventListener('scroll', recompute, true); ro.disconnect(); mo.disconnect(); };
  }, []);
  const scrollDown = useCallback(() => {
    const list = bodyRef.current?.querySelector('.wm-list');
    if (list) list.scrollBy({ top: list.clientHeight * 0.8, behavior: 'smooth' });
  }, []);

  const body = (
    <>
      <div className={`watch-head${mode === 'float' ? ' draggable' : ''}`} onMouseDown={onDragStart}>
        <div className="watch-head-top">
          {/* 탑바와 동일한 별표 아이콘 (관심 시세 타이틀 대체) */}
          <span className="watch-title-star" aria-label="관심 시세">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
              <path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z" />
            </svg>
          </span>
          <div className="watch-head-btns">
            <button type="button" className="watch-hbtn" title={mode === 'float' ? '왼쪽에 붙이기' : '창으로 띄우기'} onClick={onToggleDock}>
              {mode === 'float'
                ? (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="7" height="16" rx="1" /><path d="M13 12h7M17 9l3 3-3 3" /></svg>)
                : (<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 9h16" /></svg>)}
            </button>
            <button type="button" className="watch-hbtn" title="닫기" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
        {/* 헤더 아래 빈 공간에 편집 버튼(아이콘 + 텍스트) */}
        <div className="watch-head-bottom">
          <button type="button" className={`watch-edit-btn${editMode ? ' on' : ''}`} onMouseDown={(e) => e.stopPropagation()} onClick={() => { setEditMode((v) => !v); setAddOpen(false); }}>
            <span>{editMode ? '완료' : '편집'}</span>
          </button>
          <div className="watch-head-bottom-right">
            {editMode && (
              <div className="watch-add-wrap">
                <button type="button" className="watch-more-btn" title="추가" onMouseDown={(e) => e.stopPropagation()} onClick={() => setAddOpen((v) => !v)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </button>
                {addOpen && (
                  <div className="watch-add-menu" onMouseDown={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => { addDivider('text'); setAddOpen(false); }}>텍스트만</button>
                    <button type="button" onClick={() => { addDivider('line'); setAddOpen(false); }}>구분선만</button>
                    <button type="button" onClick={() => { addDivider('both'); setAddOpen(false); }}>텍스트 + 구분선</button>
                  </div>
                )}
              </div>
            )}
            {/* 더보기(⋯) — 동작 미정, 자리만 확보 */}
            <button type="button" className="watch-more-btn" title="더보기" onMouseDown={(e) => e.stopPropagation()}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          </div>
        </div>
      </div>
      <div className="watch-body" ref={bodyRef} style={mode === 'float' ? { height: bodyPx } : undefined}>
        <WebFavoritesPanel active onSelect={onSelect} editMode={editMode} />
        {canDown && (
          <button type="button" className="watch-scroll-down" title="아래로" onClick={scrollDown}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
      </div>
    </>
  );

  if (mode === 'dock') {
    // 바깥 <aside.watch-dock>(WebApp)이 width 애니메이션 담당. 여기선 고정 폭 내용만.
    return <div className="watch-dock-inner">{body}</div>;
  }
  // 저장된 위치가 레일/푸터 영역을 넘으면 렌더 시에도 보정(이전 버전에서 저장된 좌표 대비).
  const clampedX = Math.max(0, Math.min(pos.x, window.innerWidth - RAIL_W - WATCH_W));
  const clampedY = Math.max(0, Math.min(pos.y, window.innerHeight - FOOTER_H - watchH));
  return (
    <div
      ref={floatRef}
      className={`watch-float${snapping ? ' snapping' : ''}${half ? ` half-${half}` : ''}`}
      style={{ left: clampedX, top: clampedY }}
      onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHalf(e.clientY - r.top < r.height / 2 ? 'top' : 'bottom'); }}
      onMouseLeave={() => setHalf(null)}
    >
      {/* 상/하단 세로 리사이즈 핸들 — 커서가 있는 절반의 그랩바만 노출 */}
      <div className="watch-resize watch-resize-top" onMouseDown={onResizeStart('top')} title="크기 조절" />
      {body}
      <div className="watch-resize watch-resize-bottom" onMouseDown={onResizeStart('bottom')} title="크기 조절" />
    </div>
  );
}
