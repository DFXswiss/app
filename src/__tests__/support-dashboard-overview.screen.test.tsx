// Unit tests for SupportDashboardOverviewScreen: wait-tier card labels, cumulative counts,
// list filter after clicking the lowest pill, and the minutes subtitle. Heavy deps are mocked
// so the screen renders under @testing-library/react without the full app shell.

const mockUseSupportDashboardGuard = jest.fn();
const mockNavigate = jest.fn();
const mockGetIssueList = jest.fn();
const mockGetIssueStatistics = jest.fn();

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
    getIssueList: mockGetIssueList,
    getIssueStatistics: mockGetIssueStatistics,
  }),
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => ({ name: 'Josh', isLoading: false }),
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

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import SupportDashboardOverviewScreen from 'src/screens/support-dashboard-overview.screen';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';

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
    name: 'Five minutes waiting',
    lastMessageAuthor: 'Customer',
    lastMessageDate: minutesAgo(5),
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

function waitTierCard(): HTMLElement {
  const label = screen.getByText('Waiting longer than');
  const card = label.parentElement;
  if (!card) throw new Error('wait-tier card not found');
  return card;
}

function waitPills(): HTMLElement[] {
  return within(waitTierCard()).getAllByRole('button');
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
    mockGetIssueList.mockResolvedValue({ data: WAITING_TICKETS, total: WAITING_TICKETS.length });
    mockGetIssueStatistics.mockResolvedValue({ trend: [] });
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('labels the three waiting-longer-than pills 1 min, 12h, 24h in that order', async () => {
    await renderLoaded();

    expect(waitPills().map((pill) => pillParts(pill).label)).toEqual(['1 min', '12h', '24h']);
  });

  it('counts waiting tickets cumulatively and includes the 5-minute ticket in the lowest tier', async () => {
    await renderLoaded();

    expect(waitPills().map((pill) => pillParts(pill).count)).toEqual(['3', '2', '1']);
  });

  it('shows the 5-minute ticket in the list only after clicking the 1 min pill', async () => {
    await renderLoaded();

    expect(screen.queryByText('Five minutes waiting')).not.toBeInTheDocument();

    fireEvent.click(waitPills()[0]);

    expect(screen.getByText('Five minutes waiting')).toBeInTheDocument();
  });

  it('uses a minutes subtitle after clicking the 1 min pill, not a fractional hour', async () => {
    await renderLoaded();

    fireEvent.click(waitPills()[0]);

    const subtitle = screen.getByText(/Customer waiting longer than/);
    expect(subtitle.textContent).toBe('Customer waiting longer than 1 min for a reply');
  });
});
