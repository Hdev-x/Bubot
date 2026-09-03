import { useCallback, useEffect, useState } from 'react';
import { fetchPricePrecision } from '../../api/server/marketApi';

export function usePricePrecision(defaultDecimals = 4) {
  const [precisionMap, setPrecisionMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchPricePrecision().then(setPrecisionMap);
  }, []);

  const getTickDecimals = useCallback((symbol: string) => {
    return precisionMap.get(symbol) ?? defaultDecimals;
  }, [defaultDecimals, precisionMap]);

  return {
    precisionMap,
    getTickDecimals,
  };
}
