import type { Time } from 'lightweight-charts';

// 차트 위 한 점 — 시간(x)·가격(y) 좌표. TF를 바꿔도 같은 자리에 그려지도록 픽셀이 아닌 데이터 좌표로 저장.
export type Anchor = { time: Time; price: number };

// 피보나치 레벨 한 줄(비율·색·표시 여부)
export type FibLevel = { value: number; color: string; visible: boolean };

export type DrawingStyle = {
  showLine?: boolean;     // false면 선을 그리지 않음(배경만 표시 — 박스 등)
  lineColor?: string;
  lineWidth?: number;
  lineStyle?: number; // 0=실선 1=점선 2=대시 (lightweight-charts LineStyle과 동일 규약)
  fillColor?: string;
  labelColor?: string;
  labelSize?: number;     // 가격범위 등 정보 라벨 폰트 크기(px)
  showLabels?: boolean;   // 수평선: 가격라벨 / 추세선: 양끝 프라이스 라벨
  extendLeft?: boolean;   // 추세선·채널: 왼쪽 화면 끝까지 연장
  extendRight?: boolean;  // 추세선·피보·채널: 오른쪽 화면 끝까지 연장
  showMiddleLine?: boolean; // 평행채널: 중앙 점선(levels 미사용 시 폴백)
  showBackground?: boolean; // 피보·채널·박스·가격범위: 배경 채움
  showTrendLine?: boolean;  // 피보: 기준 대각선 표시
  levels?: FibLevel[];    // 피보나치·평행채널 레벨 목록
  reverse?: boolean;        // 피보: 0/1 방향 뒤집기
  logScale?: boolean;       // 피보: 레벨 가격을 로그공간(기하보간)으로 계산 — 하모닉 엔진과 동일 방식
  showLevelValues?: boolean; // 피보 라벨에 레벨값(0.618) 표시
  showLevelPrices?: boolean; // 피보 라벨에 가격 표시
  bgOpacity?: number;       // 배경 불투명도(0~1)
  labelAlignH?: 'left' | 'center' | 'right'; // 피보 라벨 가로 위치
  labelAlignV?: 'top' | 'middle' | 'bottom'; // 피보 라벨 세로 위치
  // 문자(도형 위 텍스트) — options.text가 있을 때 적용
  textColor?: string;
  textSize?: number;
  textBold?: boolean;
  textItalic?: boolean;
  textAlignV?: 'top' | 'middle' | 'bottom';
  textAlignH?: 'left' | 'center' | 'right';
};

export type DrawingOptions = {
  visible?: boolean;
  locked?: boolean;
  text?: string;
};

// localStorage 저장/복원 포맷 (기존 lightweight-charts-drawing 포맷과 동일 필드)
export type SerializedDrawing = {
  id: string;
  type: string;
  anchors: Anchor[];
  style: DrawingStyle;
  options: DrawingOptions;
};

// 평행채널 기본 레벨(TV 기준) — 0·1=기준/평행선(항상), 0.5=중앙선. -0.25~1.25는 기본 꺼짐.
export const DEFAULT_CHANNEL_LEVELS: FibLevel[] = [
  { value: -0.25, color: '#2962ff', visible: false },
  { value: 0, color: '#2962ff', visible: true },
  { value: 0.25, color: '#2962ff', visible: false },
  { value: 0.5, color: '#787b86', visible: true },
  { value: 0.75, color: '#2962ff', visible: false },
  { value: 1, color: '#2962ff', visible: true },
  { value: 1.25, color: '#2962ff', visible: false },
];

// 피보나치 "로그 스케일" 마지막 선택값 — 새로 그리는 피보에 기본값으로 이어짐(클릭한 게 디폴트).
const FIB_LOG_SCALE_KEY = 'draw_fib_log_scale_default';
export function getFibLogScaleDefault(): boolean {
  try {
    const v = localStorage.getItem(FIB_LOG_SCALE_KEY);
    return v === null ? true : v === '1';
  } catch { return true; }
}
export function setFibLogScaleDefault(v: boolean): void {
  try { localStorage.setItem(FIB_LOG_SCALE_KEY, v ? '1' : '0'); } catch { /* 무시 */ }
}

// 피보나치 되돌림 기본 레벨(트레이딩뷰 기본값 기준 — 1.618 이상은 기본 꺼짐)
export const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0, color: '#787b86', visible: true },
  { value: 0.236, color: '#f23645', visible: true },
  { value: 0.382, color: '#ff9800', visible: true },
  { value: 0.5, color: '#4caf50', visible: true },
  { value: 0.618, color: '#089981', visible: true },
  { value: 0.786, color: '#00bcd4', visible: true },
  { value: 1, color: '#787b86', visible: true },
  { value: 1.618, color: '#2962ff', visible: false },
  { value: 2.618, color: '#f23645', visible: false },
];
