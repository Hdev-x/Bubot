// 트레이드 페이지 좌측(현물) — 주문 티켓 대체 뷰어 패널 (read-only).
// 선물 패널(TradeAccountSummary)과 동일 구조·CSS, 데이터만 현물(보유자산 + USDT 잔고).
// 현물은 포지션/레버리지/미실현이 없어 "총자산(실시간 평가) + 가용/동결 + 보유자산 목록"으로 구성.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpotHolding } from '../../../../api/server/spotTradeApi';
import { useSettings, currencyLabel } from '../../../../shared/contexts/CurrencyContext';
import { useUsdKrw } from '../../../../hooks/market/useUsdKrw';
import { useRealtimePrices } from '../../../../hooks/market/useRealtimePrices';
import { CoinLogo } from '../coin-list/CoinLogo';
import { getOfficialLogo, coinColor } from '../../../../shared/utils/coinFormatters';

function fmtAsset(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 4 : 1,
    maximumFractionDigits: n > 0 && n < 1 ? 4 : 1,
  });
}

export default function SpotAccountSummary({
  holdings,
  hasKey,
  onOpenChart,
}: {
  holdings: SpotHolding[];
  usdtAvailable: number;
  hasKey: boolean;
  onOpenChart?: () => void;
}) {
  const { displayCurrency, setDisplayCurrency, isHideBalance } = useSettings();
  const usdKrw = useUsdKrw();
  const [walletExpanded, setWalletExpanded] = useState(false);

  // 보유 코인 실시간가(USDT는 1). 평가용.
  const priceSymbols = holdings
    .filter((h) => h.coin !== 'USDT' && h.coin !== 'USDC')
    .map((h) => `${h.coin}USDT`);
  const prices = useRealtimePrices(priceSymbols, false); // 현물 보유 평가 — 현물 티커
  const priceOf = (coin: string): number =>
    coin === 'USDT' || coin === 'USDC' ? 1 : (prices[`${coin}USDT`] ?? 0);
  const valueOf = (h: SpotHolding): number => (h.available + h.frozen) * priceOf(h.coin);

  const totalAsset = holdings.reduce((s, h) => s + valueOf(h), 0);
  // 평가 준비 여부 — 보유 코인(현금 제외) 시세가 "모두" 들어오기 전엔 총자산을 확정값으로 노출하지 않는다.
  // 미수신 시세를 0으로 합산하면 현금만 잡힌 부분합이 잠깐 보였다 점프하기 때문(탭 진입 시 깜빡임의 근본 원인).
  // 시세가 영영 안 오는 코인(구독 실패 등) 대비 1.5초 타임아웃 폴백: 받은 것만으로라도 표기.
  const allPriced = priceSymbols.every((s) => (prices[s] ?? 0) > 0);
  const [priceTimeout, setPriceTimeout] = useState(false);
  useEffect(() => {
    if (priceSymbols.length === 0 || allPriced) { setPriceTimeout(false); return; }
    const id = window.setTimeout(() => setPriceTimeout(true), 1500);
    return () => clearTimeout(id);
    // priceSymbols는 매 렌더 새 배열이라 문자열 키로 dep 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceSymbols.join(','), allPriced]);
  const valuationReady = priceSymbols.length === 0 || allPriced || priceTimeout;
  // 미실현 손익 — 평균단가(avgCost)·신뢰성(costReliable) 있을 때만. 없으면 null(원가 조회불가).
  const isCash = (coin: string) => coin === 'USDT' || coin === 'USDC';
  const pnlOf = (h: SpotHolding): number | null => {
    if (isCash(h.coin)) return 0;
    if (h.avgCost == null || h.costReliable !== true) return null;
    return (priceOf(h.coin) - h.avgCost) * (h.available + h.frozen);
  };
  const unrealizedTotal = holdings.reduce((s, h) => s + (pnlOf(h) ?? 0), 0);
  // 원금(매수기준 총액) = 총평가금액 − 평가손익. 보유 현금(USDT)도 포함됨(현금은 손익 0).
  const principal = totalAsset - unrealizedTotal;
  const anyUnavailable = holdings.some(
    (h) => !isCash(h.coin) && h.available + h.frozen > 0 && pnlOf(h) === null,
  );
  // 평가금 큰 순
  const sorted = [...holdings].sort((a, b) => valueOf(b) - valueOf(a));

  // 스크롤 인디케이터(선물과 동일)
  const listRef = useRef<HTMLDivElement>(null);
  const [indVisible, setIndVisible] = useState(false);
  const [rot, setRot] = useState(0);
  const atBottomRef = useRef(false);
  const updateScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight > 4;
    setIndVisible(scrollable);
    if (!scrollable) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (atBottom !== atBottomRef.current) {
      atBottomRef.current = atBottom;
      setRot(atBottom ? 180 : 0);
    }
  }, []);
  useEffect(() => { updateScroll(); }, [holdings, updateScroll]);
  const onIndClick = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: atBottomRef.current ? 0 : el.scrollHeight, behavior: 'smooth' });
  };

  const mask = (v: string) => (isHideBalance ? '••••' : v);
  const mainVal = !hasKey
    ? '—'
    : displayCurrency === 'USDT'
      ? fmtAsset(totalAsset)
      : Math.round(totalAsset * usdKrw).toLocaleString();
  const approx = !hasKey
    ? ''
    : displayCurrency === 'USDT'
      ? `≈ ${Math.round(totalAsset * usdKrw).toLocaleString()}원`
      : `≈ ${totalAsset.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;

  const fmtCur = (usdt: number): string => {
    if (isHideBalance) return '••••';
    return displayCurrency === 'KRW'
      ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
      : usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };
  const approxCur = (usdt: number): string => {
    if (isHideBalance) return '≈ ••••';
    return displayCurrency === 'KRW'
      ? `≈ ${usdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`
      : `≈ ${Math.round(usdt * usdKrw).toLocaleString()}원`;
  };

  return (
    <div className="trade-account-summary">
      <div className="tas-inner">
        {/* 총자산(현물 실시간 평가) */}
        <div className="tas-hero">
          <span className="tas-hero-label">총자산</span>
          <div className="tas-hero-row">
            {hasKey && !valuationReady
              ? <span className="tas-hero-val tas-hero-skeleton skeleton-shimmer" aria-label="평가 중" />
              : <strong className="tas-hero-val">{mask(mainVal)}</strong>}
            {/* 통화 라벨+전환 아이콘 — 스켈레톤(평가 대기) 중엔 값과 함께 숨겨 따로 노는 느낌 방지 */}
            {(!hasKey || valuationReady) && (
              <button
                type="button"
                className="tas-cur"
                onClick={() => setDisplayCurrency(displayCurrency === 'USDT' ? 'KRW' : 'USDT')}
                aria-label="통화 전환"
              >
                {currencyLabel(displayCurrency)}
                <svg className="tas-cur-ico" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 20 7 16 11" />
                  <line x1="20" y1="7" x2="5" y2="7" />
                  <polyline points="8 21 4 17 8 13" />
                  <line x1="4" y1="17" x2="19" y2="17" />
                </svg>
              </button>
            )}
            {hasKey && (
              <button
                type="button"
                className={`tas-wallet-toggle ${walletExpanded ? 'open' : ''}`}
                onClick={() => setWalletExpanded((v) => !v)}
                aria-label="지갑 상세"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
          </div>
          {hasKey && (valuationReady
            ? <span className="tas-hero-approx">{isHideBalance ? '≈ ••••' : approx}</span>
            : <span className="tas-hero-approx tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />)}
          {hasKey && (
            <div className={`tas-wallet-wrap ${walletExpanded ? 'open' : ''}`}>
              <div className="tas-wallet-detail">
                <div className="tas-wallet-col">
                  <span className="tas-wallet-k">원금{anyUnavailable ? ' *' : ''}</span>
                  {valuationReady
                    ? <span className="tas-wallet-v">{fmtCur(principal)}</span>
                    : <span className="tas-wallet-v tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />}
                  {valuationReady && <span className="tas-wallet-approx">{approxCur(principal)}</span>}
                </div>
                <div className="tas-wallet-col">
                  <span className="tas-wallet-k">평가손익{anyUnavailable ? ' *' : ''}</span>
                  {valuationReady
                    ? <span className={`tas-wallet-v ${unrealizedTotal >= 0 ? 'up' : 'down'}`}>
                        {isHideBalance ? '••••' : `${unrealizedTotal >= 0 ? '+' : '-'}${fmtCur(Math.abs(unrealizedTotal))}`}
                      </span>
                    : <span className="tas-wallet-v tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />}
                  {valuationReady && (
                    <span className="tas-wallet-approx">
                      {anyUnavailable ? '* 일부 원가 조회불가' : approxCur(unrealizedTotal)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 보유자산 */}
        <div className="tas-divider" />
        <div className="tas-pos-title">
          <span>포트폴리오</span>
          <span className="tas-sym">{holdings.length}개</span>
        </div>

        {hasKey && !valuationReady ? (
          // 시세 도착 전 — 정렬 점프 방지를 위해 총자산과 함께 리스트도 스켈레톤(높이 동일 유지)
          <div className="tas-pos-wrap">
            <div className="tas-pos-list">
              {holdings.map((h) => (
                <div key={h.coin} className="tas-mkt-row tas-mkt-skel">
                  <span className="tas-mkt-logo skeleton-shimmer" />
                  <span className="sk-bar sk-sym skeleton-shimmer" />
                  <span className="sk-bar sk-amt skeleton-shimmer" />
                  <span className="sk-bar sk-roe skeleton-shimmer" />
                </div>
              ))}
            </div>
          </div>
        ) : sorted.length > 0 ? (
          <div className="tas-pos-wrap">
            <div className="tas-pos-list" ref={listRef} onScroll={updateScroll}>
              {sorted.map((h) => (
                <HoldingRow key={h.coin} holding={h} value={valueOf(h)} price={priceOf(h.coin)} usdKrw={usdKrw} onOpenChart={onOpenChart} />
              ))}
            </div>
            <button type="button" className={`tas-scroll-ind bottom ${indVisible ? 'show' : ''}`} onClick={onIndClick} aria-label="스크롤" tabIndex={indVisible ? 0 : -1}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${rot}deg)` }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="tas-empty">
            {hasKey ? '보유 자산 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
          </div>
        )}

        <div className="tas-notice">조회 전용 · 주문은 거래소 앱에서</div>
      </div>
    </div>
  );
}

