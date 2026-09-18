// Unit tests for SupportDashboardOverviewScreen: wait-tier card, newest section, persisted
// wait filter, and the rest of the overview. Heavy deps are mocked so the screen renders
// under @testing-library/react without the full app shell.

const mockUseSupportDashboardGuard = jest.fn();
const mockNavigate = jest.fn();
const mockGetIssueList = jest.fn();
const mockGetIssueStatistics = jest.fn();
const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();
let mockCurrentGetIssueList: typeof mockGetIssueList = mockGetIssueList;
const mockStaffName: { name?: string; isLoading: boolean; error?: string } = {
  name: 'Josh',
  isLoading: false,
};

jest.mock('@dfx.swiss/react', () => ({
  SupportIssueInternalState: {
    CREATED: 'Created',
    PENDING: 'Pending',
    ON_HOLD: 'OnHold',
    CANCELED: 'Canceled',
    COMPLETED: 'Completed',
  },
  SupportIssueReason: {
    OTHER: 'Other',
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
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useSupportDashboardGuard: (...args: unknown[]) => mockUseSupportDashboardGuard(...args),
  SUPPORT_STAFF_ROLES: ['Admin', 'Compliance', 'Support'],
}));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  useSupportDashboard: () => ({
    getIssueList: mockCurrentGetIssueList,
    getIssueStatistics: mockGetIssueStatistics,
  }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({
    name: mockStaffName.name,
    isLoading: mockStaffName.isLoading,
    error: mockStaffName.error,
  }),
}));

jest.mock('src/components/compliance/staff-identity', () => ({
  STAFF_NAME_MISSING: 'Staff identification requires a verified name on this account.',
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    locale: 'en-US',
    translate: (_ns: string, key: string, params?: Record<string, string | number>) => {
      if (!params) return key;
      return Object.entries(params).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), key);
    },
  }),
}));

jest.mock('src/config/labels', () => ({
  IssueReasonLabels: {},
  IssueTypeLabels: {},
}));

jest.mock('src/util/compliance-helpers', () => ({
  formatDateTimeShort: (value: string) => `short:${value}`,
}));

jest.mock('src/util/safe-storage', () => ({
  storageGet: (...args: unknown[]) => mockStorageGet(...args),
  storageSet: (...args: unknown[]) => mockStorageSet(...args),
}));

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import SupportDashboardOverviewScreen from 'src/screens/support-dashboard-overview.screen';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';
import type { TicketStatistics } from 'src/util/support-helpers';
import { WAIT_TIERS } from 'src/util/support-stats';

const NOW = new Date('2026-06-18T12:00:00.000Z');
const originalScrollIntoView = Element.prototype.scrollIntoView;

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function issue(partial: Partial<SupportIssueListItem> = {}): SupportIssueListItem {
  return {
    id: 1,
    uid: 'u1',
    type: 'GenericIssue',
    reason: 'Other',
    state: 'Pending',
    name: 'Ticket',
    created: NOW.toISOString(),
    messageCount: 1,
    ...partial,
  };
}

const WAITING_TICKETS: SupportIssueListItem[] = [
  issue({
    id: 1,
    name: 'Five hours waiting',
    lastMessageAuthor: 'Customer',
    lastMessageDate: hoursAgo(5),
    clerk: 'Jana',
  }),
  issue({
    id: 2,
    name: 'Thirteen hours waiting',
    lastMessageAuthor: 'Customer',
    lastMessageDate: hoursAgo(13),
    clerk: 'Jana',
  }),
  issue({
    id: 3,
    name: 'Twenty-five hours waiting',
    lastMessageAuthor: 'Customer',
    lastMessageDate: hoursAgo(25),
    clerk: 'Jana',
  }),
  issue({
    id: 4,
    name: 'Already answered',
    lastMessageAuthor: 'Jana',
    lastMessageDate: minutesAgo(5),
    clerk: 'Jana',
  }),
];

