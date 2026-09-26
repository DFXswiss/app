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

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  const controls: { resolve: (value: T) => void; reject: (reason: unknown) => void } = {
    resolve: () => {
      throw new Error('deferred not initialized');
    },
    reject: () => {
      throw new Error('deferred not initialized');
    },
  };
  const promise = new Promise<T>((resolve, reject) => {
    controls.resolve = resolve;
    controls.reject = reject;
  });
  return { promise, ...controls };
}

const PHONE_CALL_TIMES = 'H9To10;H10To11';

function txItem(overrides: Record<string, unknown> = {}) {
  return {
    queue: 'ManualCheckPhone',
    userDataId: 2001,
    userName: 'Test Customer',
    phone: '+41791234567',
    language: 'DE',
    country: 'Switzerland',
    kycLevel: 30,
    txId: 101,
    sourceType: 'BuyCrypto',
    inputAmount: 500,
    inputAsset: 'EUR',
    ip: '10.0.0.1',
    ipCountry: 'Germany',
    phoneCallStatus: 'Unavailable',
    phoneCallTimes: PHONE_CALL_TIMES,
    date: '2026-07-31T08:30:00.000Z',
    ...overrides,
  };
}

function sparseItem(overrides: Record<string, unknown> = {}) {
  return { queue: 'ManualCheckPhone', userDataId: 2002, date: '2026-07-31T08:30:00.000Z', ...overrides };
}

async function renderLoaded(items: unknown[]): Promise<HTMLTableElement> {
  mockGetCallQueueItems.mockResolvedValue(items);
  render(<ComplianceCallQueueScreen />);
  await waitFor(() => {
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });
  return screen.getByRole('table') as HTMLTableElement;
}

function headerTexts(table: HTMLElement): string[] {
  return within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent ?? '');
}

const ALL_QUEUES = [
  'ManualCheckPhone',
  'ManualCheckIpPhone',
  'ManualCheckIpCountryPhone',
  'ManualCheckExternalAccountPhone',
  'UnavailableSuspicious',
] as const;

const PHONE_CALL_TIMES_QUEUES = ['ManualCheckPhone', 'ManualCheckIpCountryPhone'] as const;
const NO_PHONE_CALL_TIMES_QUEUES = ALL_QUEUES.filter(
  (queue) => !(PHONE_CALL_TIMES_QUEUES as readonly string[]).includes(queue),
);

