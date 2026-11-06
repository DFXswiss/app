// Unit tests for useMonthlyLimitClear: the PUT the acknowledgement sends per transaction type and the identity
// the memo keeps.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useMonthlyLimitClear } from 'src/hooks/monthly-limit-clear.hook';

describe('useMonthlyLimitClear', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('clearMonthlyLimit calls PUT buyCrypto/:id/monthlyLimitCleared without a body', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMonthlyLimitClear());
    await expect(result.current.clearMonthlyLimit({ kind: 'buyCrypto', id: 136855 })).resolves.toBeUndefined();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({ url: 'buyCrypto/136855/monthlyLimitCleared', method: 'PUT' });
    expect(mockCall.mock.calls[0]).toHaveLength(1);
    expect(mockCall.mock.calls[0][0]).toEqual({ url: 'buyCrypto/136855/monthlyLimitCleared', method: 'PUT' });
  });

  it('clearMonthlyLimit calls PUT buyFiat/:id/monthlyLimitCleared for a sale', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMonthlyLimitClear());
    await result.current.clearMonthlyLimit({ kind: 'buyFiat', id: 88 });

    expect(mockCall).toHaveBeenCalledWith({ url: 'buyFiat/88/monthlyLimitCleared', method: 'PUT' });
  });

  it('passes an API error through', async () => {
    mockCall.mockRejectedValue(new Error('BuyCrypto is not held for a monthly limit'));

    const { result } = renderHook(() => useMonthlyLimitClear());

    await expect(result.current.clearMonthlyLimit({ kind: 'buyCrypto', id: 1 })).rejects.toThrow(
      'BuyCrypto is not held for a monthly limit',
    );
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useMonthlyLimitClear());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(result.current.clearMonthlyLimit).toBe(first.clearMonthlyLimit);
  });
});
