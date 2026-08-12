import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallQueueClerks } from 'src/hooks/call-queue-clerks.hook';

const mockGetCallQueueClerks = jest.fn();

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getCallQueueClerks: mockGetCallQueueClerks }),
}));

describe('useCallQueueClerks', () => {
  beforeEach(() => {
    mockGetCallQueueClerks.mockReset();
  });

  it('loads the configured clerks', async () => {
    mockGetCallQueueClerks.mockResolvedValue(['JR', 'AB']);

    const { result } = renderHook(() => useCallQueueClerks());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.clerks).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clerks).toEqual(['JR', 'AB']);
    expect(result.current.error).toBeUndefined();
  });

  it('exposes the message when loading fails with an Error', async () => {
    mockGetCallQueueClerks.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useCallQueueClerks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clerks).toEqual([]);
    expect(result.current.error).toBe('Network down');
  });

  it('uses a fallback message when loading fails with a non-Error value', async () => {
    mockGetCallQueueClerks.mockRejectedValue('boom');

    const { result } = renderHook(() => useCallQueueClerks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.clerks).toEqual([]);
    expect(result.current.error).toBe('Unknown error');
  });

  it('ignores a resolved request after unmounting', async () => {
    let resolveRequest!: (clerks: string[]) => void;
    const request = new Promise<string[]>((resolve) => {
      resolveRequest = resolve;
    });
    mockGetCallQueueClerks.mockReturnValue(request);
    const { unmount } = renderHook(() => useCallQueueClerks());

    unmount();

    // React 18 has no observable state-update warning after unmount; resolving
    // without error still exercises the cancelled === true guard branch.
    await act(async () => {
      resolveRequest(['JR']);
      await Promise.resolve();
    });
  });

  it('ignores a rejected request after unmounting', async () => {
    let rejectRequest!: (reason: unknown) => void;
    const request = new Promise<string[]>((_, reject) => {
      rejectRequest = reject;
    });
    mockGetCallQueueClerks.mockReturnValue(request);
    const { unmount } = renderHook(() => useCallQueueClerks());

    unmount();

    // React 18 has no observable state-update warning after unmount; rejecting
    // without error still exercises the cancelled === true guard branch.
    await act(async () => {
      rejectRequest(new Error('Network down'));
      await Promise.resolve();
    });
  });
});
