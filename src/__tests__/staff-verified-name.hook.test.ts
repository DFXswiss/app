import { act, renderHook, waitFor } from '@testing-library/react';
import { clearStaffVerifiedNameCache, useStaffVerifiedName } from 'src/hooks/staff-verified-name.hook';

const mockGetUserData = jest.fn();
const mockGetSupportClerk = jest.fn();
const mockGetRealunitClerk = jest.fn();
const mockAuth: { session?: { account?: number; role?: string } } = {
  session: { account: 42, role: 'Support' },
};

jest.mock('@dfx.swiss/react', () => ({
  useAuthContext: () => mockAuth,
  UserRole: {
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    REALUNIT: 'RealUnit',
  },
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData }),
}));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  useSupportDashboard: () => ({ getMyClerk: mockGetSupportClerk }),
}));

jest.mock('src/hooks/realunit-support.hook', () => ({
  useRealunitSupport: () => ({ getMyClerk: mockGetRealunitClerk }),
}));

describe('useStaffVerifiedName', () => {
  beforeEach(() => {
    mockGetUserData.mockReset();
    mockGetSupportClerk.mockReset();
    mockGetRealunitClerk.mockReset();
    mockAuth.session = { account: 42, role: 'Support' };
    clearStaffVerifiedNameCache();
  });

  it('loads the trimmed clerk name from the support endpoint', async () => {
    mockGetSupportClerk.mockResolvedValue({ clerkUserDataId: 42, clerk: '  Ada Lovelace  ' });

    const { result } = renderHook(() => useStaffVerifiedName());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.name).toBeUndefined();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetSupportClerk).toHaveBeenCalledTimes(1);
    expect(mockGetUserData).not.toHaveBeenCalled();
    expect(mockGetRealunitClerk).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Ada Lovelace');
    expect(result.current.error).toBeUndefined();
  });

  it('uses the RealUnit clerk endpoint and does not call getUserData when clerk is present', async () => {
    mockAuth.session = { account: 42, role: 'RealUnit' };
    mockGetRealunitClerk.mockResolvedValue({ clerkUserDataId: 42, clerk: 'Real Unit Clerk' });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetRealunitClerk).toHaveBeenCalledTimes(1);
    expect(mockGetSupportClerk).not.toHaveBeenCalled();
    expect(mockGetUserData).not.toHaveBeenCalled();
    expect(result.current.name).toBe('Real Unit Clerk');
  });

  it('falls back to getUserData when clerk is null', async () => {
    mockGetSupportClerk.mockResolvedValue(undefined);
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: '  Grace Hopper  ' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetSupportClerk).toHaveBeenCalledTimes(1);
    expect(mockGetUserData).toHaveBeenCalledWith(42);
    expect(result.current.name).toBe('Grace Hopper');
    expect(result.current.error).toBeUndefined();
  });

  it('falls back to getUserData when clerk is blank', async () => {
    mockGetSupportClerk.mockResolvedValue({ clerkUserDataId: 42, clerk: '   ' });
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: 'Ada Lovelace' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetUserData).toHaveBeenCalledWith(42);
    expect(result.current.name).toBe('Ada Lovelace');
  });

  it('treats blank clerk plus blank verifiedName as missing', async () => {
    mockGetSupportClerk.mockResolvedValue(undefined);
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: '   ' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.name).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });

  it('falls back to getUserData when the clerk endpoint fails', async () => {
    mockGetSupportClerk.mockRejectedValue(new Error('Not Found'));
    mockGetUserData.mockResolvedValue({ userData: { verifiedName: 'Ada Lovelace' } });

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetUserData).toHaveBeenCalledWith(42);
    expect(result.current.name).toBe('Ada Lovelace');
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces an error when the clerk endpoint fails and getUserData also fails', async () => {
    mockGetSupportClerk.mockRejectedValue(new Error('Not Found'));
    mockGetUserData.mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetUserData).toHaveBeenCalledWith(42);
    expect(result.current.name).toBeUndefined();
    expect(result.current.error).toBe('Forbidden');
  });

  it('surfaces a fallback error when clerk is empty and getUserData fails', async () => {
    mockGetSupportClerk.mockResolvedValue(undefined);
    mockGetUserData.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.name).toBeUndefined();
    expect(result.current.error).toBe('Network down');
  });

  it('uses a fallback message when getUserData fails with a non-Error value', async () => {
    mockGetSupportClerk.mockResolvedValue(undefined);
    mockGetUserData.mockRejectedValue('boom');

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Unknown error');
  });

  it('uses the fallback message when getUserData fails with an empty Error message', async () => {
    mockGetSupportClerk.mockResolvedValue(undefined);
    mockGetUserData.mockRejectedValue(new Error(''));

    const { result } = renderHook(() => useStaffVerifiedName());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Unknown error');
  });

  it('does not fetch when the session has no account', async () => {
    mockAuth.session = {};

    const { result } = renderHook(() => useStaffVerifiedName());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.name).toBeUndefined();
    expect(mockGetSupportClerk).not.toHaveBeenCalled();
    expect(mockGetRealunitClerk).not.toHaveBeenCalled();
    expect(mockGetUserData).not.toHaveBeenCalled();
  });

  it('reloads from the RealUnit endpoint when the same account changes role', async () => {
    mockGetSupportClerk.mockResolvedValue({ clerkUserDataId: 42, clerk: 'Ada Lovelace' });
    mockGetRealunitClerk.mockResolvedValue({ clerkUserDataId: 42, clerk: 'Real Unit Clerk' });

    const { result, rerender } = renderHook(() => useStaffVerifiedName());
    await waitFor(() => expect(result.current.name).toBe('Ada Lovelace'));
    expect(mockGetSupportClerk).toHaveBeenCalledTimes(1);
    expect(mockGetRealunitClerk).not.toHaveBeenCalled();

    mockAuth.session = { account: 42, role: 'RealUnit' };
    rerender();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.name).toBeUndefined();

    await waitFor(() => expect(result.current.name).toBe('Real Unit Clerk'));
    expect(mockGetRealunitClerk).toHaveBeenCalledTimes(1);
    expect(mockGetSupportClerk).toHaveBeenCalledTimes(1);
  });

  it('reuses the in-flight request for the same account', async () => {
    let resolveRequest!: (value: { clerkUserDataId: number; clerk: string } | undefined) => void;
    const request = new Promise<{ clerkUserDataId: number; clerk: string } | undefined>((resolve) => {
      resolveRequest = resolve;
    });
    mockGetSupportClerk.mockReturnValue(request);

    const first = renderHook(() => useStaffVerifiedName());
    const second = renderHook(() => useStaffVerifiedName());

    expect(mockGetSupportClerk).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ clerkUserDataId: 42, clerk: 'Ada Lovelace' });
      await request;
    });

    await waitFor(() => expect(first.result.current.name).toBe('Ada Lovelace'));
    expect(second.result.current.name).toBe('Ada Lovelace');
  });

  it('does not keep the previous name while another account is loading', async () => {
    mockGetSupportClerk.mockImplementation(() => {
      const account = mockAuth.session?.account;
      const clerk = account === 42 ? 'Ada Lovelace' : 'Grace Hopper';
      return Promise.resolve({ clerkUserDataId: account ?? 0, clerk });
    });

    const { result, rerender } = renderHook(() => useStaffVerifiedName());
    await waitFor(() => expect(result.current.name).toBe('Ada Lovelace'));

    mockAuth.session = { account: 7, role: 'Support' };
    rerender();

    expect(result.current.isLoading).toBe(true);
    expect(result.current.name).toBeUndefined();

    await waitFor(() => expect(result.current.name).toBe('Grace Hopper'));
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores a resolved request after unmounting', async () => {
    let resolveRequest!: (value: { clerkUserDataId: number; clerk: string } | undefined) => void;
    const request = new Promise<{ clerkUserDataId: number; clerk: string } | undefined>((resolve) => {
      resolveRequest = resolve;
    });
    mockGetSupportClerk.mockReturnValue(request);
    const { unmount } = renderHook(() => useStaffVerifiedName());

    unmount();

    await act(async () => {
      resolveRequest({ clerkUserDataId: 42, clerk: 'Ada Lovelace' });
      await Promise.resolve();
    });
  });

  it('ignores a rejected request after unmounting', async () => {
    let rejectRequest!: (reason: unknown) => void;
    const request = new Promise<string | undefined>((_, reject) => {
      rejectRequest = reject;
    });
    mockGetSupportClerk.mockReturnValue(request);
    const { unmount } = renderHook(() => useStaffVerifiedName());

    unmount();

    await act(async () => {
      rejectRequest(new Error('Network down'));
      await Promise.resolve();
    });
  });
});
