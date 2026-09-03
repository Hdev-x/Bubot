// H-R50 페이퍼 실증 현황 패널 (admin 모니터링용, 조회 전용) — 웹 전략 섹션·모바일 전략탭 공용.
// 데이터: /api/paper/account (잔고·peak·포지션) + /api/user/trades (체결기록, tags.paper=true만)
//        + 워커 스냅샷 paperWaiting (진입대기, admin 전용 — 실패 시 생략).
// 종목명 탭 → onSelectSymbol(호스트가 차트로 연결).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPaperAccount, type PaperAccount } from '../api/paperApi';
import { fetchUserTrades, type UserTrade } from '../api/userTradeApi';
import { fetchPaperWaiting, type PaperWaitingSetup } from '../api/adminApi';

const POLL_MS = 10_000;

// 워커 F3 리스크 엔진과 동일 임계값 (표시 전용)
function riskStage(dd: number): { label: string; cls: string } {
  if (dd >= 0.45) return { label: 'KS -45%', cls: 'wps-badge-kill' };
  if (dd >= 0.30) return { label: '감속 ¼', cls: 'wps-badge-warn' };
  if (dd >= 0.15) return { label: '감속 ½', cls: 'wps-badge-warn' };
  return { label: '정상 1%', cls: 'wps-badge-ok' };
}

