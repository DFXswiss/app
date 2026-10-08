import { Component, ReactNode } from 'react';

const mockCall = jest.fn();
const mockAssetsGet = jest.fn();
const mockNavigate = jest.fn();
const mockToBlockchain = jest.fn();
const mockSetSearchParams = jest.fn();
const mockSetValue = jest.fn();
const mockTranslate = jest.fn((_ns: string, key: string) => key);
const mockTranslateError = jest.fn((key: string) => key);
const mockUseLayoutOptions = jest.fn();
const mockGetDeeplinkByWalletId = jest.fn();
const mockSetSessionApiUrl = jest.fn();
const mockSetPaymentIdentifier = jest.fn();
const mockFetchPayRequest = jest.fn();
const mockFetchPaymentIdentifier = jest.fn();
const mockPayWithMetaMask = jest.fn();
const mockCopy: jest.Mock<unknown, unknown[]> = jest.fn();
const mockOpen = jest.fn();
const mockScrollIntoView = jest.fn();

type PaymentStandardLike = {
  id: string;
  label: string;
  description: string;
  blockchain?: string;
};

type AssetLike = {
  name: string;
  chainId?: string;
  explorerUrl?: string;
  decimals?: number;
  blockchain?: string;
};

type WalletLike = {
  id: number;
  name: string;
  iconUrl: string;
  supportedMethods: string[];
  active?: boolean;
  deepLink?: string;
  hasActionDeepLink?: boolean;
  websiteUrl?: string;
  playStoreUrl?: string;
  appStoreUrl?: string;
};

let mockSearchParams = new URLSearchParams();
let mockFormData: { amount?: number | string } = { amount: 10 };
let mockWatchValues: { paymentStandard?: PaymentStandardLike; asset?: string } = {};
let mockAssetsList: AssetLike[] = [];
let mockWindowWidth = 800;

function paymentHasQuote(request: unknown): boolean {
  return typeof request === 'object' && request !== null && 'quote' in request;
}

interface MockPaymentLinkContext {
  error: string | undefined;
  merchant: string | undefined;
  payRequest: Record<string, unknown> | undefined;
  timer: { minutes: number; seconds: number };
  paymentLinkApiUrl: { current: string };
  callbackUrl: { current: string | undefined };
  paymentStandards: PaymentStandardLike[] | undefined;
  paymentIdentifier: string | undefined;
  isLoadingPaymentIdentifier: boolean;
  paymentStatus: string;
  isLoadingMetaMask: boolean;
  metaMaskInfo:
    | {
        transferAmount: number;
        transferAsset: { name: string; blockchain: string };
      }
    | undefined;
  metaMaskError: string | undefined;
  isMetaMaskPaying: boolean;
  isMerchantMode: boolean;
  showAssets: boolean;
  showMap: boolean;
  paymentHasQuote: (request: unknown) => boolean;
  setSessionApiUrl: jest.Mock;
  setPaymentIdentifier: jest.Mock;
  fetchPayRequest: jest.Mock;
  fetchPaymentIdentifier: jest.Mock;
  payWithMetaMask: jest.Mock;
}

interface MockWalletsHook {
  recommendedWallets: WalletLike[];
  otherWallets: WalletLike[];
  semiCompatibleWallets: WalletLike[];
  getDeeplinkByWalletId: jest.Mock;
  isLoading: boolean;
  error: string | undefined;
}

const mockPaymentLinkContext = {} as MockPaymentLinkContext;
const mockWalletsHook = {} as MockWalletsHook;

jest.mock('@dfx.swiss/react', () => ({
  Asset: {},
  Fiat: {},
  KycFile: {},
  UserAddress: {},
  Blockchain: { ETHEREUM: 'Ethereum', POLYGON: 'Polygon', LIGHTNING: 'Lightning' },
  PaymentLinkMode: { PUBLIC: 'Public', SINGLE: 'Single', MULTIPLE: 'Multiple' },
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
  useApi: () => ({ call: mockCall }),
  useAssetContext: () => ({ assets: { get: mockAssetsGet } }),
  Utils: {
    createRules: (rules: unknown) => rules,
    formatAmount: (amount: number) => Number(amount).toFixed(2),
  },
  Validations: { Required: { required: true } },
}));

jest.mock('@dfx.swiss/react-components', () => {
  const Stack = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlignContent: { RIGHT: 'right' },
    CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
      <button type="button" data-testid="copy" onClick={onCopy}>
        copy
      </button>
    ),
    DfxIcon: ({ icon }: { icon: string }) => <span data-testid={`dfx-icon-${icon}`} />,
    Form: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    IconColor: { DARK_GRAY: 'dark-gray', BLUE: 'blue', GRAY: 'gray' },
    IconSize: { SM: 'sm' },
    IconVariant: {
      COPY: 'copy',
      OPEN_IN_NEW: 'open-in-new',
      INFO: 'info',
      INFO_OUTLINE: 'info-outline',
      BACK: 'back',
    },
    SpinnerSize: { LG: 'lg', MD: 'md' },
    SpinnerVariant: { LIGHT_MODE: 'light' },
    StyledButton: ({
      label,
      onClick,
      type,
      hidden,
      isLoading,
    }: {
      label: string;
      onClick?: () => void;
      type?: 'button' | 'submit';
      hidden?: boolean;
      isLoading?: boolean;
    }) =>
      hidden ? null : (
        <button type={type || 'button'} onClick={onClick} data-loading={String(!!isLoading)}>
          {label}
        </button>
      ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', RED: 'red', GREEN: 'green' },
    StyledButtonSize: { DOUBLE: 'double' },
    StyledButtonWidth: { FULL: 'full' },
    StyledCollapsible: ({
      children,
      titleContent,
      isExpanded,
    }: {
      children?: ReactNode;
      titleContent?: ReactNode;
      isExpanded?: boolean;
    }) => (
      <div data-testid="collapsible" data-expanded={String(!!isExpanded)}>
        {titleContent}
        {children}
      </div>
    ),
    StyledDataTable: ({ children }: { children?: ReactNode }) => <div data-testid="data-table">{children}</div>,
    StyledDataTableExpandableRow: ({
      label,
      children,
      expansionItems,
      expansionContent,
      isLoading,
    }: {
      label?: string;
      children?: ReactNode;
      expansionItems?: { label: string; text?: string | false; onClick?: () => void }[];
      expansionContent?: ReactNode;
      isLoading?: boolean;
    }) => (
      <div data-testid={`expand-${label}`} data-loading={String(!!isLoading)}>
        {children}
        {expansionContent}
        {expansionItems?.map((item) => (
          <button key={item.label} type="button" data-testid={`expand-item-${item.label}`} onClick={item.onClick}>
            {item.text}
          </button>
        ))}
      </div>
    ),
    StyledDataTableRow: ({
      label,
      children,
      isLoading,
    }: {
      label?: string;
      children?: ReactNode;
      isLoading?: boolean;
    }) => (
      <div data-testid={`row-${label}`} data-loading={String(!!isLoading)}>
        {children}
      </div>
    ),
    StyledDropdown: ({
      name,
      items,
      labelFunc,
      descriptionFunc,
    }: {
      name: string;
      items: unknown[];
      labelFunc?: (item: unknown) => string;
      descriptionFunc?: (item: unknown) => string;
    }) => (
      <div data-testid={`dropdown-${name}`}>
        {items.map((item, index) => (
          <div key={index} data-testid={`dropdown-${name}-item-${index}`}>
            <span data-testid={`dropdown-${name}-label-${index}`}>{labelFunc?.(item)}</span>
            <span data-testid={`dropdown-${name}-description-${index}`}>{descriptionFunc?.(item)}</span>
          </div>
        ))}
      </div>
    ),
    StyledHorizontalStack: Stack,
    StyledIconButton: ({ icon, onClick }: { icon: string; onClick?: () => void }) => (
      <button type="button" data-testid={`icon-${icon}`} onClick={onClick} />
    ),
    StyledInfoText: ({ children, isLoading }: { children?: ReactNode; isLoading?: boolean }) => (
      <div data-testid="exchange-rate" data-loading={String(!!isLoading)}>
        {children}
      </div>
    ),
    StyledInfoTextSize: { XS: 'xs' },
    StyledInput: ({ label, name }: { label?: string; name?: string }) => (
      <label>
        {label}
        <input name={name} />
      </label>
    ),
    StyledLink: ({ label, url }: { label: string; url: string }) => <a href={url}>{label}</a>,
    StyledLoadingSpinner: () => <div role="progressbar" />,
    StyledVerticalStack: Stack,
  };
});

