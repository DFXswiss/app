// Unit tests for useAccountReactivation: the PUT payload and the stable function identity.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useAccountReactivation } from 'src/hooks/account-reactivation.hook';

describe('useAccountReactivation', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('reactivateAccount calls PUT support/:id/reactivate with the reason and returns the status row', async () => {
    const info = { id: 88001, status: 'NA' };
    mockCall.mockResolvedValue(info);

    const { result } = renderHook(() => useAccountReactivation());
    const row = await result.current.reactivateAccount(88001, { reason: 'merge copied the old status' });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/88001/reactivate',
      method: 'PUT',
      data: { reason: 'merge copied the old status' },
    });
    expect(row).toBe(info);
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useAccountReactivation());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
