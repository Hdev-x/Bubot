// 모의투자 분리형 주문 티켓 — 플로팅 미니창. 모바일 선물 주문폼(.futures-ticket) 마크업을 그대로 이식.
// 기능 배선: 레버리지 pill / 시장가·지정가(trade-select) / 증거금(Cost) / % / Open long·short. 나머지는 모바일과 동일 비주얼.
import { useRef, useState, useEffect, useCallback } from 'react';
import { usePersistentState } from '@web/hooks/ui/usePersistentState';
import { EXCHANGES, type ExchangeId } from '@web/constants/exchanges';
import { getOfficialLogo } from '@web/utils/coinFormatters';
import { snapFloat } from '@web/web/components/snapFloat';
import type { PaperOrderRaw } from '../../api/paperApi';

const LEVS = [5, 10, 20, 50, 75, 100]; // 레버리지 pill 클릭 시 순환
const PO_W = 280;     // 주문창 가로(.paper-order)
const FOOTER_H = 27;  // 하단 푸터 높이(26+보더) — 미니창이 침범 금지

export function WebPaperOrder({ symbol, isFutures, exchange, price, balance, orders, onSubmit, onCancel, onClose }: {
  symbol: string;
  isFutures: boolean;
  exchange: ExchangeId;
  price: number | null;
  balance: number;
  orders: PaperOrderRaw[];
  onSubmit: (type: 'market' | 'limit', direction: 'long' | 'short', marginUsdt: number, leverage: number, price: number) => Promise<void>;
  onCancel: (orderId: number) => void;
  onClose: () => void;
}) {
  const base = symbol.replace(/USDT$|USDC$/, '');
  const ex = EXCHANGES[exchange];
  const coinLogo = getOfficialLogo(base);
  const [pos, setPos] = usePersistentState<{ x: number; y: number }>('web_paper_order_pos', { x: 120, y: 140 });
  const [openClose, setOpenClose] = useState<'open' | 'close'>('open');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [lev, setLev] = useState(10);
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [typeHover, setTypeHover] = useState(false); // 시장가/지정가 버튼 hover 시 바뀔 모드 미리보기

  useEffect(() => { if (orderType === 'limit' && !limitPrice && price) setLimitPrice(String(price)); }, [orderType, price, limitPrice]);

  // 푸터/화면 밖만 안 넘게(사이드바는 따라가지 않음) — 폼 커짐·창 리사이즈 시 위치 보정.
  const orderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = orderRef.current;
    if (!el) return;
    const clamp = () => {
      const h = el.offsetHeight;
      setPos((p) => {
        const x = Math.max(0, Math.min(window.innerWidth - PO_W, p.x));
        const y = Math.max(0, Math.min(window.innerHeight - FOOTER_H - h, p.y));
        return x === p.x && y === p.y ? p : { x, y };
      });
    };
    clamp();
    const ro = new ResizeObserver(clamp);
    ro.observe(el);
    window.addEventListener('resize', clamp);
    return () => { ro.disconnect(); window.removeEventListener('resize', clamp); };
  }, [setPos]);

  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const h = orderRef.current?.offsetHeight ?? 400;
      const s = snapFloat(ev.clientX - dragRef.current.dx, ev.clientY - dragRef.current.dy, PO_W, h, orderRef.current); // 다른 미니창에 스냅
      const x = Math.max(0, Math.min(window.innerWidth - PO_W, s.x));
      const y = Math.max(0, Math.min(window.innerHeight - FOOTER_H - h, s.y)); // 푸터 위까지만
      setPos({ x, y });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y, setPos]);

  const m = Number(cost) || 0;
  const notional = m * lev;
  const isLimit = orderType === 'limit';
  const fillPrice = isLimit ? (Number(limitPrice) || 0) : (price ?? 0);
  const maxOpen = balance * lev;
  const cycleLev = () => setLev((v) => LEVS[(LEVS.indexOf(v) + 1) % LEVS.length] ?? 10);
  const setPct = (pct: number) => setCost(((balance * pct) / 100).toFixed(2));

  const submit = async (direction: 'long' | 'short') => {
    setErr(null);
    if (fillPrice <= 0) { setErr(isLimit ? '지정가를 입력하세요' : '현재가를 불러오는 중'); return; }
    if (m <= 0) { setErr('증거금을 입력하세요'); return; }
    if (m > balance) { setErr('잔고 부족'); return; }
    setBusy(true);
    try { await onSubmit(orderType, direction, m, lev, fillPrice); setCost(''); } catch (e) { setErr((e as Error)?.message || '주문 실패'); } finally { setBusy(false); }
  };

  return (
    <div className="paper-order" ref={orderRef} style={{ left: pos.x, top: pos.y }}>
      <div className="paper-order-head" onMouseDown={onDragStart}>
        <span className="paper-order-title">모의 주문</span>
        <button type="button" className="watch-hbtn" title="닫기" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      {/* 종목 헤더(한 줄) — 로고·종목·Perp(실시간 마켓 뱃지)·거래소 */}
      <div className="po-symhead">
        <span className="po-logo">
          {coinLogo ? <img src={coinLogo} alt="" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} /> : <span className="po-logo-fb">{base.slice(0, 2)}</span>}
        </span>
        <strong className="po-sym">{isFutures ? `${symbol}.P` : symbol}</strong>
        {isFutures && <span className="wm-badge">Perp</span>}
        <span className="po-ex" style={{ color: ex.color }}>
          <img src={ex.logo} alt="" aria-hidden="true" />{ex.label}
        </span>
      </div>
      <div className="paper-order-body">
        <form className="futures-ticket" onSubmit={(e) => e.preventDefault()}>
          <div className="trade-pills">
            <button type="button" className="pill-btn active">Cross</button>
            <button type="button" className="pill-btn" onClick={cycleLev} title="클릭하면 레버리지 변경">{lev}x</button>
            <button type="button" className="pill-btn shrink-s">S</button>
          </div>

          <div className="open-close-toggle">
            <button type="button" className={openClose === 'open' ? 'active' : ''} onClick={() => setOpenClose('open')}>Open</button>
            <button type="button" className={openClose === 'close' ? 'active' : ''} onClick={() => setOpenClose('close')}>Close</button>
          </div>

          {/* 좌측 시장가 토글(박스 밖) + 가격 입력 박스(가격 + USDT). 시장가 모드면 가격칸 잠김. */}
          <div className="price-line">
            {/* hover 시 바뀔 모드를 미리보기(라벨+테두리). showMarket이면 시장가 모양(흰 테두리) */}
            <button
              type="button"
              className={`bbo-button${(typeHover ? isLimit : !isLimit) ? ' active' : ''}`}
              onClick={() => { setOrderType((t) => (t === 'market' ? 'limit' : 'market')); setTypeHover(false); }}
              onMouseEnter={() => setTypeHover(true)}
              onMouseLeave={() => setTypeHover(false)}
            >{(typeHover ? isLimit : !isLimit) ? '시장가' : '지정가'}</button>
            <div className={`trade-input-wrapper${isLimit ? '' : ' locked'}`}>
              <input
                className="val-input"
                value={isLimit ? limitPrice : (price ? String(price) : '')}
                onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="지정가" inputMode="decimal" disabled={!isLimit} aria-label="가격"
              />
              <span className="currency-selector">USDT</span>
            </div>
          </div>

          <div className="trade-input-wrapper">
            <span className="input-label">Cost</span>
            <input className="val-input" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" inputMode="decimal" aria-label="Cost" />
            <span className="currency-selector">USDT</span>
          </div>

          <div className="percent-row">
            {[25, 50, 75, 100].map((p) => (
              <button type="button" key={p} className="pct-btn" onClick={() => setPct(p)}>{p}%</button>
            ))}
          </div>

          <label className="trade-checkbox-label">
            <input type="checkbox" className="custom-checkbox" />
            <span className="checkbox-text">TP/SL</span>
          </label>

          <div className="balance-lines">
            <div className="balance-line">
              <span className="label">Available</span>
              <span className="value">{balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT</span>
            </div>
            <div className="balance-line">
              <span className="label">Max open</span>
              <span className="value">{maxOpen.toLocaleString(undefined, { maximumFractionDigits: 4 })} USDT</span>
            </div>
          </div>

          {err && <div className="paper-order-err">{err}</div>}

          <button type="button" className="long-button" disabled={busy} onClick={() => submit('long')}>
            <strong>{busy ? '처리 중…' : 'Open long'}</strong>
            <span>{notional > 0 ? notional.toFixed(2) : '0.00'} USDT</span>
          </button>

          <button type="button" className="short-button" disabled={busy} onClick={() => submit('short')}>
            <strong>{busy ? '처리 중…' : 'Open short'}</strong>
            <span>{notional > 0 ? notional.toFixed(2) : '0.00'} USDT</span>
          </button>
        </form>

        {orders.length > 0 && (
          <div className="paper-open-orders">
            <div className="paper-oo-title">미체결 지정가 {orders.length}</div>
            {orders.map((o) => (
              <div key={o.id} className="paper-oo-row">
                <span className={`paper-oo-dir ${o.direction}`}>{o.direction === 'long' ? '롱' : '숏'}</span>
                <span className="paper-oo-sym">{o.symbol.replace(/USDT$|USDC$/, '')}</span>
                <span className="paper-oo-px">@ {o.limitPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                <button type="button" className="paper-oo-cancel" title="취소" onClick={() => onCancel(o.id)}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
