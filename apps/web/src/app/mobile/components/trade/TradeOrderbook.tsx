// Trade 페이지 공유 호가창 — 선물/현물 공통. 표시용 파생값은 부모가 계산해 props로 넘긴다.
// (DOM/className은 styles.css의 .orderbook 규칙에 그대로 맞춤 — 동작 보존)

type Level = { price: number; size: number };

// 호가는 항상 6행 고정. 데이터 도착 전=스켈레톤, 묶음 결과가 6개 미만이면 빈 행으로 채움(레이아웃 고정).
const ROWS = 6;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];
function SkeletonRow() {
  return (
    <div className="book-row book-row-skel">
      <span className="bk-skel-price skeleton-shimmer" />
      <span className="bk-skel-qty skeleton-shimmer" />
    </div>
  );
}
// 빈 행 — 데이터 행과 같은 높이 유지(레이아웃 점프 방지)
function EmptyRow() {
  return <div className="book-row book-row-empty"><span>&nbsp;</span></div>;
}
// 6행으로 패딩 — 매도는 위쪽(중앙에서 먼 쪽), 매수는 아래쪽을 빈 행으로 채운다.
function padTo6(rows: Level[], side: 'ask' | 'bid'): (Level | null)[] {
  const empties = Math.max(0, ROWS - rows.length);
  const blanks = Array.from({ length: empties }, () => null);
  return side === 'ask' ? [...blanks, ...rows] : [...rows, ...blanks];
}

// 호가 수량(USDT 환산)을 K/M로 압축 표기
export function compactQty(n: number) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

type Props = {
  askRows: Level[];           // 위→아래(최우선 매도가 맨 아래)로 이미 정렬된 행
  bidRows: Level[];
  maxLevelSize: number;       // 깊이 게이지 기준
  fmtPrice: (n: number) => string;  // 호가 행 가격(단위 묶음 종속)
  fmtMid: (n: number) => string;    // 가운데 현재가(심볼 고정 소수점)
  centerPrice: number | null | undefined;
  priceDir: 'up' | 'down' | 'flat';
  buyPct: number;             // 매수 강도 %
  depthLabel: string;         // 현재 묶음 단위 라벨
  onOpenDepthSheet: () => void;
  funding?: string;           // 펀딩비/카운트다운(선물만). 없으면 헤더 숨김(현물)
  quoteLabel?: string;        // 호가 헤더 통화 라벨(기본 USDT). 업비트/빗썸 데모는 KRW.
  showDepth?: boolean;        // 자릿수(묶음) 버튼 노출 여부(기본 true). 묶음 미지원 거래소에서 false.
};

export default function TradeOrderbook({
  askRows, bidRows, maxLevelSize, fmtPrice, fmtMid,
  centerPrice, priceDir, buyPct, depthLabel, onOpenDepthSheet, funding, quoteLabel = 'USDT', showDepth = true,
}: Props) {
  return (
    <aside className="orderbook">
      {/* 펀딩 영역은 항상 자리 차지(높이 고정) — 펀딩 없는 종목에선 visibility:hidden으로 숨기되 공간 예약.
          마크업이 동일해 web/mobile 모두 같은 높이를 정확히 예약(호가가 위로 안 올라감) */}
      <div className="funding-rate-countdown" style={funding ? undefined : { visibility: 'hidden' }}>
        Funding rate / Countdown<br />
        <span className="funding-value">{funding || ' '}</span>
      </div>

      <div className="orderbook-head">
        <span className="col-price">Price<br />({quoteLabel})</span>
        <span className="col-qty">Quantity<br />({quoteLabel})</span>
      </div>

      {/* 매도 호가 (Asks) - 비트겟 실시간. 데이터 도착 전엔 스켈레톤 행으로 높이 유지(레이아웃 점프 방지) */}
      <div className="book-side asks">
        {askRows.length === 0
          ? SKELETON_ROWS.map((i) => <SkeletonRow key={i} />)
          : padTo6(askRows, 'ask').map((row, idx) => row === null
              ? <EmptyRow key={idx} />
              : (
                <div key={idx} className="book-row">
                  <span className="price-red">{fmtPrice(row.price)}</span>
                  <strong className="qty-val">{compactQty(row.price * row.size)}</strong>
                  <i className="gauge-red" style={{ width: `${(row.size / maxLevelSize) * 100}%` }} />
                </div>
              ))}
      </div>

      {/* 현재가 및 시장가 영역 */}
      <div className="mark-price">
        <div className="price-arrow-row">
          <strong className={`current-price-val ${priceDir}`}>{centerPrice != null ? fmtMid(centerPrice) : '—'}</strong>
          <span className="arrow-next">&gt;</span>
        </div>
        <span className="market-price-val">{centerPrice != null ? fmtMid(centerPrice) : '—'}</span>
      </div>

      {/* 매수 호가 (Bids) - 비트겟 실시간. 데이터 도착 전엔 스켈레톤 행 */}
      <div className="book-side bids">
        {bidRows.length === 0
          ? SKELETON_ROWS.map((i) => <SkeletonRow key={i} />)
          : padTo6(bidRows, 'bid').map((row, idx) => row === null
              ? <EmptyRow key={idx} />
              : (
                <div key={idx} className="book-row">
                  <span className="price-green">{fmtPrice(row.price)}</span>
                  <strong className="qty-val">{compactQty(row.price * row.size)}</strong>
                  <i className="gauge-green" style={{ width: `${(row.size / maxLevelSize) * 100}%` }} />
                </div>
              ))}
      </div>

      {/* 매수 / 매도 강도 비율 바 */}
      <div className="book-ratio">
        <span className="ratio-buy">B {buyPct}%</span>
        <div className="ratio-bar">
          <span className="bar-buy" style={{ width: `${buyPct}%` }} />
          <span className="bar-sell" style={{ width: `${100 - buyPct}%` }} />
        </div>
        <span className="ratio-sell">{100 - buyPct}% S</span>
      </div>

      {/* 호가 단위 및 레이아웃 설정 */}
      <div className="orderbook-footer">
        <button type="button" className="ob-filter-btn">
          {/* 바둑판 모양의 간단한 그리드 아이콘 */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 11h5V5H4v6zm0 8h5v-6H4v6zm7 0h5v-6h-5v6zm7 0h5v-6h-5v6zm-7-8h5V5h-5v6zm7-6v6h5V5h-5z"/>
          </svg>
        </button>
        {showDepth && (
          <button type="button" className="ob-decimals-btn" onClick={onOpenDepthSheet}>
            <span>{depthLabel}</span>
            <span className="arrow-down">▾</span>
          </button>
        )}
      </div>
    </aside>
  );
}
