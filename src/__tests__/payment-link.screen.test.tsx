// Device-aware QR on the payment-link screen: displayQr forces the large QR;
// otherwise handheld (UA or coarse pointer) shows wallet copy, desktop shows QR.

const mockDevice = { isMobile: false };

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));

const mockUseApiCall = jest.fn();
jest.mock('@dfx.swiss/react', () => ({
  PaymentLinkMode: { SINGLE: 'Single', MULTIPLE: 'Multiple', PUBLIC: 'Public' },
  PaymentLinkPaymentStatus: {
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired',
  },
  PaymentStandardType: {
    OPEN_CRYPTO_PAY: 'OpenCryptoPay',
    LIGHTNING_BOLT11: 'LightningBolt11',
    PAY_TO_ADDRESS: 'PayToAddress',
  },
  Utils: { formatAmount: (n: number) => String(n), createRules: () => ({}) },
  Validations: { Required: 'required' },
  useApi: () => ({ call: mockUseApiCall }),
  useAssetContext: () => ({ assets: new Map() }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: { RIGHT: 'right' },
  CopyButton: () => null,
  DfxIcon: () => null,
  Form: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit?: (e: React.FormEvent) => void;
  }) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(e);
      }}
    >
      {children}
    </form>
  ),
  IconColor: { GRAY: 'gray', BLUE: 'blue', DARK_GRAY: 'dark-gray' },
  IconSize: { SM: 'sm' },
  IconVariant: { BACK: 'back', COPY: 'copy', OPEN_IN_NEW: 'open', INFO: 'info', INFO_OUTLINE: 'info-outline' },
  SpinnerSize: { LG: 'lg', MD: 'md' },
  SpinnerVariant: { LIGHT_MODE: 'light' },
  StyledButton: ({
    label,
    onClick,
    type,
    isLoading,
    hidden,
  }: {
    label: string;
    onClick?: () => void;
    type?: string;
    isLoading?: boolean;
    hidden?: boolean;
  }) =>
    hidden ? null : (
      <button type={(type as 'button') || 'button'} onClick={onClick} data-loading={isLoading ? '1' : '0'}>
        {label}
      </button>
    ),
  StyledButtonColor: {
    STURDY_WHITE: 'sturdy-white',
    RED: 'red',
    GREEN: 'green',
  },
  StyledButtonSize: { DOUBLE: 'double' },
  StyledButtonWidth: { FULL: 'full' },
  StyledCollapsible: ({ children, titleContent }: { children: React.ReactNode; titleContent?: React.ReactNode }) => (
    <div data-testid="collapsible">
      {titleContent}
      {children}
    </div>
  ),
  StyledDataTable: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledDataTableExpandableRow: ({
    label,
    children,
    expansionContent,
  }: {
    label: string;
    children?: React.ReactNode;
    expansionContent?: React.ReactNode;
  }) => (
    <div data-testid={`expandable-${label}`}>
      <span>{label}</span>
      {children}
      {expansionContent}
    </div>
  ),
  StyledDataTableRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledDropdown: () => null,
  StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledIconButton: () => null,
  StyledInfoText: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledInfoTextSize: { XS: 'xs' },
  StyledInput: ({ name, label }: { name: string; label?: string }) => (
    <label>
      {label}
      <input name={name} data-testid={`input-${name}`} />
    </label>
  ),
  StyledLink: () => null,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('copy-to-clipboard', () => jest.fn());
jest.mock('react-lazy-load-image-component', () => ({
  LazyLoadImage: () => null,
}));
jest.mock('react-lazy-load-image-component/src/effects/opacity.css', () => ({}));

jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('../components/payment/qr-code', () => ({
  QrBasic: () => <div data-testid="payment-qr">QR</div>,
}));

jest.mock('../components/pl/payment-status-tile', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../components/app-store-badge', () => ({
  AppStoreBadge: () => null,
}));

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (e: string) => e,
  }),
}));

jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('../contexts/window.context', () => ({
  useWindowContext: () => ({ width: 1024 }),
}));

jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('../hooks/web3.hook', () => ({
  useWeb3: () => ({ toBlockchain: () => undefined }),
}));

jest.mock('../util/open-crypto-pay', () => ({
  OpenCryptoPayUtils: {
    getOcpUrlByUniqueId: (id: string) => `ocp://${id}`,
  },
}));

jest.mock('../util/utils', () => ({
  blankedAddress: (v: string) => v,
  formatAmountForDisplay: (n: number) => String(n),
  formatLocationAddress: () => '',
  formatUnits: (v: string) => v,
}));

jest.mock('../util/evm', () => ({
  Evm: { decodeUri: () => undefined },
}));

jest.mock('../util/app-store-badges', () => ({
  BadgeType: { PLAY_STORE: 'play', APP_STORE: 'app' },
}));

jest.mock('../util/payment-link-wallet', () => ({
  Wallet: {
    filterTransferInfoByWallet: (_wallet: unknown, transferInfoList: unknown[]) => transferInfoList,
    qualifiesForPayment: () => true,
  },
}));

const mockUsePaymentLinkContext = jest.fn();
jest.mock('../contexts/payment-link.context', () => ({
  usePaymentLinkContext: () => mockUsePaymentLinkContext(),
}));

