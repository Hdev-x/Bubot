import React from 'react';

export function Stepper({ label, value, unit, step, min, max, onChange, format }: {
  label: string; value: number; unit: string; step: number;
  min: number; max: number; onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : `${value}${unit}`;
  return (
    <div className="st-stepper-row">
      <span className="st-stepper-label">{label}</span>
      <div className="st-stepper">
        <button onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))}>−</button>
        <span>{display}</span>
        <button onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))}>+</button>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked?: boolean; onChange: () => void; label: string }) {
  return (
    <div className="st-toggle-row" onClick={onChange}>
      <span className="st-toggle-label">{label}</span>
      <div className={`st-toggle-track ${checked ? 'on' : 'off'}`}>
        <div className="st-toggle-thumb" />
      </div>
    </div>
  );
}

export function evColor(ev: number) {
  if (ev >= 0.3) return '#0ecb81';
  if (ev >= 0.05) return '#f0b90b';
  return '#f6465d';
}

export function pctColor(pct: number, goodThreshold = 60) {
  return pct >= goodThreshold ? '#0ecb81' : '#e8e9ed';
}