async function flushPromises(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

async function renderLoaded(): Promise<void> {
  render(<SupportDashboardOverviewScreen />);
  await flushPromises();
}

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

function sampleStatistics(overrides: Partial<TicketStatistics> = {}): TicketStatistics {
  return {
    periodDays: 365,
    total: 4,
    avgMessages: 2.5,
    perDay: 1.5,
    granularity: 'month',
    trend: [{ key: '2026-06', count: 4 }],
    avgResolutionHours: 5,
    resolutionByType: [{ key: 'KycIssue', avgHours: 5, count: 2 }],
    ...overrides,
  };
}

function statCardValue(label: string): string {
  const labelEl = screen.getAllByText(label)[0];
  return labelEl.parentElement?.querySelector('.text-3xl')?.textContent ?? '';
}

function waitTierCard(): HTMLElement {
  const label = screen.getByText('Waiting longer than');
  const card = label.parentElement;
  if (!card) throw new Error('wait-tier card not found');
  return card;
}

function waitPills(): HTMLElement[] {
  return within(waitTierCard()).getAllByRole('button');
}

function section(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

function pillParts(button: HTMLElement): { count: string; label: string } {
  const spans = Array.from(button.querySelectorAll('span'));
  return { count: spans[0]?.textContent ?? '', label: spans[1]?.textContent ?? '' };
}

describe('SupportDashboardOverviewScreen wait-tier card', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
    resetStorage();
    mockGetIssueList.mockResolvedValue({ data: WAITING_TICKETS, total: WAITING_TICKETS.length });
    mockGetIssueStatistics.mockResolvedValue({ trend: [] });
  });

  afterEach(() => {
    resetIssueListFn();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('labels the three waiting-longer-than pills New, 12h, 24h in that order', async () => {
    await renderLoaded();

    expect(waitPills().map((pill) => pillParts(pill).label)).toEqual(['New', '12h', '24h']);
  });

  it('counts New exclusively and 12h/24h cumulatively', async () => {
    await renderLoaded();

    expect(waitPills().map((pill) => pillParts(pill).count)).toEqual(['1', '2', '1']);
  });

  it('lists the 5-hour ticket under New and hides it after clicking 12h', async () => {
    await renderLoaded();

    fireEvent.click(waitPills()[0]);
    expect(within(section('waiting')).getByText('Five hours waiting')).toBeInTheDocument();
    expect(within(section('waiting')).queryByText('Thirteen hours waiting')).not.toBeInTheDocument();

    fireEvent.click(waitPills()[1]);

    expect(within(section('waiting')).queryByText('Five hours waiting')).not.toBeInTheDocument();
    expect(within(section('waiting')).getByText('Thirteen hours waiting')).toBeInTheDocument();
  });

  it('starts on Escalations with the 24h subtitle when nothing is stored', async () => {
    await renderLoaded();

    expect(waitPills()[2].className).toContain('ring-2');
    expect(within(section('waiting')).getByRole('heading', { name: 'Escalations' })).toBeInTheDocument();
    expect(within(section('waiting')).getByText('Customer waiting longer than 24h for a reply')).toBeInTheDocument();
  });

  it('uses the New title and less-than-12h subtitle after clicking New', async () => {
    await renderLoaded();

    fireEvent.click(waitPills()[0]);
    expect(within(section('waiting')).getByRole('heading', { name: 'New' })).toBeInTheDocument();
    expect(within(section('waiting')).getByText('Customer waiting less than 12 hours for a reply')).toBeInTheDocument();
  });

  it('uses the hours subtitle after clicking the 12h pill', async () => {
    await renderLoaded();

    fireEvent.click(waitPills()[1]);

    expect(within(section('waiting')).getByRole('heading', { name: 'Waiting tickets' })).toBeInTheDocument();
    expect(within(section('waiting')).getByText('Customer waiting longer than 12h for a reply')).toBeInTheDocument();
  });

  it('shows No new waiting tickets when the New range is empty', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 2,
          name: 'Thirteen hours waiting',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(13),
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    fireEvent.click(waitPills()[0]);
    expect(screen.getByText('No new waiting tickets')).toBeInTheDocument();
  });
});

function resetStaffName(): void {
  mockStaffName.name = 'Josh';
  mockStaffName.isLoading = false;
  mockStaffName.error = undefined;
}

function resetIssueListFn(): void {
  mockCurrentGetIssueList = mockGetIssueList;
}

