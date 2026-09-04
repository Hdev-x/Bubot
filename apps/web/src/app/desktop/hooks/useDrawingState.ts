import { useRef, useState } from 'react';
import { usePersistentState } from '../../../hooks/ui/usePersistentState';

// Desktop 드로잉 상태 — 도구·undo/redo·선택·설정 다이얼로그·자석·툴바 드롭다운. DesktopApp에서 옮김 (wp-06 d04a).
// 드롭다운 바깥 클릭 닫기 effect는 지표·차트설정 드롭다운과 한 effect라 DesktopApp에 남아 있다.
export function useDrawingState() {
  const [drawOpen, setDrawOpen] = useState(false);
  // 활성 그리기 도구(null=커서). 도형 완성 시 MarketChart가 onToolChange(null)로 되돌림.
  const [drawTool, setDrawTool] = useState<string | null>(null);
  // 드로잉 undo/redo 가능 여부(그리기 패널 버튼 활성화)
  const [drawHistory, setDrawHistory] = useState({ canUndo: false, canRedo: false });
  // 선택된 드로잉(플로팅 툴바 표시) + 설정 다이얼로그
  const [selDrawId, setSelDrawId] = useState<string | null>(null);
  const [drawSettingsOpen, setDrawSettingsOpen] = useState(false);
  // 자석(OHLC 약스냅) — TV처럼 토글, 새로고침에도 유지
  const [magnetOn, setMagnetOn] = usePersistentState('web_draw_magnet', true);
  const drawRef = useRef<HTMLDivElement>(null);
  return {
    drawOpen, setDrawOpen, drawTool, setDrawTool, drawHistory, setDrawHistory,
    selDrawId, setSelDrawId, drawSettingsOpen, setDrawSettingsOpen, magnetOn, setMagnetOn, drawRef,
  };
}

export type DrawingState = ReturnType<typeof useDrawingState>;
