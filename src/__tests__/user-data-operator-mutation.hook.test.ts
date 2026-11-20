// Unit tests for useUserDataOperatorMutation: the single audited PUT the edit form saves through.

import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useUserDataOperatorMutation } from 'src/hooks/user-data-operator-mutation.hook';

describe('useUserDataOperatorMutation', () => {
  beforeEach(() => {
    // react-scripts sets resetMocks:true, which wipes implementations before each test
    mockCall.mockReset();
  });

  it('sends the fields and the comment in one PUT', async () => {
    mockCall.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUserDataOperatorMutation());
    await expect(
      result.current.mutateUserData(88001, { mail: 'new@example.com', countryId: 2 }, 'Correcting the record'),
    ).resolves.toBeUndefined();

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'userData/88001/operatorMutation',
      method: 'PUT',
      data: { mail: 'new@example.com', countryId: 2, comment: 'Correcting the record' },
    });
  });

  it('passes an API error through', async () => {
    mockCall.mockRejectedValue(new Error('Update refused'));

    const { result } = renderHook(() => useUserDataOperatorMutation());

    await expect(result.current.mutateUserData(1, { mail: 'a@example.com' }, 'why')).rejects.toThrow('Update refused');
  });

  it('keeps the same function identity across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useUserDataOperatorMutation());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
