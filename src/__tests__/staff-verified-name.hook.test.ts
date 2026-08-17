import { act, renderHook, waitFor } from '@testing-library/react';
import { clearStaffVerifiedNameCache, useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';

const mockGetUserData = jest.fn();
const mockAuth: { session?: { account?: number } } = { session: { account: 42 } };

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => mockAuth,
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

describe('useStaffVerifiedName', () => {
  beforeEach(() => {
    mockGetUserData.mockReset();
    mockAuth.session = { account: 42 };
    clearStaffVerifiedNameCache();
  });

  it('loads the trimmed verified name for the logged-in account', async () => {
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: '  Ada Lovelace  ' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.name).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetUserData).toHaveBeenCalledWith(42);
    expect(result.current.name).toBe('Ada Lovelace');
    expect(result.current.error).toBeUndefined();
  });

  it('treats a blank verified name as missing', async () => {
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: '   ' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.name).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('does not fetch when the session has no account', async () => {
    mockAuth.session = {};

    const { result } = renderHook(() => useStaffVerifiedName());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.name).toBeUndefined();
    expect(mockGetUserData).not.toHaveBeenCalled();
  });

  it('exposes the message when loading fails with an Error', async () => {
    mockGetUserData.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.name).toBeUndefined();
    expect(result.current.error).toBe('Network down');
  });

  it('uses a fallback message when loading fails with a non-Error value', async () => {
    mockGetUserData.mockRejectedValue('boom');

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Unknown error');
  });

  it('uses the fallback message when the Error carries an empty message', async () => {
    mockGetUserData.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Unknown error');
  });

  it('reuses the in-flight request for the same account', async () => {
    let resolveRequest!: (value: { userData: { verifiedName: string } }) => void;
    const request = new Promise<{ userData: { verifiedName: string } }>((resolve) => {
      resolveRequest = resolve;
    });
    mockGetUserData.mockReturnValue(request);

    const first = renderHook(() => useStaffVerifiedName());
    const second = renderHook(() => useStaffVerifiedName());

    expect(mockGetUserData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ userData: { verifiedName: 'Ada Lovelace' } });
      await request;
    });

    await waitFor(() => expect(first.result.current.name).toBe('Ada Lovelace'));
    expect(second.result.current.name).toBe('Ada Lovelace');
  });

  it('ignores a resolved request after unmounting', async () => {
    let resolveRequest!: (value: { userData: { verifiedName: string } }) => void;
    const request = new Promise<{ userData: { verifiedName: string } }>((resolve) => {
      resolveRequest = resolve;
    });
    mockGetUserData.mockReturnValue(request);
    const { unmount } = renderHook(() => useStaffVerifiedName());

    unmount();

    await act(async () => {
      resolveRequest({ userData: { verifiedName: 'Ada Lovelace' } });
      await Promise.resolve();
    });
  });

  it('ignores a rejected request after unmounting', async () => {
    let rejectRequest!: (reason: unknown) => void;
    const request = new Promise((_, reject) => {
      rejectRequest = reject;
    });
    mockGetUserData.mockReturnValue(request);
    const { unmount } = renderHook(() => useStaffVerifiedName());

    unmount();

    await act(async () => {
      rejectRequest(new Error('Network down'));
      await Promise.resolve();
    });
  });
});
