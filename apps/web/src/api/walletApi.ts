import { authHeader } from './authApi';

export async function fetchWallet(): Promise<{ usdtBalance: number }> {
  try {
    const res = await fetch('/coin/wallet', { credentials: 'include', headers: authHeader() });
    if (!res.ok) throw new Error('Failed to fetch wallet');
    const data = await res.json();
    return { usdtBalance: data?.usdtBalance ?? 0 };
  } catch (e) {
    console.error(e);
    return { usdtBalance: 0 };
  }
}

export async function fetchAssetSummary(): Promise<{ totalAssetUsdt: number, totalAssetKrw: number }> {
  try {
    const res = await fetch('/asset/summary', { credentials: 'include', headers: authHeader() });
    if (!res.ok) throw new Error('Failed to fetch asset summary');
    const data = await res.json();
    
    // 비로그인 시 빈 Map({}) 이 반환됨
    if (!data || Object.keys(data).length === 0) {
      return { totalAssetUsdt: 0, totalAssetKrw: 0 };
    }

    const coin = data.coin || {};
    const cashUsdt = coin.cashUsdt || 0;
    const evalUsdt = coin.evalUsdt || 0;
    
    return { 
      totalAssetUsdt: cashUsdt + evalUsdt, 
      totalAssetKrw: data.grandTotal || 0 
    };
  } catch (e) {
    console.error(e);
    return { totalAssetUsdt: 0, totalAssetKrw: 0 };
  }
}
