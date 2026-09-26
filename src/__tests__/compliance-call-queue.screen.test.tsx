// Screen tests for the per-queue list: every queue lists transactions; the Callback queue adds the
// account status, the mark date and the deadline (red once past), the IP queues add the IP.

let mockIsLoggedIn = true;
let mockParams: { queue?: string } = { queue: 'ManualCheckPhone' };
const mockGetCallQueueItems = jest.fn();
const mockNavigate = jest.fn();
const mockUseComplianceGuard = jest.fn();
let capturedLayoutOptions: { title?: string; onBack?: () => void } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  useSessionContext: () => ({ isLoggedIn: mockIsLoggedIn }),
  CallQueue: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
    UNAVAILABLE_SUSPICIOUS: 'UnavailableSuspicious',
  },
  AmlReason: {
    MANUAL_CHECK_PHONE: 'ManualCheckPhone',
    MANUAL_CHECK_PHONE_FAILED: 'ManualCheckPhoneFailed',
    MANUAL_CHECK_IP_PHONE: 'ManualCheckIpPhone',
    MANUAL_CHECK_IP_COUNTRY_PHONE: 'ManualCheckIpCountryPhone',
    MANUAL_CHECK_EXTERNAL_ACCOUNT_PHONE: 'ManualCheckExternalAccountPhone',
  },
  CheckStatus: { PENDING: 'Pending', FAIL: 'Fail', PASS: 'Pass' },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledLoadingSpinner: ({ size }: any) => <div data-testid="loading-spinner" data-size={size} />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getCallQueueItems: mockGetCallQueueItems }),
}));

jest.mock('src/hooks/guard.hook', () => ({
  useComplianceGuard: (...args: unknown[]) => mockUseComplianceGuard(...args),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (options: { title?: string; onBack?: () => void }) => {
    capturedLayoutOptions = options;
  },
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceCallQueueScreen from 'src/screens/compliance-call-queue.screen';

function item(overrides: Record<string, unknown> = {}): any {
  return {
    queue: 'ManualCheckPhone',
    userDataId: 2001,
    userName: 'Fixture User',
    phone: '+41790000000',
    language: 'DE',
    kycLevel: 50,
    txId: 101,
    sourceType: 'BuyCrypto',
    amlCheck: 'Pending',
    amlReason: 'ManualCheckPhone',
    inputAmount: 100,
    inputAsset: 'CHF',
    date: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function headers(): string[] {
  return screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
}

async function renderLoaded(items: any[]): Promise<void> {
  mockGetCallQueueItems.mockResolvedValue(items);
  render(<ComplianceCallQueueScreen />);
  await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument());
}

describe('ComplianceCallQueueScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLayoutOptions = undefined;
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone' };
  });

  afterEach(() => jest.useRealTimers());

  it('calls the compliance guard and shows an error for an unknown queue without fetching', () => {
    mockParams = { queue: 'NotAQueue' };

    render(<ComplianceCallQueueScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown call queue: NotAQueue');
    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
    expect(capturedLayoutOptions?.title).toBe('Call Queue');
  });

  it('does not fetch while logged out', () => {
    mockIsLoggedIn = false;

    render(<ComplianceCallQueueScreen />);

    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
  });

  it('shows the fetch error', async () => {
    mockGetCallQueueItems.mockRejectedValue(new Error('Network down'));

    render(<ComplianceCallQueueScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down'));
  });

  it('lists a reason queue with the transaction column and opens the detail with the transaction', async () => {
    await renderLoaded([
      item(),
      item({ userDataId: 2002, userName: undefined, txId: undefined, inputAmount: undefined }),
    ]);

    expect(capturedLayoutOptions?.title).toBe('ManualCheckPhone');
    expect(headers()).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'Date']);
    expect(screen.getByText('BuyCrypto #101 (100 CHF)')).toBeInTheDocument();
    expect(screen.getByText('2002')).toBeInTheDocument();

    fireEvent.click(screen.getByText('BuyCrypto #101 (100 CHF)'));
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/call-queues/ManualCheckPhone/2001', search: '?txId=101' },
      { clearParams: ['status', 'search'] },
    );

    fireEvent.click(screen.getByText('2002'));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      { pathname: '/compliance/call-queues/ManualCheckPhone/2002', search: '' },
      { clearParams: ['status', 'search'] },
    );

    capturedLayoutOptions?.onBack?.();
    expect(mockNavigate).toHaveBeenLastCalledWith(-1);
  });

  it('adds IP and country columns for the IP-country queue', async () => {
    mockParams = { queue: 'ManualCheckIpCountryPhone' };

    await renderLoaded([item({ ip: '1.1.1.1', country: 'Switzerland', ipCountry: 'Germany' })]);

    expect(headers()).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Country', 'Date']);
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('Switzerland / IP: Germany')).toBeInTheDocument();
  });

  it('shows dashes for missing optional values', async () => {
    mockParams = { queue: 'ManualCheckIpPhone' };

    await renderLoaded([item({ phone: undefined, language: undefined, kycLevel: undefined, ip: undefined })]);

    expect(headers()).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Date']);
    expect(screen.getAllByText('-')).toHaveLength(4);
  });

  it('prints the amount without an asset and hides an IP country that equals the country', async () => {
    mockParams = { queue: 'ManualCheckIpCountryPhone' };

    await renderLoaded([
      item({ inputAsset: undefined, ip: '1.1.1.1', country: 'Switzerland', ipCountry: 'Switzerland' }),
    ]);

    expect(screen.getByText('BuyCrypto #101 (100 )')).toBeInTheDocument();
    expect(screen.getByText('Switzerland')).toBeInTheDocument();
  });

  it('shows the empty state spanning every column', async () => {
    mockParams = { queue: 'UnavailableSuspicious' };

    await renderLoaded([]);

    expect(screen.getByText('No entries found')).toHaveAttribute('colspan', '10');
  });

  describe('Callback queue', () => {
    beforeEach(() => {
      mockParams = { queue: 'UnavailableSuspicious' };
    });

    it('is titled Callback and shows status, mark date and deadline of a pending transaction', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T12:00:00.000Z'));

      await renderLoaded([
        item({
          queue: 'UnavailableSuspicious',
          country: 'Switzerland',
          phoneCallStatus: 'Unavailable',
          phoneCallStatusDate: '2026-09-03T08:00:00.000Z',
        }),
      ]);

      expect(capturedLayoutOptions?.title).toBe('Callback');
      expect(headers()).toEqual([
        'User',
        'Phone',
        'Lang',
        'KYC',
        'Transaction',
        'Country',
        'Status',
        'Marked',
        'Deadline',
        'Date',
      ]);
      expect(screen.getByText('BuyCrypto #101 (100 CHF) · Pending')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      expect(screen.getByText('03.09.2026')).toBeInTheDocument();
      const deadline = screen.getByText('15.09.2026');
      expect(deadline).not.toHaveClass('text-dfxRed-100');
    });

    it('marks a passed deadline red', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-20T12:00:00.000Z'));

      await renderLoaded([item({ phoneCallStatus: 'Unavailable', phoneCallStatusDate: '2026-09-03T08:00:00.000Z' })]);

      expect(screen.getByText('15.09.2026')).toHaveClass('text-dfxRed-100');
    });

    it('shows no deadline and no mark date for a failed transaction of a customer who allowed calls again', async () => {
      await renderLoaded([
        item({
          amlCheck: 'Fail',
          amlReason: 'ManualCheckPhoneFailed',
          phoneCallStatus: 'UserRevokeDecision',
          phoneCallStatusDate: undefined,
          country: undefined,
        }),
      ]);

      expect(screen.getByText('BuyCrypto #101 (100 CHF) · Fail')).toBeInTheDocument();
      expect(screen.getByText('UserRevokeDecision')).toBeInTheDocument();
      // country, mark date and deadline
      expect(screen.getAllByText('-')).toHaveLength(3);
    });

    it('shows a dash for a missing status', async () => {
      await renderLoaded([item({ amlCheck: undefined, phoneCallStatus: undefined, country: 'CH' })]);

      expect(screen.getByText('BuyCrypto #101 (100 CHF)')).toBeInTheDocument();
      // status, mark date and deadline
      expect(screen.getAllByText('-')).toHaveLength(3);
    });

    // The API before DFXswiss/backend#5614 lists accounts here, without transaction, mark date or status
    // date; the row still renders and opens the detail on the account.
    it('renders an account row of the current API with dashes for transaction, mark date and deadline', async () => {
      await renderLoaded([
        item({
          txId: undefined,
          sourceType: undefined,
          amlCheck: undefined,
          amlReason: undefined,
          inputAmount: undefined,
          inputAsset: undefined,
          country: 'Switzerland',
          phoneCallStatus: 'Unavailable',
          phoneCallStatusDate: undefined,
        }),
      ]);

      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      // transaction, mark date and deadline
      expect(screen.getAllByText('-')).toHaveLength(3);

      fireEvent.click(screen.getByText('Unavailable'));
      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/compliance/call-queues/UnavailableSuspicious/2001', search: '' },
        { clearParams: ['status', 'search'] },
      );
    });
  });
});

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

