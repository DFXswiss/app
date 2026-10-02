import { act, renderHook } from '@testing-library/react';

const mockCall = jest.fn();
const mockIsEmbedded = jest.fn();
const mockStorageBlocked = jest.fn();
const originalLocation = window.location;
let reload: jest.MockedFunction<() => void>;

afterAll(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
});

jest.mock('src/util/client-error', () => ({ isEmbedded: () => mockIsEmbedded() }));
jest.mock('src/util/storage-block-flag', () => ({ getStorageBlockedFlag: () => mockStorageBlocked() }));
const mockUpdateSession = jest.fn();
const mockGetAuthToken = jest.fn();
const mockReloadUser = jest.fn();
const mockUseApi = jest.fn();
const mockUseApiSession = jest.fn();
const mockUseAuthContext = jest.fn();
const mockUseUserContext = jest.fn();

let mockAuthToken = 'old-token';
let mockUser: { activeAddress?: { address: string; isDeleted?: boolean } } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => mockUseApi(),
  useApiSession: () => mockUseApiSession(),
  useAuthContext: () => mockUseAuthContext(),
  useUserContext: () => mockUseUserContext(),
}));

import { requiresSessionAddress, useAddressReactivation } from 'src/hooks/address-reactivation.hook';

describe('requiresSessionAddress', () => {
  it.each([
    '/account',
    '/account/mail',
    '/settings',
    '/buy',
    '/buy/',
    '/buy/info',
    '/buy/personal-iban',
    '/sell',
    '/sell/info',
    '/swap',
    '/kyc',
    '/profile',
    '/contact',
    '/routes',
    '/safe',
    '/support/tickets',
    '/tx',
  ])('requires a session address for %s', (path) => {
    expect(requiresSessionAddress(path, '')).toBe(true);
  });

  it.each([
    '/',
    '/login',
    '/connect',
    '/support',
    '/tx/T123',
    '/tx/T123/refund',
    '/buy/success',
    '/buy/failure',
    '/kyc/redirect',
    '/kyc/log',
    '/buying',
    '/pl',
    '/error',
  ])('does not require a session address for %s', (path) => {
    expect(requiresSessionAddress(path, '')).toBe(false);
  });

  it.each(['/kyc', '/profile', '/contact'])('does not require a session address for %s with a code', (path) => {
    expect(requiresSessionAddress(path, '?code=abc')).toBe(false);
  });

  it.each([
    ['/kyc', '?code=', true],
    ['/kyc', '?step=x', true],
    ['/buy', '?code=abc', true],
  ])('evaluates %s with %s', (path, search, expected) => {
    expect(requiresSessionAddress(path, search)).toBe(expected);
  });
});

