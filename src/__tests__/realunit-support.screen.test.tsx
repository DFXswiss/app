// Unit tests for RealunitSupportScreen: open-ticket grouping, filters, paged tabs, search debounce,
// activity poll and error paths. Heavy deps are mocked so the screen renders under
// @testing-library/react without the full app shell.

const mockUseRealunitGuard = jest.fn();
const mockNavigate = jest.fn();
const mockGetIssueList = jest.fn();
const mockGetIssueCounts = jest.fn();
const mockGetIssueActivity = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueInternalState: {
    CREATED: 'Created',
    PENDING: 'Pending',
    ON_HOLD: 'OnHold',
    CANCELED: 'Canceled',
    COMPLETED: 'Completed',
  },
  SupportIssueReason: { OTHER: 'Other' },
  SupportIssueType: {
    GENERIC_ISSUE: 'GenericIssue',
    TRANSACTION_ISSUE: 'TransactionIssue',
    LIMIT_REQUEST: 'LimitRequest',
  },
  Department: {},
  UserRole: {},
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useRealunitGuard: (...args: unknown[]) => mockUseRealunitGuard(...args),
}));

jest.mock('src/hooks/realunit-support.hook', () => ({
  useRealunitSupport: () => ({
    getIssueList: mockGetIssueList,
    getIssueCounts: mockGetIssueCounts,
    getIssueActivity: mockGetIssueActivity,
  }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
  }),
}));

jest.mock('src/config/labels', () => ({
  IssueReasonLabels: {},
  IssueTypeLabels: {},
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => `dt:${value}`,
  formatDateTimeShort: (value: string) => `short:${value}`,
  statusBadge: (status: string) => <span data-testid={`status-${status}`}>{status}</span>,
}));

import { act, fireEvent, render, screen } from '@testing-library/react';
import RealunitSupportScreen from 'src/screens/realunit-support.screen';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';

function issue(partial: Partial<SupportIssueListItem> = {}): SupportIssueListItem {
  return {
    id: 1,
    uid: 'u1',
    type: 'GenericIssue',
    reason: 'Other',
    state: 'Created',
    name: 'Open ticket',
    created: '2026-08-30T10:00:00Z',
    messageCount: 1,
    ...partial,
  };
}

