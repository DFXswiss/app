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

  it('leaves no running timer once the retry ladder is exhausted on a permanently failing fetch (never even got a countdown interval to begin with)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('still down'));

    renderHook(() => useQuoteEngine(true, 'k', fetcher));

    // initial fetch + 3 backoff retries (5s / 15s / 30s), all failing — every fetch this hook
    // ever makes rejects, so no countdown interval is ever created in this scenario; this only
    // proves the backoff timers themselves are fully consumed, not that a *pre-existing* interval
    // gets cleared (see the next test for that).
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
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the countdown interval left running from an earlier success once a later refresh fails', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({ ok: true }) // initial load succeeds — starts the 1s countdown interval
      .mockRejectedValue(new Error('down')); // every fetch after that fails

    const { result } = renderHook(() => useQuoteEngine(true, 'k', fetcher));

    await act(async () => {
      jest.advanceTimersByTime(400); // debounce
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ ok: true });
    // The countdown interval from the successful load is now running — this is the pre-existing
    // timer the old bug never cleared on a later failure.
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    // Advance past the 30s TTL: the auto-refresh effect fires execute() again, and this one fails.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeTruthy();

    // Drain the 3 backoff retries (5s / 15s / 30s), all failing too, then nothing should be left
    // running — neither the old countdown interval nor a further retry timer.
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

    expect(fetcher).toHaveBeenCalledTimes(5); // 1 success + 1 TTL-triggered failure + 3 backoff retries
    expect(jest.getTimerCount()).toBe(0);
  });
});
