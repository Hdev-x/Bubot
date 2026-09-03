import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { useMainTrade } from '../../../hooks/account/useMainTrade';
import { useDelayedReady } from '../../../hooks/ui/useDelayedReady';
import { useSpotValueUsdt } from '../../../hooks/account/useSpotValueUsdt';
import { TotalAssetHero } from '../components/TotalAssetHero';
import { fetchUsdKrwRate } from '../../../api/exchange/exchangeRate';
import { useCurrency, currencyLabel } from '../../../shared/contexts/CurrencyContext';
import { useRealtimePrices } from '../../../hooks/market/useRealtimePrices';
import type { BotState } from '../../../shared/types/bot';
import ApiKeyManager from '../components/ApiKeyManager';
import PullToRefresh from '../components/PullToRefresh';

type AssetTab = 'overview' | 'futures' | 'api-keys';

// Futures 탭은 임시 숨김(현재 빈 화면) — overview/API만 노출
const tabs: { id: AssetTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'api-keys', label: 'API' },
];

const REFRESH_MS = 10_000;

function formatPrice(price: number, decimals = 2) {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// 통화 전환 버튼(거래탭과 동일) — 라벨 + 전환(⇄) 아이콘, 클릭하면 USDT↔원 토글
function CurrencyToggleBtn({ displayCurrency, setDisplayCurrency }: { displayCurrency: 'USDT' | 'KRW'; setDisplayCurrency: (v: 'USDT' | 'KRW') => void }) {
  return (
    <button
      type="button"
      aria-label="통화 전환"
      onClick={() => setDisplayCurrency(displayCurrency === 'USDT' ? 'KRW' : 'USDT')}
      style={{ cursor: 'pointer', fontSize: '16px', fontWeight: 600, color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: 0 }}
    >
      {currencyLabel(displayCurrency)}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 20 7 16 11" />
        <line x1="20" y1="7" x2="5" y2="7" />
        <polyline points="8 21 4 17 8 13" />
        <line x1="4" y1="17" x2="19" y2="17" />
      </svg>
    </button>
  );
}

function formatAssetPrice(price: number) {
  if (price > 0 && price < 1) return formatPrice(price, 4);
  return formatPrice(price, 1);
}




// ── 개요 패널 ───────────────────────────────────────────────
interface OverviewPanelProps {
  data: BotState | null;
  usdKrw: number;
  realtimePrices: Record<string, number>;
  displayCurrency: 'USDT' | 'KRW';
  setDisplayCurrency: (val: 'USDT' | 'KRW') => void;
  fallbackEquity?: number | null; // 워커 오프라인 시 MAIN 직접조회 equity (총자산 폴백)
  spotValue?: number;             // 현물 평가(USDT) — 총자산에 합산(선물+봇 + 현물)
  spotPriced?: boolean;           // 현물 시세 준비 완료 — 스켈레톤 해제 게이트
}

function OverviewPanel({
  data,
  usdKrw,
  realtimePrices,
  displayCurrency,
  fallbackEquity,
  spotValue,
  spotPriced
}: OverviewPanelProps) {
  const { isHideBalance } = useCurrency();
  const balance = data?.balance ?? 0;
  const mainBalance = data?.mainBalance ?? 0;
  const walletBalance = mainBalance + balance;
  const pos = data?.position ?? null;
  
  // 미실현 손익 — 메인계정 실제 포지션(mainPositions) 단일 소스로 실시간 재계산.
  // (configs 기반 합산은 실제 포지션을 못 담아 누락되던 버그가 있어 폐기)
  const unrealizedUsdt = (data?.mainPositions ?? []).reduce((acc, p) => {
    const pPrice = realtimePrices[p.symbol] ?? data?.lastPrice[p.symbol] ?? p.entryPrice;
    return acc + (p.direction === 'long' ? 1 : -1) * (pPrice - p.entryPrice) * p.size;
  }, 0);

  // 총 순자산 (지갑 가용 잔고 + 본 계정 잔고 + 미실현 손익).
  // 워커 데이터 없으면(오프라인) MAIN 직접조회 equity로 폴백.
  const baseAsset = data ? walletBalance + unrealizedUsdt : (fallbackEquity ?? 0);
  const totalAsset = baseAsset + (spotValue ?? 0);
  // 선물(base) + 현물 시세 둘 다 도착한 뒤에만 표시(부분합 점프 방지). 1.5초 폴백.
  const ready = useDelayedReady(baseAsset > 0 && (spotPriced ?? false));

  const maskVal = (val: string) => (isHideBalance ? '••••' : val);
  const maskApprox = (val: number) => {
    if (isHideBalance) return displayCurrency === 'USDT' ? '≈ ••••원' : '≈ •••• USDT';
    if (displayCurrency === 'USDT') {
      const krwVal = Math.round(val * usdKrw);
      return `≈ ${krwVal.toLocaleString()}원`;
    } else {
      return `≈ ${formatPrice(val, 2)} USDT`;
    }
  };

  return (
    <>
      <section className="assets-summary overview">
        {/* 총자산 — 거래탭 디자인 공유(사이즈업 + 눈). 우측 시계=내역 */}
        <div className="asset-hero-wrap" style={{ marginBottom: '12px' }}>
          <TotalAssetHero
            totalUsdt={totalAsset}
            ready={ready}
            label="총자산"
            rightSlot={
              <button type="button" aria-label="내역" style={{ color: '#8e9197', display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </button>
            }
          />
        </div>
      </section>

      {/* 기존 자산/계정 세션 100% 유지 */}
      <section className="asset-section">
        <div className="asset-section-head">
          <div className="asset-subtabs">
            <button type="button" className="active">자산</button>
            <button type="button">계정</button>
          </div>
          <div className="asset-view-toggle">
            <button type="button">i</button>
            <button type="button" className="active">▰</button>
            <button type="button">◔</button>
          </div>
        </div>

        {/* 실제 USDT 상세 잔고 반영 */}
        <div className="asset-row">
          <span className="asset-coin-logo">₮</span>
          <div>
            <strong>USDT</strong>
            <span>테더</span>
          </div>
          <div>
            <strong>{maskVal(formatPrice(walletBalance, 8))}</strong>
            <span>{maskApprox(walletBalance)}</span>
          </div>
        </div>

        {/* 현재 활성 포지션이 있는 경우 자산 목록에 특별 동적 렌더링 */}
        {pos && (() => {
          const pPrice = realtimePrices[pos.symbol] ?? data?.lastPrice[pos.symbol] ?? pos.entryPrice;
          const posPnl = (pos.direction === 'long' ? 1 : -1) * (pPrice - pos.entryPrice) * pos.size;
          return (
            <div className="asset-row" style={{ borderTop: '1px solid #151515', marginTop: '12px', paddingTop: '12px' }}>
              <span className="asset-coin-logo" style={{ background: '#3182f6' }}>★</span>
              <div>
                <strong>{pos.symbol.replace('USDT', '')} 포지션</strong>
                <span className={posPnl >= 0 ? 'up' : 'down'} style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {pos.direction.toUpperCase()} ×20 ({posPnl >= 0 ? '+' : ''}{displayCurrency === 'USDT' ? `${formatPrice(posPnl, 2)} USDT` : `${Math.round(posPnl * usdKrw).toLocaleString()}원`})
                </span>
              </div>
              <div>
                <strong>{maskVal(formatPrice(pos.size, 2))} SOL</strong>
                <span>진입: {maskVal(formatPrice(pos.entryPrice, 2))}</span>
              </div>
            </div>
          );
        })()}
      </section>

      <div style={{ height: '120px' }} aria-hidden="true" />
    </>
  );
}

// ── 선물 패널 ───────────────────────────────────────────────
interface FuturesPanelProps {
  data: BotState | null;
  usdKrw: number;
  realtimePrices: Record<string, number>;
  displayCurrency: 'USDT' | 'KRW';
  setDisplayCurrency: (val: 'USDT' | 'KRW') => void;
}

function FuturesPanel({ data, usdKrw, realtimePrices, displayCurrency, setDisplayCurrency }: FuturesPanelProps) {
  const { isHideBalance, toggleHideBalance } = useCurrency();
  const balance = data?.balance ?? 0;
  const mainBalance = data?.mainBalance ?? 0;
  const walletBalance = mainBalance + balance;
  const pos = data?.position ?? null;
  const currentPrice = pos ? (realtimePrices[pos.symbol] ?? data?.lastPrice[pos.symbol] ?? pos.entryPrice) : null;

  // 미실현 손익 — 메인계정 실제 포지션(mainPositions) 단일 소스로 실시간 재계산.
  const unrealizedUsdt = (data?.mainPositions ?? []).reduce((acc, p) => {
    const pPrice = realtimePrices[p.symbol] ?? data?.lastPrice[p.symbol] ?? p.entryPrice;
    return acc + (p.direction === 'long' ? 1 : -1) * (pPrice - p.entryPrice) * p.size;
  }, 0);

  // 개별(첫번째) 포지션 표시용 미실현 수익률
  const unrealizedPct = pos && currentPrice
    ? (pos.direction === 'long' ? 1 : -1) * (currentPrice - pos.entryPrice) / pos.entryPrice * 100 * 20
    : 0;

  const totalFuturesAsset = walletBalance + unrealizedUsdt;

  const maskVal = (val: string) => (isHideBalance ? '••••' : val);
  const maskApprox = (val: number) => {
    if (isHideBalance) return displayCurrency === 'USDT' ? '≈ ••••원' : '≈ •••• USDT';
    if (displayCurrency === 'USDT') {
      const krwVal = Math.round(val * usdKrw);
      return `≈ ${krwVal.toLocaleString()}원`;
    } else {
      return `≈ ${formatPrice(val, 2)} USDT`;
    }
  };

  return (
    <>
      <section className="assets-summary">
        {/* 기존 선물 타입 탭바 보존 */}
        <div className="futures-type-tabs">
          <button type="button" className="active">USDT-M 선물</button>
          <button type="button">Coin-M 선물</button>
          <button type="button">USDC-M 선물</button>
        </div>

        <div className="summary-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Total assets</span>
            <button 
              type="button" 
              onClick={toggleHideBalance}
              style={{ background: 'none', border: 'none', color: '#8e9197', padding: '0 4px', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
            >
              {isHideBalance ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <button type="button" style={{ color: '#8e9197', display: 'flex', alignItems: 'center', background: 'none', border: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
        </div>

        {/* 실시간 연동 평가 잔고 */}
        <div className="asset-balance" style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <strong style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '-0.5px', color: '#fff', lineHeight: 1.1 }}>
            {maskVal(displayCurrency === 'USDT' ? formatAssetPrice(totalFuturesAsset) : Math.round(totalFuturesAsset * usdKrw).toLocaleString())}
          </strong>
          <CurrencyToggleBtn displayCurrency={displayCurrency} setDisplayCurrency={setDisplayCurrency} />
        </div>
        <p className="approx" style={{ fontSize: '13px', color: '#8b95a1', marginTop: '6px' }}>
          {maskApprox(totalFuturesAsset)}
        </p>
        
        {/* 미실현 손익률 및 금액 표시 - 시안 1 스타일 */}
        <div className="futures-today-pnl-link" style={{ marginTop: '14px', display: 'flex', alignItems: 'center' }}>
          <span style={{ color: '#8e9197', fontSize: '13px' }}>Today's PnL</span>
          <span className={unrealizedUsdt >= 0 ? 'up' : 'down'} style={{ fontSize: '13px', fontWeight: 'bold', marginLeft: '8px' }}>
            {unrealizedUsdt >= 0 ? '+' : ''}{maskVal(displayCurrency === 'USDT' ? `${formatPrice(unrealizedUsdt, 2)} USDT` : `${Math.round(unrealizedUsdt * usdKrw).toLocaleString()}원`)}
          </span>
          <span style={{ color: '#8e9197', fontSize: '12px', marginLeft: '4px' }}>›</span>
        </div>

        {/* 실제 지갑 잔고 및 미실현 손익 매핑 - 2열 그리드 디자인 최적화 */}
        <div className="asset-metrics" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '16px' }}>
          <div>
            <span style={{ color: '#8e9197', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Wallet balance</span>
            <strong style={{ color: '#fff', fontSize: '15px' }}>{maskVal(formatPrice(walletBalance, 4))} USDT</strong>
            <p style={{ color: '#58606c', fontSize: '11px', margin: '2px 0 0' }}>{maskApprox(walletBalance)}</p>
          </div>
          <div>
            <span style={{ color: '#8e9197', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Unrealized PnL</span>
            <strong className={unrealizedUsdt >= 0 ? 'up' : 'down'} style={{ fontSize: '15px' }}>
              {maskVal((unrealizedUsdt >= 0 ? '+' : '') + (displayCurrency === 'USDT' ? `${formatPrice(unrealizedUsdt, 2)} USDT` : `${Math.round(unrealizedUsdt * usdKrw).toLocaleString()}원`))}
            </strong>
            <p style={{ color: '#58606c', fontSize: '11px', margin: '2px 0 0' }}>
              {displayCurrency === 'USDT' ? maskApprox(unrealizedUsdt) : `≈ ${formatPrice(unrealizedUsdt, 2)} USDT`}
            </p>
          </div>
        </div>
      </section>

      {/* 기존 선물 상세 자산/자동예치 세션 보존 */}
      <section className="asset-section">
        <div className="asset-section-head">
          <h2>Assets</h2>
          <div className="asset-tools" style={{ display: 'flex', gap: '16px', fontSize: '20px' }}>
            <span>⌕</span>
            <span>☷</span>
          </div>
        </div>

        {/* 유휴 자산 자동 예치 로우 - iOS 토글 스위치 적용 */}
        <div className="auto-earn-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="auto-earn-icon" style={{ fontSize: '18px', color: '#00c8df' }}>⟳</span>
            <strong style={{ fontSize: '14px', color: '#fff', fontWeight: '500' }}>Auto Earn on idle funds</strong>
          </div>
          <label className="ios-switch" style={{ display: 'inline-block', position: 'relative', width: '42px', height: '24px' }}>
            <input type="checkbox" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
            <span className="ios-slider"></span>
          </label>
        </div>

        {/* 가용 선물 USDT 자산 노출 */}
        <div className="asset-row">
          <span className="asset-coin-logo">₮</span>
          <div>
            <strong>USDT</strong>
            <span>USDT Perpetual</span>
          </div>
          <div>
            <strong>{maskVal(formatPrice(walletBalance, 8))}</strong>
            <span>{maskApprox(walletBalance)}</span>
          </div>
        </div>

        {/* 선물 포지션이 살아 있을 경우, 하단에 포지션 정보 카드 표시 */}
        {pos && (
          <div className="futures-active-position-detail" style={{
            background: 'rgba(49, 130, 246, 0.04)',
            border: '1px solid rgba(49, 130, 246, 0.15)',
            borderRadius: '12px',
            padding: '14px',
            marginTop: '16px'
          }}>
            <div className="pos-detail-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span className={`dir-tag ${pos.direction}`} style={{
                background: pos.direction === 'long' ? '#0ecb81' : '#f6465d',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 6px',
                borderRadius: '4px'
              }}>{pos.direction.toUpperCase()}</span>
              <strong style={{ color: '#fff', fontSize: '14px' }}>{pos.symbol} 무기한 x20</strong>
            </div>
            <div className="pos-detail-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: '12px' }}>
              <div className="detail-item">
                <span>진입 가격</span>
                <strong>{maskVal(formatPrice(pos.entryPrice, 4))}</strong>
              </div>
              <div className="detail-item">
                <span>현재 가격</span>
                <strong>{currentPrice ? maskVal(formatPrice(currentPrice, 4)) : '—'}</strong>
              </div>
              <div className="detail-item">
                <span>계약 크기</span>
                <strong>{maskVal(pos.size.toString())} SOL</strong>
              </div>
              <div className="detail-item">
                <span>미실현 PNL</span>
                <strong className={unrealizedPct >= 0 ? 'up' : 'down'}>
                  {unrealizedPct >= 0 ? '+' : ''}{maskVal(unrealizedPct.toFixed(2))}%
                </strong>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────
export default function AssetsPage({ active = true, onTabBar }: { active?: boolean; onTabBar?: (p: { x: number; y: number } | null) => void }) {
  const [activeTab, setActiveTab] = useState<AssetTab>('overview');

  // 활성 탭 위치를 App에 보고 — App의 공유 인디케이터가 그 자리로 슬라이드(거래↔자산 공유)
  const tabsNavRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const nav = tabsNavRef.current;
    if (!nav) return;
    const btn = nav.querySelector(`button[data-tab="${activeTab}"]`) as HTMLElement | null;
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    if (br.width === 0) return;
    onTabBar?.({ x: br.left + br.width / 2 - 11, y: nav.getBoundingClientRect().bottom - 6 });
  }, [activeTab, active, onTabBar]);
  const data: BotState | null = null;
  const [loading, setLoading] = useState(false);
  const { displayCurrency, setDisplayCurrency } = useCurrency();
  const [usdKrw, setUsdKrw] = useState<number>(1380);
  const activeSymbols: string[] = [];
  const realtimePrices = useRealtimePrices(active ? activeSymbols : []);
  // 워커 데이터 없으면 MAIN 직접조회로 총자산 폴백(워커 오프라인에도 표시)
  const { data: directMain } = useMainTrade(active && !data);
  const fallbackEquity = directMain.hasKey ? directMain.equity : null;
  // 현물 평가(USDT) — 총자산에 합산(선물+봇 + 현물). 워커 연결과 무관.
  const spot = useSpotValueUsdt(active);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const nextUsdKrw = await fetchUsdKrwRate(1380);
    setUsdKrw(nextUsdKrw);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!active) return; // 자산 화면 밖이면 워커 상태 폴링 중단
    fetchStatus();
    const intervalId = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [active, fetchStatus]);

  return (
    <main className="assets-page">
      {/* 탭바는 '개요', '선물' 두 가지만 활성화되도록 필터링 */}
      <nav ref={tabsNavRef} className="assets-top-tabs has-slide-indicator" aria-label="자산 분류" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#000' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {loading && (
          <span style={{
            position: 'absolute',
            right: '16px',
            bottom: '16px',
            width: '12px',
            height: '12px',
            border: '2px solid rgba(255,255,255,0.2)',
            borderTopColor: '#3182f6',
            borderRadius: '50%',
            animation: 'asset-spin 0.8s linear infinite'
          }} />
        )}
      </nav>

      <PullToRefresh onRefresh={fetchStatus}>
        {/* 탭 전환 시 페이드+슬라이드 — key가 바뀌며 재마운트돼 애니메이션 재생 */}
        <div key={activeTab} className="assets-tab-pane">
        {activeTab === 'overview' && (
          <OverviewPanel
            data={data}
            usdKrw={usdKrw}
            realtimePrices={realtimePrices}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
            fallbackEquity={fallbackEquity}
            spotValue={spot.value}
            spotPriced={spot.priced}
          />
        )}
        {activeTab === 'futures' && (
          <FuturesPanel
            data={data}
            usdKrw={usdKrw}
            realtimePrices={realtimePrices}
            displayCurrency={displayCurrency}
            setDisplayCurrency={setDisplayCurrency}
          />
        )}
        {activeTab === 'api-keys' && (
          <div style={{ padding: '0 16px' }}>
            <ApiKeyManager />
          </div>
        )}
        </div>
      </PullToRefresh>
    </main>
  );
}
