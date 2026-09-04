import React from 'react';
import './coin-list.css';

export const DropdownFilter = ({ 
  isOpen, 
  onToggle, 
  label, 
  options, 
  selectedValue, 
  onSelect 
}: { 
  isOpen: boolean; 
  onToggle: () => void; 
  label: string;
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: any) => void;
}) => {
  const currentLabel = options.find(o => o.value === selectedValue)?.label || label;
  
  return (
    <div className="filter-dropdown-wrap">
      <button 
        className={`filter-chip ${isOpen ? 'open' : ''} ${selectedValue !== 'USDT' && selectedValue !== 'VOLUME' ? 'active' : ''}`}
        onClick={onToggle}
      >
        <span>{currentLabel}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '2px' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
            onClick={onToggle} 
          />
          <div className="filter-dropdown-menu">
            {options.map(opt => (
              <button 
                key={opt.value} 
                className={`filter-dropdown-item ${selectedValue === opt.value ? 'active' : ''}`}
                onClick={() => { onSelect(opt.value); onToggle(); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
