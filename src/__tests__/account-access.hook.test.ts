import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

import { useAccountAccess } from 'src/hooks/account-access.hook';

describe('useAccountAccess', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('sets provisional approval through the support endpoint and returns the account access row', async () => {
    const info = { id: 88001, provisionalApprovalDate: '2026-10-29', vipUserIds: [] };
    mockCall.mockResolvedValue(info);

    const { result } = renderHook(() => useAccountAccess());
    const row = await result.current.setProvisionalApproval(88001, true);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/88001/provisionalApproval',
      method: 'PUT',
      data: { enabled: true },
    });
    expect(row).toBe(info);
  });

  it('sets VIP through the support endpoint and returns the account access row', async () => {
    const info = { id: 88001, vipUserIds: [42] };
    mockCall.mockResolvedValue(info);

    const { result } = renderHook(() => useAccountAccess());
    const row = await result.current.setVip(88001, false);

    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/88001/vip',
      method: 'PUT',
      data: { enabled: false },
    });
    expect(row).toBe(info);
  });

  it('keeps the same functions across re-renders while the api call is stable', () => {
    const { result, rerender } = renderHook(() => useAccountAccess());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
