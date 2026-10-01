// Unit tests for useScorechainClear: the PUT the acknowledgement sends per transaction type and the identity
// the memo keeps.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useScorechainClear } from 'src/hooks/scorechain-clear.hook';

describe('useScorechainClear', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('clearScorechain calls PUT buyCrypto/:id/scorechainCleared without a body', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorechainClear());
    await expect(result.current.clearScorechain({ kind: 'buyCrypto', id: 136855 })).resolves.toBeUndefined();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({ url: 'buyCrypto/136855/scorechainCleared', method: 'PUT' });
  });

  it('clearScorechain calls PUT buyFiat/:id/scorechainCleared for a sale', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useScorechainClear());
    await result.current.clearScorechain({ kind: 'buyFiat', id: 88 });

    expect(mockCall).toHaveBeenCalledWith({ url: 'buyFiat/88/scorechainCleared', method: 'PUT' });
  });

  it('passes an API error through', async () => {
    mockCall.mockRejectedValue(new Error('BuyCrypto is not held for a Scorechain screening'));

    const { result } = renderHook(() => useScorechainClear());

    await expect(result.current.clearScorechain({ kind: 'buyCrypto', id: 1 })).rejects.toThrow(
      'BuyCrypto is not held for a Scorechain screening',
    );
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useScorechainClear());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
