let mockIsLoggedIn = true;
let mockParams: { queue?: string; userDataId?: string } = {
  queue: 'ManualCheckPhone',
  userDataId: '2001',
};
let mockSearch = '';
let mockClerksResult: { clerks: string[]; isLoading: boolean; error?: string } = {
  clerks: ['JR'],
  isLoading: false,
  error: undefined,
};

const mockGetUserData = jest.fn();
const mockNavigate = jest.fn();
const mockUseComplianceGuard = jest.fn();
const mockCanReset = jest.fn((..._args: unknown[]) => true);

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
  useLocation: () => ({ search: mockSearch }),
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/hooks/call-queue-clerks.hook', () => ({
  useCallQueueClerks: () => mockClerksResult,
}));

jest.mock('src/hooks/compliance.hook', () => ({
  useCompliance: () => ({ getUserData: mockGetUserData }),
  CallOutcome: {
    COMPLETED: 'Completed',
    UNAVAILABLE: 'Unavailable',
    SUSPICIOUS: 'Suspicious',
    FAILED: 'Failed',
    REPEAT: 'Repeat',
  },
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

jest.mock('src/util/buy-crypto-reset.util', () => ({
  canResetBuyCryptoAmlForReview: (...args: unknown[]) => mockCanReset(...args),
}));

jest.mock('src/components/compliance/call-queue/call-queue-user-info', () => ({
  CallQueueUserInfo: () => <div data-testid="user-info" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-tx-info', () => ({
  CallQueueTxInfo: () => <div data-testid="tx-info" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-address-info', () => ({
  CallQueueAddressInfo: () => <div data-testid="address-info" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-transactions-list', () => ({
  CallQueueTransactionsList: () => <div data-testid="transactions-list" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-bank-tx-info', () => ({
  CallQueueBankTxInfo: () => <div data-testid="bank-tx-info" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-ip-countries', () => ({
  CallQueueIpCountries: () => <div data-testid="ip-countries" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-kyc-comments', () => ({
  CallQueueKycComments: () => <div data-testid="kyc-comments" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-questions', () => ({
  CallQueueQuestions: () => <div data-testid="questions" />,
}));

jest.mock('src/components/compliance/call-queue/call-queue-outcome-form', () => ({
  CallQueueOutcomeForm: (props: any) => (
    <div
      data-testid="outcome-form"
      data-context={JSON.stringify(props.context)}
      data-outcomes={JSON.stringify(props.availableOutcomes)}
      data-clerks={JSON.stringify(props.clerks)}
      data-clerks-error={props.clerksError ?? ''}
      data-clerks-loading={String(!!props.clerksLoading)}
    >
      <button onClick={props.onSaved}>save</button>
    </div>
  ),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ComplianceCallQueueDetailScreen from 'src/screens/compliance-call-queue-detail.screen';

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

function baseData(overrides: Partial<any> = {}): any {
  return {
    userData: { id: 2001 },
    kycSteps: [],
    transactions: [],
    bankTxs: [],
    cryptoInputs: [],
    users: [],
    bankDatas: [],
    buyRoutes: [],
    sellRoutes: [],
    swapRoutes: [],
    virtualIbans: [],
    refRewards: [],
    notifications: [],
    notes: [],
    permissions: {},
    ...overrides,
  };
}

function transaction(overrides: Partial<any> = {}): any {
  return {
    id: 101,
    uid: 'tx-101',
    sourceType: 'BuyCrypto',
    ...overrides,
  };
}

function bankData(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    iban: 'CH9300762011623852957',
    name: 'Fixture User',
    approved: false,
    active: false,
    created: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

async function renderLoaded(data: any = baseData()): Promise<HTMLElement> {
  mockGetUserData.mockResolvedValue(data);
  render(<ComplianceCallQueueDetailScreen />);
  return screen.findByTestId('outcome-form');
}

function outcomeContext(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('outcome-form').getAttribute('data-context') ?? '{}');
}

const OUTCOMES = ['Completed', 'Unavailable', 'Suspicious', 'Failed', 'Repeat'];
const INVALID_QUEUES: Array<[string | undefined, string]> = [
  ['NotARealQueue', 'Unknown call queue: NotARealQueue'],
  [undefined, 'Unknown call queue: undefined'],
];

describe('ComplianceCallQueueDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn = true;
    mockParams = { queue: 'ManualCheckPhone', userDataId: '2001' };
    mockSearch = '';
    mockClerksResult = { clerks: ['JR'], isLoading: false, error: undefined };
    mockGetUserData.mockResolvedValue(baseData());
    mockCanReset.mockReturnValue(true);
  });

  it('calls the compliance guard without arguments', () => {
    render(<ComplianceCallQueueDetailScreen />);

    expect(mockUseComplianceGuard).toHaveBeenCalledWith();
  });

  it.each(INVALID_QUEUES)('shows an error before fetching for queue %s', (queue, message) => {
    mockParams = { queue, userDataId: '2001' };

    render(<ComplianceCallQueueDetailScreen />);

    expect(screen.getByTestId('error-hint')).toHaveTextContent(message);
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockGetUserData).not.toHaveBeenCalled();
  });

  it('keeps the loading state and does not fetch without a userDataId', () => {
    mockParams = { queue: 'ManualCheckPhone' };

    render(<ComplianceCallQueueDetailScreen />);

    expect(mockGetUserData).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('keeps the loading state and does not fetch while logged out', () => {
    mockIsLoggedIn = false;

    render(<ComplianceCallQueueDetailScreen />);

    expect(mockGetUserData).not.toHaveBeenCalled();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows the spinner while loading and then renders the content', async () => {
    const deferred = createDeferred<any>();
    mockGetUserData.mockReturnValue(deferred.promise);

    render(<ComplianceCallQueueDetailScreen />);

    expect(screen.getByTestId('loading-spinner')).toHaveAttribute('data-size', 'lg');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outcome-form')).not.toBeInTheDocument();

    deferred.resolve(baseData());
    await waitFor(() => {
      expect(screen.getByTestId('outcome-form')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows the fetch error after loading finishes', async () => {
    mockGetUserData.mockRejectedValue(new Error('Network down'));

    render(<ComplianceCallQueueDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Network down');
    });
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows No data when a successful fetch resolves without data', async () => {
    mockGetUserData.mockResolvedValue(undefined as any);

    render(<ComplianceCallQueueDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('No data');
    });
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('renders the base queue, forwards a clerk error, and navigates after save', async () => {
    mockClerksResult = { clerks: [], isLoading: false, error: 'Network down' };

    const form = await renderLoaded();

    expect(mockGetUserData).toHaveBeenCalledWith(2001);
    expect(screen.getByTestId('user-info')).toBeInTheDocument();
    expect(screen.getByTestId('transactions-list')).toBeInTheDocument();
    expect(screen.getByTestId('ip-countries')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-comments')).toBeInTheDocument();
    expect(screen.getByTestId('questions')).toBeInTheDocument();
    expect(form).toHaveAttribute('data-clerks', '[]');
    expect(form).toHaveAttribute('data-clerks-error', 'Network down');
    expect(form).toHaveAttribute('data-clerks-loading', 'false');
    expect(screen.queryByTestId('tx-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('address-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-tx-info')).not.toBeInTheDocument();
    // With no txId there is no transaction, so the bankData memo returns before inspecting bankDatas.
    expect(mockCanReset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('save'));
    expect(mockNavigate).toHaveBeenCalledWith(
      { pathname: '/compliance/call-queues/ManualCheckPhone' },
      { replace: true, clearParams: ['txId'] },
    );
  });

  it('renders address information for the IP-country queue', async () => {
    mockParams.queue = 'ManualCheckIpCountryPhone';

    await renderLoaded(baseData({ ipLogs: [], kycLogs: [] }));

    expect(screen.getByTestId('address-info')).toBeInTheDocument();
    expect(screen.queryByTestId('bank-tx-info')).not.toBeInTheDocument();
  });

  it('renders bank transactions for the external-account queue', async () => {
    mockParams.queue = 'ManualCheckExternalAccountPhone';

    await renderLoaded();

    expect(screen.getByTestId('bank-tx-info')).toBeInTheDocument();
    expect(screen.queryByTestId('address-info')).not.toBeInTheDocument();
  });

  it('uses the user outcomes and forwards the clerk loading state', async () => {
    mockParams.queue = 'UnavailableSuspicious';
    mockClerksResult = { clerks: [], isLoading: true, error: undefined };

    const form = await renderLoaded();

    expect(JSON.parse(form.getAttribute('data-outcomes') ?? '[]')).toEqual(OUTCOMES);
    expect(form).toHaveAttribute('data-clerks', '[]');
    expect(form).toHaveAttribute('data-clerks-error', '');
    expect(form).toHaveAttribute('data-clerks-loading', 'true');
  });

  it('builds a BuyCrypto context with reset eligibility and no bank data', async () => {
    mockSearch = '?txId=101';
    const tx = transaction({
      buyCryptoId: 7001,
      amlCheck: 'Review',
      amlReason: 'Manual review',
    });

    await renderLoaded(baseData({ transactions: [tx], bankDatas: [] }));

    expect(screen.getByTestId('tx-info')).toBeInTheDocument();
    expect(mockCanReset).toHaveBeenCalledWith(tx);
    expect(outcomeContext()).toEqual({
      queue: 'ManualCheckPhone',
      userDataId: 2001,
      txId: 7001,
      sourceType: 'BuyCrypto',
      amlCheck: 'Review',
      amlReason: 'Manual review',
      buyCryptoResetEligible: true,
    });
  });

  it('forwards false BuyCrypto reset eligibility and selects approved active bank data', async () => {
    mockSearch = '?txId=101';
    mockCanReset.mockReturnValue(false);
    const tx = transaction({ buyCryptoId: 7002 });

    await renderLoaded(
      baseData({
        transactions: [tx],
        bankDatas: [bankData({ approved: true, active: true })],
      }),
    );

    expect(screen.getByTestId('tx-info')).toBeInTheDocument();
    expect(outcomeContext()).toMatchObject({
      txId: 7002,
      sourceType: 'BuyCrypto',
      buyCryptoResetEligible: false,
    });
  });

  it('builds a BuyFiat context and falls back to the first bank data entry', async () => {
    mockParams.queue = 'ManualCheckExternalAccountPhone';
    mockSearch = '?txId=102';
    const tx = transaction({ id: 102, buyFiatId: 8001, sourceType: 'BuyFiat' });

    await renderLoaded(
      baseData({
        transactions: [transaction({ id: 99 }), tx],
        bankDatas: [
          bankData({ id: 1, approved: false, active: true }),
          bankData({ id: 2, approved: true, active: false }),
        ],
      }),
    );

    expect(screen.getByTestId('tx-info')).toBeInTheDocument();
    expect(screen.getByTestId('bank-tx-info')).toBeInTheDocument();
    expect(outcomeContext()).toMatchObject({ txId: 8001, sourceType: 'BuyFiat' });
  });

  it('omits transaction context fields when the matched transaction has no source id', async () => {
    mockSearch = '?txId=103';
    const tx = transaction({ id: 103, sourceType: 'BankTx' });

    await renderLoaded(baseData({ transactions: [tx] }));

    expect(screen.getByTestId('tx-info')).toBeInTheDocument();
    expect(mockCanReset).toHaveBeenCalledWith(tx);
    expect(outcomeContext()).toEqual({ queue: 'ManualCheckPhone', userDataId: 2001 });
  });
});
