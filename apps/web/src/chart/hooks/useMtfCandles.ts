import { useEffect, useRef, useState } from 'react';
import type { IndicatorSettings, TFKey } from '../overlays/ChartOverlay';
import type { Candle } from '../../shared/types/market';

type LoadCandles = (granularity: string, limit: number, endTime?: string) => Promise<Candle[]>;

const TF_KEYS: TFKey[] = ['1M', '1W', '3D', '1D'];

const MTF_GRANULARITY: Record<TFKey, string> = {
  '1M': '1Mutc',
  '1W': '1Wutc',
  '3D': '3Dutc',
  '1D': '1Dutc',
};

function hasEnabledIndicator(settings: IndicatorSettings[TFKey]) {
  return settings.showOB || settings.showOBBox || settings.showFVG || settings.showCE || settings.showEQ;
}

/**
 * MTF 지표 캔들 로더.
 * - 반환: { mtfCandles, mtfKey } — mtfKey = 현재 mtfCandles가 속한 마켓 키(호출부가 표시 중인 차트와 일치할 때만 그리도록).
 *   key 인자를 주면(Desktop, marketKey.priceKey) 그 값, 없으면 symbol(Mobile — 게이팅 미사용). wp-09 d01: 심볼 → 키.
 * - atomic=true(웹): 활성 TF를 전부 받은 뒤 한 번에 커밋(+심볼 태그). 로드 중엔 옛 데이터·심볼 유지 →
 *   "지표 먼저 꺼짐"도, "옛 지표가 새 차트에 잠깐 얹혀 튀는 것"도 없음(호출부가 mtfKey로 게이팅).
 * - atomic=false(모바일 기본): 기존 동작 — 종목 변경 즉시 비우고 TF별 도착하는 대로 표시.
 */
export function useMtfCandles(
  symbol: string,
  indicatorSettings: IndicatorSettings,
  loadCandles: LoadCandles,
  atomic = false,
  key?: string,
) {
  const marketKey = key ?? symbol;
  const [mtfCandles, setMtfCandles] = useState<Partial<Record<TFKey, Candle[]>>>({});
  const [mtfKey, setMtfKey] = useState<string | null>(null);
  const reqSymbolRef = useRef<string | null>(null);
  const mtfCandlesRef = useRef<Partial<Record<TFKey, Candle[]>>>({});
  const seqRef = useRef(0);

  useEffect(() => {
    mtfCandlesRef.current = mtfCandles;
  }, [mtfCandles]);

  useEffect(() => {
    const symbolChanged = reqSymbolRef.current !== marketKey;
    if (symbolChanged) reqSymbolRef.current = marketKey;
    const enabled = TF_KEYS.filter(tf => hasEnabledIndicator(indicatorSettings[tf]));

    if (atomic) {
      // 웹: 활성 TF 전부 로드 완료 시 원자적 커밋. 그 전까진 옛 mtfCandles·mtfKey 유지(keep-old).
      if (enabled.length === 0) { setMtfCandles({}); setMtfKey(marketKey); return; }
      const seq = ++seqRef.current;
      Promise.all(
        enabled.map(tf =>
          loadCandles(MTF_GRANULARITY[tf], 300)
            .then(c => [tf, c] as const)
            .catch(() => [tf, [] as Candle[]] as const)
        )
      ).then(results => {
        if (seq !== seqRef.current) return; // 더 최신 로드가 시작됨 → 폐기
        const data: Partial<Record<TFKey, Candle[]>> = {};
        for (const [tf, c] of results) if (c.length) data[tf] = c;
        setMtfCandles(data);
        setMtfKey(marketKey);
      });
      return;
    }

    // 모바일: 변경 즉시 비우고 TF별 로드(도착하는 대로 표시)
    if (symbolChanged) {
      mtfCandlesRef.current = {};
      setMtfCandles({});
      setMtfKey(marketKey);
    }
    TF_KEYS.forEach(tf => {
      if (!hasEnabledIndicator(indicatorSettings[tf])) return;
      if (!symbolChanged && mtfCandlesRef.current[tf]) return;
      loadCandles(MTF_GRANULARITY[tf], 300)
        .then(candles => {
          if (!candles.length) return;
          setMtfCandles(prev => {
            const next = { ...prev, [tf]: candles };
            mtfCandlesRef.current = next;
            return next;
          });
        })
        .catch(() => {});
    });
  }, [indicatorSettings, loadCandles, marketKey, atomic]);

  return { mtfCandles, mtfKey };
}
