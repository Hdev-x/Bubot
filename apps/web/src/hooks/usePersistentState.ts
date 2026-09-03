import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * localStorage에 JSON으로 자동 저장/복원되는 useState.
 *
 * - 초기값은 localStorage에 저장된 값이 있으면 그것을, 없으면 defaultValue를 쓴다.
 * - 값이 바뀔 때마다 localStorage에 직렬화해 저장한다.
 * - 파싱/저장 실패는 조용히 무시한다(기존 동작 유지).
 *
 * @param key     localStorage 키
 * @param defaultValue 기본값 (또는 기본값을 만드는 함수)
 * @param merge   저장된 값을 기본값 위에 병합할지 여부 (객체 설정에서 신규 필드 보강용)
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T | (() => T),
  merge = false,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallback =
      typeof defaultValue === 'function' ? (defaultValue as () => T)() : defaultValue;
    try {
      const saved = localStorage.getItem(key);
      if (saved != null) {
        const parsed = JSON.parse(saved) as T;
        return merge ? { ...(fallback as object), ...(parsed as object) } as T : parsed;
      }
    } catch {}
    return fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}
