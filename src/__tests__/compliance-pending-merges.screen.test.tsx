// Unit tests for CompliancePendingMergesScreen: state exclusivity, row variants, every column,
// and per-account navigation. Heavy transitive deps are mocked so the screen can render under
// @testing-library/react without the full app shell.

let mockIsLoggedIn = true;
const mockGetPendingMerges = jest.fn();
const mockNavigate = jest.fn();
const mockUseComplianceGuard = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getPendingMerges: mockGetPendingMerges }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MergeReason, PendingMergeAccount, PendingMergeEntry } from 'src/dto/account-merge.dto';
import CompliancePendingMergesScreen from 'src/screens/compliance-pending-merges.screen';
import { formatSwissDateTime } from 'src/util/utils';

type PendingMergePayload = Omit<PendingMergeEntry, 'requestedDate' | 'expiration'> & {
  requestedDate: string;
  expiration: string;
};

// JSON round-trip: mirrors real HTTP transport (drops undefined keys, keeps ISO strings, breaks aliasing)
function asTransport<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const REQUESTED = '2026-01-15T10:00:00.000Z';
const EXPIRATION = '2026-02-14T10:00:00.000Z';

function makeAccount(overrides: Partial<PendingMergeAccount> = {}): PendingMergeAccount {
  return {
    userDataId: 9101,
    userName: 'Master Name',
    mail: 'master@example.com',
    kycLevel: 30,
    ...overrides,
  };
}

function baseEntry(overrides: Partial<PendingMergePayload> = {}): PendingMergeEntry {
  return {
    id: 9001,
    reason: MergeReason.IBAN,
    master: makeAccount(),
    slave: makeAccount({ userDataId: 9102, userName: 'Slave Name', mail: 'slave@example.com', kycLevel: 40 }),
    isProcessing: false,
    requestedDate: REQUESTED,
    expiration: EXPIRATION,
    ...overrides,
  } as unknown as PendingMergeEntry;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls = {
    resolve: (_value: T) => {
      throw new Error('deferred not initialized');
    },
    reject: (_reason: Error) => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, resolve: controls.resolve, reject: controls.reject };
}

describe('CompliancePendingMergesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn = true;
    mockGetPendingMerges.mockResolvedValue(asTransport([]));
  });

  it('calls the compliance guard on render, with the guard left active', () => {
    render(<CompliancePendingMergesScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
  });

  it('does not fetch when not logged in', () => {
    mockIsLoggedIn = false;
    render(<CompliancePendingMergesScreen />);

    expect(mockGetPendingMerges).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows the loading spinner while the initial fetch is in flight', async () => {
    const deferred = createDeferred<PendingMergeEntry[]>();
    mockGetPendingMerges.mockReturnValue(deferred.promise);

    render(<CompliancePendingMergesScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    deferred.resolve(asTransport([]));
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('shows only ErrorHint on fetch failure (no table, no empty-state text)', async () => {
    mockGetPendingMerges.mockRejectedValue(new Error('Network down'));

    render(<CompliancePendingMergesScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down');
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending merges found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows the empty-state row when the response is a successful empty list', async () => {
    mockGetPendingMerges.mockResolvedValue(asTransport([]));

    render(<CompliancePendingMergesScreen />);

    await waitFor(() => {
      expect(screen.getByText('No pending merges found')).toBeInTheDocument();
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('renders every column, both statuses, a missing reason and accounts without name or mail', async () => {
    const processingWithoutDetails = baseEntry({
      id: 9002,
      reason: undefined,
      master: makeAccount({ userDataId: 9103, userName: undefined, mail: undefined, kycLevel: 10 }),
      slave: makeAccount({ userDataId: 9104, userName: 'Second Slave', mail: undefined, kycLevel: 20 }),
      isProcessing: true,
    });

    mockGetPendingMerges.mockResolvedValue(asTransport([baseEntry(), processingWithoutDetails]));

    render(<CompliancePendingMergesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Master Name')).toBeInTheDocument();
    });

    // Column headers
    expect(screen.getByText('Requested')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Master account')).toBeInTheDocument();
    expect(screen.getByText('Slave account')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    // Dates: one requested and one expiration cell per row
    expect(screen.getAllByText(formatSwissDateTime(new Date(REQUESTED)))).toHaveLength(2);
    expect(screen.getAllByText(formatSwissDateTime(new Date(EXPIRATION)))).toHaveLength(2);

    // Reason present on one row, missing on the other
    expect(screen.getByText(MergeReason.IBAN)).toBeInTheDocument();

    // Both account names, ids and KYC levels
    expect(screen.getByText('Slave Name')).toBeInTheDocument();
    expect(screen.getByText('Second Slave')).toBeInTheDocument();
    expect(screen.getByText('#9101')).toBeInTheDocument();
    expect(screen.getByText('#9102')).toBeInTheDocument();
    expect(screen.getByText('#9103')).toBeInTheDocument();
    expect(screen.getByText('#9104')).toBeInTheDocument();
    expect(screen.getByText('KYC 30')).toBeInTheDocument();
    expect(screen.getByText('KYC 40')).toBeInTheDocument();
    expect(screen.getByText('KYC 10')).toBeInTheDocument();
    expect(screen.getByText('KYC 20')).toBeInTheDocument();

    // Mail shown when present, omitted when absent
    expect(screen.getByText('master@example.com')).toBeInTheDocument();
    expect(screen.getByText('slave@example.com')).toBeInTheDocument();
    expect(screen.queryByText('second-slave@example.com')).not.toBeInTheDocument();

    // Missing reason and missing name render the dash fallback
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);

    // Both status variants
    expect(screen.getByText('Waiting for confirmation')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('navigates to the master account only when the master cell is clicked', async () => {
    mockGetPendingMerges.mockResolvedValue(
      asTransport([baseEntry({ master: makeAccount({ userDataId: 9101, userName: 'Master Navigate' }) })]),
    );

    render(<CompliancePendingMergesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Master Navigate')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Master Navigate/ }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('compliance/user/9101');
    expect(mockNavigate).not.toHaveBeenCalledWith('compliance/user/9102');
  });

  it('navigates to the slave account only when the slave cell is clicked', async () => {
    mockGetPendingMerges.mockResolvedValue(
      asTransport([baseEntry({ slave: makeAccount({ userDataId: 9102, userName: 'Slave Navigate' }) })]),
    );

    render(<CompliancePendingMergesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Slave Navigate')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Slave Navigate/ }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('compliance/user/9102');
    expect(mockNavigate).not.toHaveBeenCalledWith('compliance/user/9101');
  });
});
