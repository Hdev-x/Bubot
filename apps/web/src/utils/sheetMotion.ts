import type { Transition } from 'framer-motion';

// 바텀시트 공통 모션 — 종목 선택 시트(TradeSymbolSheet)와 동일한 스프링.
// 길어도 탄력있게 빠르게 열리고 닫힌다(높이와 무관한 y 스프링).
const SHEET_SPRING: Transition = { type: 'spring', stiffness: 360, damping: 34, mass: 0.9 };
export const SHEET_ENTER_TRANSITION: Transition = SHEET_SPRING;
export const SHEET_EXIT_TRANSITION: Transition = SHEET_SPRING;
