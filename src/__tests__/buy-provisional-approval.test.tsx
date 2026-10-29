const mockReceiveFor = jest.fn();
const mockConfirmFor = jest.fn();
const mockUseAppParams = jest.fn();
const mockGetPersonalIbans = jest.fn();
const mockPersonalIban = jest.fn();
const mockRequestedPersonalIban = jest.fn();

const mockAssets = [
  { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public', blockchain: 'Ethereum', description: 'Bitcoin' },
];
const mockCurrencies = [
  { name: 'EUR', sellable: true },
  { name: 'CHF', sellable: true },
  { name: 'USD', sellable: true },
];
const mockFiatCurrencies = [{ name: 'EUR' }, { name: 'CHF' }];
const mockPrefCurrency = { name: 'CHF' };
const mockAssetsMap = new Map([['Ethereum', mockAssets]]);
const mockUser = { accountId: 1, kyc: { level: 0 } };
const mockGetAssets = () => mockAssets;
const mockGetAsset = (assets: any[], name: string) => assets.find((asset) => asset.name === name) ?? assets[0];
const mockIsSameAsset = () => false;
const mockGetCurrency = (currencies: any[], name: string) => currencies.find((currency) => currency.name === name);
const mockGetDefaultCurrency = (currencies: any[]) => currencies[0];

jest.mock('@dfx.swiss/react', () => {
  const buyInterface = {
    get currencies() {
      return mockCurrencies;
    },
    receiveFor: (...args: unknown[]) => mockReceiveFor(...args),
    confirmFor: (...args: unknown[]) => mockConfirmFor(...args),
    getPersonalIbans: (...args: unknown[]) => mockGetPersonalIbans(...args),
  };
  return {
    AssetCategory: { PUBLIC: 'Public', PRIVATE: 'Private' },
    FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
    PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
    VirtualIbanStatus: {
      RESERVED: 'Reserved',
      ACTIVE: 'Active',
      EXPIRED: 'Expired',
      DEACTIVATED: 'Deactivated',
    },
    TransactionError: {
      AMOUNT_TOO_LOW: 'AmountTooLow',
      AMOUNT_TOO_HIGH: 'AmountTooHigh',
      BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
      BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
      KYC_REQUIRED: 'KycRequired',
      KYC_DATA_REQUIRED: 'KycDataRequired',
      KYC_REQUIRED_INSTANT: 'KycRequiredInstant',
      LIMIT_EXCEEDED: 'LimitExceeded',
      NATIONALITY_NOT_ALLOWED: 'NationalityNotAllowed',
      PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
      VIDEO_IDENT_REQUIRED: 'VideoIdentRequired',
      IBAN_CURRENCY_MISMATCH: 'IbanCurrencyMismatch',
      TRADING_NOT_ALLOWED: 'TradingNotAllowed',
      RECOMMENDATION_REQUIRED: 'RecommendationRequired',
      EMAIL_REQUIRED: 'EmailRequired',
    },
    TransactionType: { BUY: 'Buy' },
    Utils: { formatAmount: (value: number) => String(value), createRules: () => ({}) },
    Validations: { Required: undefined },
    useAsset: () => ({
      getAsset: mockGetAsset,
      isSameAsset: mockIsSameAsset,
    }),
    useAssetContext: () => ({
      assets: mockAssetsMap,
      getAssets: mockGetAssets,
    }),
    useAuthContext: () => ({ session: undefined }),
    useBuy: () => buyInterface,
    useFiat: () => ({
      toSymbol: () => '',
      toDescription: () => '',
      getCurrency: mockGetCurrency,
      getDefaultCurrency: mockGetDefaultCurrency,
    }),
    useFiatContext: () => ({ currencies: mockFiatCurrencies }),
    useSessionContext: () => ({ logout: jest.fn() }),
    useUserContext: () => ({ user: mockUser, isUserLoading: false }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrich(elements: any, control: any): any {
    if (!elements) return elements;
    return React.Children.map(elements, (element: any) => {
      if (!React.isValidElement(element)) return element;
      const children = enrich(element.props.children, control);
      return React.cloneElement(element, element.props.name ? { control, children } : { children });
    });
  }

  return {
    AssetIconVariant: {},
    Form: ({ children, control }: any) => <div>{enrich(children, control)}</div>,
    IconColor: { BLUE: 'blue' },
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButton: ({ label, onClick, disabled }: any) => (
      <button type="button" onClick={onClick} disabled={disabled}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { MIN: 'min', FULL: 'full' },
    StyledDropdown: ({ name, items, labelFunc, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {(items ?? []).map((item: any) => (
              <button key={labelFunc(item)} type="button" onClick={() => field.onChange(item)}>
                {labelFunc(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
    StyledInfoText: ({ children }: any) => <div>{children}</div>,
    StyledInput: ({ name, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => <input aria-label={name} value={field.value ?? ''} onChange={field.onChange} />}
      />
    ),
    StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledSearchDropdown: () => null,
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({ info }: any) => (
    <div data-testid="payment-info">
      <span>{info.iban}</span>
      <span>{info.remittanceInfo}</span>
      <span>{info.paymentRequest}</span>
    </div>
  ),
}));
jest.mock('src/components/edit/name.edit', () => ({ NameEdit: () => null }));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/components/exchange-rate', () => ({
  ExchangeRate: () => <div data-testid="exchange-rate" />,
}));
jest.mock('src/components/payment/address-switch', () => ({ AddressSwitch: () => null }));
jest.mock('src/components/payment/buy-completion', () => ({ BuyCompletion: () => <div /> }));
jest.mock('src/components/private-asset-hint', () => ({
  PrivateAssetHint: () => <p data-testid="private-asset-hint" />,
}));
jest.mock('src/components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: { error: string }) => <div data-testid="quote-error-hint">{error}</div>,
}));
jest.mock('src/components/quote-request-error', () => ({
  SESSION_EXPIRED_ERROR: 'Session expired',
  QuoteRequestError: ({ message }: { message: string }) => <div>{message}</div>,
}));
jest.mock('src/components/sanction-hint', () => ({ SanctionHint: () => null }));
jest.mock('src/config/labels', () => ({ addressLabel: () => '' }));
jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ isInitialized: true, closeServices: jest.fn() }),
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn(), rootRef: { current: null } }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string) => key,
    translateError: (key: string) => key,
    currency: mockPrefCurrency,
  }),
}));
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ blockchain: undefined, isInitialized: true, switchBlockchain: jest.fn() }),
}));
jest.mock('src/contexts/window.context', () => ({ useWindowContext: () => ({ width: 800 }) }));
jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => mockUseAppParams() }));
jest.mock('src/hooks/blockchain.hook', () => ({ useBlockchain: () => ({ toString: () => '' }) }));
jest.mock('src/hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    const [debouncedValue, setDebouncedValue] = React.useState();
    const previousValue = React.useRef();
    const serializedValue = JSON.stringify(value);

    React.useEffect(() => {
      if (serializedValue !== previousValue.current) {
        previousValue.current = serializedValue;
        setDebouncedValue(value);
      }
    }, [serializedValue, value]);

    return debouncedValue;
  },
}));
jest.mock('src/hooks/guard.hook', () => ({ useAddressGuard: () => undefined }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/navigation.hook', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock('src/hooks/personal-iban.hook', () => ({
  usePersonalIbanSelection: () => ({
    requestedPersonalIban: mockRequestedPersonalIban(),
    personalIban: mockPersonalIban(),
    customerIdentity: 1,
    hasAuthenticatedCustomer: true,
  }),
}));

