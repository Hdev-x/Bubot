// 호가 단위 라벨 (OrderPage.depthLabelFor 동일)
export function depthLabelFor(scaleIndex: number, symbolDecimals: number): string {
  const dec = Math.max(0, symbolDecimals - scaleIndex);
  const value = Math.pow(10, scaleIndex - symbolDecimals);
  return value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// 호가 묶음(aggregate) — Bitget은 API가 precision으로 묶어주지만, Binance/업비트/빗썸은 고정 틱만 줘서
// 프론트에서 step 단위로 직접 묶는다. 매도=올림(ceil), 매수=내림(floor)으로 중앙 겹침 없이 사다리 유지.
export function aggregateLevels(levels: { price: number; size: number }[], step: number, side: 'ask' | 'bid') {
  if (!levels.length || !(step > 0)) return levels;
  const map = new Map<number, number>();
  for (const l of levels) {
    const idx = side === 'ask' ? Math.ceil(l.price / step - 1e-9) : Math.floor(l.price / step + 1e-9);
    map.set(idx, (map.get(idx) ?? 0) + l.size);
  }
  const out = [...map.entries()].map(([idx, size]) => ({ price: idx * step, size }));
  out.sort((a, b) => (side === 'ask' ? a.price - b.price : b.price - a.price));
  return out;
}
