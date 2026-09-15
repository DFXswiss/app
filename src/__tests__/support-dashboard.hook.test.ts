// useSupportDashboard is a thin layer of guarded API calls; each function is checked for the URL,
// method and body it sends and for the shape it hands back.

const mockCall = jest.fn();

jest.mock('src/hooks/guarded-api.hook', () => ({
  useGuardedApi: () => ({ call: mockCall }),
}));

jest.mock('@dfx.swiss/react', () => ({
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
}));

import { renderHook } from '@testing-library/react';
import { useSupportDashboard } from 'src/hooks/support-dashboard.hook';

function hook(): ReturnType<typeof useSupportDashboard> {
  return renderHook(() => useSupportDashboard()).result.current;
}

describe('useSupportDashboard', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue(undefined);
  });

  it('getIssueList encodes the given filters and drops empty ones', async () => {
    await hook().getIssueList({ department: 'Compliance', states: 'Open,Pending', query: 'a b', take: 20, skip: 0 });
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/list?department=Compliance&states=Open%2CPending&query=a%20b&take=20&skip=0',
      method: 'GET',
    });

    mockCall.mockClear();
    await hook().getIssueList({ department: '', type: undefined });
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/list', method: 'GET' });

    mockCall.mockClear();
    await hook().getIssueList();
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/list', method: 'GET' });
  });

  it('getIssueCounts, getClerks and getIssueStatistics are plain GETs', async () => {
    await hook().getIssueCounts();
    await hook().getClerks();
    await hook().getIssueStatistics(30);
    expect(mockCall.mock.calls).toEqual([
      [{ url: 'support/issue/counts', method: 'GET' }],
      [{ url: 'support/issue/clerks', method: 'GET' }],
      [{ url: 'support/issue/statistics?days=30', method: 'GET' }],
    ]);
  });

  it('getIssueActivity passes the since timestamp only when given', async () => {
    await hook().getIssueActivity(new Date('2026-09-15T10:00:00.000Z'));
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/activity?since=2026-09-15T10%3A00%3A00.000Z',
      method: 'GET',
    });

    mockCall.mockClear();
    await hook().getIssueActivity();
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/activity', method: 'GET' });
  });

  it.each([
    ['  Jana  ', 'Jana'],
    ['', undefined],
    ['   ', undefined],
    [null, undefined],
  ])('getMyClerk trims %p to %p', async (clerk, expected) => {
    mockCall.mockResolvedValue({ clerk });
    await expect(hook().getMyClerk()).resolves.toBe(expected);
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/clerk', method: 'GET' });
  });

  it('getIssueData, updateIssue, sendMessage and createIssue address the issue routes', async () => {
    await hook().getIssueData(42);
    await hook().updateIssue(42, { state: 'Closed', clerk: 'Jana' });
    await hook().sendMessage(42, { author: 'Jana', message: 'Hallo' });
    await hook().createIssue(304535, { type: 'GenericIssue', reason: 'Other', name: 'Frage', author: 'Jana' });
    expect(mockCall.mock.calls).toEqual([
      [{ url: 'support/issue/42/data', method: 'GET' }],
      [{ url: 'support/issue/42', method: 'PUT', data: { state: 'Closed', clerk: 'Jana' } }],
      [{ url: 'support/issue/42/message', method: 'POST', data: { author: 'Jana', message: 'Hallo' } }],
      [
        {
          url: 'support/issue/support?userDataId=304535',
          method: 'POST',
          data: { type: 'GenericIssue', reason: 'Other', name: 'Frage', author: 'Jana' },
        },
      ],
    ]);
  });

  it('searchUsers encodes the key and answers an empty list when the API has none', async () => {
    mockCall.mockResolvedValue({ userDatas: [{ id: 1, kycStatus: 'Completed' }] });
    await expect(hook().searchUsers('a b')).resolves.toEqual([{ id: 1, kycStatus: 'Completed' }]);
    expect(mockCall).toHaveBeenCalledWith({ url: 'support?key=a%20b', method: 'GET' });

    mockCall.mockResolvedValue({});
    await expect(hook().searchUsers('x')).resolves.toEqual([]);
  });

  it('getIssueMessages unwraps the messages and passes fromMessageId only when given', async () => {
    const messages = [{ id: 1, author: 'Customer', created: '2026-09-01' }];
    mockCall.mockResolvedValue({ messages });
    await expect(hook().getIssueMessages('I123', 5)).resolves.toBe(messages);
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/I123?fromMessageId=5', method: 'GET' });

    mockCall.mockClear();
    await hook().getIssueMessages('I123');
    expect(mockCall).toHaveBeenCalledWith({ url: 'support/issue/I123', method: 'GET' });
  });

  it('getMessageFile defaults to access=View', async () => {
    await hook().getMessageFile('issue-uid', 7);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/issue-uid/message/7/file?access=View',
      method: 'GET',
    });
  });

  it('getMessageFile requests access=Download when asked', async () => {
    await hook().getMessageFile('issue-uid', 7, 'Download');
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/issue-uid/message/7/file?access=Download',
      method: 'GET',
    });
  });

  it('transferMessageFileToKycFile PUTs the title and returns the updated message', async () => {
    const updated = { id: 7, author: 'Customer', created: '2026-09-01', kycFileId: 371611 };
    mockCall.mockResolvedValue(updated);
    await expect(hook().transferMessageFileToKycFile('I123', 7, 'Gesellschafterliste')).resolves.toBe(updated);
    expect(mockCall).toHaveBeenCalledWith({
      url: 'support/issue/I123/message/7/kycFile',
      method: 'PUT',
      data: { title: 'Gesellschafterliste' },
    });
  });
});
