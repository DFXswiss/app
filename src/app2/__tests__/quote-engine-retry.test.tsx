// A failed quote refresh used to be a dead end: the TTL auto-refresh effect only re-fires while
// `dataKey === key`, and a failure clears `dataKey` — so nothing ever retried on its own — while
// the countdown `setInterval` left running from an earlier success just kept ticking (and
// re-rendering) forever with nothing to do. This pins both halves of the fix: a bounded backoff
// retry actually re-fetches, and every timer this hook owns is gone once that ladder is
// exhausted — not just "no visible symptom", the literal timer count.

import { act, renderHook } from '@testing-library/react';
import { useQuoteEngine } from '../screens/trade/useQuoteEngine';

describe('useQuoteEngine error-path timers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a failed fetch within the backoff window instead of stalling forever', async () => {
    const fetcher = jest.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useQuoteEngine(true, 'k', fetcher));

    // initial debounced fetch
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();

    // first backoff step is 5s — nothing must have retried before it elapses
    await act(async () => {
      jest.advanceTimersByTime(4_999);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual({ ok: true });
    expect(result.current.error).toBeNull();
  });

  it('leaves no running timer once the retry ladder is exhausted (a permanent failure stops, it does not tick forever)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('still down'));

    renderHook(() => useQuoteEngine(true, 'k', fetcher));

    // initial fetch + 3 backoff retries (5s / 15s / 30s), all failing
    await act(async () => {
      jest.advanceTimersByTime(400);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    expect(fetcher).toHaveBeenCalledTimes(4); // 1 initial + 3 backoff attempts, then it gives up
    // The old bug was exactly this: a countdown `setInterval` from a stale success (or nothing
    // that ever gets cleared on the error path) kept the timer count above zero indefinitely.
    expect(jest.getTimerCount()).toBe(0);
  });
});
