import { useEffect, useState } from 'react';
import { getOfficialLogo } from '../../../shared/utils/coinFormatters';

// 사이드바 자산(선물/현물) 로드 스켈레톤 — 모바일 TradeAccountSummary 패턴
export function SidebarAssetSkeleton() {
  return (
    <div className="assets-scroll">
      <div className="tas-hero">
        <span className="tas-hero-label">총자산</span>
        <div className="tas-hero-row">
          <span className="tas-hero-val tas-hero-skeleton skeleton-shimmer" aria-label="불러오는 중" />
        </div>
        <span className="tas-hero-approx tas-hero-approx-skeleton skeleton-shimmer" aria-hidden />
      </div>
      <div className="view-group">
        <div className="tas-divider" />
        <div className="tas-mkt-list">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tas-mkt-row tas-mkt-skel">
              <span className="tas-mkt-logo skeleton-shimmer" />
              <span className="sk-bar sk-sym skeleton-shimmer" />
              <span className="sk-bar sk-amt skeleton-shimmer" />
              <span className="sk-bar sk-roe skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// 차트 헤더 코인 로고 — 신뢰도 높은 소스(공식 → 백엔드 gecko맵)만 사용. 없으면 바로 글자(2글자).
// 404로 엑박 깜빡이던 CDN 후보는 제거. 드물게 url이 죽으면 onError로 글자 폴백.
export function HeaderLogo({ base, logoUrl }: { base: string; logoUrl?: string }) {
  const url = getOfficialLogo(base) || logoUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  return (
    <span className="sh-coin-logo">
      {url && !failed
        ? <img src={url} alt={base} onError={() => setFailed(true)} />
        : <span className="sh-coin-logo-fallback">{base.slice(0, 2)}</span>}
    </span>
  );
}

// 차트 헤더 정보 스켈레톤 바 (값 도착 전, skeleton-shimmer 재사용)
export function HdSk({ w = 56, h = 13 }: { w?: number; h?: number }) {
  return <span className="hd-sk skeleton-shimmer" style={{ width: w, height: h }} />;
}

// 드롭다운 접힘 그룹 헤더의 셰브론
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
