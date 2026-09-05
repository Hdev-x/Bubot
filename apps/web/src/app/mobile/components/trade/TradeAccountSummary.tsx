// 트레이드 페이지 좌측 — 주문 티켓 대체 뷰어 패널 (read-only).
// 비트겟은 체결 제공 불가라 주문폼 대신 "총자산(지갑 디자인) + 포트폴리오(전체 포지션)"만 보여준다.
// 데이터는 useMainTrade 폴링 결과(MainTradeOverview)를 그대로 받는다 — 새 호출 없음.
// 통화/잔고숨김은 자산 탭과 동일하게 useSettings(CurrencyContext) 공유.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtAsset } from '../../../../shared/utils/coinFormatters';
import type { MainPosition } from '../../../../api/server/mainTradeApi';
import { useSettings, currencyLabel } from '../../../../shared/contexts/CurrencyContext';
import { useUsdKrw } from '../../../../hooks/market/useUsdKrw';
import { useDelayedReady } from '../../../../hooks/ui/useDelayedReady';
import { CoinLogo } from '../coin-list/CoinLogo';
import { getOfficialLogo, coinColor } from '../../../../shared/utils/coinFormatters';
import './trade.css';

// 자산 탭 총자산 표기와 동일 규칙 (1 미만 4자리, 그 외 1자리)

