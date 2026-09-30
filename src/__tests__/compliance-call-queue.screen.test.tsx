let mockIsLoggedIn = true;
let mockParams: { queue?: string } = { queue: 'ManualCheckPhone' };

const mockGetCallQueueItems = jest.fn();
const mockNavigate = jest.fn();
let capturedLayoutOptions: { title?: string; onBack?: () => void } | undefined;
const mockUseComplianceGuard = jest.fn();

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
  StyledLoadingSpinner: ({ size }: { size?: string }) => <div data-testid="loading-spinner" data-size={size} />,
  StyledVerticalStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import ComplianceCallQueueScreen from 'src/screens/compliance-call-queue.screen';

// Screen tests for the per-queue list: every queue lists transactions; the Callback queue adds the
// account status, the mark date and the deadline (red once past), the IP queues add the IP.

const DATE = '2026-07-31T08:30:00.000Z';
const PHONE_CALL_TIMES = 'H9To10;H10To11';
const CLEAR_PARAMS = { clearParams: ['status', 'search'] };

interface CallQueueItemFixture {
  userDataId?: number;
  userName?: string;
  phone?: string;
  language?: string;
  kycLevel?: number;
  txId?: number;
  sourceType?: string;
  amlCheck?: string;
  amlReason?: string;
  inputAmount?: number;
  inputAsset?: string;
  ip?: string;
  country?: string;
  ipCountry?: string;
  phoneCallStatus?: string;
  phoneCallStatusDate?: string;
  phoneCallTimes?: string;
  date?: string;
  queue?: string;
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

function item(overrides: Partial<CallQueueItemFixture> = {}): CallQueueItemFixture {
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
  return screen.getAllByRole('columnheader').map((header) => header.textContent ?? '');
}

function bodyRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

function cellTexts(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

async function renderLoaded(items: CallQueueItemFixture[], queue?: string): Promise<void> {
  if (queue != null) mockParams = { queue };
  mockGetCallQueueItems.mockResolvedValue(items);
  render(<ComplianceCallQueueScreen />);
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });
}

