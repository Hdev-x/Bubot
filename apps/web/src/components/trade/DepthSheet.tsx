// 호가 단위(묶음) 선택 바텀시트 — 비트겟 Order book depth. 선물/현물 공유.
import type { DepthPrecision } from '../../api/bitgetMergeDepth';

type Option = { scale: DepthPrecision; label: string };

type Props = {
  open: boolean;
  options: Option[];
  current: DepthPrecision;
  onSelect: (scale: DepthPrecision) => void;
  onClose: () => void;
};

export default function DepthSheet({ open, options, current, onSelect, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="ob-depth-overlay" data-ptr-exclude="true" onClick={onClose}>
      <div className="ob-depth-sheet" onClick={(e) => e.stopPropagation()}>
        <h4 className="ob-depth-title">Order book depth</h4>
        {options.map((o) => (
          <button
            key={o.scale}
            type="button"
            className={`ob-depth-item${current === o.scale ? ' active' : ''}`}
            onClick={() => {
              onSelect(o.scale);
              onClose();
            }}
          >
            <span>{o.label}</span>
            {current === o.scale && <span className="ob-depth-check">✓</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