jest.mock(
  'copy-to-clipboard',
  () =>
    (...args: unknown[]) =>
      mockCopy(...args),
);

jest.mock('react-hook-form', () => ({
  useForm: () => ({
    control: {},
    setValue: mockSetValue,
    handleSubmit: (fn: (data: { amount?: number | string }) => unknown) => () => fn(mockFormData),
    formState: { errors: {} },
  }),
  useWatch: ({ name }: { name: string }) => mockWatchValues[name as keyof typeof mockWatchValues],
}));

jest.mock('react-lazy-load-image-component', () => ({
  LazyLoadImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

jest.mock('react-lazy-load-image-component/src/effects/opacity.css', () => ({}));

jest.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));

jest.mock('src/components/payment/qr-code', () => ({
  QrBasic: ({ data, isLoading }: { data: string; isLoading?: boolean }) => (
    <div data-testid="qr-basic" data-loading={String(!!isLoading)}>
      {data}
    </div>
  ),
}));

jest.mock('src/components/payment/spar-place-map', () => ({
  SparPlaceMap: () => <div data-testid="spar-place-map" />,
}));

jest.mock('src/components/pl/payment-status-tile', () => ({
  __esModule: true,
  default: ({ status, filterStatuses }: { status: string; filterStatuses?: string[] }) => (
    <div data-testid="payment-status-tile" data-filters={JSON.stringify(filterStatuses)}>
      {status}
    </div>
  ),
}));

jest.mock('src/components/app-store-badge', () => ({
  AppStoreBadge: ({ type, url }: { type: string; url?: string }) => <div data-testid={`badge-${type}`}>{url}</div>,
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));

jest.mock('src/contexts/payment-link.context', () => ({
  usePaymentLinkContext: () => mockPaymentLinkContext,
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    translateError: mockTranslateError,
  }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: mockWindowWidth }),
}));

jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: (...args: unknown[]) => mockUseLayoutOptions(...args),
}));

jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('src/hooks/payment-link-wallets.hook', () => ({
  usePaymentLinkWallets: () => mockWalletsHook,
}));

jest.mock('src/hooks/web3.hook', () => ({
  useWeb3: () => ({ toBlockchain: mockToBlockchain }),
}));

jest.mock('src/util/open-crypto-pay', () => ({
  OpenCryptoPayUtils: {
    getOcpUrlByUniqueId: (id: string) => `ocp:${id}`,
  },
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PaymentLinkMode, PaymentLinkPaymentStatus, PaymentStandardType } from '@dfx.swiss/react';
import { NoPaymentLinkPaymentStatus } from 'src/dto/payment-link.dto';
import PaymentLinkScreen from 'src/screens/payment-link.screen';
import { BadgeType } from 'src/util/app-store-badges';

const API_URL = 'https://api.example.com/v1/paymentLink/payment';
const EVM_URI = 'ethereum:0x1111111111111111111111111111111111111111@1?value=1000000000000000000';
const EVM_URI_NO_AMOUNT = 'ethereum:0x1111111111111111111111111111111111111111@1';
const EVM_URI_TOKEN_NO_ADDRESS = 'ethereum:0xTokenContract@1/transfer?uint256=1000';

const openCryptoPayStandard: PaymentStandardLike = {
  id: PaymentStandardType.OPEN_CRYPTO_PAY,
  label: 'OpenCryptoPay label',
  description: 'OpenCryptoPay description',
};

const payToAddressStandard: PaymentStandardLike = {
  id: PaymentStandardType.PAY_TO_ADDRESS,
  label: 'Pay to address {{blockchain}}',
  description: 'On {{blockchain}}',
  blockchain: 'Ethereum',
};

const payToAddressNoChain: PaymentStandardLike = {
  id: PaymentStandardType.PAY_TO_ADDRESS,
  label: 'Pay to address {{blockchain}}',
  description: 'On {{blockchain}}',
};

const lightningStandard: PaymentStandardLike = {
  id: PaymentStandardType.LIGHTNING_BOLT11,
  label: 'Lightning label',
  description: 'Lightning description',
};

function quotedPayRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pl-1',
    externalId: 'ext-1',
    tag: 'tag-1',
    displayName: 'Cafe',
    standard: PaymentStandardType.OPEN_CRYPTO_PAY,
    possibleStandards: [PaymentStandardType.OPEN_CRYPTO_PAY],
    displayQr: false,
    mode: PaymentLinkMode.PUBLIC,
    route: 'route-1',
    currency: 'CHF',
    recipient: undefined,
    transferAmounts: [
      {
        method: 'Ethereum',
        minFee: 0,
        assets: [{ asset: 'USDC', amount: 10 }],
      },
    ],
    quote: {
      id: 'quote-1',
      expiration: new Date('2026-12-01T12:00:00.000Z'),
      payment: 'pay-1',
    },
    callback: 'https://callback.example.com/cb',
    metadata: '{}',
    minSendable: 1,
    maxSendable: 100,
    requestedAmount: { asset: 'CHF', amount: 20 },
    ...overrides,
  };
}

function terminalPayRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pl-1',
    externalId: 'ext-1',
    tag: 'tag-1',
    displayName: 'Cafe',
    standard: PaymentStandardType.OPEN_CRYPTO_PAY,
    possibleStandards: [PaymentStandardType.OPEN_CRYPTO_PAY],
    displayQr: false,
    mode: PaymentLinkMode.PUBLIC,
    route: 'route-1',
    currency: 'CHF',
    recipient: { name: 'Cafe' },
    transferAmounts: [],
    ...overrides,
  };
}

function wallet(overrides: Partial<WalletLike> = {}): WalletLike {
  return {
    id: 1,
    name: 'Frankenwallet',
    iconUrl: 'https://example.com/w.png',
    supportedMethods: ['Ethereum'],
    active: true,
    ...overrides,
  };
}

function resetPaymentLinkContext(): void {
  mockPaymentLinkContext.error = undefined;
  mockPaymentLinkContext.merchant = undefined;
  mockPaymentLinkContext.payRequest = quotedPayRequest();
  mockPaymentLinkContext.timer = { minutes: 1, seconds: 30 };
  mockPaymentLinkContext.paymentLinkApiUrl = { current: API_URL };
  mockPaymentLinkContext.callbackUrl = { current: 'https://callback.example.com/prev' };
  mockPaymentLinkContext.paymentStandards = undefined;
  mockPaymentLinkContext.paymentIdentifier = undefined;
  mockPaymentLinkContext.isLoadingPaymentIdentifier = false;
  mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
  mockPaymentLinkContext.isLoadingMetaMask = false;
  mockPaymentLinkContext.metaMaskInfo = undefined;
  mockPaymentLinkContext.metaMaskError = undefined;
  mockPaymentLinkContext.isMetaMaskPaying = false;
  mockPaymentLinkContext.isMerchantMode = false;
  mockPaymentLinkContext.showAssets = false;
  mockPaymentLinkContext.showMap = false;
  mockPaymentLinkContext.paymentHasQuote = paymentHasQuote;
  mockPaymentLinkContext.setSessionApiUrl = mockSetSessionApiUrl;
  mockPaymentLinkContext.setPaymentIdentifier = mockSetPaymentIdentifier;
  mockPaymentLinkContext.fetchPayRequest = mockFetchPayRequest;
  mockPaymentLinkContext.fetchPaymentIdentifier = mockFetchPaymentIdentifier;
  mockPaymentLinkContext.payWithMetaMask = mockPayWithMetaMask;
}

