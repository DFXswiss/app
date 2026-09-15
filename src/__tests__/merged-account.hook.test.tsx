const mockNavigate = jest.fn();
const mockLogout = jest.fn();

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ logout: mockLogout }),
}));

import { renderHook } from '@testing-library/react';
import { useMergedAccount } from 'src/hooks/merged-account.hook';

describe('useMergedAccount', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockNavigate.mockReset();
    mockLogout.mockReset();
  });

  it('returns false and does not navigate/logout for a non-401 error', () => {
    const { result } = renderHook(() => useMergedAccount());
    expect(result.current.handleMergedError({ statusCode: 500, message: 'error' } as any)).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('returns false and does not navigate/logout for a 401 without switchToCode', () => {
    const { result } = renderHook(() => useMergedAccount());
    expect(result.current.handleMergedError({ statusCode: 401, message: 'unauthorized' } as any)).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('returns true and redirects to /kyc with the switchToCode, clearing kyc-redirect', () => {
    const { result } = renderHook(() => useMergedAccount());
    const handled = result.current.handleMergedError({
      statusCode: 401,
      switchToCode: 'MASTER_CODE',
      message: 'unauthorized',
    } as any);
    expect(handled).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/kyc', search: '?code=MASTER_CODE' },
      { clearParams: ['kyc-redirect'] },
    );
  });

  it('logs out after navigating on a handled merge error, in that order', () => {
    const callOrder: string[] = [];
    mockNavigate.mockImplementation(() => callOrder.push('navigate'));
    mockLogout.mockImplementation(() => callOrder.push('logout'));

    const { result } = renderHook(() => useMergedAccount());
    result.current.handleMergedError({ statusCode: 401, switchToCode: 'MASTER_CODE' } as any);

    expect(callOrder).toEqual(['navigate', 'logout']);
  });
});
