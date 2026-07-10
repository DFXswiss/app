// DFX App 2.0 — generic debounced, stale-guarded quote engine.
//
// Shared core behind useBuyQuote/useSellQuote/useSwapQuote (useTradeQuote.ts). Ports the
// static app's quote lifecycle (public/app2/index.html, `updateQuote()`/`qSeq`/`QUOTE_TTL`):
//  - debounce ~400ms after the inputs settle before firing a request,
//  - a monotonic request sequence number so a slow, superseded response is discarded even if
//    it resolves after a newer one — "never show a quote for an amount the user has already
//    changed",
//  - a 30s TTL: the quote auto-refreshes while its screen is open, and a stale quote never
//    satisfies the "is this quote still good for what's on screen" check a caller does before
//    submitting.
//
// `key` is a caller-built string capturing every input that should invalidate the current
// quote (asset id(s), fiat id, amount, payment method, ...) — `dataKey === key` is how a
// caller knows the held `data` still matches what's on screen right now.

import { useCallback, useEffect, useRef, useState } from 'react';

const QUOTE_TTL_MS = 30_000;
const DEBOUNCE_MS = 400;

export interface QuoteEngineState<TResult> {
  /** The last successful response, or `null` if none is current. */
  data: TResult | null;
  /** The `key` `data` was fetched for — compare against the caller's current `key`. */
  dataKey: string | null;
  loading: boolean;
  /** The raw thrown error from the last failed fetch (map with errors.ts). */
  error: unknown;
  /** Whether `data` is still within the 30s TTL (only meaningful when `dataKey === key`). */
  isFresh: boolean;
  /** Seconds left until the held quote auto-refreshes (0 once stale/refreshing). */
  secondsLeft: number;
  /** Re-fetch immediately (e.g. a manual "refresh" tap after the countdown hit zero). */
  refresh: () => void;
}

export function useQuoteEngine<TResult>(
  enabled: boolean,
  key: string,
  fetcher: () => Promise<TResult>,
  /** Suspends the "quote went stale, auto-refresh it" effect (finding #2: a payment sheet
   * showing this quote's numbers must not have them silently swap out from under the user while
   * it's open). Does not affect the input-driven debounced fetch or a manual `refresh()` call —
   * only the passive 30s-TTL timer. */
  paused = false,
): QuoteEngineState<TResult> {
  const [data, setData] = useState<TResult | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);

  const seqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  const quoteAtRef = useRef(0);
  const fetchingRef = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const clearTimers = useCallback(() => {
    clearTimeout(debounceRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const execute = useCallback((forKey: string) => {
    const seq = ++seqRef.current;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (seq !== seqRef.current) return; // superseded by a newer request — discard
        fetchingRef.current = false;
        quoteAtRef.current = Date.now();
        setData(result);
        setDataKey(forKey);
        setLoading(false);
        // tick every second so the "refreshes in Ns" countdown renders live, matching the
        // static app's startQuoteCountdown()
        clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => setTick((n) => n + 1), 1000);
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current) return;
        fetchingRef.current = false;
        setData(null);
        setDataKey(null);
        setLoading(false);
        setError(err);
      });
  }, []);

  const refresh = useCallback(() => {
    clearTimers();
    if (enabled && key) execute(key);
  }, [enabled, key, execute, clearTimers]);

  useEffect(() => {
    clearTimers();
    seqRef.current += 1; // invalidate any in-flight request from a previous key
    if (!enabled || !key) {
      setData(null);
      setDataKey(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => execute(key), DEBOUNCE_MS);
    return () => {
      clearTimers();
      // A fetch already in flight for the key/enabled this effect is tearing down must not be
      // allowed to land after unmount (or after the next effect run swaps in a new key) — it
      // would otherwise pass the `seq === seqRef.current` check in execute()'s .then() and start
      // a countdown `setInterval` that nothing is left to clear (finding #4).
      seqRef.current += 1;
    };
    // `execute`/`clearTimers` are intentionally excluded — this effect should only re-run when
    // the caller's inputs (`enabled`/`key`) actually change, not on every render
  }, [enabled, key]);

  // once the held quote goes stale (TTL elapsed) while still current, auto-refresh it — unless
  // paused (finding #2: a payment sheet showing this quote must own when it refreshes)
  useEffect(() => {
    if (dataKey !== key || !enabled || fetchingRef.current || pausedRef.current) return;
    const ageMs = Date.now() - quoteAtRef.current;
    if (ageMs >= QUOTE_TTL_MS) {
      execute(key);
    }
    // fires once per second (`tick`) purely to re-check the age against the TTL
  }, [tick]);

  const ageMs = dataKey === key ? Date.now() - quoteAtRef.current : Infinity;
  const isFresh = dataKey === key && ageMs < QUOTE_TTL_MS;
  const secondsLeft = isFresh ? Math.max(0, Math.ceil((QUOTE_TTL_MS - ageMs) / 1000)) : 0;

  useEffect(() => clearTimers, [clearTimers]);

  return { data, dataKey, loading, error, isFresh, secondsLeft, refresh };
}
