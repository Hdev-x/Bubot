import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { TrackerState } from '../../../shared/types/bot';
import type { RsiSettings } from '../../../shared/utils/rsiCandles';
import type { MarketChartRef } from '../../../chart/MarketChart';
import type { DesktopExchange } from '../hooks/useDesktopCandles';

// ChartToolbar·ChartStage가 DesktopApp에서 받는 묶음 props 타입 (wp-06 d04b).
// draw·indi·view는 각 훅의 반환 타입(DrawingState·IndicatorState·ChartViewState)을 그대로 쓴다.

export type ChartSel = { symbol: string; exchange: DesktopExchange; isFutures: boolean };

export type RsiGroup = {
  rsiOn: boolean;
  setRsiOn: Dispatch<SetStateAction<boolean>>;
  rsiSettings: RsiSettings;
  setRsiSettings: Dispatch<SetStateAction<RsiSettings>>;
  rsiSettingsOpen: boolean;
  setRsiSettingsOpen: Dispatch<SetStateAction<boolean>>;
};

export type RankGroup = {
  rankMasterOn: boolean;
  setRankMasterOn: Dispatch<SetStateAction<boolean>>;
  rankTiers: Record<string, boolean>;
  setRankTiers: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export type SoloGroup = {
  soloOn: boolean;
  focusTracker: TrackerState | null;
  setFocusTracker: Dispatch<SetStateAction<TrackerState | null>>;
  setSoloActive: Dispatch<SetStateAction<boolean>>;
  frameForTf: (tf: string) => void;
  soloUserViewRef: RefObject<{ from: number; to: number } | null>;
  highlightTracker: TrackerState | null;
};

export type ChartRef = RefObject<MarketChartRef | null>;