describe('ComplianceCallQueueScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLayoutOptions = undefined;
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone' };
    mockGetCallQueueItems.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => jest.useRealTimers());

  it('calls the compliance guard without arguments', () => {
    render(<ComplianceCallQueueScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
  });

  it.each([
    ['NotAQueue', { queue: 'NotAQueue' }, 'Unknown call queue: NotAQueue'],
    ['undefined', {}, 'Unknown call queue: undefined'],
  ] as const)('shows an unknown queue error for %s without fetching', (_label, params, message) => {
    mockParams = { ...params };

    render(<ComplianceCallQueueScreen />);

    expect(screen.getByTestId('error-hint')).toHaveTextContent(message);
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
    expect(capturedLayoutOptions?.title).toBe('Call Queue');
  });

  it('keeps the loading spinner and does not fetch while logged out', () => {
    mockIsLoggedIn = false;

    render(<ComplianceCallQueueScreen />);

    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
  });

  it('shows the spinner while loading and then renders the table', async () => {
    const deferred = createDeferred<CallQueueItemFixture[]>();
    mockGetCallQueueItems.mockReturnValue(deferred.promise);

    render(<ComplianceCallQueueScreen />);

    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(capturedLayoutOptions?.title).toBe('ManualCheckPhone');
    expect(mockGetCallQueueItems).toHaveBeenCalledWith('ManualCheckPhone');

    deferred.resolve([{ userDataId: 2001, date: DATE }]);
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows the fetch error after loading finishes', async () => {
    mockGetCallQueueItems.mockRejectedValue(new Error('Queue unavailable'));

    render(<ComplianceCallQueueScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Queue unavailable');
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an empty table when the rejection is not an Error', async () => {
    mockGetCallQueueItems.mockRejectedValue('unavailable');

    render(<ComplianceCallQueueScreen />);

    await waitFor(() => {
      expect(screen.getByText('No entries found')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('navigates back through the layout onBack callback', () => {
    render(<ComplianceCallQueueScreen />);

    expect(capturedLayoutOptions?.onBack).toBeDefined();
    capturedLayoutOptions?.onBack?.();

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it.each(['ManualCheckPhone', 'ManualCheckIpCountryPhone'])(
    'shows Phone Call Times immediately before Date for %s',
    async (queue) => {
      await renderLoaded([{ userDataId: 2001, date: DATE, phoneCallTimes: PHONE_CALL_TIMES }], queue);

      const cols = headers();
      expect(cols[cols.length - 2]).toBe('Phone Call Times');
      expect(cols[cols.length - 1]).toBe('Date');
      expect(cellTexts(bodyRows()[0])[cols.indexOf('Phone Call Times')]).toBe(PHONE_CALL_TIMES);
    },
  );

  it.each(['ManualCheckIpPhone', 'ManualCheckExternalAccountPhone', 'UnavailableSuspicious'])(
    'hides Phone Call Times for %s even when the item has a value',
    async (queue) => {
      await renderLoaded([{ userDataId: 2001, date: DATE, phoneCallTimes: PHONE_CALL_TIMES }], queue);

      expect(screen.queryByRole('columnheader', { name: 'Phone Call Times' })).not.toBeInTheDocument();
      expect(screen.queryByText(PHONE_CALL_TIMES)).not.toBeInTheDocument();
    },
  );

  it('renders a dash for empty and missing phoneCallTimes', async () => {
    await renderLoaded([
      { userDataId: 2001, date: DATE, phoneCallTimes: '' },
      { userDataId: 2002, date: DATE },
    ]);

    const phoneTimesIndex = headers().indexOf('Phone Call Times');
    expect(cellTexts(bodyRows()[0])[phoneTimesIndex]).toBe('-');
    expect(cellTexts(bodyRows()[1])[phoneTimesIndex]).toBe('-');
  });

  it.each([
    ['ManualCheckPhone', ['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'Phone Call Times', 'Date']],
    ['ManualCheckIpPhone', ['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Date']],
    [
      'ManualCheckIpCountryPhone',
      ['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Country', 'Phone Call Times', 'Date'],
    ],
    [
      'UnavailableSuspicious',
      ['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'Country', 'Status', 'Marked', 'Deadline', 'Date'],
    ],
  ])('renders the %s headers in order', async (queue, expected) => {
    await renderLoaded([{ userDataId: 2001, date: DATE }], queue);

    expect(headers()).toEqual(expected);
  });

  it('renders a filled ManualCheckIpCountryPhone row', async () => {
    await renderLoaded(
      [
        {
          userDataId: 2001,
          userName: 'Test Customer',
          phone: '+41791234567',
          language: 'DE',
          kycLevel: 30,
          sourceType: 'BuyCrypto',
          txId: 101,
          inputAmount: 500,
          inputAsset: 'EUR',
          ip: '10.0.0.1',
          country: 'Switzerland',
          ipCountry: 'Germany',
          phoneCallTimes: PHONE_CALL_TIMES,
          date: DATE,
        },
      ],
      'ManualCheckIpCountryPhone',
    );

    expect(cellTexts(bodyRows()[0])).toEqual([
      '2001 Test Customer',
      '+41791234567',
      'DE',
      '30',
      'BuyCrypto #101 (500 EUR)',
      '10.0.0.1',
      'Switzerland / IP: Germany',
      PHONE_CALL_TIMES,
      '31.07.2026',
    ]);
  });

  it('renders a thin ManualCheckIpCountryPhone row with dashes', async () => {
    await renderLoaded([{ userDataId: 2002, queue: 'ignored', date: DATE }], 'ManualCheckIpCountryPhone');

    expect(cellTexts(bodyRows()[0])).toEqual(['2002 ', '-', '-', '-', '-', '-', '-', '-', '31.07.2026']);
  });

  it('keeps a trailing space when inputAsset is missing', async () => {
    await renderLoaded([{ userDataId: 2001, date: DATE, sourceType: 'BuyCrypto', txId: 101, inputAmount: 500 }]);

    expect(cellTexts(bodyRows()[0])[headers().indexOf('Transaction')]).toBe('BuyCrypto #101 (500 )');
  });

  it('omits the IP country suffix when it matches country', async () => {
    await renderLoaded(
      [{ userDataId: 2001, date: DATE, country: 'Switzerland', ipCountry: 'Switzerland' }],
      'ManualCheckIpCountryPhone',
    );

    expect(cellTexts(bodyRows()[0])[headers().indexOf('Country')]).toBe('Switzerland');
    expect(screen.queryByText(/IP:/)).not.toBeInTheDocument();
  });

  it('shows the phone call status on UnavailableSuspicious', async () => {
    await renderLoaded([{ userDataId: 2001, date: DATE, phoneCallStatus: 'Suspicious' }], 'UnavailableSuspicious');

    expect(cellTexts(bodyRows()[0])[headers().indexOf('Status')]).toBe('Suspicious');
  });

  it.each([
    ['7', 'ManualCheckPhone'],
    ['7', 'ManualCheckIpPhone'],
    ['9', 'ManualCheckIpCountryPhone'],
    ['10', 'UnavailableSuspicious'],
    ['6', 'ManualCheckExternalAccountPhone'],
  ])('sets the empty-state colspan to %s on %s', async (colspan, queue) => {
    await renderLoaded([], queue);

    expect(screen.getByText('No entries found')).toHaveAttribute('colspan', colspan);
  });

  it('shows the empty state spanning every column', async () => {
    mockParams = { queue: 'UnavailableSuspicious' };

    await renderLoaded([]);

    expect(screen.getByText('No entries found')).toHaveAttribute('colspan', '10');
  });

  it('navigates to the detail view with a txId search', async () => {
    await renderLoaded([{ userDataId: 2001, date: DATE, txId: 101 }]);

    fireEvent.click(within(bodyRows()[0]).getAllByRole('cell')[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/call-queues/ManualCheckPhone/2001', search: '?txId=101' },
      CLEAR_PARAMS,
    );
  });

  it('navigates to the detail view without a txId search', async () => {
    await renderLoaded([{ userDataId: 2002, date: DATE }], 'UnavailableSuspicious');

    fireEvent.click(within(bodyRows()[0]).getAllByRole('cell')[0]);

    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/call-queues/UnavailableSuspicious/2002', search: '' },
      CLEAR_PARAMS,
    );
  });

  it('renders four rows without a console.error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await renderLoaded([
      { txId: 101, sourceType: 'BuyCrypto', userDataId: 2001, date: DATE },
      { txId: 102, sourceType: 'SellCrypto', userDataId: 2001, date: DATE },
      { userDataId: 2002, date: DATE },
      { userDataId: 2003, date: DATE },
    ]);

    expect(screen.getAllByRole('row')).toHaveLength(5);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('lists a reason queue with the transaction column and opens the detail with the transaction', async () => {
    await renderLoaded([
      item(),
      item({ userDataId: 2002, userName: undefined, txId: undefined, inputAmount: undefined }),
    ]);

    expect(capturedLayoutOptions?.title).toBe('ManualCheckPhone');
    expect(headers()).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'Phone Call Times', 'Date']);
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

    expect(headers()).toEqual([
      'User',
      'Phone',
      'Lang',
      'KYC',
      'Transaction',
      'IP',
      'Country',
      'Phone Call Times',
      'Date',
    ]);
    expect(screen.getByText('1.1.1.1')).toBeInTheDocument();
    expect(screen.getByText('Switzerland / IP: Germany')).toBeInTheDocument();
  });

  it('shows dashes for missing optional values', async () => {
    mockParams = { queue: 'ManualCheckIpPhone' };

    await renderLoaded([item({ phone: undefined, language: undefined, kycLevel: undefined, ip: undefined })]);

    expect(headers()).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Date']);
    expect(screen.getAllByText('-')).toHaveLength(4);
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
      expect(screen.getByText('Switzerland')).toBeInTheDocument();
    });

    it('marks a passed deadline red', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-20T12:00:00.000Z'));

      await renderLoaded([item({ phoneCallStatus: 'Unavailable', phoneCallStatusDate: '2026-09-03T08:00:00.000Z' })]);

      expect(screen.getByText('15.09.2026')).toHaveClass('text-dfxRed-100');
    });

    it('shows no deadline and no mark date for a failed transaction whose customer allowed calls', async () => {
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

// The same screen instance serves one queue after another, so the route can move to another queue
// while a load is still in flight.
describe('ComplianceCallQueueScreen route changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone' };
  });

  it('ignores a load that finishes for the queue shown before and shows the current one', async () => {
    const first = createDeferred<CallQueueItemFixture[]>();
    const second = createDeferred<CallQueueItemFixture[]>();
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
    const first = createDeferred<CallQueueItemFixture[]>();
    const second = createDeferred<CallQueueItemFixture[]>();
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
