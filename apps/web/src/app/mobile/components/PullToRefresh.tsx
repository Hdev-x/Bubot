// 당겨서 새로고침 (pull-to-refresh) — 모바일 전용.
// 스크롤 맨 위에서 아래로 당기면 콘텐츠가 손가락 따라 내려오고(고무줄),
// 그 위 여백 중앙에 로고가 나타난다. 임계값을 넘겨 떼면 onRefresh() 실행,
// 놓으면 스프링 곡선으로 부드럽게 복귀한다.
//
// scrollTarget:
//   'window' (기본) — 페이지가 document(body) 스크롤일 때
//   RefObject      — 내부 스크롤 컨테이너(overflow-y:auto)를 쓰는 페이지
import { useRef, useState, useEffect, useCallback, type ReactNode, type RefObject } from 'react';
import botzMark from '../../../assets/botz-mark.svg';

const THRESHOLD = 70;     // 이 거리 이상 당기고 떼면 새로고침
const MAX_PULL = 130;     // 최대 당김 거리
const RESISTANCE = 0.5;   // 당김 저항 (손가락 이동 대비 실제 이동 비율)
const MIN_SPIN = 600;     // 새로고침 스핀 최소 표시 시간(ms)
const CLICK_SUPPRESS_MS = 700;
const MIN_PULL_TO_SUPPRESS_CLICK = 8;
const LONG_TOUCH_MS = 150;
const SPRING = 'transform 0.78s cubic-bezier(0.22, 1, 0.36, 1)';  // 놓을 때 복귀 곡선
const DEFAULT_EXCLUDE_SELECTOR = [
  '.pm',
  '.pm-menu',
  '.detail-backdrop',
  '.coin-detail-panel',
  '.bottom-sheet',
  '.bottom-sheet-overlay',
  '.draggable-watchlist-sheet',
  '.sheet-content-scrollable',
  '.interval-sheet',
  '.interval-sheet-backdrop',
  '.interval-sheet-content',
  '.interval-drag-zone',
  '.floating-toolbar',
  '[data-ptr-exclude="true"]',
].join(',');

interface Props {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  /** 부모 높이를 꽉 채워야 하는 화면(차트 등)에서 사용한다. */
  fill?: boolean;
  /** 새로고침 인디케이터가 시작될 상단 위치. */
  indicatorTop?: number | string;
  /** 스크롤 주체. 기본은 document(window) 스크롤. */
  scrollTarget?: 'window' | RefObject<HTMLElement | null>;
  /** 이 selector 안에서 시작한 터치는 pull-to-refresh로 처리하지 않는다. */
  excludeSelector?: string;
}

