import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** useState backed by localStorage. `revive` validates/repairs what was saved. */
export function usePersistentState<T>(
  key: string,
  initial: () => T,
  revive: (raw: unknown) => T = (raw) => raw as T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved != null) return revive(JSON.parse(saved));
    } catch {
      // Storage unavailable or corrupt: start fresh.
    }
    return initial();
  });

  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or private mode: keep working in memory.
    }
  }, [key, value]);

  // Flush on hide too, in case the page is killed before the effect runs.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      try {
        localStorage.setItem(key, JSON.stringify(latest.current));
      } catch {
        /* ignore */
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [key]);

  const set = useCallback<Dispatch<SetStateAction<T>>>((v) => setValue(v), []);
  return [value, set];
}
