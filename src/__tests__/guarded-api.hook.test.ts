import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();
const mockUseApi = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  TfaLevel: { STRICT: 'Strict' },
  useApi: (...args: unknown[]) => mockUseApi(...args),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { TfaLevel } from '@dfx.swiss/react';
import { useGuardedApi, useStaffErrorGuard } from 'src/hooks/guarded-api.hook';

describe('useStaffErrorGuard', () => {
  it('passes resolved values through', async () => {
    const value = { id: 88001 };
    const { result } = renderHook(() => useStaffErrorGuard());

    await expect(result.current(Promise.resolve(value))).resolves.toBe(value);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects TFA-required errors and rethrows them', async () => {
    const error = { code: 'TFA_REQUIRED' };
    const { result } = renderHook(() => useStaffErrorGuard());

    await expect(result.current(Promise.reject(error))).rejects.toBe(error);
    expect(mockNavigate).toHaveBeenCalledWith('/2fa', {
      state: { level: TfaLevel.STRICT, sessionMode: true },
      setRedirect: true,
    });
  });

  it('redirects staff-KYC-required errors and rethrows them', async () => {
    const error = { code: 'STAFF_KYC_REQUIRED' };
    const { result } = renderHook(() => useStaffErrorGuard());

    await expect(result.current(Promise.reject(error))).rejects.toBe(error);
    expect(mockNavigate).toHaveBeenCalledWith('/staff-kyc-required');
  });

  it('rethrows other errors without navigating', async () => {
    const error = { code: 'OTHER_ERROR' };
    const { result } = renderHook(() => useStaffErrorGuard());

    await expect(result.current(Promise.reject(error))).rejects.toBe(error);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('useGuardedApi', () => {
  beforeEach(() => {
    mockUseApi.mockReturnValue({ call: mockCall });
  });

  it('delegates to useApi().call with the config and returns its result', async () => {
    const config = { url: 'support/88001', method: 'GET' as const };
    const value = { id: 88001 };
    mockCall.mockResolvedValue(value);

    const { result } = renderHook(() => useGuardedApi());

    await expect(result.current.call(config)).resolves.toBe(value);
    expect(mockCall).toHaveBeenCalledWith(config);
  });

  it('guards errors from useApi().call', async () => {
    const error = { code: 'TFA_REQUIRED' };
    mockCall.mockRejectedValue(error);

    const { result } = renderHook(() => useGuardedApi());

    await expect(result.current.call({ url: 'support/88001', method: 'GET' })).rejects.toBe(error);
    expect(mockNavigate).toHaveBeenCalledWith('/2fa', {
      state: { level: TfaLevel.STRICT, sessionMode: true },
      setRedirect: true,
    });
  });
});
