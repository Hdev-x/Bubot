// 현물 매수평균가 직접 입력 바텀시트 — 거래소에서 원가를 못 받아온 자산의 평단을 사용자가 입력.
// 하단에서 올라오는 시트(.ob-depth-overlay/sheet 애니메이션 재사용). 저장/삭제 시 onSaved로 목록 갱신.
import { useState } from 'react';
import type { SpotHolding } from '../../../../api/server/spotTradeApi';
import { saveSpotManualCost, deleteSpotManualCost } from '../../../../api/server/spotTradeApi';
import './trade.css';

function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const dec = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

export default function SpotCostSheet({
  holding: h,
  price,
  exchange = 'BITGET',
  onClose,
  onSaved,
}: {
  holding: SpotHolding;
  price: number;
  exchange?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isManual = h.avgCost != null && h.costReliable === true && h.costSource === 'manual';
  const [draft, setDraft] = useState(isManual ? String(h.avgCost) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const v = parseFloat(draft.trim());
    if (!Number.isFinite(v) || v <= 0) return;
    setBusy(true);
    try {
      await saveSpotManualCost(h.coin, v, exchange);
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deleteSpotManualCost(h.coin, exchange);
      onSaved();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ob-depth-overlay" data-ptr-exclude="true" onClick={onClose}>
      <div className="ob-depth-sheet" onClick={(e) => e.stopPropagation()}>
        <h4 className="ob-depth-title">{h.coin} 매수평균가 입력</h4>
        <div className="spot-cost-body">
          <p className="spot-cost-hint">
            거래소에서 원가를 못 받아온 자산이에요. 매수평균가를 입력하면 손익·수익률이 계산돼요.
            {price > 0 && (
              <>
                {' '}현재가 <b>{fmtPrice(price)}</b>
              </>
            )}
          </p>
          <label className="spot-cost-field">
            <span>매수평균가 (USDT)</span>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={draft}
              placeholder={fmtPrice(price)}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
            />
          </label>
          <div className="spot-cost-actions">
            {isManual && (
              <button type="button" className="spot-cost-del" onClick={remove} disabled={busy}>
                삭제
              </button>
            )}
            <button
              type="button"
              className="spot-cost-save"
              onClick={save}
              disabled={busy}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
