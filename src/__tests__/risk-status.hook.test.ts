// Unit tests for useRiskStatus: the PUT payload and the stable function identity.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useRiskStatus } from 'src/hooks/risk-status.hook';

describe('useRiskStatus', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('setRiskStatus calls PUT userData/:id/riskStatus with the status and reason', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useRiskStatus());
    await result.current.setRiskStatus(88001, { riskStatus: 'Blocked', reason: 'blocked by ops' });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'userData/88001/riskStatus',
      method: 'PUT',
      data: { riskStatus: 'Blocked', reason: 'blocked by ops' },
    });
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useRiskStatus());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
