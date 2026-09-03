import React, { useState, useEffect } from 'react';
import type { DrawingManager } from '../drawing';

type Props = {
  manager: DrawingManager | null;
  selectedDrawingId: string | null;
  onClose: () => void;
};

const TABS = ['모습', '문자', '좌표', '보임'];

// Shared Color Palette for nested color pickers
const COLOR_PALETTE = [
  ['#ffffff', '#e0e0e0', '#b3b3b3', '#808080', '#4d4d4d', '#262626', '#1a1a1a', '#000000'],
  ['#ef5350', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0', '#e91e63'],
  ['#ffcdd2', '#ffe0b2', '#fff9c4', '#c8e6c9', '#b2ebf2', '#bbdefb', '#e1bee7', '#f8bbd0'],
  ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#d81b60'],
  ['#b71c1c', '#e65100', '#f57f17', '#1b5e20', '#006064', '#0d47a1', '#4a148c', '#880e4f'],
];


export default function DrawingSettingsSheet({ manager, selectedDrawingId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState('모습');
  const [style, setStyle] = useState<any>({});
  const [options, setOptions] = useState<any>({});
  const [text, setText] = useState('');
  
  // States for nested popovers
  const [activePicker, setActivePicker] = useState<'lineColor' | 'bgColor' | 'labelBgColor' | 'textColor' | 'fontSize' | 'extend' | 'stats' | null>(null);

  useEffect(() => {
    if (!manager || !selectedDrawingId) return;
    const drawing = manager.getDrawing(selectedDrawingId);
    if (!drawing) return;
    
    setStyle(drawing.style || {});
    setOptions(drawing.options || {});
    setText((drawing.options as any)?.text || '');
  }, [manager, selectedDrawingId]);

  const handleUpdateStyle = (newStyle: any) => {
    const drawing = manager?.getDrawing(selectedDrawingId!);
    if (drawing) {
      drawing.updateStyle(newStyle);
      setStyle({ ...style, ...newStyle });
    }
  };

  const handleUpdateOptions = (newOptions: any) => {
    const drawing = manager?.getDrawing(selectedDrawingId!);
    if (drawing) {
      drawing.updateOptions(newOptions);
      setOptions({ ...options, ...newOptions });
    }
  };

  const renderColorPicker = (type: 'lineColor' | 'bgColor' | 'labelBgColor' | 'textColor') => {
    // Basic color selection logic based on the images
    const handleColorClick = (hex: string) => {
      if (type === 'lineColor') handleUpdateStyle({ lineColor: hex });
      else if (type === 'bgColor') handleUpdateStyle({ fillColor: hex });
      else if (type === 'labelBgColor') handleUpdateStyle({ labelBackgroundColor: hex });
      else if (type === 'textColor') handleUpdateStyle({ textColor: hex });
      setActivePicker(null);
    };

    return (
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#1e222d', border: '1px solid #2b3139', borderRadius: '8px', padding: '12px', zIndex: 1100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {COLOR_PALETTE.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: '4px' }}>
              {row.map(color => (
                <div key={color} onClick={() => handleColorClick(color)} style={{ width: '26px', height: '26px', backgroundColor: color, borderRadius: '4px', cursor: 'pointer' }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const drawingType = manager?.getDrawing(selectedDrawingId!)?.type;

  const toolNameMap: Record<string, string> = {
    'price-range': '가격 범위',
    'date-price-range': '날짜 및 가격 범위',
    'date-range': '날짜 범위',
    'trend-line': '추세선',
    'horizontal-line': '수평선',
    'vertical-line': '수직선',
    'rectangle': '직사각형',
    'text-annotation': '텍스트'
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 1050,
      display: 'flex', flexDirection: 'column', color: '#d1d4dc', fontFamily: 'sans-serif'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #2b3139' }}>
        <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{drawingType ? (toolNameMap[drawingType] || '설정') : '설정'}</span>
        <svg style={{ marginLeft: '12px' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a6af" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a3a6af', cursor: 'pointer', padding: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid #2b3139', marginTop: '8px' }}>
        {TABS.map(tab => (
          <div 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            style={{ 
              padding: '12px 16px', cursor: 'pointer', fontSize: '15px',
              color: activeTab === tab ? '#fff' : '#a3a6af',
              borderBottom: activeTab === tab ? '2px solid #2962ff' : '2px solid transparent'
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        
        {activeTab === '모습' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 라인 - date-price-range 에서는 무시되므로 가림 */}
            {drawingType !== 'date-price-range' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>라인</span>
                <div 
                  style={{ width: '64px', height: '32px', backgroundColor: style.lineColor || '#2962ff', borderRadius: '4px', border: '1px solid #434651', cursor: 'pointer' }}
                  onClick={() => setActivePicker('lineColor')}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={drawingType === 'date-price-range' ? options.filled !== false : (!!style.fillColor && style.fillColor !== 'transparent')} 
                  onChange={(e) => {
                    if (drawingType === 'date-price-range') {
                      handleUpdateOptions({ filled: e.target.checked });
                    } else {
                      if (e.target.checked) {
                        handleUpdateStyle({ fillColor: 'rgba(41,98,255,0.2)' });
                      } else {
                        handleUpdateStyle({ fillColor: 'transparent' });
                      }
                    }
                  }}
                  style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                />
                <span>배경</span>
              </div>
              {drawingType !== 'date-price-range' && (
                <div 
                  style={{ width: '40px', height: '40px', backgroundColor: style.fillColor === 'transparent' ? '#1e222d' : (style.fillColor || 'rgba(41,98,255,0.2)'), borderRadius: '4px', border: '1px solid #434651', cursor: 'pointer', opacity: (style.fillColor && style.fillColor !== 'transparent') ? 1 : 0.5 }}
                  onClick={() => style.fillColor && style.fillColor !== 'transparent' && setActivePicker('bgColor')}
                />
              )}
            </div>

            {/* 확장 - date-price-range 에서는 무시되므로 가림 */}
            {drawingType !== 'date-price-range' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>확장</span>
                <select 
                  value={(options.extendLeft ? 'left' : options.extendRight ? 'right' : 'none')}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleUpdateOptions({
                      extendLeft: val === 'left',
                      extendRight: val === 'right'
                    });
                  }}
                  style={{ border: '1px solid #434651', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '24px', backgroundColor: '#1e222d', color: '#fff', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="none">연장 안함</option>
                  <option value="left">익스텐드 레프트</option>
                  <option value="right">익스텐드 라이트</option>
                </select>
              </div>
            )}

            <div style={{ marginTop: '16px', fontSize: '13px', color: '#a3a6af' }}>정보</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={options.showPrices !== false} 
                  onChange={(e) => handleUpdateOptions({ showPrices: e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                />
                <span>가격</span>
              </div>
              {drawingType !== 'date-price-range' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="checkbox" 
                    checked={options.showRange !== false} 
                    onChange={(e) => handleUpdateOptions({ showRange: e.target.checked })}
                    style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                  />
                  <span>가격범위</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="checkbox" 
                  checked={options.showPercentage !== false} 
                  onChange={(e) => handleUpdateOptions({ showPercentage: e.target.checked })}
                  style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                />
                <span>퍼센트 변화</span>
              </div>
              {drawingType === 'date-price-range' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input 
                      type="checkbox" 
                      checked={options.showBars !== false} 
                      onChange={(e) => handleUpdateOptions({ showBars: e.target.checked })}
                      style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                    />
                    <span>바</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input 
                      type="checkbox" 
                      checked={options.showDays !== false} 
                      onChange={(e) => handleUpdateOptions({ showDays: e.target.checked })}
                      style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                    />
                    <span>날짜/시간</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>라벨</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                {drawingType !== 'date-price-range' && (
                  <div style={{ width: '40px', height: '40px', backgroundColor: style.labelColor || '#fff', borderRadius: '4px', border: '1px solid #434651', cursor: 'pointer' }} onClick={() => setActivePicker('textColor')} />
                )}
                <select 
                  value={style.labelFont ? parseInt(style.labelFont.split('px')[0]) : 12}
                  onChange={(e) => handleUpdateStyle({ labelFont: `${e.target.value}px sans-serif` })}
                  style={{ border: '1px solid #434651', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e222d', color: '#fff', outline: 'none', cursor: 'pointer' }}
                >
                  {[8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {drawingType !== 'date-price-range' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input 
                    type="checkbox" 
                    checked={!!style.labelBackgroundColor && style.labelBackgroundColor !== 'transparent'} 
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleUpdateStyle({ labelBackgroundColor: 'rgba(0,0,0,0.5)' });
                      } else {
                        handleUpdateStyle({ labelBackgroundColor: 'transparent' });
                      }
                    }}
                    style={{ width: '20px', height: '20px', accentColor: '#2962ff', cursor: 'pointer' }} 
                  />
                  <span>라벨 백그라운드</span>
                </div>
                <div 
                  style={{ width: '40px', height: '40px', backgroundColor: style.labelBackgroundColor === 'transparent' ? '#1e222d' : (style.labelBackgroundColor || 'rgba(0,0,0,0.5)'), borderRadius: '4px', border: '1px solid #434651', cursor: 'pointer', opacity: (style.labelBackgroundColor && style.labelBackgroundColor !== 'transparent') ? 1 : 0.5 }} 
                  onClick={() => style.labelBackgroundColor && style.labelBackgroundColor !== 'transparent' && setActivePicker('labelBgColor')} 
                />
              </div>
            )}

          </div>
        )}

        {activeTab === '문자' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '40px', height: '40px', backgroundColor: style.textColor || '#fff', borderRadius: '4px', border: '1px solid #434651', cursor: 'pointer' }} onClick={() => setActivePicker('textColor')} />
              <select 
                value={style.labelFont ? parseInt(style.labelFont.split('px')[0]) : 12}
                onChange={(e) => handleUpdateStyle({ labelFont: `${e.target.value}px sans-serif` })}
                style={{ border: '1px solid #434651', borderRadius: '6px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: '#1e222d', color: '#fff', outline: 'none', cursor: 'pointer' }}
              >
                {[8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button 
                onClick={() => {
                  const currentFont = style.labelFont || '12px sans-serif';
                  const isBold = currentFont.includes('bold');
                  handleUpdateStyle({ labelFont: isBold ? currentFont.replace('bold ', '') : `bold ${currentFont}` });
                }}
                style={{ width: '40px', height: '40px', backgroundColor: style.labelFont?.includes('bold') ? '#2962ff' : '#1e222d', border: '1px solid #434651', borderRadius: '6px', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
              >
                B
              </button>
              <button 
                onClick={() => {
                  const currentFont = style.labelFont || '12px sans-serif';
                  const isItalic = currentFont.includes('italic');
                  handleUpdateStyle({ labelFont: isItalic ? currentFont.replace('italic ', '') : `italic ${currentFont}` });
                }}
                style={{ width: '40px', height: '40px', backgroundColor: style.labelFont?.includes('italic') ? '#2962ff' : '#1e222d', border: '1px solid #434651', borderRadius: '6px', color: '#fff', fontStyle: 'italic', fontFamily: 'serif', cursor: 'pointer' }}
              >
                I
              </button>
            </div>
            
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => handleUpdateOptions({ text })}
              placeholder="텍스트 넣기"
              style={{ width: '100%', height: '120px', backgroundColor: '#1e222d', border: '1px solid #434651', borderRadius: '8px', padding: '12px', color: '#fff', resize: 'none', fontSize: '15px' }}
            />
          </div>
        )}

        {activeTab === '좌표' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '120px' }}>#1 (프라이스, 바)</span>
              <input type="text" readOnly value={manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.price?.toFixed(2) || '-'} style={{ flex: 1, backgroundColor: '#1e222d', border: '1px solid #434651', borderRadius: '6px', padding: '12px', color: '#a3a6af', outline: 'none' }} />
              <input type="text" readOnly value={(manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.time as any)?.year ? `${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.time as any).year}-${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.time as any).month}-${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.time as any).day}` : ((manager?.getDrawing(selectedDrawingId!)?.anchors?.[0]?.time as any) || '-')} style={{ width: '80px', backgroundColor: '#1e222d', border: '1px solid #434651', borderRadius: '6px', padding: '12px', color: '#a3a6af', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ width: '120px' }}>#2 (프라이스, 바)</span>
              <input type="text" readOnly value={manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.price?.toFixed(2) || '-'} style={{ flex: 1, backgroundColor: '#1e222d', border: '1px solid #434651', borderRadius: '6px', padding: '12px', color: '#a3a6af', outline: 'none' }} />
              <input type="text" readOnly value={(manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.time as any)?.year ? `${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.time as any).year}-${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.time as any).month}-${(manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.time as any).day}` : ((manager?.getDrawing(selectedDrawingId!)?.anchors?.[1]?.time as any) || '-')} style={{ width: '80px', backgroundColor: '#1e222d', border: '1px solid #434651', borderRadius: '6px', padding: '12px', color: '#a3a6af', outline: 'none' }} />
            </div>
            <div style={{ fontSize: '12px', color: '#a3a6af', marginTop: '8px' }}>
              * 좌표 수정 기능은 현재 라이브러리 상에서 수동 지원이 불가능하여 읽기 전용으로 표시됩니다.
            </div>
          </div>
        )}

      </div>

      {/* Footer Nav Bar (Template, Cancel, OK) */}
      <div style={{ display: 'flex', padding: '16px', borderTop: '1px solid #2b3139', backgroundColor: '#000', justifyContent: 'space-between' }}>
        <button style={{ backgroundColor: 'transparent', border: '1px solid #434651', borderRadius: '8px', padding: '8px 16px', color: '#fff' }}>...</button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ backgroundColor: 'transparent', border: '1px solid #434651', borderRadius: '8px', padding: '8px 24px', color: '#fff', fontSize: '15px' }}>취소</button>
          <button onClick={onClose} style={{ backgroundColor: '#fff', border: 'none', borderRadius: '8px', padding: '8px 24px', color: '#000', fontSize: '15px', fontWeight: 'bold' }}>확인</button>
        </div>
      </div>

      {/* Overlay Pickers */}
      {activePicker && (
        <>
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1099 }} onClick={() => setActivePicker(null)} />
          {renderColorPicker(activePicker as any)}
        </>
      )}
    </div>
  );
}
