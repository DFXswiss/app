// Unit tests for useUserDataOperatorMerge: the single audited PUT the merge form saves through.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useUserDataOperatorMerge } from 'src/hooks/user-data-operator-merge.hook';

describe('useUserDataOperatorMerge', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('sends the slave id and the comment in one PUT to the master', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUserDataOperatorMerge());
    await expect(result.current.mergeUserData(88001, 88002, 'Duplicate account')).resolves.toBeUndefined();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'userData/88001/operatorMerge',
      method: 'PUT',
      data: { slaveId: 88002, comment: 'Duplicate account' },
    });
  });

  it('passes an API error through', async () => {
    mockCall.mockRejectedValue(new Error('Merge refused'));

    const { result } = renderHook(() => useUserDataOperatorMerge());

    await expect(result.current.mergeUserData(1, 2, 'why')).rejects.toThrow('Merge refused');
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useUserDataOperatorMerge());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
