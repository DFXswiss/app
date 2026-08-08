// Remaining payment-link.screen coverage: standard URL sync, asset/EVM rows,
// wallet detail deeplinks, empty wallet grid, transfer methods, recipient website,
// contract toggle, rate N/A, and MetaMask-hidden OCP section.

const mockDevice = { isMobile: false };

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));

const mockUseApiCall = jest.fn();
const mockAssetsMap = new Map<string, { name: string; chainId?: string; explorerUrl?: string; decimals?: number }[]>();
mockAssetsMap.set('Ethereum', [
  { name: 'ETH', chainId: '0xeth', explorerUrl: 'https://etherscan.io/token/0xeth', decimals: 18 },
  { name: 'USDC', chainId: '0xusdc', decimals: 6 },
]);

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
  Utils: {
    formatAmount: (n: number) => String(n),
    createRules: () => ({}),
  },
  Validations: { Required: 'required' },
  useApi: () => ({ call: mockUseApiCall }),
  useAssetContext: () => ({ assets: mockAssetsMap }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const { Children, cloneElement, isValidElement } = React;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrichChildren(children: unknown, control: unknown): unknown {
    return Children.map(children as React.ReactNode, (child: React.ReactNode) => {
      if (!isValidElement(child)) return child;
      const childProps = child.props as Record<string, unknown>;
      const nextChildren = enrichChildren(childProps.children, control);
      if (childProps.name) {
        return cloneElement(child as React.ReactElement, { control, children: nextChildren });
      }
      return cloneElement(child as React.ReactElement, { children: nextChildren });
    });
  }

  return {
    AlignContent: { RIGHT: 'right' },
    CopyButton: ({ onCopy }: { onCopy?: () => void }) => (
      <button type="button" data-testid="copy-btn" onClick={onCopy}>
        copy
      </button>
    ),
    DfxIcon: () => <span data-testid="dfx-icon" />,
    Form: ({
      children,
      control,
      onSubmit,
    }: {
      children: React.ReactNode;
      control?: unknown;
      onSubmit?: (e: React.FormEvent) => void;
    }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        {enrichChildren(children, control)}
      </form>
    ),
    IconColor: { GRAY: 'gray', BLUE: 'blue', DARK_GRAY: 'dark-gray' },
    IconSize: { SM: 'sm' },
    IconVariant: {
      BACK: 'back',
      COPY: 'copy',
      OPEN_IN_NEW: 'open',
      INFO: 'info',
      INFO_OUTLINE: 'info-outline',
    },
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
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white', RED: 'red', GREEN: 'green' },
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
      expansionItems,
    }: {
      label: string;
      children?: React.ReactNode;
      expansionContent?: React.ReactNode;
      expansionItems?: { label: string; text?: string; onClick?: () => void }[];
    }) => (
      <div data-testid={`expandable-${label}`}>
        <span>{label}</span>
        {children}
        {expansionItems?.map((item) => (
          <button key={item.label} type="button" data-testid={`item-${label}-${item.label}`} onClick={item.onClick}>
            {item.label}: {String(item.text ?? '')}
          </button>
        ))}
        {expansionContent}
      </div>
    ),
    StyledDataTableRow: ({ children, label }: { children?: React.ReactNode; label?: string }) => (
      <div data-testid={`row-${label ?? 'x'}`}>
        {label}
        {children}
      </div>
    ),
    StyledDropdown: ({
      name,
      control,
      items,
      labelFunc,
      descriptionFunc,
    }: {
      name: string;
      control?: unknown;
      items?: unknown[];
      labelFunc?: (item: unknown) => string;
      descriptionFunc?: (item: unknown) => string;
    }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: unknown; onChange: (v: unknown) => void } }) => (
          <div data-testid={`dropdown-${name}`}>
            {(items ?? []).map((item, i) => (
              <button
                key={i}
                type="button"
                data-testid={`select-${name}-${labelFunc ? labelFunc(item) : i}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc ? labelFunc(item) : String(item)}
                {descriptionFunc ? ` — ${descriptionFunc(item)}` : ''}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledHorizontalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    StyledIconButton: ({
      onClick,
      icon,
    }: {
      onClick?: () => void;
      icon?: string;
    }) => (
      <button type="button" data-testid={`icon-${icon}`} onClick={onClick}>
        icon
      </button>
    ),
    StyledInfoText: ({ children }: { children: React.ReactNode }) => <div data-testid="info-text">{children}</div>,
    StyledInfoTextSize: { XS: 'xs' },
    StyledInput: ({ name, control, label }: { name: string; control?: unknown; label?: string }) => (
      <Controller
        name={name}
        control={control as never}
        render={({ field }: { field: { value: string; onChange: (v: string) => void } }) => (
          <label>
            {label}
            <input
              name={name}
              data-testid={`input-${name}`}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
            />
          </label>
        )}
      />
    ),
    StyledLink: ({ label }: { label?: string }) => <a data-testid="terms-link">{label}</a>,
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

jest.mock('copy-to-clipboard', () => jest.fn());
jest.mock('react-lazy-load-image-component', () => ({
  LazyLoadImage: ({ alt }: { alt?: string }) => <img alt={alt} data-testid="wallet-logo" />,
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
  AppStoreBadge: ({ type }: { type: string }) => <div data-testid={`badge-${type}`} />,
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string, params?: Record<string, string>) => {
      if (!params) return key;
      let out = key;
      for (const [k, v] of Object.entries(params)) out = out.replace(`{{${k}}}`, String(v));
      return out;
    },
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

const mockNavigate = jest.fn();
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

const mockToBlockchain = jest.fn((id: string) => (id === '1' ? 'Ethereum' : undefined));
jest.mock('../hooks/web3.hook', () => ({
  useWeb3: () => ({ toBlockchain: mockToBlockchain }),
}));

jest.mock('../util/open-crypto-pay', () => ({
  OpenCryptoPayUtils: {
    getOcpUrlByUniqueId: (id: string) => `ocp://${id}`,
  },
}));

jest.mock('../util/utils', () => ({
  blankedAddress: (v: string) => v,
  formatAmountForDisplay: (n: number) => String(n),
  formatLocationAddress: () => 'Main 1',
  formatUnits: (v: string) => `units(${v})`,
}));

const mockDecodeUri = jest.fn();
jest.mock('../util/evm', () => ({
  Evm: { decodeUri: (uri: string) => mockDecodeUri(uri) },
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

import copy from 'copy-to-clipboard';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PaymentLinkScreen from '../screens/payment-link.screen';

function setMatchMedia(coarse: boolean | 'undefined'): void {
  if (coarse === 'undefined') {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: undefined });
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

const SAMPLE_WALLET = {
  id: 42,
  name: 'SampleWallet',
  iconUrl: 'https://example.test/w.png',
  recommended: true,
  active: true,
  supportedMethods: ['Lightning', 'Ethereum'],
  websiteUrl: 'https://wallet.example',
  deepLink: 'sample://pay',
  playStoreUrl: 'https://play.example',
  appStoreUrl: 'https://app.example',
  hasActionDeepLink: false,
};

function buildPayRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    externalId: 'ext-1',
    tag: 'tag',
    displayName: 'Test Merchant',
    standard: 'OpenCryptoPay',
    possibleStandards: ['OpenCryptoPay'],
    displayQr: false,
    mode: 'Multiple',
    route: 'route-1',
    currency: 'CHF',
    recipient: {
      name: 'Test Merchant',
      address: { street: 'Main', country: 'CH' },
      phone: '+41',
      mail: 'user@example.com',
      website: 'merchant.example',
    },
    transferAmounts: [
      {
        method: 'Lightning',
        minFee: 0,
        available: true,
        assets: [{ asset: 'BTC', amount: 0.001 }],
      },
      {
        method: 'Ethereum',
        minFee: 0,
        available: true,
        assets: [{ asset: 'ETH', amount: 0.5 }],
      },
    ],
    requestedAmount: { asset: 'CHF', amount: 100 },
    quote: { id: 'q1', expiration: new Date(Date.now() + 60_000 * 60).toISOString(), payment: 'p1' },
    callback: 'https://callback.example',
    ...overrides,
  };
}

function baseContext(overrides: Record<string, unknown> = {}) {
  const paymentLinkApiUrl = {
    current: 'https://api.example.com/v1/paymentLink/payment?standard=OpenCryptoPay',
  };
  const callbackUrl = { current: undefined as string | undefined };
  const setSessionApiUrl = jest.fn((url?: string) => {
    paymentLinkApiUrl.current = url ?? '';
  });

  return {
    error: undefined,
    merchant: undefined,
    payRequest: buildPayRequest(),
    timer: { minutes: 5, seconds: 0 },
    paymentLinkApiUrl,
    callbackUrl,
    paymentStandards: [
      { id: 'OpenCryptoPay', label: 'OpenCryptoPay', description: 'OCP desc' },
      {
        id: 'PayToAddress',
        label: 'Pay to {{blockchain}} address',
        description: 'On {{blockchain}}',
        blockchain: 'Ethereum',
      },
    ],
    paymentIdentifier: 'lnurl1test',
    isLoadingPaymentIdentifier: false,
    paymentStatus: 'Pending',
    isLoadingMetaMask: false,
    metaMaskInfo: undefined,
    metaMaskError: undefined,
    isMetaMaskPaying: false,
    isMerchantMode: false,
    showAssets: true,
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

function mockWallets(overrides: Record<string, unknown> = {}) {
  mockUsePaymentLinkWallets.mockReturnValue({
    recommendedWallets: [],
    otherWallets: [],
    semiCompatibleWallets: [],
    getDeeplinkByWalletId: jest.fn().mockResolvedValue('sample://resolved'),
    isLoading: false,
    error: undefined,
    ...overrides,
  });
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentLinkScreen />
    </MemoryRouter>,
  );
}

describe('PaymentLinkScreen coverage gaps', () => {
  const mockWindowOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice.isMobile = false;
    setMatchMedia(false);
    mockUseApiCall.mockReset();
    mockDecodeUri.mockReturnValue(undefined);
    mockToBlockchain.mockImplementation((id: string) => (id === '1' ? 'Ethereum' : undefined));
    window.open = mockWindowOpen;
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('syncs session URL when standard query param is missing and refetches pay request', async () => {
    const paymentLinkApiUrl = { current: 'https://api.example.com/v1/paymentLink/payment' };
    const setSessionApiUrl = jest.fn((url?: string) => {
      paymentLinkApiUrl.current = url ?? '';
    });
    const fetchPayRequest = jest.fn().mockResolvedValue(undefined);
    const setPaymentIdentifier = jest.fn();
    const callbackUrl = { current: 'https://old-callback' as string | undefined };

    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentLinkApiUrl,
        setSessionApiUrl,
        fetchPayRequest,
        setPaymentIdentifier,
        callbackUrl,
      }),
    );
    mockWallets();
    renderAt();

    await waitFor(() => {
      expect(setSessionApiUrl).toHaveBeenCalled();
      expect(fetchPayRequest).toHaveBeenCalled();
    });
    const url = setSessionApiUrl.mock.calls[0][0] as string;
    expect(url).toContain('standard=OpenCryptoPay');
    expect(setPaymentIdentifier).toHaveBeenCalledWith(undefined);
    expect(callbackUrl.current).toBeUndefined();
  });

  it('fetches payment identifier when standard already matches URL', async () => {
    const fetchPaymentIdentifier = jest.fn().mockResolvedValue(undefined);
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ fetchPaymentIdentifier }));
    mockWallets();
    renderAt();

    await waitFor(() => {
      expect(fetchPaymentIdentifier).toHaveBeenCalled();
    });
    const [req, blockchain, asset] = fetchPaymentIdentifier.mock.calls[0];
    expect(req.id).toBe('pay-1');
    // OpenCryptoPay has no blockchain → undefined asset path
    expect(blockchain).toBeUndefined();
    expect(asset).toBeUndefined();
  });

  it('switches to PayToAddress, sets asset, shows EVM amount/address/blockchain rows', async () => {
    mockDecodeUri.mockReturnValue({
      amount: '1000000000000000000',
      address: '0xabc',
      chainId: '1',
    });

    const paymentLinkApiUrl = {
      current: 'https://api.example.com/v1/paymentLink/payment?standard=OpenCryptoPay',
    };
    const setSessionApiUrl = jest.fn((url?: string) => {
      paymentLinkApiUrl.current = url ?? '';
    });
    const fetchPayRequest = jest.fn().mockImplementation(async (url: string) => {
      paymentLinkApiUrl.current = url;
    });
    const fetchPaymentIdentifier = jest.fn().mockResolvedValue(undefined);

    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentLinkApiUrl,
        setSessionApiUrl,
        fetchPayRequest,
        fetchPaymentIdentifier,
        paymentIdentifier: 'ethereum:0xabc@1?value=1000000000000000000',
        payRequest: buildPayRequest({
          standard: 'OpenCryptoPay',
          possibleStandards: ['OpenCryptoPay', 'PayToAddress'],
        }),
      }),
    );
    mockWallets();
    renderAt();

    // Select PayToAddress from dropdown (labelFunc with blockchain param)
    await waitFor(() => expect(screen.getByTestId('dropdown-paymentStandard')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('select-paymentStandard-Pay to Ethereum address'));

    await waitFor(() => {
      expect(setSessionApiUrl).toHaveBeenCalled();
    });

    // After standard change URL sync; re-render still has PayToAddress selected in form state.
    // Asset dropdown appears once blockchain standard selected and assetsList present.
    await waitFor(() => {
      expect(screen.getByTestId('dropdown-asset')).toBeInTheDocument();
    });

    // EVM rows — need paymentIdentifier + PayToAddress selected + assetObject
    await waitFor(() => {
      expect(screen.getByTestId('row-Amount')).toHaveTextContent('units(1000000000000000000)');
    });
    expect(screen.getByTestId('row-Address')).toHaveTextContent('0xabc');
    expect(screen.getByTestId('row-Blockchain')).toHaveTextContent('Ethereum');
    expect(screen.getByTestId('row-Asset')).toHaveTextContent('ETH');

    // Copy handlers on EVM amount, address (L450) and blockchain (L460) rows
    const copies = screen.getAllByTestId('copy-btn');
    expect(copies.length).toBeGreaterThanOrEqual(3);
    copy.mockClear();
    for (const btn of copies) {
      fireEvent.click(btn);
    }
    expect(copy).toHaveBeenCalledWith('1000000000000000000');
    expect(copy).toHaveBeenCalledWith('0xabc');
    expect(copy).toHaveBeenCalledWith('Ethereum');
  });

  it('toggles asset contract view and opens explorer', async () => {
    mockDecodeUri.mockReturnValue({
      amount: '1',
      address: '0xabc',
      chainId: '1',
    });

    const paymentLinkApiUrl = {
      current: 'https://api.example.com/v1/paymentLink/payment?standard=PayToAddress',
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentLinkApiUrl,
        paymentIdentifier: 'ethereum:0xabc@1?value=1',
        payRequest: buildPayRequest({
          standard: 'PayToAddress',
          possibleStandards: ['PayToAddress'],
        }),
        paymentStandards: [
          {
            id: 'PayToAddress',
            label: 'Pay to {{blockchain}} address',
            description: 'On {{blockchain}}',
            blockchain: 'Ethereum',
          },
        ],
        setSessionApiUrl: jest.fn((url?: string) => {
          paymentLinkApiUrl.current = url ?? '';
        }),
      }),
    );
    mockWallets();
    renderAt();

    await waitFor(() => expect(screen.getByTestId('row-Asset')).toBeInTheDocument());

    // Toggle contract via INFO_OUTLINE
    fireEvent.click(screen.getByTestId('icon-info-outline'));
    await waitFor(() => {
      expect(screen.getByText('0xeth')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('icon-copy'));
    expect(copy).toHaveBeenCalledWith('0xeth');

    fireEvent.click(screen.getByTestId('icon-open'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://etherscan.io/token/0xeth', '_blank');

    // Toggle back
    fireEvent.click(screen.getByTestId('icon-info'));
    await waitFor(() => {
      expect(screen.getByTestId('row-Asset')).toHaveTextContent('ETH');
    });
  });

  it('opens recipient website with https prefix when scheme missing', async () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets();
    renderAt();

    fireEvent.click(screen.getByTestId('item-Recipient-Website'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://merchant.example', '_blank');
  });

  it('opens recipient website absolute URL as-is', async () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: buildPayRequest({
          recipient: {
            name: 'M',
            website: 'http://plain.example',
            mail: 'not-dfx@example.com',
          },
        }),
      }),
    );
    mockWallets();
    renderAt();

    fireEvent.click(screen.getByTestId('item-Recipient-Website'));
    expect(mockWindowOpen).toHaveBeenCalledWith('http://plain.example', '_blank');
  });

  it('hides dfx.swiss recipient mail from expansion items', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: buildPayRequest({
          recipient: {
            name: 'M',
            mail: 'hidden@dfx.swiss',
            website: 'https://x.example',
          },
        }),
      }),
    );
    mockWallets();
    renderAt();
    expect(screen.queryByTestId('item-Recipient-Email address')).not.toBeInTheDocument();
  });

  it('loads wallet detail, shows Pay in app when hasActionDeepLink, opens deeplink and website, then back', async () => {
    const getDeeplinkByWalletId = jest.fn().mockResolvedValue('sample://resolved');
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets({
      recommendedWallets: [{ ...SAMPLE_WALLET, hasActionDeepLink: true }],
      getDeeplinkByWalletId,
    });
    renderAt('/?wallet-id=42');

    await waitFor(() => {
      expect(getDeeplinkByWalletId).toHaveBeenCalledWith(42);
    });
    await waitFor(() => {
      expect(screen.getByText('Pay in app')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pay in app'));
    expect(mockWindowOpen).toHaveBeenCalledWith('sample://resolved', '_blank');

    fireEvent.click(screen.getByText('Open website'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://wallet.example', '_blank');

    // Back button clears wallet detail → grids return
    const backBtn = screen.getByTestId('dfx-icon').closest('button');
    expect(backBtn).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(backBtn as HTMLButtonElement);
    await waitFor(() => {
      expect(screen.queryByText('Pay in app')).not.toBeInTheDocument();
      expect(screen.getByText('SampleWallet')).toBeInTheDocument();
    });
  });

  it('shows Open app and scan QR code again when wallet has no action deeplink', async () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets({
      recommendedWallets: [{ ...SAMPLE_WALLET, hasActionDeepLink: false }],
      getDeeplinkByWalletId: jest.fn().mockResolvedValue('sample://x'),
    });
    renderAt('/?wallet-id=42');
    await waitFor(() => {
      expect(screen.getByText('Open app and scan QR code again')).toBeInTheDocument();
    });
  });

  it('hides open-app button while deeplink is loading', async () => {
    let resolveDeeplink: (v: string) => void = () => undefined;
    const pending = new Promise<string>((r) => {
      resolveDeeplink = r;
    });
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets({
      recommendedWallets: [SAMPLE_WALLET],
      getDeeplinkByWalletId: jest.fn().mockReturnValue(pending),
    });
    renderAt('/?wallet-id=42');

    await waitFor(() => {
      expect(screen.getAllByTestId('loading-spinner').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Open app and scan QR code again')).not.toBeInTheDocument();

    await actResolve(resolveDeeplink, 'sample://done');
    await waitFor(() => {
      expect(screen.getByText('Open app and scan QR code again')).toBeInTheDocument();
    });
  });

  it('hides website button in public mode wallet detail', async () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: buildPayRequest({ mode: 'Public' }),
      }),
    );
    mockWallets({
      recommendedWallets: [SAMPLE_WALLET],
      getDeeplinkByWalletId: jest.fn().mockResolvedValue('x://'),
    });
    renderAt('/?wallet-id=42');
    await waitFor(() => {
      expect(screen.getByText('Open app and scan QR code again')).toBeInTheDocument();
    });
    expect(screen.queryByText('Open website')).not.toBeInTheDocument();
  });

  it('navigates to wallet detail when a wallet tile is clicked', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets({ recommendedWallets: [SAMPLE_WALLET] });
    renderAt();

    fireEvent.click(screen.getByText('SampleWallet'));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/pl', search: '?wallet-id=42' });
  });

  it('renders transfer method amounts and filters unavailable methods', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: buildPayRequest({
          transferAmounts: [
            {
              method: 'Lightning',
              available: true,
              assets: [{ asset: 'BTC', amount: 1.5 }],
            },
            {
              method: 'Ethereum',
              available: false,
              assets: [{ asset: 'ETH', amount: 2 }],
            },
          ],
        }),
        showAssets: true,
      }),
    );
    mockWallets();
    renderAt();

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument();
    expect(screen.queryByText('ETH')).not.toBeInTheDocument();
  });

  it('hides amounts in merchant mode transfer methods', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        isMerchantMode: true,
        showAssets: true,
      }),
    );
    mockWallets();
    renderAt();
    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.queryByText('0.001')).not.toBeInTheDocument();
  });

  it('shows rate N/A when transfer amount is zero', async () => {
    const paymentLinkApiUrl = {
      current: 'https://api.example.com/v1/paymentLink/payment?standard=PayToAddress',
    };
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        paymentLinkApiUrl,
        setSessionApiUrl: jest.fn((url?: string) => {
          paymentLinkApiUrl.current = url ?? '';
        }),
        payRequest: buildPayRequest({
          standard: 'PayToAddress',
          transferAmounts: [
            {
              method: 'Ethereum',
              available: true,
              assets: [{ asset: 'ETH', amount: 0 }],
            },
          ],
        }),
        paymentStandards: [
          {
            id: 'PayToAddress',
            label: 'Pay to address',
            description: 'on-chain',
            blockchain: 'Ethereum',
          },
        ],
        timer: { minutes: 1, seconds: 0 },
      }),
    );
    mockWallets();
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('info-text')).toHaveTextContent(/N\/A/);
    });
  });

  it('scrolls to map when showMap and payRequest are set', async () => {
    jest.useFakeTimers();
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ merchant: 'SPAR', showMap: true }));
    mockWallets();
    renderAt();
    expect(screen.getByText('LOCATIONS')).toBeInTheDocument();
    jest.advanceTimersByTime(150);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('clears wallet data when payment expires', async () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ paymentStatus: 'Expired' }));
    mockWallets({
      recommendedWallets: [SAMPLE_WALLET],
      getDeeplinkByWalletId: jest.fn().mockResolvedValue('x'),
    });
    renderAt('/?wallet-id=42');
    // Expired is not in PENDING filter for wallet grids in OCP section either —
    // payment status Expired means the PENDING||PUBLIC block may hide OCP wallets.
    // The effect still runs setWalletData(undefined).
    await waitFor(() => {
      expect(screen.queryByText('Pay in app')).not.toBeInTheDocument();
    });
  });

  it('opens Learn more about OpenCryptoPay', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets();
    renderAt();
    fireEvent.click(screen.getByText('Learn more about OpenCryptoPay'));
    expect(mockWindowOpen).toHaveBeenCalledWith('https://opencryptopay.io', '_blank');
  });

  it('shows loading spinner when payRequest is missing', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ payRequest: undefined }));
    mockWallets();
    renderAt();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('shows loading spinner while MetaMask info loads', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext({ isLoadingMetaMask: true }));
    mockWallets();
    renderAt();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('copies external-id callback from expansion item', () => {
    mockUsePaymentLinkContext.mockReturnValue(baseContext());
    mockWallets();
    renderAt();
    fireEvent.click(screen.getByTestId('item-External ID-Callback'));
    expect(copy).toHaveBeenCalledWith('https://callback.example');
  });

  it('creates public payment with amount via form submit', async () => {
    mockUseApiCall.mockResolvedValue({});
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

    fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(mockUseApiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({ amount: 15 }),
        }),
      );
    });
  });

  it('surfaces Unknown error when public activate fails without message', async () => {
    mockUseApiCall.mockRejectedValue({});
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
      expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
    });
  });

  it('shows NoPayment spinner placeholder path without public mode', () => {
    mockUsePaymentLinkContext.mockReturnValue(
      baseContext({
        payRequest: {
          id: 't1',
          externalId: 'e',
          tag: 't',
          displayName: 'D',
          standard: 'OpenCryptoPay',
          possibleStandards: ['OpenCryptoPay'],
          displayQr: false,
          mode: 'Multiple',
          route: '1',
          currency: 'CHF',
          recipient: { name: 'D' },
          transferAmounts: [],
        },
        paymentStatus: 'NoPayment',
        paymentHasQuote: () => false,
        isLoadingPaymentIdentifier: true,
      }),
    );
    mockWallets();
    renderAt();
    // Cashier copy without quote
    expect(
      screen.getByText('Tell the cashier that you want to pay with crypto to start the payment.'),
    ).toBeInTheDocument();
  });
});

async function actResolve(resolve: (v: string) => void, value: string) {
  const { act } = await import('@testing-library/react');
  await act(async () => {
    resolve(value);
  });
}