function resetStorage(): void {
  mockStorageGet.mockReset();
  mockStorageSet.mockReset();
  mockStorageGet.mockReturnValue(undefined);
}

describe('SupportDashboardOverviewScreen overview chrome', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
    resetStaffName();
    resetIssueListFn();
    resetStorage();
    mockGetIssueList.mockResolvedValue({ data: [], total: 0 });
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics());
  });

  afterEach(() => {
    resetStaffName();
    resetIssueListFn();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows the loading spinner until the issue list resolves', async () => {
    const deferred = createDeferred<{ data: SupportIssueListItem[]; total: number }>();
    mockGetIssueList.mockReturnValue(deferred.promise);

    render(<SupportDashboardOverviewScreen />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockUseSupportDashboardGuard).toHaveBeenCalledWith();

    await act(async () => {
      deferred.resolve({ data: [], total: 0 });
      await Promise.resolve();
    });
    await flushPromises();

    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your support overview' })).toBeInTheDocument();
  });

  it('surfaces getIssueList Error.message in the overview', async () => {
    mockGetIssueList.mockRejectedValue(new Error('List failed'));
    await renderLoaded();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('List failed');
  });

  it('falls back to Unknown error when getIssueList rejects without a message', async () => {
    mockGetIssueList.mockRejectedValue({});
    await renderLoaded();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('navigates to the full ticket list from View all tickets', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'View all tickets' }));
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/all');
  });

  it('switches to the Statistics tab and back to Overview', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    await flushPromises();
    expect(screen.getByText('Period:')).toBeInTheDocument();
    expect(screen.queryByText('Waiting longer than')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByText('Waiting longer than')).toBeInTheDocument();
    expect(screen.queryByText('Period:')).not.toBeInTheDocument();
  });

  it('does not reload the baseline issue list when getIssueList identity changes', async () => {
    await renderLoaded();
    mockGetIssueList.mockClear();

    const altList = jest.fn().mockResolvedValue({ data: [], total: 0 });
    mockCurrentGetIssueList = altList;
    fireEvent.click(waitPills()[1]);
    await flushPromises();

    expect(altList).not.toHaveBeenCalled();
    expect(mockGetIssueList).not.toHaveBeenCalled();
  });

  it('shows a dash for my-ticket count when the clerk name is missing', async () => {
    mockStaffName.name = undefined;
    await renderLoaded();

    expect(statCardValue('My tickets')).toContain('–');
  });

  it('scrolls to the my-tickets section when the My tickets card is clicked', async () => {
    await renderLoaded();
    const myTickets = section('my-tickets');
    const scrollIntoView = jest.fn();
    myTickets.scrollIntoView = scrollIntoView;

    fireEvent.click(screen.getAllByText('My tickets')[0]);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('shows No escalations when no customer has waited 24h', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 1,
          name: 'Short wait',
          lastMessageAuthor: 'Customer',
          lastMessageDate: minutesAgo(5),
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    expect(screen.getByText('No escalations — all customers replied to in time')).toBeInTheDocument();
  });

  it('shows No tickets waiting this long for a 12h filter with only a 5-minute wait', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 1,
          name: 'Short wait',
          lastMessageAuthor: 'Customer',
          lastMessageDate: minutesAgo(5),
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    fireEvent.click(waitPills()[1]);
    expect(screen.getByText('No tickets waiting this long')).toBeInTheDocument();
    expect(screen.getByText('Customer waiting longer than 12h for a reply')).toBeInTheDocument();
  });

  it('navigates to the issue detail when a waiting row is clicked', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 42,
          name: 'Escalated row',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(25),
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    fireEvent.click(within(section('waiting')).getByText('Escalated row'));
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/issue/42');
  });

  it('reloads the issue list on the 60s interval without showing the spinner again', async () => {
    await renderLoaded();
    mockGetIssueList.mockClear();
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 9,
          name: 'After refresh',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(25),
        }),
      ],
      total: 1,
    });

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await flushPromises();

    expect(mockGetIssueList).toHaveBeenCalled();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(within(section('waiting')).getByText('After refresh')).toBeInTheDocument();
  });
});

