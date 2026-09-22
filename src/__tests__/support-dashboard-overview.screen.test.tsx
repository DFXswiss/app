// Unit tests for SupportDashboardOverviewScreen: name-load error on My tickets must stay
// visible without hiding id-assigned tickets. Heavy deps are mocked so the screen renders
// under @testing-library/react without the full app shell.

const mockUseSupportDashboardGuard = jest.fn();
const mockNavigate = jest.fn();
const mockGetIssueList = jest.fn();
const mockGetIssueStatistics = jest.fn();
const mockAuth = { account: 7 };
const mockStaffName: { name?: string; isLoading: boolean; error?: string } = {
  name: undefined,
  isLoading: false,
  error: undefined,
};

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
    LIMIT_REQUEST: 'LimitRequest',
  },
  Department: { SUPPORT: 'Support', COMPLIANCE: 'Compliance' },
  UserRole: { ADMIN: 'Admin', SUPPORT: 'Support' },
  useAuthContext: () => ({ session: { account: mockAuth.account } }),
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
}));

jest.mock('src/hooks/support-dashboard.hook', () => ({
  useSupportDashboard: () => ({
    getIssueList: mockGetIssueList,
    getIssueStatistics: mockGetIssueStatistics,
  }),
  isAssignedToMe: (
    issue: { clerkUserDataId?: number; clerk?: string },
    sessionAccount?: number | null,
    verifiedName?: string | null,
  ) => {
    if (issue.clerkUserDataId != null) return issue.clerkUserDataId === sessionAccount;
    return !!verifiedName && !!issue.clerk && issue.clerk === verifiedName;
  },
}));

jest.mock('src/hooks/staff-verified-name.hook', () => ({
  useStaffVerifiedName: () => mockStaffName,
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

import { render, screen, waitFor, within } from '@testing-library/react';
import { STAFF_NAME_MISSING, staffNameLoadError } from 'src/components/compliance/staff-identity';
import type { SupportIssueListItem } from 'src/hooks/support-dashboard.hook';
import SupportDashboardOverviewScreen from 'src/screens/support-dashboard-overview.screen';

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

describe('SupportDashboardOverviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.account = 7;
    mockStaffName.name = undefined;
    mockStaffName.isLoading = false;
    mockStaffName.error = undefined;
    mockGetIssueList.mockResolvedValue({ data: [] });
  });

  it('shows the name-load hint and keeps id-assigned tickets visible', async () => {
    mockStaffName.error = 'Network down';
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({ id: 1, name: 'Assigned by id', clerkUserDataId: 7, clerk: 'Ada' }),
        issue({ id: 2, name: 'Assigned by name only', clerk: 'Ada' }),
        issue({ id: 3, name: 'Someone else', clerkUserDataId: 99 }),
      ],
    });

    render(<SupportDashboardOverviewScreen />);

    await waitFor(() => expect(screen.getByText('Assigned by id')).toBeInTheDocument());

    const mine = document.getElementById('my-tickets');
    expect(mine).not.toBeNull();
    const hint = within(mine as HTMLElement).getByTestId('error-hint');
    expect(hint).toHaveTextContent(staffNameLoadError('Network down'));
    expect(hint).toHaveTextContent('Tickets assigned only by name may be missing from this list.');
    expect(within(mine as HTMLElement).queryByText('Assigned by name only')).not.toBeInTheDocument();
    expect(within(mine as HTMLElement).queryByText('Someone else')).not.toBeInTheDocument();
  });

  it('shows the missing-name hint and keeps id-assigned tickets visible', async () => {
    mockGetIssueList.mockResolvedValue({
      data: [
        issue({ id: 1, name: 'Assigned by id', clerkUserDataId: 7, clerk: 'Ada' }),
        issue({ id: 2, name: 'Assigned by name only', clerk: 'Ada' }),
        issue({ id: 3, name: 'Someone else', clerkUserDataId: 99 }),
      ],
    });

    render(<SupportDashboardOverviewScreen />);

    await waitFor(() => expect(screen.getByText('Assigned by id')).toBeInTheDocument());

    const mine = document.getElementById('my-tickets');
    expect(mine).not.toBeNull();
    const hint = within(mine as HTMLElement).getByTestId('error-hint');
    expect(hint).toHaveTextContent(STAFF_NAME_MISSING);
    expect(hint).toHaveTextContent('Tickets assigned only by name may be missing from this list.');
    expect(hint).not.toHaveTextContent('Could not load your verified name');
    expect(within(mine as HTMLElement).queryByText('Assigned by name only')).not.toBeInTheDocument();
    expect(within(mine as HTMLElement).queryByText('Someone else')).not.toBeInTheDocument();
  });
});
