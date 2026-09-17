import { useCallback, useEffect, useRef, useState } from 'react';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface Options {
  /** Auto-retry count for transient failures (sidecars boot slowly). */
  retries?: number;
}

/** Generic data-fetching hook with loading / error / retry states. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[], opts?: Options): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const attempts = useRef(0);

  const reload = useCallback(() => {
    attempts.current = 0;
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setError(null);

    fn()
      .then((d) => {
        if (!cancelled) {
          attempts.current = 0;
          setData(d);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        const max = opts?.retries ?? 0;
        if (attempts.current < max) {
          attempts.current += 1;
          timer = setTimeout(() => setReloadKey((k) => k + 1), 1200 * attempts.current);
          return;
        }
        setError(e instanceof Error ? e.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { data, loading, error, reload };
}