describe('useAddressReactivation', () => {
  beforeEach(() => {
    mockIsEmbedded.mockReturnValue(false);
    mockStorageBlocked.mockReturnValue(false);
    reload = jest.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    mockAuthToken = 'old-token';
    mockUser = { activeAddress: { address: '0xabc', isDeleted: true } };

    mockCall.mockReset();
    mockUpdateSession.mockReset();
    mockGetAuthToken.mockReset();
    mockReloadUser.mockReset();
    mockUseApi.mockReset();
    mockUseApiSession.mockReset();
    mockUseAuthContext.mockReset();
    mockUseUserContext.mockReset();

    mockCall.mockResolvedValue({ accessToken: 'new-token' });
    mockUpdateSession.mockImplementation((token: string) => {
      mockAuthToken = token;
    });
    mockGetAuthToken.mockImplementation(() => mockAuthToken);
    mockReloadUser.mockResolvedValue(undefined);
    mockUseApi.mockImplementation(() => ({ call: mockCall }));
    mockUseApiSession.mockImplementation(() => ({ updateSession: mockUpdateSession }));
    mockUseAuthContext.mockImplementation(() => ({ getAuthToken: mockGetAuthToken }));
    mockUseUserContext.mockImplementation(() => ({ user: mockUser, reloadUser: mockReloadUser }));
  });

  it('exposes the deleted active address', () => {
    const { result } = renderHook(() => useAddressReactivation());

    expect(result.current.deactivatedAddress).toBe('0xabc');
  });

  it.each<{
    description: string;
    user: { activeAddress?: { address: string; isDeleted?: boolean } } | undefined;
  }>([
    { description: 'isDeleted false', user: { activeAddress: { address: '0xabc', isDeleted: false } } },
    { description: 'isDeleted absent', user: { activeAddress: { address: '0xabc' } } },
    { description: 'no active address', user: {} },
    { description: 'no user', user: undefined },
  ])('does not expose an address when there is $description', ({ user }) => {
    mockUser = user;

    const { result } = renderHook(() => useAddressReactivation());

    expect(result.current.deactivatedAddress).toBeUndefined();
  });

  it('reactivates the address, swaps the token before reloading, and hides stale deleted user data', async () => {
    const order: string[] = [];
    mockCall.mockImplementation(async () => {
      order.push('call');
      return { accessToken: 'new-token' };
    });
    mockUpdateSession.mockImplementation((token: string) => {
      order.push('updateSession');
      mockAuthToken = token;
    });
    mockReloadUser.mockImplementation(async () => {
      order.push('reloadUser');
    });
    reload.mockImplementation(() => {
      order.push('reload');
    });
    const { result } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('0xabc');
    });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'user/addresses/0xabc/reactivate',
      version: 'v2',
      method: 'POST',
    });
    expect(mockUpdateSession).toHaveBeenCalledWith('new-token');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(mockReloadUser).not.toHaveBeenCalled();
    expect(order).toEqual(['call', 'updateSession', 'reload']);
    expect(result.current.deactivatedAddress).toBeUndefined();
  });

  it('reloads the user instead of the host page when embedded', async () => {
    const order: string[] = [];
    mockIsEmbedded.mockReturnValue(true);
    mockCall.mockImplementation(async () => {
      order.push('call');
      return { accessToken: 'new-token' };
    });
    mockUpdateSession.mockImplementation((token: string) => {
      order.push('updateSession');
      mockAuthToken = token;
    });
    mockReloadUser.mockImplementation(async () => {
      order.push('reloadUser');
    });
    const { result } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('0xabc');
    });

    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(order).toEqual(['call', 'updateSession', 'reloadUser']);
  });

  it('reloads the user instead of the page when storage is blocked', async () => {
    const order: string[] = [];
    mockStorageBlocked.mockReturnValue(true);
    mockCall.mockImplementation(async () => {
      order.push('call');
      return { accessToken: 'new-token' };
    });
    mockUpdateSession.mockImplementation((token: string) => {
      order.push('updateSession');
      mockAuthToken = token;
    });
    mockReloadUser.mockImplementation(async () => {
      order.push('reloadUser');
    });
    const { result } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('0xabc');
    });

    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(order).toEqual(['call', 'updateSession', 'reloadUser']);
  });

  it('shows the deleted address again after a later sign-in changes the token', async () => {
    const { result, rerender } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('0xabc');
    });
    expect(result.current.deactivatedAddress).toBeUndefined();

    mockAuthToken = 'later-token';
    rerender();

    expect(result.current.deactivatedAddress).toBe('0xabc');
  });

  it('keeps the notice hidden for the new token when reloading leaves stale deleted user data', async () => {
    mockIsEmbedded.mockReturnValue(true);
    mockReloadUser.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('0xabc');
    });
    rerender();

    expect(mockReloadUser).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.deactivatedAddress).toBeUndefined();
  });

  it('URL-encodes reserved characters in the address', async () => {
    const { result } = renderHook(() => useAddressReactivation());

    await act(async () => {
      await result.current.reactivateAddress('account/one?network=two');
    });

    expect(mockCall).toHaveBeenCalledWith({
      url: 'user/addresses/account%2Fone%3Fnetwork%3Dtwo/reactivate',
      version: 'v2',
      method: 'POST',
    });
  });

  it('propagates API errors without updating the session or reloading', async () => {
    const error = new Error('reactivation failed');
    mockCall.mockRejectedValue(error);
    const { result } = renderHook(() => useAddressReactivation());

    await expect(result.current.reactivateAddress('0xabc')).rejects.toBe(error);

    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(mockReloadUser).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.deactivatedAddress).toBe('0xabc');
  });

  it('keeps the returned object stable while its inputs are unchanged', () => {
    const { result, rerender } = renderHook(() => useAddressReactivation());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
