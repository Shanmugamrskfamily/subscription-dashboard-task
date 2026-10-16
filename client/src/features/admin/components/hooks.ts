import { useCallback, useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsPhone = () => !useMediaQuery('(min-width: 640px)');

type ParamValue = string | number | null | undefined;

/**
 * Filters live in the URL so a filtered view can be shared or bookmarked. Filter
 * changes replace the history entry; opening a drawer can push one (`push: true`),
 * so the back button closes it.
 */
export function useUrlParams() {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? '';
  const update = (patch: Record<string, ParamValue>, options: { push?: boolean } = {}) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: !options.push },
    );
  };
  return { params, get, update };
}

/**
 * A search box that types instantly but only writes to the URL (and so refetches)
 * after the user pauses for 300 ms.
 */
export function useSearchParamInput(current: string, commit: (value: string) => void, delay = 300) {
  const [value, setValue] = useState(current);
  const debounced = useDebounced(value.trim(), delay);
  const write = useEffectEvent((next: string) => {
    if (next !== current) commit(next);
  });
  useEffect(() => write(debounced), [debounced]);
  return [value, setValue] as const;
}
