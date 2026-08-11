import { renderHook } from '@testing-library/react';

// `call` comes from useGuardedApi (→ useApi); the hook itself is a thin, typed map of the staff
// support endpoints, so what these tests pin is the request each function makes and the shape it
// hands back.
const mockCall = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useApi: () => ({ call: mockCall }),
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance', MARKETING: 'Marketing' },
  TfaLevel: { STRICT: 'Strict' },
}));

// useGuardedApi calls useNavigation (react-router hooks); stub it so renderHook works without a Router.
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { ASSIGNABLE_DEPARTMENTS, CustomerAuthor, useSupportDashboard } from '../hooks/support-dashboard.hook';

const request = (): { url: string; method: string; data?: unknown } => mockCall.mock.calls[0][0];

const hook = (): ReturnType<typeof useSupportDashboard> => renderHook(() => useSupportDashboard()).result.current;

describe('useSupportDashboard', () => {
  beforeEach(() => {
    mockCall.mockReset();
    mockCall.mockResolvedValue({});
  });

  it('exposes the departments a ticket can be assigned to, and the customer author', () => {
    expect(ASSIGNABLE_DEPARTMENTS).toEqual(['Support', 'Compliance']);
    expect(CustomerAuthor).toEqual('Customer');
  });

  describe('getIssueList', () => {
    it('drops empty filters and encodes the rest', async () => {
      await hook().getIssueList({ department: 'Support', states: '', type: undefined, take: 25, query: 'a b' });

      expect(request()).toEqual({ url: 'support/issue/list?department=Support&take=25&query=a%20b', method: 'GET' });
    });

    it('asks without a query string when there is no filter', async () => {
      await hook().getIssueList();

      expect(request()).toEqual({ url: 'support/issue/list', method: 'GET' });
    });
  });

  it('getIssueCounts asks for the counts', async () => {
    await hook().getIssueCounts();

    expect(request()).toEqual({ url: 'support/issue/counts', method: 'GET' });
  });

  describe('getIssueActivity', () => {
    it('passes the timestamp to compare against', async () => {
      await hook().getIssueActivity(new Date('2026-08-08T10:00:00.000Z'));

      expect(request().url).toEqual('support/issue/activity?since=2026-08-08T10%3A00%3A00.000Z');
    });

    it('asks for the full activity without one', async () => {
      await hook().getIssueActivity();

      expect(request().url).toEqual('support/issue/activity');
    });
  });

  it('getIssueStatistics passes the period', async () => {
    await hook().getIssueStatistics(30);

    expect(request()).toEqual({ url: 'support/issue/statistics?days=30', method: 'GET' });
  });

  it('getClerks asks for the clerk list', async () => {
    await hook().getClerks();

    expect(request()).toEqual({ url: 'support/issue/clerks', method: 'GET' });
  });

  describe('getMyClerk', () => {
    it('returns the clerk mapped to the session', async () => {
      mockCall.mockResolvedValue({ clerk: 'Alex' });

      await expect(hook().getMyClerk()).resolves.toEqual('Alex');
      expect(request()).toEqual({ url: 'support/issue/clerk', method: 'GET' });
    });

    it('returns nothing for an unmapped account', async () => {
      mockCall.mockResolvedValue({ clerk: null });

      await expect(hook().getMyClerk()).resolves.toBeUndefined();
    });
  });

  it('getIssueData asks for the internal data of an issue', async () => {
    await hook().getIssueData(42);

    expect(request()).toEqual({ url: 'support/issue/42/data', method: 'GET' });
  });

  it('updateIssue sends the changed fields', async () => {
    await hook().updateIssue(42, { state: 'InProgress' });

    expect(request()).toEqual({ url: 'support/issue/42', method: 'PUT', data: { state: 'InProgress' } });
  });

  it('sendMessage posts the reply', async () => {
    await hook().sendMessage(42, { author: 'Alex', message: 'Hi' });

    expect(request()).toEqual({
      url: 'support/issue/42/message',
      method: 'POST',
      data: { author: 'Alex', message: 'Hi' },
    });
  });

  it('createIssue opens a ticket for a customer', async () => {
    const data = { type: 'GenericIssue', reason: 'Other', name: 'Max', author: 'Alex' };

    await hook().createIssue(11, data);

    expect(request()).toEqual({ url: 'support/issue/support?userDataId=11', method: 'POST', data });
  });

  describe('searchUsers', () => {
    it('returns the matches', async () => {
      mockCall.mockResolvedValue({ userDatas: [{ id: 1, kycStatus: 'Completed' }] });

      await expect(hook().searchUsers('a b')).resolves.toEqual([{ id: 1, kycStatus: 'Completed' }]);
      expect(request().url).toEqual('support?key=a%20b');
    });

    it('returns an empty list when the response carries none', async () => {
      mockCall.mockResolvedValue({});

      await expect(hook().searchUsers('x')).resolves.toEqual([]);
    });
  });

  describe('getIssueMessages', () => {
    it('asks only for what is newer than the last known message', async () => {
      mockCall.mockResolvedValue({ messages: [] });

      await hook().getIssueMessages('issue-uid', 7);

      expect(request().url).toEqual('support/issue/issue-uid?fromMessageId=7');
    });

    it('asks for the whole thread otherwise', async () => {
      mockCall.mockResolvedValue({ messages: [{ id: 1 }] });

      await expect(hook().getIssueMessages('issue-uid')).resolves.toEqual([{ id: 1 }]);
      expect(request().url).toEqual('support/issue/issue-uid');
    });
  });

  it('getMessageFile asks for the attachment', async () => {
    await hook().getMessageFile('issue-uid', 3);

    expect(request()).toEqual({ url: 'support/issue/issue-uid/message/3/file', method: 'GET' });
  });

  describe('reply suggestions', () => {
    it('returns the suggestion awaiting a decision', async () => {
      mockCall.mockResolvedValue({ suggestion: { messageId: 100, text: 'Answer' } });

      await expect(hook().getReplySuggestion(42)).resolves.toEqual({ messageId: 100, text: 'Answer' });
      expect(request()).toEqual({ url: 'support/issue/42/suggestion', method: 'GET' });
    });

    it('returns nothing when none awaits a decision', async () => {
      mockCall.mockResolvedValue({ suggestion: null });

      await expect(hook().getReplySuggestion(42)).resolves.toBeUndefined();
    });

    it('accepts a suggestion', async () => {
      await hook().acceptReplySuggestion(42, 100);

      expect(request()).toEqual({ url: 'support/issue/42/suggestion/100/accept', method: 'PUT' });
    });

    it('rejects a suggestion', async () => {
      await hook().rejectReplySuggestion(42, 100);

      expect(request()).toEqual({ url: 'support/issue/42/suggestion/100/reject', method: 'PUT' });
    });
  });
});