function HoldingRow({ holding: h, value, price, usdKrw, onOpenChart }: { holding: SpotHolding; value: number; price: number; usdKrw: number; onOpenChart?: () => void }) {
  const { displayCurrency, isHideBalance } = useSettings();
  const cash = h.coin === 'USDT' || h.coin === 'USDC';
  const costOk = h.avgCost != null && h.costReliable === true;
  const pnlPct = costOk ? (price / (h.avgCost as number) - 1) * 100 : null;
  const pnlAmount = costOk ? (price - (h.avgCost as number)) * (h.available + h.frozen) : null;
  const logoUrl = getOfficialLogo(h.coin)
    || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${h.coin.toLowerCase()}.png`;
  const fmtMoney = (usdt: number) =>
    displayCurrency === 'KRW'
      ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
      : usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // 1줄 우측: 손익(부호). 원가 없으면 '—'(아래 평가금액과 중복 방지).
  const valStr = isHideBalance
    ? '••••'
    : pnlAmount != null
      ? `${pnlAmount >= 0 ? '+' : '-'}${fmtMoney(Math.abs(pnlAmount))}`
      : '—';
  // 2줄 좌측: 평가금액(수량 대신 — 코인끼리 비교 가능한 금액).
  const valueLine = isHideBalance ? '••••' : fmtMoney(value);

  return (
    <button type="button" className="tas-mkt-row" onClick={onOpenChart}>
      <span className="tas-mkt-logo">
        <CoinLogo symbol={h.coin} logoUrl={logoUrl} style={{ width: '100%', height: '100%', borderRadius: '999px', objectFit: 'cover' }} color={coinColor(h.coin)} />
      </span>
      <strong className="tas-mkt-sym">{h.coin}</strong>
      <span className="tas-mkt-pnlval">{valStr}</span>
      <span className="tas-mkt-amount">{valueLine}</span>
      <span className={`tas-mkt-roe-spot ${pnlPct != null ? (pnlPct >= 0 ? 'up' : 'down') : 'na'}`}>
        {pnlPct != null
          ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`
          : cash ? '' : '원가 조회불가'}
      </span>
    </button>
  );
}
