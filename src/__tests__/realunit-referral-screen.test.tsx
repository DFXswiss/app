// Component tests for the RealUnit referral list screen: only referral invites are shown, the pending
// count, the held-for-review filter with translated review status, row navigation, and the empty and
// error states. Heavy transitive deps are mocked so the screen renders under @testing-library/react
// without the full app shell.

jest.mock('@dfx.swiss/react', () => ({}));
jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: () => <div data-testid="spinner" />,
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/hooks/guard.hook', () => ({ useRealunitGuard: () => undefined }));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
const mockLayoutOptions = jest.fn();
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: unknown) => mockLayoutOptions(options),
}));

const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const mockGetRelations = jest.fn();
jest.mock('src/hooks/realunit-referral.hook', () => ({
  useRealunitReferral: () => ({ getRelations: mockGetRelations }),
}));

jest.mock('src/util/utils', () => ({ formatSwissDateTimeWithSeconds: (v: string) => v }));

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RealUnitCodeKind, RealUnitManualReviewStatus } from 'src/dto/realunit-referral.dto';
import RealunitReferralScreen from 'src/screens/realunit-referral.screen';

const PENDING = {
  id: 1,
  kind: RealUnitCodeKind.INVITE,
  userId: 10,
  code: 'AB12CD',
  credited: false,
  created: '2026-09-01T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.PENDING,
};
const APPROVED = {
  id: 2,
  kind: RealUnitCodeKind.INVITE,
  userId: 11,
  code: 'OK1234',
  credited: true,
  created: '2026-09-02T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.APPROVED,
};
const REJECTED = {
  id: 4,
  kind: RealUnitCodeKind.INVITE,
  userId: 13,
  code: 'NO5678',
  credited: false,
  created: '2026-09-04T10:00:00Z',
  reviewStatus: RealUnitManualReviewStatus.REJECTED,
};
const NO_STATUS = {
  id: 3,
  kind: RealUnitCodeKind.INVITE,
  userId: 12,
  code: 'NOSTAT',
  credited: false,
  created: '2026-09-03T10:00:00Z',
};
const PROMO = {
  id: 5,
  kind: RealUnitCodeKind.PROMO,
  userId: 14,
  code: 'PROMO9',
  credited: true,
  created: '2026-09-05T10:00:00Z',
};

describe('RealunitReferralScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('titles the screen Referrals', async () => {
    mockGetRelations.mockResolvedValue([]);
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByText('No entries found')).toBeInTheDocument());
    expect(mockLayoutOptions).toHaveBeenCalledWith({ title: 'Referrals', backButton: true, noMaxWidth: true });
  });

  it('shows only referral invites, the pending count and translated review statuses', async () => {
    mockGetRelations.mockResolvedValue([PENDING, APPROVED, REJECTED, PROMO]);
    render(<RealunitReferralScreen />);

    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());

    expect(screen.queryByText('PROMO9')).not.toBeInTheDocument();
    expect(screen.getByText(/Redemptions/)).toHaveTextContent('Redemptions: 3');
    expect(screen.getByText(/Held for review only/)).toHaveTextContent('Held for review only (1)');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('columnheader', { name: 'Review Status' })).toBeInTheDocument();
    expect(within(screen.getByText('AB12CD').closest('tr') as HTMLElement).getByText('Open')).toBeInTheDocument();
    expect(within(screen.getByText('OK1234').closest('tr') as HTMLElement).getByText('Approved')).toBeInTheDocument();
    expect(within(screen.getByText('NO5678').closest('tr') as HTMLElement).getByText('Rejected')).toBeInTheDocument();
    expect(within(screen.getByText('OK1234').closest('tr') as HTMLElement).getByText('Yes')).toBeInTheDocument();
  });

  it('shows only pending invites when the filter is turned on', async () => {
    mockGetRelations.mockResolvedValue([PENDING, APPROVED]);
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.queryByText('OK1234')).not.toBeInTheDocument();
    expect(screen.getByText('AB12CD')).toBeInTheDocument();
  });

  it('shows a dash when reviewStatus is omitted', async () => {
    mockGetRelations.mockResolvedValue([PENDING, NO_STATUS]);
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByText('NOSTAT')).toBeInTheDocument());
    const row = screen.getByText('NOSTAT').closest('tr') as HTMLElement;
    expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('-');
  });

  it('navigates to the referral detail on row click', async () => {
    mockGetRelations.mockResolvedValue([PENDING]);
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByText('AB12CD')).toBeInTheDocument());

    fireEvent.click(screen.getByText('AB12CD'));

    expect(mockNavigate).toHaveBeenCalledWith('/realunit/referral/1');
  });

  it('shows the empty state when the review filter hides every row', async () => {
    mockGetRelations.mockResolvedValue([APPROVED]);
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByText('OK1234')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('shows the spinner and a placeholder count while loading', async () => {
    let resolve: (value: unknown[]) => void = () => undefined;
    mockGetRelations.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<RealunitReferralScreen />);

    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByText(/Redemptions/)).toHaveTextContent('Redemptions: …');

    resolve([]);
    await waitFor(() => expect(screen.getByText('No entries found')).toBeInTheDocument());
  });

  it('shows the error when the list load fails', async () => {
    mockGetRelations.mockRejectedValue(new Error('boom'));
    render(<RealunitReferralScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
    expect(screen.queryByText('AB12CD')).not.toBeInTheDocument();
  });

  it('falls back to Unknown error when relations reject without a message', async () => {
    mockGetRelations.mockRejectedValue({ message: undefined });
    render(<RealunitReferralScreen />);
    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });
});