async function flushMs(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

async function flushDebounce(): Promise<void> {
  await flushMs(300);
}

function searchInput(): HTMLElement {
  return screen.getByPlaceholderText('Search by ID, UID, name, clerk, message...');
}

function filterSelect(label: string): HTMLSelectElement {
  const labelEl = screen.getByText(label, { selector: 'label' });
  const select = labelEl.parentElement?.querySelector('select');
  if (!select) throw new Error(`filter select "${label}" not found`);
  return select;
}

function tab(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('RealunitSupportScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetIssueList.mockResolvedValue({ data: [], total: 0 });
    mockGetIssueCounts.mockResolvedValue({ OnHold: 2, Canceled: 0, Completed: 5 });
    mockGetIssueActivity.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('guards the screen, loads counts and the open list after the debounce', async () => {
    render(<RealunitSupportScreen />);
    expect(mockUseRealunitGuard).toHaveBeenCalledWith();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await flushDebounce();

    expect(mockGetIssueCounts).toHaveBeenCalled();
    expect(mockGetIssueList).toHaveBeenCalledWith({ states: 'Created,Pending' });
    expect(tab(/^OnHold \(2\)/)).toBeInTheDocument();
    expect(tab(/^Completed \(5\)/)).toBeInTheDocument();
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('defaults missing count keys to zero and swallows a counts failure', async () => {
    mockGetIssueCounts.mockResolvedValueOnce({});
    const { unmount } = render(<RealunitSupportScreen />);
    await flushDebounce();
    expect(tab(/^OnHold \(0\)/)).toBeInTheDocument();
    unmount();

    mockGetIssueCounts.mockRejectedValueOnce(new Error('counts down'));
    render(<RealunitSupportScreen />);
    await flushDebounce();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('groups open tickets by whose turn it is and navigates on row click', async () => {
    const waiting = issue({ id: 1, name: 'Customer waiting', lastMessageAuthor: 'Customer' });
    const answered = issue({ id: 2, name: 'We answered', lastMessageAuthor: 'Rita' });
    mockGetIssueList.mockResolvedValue({ data: [waiting, answered], total: 2 });

    render(<RealunitSupportScreen />);
    await flushDebounce();

    expect(screen.getByText('Awaiting reply (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Answered \(1\)/ })).toBeInTheDocument();
    expect(screen.getAllByText('2')).not.toHaveLength(0); // Open Issues stat + Open tab count

    // Every ticket here comes from the RealUnit app, so the App column of the DFX list is left out.
    expect(screen.queryByRole('columnheader', { name: 'App' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Customer waiting'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/support/issue/1');
  });

  it('applies the type filter server-side, the state filter client-side, and Reset clears both', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({ id: 1, name: 'Created ticket', state: 'Created', lastMessageAuthor: 'Customer' }),
        issue({ id: 2, name: 'Pending ticket', state: 'Pending', lastMessageAuthor: 'Customer' }),
      ],
      total: 2,
    });
    render(<RealunitSupportScreen />);
    await flushDebounce();

    fireEvent.change(filterSelect('State'), { target: { value: 'Pending' } });
    expect(screen.queryByText('Created ticket')).not.toBeInTheDocument();
    expect(screen.getByText('Pending ticket')).toBeInTheDocument();

    mockGetIssueList.mockClear();
    fireEvent.change(filterSelect('Type'), { target: { value: 'LimitRequest' } });
    await flushDebounce();
    expect(mockGetIssueList).toHaveBeenCalledWith({ states: 'Created,Pending', type: 'LimitRequest' });

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(filterSelect('State').value).toBe('');
    expect(filterSelect('Type').value).toBe('');
    expect(screen.getByText('Created ticket')).toBeInTheDocument();
  });

  it('passes the search query to the open list and to the paged tab', async () => {
    render(<RealunitSupportScreen />);
    await flushDebounce();

    mockGetIssueList.mockClear();
    fireEvent.change(searchInput(), { target: { value: 'alice' } });
    await flushDebounce();
    expect(mockGetIssueList).toHaveBeenCalledWith({ states: 'Created,Pending', query: 'alice' });

    mockGetIssueList.mockClear();
    fireEvent.click(tab(/^OnHold \(/));
    await flushDebounce();
    expect(mockGetIssueList).toHaveBeenCalledWith({ states: 'OnHold', take: 20, skip: 0, query: 'alice' });
  });

  it('surfaces an open-list failure and falls back to Unknown error without a message', async () => {
    mockGetIssueList.mockRejectedValueOnce(new Error('list down'));
    const { unmount } = render(<RealunitSupportScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('list down');
    unmount();

    mockGetIssueList.mockRejectedValueOnce({});
    render(<RealunitSupportScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('loads a paged tab on first click, keeps it when switching back, appends on Load more', async () => {
    const first = Array.from({ length: 20 }, (_, i) => issue({ id: 100 + i, name: `OnHold ${i}` }));
    const more = [issue({ id: 200, name: 'OnHold more' })];
    mockGetIssueList.mockImplementation((params: { states: string; skip?: number }) => {
      if (params.states !== 'OnHold') return Promise.resolve({ data: [], total: 0 });
      return Promise.resolve({ data: params.skip ? more : first, total: 21 });
    });

    render(<RealunitSupportScreen />);
    await flushDebounce();

    fireEvent.click(tab(/^OnHold \(/));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    await flushDebounce();
    expect(screen.getByText('OnHold 0')).toBeInTheDocument();
    expect(screen.queryByText('Type', { selector: 'label' })).not.toBeInTheDocument();

    const loadMore = screen.getByRole('button', { name: 'Load more (20 / 21)' });
    fireEvent.click(loadMore);
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    await flushMs(0);
    expect(screen.getByText('OnHold more')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('OnHold 3'));
    expect(mockNavigate).toHaveBeenCalledWith('/realunit/support/issue/103');

    // switching away and back does not reload an already loaded tab
    const callsBefore = mockGetIssueList.mock.calls.length;
    fireEvent.click(tab(/^Open \(/));
    await flushDebounce();
    fireEvent.click(tab(/^OnHold \(/));
    await flushDebounce();
    expect(screen.getByText('OnHold 0')).toBeInTheDocument();
    expect(mockGetIssueList.mock.calls.slice(callsBefore).filter(([p]) => p.states === 'OnHold')).toHaveLength(1);
  });

  it('surfaces a paged-tab failure and clears its loading state', async () => {
    mockGetIssueList.mockImplementation((params: { states: string }) =>
      params.states === 'Canceled' ? Promise.reject(new Error('paged down')) : Promise.resolve({ data: [], total: 0 }),
    );
    const { unmount } = render(<RealunitSupportScreen />);
    await flushDebounce();

    fireEvent.click(tab(/^Canceled \(/));
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('paged down');
    unmount();

    mockGetIssueList.mockImplementation((params: { states: string }) =>
      params.states === 'Canceled' ? Promise.reject({}) : Promise.resolve({ data: [], total: 0 }),
    );
    render(<RealunitSupportScreen />);
    await flushDebounce();

    fireEvent.click(tab(/^Canceled \(/));
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('polls activity, shows the singular/plural badge and reloads the open list on click', async () => {
    render(<RealunitSupportScreen />);
    await flushDebounce();

    mockGetIssueActivity.mockResolvedValueOnce({ count: 1 });
    await flushMs(30_000);
    expect(screen.getByRole('button', { name: '1 new message — load' })).toBeInTheDocument();

    mockGetIssueActivity.mockResolvedValueOnce({ count: 3 });
    await flushMs(30_000);
    const badge = screen.getByRole('button', { name: '3 new messages — load' });

    mockGetIssueList.mockClear();
    fireEvent.click(badge);
    await flushMs(0);
    expect(mockGetIssueList).toHaveBeenCalledWith({ states: 'Created,Pending' });
    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();

    mockGetIssueActivity.mockRejectedValueOnce(new Error('poll down'));
    await flushMs(30_000);
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});
