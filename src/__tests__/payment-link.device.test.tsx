// Device-aware QR on the payment-link screen: displayQr wins over device; default
// desktop shows the large QR; default mobile shows wallet copy instead.

const mockDevice = { isMobile: false };

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));

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
  Utils: { formatAmount: (n: number) => String(n) },
  Validations: {},
  useApi: () => ({ call: jest.fn() }),
  useAssetContext: () => ({ assets: new Map() }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: { RIGHT: 'right' },
  CopyButton: () => null,
  DfxIcon: () => null,
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  IconColor: { GRAY: 'gray', BLUE: 'blue', DARK_GRAY: 'dark-gray' },
  IconSize: { SM: 'sm' },
  IconVariant: { BACK: 'back', COPY: 'copy', OPEN_IN_NEW: 'open', INFO: 'info', INFO_OUTLINE: 'info-outline' },
  SpinnerSize: { LG: 'lg', MD: 'md' },
  SpinnerVariant: { LIGHT_MODE: 'light' },
  StyledButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
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
  StyledInput: () => null,
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
  Wallet: {},
}));

const mockUsePaymentLinkContext = jest.fn();
jest.mock('../contexts/payment-link.context', () => ({
  usePaymentLinkContext: () => mockUsePaymentLinkContext(),
}));

const mockUsePaymentLinkWallets = jest.fn();
jest.mock('../hooks/payment-link-wallets.hook', () => ({
  usePaymentLinkWallets: () => mockUsePaymentLinkWallets(),
}));

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentLinkScreen from '../screens/payment-link.screen';

const SCAN_COPY = 'Scan the QR-Code with a compatible app to complete the payment.';
const WALLET_COPY = 'Choose your wallet to open the payment.';

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
    paymentHasQuote: (request: unknown) => Boolean(request && typeof request === 'object' && 'quote' in (request as object)),
    setSessionApiUrl: jest.fn(),
    setPaymentIdentifier: jest.fn(),
    fetchPayRequest: jest.fn().mockResolvedValue(undefined),
    fetchPaymentIdentifier: jest.fn().mockResolvedValue(undefined),
    payWithMetaMask: jest.fn(),
  });

  mockUsePaymentLinkWallets.mockReturnValue({
    recommendedWallets: [],
    otherWallets: [],
    semiCompatibleWallets: [],
    getDeeplinkByWalletId: jest.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: undefined,
  });
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
  });

  it('desktop + displayQr false → large QR and scan copy', () => {
    mockDevice.isMobile = false;
    mockContext(false);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  it('mobile + displayQr false → no large QR and wallet copy', () => {
    mockDevice.isMobile = true;
    mockContext(false);
    renderScreen();

    expect(queryLargePaymentQr()).toBeUndefined();
    expect(screen.getByTestId('expandable-QR Code')).toBeInTheDocument();
    expect(screen.getByText(WALLET_COPY)).toBeInTheDocument();
    expect(screen.queryByText(SCAN_COPY)).not.toBeInTheDocument();
  });

  it('mobile + displayQr true → large QR (merchant preference wins)', () => {
    mockDevice.isMobile = true;
    mockContext(true);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });

  it('desktop + displayQr true → large QR and scan copy', () => {
    mockDevice.isMobile = false;
    mockContext(true);
    renderScreen();

    expect(queryLargePaymentQr()).toBeTruthy();
    expect(screen.queryByTestId('expandable-QR Code')).not.toBeInTheDocument();
    expect(screen.getByText(SCAN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(WALLET_COPY)).not.toBeInTheDocument();
  });
});
