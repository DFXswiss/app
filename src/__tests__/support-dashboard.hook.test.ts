import { renderHook } from '@testing-library/react';

const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
  TfaLevel: { STRICT: 'Strict' },
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { useSupportDashboard } from '../hooks/support-dashboard.hook';

describe('useSupportDashboard', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getClerks returns { userDataId, name }[] from GET support/issue/clerks', async () => {
    mockCall.mockResolvedValue([{ userDataId: 3, name: 'Alex' }]);
    const { result } = renderHook(() => useSupportDashboard());

    const clerks = await result.current.getClerks();

    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/clerks', method: 'GET' });
    expect(clerks).toEqual([{ userDataId: 3, name: 'Alex' }]);
  });

  it('getClerks drops entries without a finite userDataId', async () => {
    mockCall.mockResolvedValue([
      { userDataId: 3, name: 'Alex' },
      { userDataId: Number.NaN, name: 'Broken' },
    ]);
    const { result } = renderHook(() => useSupportDashboard());

    await expect(result.current.getClerks()).resolves.toEqual([{ userDataId: 3, name: 'Alex' }]);
  });

  it('getMyClerk GETs support/issue/clerk and trims the clerk name', async () => {
    mockCall.mockResolvedValue({ clerkUserDataId: 7, clerk: '  Ada  ' });
    const { result } = renderHook(() => useSupportDashboard());

    await expect(result.current.getMyClerk()).resolves.toEqual({ clerkUserDataId: 7, clerk: 'Ada' });
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/clerk', method: 'GET' });
  });

  it('getMyClerk returns undefined when clerk is null', async () => {
    mockCall.mockResolvedValue({ clerkUserDataId: 7, clerk: null });
    const { result } = renderHook(() => useSupportDashboard());

    await expect(result.current.getMyClerk()).resolves.toBeUndefined();
  });

  it('updateIssue PUTs clerkUserDataId', async () => {
    const { result } = renderHook(() => useSupportDashboard());

    await result.current.updateIssue(42, { state: 'Completed', clerkUserDataId: 9 });

    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/42',
      method: 'PUT',
      data: { state: 'Completed', clerkUserDataId: 9 },
    });
  });

  it('updateIssue PUTs null to unassign', async () => {
    const { result } = renderHook(() => useSupportDashboard());

    await result.current.updateIssue(42, { clerkUserDataId: null });

    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/42',
      method: 'PUT',
      data: { clerkUserDataId: null },
    });
  });
});
