// Regression: setRedirect must remember pathname + search so mail deep-links
// (e.g. /settings?a=call) return to the same section after login. An explicit
// options.redirectPath must stay untouched.

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
});