describe('ComplianceCallQueueScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLayoutOptions = undefined;
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone' };
    mockGetCallQueueItems.mockResolvedValue([]);
  });

  it('calls the compliance guard without arguments', async () => {
    await renderLoaded([]);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
  });

  it.each([
    ['NotAQueue', 'Unknown call queue: NotAQueue'],
    [undefined, 'Unknown call queue: undefined'],
  ])('shows an error and does not fetch for queue %s', (queue, message) => {
    mockParams = { queue };

    render(<ComplianceCallQueueScreen />);

    expect(screen.getByTestId('error-hint')).toHaveTextContent(message);
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
    expect(capturedLayoutOptions?.title).toBe('Call Queue');
  });

  it('keeps the loading state and does not fetch while logged out', () => {
    mockIsLoggedIn = false;

    render(<ComplianceCallQueueScreen />);

    expect(mockGetCallQueueItems).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows the spinner while loading and then renders the table', async () => {
    const deferred = createDeferred<unknown[]>();
    mockGetCallQueueItems.mockReturnValue(deferred.promise);

    render(<ComplianceCallQueueScreen />);

    expect(mockGetCallQueueItems).toHaveBeenCalledWith('ManualCheckPhone');
    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    deferred.resolve([txItem()]);
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(capturedLayoutOptions?.title).toBe('ManualCheckPhone');
  });

  it('shows the error message when loading rejects with an Error', async () => {
    mockGetCallQueueItems.mockRejectedValue(new Error('Queue unavailable'));

    render(<ComplianceCallQueueScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Queue unavailable');
    });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to the empty table when loading rejects without an Error message', async () => {
    mockGetCallQueueItems.mockRejectedValue({});

    render(<ComplianceCallQueueScreen />);

    await waitFor(() => {
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('navigates back through the layout back button', async () => {
    await renderLoaded([]);

    capturedLayoutOptions?.onBack?.();

    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  describe('Phone Call Times column', () => {
    it.each(PHONE_CALL_TIMES_QUEUES)('is shown as the last column before Date in %s', async (queue) => {
      mockParams = { queue };

      const table = await renderLoaded([txItem({ queue })]);

      const headers = headerTexts(table);
      expect(headers.indexOf('Phone Call Times')).toBe(headers.length - 2);
      expect(headers[headers.length - 1]).toBe('Date');
      const cells = within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(cells[cells.length - 2]).toBe(PHONE_CALL_TIMES);
    });

    it.each(NO_PHONE_CALL_TIMES_QUEUES)('is hidden in %s', async (queue) => {
      mockParams = { queue };

      const table = await renderLoaded([txItem({ queue })]);

      expect(headerTexts(table)).not.toContain('Phone Call Times');
      expect(within(table).queryByText(PHONE_CALL_TIMES)).not.toBeInTheDocument();
    });

    it.each([
      ['an empty string', ''],
      ['undefined', undefined],
    ])('renders a dash for %s', async (_label, phoneCallTimes) => {
      const table = await renderLoaded([txItem({ phoneCallTimes })]);

      const cells = within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(cells[cells.length - 2]).toBe('-');
    });
  });

  describe('column sets per queue', () => {
    it('ManualCheckPhone shows the transaction column only', async () => {
      const table = await renderLoaded([txItem()]);

      expect(headerTexts(table)).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'Phone Call Times', 'Date']);
    });

    it('ManualCheckIpPhone adds the IP column', async () => {
      mockParams = { queue: 'ManualCheckIpPhone' };

      const table = await renderLoaded([txItem()]);

      expect(headerTexts(table)).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Transaction', 'IP', 'Date']);
    });

    it('ManualCheckIpCountryPhone adds IP, country and phone call times', async () => {
      mockParams = { queue: 'ManualCheckIpCountryPhone' };

      const table = await renderLoaded([txItem()]);

      expect(headerTexts(table)).toEqual([
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
    });

    it('UnavailableSuspicious shows country and status without a transaction column', async () => {
      mockParams = { queue: 'UnavailableSuspicious' };

      const table = await renderLoaded([txItem({ queue: 'UnavailableSuspicious', txId: undefined })]);

      expect(headerTexts(table)).toEqual(['User', 'Phone', 'Lang', 'KYC', 'Country', 'Status', 'Date']);
    });
  });

  describe('cell rendering', () => {
    it('renders every populated field', async () => {
      mockParams = { queue: 'ManualCheckIpCountryPhone' };

      const table = await renderLoaded([txItem()]);

      const cells = within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(cells).toEqual([
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

    it('renders dashes and blanks for missing optional fields', async () => {
      mockParams = { queue: 'ManualCheckIpCountryPhone' };

      const table = await renderLoaded([sparseItem()]);

      const cells = within(table)
        .getAllByRole('cell')
        .map((td) => td.textContent);
      expect(cells).toEqual(['2002 ', '-', '-', '-', '-', '-', '-', '-', '31.07.2026']);
    });

    it('omits the asset when a transaction amount has no asset', async () => {
      const table = await renderLoaded([txItem({ inputAsset: undefined })]);

      expect(within(table).getByText('BuyCrypto #101 (500 )')).toBeInTheDocument();
    });

    it('does not repeat the IP country when it equals the country', async () => {
      mockParams = { queue: 'ManualCheckIpCountryPhone' };

      const table = await renderLoaded([txItem({ ipCountry: 'Switzerland' })]);

      expect(within(table).getByText('Switzerland')).toBeInTheDocument();
      expect(within(table).queryByText(/IP:/)).not.toBeInTheDocument();
    });

    it('shows the phone call status in the UnavailableSuspicious queue', async () => {
      mockParams = { queue: 'UnavailableSuspicious' };

      const table = await renderLoaded([sparseItem({ phoneCallStatus: 'Suspicious' })]);

      expect(within(table).getByText('Suspicious')).toBeInTheDocument();
    });

    it('spans the empty-state row across every visible column', async () => {
      mockParams = { queue: 'ManualCheckIpCountryPhone' };

      const table = await renderLoaded([]);

      const emptyCell = within(table).getByText('No entries found');
      expect(emptyCell).toHaveAttribute('colspan', '9');
    });

    it('spans the empty-state row across the UnavailableSuspicious columns', async () => {
      mockParams = { queue: 'UnavailableSuspicious' };

      const table = await renderLoaded([]);

      expect(within(table).getByText('No entries found')).toHaveAttribute('colspan', '7');
    });
  });

  describe('row click', () => {
    it('opens the detail with the transaction id', async () => {
      const table = await renderLoaded([txItem()]);

      fireEvent.click(within(table).getByText('2001 Test Customer'));

      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/compliance/call-queues/ManualCheckPhone/2001', search: '?txId=101' },
        { clearParams: ['status', 'search'] },
      );
    });

    it('opens the detail without a transaction id', async () => {
      mockParams = { queue: 'UnavailableSuspicious' };

      const table = await renderLoaded([sparseItem()]);

      fireEvent.click(within(table).getByText('2002', { exact: false }));

      expect(mockNavigate).toHaveBeenCalledWith(
        { pathname: '/compliance/call-queues/UnavailableSuspicious/2002', search: '' },
        { clearParams: ['status', 'search'] },
      );
    });

    it('keys rows by transaction and by user without duplicate-key warnings', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const table = await renderLoaded([
        txItem(),
        txItem({ txId: 102, sourceType: 'BuyFiat' }),
        sparseItem(),
        sparseItem({ userDataId: 2003 }),
      ]);

      expect(within(table).getAllByRole('row')).toHaveLength(5);
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