export default function PullToRefresh({ onRefresh, children, fill = false, indicatorTop = 0, scrollTarget = 'window', excludeSelector }: Props) {
  const [pull, setPull] = useState(0);        // 현재 당김 거리(px)
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const lastY = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);
  const active = useRef(false);               // 이번 터치가 pull 제스처인지
  const pullRef = useRef(0);                  // touchend에서 stale state 참조 방지
  const refreshingRef = useRef(false);
  const suppressClickUntil = useRef(0);
  const suppressingClick = useRef(false);
  const excludedGesture = useRef(false);
  const excludedMoved = useRef(false);
  const excludedScrollTarget = useRef<HTMLElement | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);  // 이 페이지가 화면에 보이는지 판별용

  function applyPull(v: number) { pullRef.current = v; setPull(v); }

  // App이 방문 페이지를 display:none으로 DOM에 유지하므로, 숨겨진 페이지의
  // PullToRefresh가 document 터치를 가로채지 않도록 가시성을 확인한다.
  const isVisible = useCallback(() => sentinel.current?.offsetParent != null, []);

  const atTop = useCallback(() => {
    if (scrollTarget === 'window') return window.scrollY <= 0;
    return (scrollTarget.current?.scrollTop ?? 0) <= 0;
  }, [scrollTarget]);

  function findScrollableAncestor(target: Element | null) {
    let current: Element | null = target;
    while (current && current !== document.body && current !== document.documentElement) {
      if (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current);
        const canScrollY = /(auto|scroll)/.test(style.overflowY);
        if (canScrollY && current.scrollHeight > current.clientHeight) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || !isVisible()) return;
      const target = e.target as Element | null;
      // 모달 시트/패널(DEFAULT_EXCLUDE)에서 시작한 터치는 PullToRefresh가
      // 아예 손대지 않는다. (preventDefault/클릭억제로 시트 내부 스크롤·탭을
      // 잡아먹던 문제 차단) 추가 excludeSelector(내부 스크롤 영역)만
      // "맨 위에서 당기면 새로고침" 후보로 처리한다.
      if (target?.closest?.(DEFAULT_EXCLUDE_SELECTOR)) return;
      const isExcluded = !!(excludeSelector && target?.closest?.(excludeSelector));
      if (!isExcluded && !atTop()) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      lastY.current = e.touches[0].clientY;
      startTime.current = Date.now();
      active.current = false;
      excludedGesture.current = isExcluded;
      excludedMoved.current = false;
      excludedScrollTarget.current = isExcluded
        ? findScrollableAncestor(e.target as Element | null)
        : null;
    }
    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current || startY.current === null || startX.current === null) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - startY.current;
      const deltaY = lastY.current === null ? 0 : currentY - lastY.current;
      const deltaX = Math.abs(e.touches[0].clientX - startX.current);
      lastY.current = currentY;
      if (excludedGesture.current) {
        const isMostlyVertical = deltaX <= Math.max(Math.abs(delta), 8);
        const innerScrollTop = excludedScrollTarget.current?.scrollTop ?? 0;
        if (deltaY > 0 && isMostlyVertical && innerScrollTop <= 0 && atTop()) {
          excludedMoved.current = true;
          suppressingClick.current = true;
          suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
          if (e.cancelable) e.preventDefault();
        }
        return;
      }
      if (deltaX > Math.abs(delta) || delta <= 0 || !atTop()) {
        applyPull(0);
        active.current = false;
        setDragging(false);
        return;
      }
      active.current = true;
      setDragging(true);
      applyPull(Math.min(delta * RESISTANCE, MAX_PULL));
      suppressingClick.current = true;
      suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
      if (e.cancelable) e.preventDefault();  // 당기는 동안 브라우저 bounce 방지
    }
    async function onTouchEnd(e: TouchEvent) {
      if (startY.current === null) return;
      const shouldRefresh = active.current && pullRef.current >= THRESHOLD;
      const elapsed = startTime.current === null ? 0 : Date.now() - startTime.current;
      const shouldSuppressClick =
        (active.current && pullRef.current >= MIN_PULL_TO_SUPPRESS_CLICK) ||
        (elapsed >= LONG_TOUCH_MS && pullRef.current > 0) ||
        (excludedGesture.current && excludedMoved.current);
      if (shouldSuppressClick) {
        suppressingClick.current = true;
        suppressClickUntil.current = Date.now() + CLICK_SUPPRESS_MS;
        if (e.cancelable) e.preventDefault();
      }
      startY.current = null;
      startX.current = null;
      lastY.current = null;
      startTime.current = null;
      excludedGesture.current = false;
      excludedMoved.current = false;
      excludedScrollTarget.current = null;
      active.current = false;
      setDragging(false);
      if (shouldRefresh) {
        refreshingRef.current = true;
        setRefreshing(true);
        applyPull(THRESHOLD);
        const started = Date.now();
        try { await onRefresh(); } finally {
          // 너무 빨리 끝나도 최소 시간 동안 스핀을 보여줘 새로고침 피드백을 확실히 한다
          const elapsed = Date.now() - started;
          if (elapsed < MIN_SPIN) await new Promise(res => setTimeout(res, MIN_SPIN - elapsed));
          refreshingRef.current = false;
          setRefreshing(false);
          applyPull(0);
        }
      } else {
        applyPull(0);
      }
    }
    function onClick(e: MouseEvent) {
      if (!suppressingClick.current || Date.now() > suppressClickUntil.current) {
        suppressingClick.current = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      suppressingClick.current = false;
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('click', onClick, true);
    };
  }, [atTop, onRefresh, isVisible, excludeSelector]);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(pull / THRESHOLD, 1);  // 0~1
  const indicatorY = pull / 2 - 18;
  const indicatorOpacity = visible ? Math.min(0.25 + progress * 0.75, 1) : 0;
  const indicatorScale = visible ? 0.82 + progress * 0.18 : 0.72;

  return (
    <div
      style={{
        position: 'relative',
        height: fill ? '100%' : undefined,
        minHeight: fill ? 0 : undefined,
      }}
    >
      <div ref={sentinel} aria-hidden style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }} />

      {/* 콘텐츠 위 여백 중앙에 뜨는 로고 인디케이터 */}
      <div
        aria-hidden={!visible}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: indicatorTop,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 1,
          opacity: indicatorOpacity,
          transform: `translateY(${indicatorY}px) scale(${indicatorScale})`,
          transition: dragging ? 'none' : `${SPRING}, opacity 0.28s ease-out`,
        }}
      >
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#1c1f26',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <img
            src={botzMark}
            alt=""
            width={22}
            height={22}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              animation: refreshing ? 'ptr-spin 0.8s linear infinite' : undefined,
              opacity: refreshing ? 1 : 0.4 + progress * 0.6,
            }}
          />
        </div>
      </div>

      <div
        style={{
          // 평상시(당기지 않을 때)엔 transform/will-change를 비운다.
          // translateY(0)·will-change는 fixed 요소(하단탭)의 containing block을
          // 가로채 iOS PWA에서 탭바가 뜨는 버그를 유발하므로, 당기는 중에만 적용한다.
          transform: visible && pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: dragging ? 'none' : SPRING,
          willChange: visible && pull > 0 ? 'transform' : undefined,
          height: fill ? '100%' : undefined,
          minHeight: fill ? 0 : undefined,
        }}
      >
        {children}
      </div>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
