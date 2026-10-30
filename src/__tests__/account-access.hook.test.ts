import { renderHook } from '@testing-library/react';

const mockSetProvisionalApproval = jest.fn();
const mockSetVip = jest.fn();
const mockUseSdkAccountAccess = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  TfaLevel: { STRICT: 'Strict' },
  useAccountAccess: mockUseSdkAccountAccess,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { TfaLevel } from '@dfx.swiss/react';
import type { Buy } from '@dfx.swiss/react';
import { useAccountAccess } from 'src/hooks/account-access.hook';
import { isProvisionalApproval } from 'src/util/provisional-approval';

describe('useAccountAccess', () => {
  beforeEach(() => {
    mockUseSdkAccountAccess.mockReturnValue({
      setProvisionalApproval: mockSetProvisionalApproval,
      setVip: mockSetVip,
    });
  });

  it('sets provisional approval through the SDK and returns the account access row', async () => {
    const info = { id: 88001, provisionalApprovalDate: '2026-10-29', vipUserIds: [] };
    mockSetProvisionalApproval.mockResolvedValue(info);

    const { result } = renderHook(() => useAccountAccess());
    const row = await result.current.setProvisionalApproval(88001, true);

    expect(mockSetProvisionalApproval).toHaveBeenCalledWith(88001, true);
    expect(row).toBe(info);
  });

  it('sets VIP through the SDK and returns the account access row', async () => {
    const info = { id: 88001, vipUserIds: [42] };
    mockSetVip.mockResolvedValue(info);

    const { result } = renderHook(() => useAccountAccess());
    const row = await result.current.setVip(88001, false);

    expect(mockSetVip).toHaveBeenCalledWith(88001, false);
    expect(row).toBe(info);
  });

  it('redirects TFA-required SDK errors and rethrows them', async () => {
    const error = { code: 'TFA_REQUIRED' };
    mockSetProvisionalApproval.mockRejectedValue(error);

    const { result } = renderHook(() => useAccountAccess());

    await expect(result.current.setProvisionalApproval(88001, true)).rejects.toBe(error);
    expect(mockNavigate).toHaveBeenCalledWith('/2fa', {
      state: { level: TfaLevel.STRICT, sessionMode: true },
      setRedirect: true,
    });
  });

  it('redirects staff-KYC-required SDK errors and rethrows them', async () => {
    const error = { code: 'STAFF_KYC_REQUIRED' };
    mockSetVip.mockRejectedValue(error);

    const { result } = renderHook(() => useAccountAccess());

    await expect(result.current.setVip(88001, true)).rejects.toBe(error);
    expect(mockNavigate).toHaveBeenCalledWith('/staff-kyc-required');
  });

  it('rethrows other SDK errors without navigating', async () => {
    const error = { code: 'OTHER_ERROR' };
    mockSetProvisionalApproval.mockRejectedValue(error);

    const { result } = renderHook(() => useAccountAccess());

    await expect(result.current.setProvisionalApproval(88001, false)).rejects.toBe(error);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps the same functions across re-renders while the SDK functions and guard are stable', () => {
    const { result, rerender } = renderHook(() => useAccountAccess());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('isProvisionalApproval', () => {
  it('uses the provisional approval field exposed by the SDK', () => {
    expect(isProvisionalApproval({ provisionalApproval: true } as Buy)).toBe(true);
    expect(isProvisionalApproval({ provisionalApproval: false } as Buy)).toBe(false);
    expect(isProvisionalApproval(undefined)).toBe(false);
  });
});
