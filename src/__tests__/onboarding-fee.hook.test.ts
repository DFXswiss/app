// Unit tests for useOnboardingFee: the PUT/DELETE payloads and the stable function identities.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useOnboardingFee } from 'src/hooks/onboarding-fee.hook';

describe('useOnboardingFee', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('setOnboardingFee calls PUT userData/:id/onboardingFee with the amount and address', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOnboardingFee());
    await result.current.setOnboardingFee(88001, { amount: 5, address: '0xabc' });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'userData/88001/onboardingFee',
      method: 'PUT',
      data: { amount: 5, address: '0xabc' },
    });
  });

  it('removeOnboardingFee calls DELETE userData/:id/onboardingFee without a body', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useOnboardingFee());
    await result.current.removeOnboardingFee(88001);

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'userData/88001/onboardingFee',
      method: 'DELETE',
    });
  });

  it('keeps the same function identities across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useOnboardingFee());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
