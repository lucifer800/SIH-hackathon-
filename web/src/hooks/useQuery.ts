import { useCallback, useEffect, useRef, useState } from "react";

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

const CACHE = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

function getDepKey(fn: () => unknown, deps: unknown[]) {
  // fn.toString() distinguishes call sites sharing the same deps array
  // (e.g. two `useQuery(fetcher, [])` calls on one screen) so they don't
  // collide on the same cache entry.
  return fn.toString() + "|" + JSON.stringify(deps);
}

/**
 * Tiny server-state hook. Replaces ad-hoc useEffect+useState across screens.
 * Handles loading, error, and refetch — no external dependency needed.
 * Caches results by call site + dependency array for 30s.
 *
 * Pass `{ fresh: true }` for data that must never show a stale value on
 * mount (e.g. a screen the user lands on right after an action elsewhere
 * changed the data, like Alerts right after a booking) — it still caches
 * for subsequent renders but always bypasses the cache on first mount.
 *
 * Usage: const { data, loading, error, refetch } = useQuery(() => api.dashboard(lang), [lang]);
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { fresh?: boolean } = {}): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);
  const key = getDepKey(fn, deps);

  const run = useCallback((force = false) => {
    const id = ++seq.current;
    const cached = CACHE.get(key);
    if (!force && cached && Date.now() - cached.ts < CACHE_TTL) {
      setData(cached.data);
      setLoading(false);
      setError(false);
      return;
    }
    if (force) CACHE.delete(key);
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

  useEffect(() => { run(opts.fresh); }, [run]);

  return { data, loading, error, refetch: () => run(true) };
}
