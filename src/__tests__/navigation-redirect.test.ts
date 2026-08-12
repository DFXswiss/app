// Regression: setRedirect must remember pathname + allowlisted search so mail deep-links
// (e.g. /settings?a=call) return to the same section after login, without forwarding
// sensitive params (e.g. code=) into magic-link / Alby redirectUri.
// An explicit options.redirectPath must stay untouched.

// utils.ts pulls ESM from @dfx.swiss/react via navigation.hook → relativeUrl; stub it.
jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('src/dto/safe.dto', () => ({}));

const mockSetRedirectPath = jest.fn();
const mockNavigateTo = jest.fn();
let mockPathname = '/settings';
let mockSearch = '?a=call';
let mockRedirectPath: string | undefined;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigateTo,
  useLocation: () => ({ pathname: mockPathname, search: mockSearch }),
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({
    redirectPath: mockRedirectPath,
    setRedirectPath: mockSetRedirectPath,
  }),
}));

import { act, renderHook } from '@testing-library/react';
import { useNavigation } from '../hooks/navigation.hook';

describe('useNavigation setRedirect query survival', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/settings';
    mockSearch = '?a=call';
    mockRedirectPath = undefined;
  });

  it('includes the location query when memorizing the current path for return', () => {
    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/login', { setRedirect: true });
    });

    expect(mockSetRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/settings?a=call');
  });

  it('uses an explicit redirectPath unchanged (no query appended from location)', () => {
    mockPathname = '/settings';
    mockSearch = '?a=call';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/login', { setRedirect: true, redirectPath: '/account' });
    });

    expect(mockSetRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/account');
    expect(mockSetRedirectPath.mock.calls[0][0]).not.toContain('a=call');
  });

  it('stores the bare pathname when the location has no query (no empty ?)', () => {
    mockPathname = '/settings';
    mockSearch = '';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/login', { setRedirect: true });
    });

    expect(mockSetRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/settings');
    expect(mockSetRedirectPath.mock.calls[0][0]).not.toContain('?');
  });

  it('discards code (KYC access hash) when memorizing the return path', () => {
    mockPathname = '/kyc';
    mockSearch = '?code=secret-kyc-hash';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/2fa', { setRedirect: true });
    });

    expect(mockSetRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/kyc');
    expect(mockSetRedirectPath.mock.calls[0][0]).not.toContain('code');
  });

  it('keeps allowlisted params and drops the rest when mixed', () => {
    mockPathname = '/settings';
    mockSearch = '?a=call&code=secret-kyc-hash&user=alice@example.com';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/login', { setRedirect: true });
    });

    expect(mockSetRedirectPath).toHaveBeenCalledTimes(1);
    expect(mockSetRedirectPath).toHaveBeenCalledWith('/settings?a=call');
    const stored: string = mockSetRedirectPath.mock.calls[0][0];
    expect(stored).not.toContain('code');
    expect(stored).not.toContain('user');
  });

  it('navigateTo receives the merged relative target (not the bare path)', () => {
    mockPathname = '/settings';
    mockSearch = '?a=call';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate('/login', { setRedirect: true });
    });

    // navigate(string) must call navigateTo(relativeUrl({ path: to, params: live search })),
    // not navigateTo(to) alone — otherwise live query is dropped on the way to the target.
    expect(mockNavigateTo).toHaveBeenCalled();
    expect(mockNavigateTo.mock.calls[0][0]).toBe('/login?a=call');
  });

  it('goBack navigates to the stored redirectPath, not a hard-coded default', () => {
    mockRedirectPath = '/settings?a=call';
    mockPathname = '/login';
    mockSearch = '';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.goBack();
    });

    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
    expect(mockNavigateTo).toHaveBeenCalled();
    expect(mockNavigateTo.mock.calls[0][0]).toBe('/settings?a=call');
  });
});
