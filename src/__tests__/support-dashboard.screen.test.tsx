// Unit tests for SupportDashboardScreen: Limit Requests tab, filters, paging, activity poll,
// customer search, and template picker. Heavy deps are mocked so the screen renders under
// @testing-library/react without the full app shell.

const mockUseSupportDashboardGuard = jest.fn();
const mockNavigate = jest.fn();
const mockGetIssueList = jest.fn();
const mockGetIssueCounts = jest.fn();
const mockGetIssueActivity = jest.fn();
const mockSearchCustomers = jest.fn();
const mockGetUserData = jest.fn();
const mockCopy = jest.fn();

const mockAuth = { role: 'Admin' as string | undefined, hasSession: true };

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueInternalState: {
    CREATED: 'Created',
    PENDING: 'Pending',
    ON_HOLD: 'OnHold',
    CANCELED: 'Canceled',
    COMPLETED: 'Completed',
  },
  SupportIssueType: {
    GENERIC_ISSUE: 'GenericIssue',
    TRANSACTION_ISSUE: 'TransactionIssue',
    KYC_ISSUE: 'KycIssue',
    LIMIT_REQUEST: 'LimitRequest',
    PARTNERSHIP_REQUEST: 'PartnershipRequest',
    NOTIFICATION_OF_CHANGES: 'NotificationOfChanges',
    BUG_REPORT: 'BugReport',
    VERIFICATION_CALL: 'VerificationCall',
  },
  Department: {
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    COOPERATION: 'Cooperation',
  },
  UserRole: {
    ADMIN: 'Admin',
    SUPPORT: 'Support',
    COMPLIANCE: 'Compliance',
    MARKETING: 'Marketing',
    CUSTODY: 'Custody',
  },
  useAuthContext: () => ({
    session: mockAuth.hasSession ? { role: mockAuth.role } : undefined,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/support-templates/template-picker-modal', () => ({
  TemplatePickerModal: ({
    isOpen,
    onClose,
    onInsert,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (text: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="template-picker-modal">
        <button type="button" data-testid="template-insert" onClick={() => onInsert('template text')}>
          Insert
        </button>
        <button type="button" data-testid="template-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useSupportDashboardGuard: (...args: unknown[]) => mockUseSupportDashboardGuard(...args),
  SUPPORT_STAFF_ROLES: ['Admin', 'Compliance', 'Support'],
}));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  useSupportDashboard: () => ({
    getIssueList: mockGetIssueList,
    getIssueCounts: mockGetIssueCounts,
    getIssueActivity: mockGetIssueActivity,
  }),
  CustomerAuthor: 'Customer',
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({
    search: mockSearchCustomers,
    getUserData: mockGetUserData,
  }),
}));

