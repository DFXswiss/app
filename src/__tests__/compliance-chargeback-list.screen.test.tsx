// Unit tests for ComplianceChargebackListScreen: state exclusivity, row variants, amount/tx
// formatting, and navigation. Heavy transitive deps are mocked so the screen can render under
// @testing-library/react without the full app shell.

let mockIsLoggedIn = true;
const mockGetPendingChargebacks = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledLoadingSpinner: ({ size }: { size?: string }) => (
    <div data-testid="loading-spinner" data-size={size} />
  ),
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: () => undefined,
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getPendingChargebacks: mockGetPendingChargebacks }),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChargebackBlockReason, PendingChargebackEntry } from 'src/dto/chargeback.dto';
import ComplianceChargebackListScreen from 'src/screens/compliance-chargeback-list.screen';

type PendingChargebackPayload = Omit<PendingChargebackEntry, 'requestedDate' | 'date' | 'chargebackDate'> & {
  requestedDate: string;
  date: string;
  chargebackDate?: string;
};

const REQUESTED = '2026-01-15T10:00:00.000Z';
const DATE = '2026-01-15T12:00:00.000Z';

function baseEntry(overrides: Partial<PendingChargebackPayload> = {}): PendingChargebackEntry {
  return {
    txId: 9001,
    uid: 'T-9001',
    sourceType: 'BuyCrypto',
    entityId: 1001,
    userDataId: 2001,
    userName: 'Fixture User',
    inputAmount: 100,
    inputAsset: 'EUR',
    chargebackAmount: 100,
    chargebackAsset: 'EUR',
    blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
    requestedDate: REQUESTED,
    date: DATE,
    ...overrides,
  } as unknown as PendingChargebackEntry;
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

describe('ComplianceChargebackListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn = true;
    mockGetPendingChargebacks.mockResolvedValue([]);
  });

  it('does not fetch when not logged in', () => {
    mockIsLoggedIn = false;
    render(<ComplianceChargebackListScreen />);

    expect(mockGetPendingChargebacks).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows the loading spinner while the initial fetch is in flight', async () => {
    const deferred = createDeferred<PendingChargebackEntry[]>();
    mockGetPendingChargebacks.mockReturnValue(deferred.promise);

    render(<ComplianceChargebackListScreen />);

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();

    deferred.resolve([]);
    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
  });

  it('shows only ErrorHint on fetch failure (no table, no empty-state text)', async () => {
    mockGetPendingChargebacks.mockRejectedValue(new Error('Network down'));

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down');
    });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending chargebacks found')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows the empty-state row when the response is a successful empty list', async () => {
    mockGetPendingChargebacks.mockResolvedValue([]);

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('No pending chargebacks found')).toBeInTheDocument();
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('renders populated rows: plain missing amount, name mismatch, user-not-released, sentinel, multi-reason', async () => {
    const plainMissing = baseEntry({
      txId: 9001,
      uid: 'T-9001',
      entityId: 1001,
      blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
      userName: 'Plain User',
      inputAmount: 250,
      inputAsset: 'EUR',
      chargebackAmount: undefined,
      chargebackAsset: undefined,
    });

    const nameMismatch = baseEntry({
      txId: 9002,
      uid: 'T-9002',
      entityId: 1002,
      blockReasons: [ChargebackBlockReason.NAME_MISMATCH],
      userName: 'Mismatch User',
      verifiedName: 'Verified Name',
      completeName: 'Complete Name',
      creditorName: 'Creditor Name',
    });

    const nameMismatchMissingNames = baseEntry({
      txId: 9003,
      uid: 'T-9003',
      entityId: 1003,
      blockReasons: [ChargebackBlockReason.NAME_MISMATCH],
      userName: undefined,
      verifiedName: undefined,
      completeName: undefined,
      creditorName: undefined,
    });

    const userNotReleased = baseEntry({
      txId: 9004,
      uid: 'T-9004',
      entityId: 1004,
      blockReasons: [ChargebackBlockReason.USER_NOT_RELEASED],
      userName: 'Blocked User',
    });

    const sentinel = baseEntry({
      txId: 9005,
      uid: 'T-9005',
      entityId: 1005,
      blockReasons: [ChargebackBlockReason.MISSING_CREDITOR_DATA],
      userName: 'Sentinel User',
      chargebackDate: '2026-02-01T00:00:00.000Z',
    });

    const multiReason = baseEntry({
      txId: 9006,
      uid: 'T-9006',
      entityId: 1006,
      blockReasons: [
        ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT,
        ChargebackBlockReason.MISSING_CHARGEBACK_TARGET,
        ChargebackBlockReason.USER_NOT_RELEASED,
      ],
      userName: 'Multi User',
    });

    const noBlockReasons = baseEntry({
      txId: 9007,
      uid: 'T-9007',
      entityId: 1007,
      blockReasons: [],
      userName: 'No Reasons User',
    });

    mockGetPendingChargebacks.mockResolvedValue([
      plainMissing,
      nameMismatch,
      nameMismatchMissingNames,
      userNotReleased,
      sentinel,
      multiReason,
      noBlockReasons,
    ]);

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Plain User')).toBeInTheDocument();
    });

    // plain MISSING_CHARGEBACK_AMOUNT
    expect(screen.getByText('T-9001')).toBeInTheDocument();
    expect(screen.getAllByText(ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('250 EUR')).toBeInTheDocument();

    // NAME_MISMATCH with all three names side by side
    expect(screen.getByText('Verified Name')).toBeInTheDocument();
    expect(screen.getByText('Complete Name')).toBeInTheDocument();
    expect(screen.getByText('Creditor Name')).toBeInTheDocument();
    expect(screen.getAllByText(/verified:/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/complete:/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/creditor:/).length).toBeGreaterThanOrEqual(1);

    // NAME_MISMATCH with missing name values → '-' fallbacks (customer cell + three name cells)
    const dashCells = screen.getAllByText('-');
    expect(dashCells.length).toBeGreaterThanOrEqual(4);

    // USER_NOT_RELEASED row class
    const blockedRow = screen.getByText('Blocked User').closest('tr');
    expect(blockedRow).not.toBeNull();
    if (blockedRow) {
      expect(blockedRow.className).toContain('bg-dfxYellow-500/20');
    }
    expect(screen.getAllByText(ChargebackBlockReason.USER_NOT_RELEASED).length).toBeGreaterThanOrEqual(1);

    // sentinel row: error marker + row class
    expect(screen.getByText('ERROR: chargebackDate set')).toBeInTheDocument();
    const sentinelRow = screen.getByText('Sentinel User').closest('tr');
    expect(sentinelRow).not.toBeNull();
    if (sentinelRow) {
      expect(sentinelRow.className).toContain('bg-dfxRed-100/20');
    }

    // multi-reason badges
    expect(screen.getByText(ChargebackBlockReason.MISSING_CHARGEBACK_TARGET)).toBeInTheDocument();
    expect(screen.getByText('Multi User')).toBeInTheDocument();

    // empty blockReasons → '-'
    expect(screen.getByText('No Reasons User')).toBeInTheDocument();
  });

  it('covers formatAmount branches: with asset, without asset, null, and zero', async () => {
    const withAsset = baseEntry({
      txId: 9101,
      uid: 'T-9101',
      entityId: 1101,
      userName: 'With Asset',
      inputAmount: 50,
      inputAsset: 'CHF',
      chargebackAmount: 40,
      chargebackAsset: 'CHF',
      blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
    });

    const withoutAsset = baseEntry({
      txId: 9102,
      uid: 'T-9102',
      entityId: 1102,
      userName: 'Without Asset',
      inputAmount: 75,
      inputAsset: undefined,
      chargebackAmount: 60,
      chargebackAsset: undefined,
      blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
    });

    const nullAmounts = baseEntry({
      txId: 9103,
      uid: 'T-9103',
      entityId: 1103,
      userName: 'Null Amounts',
      inputAmount: undefined,
      inputAsset: undefined,
      chargebackAmount: undefined,
      chargebackAsset: undefined,
      blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
    });

    // 0 is not null under `== null`, so it renders as "0" (not a real money amount here)
    const zeroAmount = baseEntry({
      txId: 9104,
      uid: 'T-9104',
      entityId: 1104,
      userName: 'Zero Amount',
      inputAmount: 0,
      inputAsset: undefined,
      chargebackAmount: 0,
      chargebackAsset: 'EUR',
      blockReasons: [ChargebackBlockReason.MISSING_CHARGEBACK_AMOUNT],
    });

    mockGetPendingChargebacks.mockResolvedValue([withAsset, withoutAsset, nullAmounts, zeroAmount]);

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('With Asset')).toBeInTheDocument();
    });

    expect(screen.getByText('50 CHF')).toBeInTheDocument();
    expect(screen.getByText('40 CHF')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();

    const zeroRow = screen.getByText('Zero Amount').closest('tr');
    expect(zeroRow).not.toBeNull();
    if (zeroRow) {
      expect(zeroRow).toHaveTextContent('0');
      expect(zeroRow).toHaveTextContent('0 EUR');
    }

    const nullRow = screen.getByText('Null Amounts').closest('tr');
    expect(nullRow).not.toBeNull();
    if (nullRow) {
      const cells = nullRow.querySelectorAll('td');
      // input + chargeback cells both '-'
      expect(cells[3].textContent).toBe('-');
      expect(cells[4].textContent).toBe('-');
    }
  });

  it('uses uid when present and falls back to txId when uid is empty', async () => {
    const withUid = baseEntry({
      txId: 9201,
      uid: 'T-9201',
      entityId: 1201,
      userName: 'Has Uid',
    });
    const emptyUid = baseEntry({
      txId: 9202,
      uid: '',
      entityId: 1202,
      userName: 'Empty Uid',
    });

    mockGetPendingChargebacks.mockResolvedValue([withUid, emptyUid]);

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('T-9201')).toBeInTheDocument();
    });

    expect(screen.getByText('9202')).toBeInTheDocument();
  });

  it('navigates to the bank-tx return path on row click', async () => {
    const entry = baseEntry({
      txId: 9301,
      uid: 'T-9301',
      entityId: 1301,
      userName: 'Clickable User',
    });
    mockGetPendingChargebacks.mockResolvedValue([entry]);

    render(<ComplianceChargebackListScreen />);

    await waitFor(() => {
      expect(screen.getByText('Clickable User')).toBeInTheDocument();
    });

    const row = screen.getByText('Clickable User').closest('tr');
    expect(row).not.toBeNull();
    if (row) {
      fireEvent.click(row);
    }

    expect(mockNavigate).toHaveBeenCalledWith('compliance/bank-tx/9301/return');
  });
});
