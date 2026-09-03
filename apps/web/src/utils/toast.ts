// 가벼운 전역 토스트 — 화면 하단 중앙에 잠깐 떴다 사라지는 안내 메시지.
// React 상태 없이 DOM에 직접 주입해 어디서든(예: App 핸들러) 호출 가능.

let activeToast: HTMLDivElement | null = null;
let removeTimer: number | undefined;

export function showToast(message: string, durationMs = 2400) {
  // 이전 토스트가 있으면 즉시 정리
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }
  if (removeTimer) window.clearTimeout(removeTimer);

  const el = document.createElement('div');
  el.textContent = message;
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
    transform: 'translateX(-50%) translateY(8px)',
    maxWidth: '80%',
    padding: '10px 16px',
    background: 'rgba(28,30,34,0.96)',
    color: '#eaecef',
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: '1.4',
    textAlign: 'center',
    borderRadius: '10px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 0.18s ease, transform 0.18s ease',
    pointerEvents: 'none',
    whiteSpace: 'pre-line',
  } as CSSStyleDeclaration);

  document.body.appendChild(el);
  activeToast = el;

  // 다음 프레임에 페이드 인
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });

  removeTimer = window.setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
    window.setTimeout(() => {
      if (activeToast === el) activeToast = null;
      el.remove();
    }, 200);
  }, durationMs);
}
