/**
 * SMC (OB/FVG/CE/EQ) 감지 — 실제 구현은 공유 엔진(shared/smc.ts)에 있다.
 * 차트·백테스트·실전 워커가 같은 코드를 쓰기 위한 재수출 통로.
 * 기본 logScale=true (기존 차트 동작과 동일). 선형 차트일 땐 호출부에서 logScale:false 전달.
 */
export * from '../../../../../shared/smc';
