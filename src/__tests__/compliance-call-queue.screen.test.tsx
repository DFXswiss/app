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

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ComplianceCallQueueScreen from 'src/screens/compliance-call-queue.screen';

const DATE = '2026-07-31T08:30:00.000Z';
const PHONE_CALL_TIMES = 'H9To10;H10To11';
const CLEAR_PARAMS = { clearParams: ['status', 'search'] };

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

function headerTexts(): string[] {
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

async function renderLoaded(items: unknown[], queue = 'ManualCheckPhone'): Promise<void> {
  mockParams = { queue };
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

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
  });

  it('shows the spinner while loading and then renders the table', async () => {
    const deferred = createDeferred<any[]>();
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

      const headers = headerTexts();
      expect(headers[headers.length - 2]).toBe('Phone Call Times');
      expect(headers[headers.length - 1]).toBe('Date');
      expect(cellTexts(bodyRows()[0])[headers.indexOf('Phone Call Times')]).toBe(PHONE_CALL_TIMES);
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

    const phoneTimesIndex = headerTexts().indexOf('Phone Call Times');
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
    ['UnavailableSuspicious', ['User', 'Phone', 'Lang', 'KYC', 'Country', 'Status', 'Date']],
  ])('renders the %s headers in order', async (queue, expected) => {
    await renderLoaded([{ userDataId: 2001, date: DATE }], queue);

    expect(headerTexts()).toEqual(expected);
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

    expect(cellTexts(bodyRows()[0])[headerTexts().indexOf('Transaction')]).toBe('BuyCrypto #101 (500 )');
  });

  it('omits the IP country suffix when it matches country', async () => {
    await renderLoaded(
      [{ userDataId: 2001, date: DATE, country: 'Switzerland', ipCountry: 'Switzerland' }],
      'ManualCheckIpCountryPhone',
    );

    expect(cellTexts(bodyRows()[0])[headerTexts().indexOf('Country')]).toBe('Switzerland');
    expect(screen.queryByText(/IP:/)).not.toBeInTheDocument();
  });

  it('shows the phone call status on UnavailableSuspicious', async () => {
    await renderLoaded([{ userDataId: 2001, date: DATE, phoneCallStatus: 'Suspicious' }], 'UnavailableSuspicious');

    expect(cellTexts(bodyRows()[0])[headerTexts().indexOf('Status')]).toBe('Suspicious');
  });

  it.each([
    ['9', 'ManualCheckIpCountryPhone'],
    ['7', 'UnavailableSuspicious'],
  ])('sets the empty-state colspan to %s on %s', async (colspan, queue) => {
    await renderLoaded([], queue);

    expect(screen.getByText('No entries found').getAttribute('colspan')).toBe(colspan);
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
});
