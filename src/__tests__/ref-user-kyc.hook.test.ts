// Unit tests for useRefUserKycClear: the PUT the waiver sends and the identity the memo keeps.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useRefUserKycClear } from 'src/hooks/ref-user-kyc.hook';

describe('useRefUserKycClear', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('clearRefUserKyc calls PUT support/:id/refUserKycCleared without a body and returns the result', async () => {
    const result = {
      userDataId: 325674,
      refUserKycClearedDate: '2026-09-28T09:30:00.000Z',
      referrers: [{ userDataId: 321067, usedRef: '171-364', kycStatus: 'Check' }],
      resetBuyCryptoIds: [136775],
      resetBuyFiatIds: [],
    };
    mockCall.mockResolvedValue(result);

    const { result: hook } = renderHook(() => useRefUserKycClear());
    const answer = await hook.current.clearRefUserKyc(325674);

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/325674/refUserKycCleared', method: 'PUT' });
    expect(answer).toBe(result);
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useRefUserKycClear());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
