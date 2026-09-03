// 플로팅 미니창끼리 가장자리 스냅 — 드래그 중 다른 떠있는 창(.watch-float/.paper-order) 근처면 맞물리게 정렬.
const SNAP = 10; // 스냅 임계(px)
const FLOAT_SELECTOR = '.watch-float, .paper-order';

/** 드래그 창의 의도 좌표(x,y)+크기(w,h)를 받아, 다른 플로팅 창에 닿거나 정렬되면 스냅한 좌표 반환. selfEl은 제외. */
export function snapFloat(x: number, y: number, w: number, h: number, selfEl: HTMLElement | null): { x: number; y: number } {
  const others = Array.from(document.querySelectorAll(FLOAT_SELECTOR)).filter((e) => e !== selfEl) as HTMLElement[];
  let nx = x, ny = y;
  for (const o of others) {
    const r = o.getBoundingClientRect();
    // x: 오른쪽에 붙이기(left=other.right) / 왼쪽에 붙이기(right=other.left) / 좌측정렬 / 우측정렬
    for (const c of [r.right, r.left - w, r.left, r.right - w]) {
      if (Math.abs(x - c) < SNAP) { nx = c; break; }
    }
    // y: 아래에 붙이기(top=other.bottom) / 위에 붙이기(bottom=other.top) / 상단정렬 / 하단정렬
    for (const c of [r.bottom, r.top - h, r.top, r.bottom - h]) {
      if (Math.abs(y - c) < SNAP) { ny = c; break; }
    }
  }
  return { x: nx, y: ny };
}