function resetWalletsHook(): void {
  mockWalletsHook.recommendedWallets = [wallet()];
  mockWalletsHook.otherWallets = [];
  mockWalletsHook.semiCompatibleWallets = [];
  mockWalletsHook.getDeeplinkByWalletId = mockGetDeeplinkByWalletId;
  mockWalletsHook.isLoading = false;
  mockWalletsHook.error = undefined;
}

function renderScreen() {
  return render(<PaymentLinkScreen />);
}

function clickCopyInRow(label: string): void {
  fireEvent.click(within(screen.getByTestId(`row-${label}`)).getByTestId('copy'));
}

interface TransferMethodsErrorBoundaryProps {
  children?: ReactNode;
  onError: (error: Error) => void;
}

interface TransferMethodsErrorBoundaryState {
  error: Error | undefined;
}

class TransferMethodsErrorBoundary extends Component<
  TransferMethodsErrorBoundaryProps,
  TransferMethodsErrorBoundaryState
> {
  state: TransferMethodsErrorBoundaryState = { error: undefined };

  static getDerivedStateFromError(error: Error): TransferMethodsErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError(error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return <div data-testid="transfer-methods-error">{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

const originalOpen = window.open;
const originalScrollIntoView = Element.prototype.scrollIntoView;

describe('PaymentLinkScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockFormData = { amount: 10 };
    mockWatchValues = {};
    mockAssetsList = [];
    mockWindowWidth = 800;
    mockSetSearchParams.mockImplementation((params: URLSearchParams) => {
      mockSearchParams = params;
    });
    mockToBlockchain.mockImplementation((chainId: string) => (chainId ? 'Ethereum' : undefined));
    mockAssetsGet.mockImplementation(() => mockAssetsList);
    mockGetDeeplinkByWalletId.mockResolvedValue('wallet://pay');
    mockCall.mockResolvedValue({});
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockTranslateError.mockImplementation((key: string) => key);
    window.open = mockOpen;
    Element.prototype.scrollIntoView = mockScrollIntoView;
    resetPaymentLinkContext();
    resetWalletsHook();
  });

  afterEach(() => {
    window.open = originalOpen;
    Element.prototype.scrollIntoView = originalScrollIntoView;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('errors and loading', () => {
    it('shows the context error string and no pay request UI', () => {
      mockPaymentLinkContext.error = 'context failed';
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.getByText('context failed')).toBeInTheDocument();
      expect(screen.queryByText('Cafe')).not.toBeInTheDocument();
      expect(screen.queryByTestId('payment-status-tile')).not.toBeInTheDocument();
    });

    it('shows the wallets hook error string and no pay request UI', () => {
      mockPaymentLinkContext.error = 'context failed';
      mockWalletsHook.error = 'wallets failed';

      renderScreen();

      expect(screen.getByText('wallets failed')).toBeInTheDocument();
      expect(screen.queryByText('context failed')).not.toBeInTheDocument();
      expect(screen.queryByText('Cafe')).not.toBeInTheDocument();
    });

    it('shows a loading spinner when payRequest is missing', () => {
      mockPaymentLinkContext.payRequest = undefined;

      renderScreen();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('Cafe')).not.toBeInTheDocument();
    });

    it('shows a loading spinner when isLoadingMetaMask', () => {
      mockPaymentLinkContext.isLoadingMetaMask = true;

      renderScreen();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('Cafe')).not.toBeInTheDocument();
    });

    it('shows a loading spinner when wallets are loading', () => {
      mockWalletsHook.isLoading = true;

      renderScreen();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('Cafe')).not.toBeInTheDocument();
    });
  });

  describe('SPAR map and scroll', () => {
    it('renders spar-locations with the mocked map for merchant SPAR and a quoted pay request', () => {
      mockPaymentLinkContext.merchant = 'SPAR';
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayName: undefined });

      renderScreen();

      const locations = screen.getByTestId('spar-locations');
      expect(locations).toBeInTheDocument();
      expect(within(locations).getByTestId('spar-place-map')).toBeInTheDocument();
      expect(screen.getByText('SPAR')).toBeInTheDocument();
      expect(screen.getByText('LOCATIONS')).toBeInTheDocument();
    });

    it('does not render spar-locations when merchant is anything else', () => {
      mockPaymentLinkContext.merchant = 'Migros';
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.queryByTestId('spar-locations')).not.toBeInTheDocument();
      expect(screen.queryByTestId('spar-place-map')).not.toBeInTheDocument();
    });

    it('showMap true with a pay request calls scrollIntoView on the locations container', () => {
      jest.useFakeTimers();
      mockPaymentLinkContext.merchant = 'SPAR';
      mockPaymentLinkContext.showMap = true;
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(mockScrollIntoView).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
      jest.useRealTimers();
    });

    it('showMap false does not scroll', () => {
      jest.useFakeTimers();
      mockPaymentLinkContext.merchant = 'SPAR';
      mockPaymentLinkContext.showMap = false;
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockScrollIntoView).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not call scrollIntoView when merchant is not SPAR even if showMap is true', () => {
      jest.useFakeTimers();
      mockPaymentLinkContext.merchant = 'Migros';
      mockPaymentLinkContext.showMap = true;
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockScrollIntoView).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not call scrollIntoView when showMap is true but payRequest is missing', () => {
      jest.useFakeTimers();
      mockPaymentLinkContext.merchant = 'SPAR';
      mockPaymentLinkContext.showMap = true;
      mockPaymentLinkContext.payRequest = undefined;

      renderScreen();

      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockScrollIntoView).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('falls back to a non-SPAR merchant string when displayName is missing', () => {
      mockPaymentLinkContext.merchant = 'Migros';
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayName: undefined });

      renderScreen();

      expect(screen.getByText('Migros')).toBeInTheDocument();
      expect(screen.queryByTestId('spar-locations')).not.toBeInTheDocument();
    });
  });

  describe('public edit form', () => {
    it('shows the edit form for a quoted public pay request that is not completed or expired', async () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      const edit = screen.getByRole('button', { name: 'Edit' });
      fireEvent.click(edit);

      await waitFor(() => {
        expect(mockCall).toHaveBeenCalledWith({
          url: 'paymentLink/payment?externalLinkId=ext-1&route=route-1',
          method: 'DELETE',
        });
      });
    });

    it('does not show the edit form when status is COMPLETED', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.COMPLETED;

      renderScreen();

      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('does not show the edit form when status is EXPIRED', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.EXPIRED;

      renderScreen();

      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows the edit form rejection message when DELETE rejects with a message', async () => {
      mockCall.mockRejectedValue({ message: 'cannot edit' });
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('cannot edit');
    });

    it('shows Unknown error when DELETE rejects without a message', async () => {
      mockCall.mockRejectedValue({});
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });

  describe('public create form', () => {
    it('shows the create form and POSTs amount coerced to number with a generated externalId', async () => {
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);
      mockFormData = { amount: '12.5' };
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = NoPaymentLinkPaymentStatus.NO_PAYMENT;

      renderScreen();

      fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

      await waitFor(() => {
        expect(mockCall).toHaveBeenCalledWith({
          url: 'paymentLink/payment?externalLinkId=ext-1&route=route-1',
          method: 'POST',
          data: {
            amount: 12.5,
            externalId: (0.123456789).toString(36).substring(2, 15),
          },
        });
      });

      randomSpy.mockRestore();
    });

    it('shows the create form rejection message when POST rejects with a message', async () => {
      mockCall.mockRejectedValue({ message: 'cannot create' });
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = NoPaymentLinkPaymentStatus.NO_PAYMENT;

      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('cannot create');
    });

    it('shows Unknown error when POST rejects without a message', async () => {
      mockCall.mockRejectedValue({});
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = NoPaymentLinkPaymentStatus.NO_PAYMENT;

      renderScreen();
      fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });

  describe('identifier spinner', () => {
    it('follows isLoadingPaymentIdentifier when pending, no quote, and not the public create form', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({ mode: PaymentLinkMode.SINGLE });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockPaymentLinkContext.isLoadingPaymentIdentifier = false;

      const { rerender } = renderScreen();

      expect(screen.getByRole('progressbar', { hidden: true }).parentElement).toHaveAttribute('hidden');

      mockPaymentLinkContext.isLoadingPaymentIdentifier = true;
      rerender(<PaymentLinkScreen />);

      expect(screen.getByRole('progressbar', { hidden: true }).parentElement).not.toHaveAttribute('hidden');
    });

    it('follows isLoadingPaymentIdentifier for NO_PAYMENT when not the public create form', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({ mode: PaymentLinkMode.SINGLE });
      mockPaymentLinkContext.paymentStatus = NoPaymentLinkPaymentStatus.NO_PAYMENT;
      mockPaymentLinkContext.isLoadingPaymentIdentifier = true;

      renderScreen();

      expect(screen.getByRole('progressbar').parentElement).not.toHaveAttribute('hidden');
    });

    it('renders null for the merchant-less form slot when status is neither pending nor no-payment', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({ mode: PaymentLinkMode.SINGLE });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.COMPLETED;

      renderScreen();

      expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });
  });

  describe('payment standards and assets dropdowns', () => {
    it('renders labelFunc and descriptionFunc for an item with a blockchain and an item without', () => {
      mockPaymentLinkContext.paymentStandards = [payToAddressStandard, payToAddressNoChain];
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(screen.getByTestId('dropdown-paymentStandard-label-0')).toHaveTextContent('Pay to address {{blockchain}}');
      expect(screen.getByTestId('dropdown-paymentStandard-description-0')).toHaveTextContent('On {{blockchain}}');
      expect(mockTranslate).toHaveBeenCalledWith('screens/payment', 'Pay to address {{blockchain}}', {
        blockchain: 'Ethereum',
      });
      expect(mockTranslate).toHaveBeenCalledWith('screens/payment', 'On {{blockchain}}', { blockchain: 'Ethereum' });
      expect(mockTranslate).toHaveBeenCalledWith('screens/payment', 'Pay to address {{blockchain}}', {
        blockchain: '',
      });
      expect(mockTranslate).toHaveBeenCalledWith('screens/payment', 'On {{blockchain}}', { blockchain: '' });
    });

    it('renders the assets dropdown and empty descriptionFunc when blockchain is missing', () => {
      mockPaymentLinkContext.paymentStandards = [payToAddressNoChain];
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        transferAmounts: [
          {
            method: undefined,
            minFee: 0,
            assets: [{ asset: 'USDC', amount: 10 }],
          },
        ],
      });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockWatchValues = { paymentStandard: payToAddressNoChain };

      renderScreen();

      expect(screen.getByTestId('dropdown-asset')).toBeInTheDocument();
      expect(screen.getByTestId('dropdown-asset-label-0')).toHaveTextContent('USDC');
      expect(screen.getByTestId('dropdown-asset-description-0')).toHaveTextContent('');
    });

    it('renders the assets dropdown description from the selected blockchain when it exists', () => {
      mockPaymentLinkContext.paymentStandards = [payToAddressStandard];
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'USDC' };

      renderScreen();

      expect(screen.getByTestId('dropdown-asset-description-0')).toHaveTextContent('Ethereum');
    });

    it('hides the standards dropdown when paymentStandards is empty', () => {
      mockPaymentLinkContext.paymentStandards = [];
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.queryByTestId('dropdown-paymentStandard')).not.toBeInTheDocument();
    });

    it('hides the standards dropdown when metaMaskInfo is set', () => {
      mockPaymentLinkContext.paymentStandards = [openCryptoPayStandard];
      mockPaymentLinkContext.metaMaskInfo = {
        transferAmount: 1,
        transferAsset: { name: 'USDC', blockchain: 'Ethereum' },
      };

      renderScreen();

      expect(screen.queryByTestId('dropdown-paymentStandard')).not.toBeInTheDocument();
    });

    it('hides the standards dropdown when metaMaskError is set', () => {
      mockPaymentLinkContext.paymentStandards = [openCryptoPayStandard];
      mockPaymentLinkContext.metaMaskError = 'MetaMask unavailable';

      renderScreen();

      expect(screen.queryByTestId('dropdown-paymentStandard')).not.toBeInTheDocument();
    });

    it('expands payment details when showAssets is true', () => {
      mockPaymentLinkContext.showAssets = true;
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.getAllByTestId('collapsible')[0]).toHaveAttribute('data-expanded', 'true');
    });
  });

  describe('external id row', () => {
    it('renders the external id row, copies the callback, and copies a callback address', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        callback: 'https://callback.example.com/cb',
      });

      renderScreen();

      expect(screen.getByTestId('expand-External ID')).toBeInTheDocument();
      expect(screen.getByTestId('expand-item-ID')).toHaveTextContent('pl-1');
      expect(screen.getByTestId('expand-item-Mode')).toHaveTextContent(PaymentLinkMode.PUBLIC);
      expect(screen.getByTestId('expand-item-Tag')).toHaveTextContent('tag-1');
      expect(screen.getByTestId('expand-item-Route')).toHaveTextContent('route-1');

      fireEvent.click(screen.getByTestId('expand-item-Callback'));
      expect(mockCopy).toHaveBeenCalledWith('https://callback.example.com/cb');
    });

    it('filters out the callback expansion item when callback is missing', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ callback: undefined });

      renderScreen();

      expect(screen.getByTestId('expand-External ID')).toBeInTheDocument();
      expect(screen.queryByTestId('expand-item-Callback')).not.toBeInTheDocument();
    });

    it('hides the external id row when external id is missing', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ externalId: undefined });

      renderScreen();

      expect(screen.queryByTestId('expand-External ID')).not.toBeInTheDocument();
    });

    it('hides the external id row in merchant mode', () => {
      mockPaymentLinkContext.isMerchantMode = true;
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.queryByTestId('expand-External ID')).not.toBeInTheDocument();
    });
  });

  describe('PAY_TO_ADDRESS EVM uri', () => {
    function setupPayToAddress(
      overrides: {
        uri?: string;
        asset?: AssetLike;
        identifier?: string;
        toBlockchain?: string | undefined;
      } = {},
    ): void {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        standard: PaymentStandardType.PAY_TO_ADDRESS,
      });
      mockPaymentLinkContext.paymentIdentifier = overrides.identifier ?? EVM_URI;
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'USDC' };
      mockAssetsList = [
        overrides.asset ?? {
          name: 'USDC',
          chainId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          explorerUrl: 'https://etherscan.io/token/0xA0b8',
          decimals: 6,
        },
      ];
      if (overrides.uri) {
        mockPaymentLinkContext.paymentIdentifier = overrides.uri;
      }
      if ('toBlockchain' in overrides) {
        mockToBlockchain.mockReturnValue(overrides.toBlockchain);
      }
    }

    it('renders amount, address and chain, toggles contract both ways, copies and opens the explorer', () => {
      setupPayToAddress();

      renderScreen();

      expect(screen.getByTestId('row-Amount')).toBeInTheDocument();
      expect(screen.getByTestId('row-Address')).toBeInTheDocument();
      expect(screen.getByTestId('row-Blockchain')).toHaveTextContent('Ethereum');
      expect(screen.getByTestId('row-Asset')).toHaveTextContent('USDC');

      clickCopyInRow('Amount');
      expect(mockCopy).toHaveBeenCalledWith('1000000000000000000');

      clickCopyInRow('Address');
      expect(mockCopy).toHaveBeenCalledWith('0x1111111111111111111111111111111111111111');

      clickCopyInRow('Blockchain');
      expect(mockCopy).toHaveBeenCalledWith('Ethereum');

      fireEvent.click(screen.getByTestId('icon-info-outline'));
      expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('icon-copy'));
      expect(mockCopy).toHaveBeenCalledWith('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');

      fireEvent.click(screen.getByTestId('icon-open-in-new'));
      expect(mockOpen).toHaveBeenCalledWith('https://etherscan.io/token/0xA0b8', '_blank');

      fireEvent.click(screen.getByTestId('icon-info'));
      expect(screen.getByTestId('row-Asset')).toHaveTextContent('USDC');
      expect(screen.queryByTestId('icon-copy')).not.toBeInTheDocument();
    });

    it('renders the asset name without a contract toggle when chainId is missing', () => {
      setupPayToAddress({ asset: { name: 'USDC', decimals: 6 } });

      renderScreen();

      expect(screen.getByTestId('row-Asset')).toHaveTextContent('USDC');
      expect(screen.queryByTestId('icon-info-outline')).not.toBeInTheDocument();
    });

    it('hides the explorer button when explorerUrl is missing', () => {
      setupPayToAddress({
        asset: {
          name: 'USDC',
          chainId: '0xToken',
          decimals: 6,
        },
      });

      renderScreen();

      fireEvent.click(screen.getByTestId('icon-info-outline'));
      expect(screen.queryByTestId('icon-open-in-new')).not.toBeInTheDocument();
    });

    it('hides the blockchain row when toBlockchain returns undefined', () => {
      setupPayToAddress({ toBlockchain: undefined });

      renderScreen();

      expect(screen.queryByTestId('row-Blockchain')).not.toBeInTheDocument();
    });

    it('hides the amount row when the decoded uri has no amount', () => {
      setupPayToAddress({ uri: EVM_URI_NO_AMOUNT });

      renderScreen();

      expect(screen.queryByTestId('row-Amount')).not.toBeInTheDocument();
      expect(screen.getByTestId('row-Address')).toBeInTheDocument();
    });

    it('hides the address row when the decoded uri has no address', () => {
      setupPayToAddress({ uri: EVM_URI_TOKEN_NO_ADDRESS });

      renderScreen();

      expect(screen.queryByTestId('row-Address')).not.toBeInTheDocument();
      expect(screen.getByTestId('row-Amount')).toBeInTheDocument();
    });

    it('marks EVM rows as loading when isLoadingPaymentIdentifier is true', () => {
      setupPayToAddress();
      mockPaymentLinkContext.isLoadingPaymentIdentifier = true;

      renderScreen();

      expect(screen.getByTestId('row-Amount')).toHaveAttribute('data-loading', 'true');
    });
  });

  describe('recipient row', () => {
    const fullRecipient = {
      name: 'Alice',
      address: {
        street: 'Bahnhofstrasse',
        houseNumber: '7',
        zip: '8001',
        city: 'Zurich',
        country: 'Switzerland',
      },
      phone: '+41000000',
      mail: 'alice@example.com',
      website: 'https://alice.example',
    };

    it('renders name, address, country, phone, a non-dfx mail and a website with http, and opens it', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ recipient: fullRecipient });

      renderScreen();

      expect(screen.getByTestId('expand-Recipient')).toHaveTextContent('Alice');
      expect(screen.getByTestId('expand-item-Name')).toHaveTextContent('Alice');
      expect(screen.getByTestId('expand-item-Address')).toHaveTextContent('Bahnhofstrasse 7, 8001 Zurich');
      expect(screen.getByTestId('expand-item-Country')).toHaveTextContent('Switzerland');
      expect(screen.getByTestId('expand-item-Phone number')).toHaveTextContent('+41000000');
      expect(screen.getByTestId('expand-item-Email address')).toHaveTextContent('alice@example.com');

      fireEvent.click(screen.getByTestId('expand-item-Website'));
      expect(mockOpen).toHaveBeenCalledWith('https://alice.example', '_blank');
    });

    it('filters out a mail that ends with @dfx.swiss', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        recipient: { ...fullRecipient, mail: 'ops@dfx.swiss' },
      });

      renderScreen();

      expect(screen.queryByTestId('expand-item-Email address')).not.toBeInTheDocument();
    });

    it('opens a website without http by prefixing https', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        recipient: { ...fullRecipient, website: 'alice.example' },
      });

      renderScreen();

      fireEvent.click(screen.getByTestId('expand-item-Website'));
      expect(mockOpen).toHaveBeenCalledWith('https://alice.example', '_blank');
    });

    it('opens a website that starts with http:// without rewriting it', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        recipient: { ...fullRecipient, website: 'http://alice.example' },
      });

      renderScreen();

      fireEvent.click(screen.getByTestId('expand-item-Website'));
      expect(mockOpen).toHaveBeenCalledWith('http://alice.example', '_blank');
    });

    it('shows payment details from recipient alone when there is no quote', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({
        mode: PaymentLinkMode.SINGLE,
        recipient: { name: 'Bob' },
      });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(screen.getByTestId('expand-Recipient')).toHaveTextContent('Bob');
    });

    it('hides payment details when there is no quote and no recipient', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({
        mode: PaymentLinkMode.SINGLE,
        recipient: undefined,
      });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(screen.queryByText('Payment details')).not.toBeInTheDocument();
    });
  });

  describe('expiry and QR rows', () => {
    it('renders the expiry row with quote id and payment', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.getByTestId('expand-Expiry date')).toBeInTheDocument();
      expect(screen.getByTestId('expand-item-Quote ID')).toHaveTextContent('quote-1');
      expect(screen.getByTestId('expand-item-Quote Payment')).toHaveTextContent('pay-1');
    });

    it('filters out a missing quote payment', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        quote: {
          id: 'quote-1',
          expiration: new Date('2026-12-01T12:00:00.000Z'),
          payment: undefined,
        },
      });

      renderScreen();

      expect(screen.getByTestId('expand-item-Quote ID')).toBeInTheDocument();
      expect(screen.queryByTestId('expand-item-Quote Payment')).not.toBeInTheDocument();
    });

    it('renders the QR row inside the details table when displayQr is false', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayQr: false });

      renderScreen();

      expect(screen.getByTestId('expand-QR Code')).toBeInTheDocument();
      expect(within(screen.getByTestId('expand-QR Code')).getByTestId('qr-basic')).toHaveTextContent('ocp:pl-1');
    });

    it('renders the big QR when displayQr is true on the OpenCryptoPay path', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayQr: true });

      renderScreen();

      expect(screen.queryByTestId('expand-QR Code')).not.toBeInTheDocument();
      expect(screen.getByTestId('qr-basic')).toHaveTextContent('ocp:pl-1');
      expect(screen.getByText('Scan the QR-Code with a compatible app to complete the payment.')).toBeInTheDocument();
    });
  });

  describe('transfer amounts', () => {
    const sharedAmounts = [
      {
        method: 'Ethereum',
        minFee: 0,
        assets: [
          { asset: 'USDC', amount: 10 },
          { asset: 'ETH', amount: null },
          { asset: 'BTC', amount: '1.5.' },
        ],
      },
      {
        method: 'Polygon',
        minFee: 0,
        assets: [{ asset: 'USDC', amount: 10 }],
      },
      {
        method: 'Lightning',
        minFee: 0,
        available: false,
        assets: [{ asset: 'BTC', amount: 1 }],
      },
    ];

    it('shows transfer amounts with a shared asset, a null amount and a trailing dot', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ transferAmounts: sharedAmounts });

      renderScreen();

      expect(screen.getByTestId('expand-Payment Methods')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('USDC')).toBeInTheDocument();
      expect(screen.getByText('Ethereum, Polygon')).toBeInTheDocument();
      expect(screen.getByText('ETH')).toBeInTheDocument();
      expect(screen.getByText('1.5')).toBeInTheDocument();
      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.queryByText('Lightning')).not.toBeInTheDocument();
    });

    it('hides amounts in merchant mode', () => {
      mockPaymentLinkContext.isMerchantMode = true;
      mockPaymentLinkContext.merchant = 'Shop';
      mockPaymentLinkContext.payRequest = quotedPayRequest({ transferAmounts: sharedAmounts });

      renderScreen();

      expect(screen.getByText('USDC')).toBeInTheDocument();
      expect(screen.queryByText('10')).not.toBeInTheDocument();
      expect(screen.queryByText('1.5')).not.toBeInTheDocument();
    });

    it('renders nothing for an empty asset map', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        transferAmounts: [
          {
            method: 'Ethereum',
            minFee: 0,
            available: false,
            assets: [{ asset: 'USDC', amount: 10 }],
          },
        ],
      });

      renderScreen();

      expect(screen.getByTestId('expand-Payment Methods')).toBeInTheDocument();
      expect(screen.queryByText('USDC')).not.toBeInTheDocument();
    });

    it('hides the payment methods row when transferAmounts is absent and not merchant mode', () => {
      const request = terminalPayRequest({ mode: PaymentLinkMode.SINGLE });
      delete request.transferAmounts;
      mockPaymentLinkContext.payRequest = request;
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(screen.queryByTestId('expand-Payment Methods')).not.toBeInTheDocument();
    });

    it('reaches payment methods in the details table when the key is missing in merchant mode', () => {
      const request = terminalPayRequest({
        mode: PaymentLinkMode.SINGLE,
        recipient: { name: 'Bob' },
      });
      delete request.transferAmounts;
      mockPaymentLinkContext.payRequest = request;
      mockPaymentLinkContext.isMerchantMode = true;
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      const errors: Error[] = [];
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        render(
          <TransferMethodsErrorBoundary onError={(error) => errors.push(error)}>
            <PaymentLinkScreen />
          </TransferMethodsErrorBoundary>,
        );

        expect(screen.getByTestId('transfer-methods-error')).toBeInTheDocument();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(TypeError);
        expect(errors[0].message).toMatch(/filter/);
      } finally {
        consoleError.mockRestore();
      }
    });

    it('reaches payment methods in the wallet branch when the key is missing in merchant mode', async () => {
      const request = terminalPayRequest({
        mode: PaymentLinkMode.SINGLE,
        recipient: undefined,
      });
      delete request.transferAmounts;
      mockPaymentLinkContext.payRequest = request;
      mockPaymentLinkContext.isMerchantMode = true;
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockWalletsHook.recommendedWallets = [wallet({ id: 7 })];
      mockSearchParams = new URLSearchParams('wallet-id=7');

      const errors: Error[] = [];
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        render(
          <TransferMethodsErrorBoundary onError={(error) => errors.push(error)}>
            <PaymentLinkScreen />
          </TransferMethodsErrorBoundary>,
        );

        await waitFor(() => {
          expect(screen.getByTestId('transfer-methods-error')).toBeInTheDocument();
        });
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(TypeError);
        expect(errors[0].message).toMatch(/map/);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe('exchange rate', () => {
    function setupRate(
      overrides: {
        amount?: number | null;
        asset?: string;
        requested?: number;
        minutes?: number;
        seconds?: number;
      } = {},
    ): void {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        requestedAmount: { asset: 'CHF', amount: overrides.requested ?? 20 },
        transferAmounts: [
          {
            method: 'Ethereum',
            minFee: 0,
            assets: [{ asset: 'USDC', amount: overrides.amount }],
          },
        ],
      });
      mockWatchValues = {
        paymentStandard: payToAddressStandard,
        asset: 'asset' in overrides ? overrides.asset : 'USDC',
      };
      mockPaymentLinkContext.timer = {
        minutes: overrides.minutes ?? 1,
        seconds: overrides.seconds ?? 30,
      };
    }

    it('formats the rate when the transfer amount is greater than 0', () => {
      setupRate({ amount: 10 });

      renderScreen();

      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ rate: '2.00', currency: 'CHF', asset: 'USDC', timer: '1m 30s' }),
      );
      expect(screen.getByTestId('exchange-rate')).toHaveAttribute('data-loading', 'false');
    });

    it('uses N/A when the transfer amount is 0', () => {
      setupRate({ amount: 0 });

      renderScreen();

      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ rate: 'N/A' }),
      );
    });

    it('uses N/A when the transfer amount is missing', () => {
      setupRate({ amount: null });

      renderScreen();

      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ rate: 'N/A' }),
      );
    });

    it('uses N/A when the requested amount is missing', () => {
      setupRate({ amount: 10, requested: 0 });

      renderScreen();

      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ rate: 'N/A' }),
      );
    });

    it('uses N/A when selectedAsset is missing', () => {
      setupRate({ asset: undefined });

      renderScreen();

      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ rate: 'N/A', asset: '' }),
      );
    });

    it('marks the exchange-rate sentence as loading when the timer is both zero', () => {
      setupRate({ minutes: 0, seconds: 0 });

      renderScreen();

      expect(screen.getByTestId('exchange-rate')).toHaveAttribute('data-loading', 'true');
      expect(mockTranslate).toHaveBeenCalledWith(
        'screens/payment',
        'The exchange rate of {{rate}} {{currency}}/{{asset}} is fixed for {{timer}}, after which it will be recalculated.',
        expect.objectContaining({ timer: '0m 0s' }),
      );
    });

    it('is not loading when only seconds are non-zero', () => {
      setupRate({ minutes: 0, seconds: 5 });

      renderScreen();

      expect(screen.getByTestId('exchange-rate')).toHaveAttribute('data-loading', 'false');
    });
  });

  describe('MetaMask', () => {
    it('shows MetaMask error text', () => {
      mockPaymentLinkContext.metaMaskError = 'Please connect MetaMask';

      renderScreen();

      expect(screen.getByText('Please connect MetaMask')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument();
    });

    it('calls payWithMetaMask from the info pay button', () => {
      mockPaymentLinkContext.metaMaskInfo = {
        transferAmount: 3,
        transferAsset: { name: 'USDC', blockchain: 'Ethereum' },
      };

      renderScreen();

      const pay = screen.getByRole('button', { name: 'Pay' });
      expect(pay).toHaveAttribute('data-loading', 'false');
      fireEvent.click(pay);
      expect(mockPayWithMetaMask).toHaveBeenCalled();
    });

    it('calls payWithMetaMask while isMetaMaskPaying', () => {
      mockPaymentLinkContext.metaMaskInfo = {
        transferAmount: 3,
        transferAsset: { name: 'USDC', blockchain: 'Ethereum' },
      };
      mockPaymentLinkContext.isMetaMaskPaying = true;

      renderScreen();

      const pay = screen.getByRole('button', { name: 'Pay' });
      expect(pay).toHaveAttribute('data-loading', 'true');
      fireEvent.click(pay);
      expect(mockPayWithMetaMask).toHaveBeenCalled();
    });
  });

  describe('OpenCryptoPay path', () => {
    it('renders the quoted OpenCryptoPay path with the scan sentence', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayQr: true });

      renderScreen();

      expect(screen.getByText('Scan the QR-Code with a compatible app to complete the payment.')).toBeInTheDocument();
    });

    it('renders the OpenCryptoPay path when that standard is selected', () => {
      mockWatchValues = { paymentStandard: openCryptoPayStandard };
      mockPaymentLinkContext.payRequest = quotedPayRequest({ displayQr: true });

      renderScreen();

      expect(screen.getByText('Scan the QR-Code with a compatible app to complete the payment.')).toBeInTheDocument();
    });

    it('renders an empty paragraph without a quote in public mode', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = NoPaymentLinkPaymentStatus.NO_PAYMENT;

      renderScreen();

      expect(
        screen.queryByText('Scan the QR-Code with a compatible app to complete the payment.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          'Tell the cashier that you want to pay with crypto and then scan the QR-Code with a compatible app to complete the payment.',
        ),
      ).not.toBeInTheDocument();
    });

    it('renders the cashier sentence without a quote in non-public mode', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest({ mode: PaymentLinkMode.SINGLE });
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(
        screen.getByText(
          'Tell the cashier that you want to pay with crypto and then scan the QR-Code with a compatible app to complete the payment.',
        ),
      ).toBeInTheDocument();
    });

    it('hides the OpenCryptoPay path when another standard is selected', () => {
      mockWatchValues = { paymentStandard: lightningStandard };
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(
        screen.queryByText('Scan the QR-Code with a compatible app to complete the payment.'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('RECOMMENDED APPS')).not.toBeInTheDocument();
    });

    it('opens the OpenCryptoPay learn-more URL', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      fireEvent.click(screen.getByRole('button', { name: 'Learn more about OpenCryptoPay' }));
      expect(mockOpen).toHaveBeenCalledWith('https://opencryptopay.io', '_blank');
    });
  });

  describe('wallet selected', () => {
    async function selectWallet(overrides: Partial<WalletLike> = {}): Promise<void> {
      const selected = wallet({ id: 7, ...overrides });
      mockWalletsHook.recommendedWallets = [selected];
      mockSearchParams = new URLSearchParams('wallet-id=7');
      renderScreen();
      await waitFor(() => {
        expect(mockSetSearchParams).toHaveBeenCalled();
      });
    }

    it('clears the selected wallet on the back button', async () => {
      await selectWallet({ hasActionDeepLink: true, deepLink: 'wallet://pay' });
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';

      fireEvent.click(screen.getByTestId('dfx-icon-back').closest('button') as HTMLButtonElement);

      expect(screen.queryByTestId('dfx-icon-back')).not.toBeInTheDocument();
      expect(screen.getByText('RECOMMENDED APPS')).toBeInTheDocument();
    });

    it('does not show the deeplink spinner when the wallet is inactive while the deeplink loads', async () => {
      let resolveDeeplink: (value: string) => void = () => undefined;
      mockGetDeeplinkByWalletId.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveDeeplink = resolve;
        }),
      );
      mockWalletsHook.recommendedWallets = [wallet({ id: 7, active: false })];
      mockSearchParams = new URLSearchParams('wallet-id=7');

      renderScreen();

      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

      await act(async () => {
        resolveDeeplink('wallet://pay');
        await Promise.resolve();
      });
    });

    it('shows a deeplink loading spinner when the wallet is active', async () => {
      let resolveDeeplink: (value: string) => void = () => undefined;
      mockGetDeeplinkByWalletId.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveDeeplink = resolve;
        }),
      );
      mockWalletsHook.recommendedWallets = [wallet({ id: 7, active: true })];
      mockSearchParams = new URLSearchParams('wallet-id=7');
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';

      renderScreen();

      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      await act(async () => {
        resolveDeeplink('wallet://pay');
        await Promise.resolve();
      });
    });

    it('labels the pay button Pay in app when hasActionDeepLink is true', async () => {
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';
      await selectWallet({ hasActionDeepLink: true });

      const pay = screen.getByRole('button', { name: 'Pay in app' });
      fireEvent.click(pay);
      expect(mockOpen).toHaveBeenCalledWith('wallet://pay', '_blank');
    });

    it('labels the pay button scan-again when hasActionDeepLink is missing', async () => {
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';
      await selectWallet({ hasActionDeepLink: false });

      expect(screen.getByRole('button', { name: 'Open app and scan QR code again' })).toBeInTheDocument();
    });

    it('hides the pay button when deepLink is missing', async () => {
      mockGetDeeplinkByWalletId.mockResolvedValue(undefined);
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';
      await selectWallet();

      expect(screen.queryByRole('button', { name: 'Pay in app' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open app and scan QR code again' })).not.toBeInTheDocument();
    });

    it('hides the pay button when paymentIdentifier is missing', async () => {
      mockPaymentLinkContext.paymentIdentifier = undefined;
      await selectWallet({ hasActionDeepLink: true });

      expect(screen.queryByRole('button', { name: 'Pay in app' })).not.toBeInTheDocument();
    });

    it('hides the pay button when the pay request has no quote', async () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';
      await selectWallet({ hasActionDeepLink: true });

      expect(screen.queryByRole('button', { name: 'Pay in app' })).not.toBeInTheDocument();
    });

    it('hides the pay button when the wallet is not active', async () => {
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';
      await selectWallet({ hasActionDeepLink: true, active: false });

      expect(screen.queryByRole('button', { name: 'Pay in app' })).not.toBeInTheDocument();
    });

    it('hides the website button for public mode', async () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ mode: PaymentLinkMode.PUBLIC });
      await selectWallet({ websiteUrl: 'https://wallet.example' });

      expect(screen.queryByRole('button', { name: 'Open website' })).not.toBeInTheDocument();
    });

    it('shows the website button in non-public mode and opens it', async () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ mode: PaymentLinkMode.SINGLE });
      await selectWallet({ websiteUrl: 'https://wallet.example' });

      fireEvent.click(screen.getByRole('button', { name: 'Open website' }));
      expect(mockOpen).toHaveBeenCalledWith('https://wallet.example', '_blank');
    });

    it('renders store badges when urls exist', async () => {
      await selectWallet({
        playStoreUrl: 'https://play.example/w',
        appStoreUrl: 'https://app.example/w',
      });

      expect(screen.getByTestId(`badge-${BadgeType.PLAY_STORE}`)).toHaveTextContent('https://play.example/w');
      expect(screen.getByTestId(`badge-${BadgeType.APP_STORE}`)).toHaveTextContent('https://app.example/w');
      expect(screen.getByTestId(`badge-${BadgeType.PLAY_STORE}`).parentElement).not.toHaveAttribute('hidden');
    });

    it('hides the store-badge container when both urls are missing', async () => {
      await selectWallet();

      expect(screen.getByTestId(`badge-${BadgeType.PLAY_STORE}`).parentElement).toHaveAttribute('hidden');
    });

    it('filters transfer methods by the selected wallet', async () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        transferAmounts: [
          {
            method: 'Ethereum',
            minFee: 0,
            assets: [{ asset: 'USDC', amount: 10 }],
          },
          {
            method: 'Polygon',
            minFee: 0,
            assets: [{ asset: 'USDC', amount: 10 }],
          },
        ],
      });
      await selectWallet({ supportedMethods: ['Ethereum'] });

      const methods = screen.getAllByTestId('collapsible').find((node) => {
        const text = node.textContent;
        return Boolean(text && text.includes('Payment Methods') && !text.includes('Payment details'));
      });
      expect(methods).toHaveTextContent('Ethereum');
      expect(methods).not.toHaveTextContent('Polygon');
    });
  });

  describe('wallet grid', () => {
    it('navigates with /pl and wallet-id when a grid wallet is clicked', () => {
      mockWalletsHook.recommendedWallets = [wallet({ id: 42, name: 'Cake' })];
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      fireEvent.click(screen.getByText('Cake'));
      expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/pl', search: '?wallet-id=42' });
    });

    it('renders nothing for an empty wallet list', () => {
      mockWalletsHook.recommendedWallets = [];
      mockWalletsHook.otherWallets = [wallet({ id: 2, name: 'OtherWallet' })];
      mockWalletsHook.semiCompatibleWallets = [];
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.queryByText('RECOMMENDED APPS')).not.toBeInTheDocument();
      expect(screen.getByText('COMPATIBLE APPS')).toBeInTheDocument();
      expect(screen.getByText('OtherWallet')).toBeInTheDocument();
    });

    it('renders a grid header when one is provided', () => {
      mockWalletsHook.recommendedWallets = [wallet()];
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.getByText('RECOMMENDED APPS')).toBeInTheDocument();
    });

    it('omits the divider header when the translated header is empty', () => {
      mockTranslate.mockImplementation((_ns: string, key: string) => (key === 'Recommended apps' ? '' : key));
      mockWalletsHook.recommendedWallets = [wallet({ name: 'NoHeaderWallet' })];
      mockPaymentLinkContext.payRequest = quotedPayRequest();

      renderScreen();

      expect(screen.getByText('NoHeaderWallet')).toBeInTheDocument();
      expect(screen.queryByText('RECOMMENDED APPS')).not.toBeInTheDocument();
    });
  });

  describe('wallet-id search param', () => {
    it('selects the wallet, resolves the deeplink and deletes wallet-id', async () => {
      mockWalletsHook.recommendedWallets = [];
      mockWalletsHook.otherWallets = [];
      mockWalletsHook.semiCompatibleWallets = [wallet({ id: 9, name: 'SemiWallet' })];
      mockGetDeeplinkByWalletId.mockResolvedValue('semi://pay');
      mockSearchParams = new URLSearchParams('wallet-id=9');
      mockPaymentLinkContext.paymentIdentifier = 'lnurl1abc';

      renderScreen();

      await waitFor(() => {
        expect(mockGetDeeplinkByWalletId).toHaveBeenCalledWith(9);
      });
      expect(screen.getByTestId('dfx-icon-back')).toBeInTheDocument();
      expect(mockSetSearchParams).toHaveBeenCalled();
      const nextParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams;
      expect(nextParams.has('wallet-id')).toBe(false);
    });

    it('does nothing for an unknown wallet id', () => {
      mockWalletsHook.recommendedWallets = [wallet({ id: 1 })];
      mockSearchParams = new URLSearchParams('wallet-id=99');

      renderScreen();

      expect(mockGetDeeplinkByWalletId).not.toHaveBeenCalled();
      expect(screen.queryByTestId('dfx-icon-back')).not.toBeInTheDocument();
    });

    it('clears the selected wallet when status is CANCELLED', async () => {
      mockWalletsHook.recommendedWallets = [wallet({ id: 7 })];
      mockSearchParams = new URLSearchParams('wallet-id=7');

      const view = renderScreen();
      await waitFor(() => {
        expect(mockSetSearchParams).toHaveBeenCalled();
        expect(screen.getByTestId('dfx-icon-back')).toBeInTheDocument();
      });

      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.CANCELLED;
      view.rerender(<PaymentLinkScreen />);

      expect(screen.queryByTestId('dfx-icon-back')).not.toBeInTheDocument();
    });

    it('clears the selected wallet when status is EXPIRED', async () => {
      mockWalletsHook.recommendedWallets = [wallet({ id: 7 })];
      mockSearchParams = new URLSearchParams('wallet-id=7');

      const view = renderScreen();
      await waitFor(() => {
        expect(mockSetSearchParams).toHaveBeenCalled();
        expect(screen.getByTestId('dfx-icon-back')).toBeInTheDocument();
      });

      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.EXPIRED;
      view.rerender(<PaymentLinkScreen />);

      expect(screen.queryByTestId('dfx-icon-back')).not.toBeInTheDocument();
    });
  });

  describe('standard-sync effect', () => {
    it('returns immediately when there is no quote', () => {
      mockPaymentLinkContext.payRequest = terminalPayRequest();
      mockPaymentLinkContext.paymentStatus = PaymentLinkPaymentStatus.PENDING;

      renderScreen();

      expect(mockSetSessionApiUrl).not.toHaveBeenCalled();
      expect(mockFetchPayRequest).not.toHaveBeenCalled();
      expect(mockFetchPaymentIdentifier).not.toHaveBeenCalled();
    });

    it('rewrites the session URL when the URL has no standard', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = { current: API_URL };
      mockPaymentLinkContext.callbackUrl = { current: 'https://callback.example.com/prev' };
      mockWatchValues = {};

      renderScreen();

      expect(mockSetSessionApiUrl).toHaveBeenCalledWith(`${API_URL}?standard=${PaymentStandardType.OPEN_CRYPTO_PAY}`);
      expect(mockFetchPayRequest).toHaveBeenCalledWith(`${API_URL}?standard=${PaymentStandardType.OPEN_CRYPTO_PAY}`);
      expect(mockSetPaymentIdentifier).toHaveBeenCalledWith(undefined);
      expect(mockPaymentLinkContext.callbackUrl.current).toBeUndefined();
      expect(mockSetValue).toHaveBeenCalledWith('asset', undefined);
      expect(mockFetchPaymentIdentifier).not.toHaveBeenCalled();
    });

    it('rewrites the session URL when the selected standard differs from the URL standard', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.OPEN_CRYPTO_PAY}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard };

      renderScreen();

      expect(mockSetSessionApiUrl).toHaveBeenCalledWith(`${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`);
      expect(mockFetchPayRequest).toHaveBeenCalledWith(`${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`);
    });

    it('fetches the payment identifier using the selected asset when the URL standard matches', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'USDC' };

      renderScreen();

      expect(mockFetchPayRequest).not.toHaveBeenCalled();
      expect(mockFetchPaymentIdentifier).toHaveBeenCalledWith(mockPaymentLinkContext.payRequest, 'Ethereum', 'USDC');
    });

    it('fetches the payment identifier using the first asset of the selected blockchain when none is selected', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        transferAmounts: [
          {
            method: 'Ethereum',
            minFee: 0,
            assets: [
              { asset: 'ETH', amount: 1 },
              { asset: 'USDC', amount: 10 },
            ],
          },
        ],
      });
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard };

      renderScreen();

      expect(mockFetchPaymentIdentifier).toHaveBeenCalledWith(mockPaymentLinkContext.payRequest, 'Ethereum', 'ETH');
    });
  });

  describe('asset-default effect', () => {
    it('sets paymentStandard when none is selected', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentStandards = [openCryptoPayStandard, payToAddressStandard];
      mockWatchValues = {};

      renderScreen();

      expect(mockSetValue).toHaveBeenCalledWith('paymentStandard', openCryptoPayStandard);
    });

    it('sets asset to the first asset when the current asset is missing', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard };

      renderScreen();

      expect(mockSetValue).toHaveBeenCalledWith('asset', 'USDC');
    });

    it('sets asset to the first asset when the current asset is not in the list', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'DOGE' };

      renderScreen();

      expect(mockSetValue).toHaveBeenCalledWith('asset', 'USDC');
    });

    it('does not set asset when the list is empty', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        transferAmounts: [{ method: 'Ethereum', minFee: 0, assets: [] }],
      });
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard };

      renderScreen();

      expect(mockSetValue).not.toHaveBeenCalledWith('asset', expect.anything());
    });

    it('does not set asset when the current asset is already in the list', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest();
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'USDC' };

      renderScreen();

      expect(mockSetValue).not.toHaveBeenCalledWith('asset', 'USDC');
    });
  });

  describe('asset-object effect', () => {
    it('sets the asset from assets.get when both asset and blockchain exist', () => {
      mockAssetsList = [
        {
          name: 'USDC',
          chainId: '0xToken',
          explorerUrl: 'https://etherscan.io/token/0xToken',
          decimals: 6,
        },
      ];
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        standard: PaymentStandardType.PAY_TO_ADDRESS,
      });
      mockPaymentLinkContext.paymentIdentifier = EVM_URI;
      mockPaymentLinkContext.paymentLinkApiUrl = {
        current: `${API_URL}?standard=${PaymentStandardType.PAY_TO_ADDRESS}`,
      };
      mockWatchValues = { paymentStandard: payToAddressStandard, asset: 'USDC' };

      renderScreen();

      expect(mockAssetsGet).toHaveBeenCalledWith('Ethereum');
      expect(screen.getByTestId('row-Asset')).toHaveTextContent('USDC');
    });

    it('clears the asset object when blockchain is missing', () => {
      mockAssetsList = [{ name: 'USDC', chainId: '0xToken', decimals: 6 }];
      mockPaymentLinkContext.payRequest = quotedPayRequest({
        standard: PaymentStandardType.PAY_TO_ADDRESS,
      });
      mockPaymentLinkContext.paymentIdentifier = EVM_URI;
      mockWatchValues = { paymentStandard: payToAddressNoChain, asset: 'USDC' };

      renderScreen();

      expect(screen.queryByTestId('row-Asset')).not.toBeInTheDocument();
    });
  });

  describe('layout and public filter statuses', () => {
    it('calls useLayoutOptions without a back button', () => {
      renderScreen();

      expect(mockUseLayoutOptions).toHaveBeenCalledWith({ backButton: false, smallMenu: true });
    });

    it('passes cancelled and no-payment filter statuses in public mode', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ mode: PaymentLinkMode.PUBLIC });

      renderScreen();

      expect(screen.getByTestId('payment-status-tile')).toHaveAttribute(
        'data-filters',
        JSON.stringify([PaymentLinkPaymentStatus.CANCELLED, NoPaymentLinkPaymentStatus.NO_PAYMENT]),
      );
    });

    it('passes an empty filter list in non-public mode', () => {
      mockPaymentLinkContext.payRequest = quotedPayRequest({ mode: PaymentLinkMode.SINGLE });

      renderScreen();

      expect(screen.getByTestId('payment-status-tile')).toHaveAttribute('data-filters', '[]');
    });
  });
});
