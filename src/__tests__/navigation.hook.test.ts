// Full coverage of useNavigation beyond setRedirect (see navigation-redirect.test.ts).

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

describe('useNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/settings';
    mockSearch = '?a=call';
    mockRedirectPath = undefined;
  });

  it('passes a number target through to navigateTo without setting a redirect path', () => {
    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate(-1);
    });

    expect(mockNavigateTo).toHaveBeenCalledTimes(1);
    expect(mockNavigateTo).toHaveBeenCalledWith(-1);
    expect(mockSetRedirectPath).not.toHaveBeenCalled();
  });

  it('merges live search with object target search; target params win on collision', () => {
    mockSearch = '?a=call&b=live';
    mockPathname = '/settings';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate({ pathname: '/x', search: '?b=2' });
    });

    expect(mockNavigateTo).toHaveBeenCalledTimes(1);
    const target = mockNavigateTo.mock.calls[0][0] as { pathname: string; search: string };
    expect(target.pathname).toBe('/x');
    const params = new URLSearchParams(target.search.startsWith('?') ? target.search.slice(1) : target.search);
    expect(params.get('a')).toBe('call');
    expect(params.get('b')).toBe('2');
  });

  it('clearParams on object navigate removes only the listed keys from the merge', () => {
    mockSearch = '?a=call&code=secret&keep=yes';
    mockPathname = '/kyc';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.navigate({ pathname: '/2fa', search: '' }, { clearParams: ['code'] });
    });

    const target = mockNavigateTo.mock.calls[0][0] as { pathname: string; search: string };
    const params = new URLSearchParams(target.search.startsWith('?') ? target.search.slice(1) : target.search);
    expect(params.get('code')).toBeNull();
    expect(params.get('a')).toBe('call');
    expect(params.get('keep')).toBe('yes');
  });

  it('setParams navigates to the current pathname with merged params', () => {
    mockPathname = '/settings';
    mockSearch = '?a=call';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.setParams(new URLSearchParams('x=1'));
    });

    expect(mockNavigateTo).toHaveBeenCalledTimes(1);
    expect(mockNavigateTo.mock.calls[0][0]).toBe('/settings?a=call&x=1');
  });

  it('clearParams navigates with replace to the current pathname without the listed keys', () => {
    mockPathname = '/settings';
    mockSearch = '?a=call&keep=1';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.clearParams(['a']);
    });

    expect(mockNavigateTo).toHaveBeenCalledTimes(1);
    const [to, options] = mockNavigateTo.mock.calls[0];
    const target = to as { pathname: string; search: string };
    expect(target.pathname).toBe('/settings');
    const params = new URLSearchParams(target.search.startsWith('?') ? target.search.slice(1) : target.search);
    expect(params.get('a')).toBeNull();
    expect(params.get('keep')).toBe('1');
    expect(options).toEqual(expect.objectContaining({ replace: true }));
  });

  it('goBack without a stored redirect path lands on /account', () => {
    mockRedirectPath = undefined;
    mockPathname = '/login';
    mockSearch = '';

    const { result } = renderHook(() => useNavigation());

    act(() => {
      result.current.goBack();
    });

    expect(mockSetRedirectPath).toHaveBeenCalledWith(undefined);
    expect(mockNavigateTo).toHaveBeenCalled();
    expect(mockNavigateTo.mock.calls[0][0]).toBe('/account');
  });
});
