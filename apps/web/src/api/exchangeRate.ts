const DEFAULT_USD_KRW = 1380;

export async function fetchUsdKrwRate(fallback = DEFAULT_USD_KRW): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return fallback;

    const data = await res.json();
    const rate = data?.rates?.KRW;
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : fallback;
  } catch {
    return fallback;
  }
}
