import { useState } from 'react';
import type { BotResultMap } from '../utils/botAggregates';
import type { MainAccountStatus } from '@web/types/bot';

// 레거시 멀티봇(포트 3001~3007 개별 Node 프로세스) 폴링/WS는 제거됨.
// 봇이 통합워커(autotrade-worker) 단일화되면서 그 엔드포인트(/api/bot/<name>/api/status)는
// 더 이상 존재하지 않아 502/WS 에러만 쏟아졌다. 모니터링·포지션·잔고는 전부
// LivePage의 getWorkerStatus(/api/admin/worker/status) 스냅샷에서 온다.
// 이 훅은 호환을 위해 빈 값만 반환한다(레거시 botResults 경로는 워커 스냅샷이 있으면 미사용).
export function useBotStreams() {
  const [botResults] = useState<BotResultMap>({});
  const [mainStatus] = useState<MainAccountStatus | null>(null);

  return {
    botResults,
    mainStatus,
    loading: false,
    lastFetch: 0,
  };
}