describe('SupportDashboardOverviewScreen limit requests and my tickets', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
    resetStaffName();
    resetIssueListFn();
    resetStorage();
    mockGetIssueList.mockResolvedValue({ data: [], total: 0 });
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics());
  });

  afterEach(() => {
    resetStaffName();
    resetIssueListFn();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shows No open limit requests when none are in the list', async () => {
    await renderLoaded();
    expect(screen.getByText('No open limit requests')).toBeInTheDocument();
  });

  it('lists limit requests oldest first and navigates on row click', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 2,
          name: 'Newer limit',
          type: 'LimitRequest',
          created: '2026-06-18T11:00:00.000Z',
          lastMessageAuthor: 'Jana',
        }),
        issue({
          id: 1,
          name: 'Older limit',
          type: 'LimitRequest',
          created: '2026-06-17T11:00:00.000Z',
          lastMessageAuthor: 'Jana',
        }),
      ],
      total: 2,
    });
    await renderLoaded();

    const names = within(section('limit-requests'))
      .getAllByText(/limit$/i)
      .map((el) => el.textContent);
    expect(names).toEqual(['Older limit', 'Newer limit']);

    fireEvent.click(within(section('limit-requests')).getByText('Older limit'));
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/issue/1');
  });

  it('shows a spinner in My tickets while the clerk name is loading', async () => {
    mockStaffName.isLoading = true;
    mockStaffName.name = undefined;
    await renderLoaded();

    expect(within(section('my-tickets')).getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows the verified-name error when loading the clerk name failed', async () => {
    mockStaffName.name = undefined;
    mockStaffName.error = 'ldap down';
    await renderLoaded();

    expect(screen.getByText('Could not load your verified name: ldap down')).toBeInTheDocument();
  });

  it('shows STAFF_NAME_MISSING when there is no clerk name', async () => {
    mockStaffName.name = undefined;
    await renderLoaded();

    expect(screen.getByText('Staff identification requires a verified name on this account.')).toBeInTheDocument();
  });

  it('shows No tickets assigned to you when the clerk has a name but no tickets', async () => {
    await renderLoaded();
    expect(screen.getByText('No tickets assigned to you')).toBeInTheDocument();
  });

  it('still lists my tickets when a clerk-name error arrives together with a name', async () => {
    mockStaffName.error = 'ignored';
    mockGetIssueList.mockResolvedValue({
      data: [issue({ id: 7, name: 'Still mine', clerk: 'Josh', lastMessageAuthor: 'Josh' })],
      total: 1,
    });
    await renderLoaded();

    expect(within(section('my-tickets')).getByText('Still mine')).toBeInTheDocument();
    expect(screen.queryByText(/Could not load your verified name/)).not.toBeInTheDocument();
  });

  it('lists my tickets oldest first and navigates on row click', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 8,
          name: 'Newer mine',
          clerk: 'Josh',
          created: '2026-06-18T10:00:00.000Z',
          lastMessageAuthor: 'Josh',
        }),
        issue({
          id: 7,
          name: 'Older mine',
          clerk: 'Josh',
          created: '2026-06-17T10:00:00.000Z',
          lastMessageAuthor: 'Josh',
        }),
      ],
      total: 2,
    });
    await renderLoaded();

    const names = within(section('my-tickets'))
      .getAllByText(/mine$/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Older mine', 'Newer mine']);
    expect(statCardValue('My tickets')).toBe('2/ 2');

    fireEvent.click(within(section('my-tickets')).getByText('Older mine'));
    expect(mockNavigate).toHaveBeenCalledWith('/support/dashboard/issue/7');
  });

  it('shows the last-activity date and Replied for a ticket we answered', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 3,
          name: 'Limit we answered',
          type: 'LimitRequest',
          created: '2026-06-01T00:00:00.000Z',
          lastMessageAuthor: 'Jana',
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    expect(within(section('limit-requests')).getByTitle('Replied')).toBeInTheDocument();
    expect(within(section('limit-requests')).getByText('short:2026-06-01T00:00:00.000Z')).toBeInTheDocument();
  });

  it('colors the wait badge gray below 12h, yellow from 12h, and red from 24h', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 1,
          name: 'Five hour wait',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(5),
        }),
        issue({
          id: 2,
          name: 'Twelve hour wait',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(13),
        }),
        issue({
          id: 3,
          name: 'Twenty-four hour wait',
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(25),
        }),
      ],
      total: 3,
    });
    await renderLoaded();

    const badgeOf = (name: string): HTMLElement => {
      const row = within(section('waiting')).getByText(name).closest('li');
      if (!row) throw new Error(`row "${name}" not found`);
      const badge = row.querySelector('span.rounded-full.font-semibold');
      if (!(badge instanceof HTMLElement)) throw new Error(`badge for "${name}" not found`);
      return badge;
    };

    fireEvent.click(waitPills()[0]);
    expect(badgeOf('Five hour wait').className).toContain('bg-dfxGray-300');

    fireEvent.click(waitPills()[1]);
    expect(within(section('waiting')).getByTitle('Escalated')).toBeInTheDocument();
    expect(badgeOf('Twelve hour wait').className).toContain('dfxYellow');
    expect(badgeOf('Twenty-four hour wait').className).toContain('bg-dfxRed-100');
  });

  it('omits the clerk suffix when a waiting ticket has no clerk', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({
          id: 5,
          name: 'Unassigned wait',
          clerk: undefined,
          lastMessageAuthor: 'Customer',
          lastMessageDate: hoursAgo(25),
        }),
      ],
      total: 1,
    });
    await renderLoaded();

    const row = within(section('waiting')).getByText('Unassigned wait').closest('li');
    if (!row) throw new Error('row missing');
    expect(row.textContent).toContain('GenericIssue · Other');
    expect(row.textContent).not.toContain('GenericIssue · Other ·');
  });
});

