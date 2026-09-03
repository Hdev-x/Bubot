import { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import {
  fetchBinanceFuturesTickers,
  fetchBinanceSpotTickers,
  fetchCoinFuturesTickers,
  fetchCoinTickers,
} from '../../../../api/server/marketApi';
import type { CoinTicker } from '../../../../shared/types/market';
import { getOfficialLogo, coinColor } from '../../../../shared/utils/coinFormatters';
import { CoinLogo } from '../coin-list/CoinLogo';
import binanceLogo from '../../../../assets/exchanges/binance.svg';
import bitgetLogo from '../../../../assets/exchanges/bitget.svg';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (symbol: string) => void;
  onSelectFixed?: (symbol: string, exchange: 'BITGET' | 'BINANCE', isFutures: boolean) => void;
  exchange?: 'BITGET' | 'BINANCE';
  isFutures?: boolean;
};

type SortFilter = 'VOLUME' | 'TOP' | 'BOTTOM';

const SORT_OPTIONS: { label: string; value: SortFilter }[] = [
  { label: '거래대금', value: 'VOLUME' },
  { label: '급상승', value: 'TOP' },
  { label: '급하락', value: 'BOTTOM' },
];

export default function SymbolSearchSheet({ isOpen, onClose, onSelect, onSelectFixed, exchange = 'BITGET', isFutures = false }: Props) {
  const [tickers, setTickers] = useState<CoinTicker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(40);
  const [sortFilter, setSortFilter] = useState<SortFilter>('VOLUME');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [sheetSize, setSheetSize] = useState<'compact' | 'full'>('compact');
  const dragControls = useDragControls();

  useEffect(() => {
    if (!isOpen) return;

    setSearchTerm('');
    setVisibleCount(40);
    setSheetSize('compact');
    // 리스트 페이지가 저장한 관심종목을 읽어온다.
    try {
      const saved = localStorage.getItem('watchlist_symbols');
      setWatchlist(saved ? JSON.parse(saved) : []);
    } catch {
      setWatchlist([]);
    }
    // 현재 차트의 거래소/현물·선물에 맞는 종목 목록을 불러온다.
    const loader = exchange === 'BINANCE'
      ? (isFutures ? fetchBinanceFuturesTickers : fetchBinanceSpotTickers)
      : (isFutures ? fetchCoinFuturesTickers : fetchCoinTickers);
    loader().then((data) => {
      setTickers(data.filter(t => t.quoteSymbol === 'USDT'));
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen, exchange, isFutures]);

  // 정렬 탭이나 검색어가 바뀌면 목록을 처음부터 다시 보여준다.
  useEffect(() => { setVisibleCount(40); }, [sortFilter, searchTerm]);

  const symbolLabel = (symbol: string) => (isFutures ? `${symbol}.P` : symbol);

  const sortedTickers = useMemo(() => {
    const list = [...tickers];
    if (sortFilter === 'TOP') list.sort((a, b) => b.changeRate - a.changeRate);
    else if (sortFilter === 'BOTTOM') list.sort((a, b) => a.changeRate - b.changeRate);
    else list.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    return list;
  }, [tickers, sortFilter]);

  const filteredTickers = useMemo(() => {
    const term = searchTerm.toUpperCase();
    if (!term) return sortedTickers;
    return sortedTickers.filter(t =>
      t.symbol.includes(term) ||
      (t.name && t.name.toUpperCase().includes(term))
    );
  }, [sortedTickers, searchTerm]);

  // 관심종목 중 현재 거래소 목록에 존재하는 종목만 칩으로 보여준다.
  const watchlistTickers = useMemo(() => {
    if (!watchlist.length) return [];
    const bySymbol = new Map(tickers.map(t => [t.symbol, t]));
    return watchlist.map(s => bySymbol.get(s)).filter((t): t is CoinTicker => !!t);
  }, [watchlist, tickers]);

  // 한 번에 모든 행을 그리면 시트가 올라올 때 버벅이므로 스크롤하며 점진적으로 늘린다.
  const visibleTickers = filteredTickers.slice(0, visibleCount);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300 && visibleCount < filteredTickers.length) {
      setVisibleCount(prev => prev + 40);
    }
  }

  function choose(symbol: string) {
    onSelect(symbol);
    onClose();
  }

  function chooseFixed(symbol: string, ex: 'BITGET' | 'BINANCE', futures: boolean) {
    onSelectFixed?.(symbol, ex, futures);
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className={`interval-sheet ${sheetSize}`}
            initial={{ y: '100%', height: '80dvh' }}
            animate={{
              y: 0,
              height: sheetSize === 'full' ? '100dvh' : '80dvh',
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20,
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20,
            }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -78 || info.velocity.y < -650) {
                setSheetSize('full');
                return;
              }
              if (info.offset.y > 92 || info.velocity.y > 700) {
                if (sheetSize === 'full') setSheetSize('compact');
                else onClose();
              }
            }}
          >
            <div
              className="interval-drag-zone"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="sheet-handle" />
            </div>
            <header className="interval-sheet-header">
              <div className="symbol-sheet-title">
                <h3>심볼 찾기</h3>
                <span className="symbol-sheet-market">
                  {exchange === 'BINANCE' ? 'Binance' : 'Bitget'} · {isFutures ? '선물' : '현물'}
                </span>
              </div>
              <button className="interval-close-btn" type="button" onClick={onClose} aria-label="닫기">✕</button>
            </header>

            <div className="symbol-search-input-wrapper">
              <input
                type="text"
                placeholder="검색 (예: BTC, 비트코인)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="interval-sheet-content" onScroll={handleScroll}>
              {!searchTerm && onSelectFixed && (
                <section className="interval-section">
                  <div className="fixed-symbol-grid">
                    <button className="fixed-symbol-chip" onClick={() => chooseFixed('BTCUSDT', 'BINANCE', false)}>
                      <span className="fixed-symbol-logo">
                        <img
                          src={getOfficialLogo('BTC') || 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png'}
                          alt="BTC"
                        />
                      </span>
                      <span className="fixed-symbol-content">
                        <span className="fixed-symbol-main">BTCUSDT</span>
                        <span className="fixed-symbol-meta">
                          <span className="fixed-exchange-badge">
                            <img className="fixed-exchange-logo" src={binanceLogo} alt="" aria-hidden="true" />
                            Binance
                          </span>
                        </span>
                      </span>
                    </button>
                    <button className="fixed-symbol-chip" onClick={() => chooseFixed('BTCUSDT', 'BINANCE', true)}>
                      <span className="fixed-symbol-logo">
                        <img
                          src={getOfficialLogo('BTC') || 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png'}
                          alt="BTC"
                        />
                      </span>
                      <span className="fixed-symbol-content">
                        <span className="fixed-symbol-main">BTCUSDT.P</span>
                        <span className="fixed-symbol-meta">
                          <span className="fixed-exchange-badge">
                            <img className="fixed-exchange-logo" src={binanceLogo} alt="" aria-hidden="true" />
                            Binance
                          </span>
                        </span>
                      </span>
                    </button>
                    <button className="fixed-symbol-chip" onClick={() => chooseFixed('BTCUSDT', 'BITGET', false)}>
                      <span className="fixed-symbol-logo">
                        <img
                          src={getOfficialLogo('BTC') || 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png'}
                          alt="BTC"
                        />
                      </span>
                      <span className="fixed-symbol-content">
                        <span className="fixed-symbol-main">BTCUSDT</span>
                        <span className="fixed-symbol-meta">
                          <span className="fixed-exchange-badge bitget">
                            <img className="fixed-exchange-logo" src={bitgetLogo} alt="" aria-hidden="true" />
                            Bitget
                          </span>
                        </span>
                      </span>
                    </button>
                    <button className="fixed-symbol-chip" onClick={() => chooseFixed('BTCUSDT', 'BITGET', true)}>
                      <span className="fixed-symbol-logo">
                        <img
                          src={getOfficialLogo('BTC') || 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png'}
                          alt="BTC"
                        />
                      </span>
                      <span className="fixed-symbol-content">
                        <span className="fixed-symbol-main">BTCUSDT.P</span>
                        <span className="fixed-symbol-meta">
                          <span className="fixed-exchange-badge bitget">
                            <img className="fixed-exchange-logo" src={bitgetLogo} alt="" aria-hidden="true" />
                            Bitget
                          </span>
                        </span>
                      </span>
                    </button>
                    <button className="fixed-symbol-chip fixed-symbol-placeholder" onClick={() => {}}>
                      <span className="fixed-placeholder-icon">+</span>
                    </button>
                  </div>
                </section>
              )}

              {!searchTerm && watchlistTickers.length > 0 && (
                <section className="interval-section symbol-watchlist-section">
                  <div className="watchlist-scroll symbol-watchlist-scroll">
                    {watchlistTickers.map(t => (
                      <button key={t.symbol} className="watchlist-story-item" onClick={() => choose(t.symbol)}>
                        <div className={`story-circle-wrapper ${t.changeRate >= 0 ? 'up' : 'down'}`}>
                          <div className="story-inner-circle">
                            <CoinLogo 
                              symbol={t.baseSymbol}
                              logoUrl={getOfficialLogo(t.baseSymbol) || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${t.baseSymbol.toLowerCase()}.png`}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                              color={coinColor(t.baseSymbol)}
                            />
                          </div>
                        </div>
                        <span className="story-symbol">{t.baseSymbol}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="interval-section">
                <div className="interval-section-title-row">
                  <p className="interval-section-title">{searchTerm ? '검색 결과' : '전체 목록'}</p>
                  <div className="symbol-sort-tabs">
                    {SORT_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`symbol-sort-tab ${sortFilter === opt.value ? 'active' : ''}`}
                        onClick={() => setSortFilter(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="symbol-row-list">
                  {visibleTickers.map(t => (
                    <button key={t.symbol} className="symbol-row" onClick={() => choose(t.symbol)}>
                      <div className="symbol-row-info">
                        <strong>{symbolLabel(t.symbol)}</strong>
                        <span>{t.name}</span>
                      </div>
                      <div className="symbol-row-price">
                        <strong className={t.changeRate >= 0 ? 'up' : 'down'}>
                          {t.last.toLocaleString()}
                        </strong>
                        <span className={t.changeRate >= 0 ? 'up' : 'down'}>
                          {t.changeRate >= 0 ? '+' : ''}{(t.changeRate * 100).toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
