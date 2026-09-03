import { useEffect, useState } from 'react';

// 값이 채워지기 전 잠깐 스켈레톤을 보여주기 위한 게이트.
// ready=true면 즉시 true. false면 timeoutMs 후 강제로 true(빈 계정·키없음 등 영영 0인 경우 폴백).
export function useDelayedReady(ready: boolean, timeoutMs = 1500): boolean {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (ready) { setTimedOut(false); return; }
    const id = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(id);
  }, [ready, timeoutMs]);

  return ready || timedOut;
}