describe('SupportDashboardOverviewScreen statistics', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
    resetStaffName();
    resetIssueListFn();
    resetStorage();
    mockGetIssueList.mockResolvedValue({ data: [], total: 0 });
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics());
  });

  afterEach(() => {
    resetStaffName();
    resetIssueListFn();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  async function openStatistics(): Promise<void> {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    await flushPromises();
  }

  it('loads server statistics and shows the headline numbers', async () => {
    await openStatistics();

    expect(mockGetIssueStatistics).toHaveBeenCalledWith(365);
    expect(statCardValue('New tickets')).toBe('4');
    expect(statCardValue('Avg messages / ticket')).toBe('2.5');
    expect(statCardValue('Tickets / day')).toBe('1.5');
    expect(statCardValue('Avg resolution time')).toBe('5h');
    expect(screen.getByText('KycIssue')).toBeInTheDocument();
    expect(screen.getByText(/· 2/)).toBeInTheDocument();
  });

  it('shows a dash for zero average resolution time', async () => {
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics({ avgResolutionHours: 0 }));
    await openStatistics();

    expect(statCardValue('Avg resolution time')).toBe('–');
  });

  it('shows No resolved tickets yet when resolutionByType is empty', async () => {
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics({ resolutionByType: [], trend: [] }));
    await openStatistics();

    expect(screen.getByText('No resolved tickets yet')).toBeInTheDocument();
  });

  it('shows the statistics spinner while the request is in flight', async () => {
    const deferred = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValue(deferred.promise);

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => {
      deferred.resolve(sampleStatistics());
      await Promise.resolve();
    });
    await flushPromises();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(statCardValue('New tickets')).toBe('4');
  });

  it('falls back to computeStatistics when trend is not an array', async () => {
    mockGetIssueStatistics.mockResolvedValue({ total: 99 } as unknown as TicketStatistics);
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) {
        return {
          data: [issue({ id: 1, created: NOW.toISOString(), messageCount: 3 })],
          total: 1,
        };
      }
      return { data: [], total: 0 };
    });

    await openStatistics();

    expect(mockGetIssueList).toHaveBeenCalledWith({ take: 1000 });
    expect(statCardValue('New tickets')).toBe('1');
    expect(statCardValue('Avg messages / ticket')).toBe('3.0');
  });

  it('falls back to the recent-ticket list when getIssueStatistics rejects', async () => {
    mockGetIssueStatistics.mockRejectedValue(new Error('stats down'));
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) {
        return { data: [issue({ id: 1, created: NOW.toISOString() }), issue({ id: 2, created: NOW.toISOString() })], total: 2 };
      }
      return { data: [], total: 0 };
    });

    await openStatistics();

    expect(mockGetIssueList).toHaveBeenCalledWith({ take: 1000 });
    expect(statCardValue('New tickets')).toBe('2');
  });

  it('shows the fallback Error.message when the recent-ticket list also fails', async () => {
    mockGetIssueStatistics.mockRejectedValue(new Error('stats down'));
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) throw new Error('list down');
      return { data: [], total: 0 };
    });

    await openStatistics();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('list down');
  });

  it('shows Unknown error when the fallback list fails without a message', async () => {
    mockGetIssueStatistics.mockRejectedValue(new Error('stats down'));
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) return Promise.reject({});
      return { data: [], total: 0 };
    });

    await openStatistics();

    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('keeps newer statistics when an older success arrives last', async () => {
    const older = createDeferred<TicketStatistics>();
    const newer = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    await act(async () => {
      newer.resolve(sampleStatistics({ total: 7 }));
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');

    await act(async () => {
      older.resolve(sampleStatistics({ total: 99 }));
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('does not apply an older fallback after a newer request has started', async () => {
    const olderStats = createDeferred<TicketStatistics>();
    const olderList = createDeferred<{ data: SupportIssueListItem[]; total: number }>();
    const newer = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValueOnce(olderStats.promise).mockReturnValueOnce(newer.promise);
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) return olderList.promise;
      return { data: [], total: 0 };
    });

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));

    await act(async () => {
      olderStats.reject(new Error('stale stats'));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    await act(async () => {
      newer.resolve(sampleStatistics({ total: 7 }));
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');

    await act(async () => {
      olderList.resolve({
        data: [issue({ id: 1, created: NOW.toISOString() }), issue({ id: 2, created: NOW.toISOString() })],
        total: 2,
      });
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');
  });

  it('does not show an older fallback error after a newer success', async () => {
    const olderStats = createDeferred<TicketStatistics>();
    const olderList = createDeferred<{ data: SupportIssueListItem[]; total: number }>();
    const newer = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValueOnce(olderStats.promise).mockReturnValueOnce(newer.promise);
    mockGetIssueList.mockImplementation(async (params?: { take?: number }) => {
      if (params?.take === 1000) return olderList.promise;
      return { data: [], total: 0 };
    });

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));

    await act(async () => {
      olderStats.reject(new Error('stale stats'));
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    await act(async () => {
      newer.resolve(sampleStatistics({ total: 7 }));
      await Promise.resolve();
    });

    await act(async () => {
      olderList.reject(new Error('stale list'));
      await Promise.resolve();
    });

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(statCardValue('New tickets')).toBe('7');
  });

  it('does not start the fallback list for a stale statistics failure', async () => {
    const olderStats = createDeferred<TicketStatistics>();
    const newer = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValueOnce(olderStats.promise).mockReturnValueOnce(newer.promise);

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    mockGetIssueList.mockClear();
    await act(async () => {
      olderStats.reject(new Error('stale stats'));
      await Promise.resolve();
    });
    expect(mockGetIssueList).not.toHaveBeenCalled();

    await act(async () => {
      newer.resolve(sampleStatistics({ total: 7 }));
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');
  });

  it('reloads statistics when the period changes', async () => {
    await openStatistics();
    mockGetIssueStatistics.mockClear();
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics({ total: 30 }));

    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await flushPromises();

    expect(mockGetIssueStatistics).toHaveBeenCalledWith(30);
    expect(statCardValue('New tickets')).toBe('30');
  });

  it('shows per-bar counts when the trend is short', async () => {
    await openStatistics();
    const bar = screen.getByTitle('Jun: 4').parentElement;
    if (!bar) throw new Error('trend bar missing');
    expect(within(bar).getByText('4')).toBeInTheDocument();
    expect(within(bar).getByText('Jun')).toBeInTheDocument();
  });

  it('thins bar labels when the trend has more than 16 buckets', async () => {
    mockGetIssueStatistics.mockResolvedValue(
      sampleStatistics({
        granularity: 'day',
        trend: Array.from({ length: 18 }, (_, i) => ({
          key: `2026-06-${String(i + 1).padStart(2, '0')}`,
          count: i === 0 ? 3 : 1,
        })),
      }),
    );
    await openStatistics();

    expect(screen.getByTitle('01.06.: 3')).toBeInTheDocument();
    expect(screen.getByTitle('02.06.: 1')).toBeInTheDocument();
    expect(screen.getByText('01.06.')).toBeInTheDocument();
    expect(screen.queryByText('02.06.')).not.toBeInTheDocument();
  });

  it('keeps showing the spinner while a newer period request is still in flight after an older one finishes', async () => {
    const older = createDeferred<TicketStatistics>();
    const newer = createDeferred<TicketStatistics>();
    mockGetIssueStatistics.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);

    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Statistics' }));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    await act(async () => {
      older.resolve(sampleStatistics({ total: 99 }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();

    await act(async () => {
      newer.resolve(sampleStatistics({ total: 7 }));
      await Promise.resolve();
    });
    expect(statCardValue('New tickets')).toBe('7');
  });
});

describe('SupportDashboardOverviewScreen wait-filter persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    Element.prototype.scrollIntoView = jest.fn();
    jest.clearAllMocks();
    resetStaffName();
    resetIssueListFn();
    resetStorage();
    mockGetIssueList.mockResolvedValue({ data: WAITING_TICKETS, total: WAITING_TICKETS.length });
    mockGetIssueStatistics.mockResolvedValue(sampleStatistics());
  });

  afterEach(() => {
    resetStaffName();
    resetIssueListFn();
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('restores a stored 12h filter so that pill is active and the list is filtered', async () => {
    mockStorageGet.mockReturnValue('12');
    await renderLoaded();

    const pills = waitPills();
    expect(pillParts(pills[1]).label).toBe('12h');
    expect(pills[1].className).toContain('ring-2');
    expect(pills[2].className).not.toContain('ring-2');
    expect(within(section('waiting')).queryByText('Five hours waiting')).not.toBeInTheDocument();
    expect(within(section('waiting')).getByText('Thirteen hours waiting')).toBeInTheDocument();
  });

  it('writes the selected wait tier to storage when a pill is clicked', async () => {
    await renderLoaded();

    fireEvent.click(waitPills()[1]);

    expect(mockStorageSet).toHaveBeenCalledWith(
      'localStorage',
      'dfx.support.waitFilterHours',
      String(WAIT_TIERS[1].minHours),
    );
    expect(waitPills()[1].className).toContain('ring-2');
  });

  it('discards a stored 1-minute leftover and starts at 24h', async () => {
    mockStorageGet.mockReturnValue('0.016666666666666666');
    await renderLoaded();

    expect(waitPills()[2].className).toContain('ring-2');
    expect(waitPills()[0].className).not.toContain('ring-2');
    expect(within(section('waiting')).queryByText('Five hours waiting')).not.toBeInTheDocument();
    expect(within(section('waiting')).getByText('Twenty-five hours waiting')).toBeInTheDocument();
  });

  it('starts at 24h when the stored value is empty or not a number', async () => {
    mockStorageGet.mockReturnValue('');
    const first = render(<SupportDashboardOverviewScreen />);
    await flushPromises();
    expect(waitPills()[2].className).toContain('ring-2');
    first.unmount();

    mockStorageGet.mockReturnValue('not-a-number');
    render(<SupportDashboardOverviewScreen />);
    await flushPromises();
    expect(waitPills()[2].className).toContain('ring-2');
  });

  it('starts at 24h when reading storage throws', async () => {
    mockStorageGet.mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderLoaded();

    expect(waitPills()[2].className).toContain('ring-2');
    expect(screen.getByText('Your support overview')).toBeInTheDocument();
  });

  it('keeps the in-memory selection when writing storage throws', async () => {
    mockStorageSet.mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderLoaded();

    fireEvent.click(waitPills()[1]);

    expect(mockStorageSet).toHaveBeenCalledWith(
      'localStorage',
      'dfx.support.waitFilterHours',
      String(WAIT_TIERS[1].minHours),
    );
    expect(waitPills()[1].className).toContain('ring-2');
    expect(within(section('waiting')).getByText('Thirteen hours waiting')).toBeInTheDocument();
  });
});

