import { useCallback, useEffect, useRef, useState } from "react";

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

const CACHE = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

function getDepKey(deps: unknown[]) {
  return JSON.stringify(deps);
}

/**
 * Tiny server-state hook. Replaces ad-hoc useEffect+useState across screens.
 * Handles loading, error, and refetch — no external dependency needed.
 * Caches results by dependency array for 30s.
 *
 * Usage: const { data, loading, error, refetch } = useQuery(() => api.dashboard(lang), [lang]);
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const key = getDepKey(deps);

  const run = useCallback(() => {
    const id = ++seq.current;
    const cached = CACHE.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    fn()
      .then((d) => {
        if (id === seq.current) {
          CACHE.set(key, { data: d, ts: Date.now() });
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => { if (id === seq.current) { setError(true); setLoading(false); } });
  }, [key]);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}