function fmtUsdt(v: number): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPx(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toPrecision(4);
}
function fmtTime(epochSec: number): string {
  if (!epochSec) return '-';
  const d = new Date(epochSec * 1000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function shortPattern(name?: string): string {
  return (name ?? '').replace(/^(Bullish|Bearish)\s+/, '').replace(/\s*\(Emerging\)/, '');
}
const OUTCOME_LABEL: Record<string, string> = {
  tp: 'TP2', tp1: 'TP1', tp2: 'TP2', sl1: 'SL', sl2: 'SL2', sl3: 'SL3', timeout: '만료', stopped: '정리',
};

export function PaperStatusPanel({ active, onSelectSymbol }: {
  active: boolean;
  onSelectSymbol?: (symbol: string) => void; // 종목명 탭 → 차트 연결(호스트가 마켓/거래소 지정)
}) {
  const [acc, setAcc] = useState<PaperAccount | null>(null);
  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [waiting, setWaiting] = useState<PaperWaitingSetup[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const [a, t, w] = await Promise.all([fetchPaperAccount(), fetchUserTrades(200), fetchPaperWaiting()]);
    setAcc(a);
    setTrades(t.filter(tr => tr.tags?.paper === true));
    setWaiting(w);
    setLoadedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [active, load]);

  // 종목명 렌더 — onSelectSymbol 있으면 클릭 가능(차트 연결)
  const Sym = useCallback(({ symbol }: { symbol: string }) => (
    onSelectSymbol
      ? <button type="button" className="wps-sym wps-sym-link" onClick={() => onSelectSymbol(symbol)}>{symbol.replace('USDT', '')}</button>
      : <span className="wps-sym">{symbol.replace('USDT', '')}</span>
  ), [onSelectSymbol]);

  const stat = useMemo(() => {
    if (!acc) return null;
    const marginSum = acc.positions.reduce((s, p) => s + p.margin, 0);
    const equity = acc.balance + marginSum;
    const peak = Math.max(acc.peakEquity, equity);
    const dd = peak > 0 ? Math.max(0, 1 - equity / peak) : 0;
    const realized = trades.reduce((s, t) => s + t.pnlUsdt, 0);
    // 매매 수 = 종결 행(TP1 부분청산 제외) — F5 기준 100매매 진행률
    const closedCount = trades.filter(t => t.outcome !== 'tp1').length;
    return { equity, dd, realized, closedCount, stage: riskStage(dd) };
  }, [acc, trades]);

  return (
    <div className="wps-panel">
      <div className="wps-head">
        <span className="wps-title">H-R50 페이퍼 실증</span>
        <span className="wps-updated">{loadedAt ? `${new Date(loadedAt).toLocaleTimeString('ko-KR', { hour12: false })} 갱신` : '로딩…'}</span>
      </div>

      {stat && acc && (
        <>
          <div className="wps-stats">
            <div className="wps-stat">
              <span className="wps-stat-k">가용 잔고</span>
              <span className="wps-stat-v">{fmtUsdt(acc.balance)} U</span>
            </div>
            <div className="wps-stat">
              <span className="wps-stat-k">실현 에쿼티 <em className={`wps-badge ${stat.stage.cls}`}>{stat.stage.label}</em></span>
              <span className="wps-stat-v">{fmtUsdt(stat.equity)} U <em className="wps-dd">DD {(stat.dd * 100).toFixed(1)}%</em></span>
            </div>
            <div className="wps-stat">
              <span className="wps-stat-k">누적 실현손익</span>
              <span className={`wps-stat-v ${stat.realized >= 0 ? 'up' : 'down'}`}>{stat.realized >= 0 ? '+' : ''}{fmtUsdt(stat.realized)} U</span>
            </div>
            <div className="wps-stat">
              <span className="wps-stat-k">매매 수 (F5 100매매)</span>
              <span className="wps-stat-v">{stat.closedCount} / 100</span>
            </div>
          </div>

          <div className="wps-sec-title">진입대기 {waiting.length > 0 && `(${waiting.length})`}</div>
          {waiting.length === 0 ? (
            <div className="wps-empty">체결 대기 중인 셋업 없음</div>
          ) : (
            waiting.map((w, i) => (
              <div className="wps-trade" key={`${w.symbol}-${w.signalTime}-${i}`}>
                <div className="wps-row">
                  <span className={`wps-dir ${w.direction}`}>{w.direction === 'long' ? 'L' : 'S'}</span>
                  <Sym symbol={w.symbol} />
                  <span className="wps-cell">진입 {fmtPx(w.entryPrice)}</span>
                  <span className="wps-cell wps-right">SL {fmtPx(w.slPrice)}</span>
                </div>
                <div className="wps-meta">
                  {w.patternName && <span>{shortPattern(w.patternName)}</span>}
                  {w.regimeAtArm && <span>레짐 {w.regimeAtArm}</span>}
                  <span>TP {fmtPx(w.tp1Price)} / {fmtPx(w.tp2Price)}</span>
                  <span>{fmtTime(w.signalTime)}</span>
                </div>
              </div>
            ))
          )}

          <div className="wps-sec-title">보유 포지션 {acc.positions.length > 0 && `(${acc.positions.length}/4)`}</div>
          {acc.positions.length === 0 ? (
            <div className="wps-empty">보유 포지션 없음</div>
          ) : (
            acc.positions.map(p => (
              <div className="wps-row" key={p.id}>
                <span className={`wps-dir ${p.direction}`}>{p.direction === 'long' ? 'L' : 'S'}</span>
                <Sym symbol={p.symbol} />
                <span className="wps-cell">@{fmtPx(p.entryPrice)}</span>
                <span className="wps-cell wps-right">{fmtUsdt(p.margin)} U</span>
              </div>
            ))
          )}

          <div className="wps-sec-title">체결 기록</div>
          {trades.length === 0 ? (
            <div className="wps-empty">아직 페이퍼 매매 없음 — 가동 대기</div>
          ) : (
            trades.map(t => (
              <div className="wps-trade" key={t.id}>
                <div className="wps-row">
                  <span className={`wps-dir ${t.direction}`}>{t.direction === 'long' ? 'L' : 'S'}</span>
                  <Sym symbol={t.symbol} />
                  <span className={`wps-outcome wps-outcome-${t.outcome === 'sl1' || t.outcome === 'sl2' ? 'sl' : t.outcome.startsWith('tp') ? 'tp' : 'etc'}`}>
                    {OUTCOME_LABEL[t.outcome] ?? t.outcome}
                  </span>
                  <span className={`wps-cell wps-right ${t.pnlUsdt >= 0 ? 'up' : 'down'}`}>
                    {t.pnlUsdt >= 0 ? '+' : ''}{fmtUsdt(t.pnlUsdt)} U
                  </span>
                </div>
                <div className="wps-meta">
                  {t.tags?.pattern && <span>{shortPattern(t.tags.pattern)}</span>}
                  {t.tags?.regimeAtArm && <span>레짐 {t.tags.regimeAtArm}{t.tags.regimeAtFill && t.tags.regimeAtFill !== t.tags.regimeAtArm ? `→${t.tags.regimeAtFill}` : ''}</span>}
                  {typeof t.tags?.slippagePct === 'number' && <span>슬립 {t.tags.slippagePct.toFixed(3)}%</span>}
                  {typeof t.tags?.riskMultiplier === 'number' && t.tags.riskMultiplier !== 1 && <span>감속 x{t.tags.riskMultiplier}</span>}
                  <span>{fmtTime(t.exitTime)}</span>
                </div>
              </div>
            ))
          )}
        </>
      )}
      {!stat && <div className="wps-empty">계좌 정보를 불러오는 중…</div>}
    </div>
  );
}