import { render, screen, waitFor } from '@testing-library/react';
import BuyInfoScreen from 'src/screens/buy-info.screen';
import BuyScreen from 'src/screens/buy.screen';

const NOTICE =
  'Your account is only provisionally approved. This allows you to make a deposit, but your crypto assets will only be delivered once your onboarding is complete.';
const CONFIRM = 'Click here once you have issued the transfer';

function appParams() {
  return {
    assets: undefined,
    assetIn: 'USD',
    assetOut: 'BTC',
    amountIn: '100',
    amountOut: undefined,
    blockchain: undefined,
    paymentMethod: undefined,
    externalTransactionId: undefined,
    flags: undefined,
    setParams: jest.fn(),
    hideTargetSelection: true,
    availableBlockchains: [],
  };
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: 88001,
    amount: 100,
    currency: { name: 'USD' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public' },
    minVolume: 1,
    maxVolume: 10000,
    isValid: true,
    exchangeRate: 1,
    rate: 1,
    fees: {},
    priceSteps: [],
    isPersonalIban: false,
    name: 'Example recipient',
    iban: 'CH0000000000000000000',
    remittanceInfo: 'BUY-88001',
    paymentRequest: 'QR payment request',
    ...overrides,
  };
}

const screens = [
  ['buy', BuyScreen, true],
  ['buy info', BuyInfoScreen, false],
] as const;

describe.each(screens)('%s provisional approval', (_name, Screen, hasPromotion) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppParams.mockReturnValue(appParams());
    mockGetPersonalIbans.mockResolvedValue([]);
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockConfirmFor.mockResolvedValue(undefined);
    mockAssets[0].category = 'Public';
  });

  it('shows bank details and the notice while hiding the KYC hint and confirmation actions', async () => {
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error: 'KycRequired', provisionalApproval: true }));

    render(<Screen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByTestId('payment-info')).toHaveTextContent('CH0000000000000000000');
    expect(screen.getByTestId('payment-info')).toHaveTextContent('BUY-88001');
    expect(screen.getByTestId('payment-info')).toHaveTextContent('QR payment request');
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByTestId('quote-error-hint')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument();
    expect(screen.queryByText('New: Personal IBAN in your own name!')).not.toBeInTheDocument();
    expect(mockConfirmFor).not.toHaveBeenCalled();
    if (hasPromotion) expect(screen.getByTestId('exchange-rate')).toBeInTheDocument();
  });

  it('keeps the existing KYC error path for a non-provisional invalid quote', async () => {
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error: 'KycRequired' }));

    render(<Screen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toHaveTextContent('KycRequired'));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps the confirmation button for a valid quote without showing the notice', async () => {
    mockReceiveFor.mockResolvedValue(offer());

    render(<Screen />);

    await waitFor(() => expect(screen.getByRole('button', { name: CONFIRM })).toBeInTheDocument());
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    if (hasPromotion) expect(screen.getByText('New: Personal IBAN in your own name!')).toBeInTheDocument();
  });

  it('requires personal-IBAN mismatch acknowledgement before provisional payment details', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error: 'KycRequired', provisionalApproval: true }));

    render(<Screen />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue without personal IBAN' })).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument();
  });
});

describe('buy provisional approval restrictions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppParams.mockReturnValue(appParams());
    mockGetPersonalIbans.mockResolvedValue([]);
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockConfirmFor.mockResolvedValue(undefined);
    mockAssets[0].category = 'Public';
  });

  it('keeps private-asset approval ahead of provisional payment details', async () => {
    mockAssets[0].category = 'Private';
    mockReceiveFor.mockResolvedValue(
      offer({
        asset: { name: 'BTC', uniqueName: 'Bitcoin', category: 'Private' },
        isValid: false,
        error: 'KycRequired',
        provisionalApproval: true,
      }),
    );

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument());
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CONFIRM })).not.toBeInTheDocument();
  });
});