export default function TradeAccountSummary({
  equity,
  available,
  hasKey,
  positions,
  onOpenChart,
}: {
  equity: number;       // 총자산(잔고+미실현)
  available: number;    // 지갑 잔고(가용)
  hasKey: boolean;
  positions: MainPosition[]; // 보유 포지션 전체(포트폴리오)
  onOpenChart?: () => void;
}) {
  const { displayCurrency, setDisplayCurrency, isHideBalance } = useSettings();
  const usdKrw = useUsdKrw();
  const [walletExpanded, setWalletExpanded] = useState(false); // 총자산 아래 지갑잔고·미실현 펼치기

  // 포트폴리오 스크롤 표시 — 하단 아이콘 1개. more=▼, 맨 아래 도달 시 시계방향 회전→▲
  const listRef = useRef<HTMLDivElement>(null);
  const [indVisible, setIndVisible] = useState(false);
  // 회전: 아래=0°, 맨아래도달=180°. 0→180은 시계방향(▲로), 180→0은 반시계방향(▼로 되돌림)
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
  useEffect(() => { updateScroll(); }, [positions, updateScroll]);
  const onIndClick = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: atBottomRef.current ? 0 : el.scrollHeight, behavior: 'smooth' });
  };

  // 총자산(equity) 도착 전 잠깐 스켈레톤(0→값 점프 방지). 1.5초 폴백(빈 계정/키없음).
  const ready = useDelayedReady(equity > 0);

  const mask = (v: string) => (isHideBalance ? '••••' : v);
  const mainVal = !hasKey
    ? '—'
    : displayCurrency === 'USDT'
      ? fmtAsset(equity)
      : Math.round(equity * usdKrw).toLocaleString();
  // KRW 10억 이상이면 가격 자릿수↑로 ▼ hit area와 가로 경쟁 시작 — 22px → 20px로 축소.
  // 0~10억 미만: 22px / 10억 이상: 20px (100억까지 한 줄, 시각 ▼는 항상 안전)
  const krwTotal = displayCurrency === 'KRW' && hasKey ? equity * usdKrw : 0;
  const heroValSizeClass = krwTotal >= 1_000_000_000 ? ' tas-hero-val--compact' : '';
  const approx = !hasKey
    ? ''
    : displayCurrency === 'USDT'
      ? `≈ ${Math.round(equity * usdKrw).toLocaleString()}원`
      : `≈ ${equity.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`;

  // 지갑 잔고·미실현손익 — 통화 토글 연동
  const fmtCur = (usdt: number): string => {
    if (isHideBalance) return '••••';
    return displayCurrency === 'KRW'
      ? `${Math.round(usdt * usdKrw).toLocaleString()}원`
      : usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };
  // 반대 통화 근사치 (≈ ...)
  const approxCur = (usdt: number): string => {
    if (isHideBalance) return '≈ ••••';
    return displayCurrency === 'KRW'
      ? `≈ ${usdt.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT`
      : `≈ ${Math.round(usdt * usdKrw).toLocaleString()}원`;
  };
  const unrealizedTotal = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  const unrUp = unrealizedTotal >= 0;
  const unrStr = isHideBalance
    ? '••••'
    : `${unrUp ? '+' : '-'}${displayCurrency === 'KRW'
        ? `${Math.round(Math.abs(unrealizedTotal) * usdKrw).toLocaleString()}원`
        : Math.abs(unrealizedTotal).toFixed(2)}`;

  return (
    <div className="trade-account-summary">
      {/* 내용은 absolute로 띄워 좌측 컬럼이 그리드 행 높이를 키우지 않게 함
          → 패널 높이=호가창 높이로 고정되고 포트폴리오는 내부 스크롤 */}
      <div className="tas-inner">
      {/* 총자산 (지갑 디자인 축소판) */}
      <div className="tas-hero">
        <span className="tas-hero-label">총자산</span>
        <div className="tas-hero-row">
          {!ready ? (
            <span className="tas-hero-val tas-hero-skeleton skeleton-shimmer" aria-label="불러오는 중" />
          ) : (
            // 가격+통화토글을 하나의 버튼으로 묶음 — 가격 영역도 탭하면 통화 전환(모바일 hit area 확장)
            <button
              type="button"
              className="tas-hero-toggle"
              onClick={() => setDisplayCurrency(displayCurrency === 'USDT' ? 'KRW' : 'USDT')}
              aria-label="통화 전환"
            >
              <strong className={`tas-hero-val${heroValSizeClass}`}>{mask(mainVal)}</strong>
              <span className="tas-cur">
                {currencyLabel(displayCurrency)}
                <svg className="tas-cur-ico" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 20 7 16 11" />
                  <line x1="20" y1="7" x2="5" y2="7" />
                  <polyline points="8 21 4 17 8 13" />
                  <line x1="4" y1="17" x2="19" y2="17" />
                </svg>
              </span>
            </button>
          )}
          {/* 지갑 상세 펼치기 — 가격 옆 인라인. hit area는 ::before로 좌 50/상·하 10px 확장(시각 그대로 12×12) */}
          {hasKey && ready && (
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
        {!ready
          ? <span className="tas-hero-approx tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />
          : (hasKey && <span className="tas-hero-approx">{isHideBalance ? '≈ ••••' : approx}</span>)}
        {hasKey && ready && (
          <div className={`tas-wallet-wrap ${walletExpanded ? 'open' : ''}`}>
            <div className="tas-wallet-detail">
              <div className="tas-wallet-col">
                <span className="tas-wallet-k">지갑 잔고</span>
                <span className="tas-wallet-v">{fmtCur(available)}</span>
                <span className="tas-wallet-approx">{approxCur(available)}</span>
              </div>
              <div className="tas-wallet-col">
                <span className="tas-wallet-k">미실현 손익</span>
                <span className={`tas-wallet-v ${unrUp ? 'up' : 'down'}`}>{unrStr}</span>
                <span className="tas-wallet-approx">{approxCur(unrealizedTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 포트폴리오 — 보유 포지션 전체 */}
      <div className="tas-divider" />
      <div className="tas-pos-title">
        <span>포트폴리오</span>
        <span className="tas-sym">{positions.length}개</span>
      </div>

      {!ready ? (
        // 데이터 도착 전 — 포트폴리오도 스켈레톤(총자산과 함께 로딩)
        <div className="tas-pos-wrap">
          <div className="tas-pos-list">
            {[0, 1].map((i) => (
              <div key={i} className="tas-mkt-row tas-mkt-skel">
                <span className="tas-mkt-logo skeleton-shimmer" />
                <span className="sk-bar sk-sym skeleton-shimmer" />
                <span className="sk-bar sk-amt skeleton-shimmer" />
                <span className="sk-bar sk-roe skeleton-shimmer" />
              </div>
            ))}
          </div>
        </div>
      ) : positions.length > 0 ? (
        <div className="tas-pos-wrap">
          <div className="tas-pos-list" ref={listRef} onScroll={updateScroll}>
            {positions.map((p) => (
              <PositionMini key={p.symbol + p.direction} position={p} usdKrw={usdKrw} onOpenChart={onOpenChart} />
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
          {hasKey ? '보유 포지션 없음' : 'MAIN 키를 등록하면 표시됩니다.'}
        </div>
      )}

      {/* 비트겟 = 조회 전용 고지 */}
      <div className="tas-notice">조회 전용 · 주문은 거래소 앱에서</div>
      </div>
    </div>
  );
}

function PositionMini({ position: p, usdKrw, onOpenChart }: { position: MainPosition; usdKrw: number; onOpenChart?: () => void }) {
  const { displayCurrency, isHideBalance } = useSettings();
  const base = p.symbol.replace(/USDT$|USDC$/, '');
  const up = p.unrealizedPl >= 0;
  // ROE(증거금 기준) 근사 = 가격변화율 × 레버리지 × 방향
  const roe = p.entryPrice > 0
    ? ((p.markPrice - p.entryPrice) / p.entryPrice) * 100 * p.leverage * (p.direction === 'long' ? 1 : -1)
    : 0;
  const logoUrl = getOfficialLogo(base)
    || `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${base.toLowerCase()}.png`;
  // 미실현손익 — 통화 토글 연동(USDT/KRW). 부호는 별도 표기.
  const pnlAbs = displayCurrency === 'USDT'
    ? Math.abs(p.unrealizedPl).toFixed(2)
    : `${Math.round(Math.abs(p.unrealizedPl) * usdKrw).toLocaleString()}원`;
  const pnlStr = isHideBalance ? '••••' : `${up ? '+' : '-'}${pnlAbs}`;

  return (
    <button type="button" className="tas-mkt-row" onClick={onOpenChart}>
      <span className="tas-mkt-logo">
        <CoinLogo
          symbol={base}
          logoUrl={logoUrl}
          style={{ width: '100%', height: '100%', borderRadius: '999px', objectFit: 'cover' }}
          color={coinColor(base)}
        />
      </span>
      <strong className="tas-mkt-sym">{base}</strong>
      <span className="tas-mkt-pnlval">{pnlStr}</span>
      <span className="tas-mkt-badges">
        <span className={`tas-mkt-badge dir ${p.direction}`}>{p.direction === 'long' ? 'Long' : 'Short'}</span>
        <span className="tas-mkt-badge lev">{Math.round(p.leverage)}x</span>
      </span>
      <span className={`tas-mkt-roe ${up ? 'up' : 'down'}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(2)}%</span>
    </button>
  );
}
