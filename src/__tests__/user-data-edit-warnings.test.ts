import { act, renderHook } from '@testing-library/react';
import { dismissFailedEditLog, reportFailedEditLog, useFailedEditLogs } from 'src/util/user-data-edit-warnings';

type Listener = () => void;

let mockCapturedSubscribe: ((listener: Listener) => () => void) | undefined;

function capturedSubscribe(): (listener: Listener) => () => void {
  if (!mockCapturedSubscribe) throw new Error('useSyncExternalStore did not receive a subscribe function');
  return mockCapturedSubscribe;
}

// The store keeps subscribe private. Capture what the hook hands to useSyncExternalStore so the
// tests can exercise the unsubscribe contract directly.
jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react');
  return {
    ...actual,
    useSyncExternalStore: (subscribe: (listener: () => void) => () => void, getSnapshot: () => unknown): unknown => {
      mockCapturedSubscribe = subscribe;
      return actual.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    },
  };
});

// There is no public reset: each test dismisses what it reported.
const reportedIds = new Set<number>();

function report(userDataId: number, message: string): void {
  reportedIds.add(userDataId);
  reportFailedEditLog(userDataId, message);
}

describe('user data edit warnings', () => {
  beforeEach(() => {
    reportedIds.forEach((userDataId) => dismissFailedEditLog(userDataId));
    reportedIds.clear();
    mockCapturedSubscribe = undefined;
  });

  it('reports one entry per customer', () => {
    report(11, 'first');
    report(22, 'second');

    const { result } = renderHook(() => useFailedEditLogs());

    expect(result.current).toEqual([
      { userDataId: 11, message: 'first' },
      { userDataId: 22, message: 'second' },
    ]);
  });

  it('replaces the message when the same customer is reported again', () => {
    report(11, 'first');
    report(22, 'other');
    const { result } = renderHook(() => useFailedEditLogs());
    const before = result.current;

    act(() => report(11, 'second'));

    expect(result.current).toEqual([
      { userDataId: 11, message: 'second' },
      { userDataId: 22, message: 'other' },
    ]);
    expect(result.current).not.toBe(before);
  });

  it('re-renders the hook on report and on dismiss', () => {
    const { result } = renderHook(() => useFailedEditLogs());
    expect(result.current).toEqual([]);

    act(() => report(31, 'first'));
    expect(result.current).toEqual([{ userDataId: 31, message: 'first' }]);

    act(() => dismissFailedEditLog(31));
    expect(result.current).toEqual([]);
  });

  it('dismisses only the entry of the given customer', () => {
    report(11, 'first');
    report(22, 'second');
    const { result } = renderHook(() => useFailedEditLogs());

    act(() => dismissFailedEditLog(11));

    expect(result.current).toEqual([{ userDataId: 22, message: 'second' }]);
  });

  it('does not notify when dismissing a customer without an entry', () => {
    const { unmount } = renderHook(() => useFailedEditLogs());
    const listener = jest.fn();
    const unsubscribe = capturedSubscribe()(listener);

    dismissFailedEditLog(999);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    unmount();
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const { unmount } = renderHook(() => useFailedEditLogs());
    const listener = jest.fn();
    const unsubscribe = capturedSubscribe()(listener);

    act(() => report(41, 'first'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    act(() => report(41, 'second'));

    expect(listener).toHaveBeenCalledTimes(1);
    unmount();
  });
});
