import { useCallback, useEffect, useState } from 'react';

const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT'];
const WATCHLIST_STORAGE_KEY = 'watchlist_symbols';

function loadWatchlist() {
  try {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>(loadWatchlist);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  const toggleWatchlist = useCallback((symbol: string, event?: { stopPropagation: () => void }) => {
    event?.stopPropagation();
    setWatchlist(prev =>
      prev.includes(symbol) ? prev.filter(item => item !== symbol) : [...prev, symbol]
    );
  }, []);

  const isWatched = useCallback((symbol: string) => {
    return watchlist.includes(symbol);
  }, [watchlist]);

  return {
    watchlist,
    toggleWatchlist,
    isWatched,
  };
}