jest.mock('src/hooks/clipboard.hook', () => ({
  useClipboard: () => ({ copy: mockCopy }),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return Object.entries(params).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

jest.mock('src/config/labels', () => ({
  IssueReasonLabels: {},
  IssueTypeLabels: {},
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTime: (value: string) => `dt:${value}`,
  statusBadge: (status: string) => <span data-testid={`status-${status}`}>{status}</span>,
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import SupportDashboardScreen from 'src/screens/support-dashboard.screen';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: unknown) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

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
  if (!select) {
    throw new Error(`filter select "${label}" not found`);
  }
  return select;
}

function queryFilterSelect(label: string): HTMLSelectElement | null {
  const labelEl = screen.queryByText(label, { selector: 'label' });
  return labelEl?.parentElement?.querySelector('select') ?? null;
}

describe('SupportDashboardScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAuth.role = 'Admin';
    mockAuth.hasSession = true;
    mockGetIssueList.mockResolvedValue({ data: [], total: 0 });
    mockGetIssueCounts.mockResolvedValue({ OnHold: 0, Canceled: 0, Completed: 0 });
    mockGetIssueActivity.mockResolvedValue({ count: 0 });
    mockSearchCustomers.mockResolvedValue({ userDatas: [] });
    mockGetUserData.mockResolvedValue({ userData: { id: 1 }, transactions: [] });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('calls useSupportDashboardGuard on render', async () => {
    render(<SupportDashboardScreen />);
    expect(mockUseSupportDashboardGuard).toHaveBeenCalledWith();
    await flushDebounce();
  });

  it('loads Open and Limit lists plus counts after the search debounce on mount', async () => {
    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(mockGetIssueCounts).toHaveBeenCalled();

    const openCall = mockGetIssueList.mock.calls.find(
      ([params]) => params?.states === 'Created,Pending' && params?.type == null,
    );
    const limitCall = mockGetIssueList.mock.calls.find(
      ([params]) => params?.states === 'Created,Pending' && params?.type === 'LimitRequest',
    );

    expect(openCall).toBeTruthy();
    expect(limitCall).toBeTruthy();
    expect(openCall?.[0]).not.toHaveProperty('type');
    expect(limitCall?.[0]).toEqual({ states: 'Created,Pending', type: 'LimitRequest' });
  });

  it('shows Type and Department filters on Open for Admin, hides them on Limit, Reset clears all', async () => {
    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(filterSelect('Type')).toBeInTheDocument();
    expect(filterSelect('State')).toBeInTheDocument();
    expect(filterSelect('Department')).toBeInTheDocument();

    fireEvent.change(filterSelect('Type'), { target: { value: 'KycIssue' } });
    fireEvent.change(filterSelect('State'), { target: { value: 'Pending' } });
    fireEvent.change(filterSelect('Department'), { target: { value: 'Support' } });

    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    expect(queryFilterSelect('Type')).toBeNull();
    expect(queryFilterSelect('Department')).toBeNull();
    expect(filterSelect('State')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(filterSelect('State')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /^Open \(/ }));
    expect(filterSelect('Type')).toHaveValue('');
    expect(filterSelect('State')).toHaveValue('');
    expect(filterSelect('Department')).toHaveValue('');
  });

  it('hides the department filter on Open for Support role', async () => {
    mockAuth.role = 'Support';
    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(filterSelect('Type')).toBeInTheDocument();
    expect(queryFilterSelect('Department')).toBeNull();
  });

  it('keeps Limit tab issues independent of the Open type filter', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string; states?: string }) => {
      if (params?.type === 'LimitRequest') {
        return { data: [issue({ id: 50, type: 'LimitRequest', name: 'Limit A', state: 'Created' })], total: 1 };
      }
      if (params?.type === 'KycIssue') {
        return { data: [], total: 0 };
      }
      return { data: [issue({ id: 10, name: 'Generic open', type: 'GenericIssue' })], total: 1 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(screen.getByRole('button', { name: 'Limit Requests (1)' })).toBeInTheDocument();
    expect(screen.getByText('Generic open')).toBeInTheDocument();

    fireEvent.change(filterSelect('Type'), { target: { value: 'KycIssue' } });
    await flushDebounce();

    expect(screen.getByRole('button', { name: 'Limit Requests (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limit Requests (1)' }));
    expect(screen.getByText('Limit A')).toBeInTheDocument();
  });

  it('switches the grouped table between Limit and Open tabs', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') {
        return { data: [issue({ id: 2, type: 'LimitRequest', name: 'Limit only' })], total: 1 };
      }
      return { data: [issue({ id: 1, name: 'Open only' })], total: 1 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(screen.getByText('Open only')).toBeInTheDocument();
    expect(screen.queryByText('Limit only')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    expect(screen.getByText('Limit only')).toBeInTheDocument();
    expect(screen.queryByText('Open only')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Open \(/ }));
    expect(screen.getByText('Open only')).toBeInTheDocument();
  });

  it('searches Limit with type LimitRequest and Open without that type', async () => {
    render(<SupportDashboardScreen />);
    await flushDebounce();
    mockGetIssueList.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    fireEvent.change(searchInput(), { target: { value: 'lim-q' } });
    await flushDebounce();

    expect(mockGetIssueList).toHaveBeenCalledWith({
      states: 'Created,Pending',
      type: 'LimitRequest',
      query: 'lim-q',
    });

    mockGetIssueList.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Open \(/ }));
    fireEvent.change(searchInput(), { target: { value: 'open-q' } });
    await flushDebounce();

    const openSearch = mockGetIssueList.mock.calls.find(([params]) => params?.query === 'open-q');
    expect(openSearch?.[0]).toEqual({ states: 'Created,Pending', query: 'open-q' });
    expect(openSearch?.[0]).not.toHaveProperty('type');
  });

  it('surfaces getIssueList Error.message and falls back to Unknown error', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      throw new Error('List failed');
    });

    const { unmount } = render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('List failed');
    unmount();

    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') throw new Error('');
      return { data: [], total: 0 };
    });
    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('falls back to Unknown error when Open getIssueList rejects with an empty message', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      throw new Error('');
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('surfaces Limit getIssueList Error.message when Limit fails and Open resolves', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') throw new Error('Limit list failed');
      return { data: [], total: 0 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Limit list failed');
  });

  it('shows the spinner only while the active empty tab is loading', async () => {
    const openDeferred = createDeferred<{ data: SupportIssueListItem[]; total: number }>();
    const limitDeferred = createDeferred<{ data: SupportIssueListItem[]; total: number }>();

    mockGetIssueList.mockImplementation((params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') return limitDeferred.promise;
      return openDeferred.promise;
    });

    render(<SupportDashboardScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => {
      openDeferred.resolve({ data: [issue({ id: 1, name: 'Already shown' })], total: 1 });
      await Promise.resolve();
    });
    await flushDebounce();

    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByText('Already shown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => {
      limitDeferred.resolve({ data: [issue({ id: 2, type: 'LimitRequest', name: 'Limit shown' })], total: 1 });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Limit shown')).toBeInTheDocument();
  });

  it('ignores stale Open and Limit responses when a newer request is in flight', async () => {
    type ListResult = { data: SupportIssueListItem[]; total: number };
    const openDeferreds: Deferred<ListResult>[] = [];
    const limitDeferreds: Deferred<ListResult>[] = [];

    mockGetIssueList.mockImplementation((params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') {
        const deferred = createDeferred<ListResult>();
        limitDeferreds.push(deferred);
        return deferred.promise;
      }
      const deferred = createDeferred<ListResult>();
      openDeferreds.push(deferred);
      return deferred.promise;
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(openDeferreds).toHaveLength(1);
    expect(limitDeferreds).toHaveLength(1);

    fireEvent.change(filterSelect('Type'), { target: { value: 'KycIssue' } });
    await flushDebounce();
    expect(openDeferreds).toHaveLength(2);

    await act(async () => {
      openDeferreds[0].resolve({ data: [issue({ id: 1, name: 'Stale open' })], total: 1 });
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale open')).not.toBeInTheDocument();

    await act(async () => {
      openDeferreds[1].resolve({
        data: [issue({ id: 2, name: 'Fresh open', type: 'KycIssue' })],
        total: 1,
      });
      await Promise.resolve();
    });
    expect(screen.getByText('Fresh open')).toBeInTheDocument();
    expect(screen.queryByText('Stale open')).not.toBeInTheDocument();

    fireEvent.change(filterSelect('Type'), { target: { value: 'BugReport' } });
    await flushDebounce();
    fireEvent.change(filterSelect('Type'), { target: { value: 'GenericIssue' } });
    await flushDebounce();
    expect(openDeferreds.length).toBeGreaterThanOrEqual(4);
    const staleOpenFail = openDeferreds[openDeferreds.length - 2];
    const newestOpen = openDeferreds[openDeferreds.length - 1];

    await act(async () => {
      staleOpenFail.reject(new Error('stale open fail'));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    await act(async () => {
      newestOpen.resolve({ data: [issue({ id: 3, name: 'Newest open' })], total: 1 });
      await Promise.resolve();
    });
    expect(screen.getByText('Newest open')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    await flushDebounce();
    const limitBeforeSearch = limitDeferreds.length;

    fireEvent.change(searchInput(), { target: { value: 'lim-q' } });
    await flushDebounce();
    expect(limitDeferreds.length).toBeGreaterThan(limitBeforeSearch);

    const staleLimit = limitDeferreds[limitDeferreds.length - 2];
    const freshLimit = limitDeferreds[limitDeferreds.length - 1];

    await act(async () => {
      staleLimit.resolve({
        data: [issue({ id: 10, type: 'LimitRequest', name: 'Stale limit' })],
        total: 1,
      });
      await Promise.resolve();
    });
    expect(screen.queryByText('Stale limit')).not.toBeInTheDocument();

    await act(async () => {
      freshLimit.resolve({
        data: [issue({ id: 11, type: 'LimitRequest', name: 'Fresh limit' })],
        total: 1,
      });
      await Promise.resolve();
    });
    expect(screen.getByText('Fresh limit')).toBeInTheDocument();
    expect(screen.queryByText('Stale limit')).not.toBeInTheDocument();

    fireEvent.change(searchInput(), { target: { value: 'lim-2' } });
    await flushDebounce();
    fireEvent.change(searchInput(), { target: { value: 'lim-3' } });
    await flushDebounce();
    const staleLimitFail = limitDeferreds[limitDeferreds.length - 2];
    const newestLimit = limitDeferreds[limitDeferreds.length - 1];

    await act(async () => {
      staleLimitFail.reject(new Error('stale limit fail'));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    await act(async () => {
      newestLimit.resolve({
        data: [issue({ id: 12, type: 'LimitRequest', name: 'Newest limit' })],
        total: 1,
      });
      await Promise.resolve();
    });
    expect(screen.getByText('Newest limit')).toBeInTheDocument();
  });

  it('loads paged tabs on first click, appends on Load more, and does not page on Open/Limit', async () => {
    mockGetIssueCounts.mockResolvedValue({ OnHold: 3, Canceled: 1, Completed: 2 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; skip?: number; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') {
        if (params.skip === 0) {
          return {
            data: [
              issue({ id: 100, state: 'OnHold', name: 'Hold 1' }),
              issue({ id: 101, state: 'OnHold', name: 'Hold 2' }),
            ],
            total: 3,
          };
        }
        return { data: [issue({ id: 102, state: 'OnHold', name: 'Hold 3' })], total: 3 };
      }
      if (params?.states === 'Canceled') {
        return { data: [issue({ id: 200, state: 'Canceled', name: 'Canceled 1' })], total: 1 };
      }
      if (params?.states === 'Completed') {
        return { data: [issue({ id: 300, state: 'Completed', name: 'Completed 1' })], total: 1 };
      }
      return { data: [issue({ name: 'Open row' })], total: 1 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(screen.getByRole('button', { name: 'OnHold (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canceled (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed (2)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();

    mockGetIssueList.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'OnHold (3)' }));
    await flushDebounce();

    expect(mockGetIssueList).toHaveBeenCalledWith({
      states: 'OnHold',
      take: 20,
      skip: 0,
      query: undefined,
    });
    expect(screen.getByText('Hold 1')).toBeInTheDocument();
    expect(screen.getByText('Hold 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more (2 / 3)' }));
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });

    expect(mockGetIssueList).toHaveBeenCalledWith({
      states: 'OnHold',
      take: 20,
      skip: 2,
      query: undefined,
    });
    expect(screen.getByText('Hold 3')).toBeInTheDocument();

    const pagedCallsBefore = mockGetIssueList.mock.calls.filter((c) => c[0]?.take === 20).length;
    fireEvent.click(screen.getByRole('button', { name: /^Open \(/ }));
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    await flushDebounce();
    const pagedCallsAfter = mockGetIssueList.mock.calls.filter((c) => c[0]?.take === 20).length;
    expect(pagedCallsAfter).toBe(pagedCallsBefore);

    fireEvent.click(screen.getByRole('button', { name: 'Canceled (1)' }));
    await flushDebounce();
    expect(screen.getByText('Canceled 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Completed (2)' }));
    await flushDebounce();
    expect(screen.getByText('Completed 1')).toBeInTheDocument();
  });

  it('keeps OnHold rows when switching away and back after the tab is loaded', async () => {
    mockGetIssueCounts.mockResolvedValue({ OnHold: 1, Canceled: 0, Completed: 0 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') {
        return { data: [issue({ id: 100, state: 'OnHold', name: 'Hold stay' })], total: 1 };
      }
      return { data: [issue({ name: 'Open row' })], total: 1 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    await flushDebounce();
    expect(screen.getByText('Hold stay')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Open \(/ }));
    await flushDebounce();
    expect(screen.getByText('Open row')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    expect(screen.getByText('Hold stay')).toBeInTheDocument();
    await flushDebounce();
    expect(screen.getByText('Hold stay')).toBeInTheDocument();
  });

  it('swallows getIssueCounts rejection without ErrorHint', async () => {
    mockGetIssueCounts.mockRejectedValue(new Error('counts down'));
    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OnHold (0)' })).toBeInTheDocument();
  });

  it('shows activity badge singular/plural, reloads grouped tab on click, swallows activity errors', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') {
        return { data: [issue({ id: 2, type: 'LimitRequest', name: 'Limit live' })], total: 1 };
      }
      return { data: [issue({ id: 1, name: 'Open live' })], total: 1 };
    });
    mockGetIssueActivity.mockResolvedValueOnce({ count: 1 });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    await flushMs(30_000);

    expect(mockGetIssueActivity).toHaveBeenCalled();
    const badge = screen.getByRole('button', { name: '1 new message — load' });
    expect(badge).toBeInTheDocument();

    mockGetIssueList.mockClear();
    fireEvent.click(badge);
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: /new message/ })).not.toBeInTheDocument();
    expect(mockGetIssueList).toHaveBeenCalled();

    mockGetIssueActivity.mockResolvedValueOnce({ count: 2 });
    fireEvent.click(screen.getByRole('button', { name: /^Limit Requests \(/ }));
    await flushMs(30_000);
    expect(screen.getByRole('button', { name: '2 new messages — load' })).toBeInTheDocument();

    mockGetIssueList.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '2 new messages — load' }));
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    expect(mockGetIssueList).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LimitRequest', states: 'Created,Pending' }),
    );

    mockGetIssueActivity.mockRejectedValueOnce(new Error('activity down'));
    await flushMs(30_000);
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('handles customer search empty input, results, empty state, errors, and row navigation', async () => {
    render(<SupportDashboardScreen />);
    await flushDebounce();

    fireEvent.click(screen.getByRole('button', { name: /^\+ Customer Search$/ }));
    const customerInput = screen.getByPlaceholderText(
      'Search by ID, email, phone, name, KYC hash, blockchain address...',
    );
    const searchButton = screen.getByRole('button', { name: 'Search' });

    expect(searchButton).toBeDisabled();
    fireEvent.change(customerInput, { target: { value: '   ' } });
    expect(searchButton).toBeDisabled();
    fireEvent.click(searchButton);
    fireEvent.keyDown(customerInput, { key: 'Enter' });
    fireEvent.keyDown(customerInput, { key: 'Tab' });
    expect(mockSearchCustomers).not.toHaveBeenCalled();

    mockSearchCustomers.mockResolvedValueOnce({
      userDatas: [
        { id: 7, kycStatus: 'Completed', accountType: 'Personal', mail: 'a@b.c', name: 'Ada' },
        { id: 8, kycStatus: 'Completed' },
      ],
    });
    fireEvent.change(customerInput, { target: { value: '  ada  ' } });
    fireEvent.click(searchButton);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSearchCustomers).toHaveBeenCalledWith('ada');
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('a@b.c')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('Ada').closest('tr') as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith('/support/user/7');

    mockSearchCustomers.mockResolvedValueOnce({ userDatas: [] });
    fireEvent.change(customerInput, { target: { value: 'nobody' } });
    fireEvent.keyDown(customerInput, { key: 'Enter' });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('No entries found')).toBeInTheDocument();

    mockSearchCustomers.mockRejectedValueOnce(new Error('search failed'));
    fireEvent.change(customerInput, { target: { value: 'err' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('error-hint')).toHaveTextContent('search failed');

    mockSearchCustomers.mockRejectedValueOnce({});
    fireEvent.change(customerInput, { target: { value: 'err2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');

    const searchDeferred = createDeferred<{ userDatas: unknown[] }>();
    mockSearchCustomers.mockReturnValueOnce(searchDeferred.promise);
    fireEvent.change(customerInput, { target: { value: 'loading' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('button', { name: '…' })).toBeDisabled();
    await act(async () => {
      searchDeferred.resolve({ userDatas: [] });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: /^− Customer Search$/ }));
    expect(
      screen.queryByPlaceholderText('Search by ID, email, phone, name, KYC hash, blockchain address...'),
    ).not.toBeInTheDocument();
  });

  it(
    'opens the template picker, handles failures, disables siblings while loading, and stops row navigation',
    async () => {
    const userDataDeferred = createDeferred<{ userData: { id: number }; transactions?: unknown[] }>();
    mockGetUserData.mockReturnValueOnce(userDataDeferred.promise);
    mockSearchCustomers.mockResolvedValue({
      userDatas: [
        { id: 1, kycStatus: 'Completed', name: 'User One', mail: 'one@x' },
        { id: 2, kycStatus: 'Completed', name: 'User Two', mail: 'two@x' },
      ],
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: /^\+ Customer Search$/ }));
    fireEvent.change(
      screen.getByPlaceholderText('Search by ID, email, phone, name, KYC hash, blockchain address...'),
      { target: { value: 'user' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getByText('User One')).toBeInTheDocument());

    const rowOne = screen.getByText('User One').closest('tr') as HTMLElement;
    const rowTwo = screen.getByText('User Two').closest('tr') as HTMLElement;
    const templateButtons = screen.getAllByRole('button', { name: 'Template' });

    mockNavigate.mockClear();
    fireEvent.click(templateButtons[0]);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(within(rowOne).getByRole('button')).toHaveTextContent('…');
    expect(within(rowTwo).getByRole('button', { name: 'Template' })).toBeDisabled();

    // Early-return while loading (disabled button still receives fireEvent.click).
    fireEvent.click(within(rowTwo).getByRole('button', { name: 'Template' }));
    expect(mockGetUserData).toHaveBeenCalledTimes(1);

    await act(async () => {
      userDataDeferred.resolve({ userData: { id: 1 }, transactions: undefined });
      await Promise.resolve();
    });

    expect(screen.getByTestId('template-picker-modal')).toBeInTheDocument();

    // Early-return while picker is already open.
    fireEvent.click(within(rowTwo).getByRole('button', { name: 'Template' }));
    expect(mockGetUserData).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('template-insert'));
    expect(mockCopy).toHaveBeenCalledWith('template text');
    expect(screen.queryByTestId('template-picker-modal')).not.toBeInTheDocument();

    mockGetUserData.mockRejectedValueOnce(new Error('template boom'));
    fireEvent.click(within(rowOne).getByRole('button', { name: 'Template' }));
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('template boom'));

    mockGetUserData.mockRejectedValueOnce('not-an-error');
    fireEvent.click(within(rowTwo).getByRole('button', { name: 'Template' }));
    await waitFor(() =>
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to load user data for templates'),
    );

    mockGetUserData.mockResolvedValueOnce({ userData: { id: 2 }, transactions: [] });
    fireEvent.click(within(rowTwo).getByRole('button', { name: 'Template' }));
    await waitFor(() => expect(screen.getByTestId('template-picker-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('template-close'));
    expect(screen.queryByTestId('template-picker-modal')).not.toBeInTheDocument();
  },
  );

  it('navigates action buttons and hides Unassigned Bank Transactions for Marketing', async () => {
    const { unmount } = render(<SupportDashboardScreen />);
    await flushDebounce();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(mockNavigate).toHaveBeenCalledWith('/notes');

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(mockNavigate).toHaveBeenCalledWith('/templates');

    fireEvent.click(screen.getByRole('button', { name: /^\+ Create Issue$/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/create');

    fireEvent.click(screen.getByRole('button', { name: 'Unassigned Bank Transactions' }));
    expect(mockNavigate).toHaveBeenCalledWith('/compliance/bank-tx/unassigned');
    unmount();

    mockAuth.role = 'Marketing';
    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.queryByRole('button', { name: 'Unassigned Bank Transactions' })).not.toBeInTheDocument();
    expect(queryFilterSelect('Department')).toBeNull();
  });

  it('shows Unassigned Bank Transactions for Compliance and Support', async () => {
    mockAuth.role = 'Compliance';
    const { unmount } = render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByRole('button', { name: 'Unassigned Bank Transactions' })).toBeInTheDocument();
    unmount();

    mockAuth.role = 'Support';
    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.getByRole('button', { name: 'Unassigned Bank Transactions' })).toBeInTheDocument();
  });

  it('navigates to the issue detail on grouped row click', async () => {
    mockGetIssueList.mockImplementation(async (params?: { type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      return { data: [issue({ id: 42, name: 'Click me' })], total: 1 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByText('Click me').closest('tr') as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/issue/42');
  });

  it('shows Loading... on Load more while a paged append is in flight and hides spinner when rows exist', async () => {
    type ListResult = { data: SupportIssueListItem[]; total: number };
    const onHoldLoads: Deferred<ListResult>[] = [];
    const pageOne: ListResult = {
      data: [issue({ id: 1, state: 'OnHold', name: 'Paged 1' })],
      total: 2,
    };

    mockGetIssueCounts.mockResolvedValue({ OnHold: 2, Canceled: 0, Completed: 0 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') {
        const deferred = createDeferred<ListResult>();
        onHoldLoads.push(deferred);
        return deferred.promise;
      }
      return { data: [], total: 0 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();

    fireEvent.click(screen.getByRole('button', { name: 'OnHold (2)' }));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    // Debounce also reloads the paged tab (skip 0, replace) — settle both before Load more.
    await flushDebounce();
    expect(onHoldLoads.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      onHoldLoads[0].resolve(pageOne);
      onHoldLoads[1].resolve(pageOne);
      await Promise.resolve();
    });

    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByText('Paged 1')).toBeInTheDocument();

    const beforeAppend = onHoldLoads.length;
    fireEvent.click(screen.getByRole('button', { name: 'Load more (1 / 2)' }));
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled();
    expect(onHoldLoads.length).toBe(beforeAppend + 1);

    await act(async () => {
      onHoldLoads[onHoldLoads.length - 1].resolve({
        data: [issue({ id: 2, state: 'OnHold', name: 'Paged 2' })],
        total: 2,
      });
      await Promise.resolve();
    });

    expect(screen.getByText('Paged 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more|Loading/ })).not.toBeInTheDocument();
  });

  it('surfaces paged getIssueList failures and Unknown error for empty messages', async () => {
    mockGetIssueCounts.mockResolvedValue({ OnHold: 1, Canceled: 0, Completed: 0 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') throw new Error('page fail');
      return { data: [], total: 0 };
    });

    const { unmount } = render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('page fail');
    unmount();

    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') throw { message: '' };
      return { data: [], total: 0 };
    });
    render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    await flushDebounce();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('applies Open department filter to getIssueList and defaults missing count keys to zero', async () => {
    mockGetIssueCounts.mockResolvedValue({});
    render(<SupportDashboardScreen />);
    await flushDebounce();

    expect(screen.getByRole('button', { name: 'OnHold (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Canceled (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completed (0)' })).toBeInTheDocument();

    mockGetIssueList.mockClear();
    fireEvent.change(filterSelect('Department'), { target: { value: 'Compliance' } });
    await flushDebounce();
    expect(mockGetIssueList).toHaveBeenCalledWith({
      states: 'Created,Pending',
      department: 'Compliance',
    });
  });

  it('passes the search query into paged loads', async () => {
    mockGetIssueCounts.mockResolvedValue({ OnHold: 1, Canceled: 0, Completed: 0 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') {
        return { data: [issue({ id: 5, state: 'OnHold', name: 'Hold search' })], total: 1 };
      }
      return { data: [], total: 0 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    await flushDebounce();
    mockGetIssueList.mockClear();

    fireEvent.change(searchInput(), { target: { value: 'hold-q' } });
    await flushDebounce();
    expect(mockGetIssueList).toHaveBeenCalledWith({
      states: 'OnHold',
      take: 20,
      skip: 0,
      query: 'hold-q',
    });
  });

  it('hides Unassigned Bank Transactions when session is missing', async () => {
    mockAuth.hasSession = false;
    render(<SupportDashboardScreen />);
    await flushDebounce();
    expect(screen.queryByRole('button', { name: 'Unassigned Bank Transactions' })).not.toBeInTheDocument();
  });

  it('navigates from a paged issue row', async () => {
    mockGetIssueCounts.mockResolvedValue({ OnHold: 1, Canceled: 0, Completed: 0 });
    mockGetIssueList.mockImplementation(async (params?: { states?: string; type?: string }) => {
      if (params?.type === 'LimitRequest') return { data: [], total: 0 };
      if (params?.states === 'OnHold') {
        return { data: [issue({ id: 99, state: 'OnHold', name: 'Paged click' })], total: 1 };
      }
      return { data: [], total: 0 };
    });

    render(<SupportDashboardScreen />);
    await flushDebounce();
    fireEvent.click(screen.getByRole('button', { name: 'OnHold (1)' }));
    await flushDebounce();
    fireEvent.click(screen.getByText('Paged click').closest('tr') as HTMLElement);
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/issue/99');
  });
});