// The same screen instance serves one queue after another, so the route can move to another queue
// while a load is still in flight.
describe('ComplianceCallQueueScreen route changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone' };
  });

  it('ignores a load that finishes for the queue shown before and shows the current one', async () => {
    const first = createDeferred<any[]>();
    const second = createDeferred<any[]>();
    mockGetCallQueueItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<ComplianceCallQueueScreen />);

    mockParams = { queue: 'ManualCheckIpPhone' };
    rerender(<ComplianceCallQueueScreen />);
    await act(async () => first.resolve([item({ phone: '+41790000001' })]));

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByText('+41790000001')).not.toBeInTheDocument();

    await act(async () => second.resolve([item({ queue: 'ManualCheckIpPhone', phone: '+41790000002' })]));

    expect(await screen.findByText('+41790000002')).toBeInTheDocument();
    expect(mockGetCallQueueItems).toHaveBeenNthCalledWith(2, 'ManualCheckIpPhone');
  });

  it('ignores a load that fails for the queue shown before', async () => {
    const first = createDeferred<any[]>();
    const second = createDeferred<any[]>();
    mockGetCallQueueItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<ComplianceCallQueueScreen />);

    mockParams = { queue: 'ManualCheckIpPhone' };
    rerender(<ComplianceCallQueueScreen />);
    await act(async () => first.reject(new Error('gone')));

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => second.resolve([item({ queue: 'ManualCheckIpPhone', phone: '+41790000002' })]));

    expect(await screen.findByText('+41790000002')).toBeInTheDocument();
  });

  it('clears the previous error and rows when the route moves to another queue', async () => {
    mockGetCallQueueItems
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce([item({ queue: 'ManualCheckIpPhone' })]);
    const { rerender } = render(<ComplianceCallQueueScreen />);
    await screen.findByTestId('error-hint');

    mockParams = { queue: 'ManualCheckIpPhone' };
    rerender(<ComplianceCallQueueScreen />);

    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(await screen.findByText('+41790000000')).toBeInTheDocument();
  });
});
