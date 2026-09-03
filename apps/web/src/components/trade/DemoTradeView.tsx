// Bitget 외 거래소(데모) 트레이드 본문 — 실 API 미연동이라 더미 호가창을 보여준다.
// 중심가만 해당 거래소 실 티커에서 1회 가져와 현실감 유지, 매수/매도 레벨은 그 주변으로 생성.
import { useEffect, useMemo, useState } from 'react';
import TradeOrderbook from './TradeOrderbook';
import { fetchBinanceSpotTickers, fetchBinanceFuturesTickers } from '../../api/marketApi';
import { fetchUpbitSpotTickers, fetchBithumbSpotTickers } from '../../api/krwTickers';
import { EXCHANGES, type ExchangeId } from '../../constants/exchanges';
import type { CoinTicker } from '../../types/market';

type Market = 'spot' | 'futures';
type Level = { price: number; size: number };

async function loadTickers(exchange: ExchangeId, market: Market): Promise<CoinTicker[]> {
  if (exchange === 'BINANCE') return market === 'futures' ? fetchBinanceFuturesTickers() : fetchBinanceSpotTickers();
  if (exchange === 'UPBIT') return fetchUpbitSpotTickers();
  if (exchange === 'BITHUMB') return fetchBithumbSpotTickers();
  return [];
}

// 중심가 기준 더미 호가 — 6 매도(위) + 6 매수(아래). 사이즈는 심볼 시드로 안정적 생성.
function buildBook(center: number): { asks: Level[]; bids: Level[]; max: number } {
  const step = Math.max(center * 0.0006, 1e-8);
  const sizes = [1.32, 0.84, 2.11, 0.57, 1.78, 0.93, 1.05, 2.4, 0.66, 1.51, 0.79, 1.93];
  const asks: Level[] = [];
  const bids: Level[] = [];
  for (let i = 6; i >= 1; i--) asks.push({ price: center + step * i, size: sizes[i - 1] });
  for (let i = 1; i <= 6; i++) bids.push({ price: center - step * i, size: sizes[i + 5] });
  const max = Math.max(...sizes.slice(0, 12));
  return { asks, bids, max };
}

function fmtPriceFor(decimals: number) {
  return (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

type Props = { exchange: ExchangeId; symbol: string; market: Market };

export default function DemoTradeView({ exchange, symbol, market }: Props) {
  const ex = EXCHANGES[exchange];
  const [center, setCenter] = useState<number | null>(null);
  const [decimals, setDecimals] = useState(2);

  useEffect(() => {
    let ignore = false;
    setCenter(null);
    loadTickers(exchange, market).then((list) => {
      if (ignore) return;
      const hit = list.find((t) => t.symbol === symbol) || list[0];
      if (hit) { setCenter(hit.last); setDecimals(hit.tickDecimals ?? 2); }
    }).catch(() => {});
    return () => { ignore = true; };
  }, [exchange, symbol, market]);

  const book = useMemo(() => (center != null ? buildBook(center) : null), [center]);
  const fmt = fmtPriceFor(decimals);
  const buyPct = 50;

  return (
    <section className="trade-grid">
      {/* 좌측: 데모 안내 패널(주문 티켓 자리) */}
      <div className="trade-account-summary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, padding: '24px 12px' }}>
        <img src={ex.logo} alt="" style={{ width: 34, height: 34, opacity: 0.9 }} />
        <p style={{ color: 'var(--text, #eaecef)', fontSize: 14, fontWeight: 600, margin: 0 }}>{ex.label} 데모</p>
        <p style={{ color: 'var(--muted, #8b8e97)', fontSize: 12, lineHeight: 1.5, margin: 0 }}>
          실 거래 연동(API)은<br />준비 중이에요.
        </p>
        <span style={{ marginTop: 4, fontSize: 11, color: 'var(--muted, #8b8e97)', border: '1px solid var(--border, rgba(255,255,255,0.12))', borderRadius: 999, padding: '3px 10px' }}>
          호가 = 더미 데이터
        </span>
      </div>

      {/* 우측: 더미 호가창(TradeOrderbook 재사용) */}
      <TradeOrderbook
        askRows={book?.asks ?? []}
        bidRows={book?.bids ?? []}
        maxLevelSize={book?.max ?? 1}
        fmtPrice={fmt}
        fmtMid={fmt}
        centerPrice={center}
        priceDir="flat"
        buyPct={buyPct}
        depthLabel="데모"
        onOpenDepthSheet={() => {}}
        quoteLabel={ex.quote}
      />
    </section>
  );
}
