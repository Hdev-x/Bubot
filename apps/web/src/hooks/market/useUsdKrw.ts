import { useEffect, useState } from 'react';
import { fetchUsdKrwRate } from '../../api/exchange/exchangeRate';

// USD/KRW 환율 — 모듈 레벨 캐시로 한 번만 조회(여러 컴포넌트가 써도 중복 호출 없음).
let cached: number | null = null;
let inflight: Promise<number> | null = null;

export function useUsdKrw(): number {
  const [rate, setRate] = useState<number>(cached ?? 1380);
  useEffect(() => {
    if (cached != null) return;
    inflight = inflight ?? fetchUsdKrwRate();
    let ignore = false;
    inflight.then((r) => {
      cached = r;
      if (!ignore) setRate(r);
    });
    return () => { ignore = true; };
  }, []);
  return rate;
}