const mockUsePaymentLinkWallets = jest.fn();
jest.mock('../hooks/payment-link-wallets.hook', () => ({
  usePaymentLinkWallets: () => mockUsePaymentLinkWallets(),
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentLinkScreen from '../screens/payment-link.screen';

const SCAN_COPY = 'Scan the QR-Code with a compatible app to complete the payment.';
const WALLET_COPY = 'Choose your wallet to open the payment.';
const CASHIER_COPY = 'Tell the cashier that you want to pay with crypto to start the payment.';
const OLD_CASHIER_COPY =
  'Tell the cashier that you want to pay with crypto and then scan the QR-Code with a compatible app to complete the payment.';

type MatchMediaSetup = boolean | 'undefined';

function setMatchMedia(coarse: MatchMediaSetup): void {
  if (coarse === 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    return;
  }

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function buildPayRequest(displayQr: boolean) {
  return {
    id: 'pay-1',
    externalId: 'ext-1',
    tag: 'tag',
    displayName: 'Test Merchant',
    standard: 'OpenCryptoPay',
    possibleStandards: ['OpenCryptoPay'],
    displayQr,
    mode: 'Multiple',
    route: '26678',
    currency: 'CHF',
    recipient: { name: 'Test Merchant' },
    transferAmounts: [{ method: 'Lightning', minFee: 0, assets: [{ asset: 'BTC', amount: 1 }] }],
    requestedAmount: { asset: 'CHF', amount: 12.5 },
    quote: { id: 'q1', expiration: new Date(Date.now() + 60 * 60 * 1000), payment: 'p1' },
  };
}

function buildPayRequestNoQuote() {
  const { quote: _quote, requestedAmount: _requestedAmount, ...terminal } = buildPayRequest(false);
  return terminal;
}

function mockWallets() {
  mockUsePaymentLinkWallets.mockReturnValue({
    recommendedWallets: [],
    otherWallets: [],
    semiCompatibleWallets: [],
    getDeeplinkByWalletId: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: undefined,
  });
}

function mockContext(displayQr: boolean) {
  mockUsePaymentLinkContext.mockReturnValue({
    error: undefined,
    merchant: undefined,
    payRequest: buildPayRequest(displayQr),
    timer: { minutes: 5, seconds: 0 },
    paymentLinkApiUrl: { current: 'https://api.example.com/v1/paymentLink/payment?standard=OpenCryptoPay' },
    callbackUrl: { current: undefined },
    paymentStandards: [{ id: 'OpenCryptoPay', label: 'OpenCryptoPay', description: 'desc' }],
    paymentIdentifier: 'lnurl1test',
    isLoadingPaymentIdentifier: false,
    paymentStatus: 'Pending',
    isLoadingMetaMask: false,
    metaMaskInfo: undefined,
    metaMaskError: undefined,
    isMetaMaskPaying: false,
    isMerchantMode: false,
    showAssets: false,
    showMap: false,
    paymentHasQuote: (request: unknown) =>
      Boolean(request && typeof request === 'object' && 'quote' in (request as object)),
    setSessionApiUrl: jest.fn(),
    setPaymentIdentifier: jest.fn(),
    fetchPayRequest: jest.fn().mockResolvedValue(undefined),
    fetchPaymentIdentifier: jest.fn().mockResolvedValue(undefined),
    payWithMetaMask: jest.fn(),
  });

  mockWallets();
}

function mockContextNoQuote() {
  mockUsePaymentLinkContext.mockReturnValue({
    error: undefined,
    merchant: undefined,
    payRequest: buildPayRequestNoQuote(),
    timer: { minutes: 0, seconds: 0 },
    paymentLinkApiUrl: { current: 'https://api.example.com/v1/paymentLink/payment?standard=OpenCryptoPay' },
    callbackUrl: { current: undefined },
    paymentStandards: [{ id: 'OpenCryptoPay', label: 'OpenCryptoPay', description: 'desc' }],
    paymentIdentifier: undefined,
    isLoadingPaymentIdentifier: false,
    paymentStatus: 'NoPayment',
    isLoadingMetaMask: false,
    metaMaskInfo: undefined,
    metaMaskError: undefined,
    isMetaMaskPaying: false,
    isMerchantMode: false,
    showAssets: false,
    showMap: false,
    paymentHasQuote: () => false,
    setSessionApiUrl: jest.fn(),
    setPaymentIdentifier: jest.fn(),
    fetchPayRequest: jest.fn().mockResolvedValue(undefined),
    fetchPaymentIdentifier: jest.fn().mockResolvedValue(undefined),
    payWithMetaMask: jest.fn(),
  });

  mockWallets();
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PaymentLinkScreen />
    </MemoryRouter>,
  );
}

/** Large QR above the wallet list — not the one nested under the collapsible "QR Code" row. */
function queryLargePaymentQr(): HTMLElement | undefined {
  const collapsibleRow = screen.queryByTestId('expandable-QR Code');
  return screen
    .queryAllByTestId('payment-qr')
    .find((el) => !collapsibleRow || !collapsibleRow.contains(el));
}

describe('PaymentLinkScreen device-aware QR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice.isMobile = false;
    setMatchMedia(false);
  });

  it('desktop + displayQr false → large QR and scan copy', () => {
    mockDevice.isMobile = false;
    setMatchMedia(false);
    mockContext(false);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  it('mobile + displayQr false → no large QR and wallet copy', () => {
    mockDevice.isMobile = true;
    setMatchMedia(true);
    mockContext(false);
    renderScreen();

    expect(queryLargePaymentQr()).toBeUndefined();
    expect(screen.getByTestId('expandable-QR Code')).toBeInTheDocument();
    expect(screen.getByText(WALLET_COPY)).toBeInTheDocument();
    expect(screen.queryByText(SCAN_COPY)).not.toBeInTheDocument();
  });

  it('mobile + displayQr true → large QR (merchant preference wins)', () => {
    mockDevice.isMobile = true;
    setMatchMedia(true);
    mockContext(true);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  it('desktop + displayQr true → large QR and scan copy', () => {
    mockDevice.isMobile = false;
    setMatchMedia(false);
    mockContext(true);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  // Case A: "Request Desktop Site" — UA reports desktop, coarse pointer stays true
  it('desktop UA + coarse pointer → no large QR and wallet copy (request desktop site)', () => {
    mockDevice.isMobile = false;
    setMatchMedia(true);
    mockContext(false);
    renderScreen();

    expect(queryLargePaymentQr()).toBeUndefined();
    expect(screen.getByTestId('expandable-QR Code')).toBeInTheDocument();
    expect(screen.getByText(WALLET_COPY)).toBeInTheDocument();
    expect(screen.queryByText(SCAN_COPY)).not.toBeInTheDocument();
  });

  // Case B: force semantics still wins over coarse-pointer handheld
  it('desktop UA + coarse pointer + displayQr true → large QR (force)', () => {
    mockDevice.isMobile = false;
    setMatchMedia(true);
    mockContext(true);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  // Case C: matchMedia missing — fall back to isMobile without throwing
  it('matchMedia undefined + isMobile true → falls back to isMobile (no throw)', () => {
    mockDevice.isMobile = true;
    setMatchMedia('undefined');
    mockContext(false);
    expect(() => renderScreen()).not.toThrow();

    expect(queryLargePaymentQr()).toBeUndefined();
    expect(screen.getByText(WALLET_COPY)).toBeInTheDocument();
  });

  it('matchMedia undefined + isMobile false → falls back to isMobile (large QR)', () => {
    mockDevice.isMobile = false;
    setMatchMedia('undefined');
    mockContext(false);
    expect(() => renderScreen()).not.toThrow();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
  });

  // Case D: no-quote cashier copy must not mention QR / scan
  it('no quote → cashier copy without scan/QR and no QrBasic', () => {
    mockDevice.isMobile = false;
    setMatchMedia(false);
    mockContextNoQuote();
    renderScreen();

    expect(screen.getByText(CASHIER_COPY)).toBeInTheDocument();
    expect(screen.queryByText(OLD_CASHIER_COPY)).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('payment-qr')).toHaveLength(0);

    const body = document.body.textContent ?? '';
    expect(body.toLowerCase()).not.toMatch(/\bscan\b/);
    expect(body.toLowerCase()).not.toMatch(/\bqr\b/);
  });
});

const SAMPLE_WALLET = {
  id: 42,
  name: 'SampleWallet',
  iconUrl: 'https://example.test/w.png',
  recommended: true,
  active: true,
  supportedMethods: ['Lightning'],
  websiteUrl: 'https://example.test',
  deepLink: 'sample://pay',
  playStoreUrl: 'https://play.example',
  appStoreUrl: 'https://app.example',
  hasActionDeepLink: false,
};

function baseContext(overrides: Record<string, unknown> = {}) {
  const paymentLinkApiUrl = { current: 'https://api.example.com/v1/paymentLink/payment?standard=OpenCryptoPay' };
  const callbackUrl = { current: undefined as string | undefined };
  // Mutate the ref so the standard-sync effect does not re-fire forever.
  const setSessionApiUrl = jest.fn((url?: string) => {
    paymentLinkApiUrl.current = url ?? '';
  });

  return {
    error: undefined,
    merchant: undefined,
    payRequest: buildPayRequest(false),
    timer: { minutes: 5, seconds: 0 },
    paymentLinkApiUrl,
    callbackUrl,
    paymentStandards: [{ id: 'OpenCryptoPay', label: 'OpenCryptoPay', description: 'desc' }],
    paymentIdentifier: 'lnurl1test',
    isLoadingPaymentIdentifier: false,
    paymentStatus: 'Pending',
    isLoadingMetaMask: false,
    metaMaskInfo: undefined,
    metaMaskError: undefined,
    isMetaMaskPaying: false,
    isMerchantMode: false,
    showAssets: false,
    showMap: false,
    paymentHasQuote: (request: unknown) =>
      Boolean(request && typeof request === 'object' && 'quote' in (request as object)),
    setSessionApiUrl,
    setPaymentIdentifier: jest.fn(),
    fetchPayRequest: jest.fn().mockResolvedValue(undefined),
    fetchPaymentIdentifier: jest.fn().mockResolvedValue(undefined),
    payWithMetaMask: jest.fn(),
    ...overrides,
  };
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentLinkScreen />
    </MemoryRouter>,
  );
}

describe('PaymentLinkScreen branches beyond device QR', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice.isMobile = false;
    setMatchMedia(false);
    mockUseApiCall.mockReset();
  });

  it('shows loading spinner while wallets load', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockUsePaymentLinkWallets.mockReturnValue({
      recommendedWallets: [],
      otherWallets: [],
      semiCompatibleWallets: [],
      getDeeplinkByWalletId: jest.fn(),
      isLoading: true,
      error: undefined,
    });
    renderAt();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows context error message', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ error: 'boom-error' }));
    mockWallets();
    renderAt();
    expect(screen.getByText('boom-error')).toBeInTheDocument();
  });

  it('shows wallets error over payment error', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ error: 'payment-err' }));
    mockUsePaymentLinkWallets.mockReturnValue({
      recommendedWallets: [],
      otherWallets: [],
      semiCompatibleWallets: [],
      getDeeplinkByWalletId: jest.fn(),
      isLoading: false,
      error: 'wallets-err',
    });
    renderAt();
    expect(screen.getByText('wallets-err')).toBeInTheDocument();
    expect(screen.queryByText('payment-err')).not.toBeInTheDocument();
  });

  it('renders wallet grids when recommended/other/semi wallets present', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockUsePaymentLinkWallets.mockReturnValue({
      recommendedWallets: [SAMPLE_WALLET],
      otherWallets: [{ ...SAMPLE_WALLET, id: 43, name: 'OtherW', recommended: false }],
      semiCompatibleWallets: [{ ...SAMPLE_WALLET, id: 44, name: 'SemiW', recommended: false, semiCompatible: true }],
      getDeeplinkByWalletId: jest.fn().mockResolvedValue('sample://'),
      isLoading: false,
      error: undefined,
    });
    renderAt();
    // WalletGrid headers are uppercased in DividerWithHeader.
    expect(screen.getByText('RECOMMENDED APPS')).toBeInTheDocument();
    expect(screen.getByText('COMPATIBLE APPS')).toBeInTheDocument();
    expect(screen.getByText('SEMI COMPATIBLE APPS')).toBeInTheDocument();
    expect(screen.getByText('SampleWallet')).toBeInTheDocument();
    expect(screen.getByText('OtherW')).toBeInTheDocument();
    expect(screen.getByText('SemiW')).toBeInTheDocument();
  });

  it('loads wallet detail when wallet-id is in the URL', async () => {
    const getDeeplinkByWalletId = jest.fn().mockResolvedValue('sample://deeplink');
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockUsePaymentLinkWallets.mockReturnValue({
      recommendedWallets: [SAMPLE_WALLET],
      otherWallets: [],
      semiCompatibleWallets: [],
      getDeeplinkByWalletId,
      isLoading: false,
      error: undefined,
    });
    renderAt('/?wallet-id=42');
    await waitFor(() => {
      expect(getDeeplinkByWalletId).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(screen.getByText('Open website')).toBeInTheDocument();
    });
  });

  it('shows MetaMask error copy', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({ metaMaskError: 'Please install MetaMask or connect a wallet' }),
    );
    mockWallets();
    renderAt();
    expect(screen.getByText('Please install MetaMask or connect a wallet')).toBeInTheDocument();
  });

  it('shows MetaMask pay button and invokes payWithMetaMask', () => {
    const payWithMetaMask = jest.fn();
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        metaMaskInfo: {
          accountAddress: '0xabc',
          transferAsset: { name: 'ETH', blockchain: 'Ethereum' },
          transferAmount: 0.1,
          minFee: 0,
        },
        payWithMetaMask,
      }),
    );
    mockWallets();
    renderAt();
    expect(screen.getByText(/Complete this payment using/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pay'));
    expect(payWithMetaMask).toHaveBeenCalled();
  });

  it('public mode without quote shows create-payment form', () => {
    const terminal = {
      id: 'pub-1',
      externalId: 'ext-pub',
      tag: 't',
      displayName: 'Public Shop',
      standard: 'OpenCryptoPay',
      possibleStandards: ['OpenCryptoPay'],
      displayQr: false,
      mode: 'Public',
      route: '1',
      currency: 'CHF',
      recipient: { name: 'Public Shop' },
      transferAmounts: [],
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: terminal,
        paymentStatus: 'NoPayment',
        paymentHasQuote: () => false,
      }),
    );
    mockWallets();
    renderAt();
    expect(screen.getByText('Insert the amount to active the payment.')).toBeInTheDocument();
    expect(screen.getByText('Activate')).toBeInTheDocument();
  });

  it('public mode with quote shows edit-payment control', () => {
    const req = {
      ...buildPayRequest(false),
      mode: 'Public',
      externalId: 'ext-pub',
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: req,
        paymentStatus: 'Pending',
      }),
    );
    mockWallets();
    renderAt();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('merchant SPAR shows locations map iframe', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ merchant: 'SPAR' }));
    mockWallets();
    renderAt();
    expect(screen.getByText('LOCATIONS')).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeTruthy();
  });

  it('clears wallet data when payment is cancelled', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentStatus: 'Cancelled',
      }),
    );
    mockUsePaymentLinkWallets.mockReturnValue({
      recommendedWallets: [SAMPLE_WALLET],
      otherWallets: [],
      semiCompatibleWallets: [],
      getDeeplinkByWalletId: jest.fn().mockResolvedValue('x'),
      isLoading: false,
      error: undefined,
    });
    renderAt();
    // Cancelled status still renders shell; wallet grids depend on PENDING filter
    expect(screen.queryByText('SampleWallet')).not.toBeInTheDocument();
  });

  it('shows rate info when blockchain standard and timer are set', async () => {
    const paymentLinkApiUrl = {
      current: 'https://api.example.com/v1/paymentLink/payment?standard=PayToAddress',
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentLinkApiUrl,
        setSessionApiUrl: jest.fn((url?: string) => {
          paymentLinkApiUrl.current = url ?? '';
        }),
        payRequest: {
          ...buildPayRequest(false),
          standard: 'PayToAddress',
          possibleStandards: ['PayToAddress'],
          transferAmounts: [
            {
              method: 'Ethereum',
              minFee: 0,
              assets: [{ asset: 'ETH', amount: 0.5 }],
              available: true,
            },
          ],
          requestedAmount: { asset: 'CHF', amount: 100 },
        },
        paymentStandards: [
          {
            id: 'PayToAddress',
            label: 'Pay to address',
            description: 'on-chain',
            blockchain: 'Ethereum',
          },
        ],
        timer: { minutes: 4, seconds: 30 },
      }),
    );
    mockWallets();
    renderAt();
    await waitFor(() => {
      expect(screen.getByText(/The exchange rate of .* is fixed for/)).toBeInTheDocument();
    });
  });

  it('create public payment surfaces API error', async () => {
    mockUseApiCall.mockRejectedValue({ message: 'activate-failed' });
    const terminal = {
      id: 'pub-1',
      externalId: 'ext-pub',
      tag: 't',
      displayName: 'Public Shop',
      standard: 'OpenCryptoPay',
      possibleStandards: ['OpenCryptoPay'],
      displayQr: false,
      mode: 'Public',
      route: '1',
      currency: 'CHF',
      recipient: { name: 'Public Shop' },
      transferAmounts: [],
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: terminal,
        paymentStatus: 'NoPayment',
        paymentHasQuote: () => false,
      }),
    );
    mockWallets();
    renderAt();
    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('activate-failed');
    });
  });

  it('edit public payment surfaces API error', async () => {
    mockUseApiCall.mockRejectedValue({ message: 'edit-failed' });
    const req = {
      ...buildPayRequest(false),
      mode: 'Public',
      externalId: 'ext-pub',
    };
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ payRequest: req }));
    mockWallets();
    renderAt();
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => {
      expect(screen.getByTestId('error-hint')).toHaveTextContent('edit-failed');
    });
  });
});
