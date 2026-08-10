import { useCallback, useEffect, useRef, useState } from 'react';
import { isJobTicket, JobStatus, JobTicket } from 'src/dto/job.dto';

export const JOB_TRACKER_TIMEOUT_ERROR = 'JOB_TRACKER_TIMEOUT';

const TRACKING_TIMEOUT_MS = 600_000;
const CLOCK_INTERVAL_MS = 1000;

function backoffDelayMs(completedAttempts: number): number {
  if (completedAttempts === 0) return 1000;
  if (completedAttempts === 1) return 2000;
  return 5000;
}

function isTerminalApiError(err: unknown): err is { statusCode: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'message' in err &&
    ((err as { statusCode: number }).statusCode === 400 ||
      (err as { statusCode: number }).statusCode === 409)
  );
}

export function useJobTracker<T>(fetchResult: () => Promise<T | JobTicket>): {
  result: T | undefined;
  ticket: JobTicket | undefined;
  isOverdue: boolean;
  error: string | undefined;
  start: () => void;
} {
  const [result, setResult] = useState<T | undefined>();
  const [ticket, setTicket] = useState<JobTicket | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [now, setNow] = useState(() => Date.now());

  const fetchResultRef = useRef(fetchResult);
  fetchResultRef.current = fetchResult;

  const mountedRef = useRef(true);
  const trackingRef = useRef(false);
  const startTimeRef = useRef(0);
  const attemptCountRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const clockRef = useRef<ReturnType<typeof setInterval>>();
  const deadlineTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
    if (clockRef.current !== undefined) {
      clearInterval(clockRef.current);
      clockRef.current = undefined;
    }
    if (deadlineTimeoutRef.current !== undefined) {
      clearTimeout(deadlineTimeoutRef.current);
      deadlineTimeoutRef.current = undefined;
    }
  }, []);

  const stopTracking = useCallback(() => {
    trackingRef.current = false;
    clearTimers();
  }, [clearTimers]);

  const runFetchRef = useRef<() => Promise<void>>(async () => undefined);

  const scheduleNext = useCallback(() => {
    if (!trackingRef.current || !mountedRef.current) return;

    if (Date.now() - startTimeRef.current >= TRACKING_TIMEOUT_MS) {
      setError(JOB_TRACKER_TIMEOUT_ERROR);
      stopTracking();
      return;
    }

    const delay = backoffDelayMs(attemptCountRef.current);
    attemptCountRef.current += 1;

    timeoutRef.current = setTimeout(() => {
      void runFetchRef.current();
    }, delay);
  }, [stopTracking]);

  const runFetch = useCallback(async () => {
    if (!trackingRef.current || !mountedRef.current) return;

    if (Date.now() - startTimeRef.current >= TRACKING_TIMEOUT_MS) {
      if (mountedRef.current) setError(JOB_TRACKER_TIMEOUT_ERROR);
      stopTracking();
      return;
    }

    try {
      const value = await fetchResultRef.current();
      if (!mountedRef.current || !trackingRef.current) return;

      if (isJobTicket(value)) {
        setTicket(value);
        if (value.status === JobStatus.Failed || value.status === JobStatus.DeadLetter) {
          setError(`Job ${value.status}`);
          stopTracking();
          return;
        }
        scheduleNext();
      } else {
        setResult(value);
        stopTracking();
      }
    } catch (err) {
      if (!mountedRef.current || !trackingRef.current) return;

      if (isTerminalApiError(err)) {
        setError(err.message);
        stopTracking();
        return;
      }

      scheduleNext();
    }
  }, [scheduleNext, stopTracking]);

  runFetchRef.current = runFetch;

  const start = useCallback(() => {
    clearTimers();
    trackingRef.current = true;
    startTimeRef.current = Date.now();
    attemptCountRef.current = 0;

    if (mountedRef.current) {
      setResult(undefined);
      setTicket(undefined);
      setError(undefined);
      setNow(Date.now());
    }

    clockRef.current = setInterval(() => {
      if (mountedRef.current) {
        setNow(Date.now());
      }
    }, CLOCK_INTERVAL_MS);

    deadlineTimeoutRef.current = setTimeout(() => {
      if (!trackingRef.current || !mountedRef.current) return;
      setError(JOB_TRACKER_TIMEOUT_ERROR);
      stopTracking();
    }, TRACKING_TIMEOUT_MS);

    void runFetch();
  }, [clearTimers, runFetch, stopTracking]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      trackingRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  // expectedSeconds may be omitted at runtime despite the type — do not invent a default threshold.
  const isOverdue =
    ticket !== undefined &&
    result === undefined &&
    error === undefined &&
    typeof ticket.expectedSeconds === 'number' &&
    (now - new Date(ticket.created).getTime()) / 1000 > ticket.expectedSeconds;

  return { result, ticket, isOverdue, error, start };
}
