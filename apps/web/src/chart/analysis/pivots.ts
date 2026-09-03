/**
 * 스윙 하이/로우(피벗) 검출 — 실제 구현은 공유 엔진(shared/pivots.ts)에 있다.
 * 차트·백테스트·실전 워커가 같은 코드를 쓰기 위한 재수출 통로.
 */
import type { Time } from 'lightweight-charts';
import type { Pivot as SharedPivot } from '../../../../../shared/pivots';

export type { PivotType } from '../../../../../shared/pivots';
export type Pivot = SharedPivot<Time>;
export { getPivots } from '../../../../../shared/pivots';
