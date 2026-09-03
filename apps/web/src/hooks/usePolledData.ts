import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * enabled일 때 fetcher를 주기적으로 폴링하는 제네릭 훅.
 * useMainTrade/useSpotTrade가 동일한 폴링 생명주기를 복붙하던 중복을 제거한다.
 *
 * 세대(gen) 카운터: effect 재실행/cleanup마다 +1 → in-flight 응답을 무효화한다.
 * (비활성→재활성을 한 fetch 안에 빠르게 하면 이전 응답이 새 마운트를 덮어쓰는 레이스 방지)
 */
export function usePolledData<T>(
  fetcher: () => Promise<T>,
  empty: T,
  enabled: boolean,
  pollMs = 2500,
): { data: T; loading: boolean; refetch: () => Promise<void> } {
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);
  // fetcher가 매 렌더 새 함수여도 load를 안정적으로 유지하기 위해 ref로 최신본 보관.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    const gen = genRef.current;
    setLoading(true);
    try {
      const next = await fetcherRef.current();
      if (gen !== genRef.current) return; // 더 최신 세대가 있으면 폐기
      setData(next);
    } catch {
      // 일시 실패(네트워크 순단 등)는 이전 데이터 유지 — throw하면 poll 재예약이 끊겨
      // 폴링이 영구 정지하므로 반드시 삼킨다.
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const gen = ++genRef.current;
    let timer: number | undefined;

    const poll = async () => {
      await load();
      if (gen !== genRef.current) return;
      timer = window.setTimeout(poll, pollMs);
    };
    poll();

    return () => {
      genRef.current++;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, load, pollMs]);

  return { data, loading, refetch: load };
}
