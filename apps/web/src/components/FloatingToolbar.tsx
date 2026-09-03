import React, { useState, useEffect } from 'react';
import type { DrawingManager } from '../drawing';
import DrawingSettingsSheet from './DrawingSettingsSheet';

type Props = {
  manager: DrawingManager | null;
  selectedDrawingId: string | null;
  onClose: () => void;
};

// Standard TV-like color palette
const COLOR_PALETTE = [
  ['#ffffff', '#e0e0e0', '#b3b3b3', '#808080', '#4d4d4d', '#262626', '#1a1a1a', '#000000'],
  ['#ef5350', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0', '#e91e63'],
  ['#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2ebf2', '#bbdefb', '#e1bee7', '#f8bbd0'],
  ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#d81b60'],
  ['#b71c1c', '#e65100', '#f57f17', '#1b5e20', '#006064', '#0d47a1', '#4a148c', '#880e4f'],
];

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export default function FloatingToolbar({ manager, selectedDrawingId, onClose }: Props) {
  const [style, setStyle] = useState<any>(null);
  const [options, setOptions] = useState<any>(null);
  const [activePopover, setActivePopover] = useState<'color' | 'width' | 'more' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Custom slider state
  const [opacity, setOpacity] = useState(40); // 0-100
  
  useEffect(() => {
    if (!manager || !selectedDrawingId) {
      setStyle(null);
      setOptions(null);
      setActivePopover(null);
      return;
    }
    
    const drawing = manager.getDrawing(selectedDrawingId);
    if (!drawing) {
      setStyle(null);
      return;
    }

    setStyle(drawing.style || {});
    setOptions(drawing.options || {});
    
    // Parse opacity from fillColor if present
    if (drawing.style?.fillColor) {
      const match = drawing.style.fillColor.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
      if (match) {
        setOpacity(Math.round(parseFloat(match[1]) * 100));
      }
    }
  }, [manager, selectedDrawingId]);

  if (!manager || !selectedDrawingId || !style) return null;

  const handleUpdateStyle = (newStyle: any) => {
    const drawing = manager.getDrawing(selectedDrawingId);
    if (drawing) {
      drawing.updateStyle(newStyle);
      setStyle({ ...style, ...newStyle });
    }
  };

  const handleUpdateOptions = (newOptions: any) => {
    const drawing = manager.getDrawing(selectedDrawingId);
    if (drawing) {
      drawing.updateOptions(newOptions);
      setOptions({ ...options, ...newOptions });
    }
  };

  const handleDelete = () => {
    manager.removeDrawing(selectedDrawingId);
    onClose();
  };

  const setLineColor = (hex: string) => {
    // We also set labelColor to match
    handleUpdateStyle({ lineColor: hex, labelColor: hex });
  };

  const setFillColor = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
      handleUpdateStyle({ fillColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity / 100})` });
    }
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setOpacity(val);
    
    // update current fill color with new opacity
    if (style.fillColor) {
      const rgbMatch = style.fillColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        handleUpdateStyle({ fillColor: `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${val / 100})` });
      }
    }
  };

  const isMoreOpen = activePopover === 'more';

  return (
    <>
      {/* Background click to close popovers */}
      {activePopover && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} 
          onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
          onPointerDown={(e) => { e.stopPropagation(); setActivePopover(null); }}
        />
      )}

      {/* Main Floating Toolbar */}
      <div 
        className="floating-toolbar"
        style={{
          position: 'absolute',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          backgroundColor: '#1e222d',
          border: '1px solid #2b3139',
          borderRadius: '24px',
          padding: '0px 8px',
          display: 'flex',
          alignItems: 'center',
          height: '48px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          pointerEvents: 'auto',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (6 dots) */}
        <button className="tb-btn" style={{ cursor: 'grab' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8" r="1" fill="currentColor"/>
            <circle cx="15" cy="8" r="1" fill="currentColor"/>
            <circle cx="9" cy="12" r="1" fill="currentColor"/>
            <circle cx="15" cy="12" r="1" fill="currentColor"/>
            <circle cx="9" cy="16" r="1" fill="currentColor"/>
            <circle cx="15" cy="16" r="1" fill="currentColor"/>
          </svg>
        </button>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#2b3139', margin: '0 4px' }} />

        {/* Settings / Pencil (Color) */}
        <div style={{ position: 'relative' }}>
          <button className={`tb-btn ${activePopover === 'color' ? 'active' : ''}`} onClick={() => setActivePopover(activePopover === 'color' ? null : 'color')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          
          {/* Color Popover */}
          {activePopover === 'color' && (
            <div style={{
              position: 'absolute',
              top: '56px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#1e222d',
              border: '1px solid #2b3139',
              borderRadius: '8px',
              padding: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              width: '260px',
              cursor: 'default'
            }}>
              {/* Color Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {COLOR_PALETTE.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
                    {row.map(color => (
                      <div
                        key={color}
                        onClick={() => { setLineColor(color); setFillColor(color); }}
                        style={{
                          width: '26px', height: '26px',
                          backgroundColor: color,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: style.lineColor === color ? '2px solid #2962ff' : '1px solid transparent'
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              
              <div style={{ height: '1px', backgroundColor: '#2b3139' }} />
              
              {/* Opacity Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: '#a3a6af' }}>불투명성</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={opacity}
                    onChange={handleOpacityChange}
                    style={{ flex: 1, accentColor: '#2962ff' }}
                  />
                  <span style={{ fontSize: '13px', color: '#fff', width: '36px', textAlign: 'right' }}>{opacity}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Text Settings */}
        <button className="tb-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7"></polyline>
            <line x1="9" y1="20" x2="15" y2="20"></line>
            <line x1="12" y1="4" x2="12" y2="20"></line>
          </svg>
        </button>

        {/* Line Width */}
        <div style={{ position: 'relative' }}>
          <button className={`tb-btn ${activePopover === 'width' ? 'active' : ''}`} style={{ fontSize: '15px', fontWeight: 500, padding: '0 8px' }} onClick={() => setActivePopover(activePopover === 'width' ? null : 'width')}>
            {style.lineWidth || 1}px
          </button>

          {/* Width Popover */}
          {activePopover === 'width' && (
            <div style={{
              position: 'absolute',
              top: '56px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#1e222d',
              border: '1px solid #2b3139',
              borderRadius: '8px',
              padding: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              width: '120px',
              cursor: 'default'
            }}>
              {[1, 2, 3, 4].map(w => (
                <div 
                  key={w}
                  onClick={() => { handleUpdateStyle({ lineWidth: w }); setActivePopover(null); }}
                  className="tb-menu-item"
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px' }}
                >
                  <div style={{ width: '24px', height: `${w}px`, backgroundColor: '#fff' }} />
                  <span style={{ color: '#fff', fontSize: '14px' }}>{w}px</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: '#2b3139', margin: '0 4px' }} />

        {/* Delete */}
        <button className="tb-btn" onClick={handleDelete}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>

        {/* More Options */}
        <button className={`tb-btn ${activePopover === 'more' ? 'active' : ''}`} onClick={() => setActivePopover('more')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" fill="currentColor"></circle>
            <circle cx="19" cy="12" r="1" fill="currentColor"></circle>
            <circle cx="5" cy="12" r="1" fill="currentColor"></circle>
          </svg>
        </button>
      </div>

      {/* Bottom Sheet for More Options */}
      {isMoreOpen && (
        <div 
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#1e222d',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            padding: '24px 16px 32px 16px',
            zIndex: 1000,
            boxShadow: '0 -4px 16px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Sheet Handle */}
          <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '4px', backgroundColor: '#434651', borderRadius: '2px' }} />

          <div className="sheet-menu-item" onClick={() => setActivePopover(null)}>
            <span style={{ marginLeft: '32px' }}>템플릿</span>
            <span style={{ marginLeft: 'auto', color: '#a3a6af' }}>&gt;</span>
          </div>
          
          <div className="sheet-menu-item" onClick={() => setActivePopover(null)}>
            <span style={{ marginLeft: '32px' }}>보는차례 (Z-Order)</span>
            <span style={{ marginLeft: 'auto', color: '#a3a6af' }}>&gt;</span>
          </div>

          <div className="sheet-menu-item" onClick={() => setActivePopover(null)}>
            <span style={{ marginLeft: '32px' }}>인터벌 가시성</span>
            <span style={{ marginLeft: 'auto', color: '#a3a6af' }}>&gt;</span>
          </div>

          <div style={{ height: '1px', backgroundColor: '#2b3139', margin: '8px 0' }} />

          <div className="sheet-menu-item" onClick={() => setActivePopover(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            <span>Object tree...</span>
          </div>

          <div style={{ height: '1px', backgroundColor: '#2b3139', margin: '8px 0' }} />

          <div className="sheet-menu-item" onClick={() => setActivePopover(null)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>클론</span>
          </div>

          <div style={{ height: '1px', backgroundColor: '#2b3139', margin: '8px 0' }} />

          <div className="sheet-menu-item" onClick={() => { handleUpdateOptions({ locked: !options?.locked }); setActivePopover(null); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <span>잠금</span>
          </div>

          <div className="sheet-menu-item" onClick={() => { handleUpdateOptions({ visible: false }); setActivePopover(null); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
            <span>감추기</span>
          </div>

          <div className="sheet-menu-item" onClick={handleDelete}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span style={{ color: '#ef4444' }}>없애기</span>
          </div>

          <div style={{ height: '1px', backgroundColor: '#2b3139', margin: '8px 0' }} />

          <div className="sheet-menu-item" onClick={() => { setActivePopover(null); setIsSettingsOpen(true); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 4.2c.38.28.61.73.61 1.2v8.52c0 .47-.23.92-.61 1.2L12 21.31l-5.66-4.2a1.5 1.5 0 0 1-.61-1.2V8.09c0-.47.23-.92.61-1.2L12 2.69z"></path><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path></svg>
            <span>설정...</span>
          </div>
        </div>
      )}

      {/* Settings Sheet Overlay */}
      {isSettingsOpen && (
        <DrawingSettingsSheet 
          manager={manager} 
          selectedDrawingId={selectedDrawingId} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}

      <style>{`
        .tb-btn {
          background: none;
          border: none;
          color: #a3a6af;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 36px;
          min-width: 36px;
          border-radius: 4px;
          cursor: pointer;
        }
        .tb-btn:hover, .tb-btn.active {
          background-color: rgba(255, 255, 255, 0.05);
          color: #d1d4dc;
        }
        .tb-btn svg {
          stroke: currentColor;
          fill: none;
        }
        .tb-menu-item:hover {
          background-color: rgba(255, 255, 255, 0.05);
        }
        .sheet-menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 8px;
          color: #d1d4dc;
          font-size: 16px;
          cursor: pointer;
        }
        .sheet-menu-item:hover {
          background-color: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
