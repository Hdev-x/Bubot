import React, { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import './sheets.css';

export type DrawingTool = { type: string; name: string };
export type DrawingCategory = { id: string; name: string; tools: readonly DrawingTool[] };

export const DRAWING_CATEGORIES: DrawingCategory[] = [
  {
    id: 'line', name: '트렌드 라인',
    tools: [
      { type: 'trend-line',      name: '추세선' },
      { type: 'ray',             name: '레이' },
      { type: 'info-line',       name: '정보선' },
      { type: 'extended-line',   name: '연장선' },
      { type: 'trend-angle',     name: '트렌드 각도' },
      { type: 'horizontal-line', name: '수평선' },
      { type: 'horizontal-ray',  name: '수평 레이' },
      { type: 'vertical-line',   name: '수직선' },
      { type: 'cross-line',      name: '십자선' },
    ]
  },
  {
    id: 'channel', name: '채널',
    tools: [
      { type: 'parallel-channel',  name: '패럴렐 채널' },
      { type: 'regression-trend',  name: '회귀 추세' },
      { type: 'flat-top-bottom',   name: '수평 채널' },
      { type: 'disjoint-channel',  name: '분리 채널' },
    ]
  },
  {
    id: 'fibonacci', name: '간 및 피보나치',
    tools: [
      { type: 'fib-retracement',      name: '피보나치 되돌림' },
      { type: 'fib-extension',        name: '추세기반 피보나치 확장' },
      { type: 'fib-channel',          name: '피보나치 채널' },
      { type: 'fib-time-zone',        name: '피보나치 타임존' },
      { type: 'fib-speed-fan',        name: '피보나치 스피드팬' },
      { type: 'fib-time-extension',   name: '추세기반 피보나치 시간' },
      { type: 'fib-circles',          name: '피보나치 원' },
      { type: 'fib-spiral',           name: '피보나치 나선' },
      { type: 'fib-arcs',             name: '피보나치 호' },
      { type: 'fib-wedge',            name: '피보나치 쐐기' },
      { type: 'pitchfan',             name: '피치팬' },
      { type: 'gann-box',             name: '갠 박스' },
      { type: 'gann-fan',             name: '갠 팬' },
      { type: 'gann-square',          name: '갠 스퀘어' },
      { type: 'gann-square-fixed',    name: '갠 고정' },
    ]
  },
  {
    id: 'pitchfork', name: '포크',
    tools: [
      { type: 'andrews-pitchfork',        name: '앤드루스 포크' },
      { type: 'schiff-pitchfork',         name: '쉬프 포크' },
      { type: 'modified-schiff-pitchfork',name: '수정 쉬프 포크' },
      { type: 'inside-pitchfork',         name: '인사이드 포크' },
    ]
  },
  {
    id: 'pattern', name: '패턴',
    tools: [
      { type: 'bars-pattern',     name: '바 패턴' },
    ]
  },
  {
    id: 'forecasting', name: '예측 및 측정',
    tools: [
      { type: 'long-position',    name: '롱 포지션' },
      { type: 'short-position',   name: '숏 포지션' },
      { type: 'projection',       name: '투영' },
      { type: 'forecast',         name: '예측' },
      { type: 'price-range',      name: '가격 범위' },
      { type: 'date-range',       name: '날짜 범위' },
      { type: 'date-price-range', name: '날짜 및 가격 범위' },
    ]
  },
  {
    id: 'shape', name: '기하 도형',
    tools: [
      { type: 'rectangle',          name: '직사각형' },
      { type: 'circle',             name: '원' },
      { type: 'triangle',           name: '삼각형' },
      { type: 'ellipse',            name: '타원' },
      { type: 'arc',                name: '호' },
      { type: 'rotated-rectangle',  name: '회전 사각형' },
      { type: 'path',               name: '패스' },
      { type: 'polyline',           name: '폴리라인' },
      { type: 'curve',              name: '곡선' },
      { type: 'double-curve',       name: '이중 곡선' },
    ]
  },
  {
    id: 'annotation', name: '주석',
    tools: [
      { type: 'text-annotation',  name: '텍스트' },
      { type: 'callout',          name: '콜아웃' },
      { type: 'note',             name: '노트' },
      { type: 'price-note',       name: '가격 노트' },
      { type: 'price-label',      name: '가격 레이블' },
      { type: 'flag-mark',        name: '플래그' },
      { type: 'pin',              name: '핀' },
      { type: 'arrow-mark-up',    name: '↑ 마커' },
      { type: 'arrow-mark-down',  name: '↓ 마커' },
      { type: 'arrow-marker',     name: '화살표 마커' },
      { type: 'brush',            name: '브러시' },
      { type: 'highlighter',      name: '형광펜' },
      { type: 'comment',          name: '댓글' },
      { type: 'anchored-text',    name: '앵커 텍스트' },
    ]
  },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  activeTool: string | null;
  onSelectTool: (type: string | null) => void;
  onClearAll: () => void;
};

type SheetSize = 'compact' | 'full';

export default function DrawingSheet({ isOpen, onClose, activeTool, onSelectTool, onClearAll }: Props) {
  const [sheetSize, setSheetSize] = useState<SheetSize>('compact'); // 타임프레임 시트처럼 컴팩트로 열림
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('즐겨찾기');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnChart, setShowFavoritesOnChart] = useState(false);
  const dragControls = useDragControls();

  // Load favorites from local storage
  useEffect(() => {
    try {
      const favs = localStorage.getItem('tv_drawing_favorites');
      if (favs) setFavorites(JSON.parse(favs));
      const showFavs = localStorage.getItem('tv_show_favorites_on_chart');
      if (showFavs) setShowFavoritesOnChart(showFavs === 'true');
    } catch { /* 저장 실패는 무시 */ }
  }, []);

  const toggleFavorite = (e: React.MouseEvent, type: string) => {
    e.stopPropagation();
    const newFavs = favorites.includes(type)
      ? favorites.filter(f => f !== type)
      : [...favorites, type];
    setFavorites(newFavs);
    localStorage.setItem('tv_drawing_favorites', JSON.stringify(newFavs));
  };

  const toggleShowFavoritesOnChart = () => {
    const newVal = !showFavoritesOnChart;
    setShowFavoritesOnChart(newVal);
    localStorage.setItem('tv_show_favorites_on_chart', String(newVal));
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setSheetSize('compact');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const tabs = ['즐겨찾기', '툴', ...DRAWING_CATEGORIES.map(c => c.name)];

  const filteredCategories = useMemo(() => {
    let result = DRAWING_CATEGORIES;
    
    // Search filtering
    if (searchQuery.trim() !== '') {
      result = DRAWING_CATEGORIES.map(cat => ({
        ...cat,
        tools: cat.tools.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.type.toLowerCase().includes(searchQuery.toLowerCase()))
      })).filter(cat => cat.tools.length > 0);
      return result;
    }

    // Tab filtering
    if (activeTab === '즐겨찾기') {
      const favTools = DRAWING_CATEGORIES.flatMap(c => c.tools).filter(t => favorites.includes(t.type));
      return [{ id: 'favs', name: '즐겨찾기 된 도구', tools: favTools }];
    } else if (activeTab === '툴') {
      return DRAWING_CATEGORIES;
    } else {
      return DRAWING_CATEGORIES.filter(c => c.name === activeTab);
    }
  }, [searchQuery, activeTab, favorites]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="interval-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={onClose}
          />
          <motion.div
            className={`interval-sheet drawing-tool-sheet ${sheetSize}`}
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{
              y: 0,
              opacity: 1,
              height: sheetSize === 'full' ? '100dvh' : '73dvh',
              borderTopLeftRadius: sheetSize === 'full' ? 0 : 20,
              borderTopRightRadius: sheetSize === 'full' ? 0 : 20,
            }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ type: 'spring', damping: 34, stiffness: 360, mass: 0.9 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.03, bottom: 0.18 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 92 || info.velocity.y > 700) {
                onClose();
              }
            }}
          >
            <div className="interval-drag-zone" onPointerDown={(e) => dragControls.start(e)}>
              <div className="sheet-handle" />
            </div>

            {/* Header */}
            <header className="interval-sheet-header" onPointerDown={(e) => dragControls.start(e)}>
              <h3>드로잉</h3>
              <button 
                type="button" 
                onClick={onClose} 
                onPointerDown={(e) => e.stopPropagation()}
                className="interval-close-btn"
              >
                ✕
              </button>
            </header>

            {/* Search Bar */}
            <div className="drawing-search-wrap">
              <div className="drawing-search-field">
                <span>⌕</span>
                <input 
                  type="text" 
                  placeholder="찾기" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Horizontal Tabs */}
            {searchQuery === '' && (
              <div className="drawing-sheet-tabs">
                {tabs.map(tab => (
                  <div 
                    key={tab} 
                    onClick={() => setActiveTab(tab)}
                    className={`drawing-sheet-tab ${activeTab === tab ? 'active' : ''}`}
                  >
                    {tab}
                  </div>
                ))}
              </div>
            )}

            {/* Content Grid */}
            <div className="interval-sheet-content drawing-sheet-content">
              
              {/* Reset/Pointer Tools (Always show at top when in '툴' tab) */}
              {activeTab === '툴' && searchQuery === '' && (
                <div className="drawing-quick-actions">
                  <button
                    onClick={() => { onSelectTool(null); onClose(); }}
                    className={`drawing-action-btn ${activeTool === null ? 'active' : ''}`}
                  >
                    포인터 모드
                  </button>
                  <button
                    onClick={() => { onClearAll(); onClose(); }}
                    className="drawing-action-btn danger"
                  >
                    전체 삭제
                  </button>
                </div>
              )}

              {filteredCategories.length === 0 && (
                <div style={{ textAlign: 'center', color: '#868993', marginTop: '40px' }}>
                  검색 결과가 없습니다.
                </div>
              )}

              {filteredCategories.map(cat => (
                <section key={cat.id} className="drawing-tool-section">
                  {(activeTab === '툴' || searchQuery !== '') && (
                    <p className="drawing-tool-section-title">{cat.name}</p>
                  )}
                  <div className="drawing-tool-card-grid">
                    {cat.tools.map(tool => {
                      const isFav = favorites.includes(tool.type);
                      const isActive = activeTool === tool.type;
                      return (
                        <div
                          key={tool.type}
                          onClick={() => { onSelectTool(tool.type); onClose(); }}
                          className={`drawing-tool-card ${isActive ? 'active' : ''}`}
                        >
                          {/* Star Button */}
                          <div 
                            onClick={(e) => toggleFavorite(e, tool.type)}
                            className="drawing-tool-fav"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#f59e0b' : 'none'} stroke={isFav ? '#f59e0b' : '#868993'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </div>
                          
                          {/* Generic Icon */}
                          <div className="drawing-tool-icon">
                            <GenericIcon type={tool.type} categoryId={cat.id} />
                          </div>

                          {/* Tool Name */}
                          <span className="drawing-tool-name">
                            {tool.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {/* Bottom Bar: Show favorites on chart */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#17181b', padding: '16px 20px', borderTop: '1px solid #23262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d1d4dc', fontSize: '14px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                차트에 즐겨찾기 표시
              </div>
              
              {/* Toss Switch */}
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={toggleShowFavoritesOnChart}>
                <div className={`toss-switch ${showFavoritesOnChart ? 'active' : ''}`}>
                  <div className="toss-switch-thumb" />
                </div>
              </label>
            </div>
            
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------
// Generic Icons Helper
// ----------------------------------------------------
function GenericIcon({ type, categoryId }: { type: string, categoryId: string }) {
  if (type === 'price-range' || type === 'date-range' || type === 'date-price-range') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 8h16M4 16h16M12 4v16" strokeLinecap="round"/>
        <circle cx="12" cy="8" r="2" fill="currentColor"/>
        <circle cx="12" cy="16" r="2" fill="currentColor"/>
      </svg>
    );
  }
  if (type === 'long-position' || type === 'short-position') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12h16" strokeLinecap="round" strokeDasharray="3 3"/>
        <rect x="8" y="4" width="8" height="6" rx="1" />
        <rect x="8" y="14" width="8" height="6" rx="1" />
      </svg>
    );
  }
  if (categoryId === 'line') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 19L19 5" strokeLinecap="round"/>
        <circle cx="5" cy="19" r="2" fill="currentColor"/>
        <circle cx="19" cy="5" r="2" fill="currentColor"/>
      </svg>
    );
  }
  if (categoryId === 'fibonacci') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/>
        <circle cx="8" cy="6" r="1.5" fill="currentColor"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="16" cy="18" r="1.5" fill="currentColor"/>
      </svg>
    );
  }
  if (categoryId === 'pattern') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12l5-7 5 7 6-4" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="9" cy="5" r="1.5" fill="currentColor"/>
        <circle cx="14" cy="12" r="1.5" fill="currentColor"/>
        <circle cx="20" cy="8" r="1.5" fill="currentColor"/>
      </svg>
    );
  }
  if (categoryId === 'shape') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
        <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
        <circle cx="6" cy="18" r="1.5" fill="currentColor"/>
        <circle cx="18" cy="18" r="1.5" fill="currentColor"/>
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 4v16m-8-8h16" strokeLinecap="round"/>
    </svg>
  );
}
