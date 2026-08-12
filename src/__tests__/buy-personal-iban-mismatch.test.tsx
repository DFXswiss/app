// Wiring test: BuyScreen personal-IBAN mismatch acknowledgement, Frick validation,
// KYC routing, and live-input quote invalidation.
// Mounts the real default-exported BuyScreen (react-hook-form runs for real;
// The debounce hook is replaced with an effect-driven, timer-free equivalent.
// personalIban comes from usePersonalIbanSelection() (not useAppParams).

const mockReceiveFor = jest.fn();
const mockUseAppParams = jest.fn();
const mockPersonalIban = jest.fn();
const mockRequestedPersonalIban = jest.fn();
const mockHasAuthenticatedCustomer = jest.fn();
const mockCustomerIdentity = jest.fn();
const mockUser = jest.fn();
const mockIsUserLoading = jest.fn();
const mockGetPersonalIbans = jest.fn();
const mockConfirmFor = jest.fn();
const mockWalletInitialized = jest.fn();
const mockSetParams = jest.fn();

const mockAssets = [
  { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public', blockchain: 'Ethereum', description: 'Bitcoin' },
];
const mockAssetsMap = new Map([['Ethereum', mockAssets]]);
const mockGetAssets = () => mockAssets;
const mockGetAsset = (list: any[], name: string) =>
  (list ?? []).find((a: any) => a.name === name) ?? list?.[0];
const mockIsSameAsset = () => false;
const mockGetCurrency = (list: any[], name: string) => (list ?? []).find((c: any) => c.name === name);
const mockGetDefaultCurrency = (list: any[]) => list?.[0];
const mockCurrencies = [
  { name: 'EUR', sellable: true },
  { name: 'CHF', sellable: true },
  { name: 'USD', sellable: true },
];
// Stable reference: buy.screen currency-selection effect depends on prefCurrency by identity.
const mockPrefCurrency = { name: 'CHF' };

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
    Utils: { formatAmount: (n: number) => String(n), createRules: () => ({}) },
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
    useSessionContext: () => ({ logout: jest.fn() }),
    useUserContext: () => ({ user: mockUser(), isUserLoading: mockIsUserLoading() }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above the module's imports, so React and
  // react-hook-form are not yet in scope here and must be required directly instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  // Mirror the real Form: inject `control` into descendants that declare `name`.
  function enrich(elements: any, control: any): any {
    if (!elements) return elements;
    return React.Children.map(elements, (element: any) => {
      if (!React.isValidElement(element)) return element;
      const props: any = element.props;
      const newChildren = enrich(props.children, control);
      if (props.name) {
        return React.cloneElement(element, { control, children: newChildren });
      }
      return React.cloneElement(element, { children: newChildren });
    });
  }

  return {
    AssetIconVariant: {},
    Form: ({ children, control }: any) => <div>{enrich(children, control)}</div>,
    IconColor: { BLUE: 'blue' },
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButton: ({ label, onClick }: any) => (
      <button type="button" onClick={onClick}>
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
              <button
                key={labelFunc(item)}
                type="button"
                data-testid={`select-${name}-${labelFunc(item)}`}
                onClick={() => field.onChange(item)}
              >
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
        render={({ field }: any) => (
          <input
            data-testid={`input-${name}`}
            value={field.value === undefined ? '' : field.value}
            onChange={field.onChange}
          />
        )}
      />
    ),
    StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledSearchDropdown: () => null,
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({
    info,
    showBank,
    switchablePersonalIbanProvider,
    onSwitchPersonalIbanProvider,
  }: any) => (
    <div data-testid="payment-info" data-show-bank={showBank ? 'true' : 'false'}>
      <span>{info.iban}</span>
      <span>{info.name}</span>
      {switchablePersonalIbanProvider !== undefined &&
        onSwitchPersonalIbanProvider !== undefined && (
          <button
            type="button"
            aria-label={
              switchablePersonalIbanProvider === 'Yapeal'
                ? 'Show legacy Yapeal IBAN'
                : 'Show Bank Frick IBAN'
            }
            onClick={() =>
              onSwitchPersonalIbanProvider(switchablePersonalIbanProvider)
            }
          >
            switch provider
          </button>
        )}
    </div>
  ),
}));
jest.mock('../components/edit/name.edit', () => ({ NameEdit: () => null }));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/exchange-rate', () => ({ ExchangeRate: () => <div data-testid="exchange-rate" /> }));
jest.mock('../components/payment/address-switch', () => ({ AddressSwitch: () => null }));
jest.mock('../components/payment/buy-completion', () => ({ BuyCompletion: () => null }));
jest.mock('../components/private-asset-hint', () => ({ PrivateAssetHint: () => null }));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error, message }: any) => (
    <div data-testid="quote-error-hint">
      <span data-testid="quote-error-code">{error}</span>
      {message && <span data-testid="quote-error-message">{message}</span>}
    </div>
  ),
}));
jest.mock('../components/sanction-hint', () => ({ SanctionHint: () => null }));

// labels.ts pulls many runtime enums from @dfx.swiss/react at module load; mock the only
// export BuyScreen uses so we do not need a full enum surface.
jest.mock('../config/labels', () => ({
  addressLabel: (wallet: any) => wallet?.address ?? '',
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true }),
}));
jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn(), rootRef: { current: null } }),
}));
// prefCurrency must be truthy: currency effect only calls setVal when prefCurrency && currency.
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
    currency: mockPrefCurrency,
  }),
}));
jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({
    blockchain: undefined,
    isInitialized: mockWalletInitialized(),
    switchBlockchain: jest.fn(),
  }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));
jest.mock('../hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => {
    // Hoisted factory again: React has to be required here rather than imported.
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
jest.mock('../hooks/personal-iban.hook', () => ({
  usePersonalIbanSelection: () => ({
    requestedPersonalIban: mockRequestedPersonalIban(),
    personalIban: mockPersonalIban(),
    customerIdentity: mockCustomerIdentity(),
    hasAuthenticatedCustomer: mockHasAuthenticatedCustomer(),
  }),
}));
jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: () => '' }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { format } from 'util';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FiatPaymentMethod } from '@dfx.swiss/react';
import BuyScreen from 'src/screens/buy.screen';
import { isPersonalIbanApplicable } from '../util/personal-iban';

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: (value: T) => {
      if (resolvePromise === undefined) throw new Error('Deferred resolve was not registered');
      resolvePromise(value);
    },
    reject: (reason?: unknown) => {
      if (rejectPromise === undefined) throw new Error('Deferred reject was not registered');
      rejectPromise(reason);
    },
  };
}

function baseAppParams(overrides: Record<string, unknown> = {}) {
  return {
    assets: undefined,
    assetIn: 'CHF',
    assetOut: 'BTC',
    amountIn: undefined,
    amountOut: undefined,
    blockchain: undefined,
    paymentMethod: undefined,
    externalTransactionId: undefined,
    flags: undefined,
    setParams: mockSetParams,
    hideTargetSelection: true,
    availableBlockchains: [],
    ...overrides,
  };
}

const MISMATCH_HINT =
  'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.';
const CONTINUE_WITHOUT = 'Continue without personal IBAN';
const VERIFY_HINT =
  'The personal IBAN response could not be verified for this offer. You can continue with the standard payment details, or cancel.';
const TRANSFER_BUTTON = 'Click here once you have issued the transfer';
const FRICK_FALLBACK_HINT =
  'Your new Bank Frick IBAN requires KYC level 50 - we are showing your existing IBAN instead.';

const activeChfYapealRow = {
  id: 7,
  iban: 'CH9300762011623852957',
  currency: 'CHF',
  bank: 'Yapeal',
  active: true,
  acceptsPayments: true,
  status: 'Active',
};

function chfOffer() {
  return {
    id: 1,
    amount: 300,
    currency: { name: 'CHF' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC', uniqueName: 'Bitcoin' },
    minVolume: 1,
    maxVolume: 100000,
    isValid: true,
    exchangeRate: 1,
    rate: 1,
    fees: {},
    priceSteps: [],
    isPersonalIban: false,
    name: 'DFX AG',
  };
}

function usdOffer() {
  return {
    id: 4,
    amount: 300,
    currency: { name: 'USD' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC', uniqueName: 'Bitcoin' },
    minVolume: 1,
    maxVolume: 100000,
    isValid: true,
    exchangeRate: 1,
    rate: 1,
    fees: {},
    priceSteps: [],
    isPersonalIban: false,
    name: 'DFX AG',
  };
}

function frickOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    amount: 300,
    currency: { name: 'EUR' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC', uniqueName: 'Bitcoin' },
    minVolume: 1,
    maxVolume: 100000,
    isValid: true,
    exchangeRate: 1,
    rate: 1,
    fees: {},
    priceSteps: [],
    isPersonalIban: true,
    bank: 'Bank Frick',
    name: 'DFX AG',
    iban: 'LI35088110102979K002E',
    bic: 'BFRILI22',
    remittanceInfo: 'DFX-BUY-2',
    ...overrides,
  };
}

function ordinaryEurOffer() {
  return frickOffer({
    isPersonalIban: false,
    bank: undefined,
    name: 'DFX AG',
    iban: 'CH9300762011623852957',
    remittanceInfo: 'DFX-BUY-ORD',
  });
}

function yapealChfOffer() {
  return {
    ...chfOffer(),
    id: 3,
    isPersonalIban: true,
    bank: 'Yapeal',
    bic: 'YAPECHZ2',
    iban: activeChfYapealRow.iban,
    name: 'Max Muster',
    remittanceInfo: 'DFX-BUY-7',
  };
}

function frickChfOffer() {
  return frickOffer({ currency: { name: 'CHF' } });
}

describe('BuyScreen personal IBAN mismatch and error handling', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockCustomerIdentity.mockReset().mockReturnValue(1);
    mockUser.mockReset().mockReturnValue(undefined);
    mockIsUserLoading.mockReset().mockReturnValue(false);
    mockGetPersonalIbans.mockReset().mockResolvedValue([]);
    mockWalletInitialized.mockReturnValue(true);
    // A6: fail on unexpected act() / React warnings so terminal state is awaited properly.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      const [message = '', ...parameters] = args;
      const msg = format(message, ...parameters);
      if (msg.includes('not wrapped in act') || msg.includes('Warning: An update to')) {
        throw new Error(`Unexpected console.error in test: ${msg}`);
      }
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  async function settle() {
    // The quote effect's promise.then(commit)/finally(setIsLoading) chain needs three
    // microtask ticks after the underlying promise resolves (resolve, then .then(), then
    // .finally()); this loop provides ten to comfortably cover deeper chains too.
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });
  }

  async function waitFor(callback: () => unknown) {
    await settle();
    return callback();
  }

  it('omits personalIbanProvider and requires continue acknowledgement before payment details (A2)', async () => {
    // USD, not CHF: after the Bank Frick CHF cutover, CHF is itself Frick-applicable (see the
    // dedicated CHF test below), so a genuine currency mismatch now needs a currency outside the
    // Bank Frick set (EUR, CHF) entirely.
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));
    mockReceiveFor.mockResolvedValue(usdOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument());
    await settle();

    const request = mockReceiveFor.mock.calls[0][0];
    expect(request.personalIbanProvider).toBeUndefined();
    expect(request).not.toHaveProperty('personalIbanProvider');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('requests a Frick personal IBAN directly for CHF, mirroring the EUR flow, without a confirmation step', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(frickOffer({ currency: { name: 'CHF' } }));

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();

    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
  });

  it('does not show the mismatch hint or personal-IBAN promo for customers without personal-iban', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
    // CHF is a Bank Frick currency now, same as EUR: the "generate a personal IBAN" promo (the
    // separate, non-Frick /buy/personal-iban issuance flow) must not offer itself here either.
    expect(screen.queryByText('New: Personal IBAN in your own name!')).not.toBeInTheDocument();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'false');
  });

  it('shows the personal-IBAN promo for a currency outside the Bank Frick set without a selector', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));
    mockReceiveFor.mockResolvedValue(usdOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(screen.getByText('New: Personal IBAN in your own name!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate personal IBAN' })).toBeInTheDocument();
  });

  it('does not delay a selector-free quote while wallet initialization is unsettled', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockHasAuthenticatedCustomer.mockReturnValue(false);
    mockWalletInitialized.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(ordinaryEurOffer());

    const rendered = render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    await settle();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty(
      'personalIbanProvider',
    );
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();

    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockWalletInitialized.mockReturnValue(true);
    rendered.rerender(<BuyScreen />);
    await settle();
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
  });

  it('does not flash the mismatch hint while a quote is still loading (no paymentInfo)', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    // Never resolve: paymentInfo stays undefined for the whole test.
    mockReceiveFor.mockReturnValue(new Promise(() => undefined));

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
  });

  it('clears the displayed CHF offer immediately when the live form currency changes (B4)', async () => {
    // No selector: no acknowledgement gate can hide payment-info for unrelated reasons.
    // Without immediate invalidation, the CHF offer would stay actionable during the 500ms debounce.
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();

    // Subsequent quote fetch must not resolve — keeps any new offer from landing.
    mockReceiveFor.mockReturnValue(new Promise(() => undefined));

    await act(async () => {
      screen.getByTestId('select-currency-EUR').click();
    });

    // Live inputs changed: quote must be cleared immediately, not after 500ms debounce.
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();
  });

  it('discards a pending quote when the customer clears the only amount', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    let resolveQuote!: (offer: ReturnType<typeof chfOffer>) => void;
    const pendingQuote = new Promise<ReturnType<typeof chfOffer>>((resolve) => {
      resolveQuote = resolve;
    });
    const pendingExactPrice = new Promise(() => undefined);
    mockReceiveFor.mockImplementation(() =>
      mockReceiveFor.mock.calls.length === 1 ? pendingQuote : pendingExactPrice,
    );

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(screen.getByTestId('input-amount')).toHaveValue('300');
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');

    await act(async () => {
      resolveQuote(chfOffer());
      await Promise.resolve();
    });

    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('keeps a pending quote when the customer only changes the numeric amount representation (A2)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    let resolveQuote!: (offer: ReturnType<typeof chfOffer>) => void;
    const pendingQuote = new Promise<ReturnType<typeof chfOffer>>((resolve) => {
      resolveQuote = resolve;
    });
    mockReceiveFor
      .mockImplementationOnce(() => pendingQuote)
      .mockImplementation(() => new Promise(() => undefined));

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('input-amount')).toHaveValue('300');

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '300.0' } });
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('300.0');

    await act(async () => {
      resolveQuote(chfOffer());
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('keeps the exact-price result visible when its synchronized form uses canonical numeric values (B1)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    let resolveExactPrice!: (offer: ReturnType<typeof chfOffer>) => void;
    const pendingExactPrice = new Promise<ReturnType<typeof chfOffer>>((resolve) => {
      resolveExactPrice = resolve;
    });
    mockReceiveFor
      .mockResolvedValueOnce(chfOffer())
      .mockImplementationOnce(() => pendingExactPrice);

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '300.0' } });
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('300.0');

    await act(async () => {
      resolveExactPrice(chfOffer());
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.01'));
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('treats EUR with non-BANK payment methods as a personal-IBAN mismatch (payment-method half)', () => {
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.INSTANT)).toBe(false);
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.CARD)).toBe(false);
    expect(isPersonalIbanApplicable('EUR', FiatPaymentMethod.BANK)).toBe(true);
  });

  it('retries a transient personal-IBAN issuance failure and reaches payment details (B3)', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor
      .mockRejectedValueOnce({ message: 'PersonalIbanIssuanceFailed' })
      .mockResolvedValue(frickOffer());

    render(<BuyScreen />);

    await waitFor(
      () =>
        expect(
          screen.getByText(
            'We could not issue your personal IBAN. Please try again later or contact support if the problem persists.',
          ),
        ).toBeInTheDocument(),
    );
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(3));
    await settle();
    expect(mockReceiveFor.mock.calls[1][0].personalIbanProvider).toBe('Frick');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('uses generic KYC path for EUR bank transfer without personal-iban selector (KycRequired)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockRejectedValue({ message: 'KycRequired' });

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    expect(screen.getByTestId('quote-error-code')).toHaveTextContent('KycRequired');
    expect(screen.queryByTestId('quote-error-message')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal IBANs require KYC level 50.')).not.toBeInTheDocument();
  });

  it('uses generic path for EUR bank transfer without personal-iban selector (PaymentMethodNotAllowed)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockRejectedValue({ message: 'PaymentMethodNotAllowed' });

    render(<BuyScreen />);

    await waitFor(
      () => expect(screen.getByTestId('quote-error-hint')).toHaveTextContent('PaymentMethodNotAllowed'),
    );
    await settle();
    expect(
      screen.queryByText('Personal IBANs require the bank transfer payment method.'),
    ).not.toBeInTheDocument();
  });

  it('routes personal-IBAN KycRequired through QuoteErrorHint with feature explanation (A3/B3)', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockRejectedValue({ message: 'KycRequired' });

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.getByTestId('quote-error-code')).toHaveTextContent('KycRequired');
    expect(screen.getByTestId('quote-error-message')).toHaveTextContent(
      'Personal IBANs require KYC level 50.',
    );
    // Must not dead-end on ErrorHint + Retry only.
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('fetches and shows standard details after rejecting an unverifiable Frick response (B2)', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    const rejected = frickOffer({ name: 'Customer B', iban: 'LI-REJECTED-PERSONAL' });
    const standard = ordinaryEurOffer();
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      Promise.resolve(request.personalIbanProvider ? rejected : standard),
    );

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls.some(([request]) => request.personalIbanProvider === undefined)).toBe(
      true,
    );
    expect(screen.getByTestId('payment-info')).toHaveTextContent('CH9300762011623852957');
    expect(screen.getByTestId('payment-info')).toHaveTextContent('DFX AG');
    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('LI-REJECTED-PERSONAL');
    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('Customer B');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'false');
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('shows Bank row flag for a verified Frick response without acknowledgement (B5)', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
    expect(screen.queryByText(VERIFY_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText(CONTINUE_WITHOUT)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();
  });

  it('requests a Frick personal IBAN directly without a confirmation step on an eligible offer', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockWalletInitialized.mockReturnValue(true);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    render(<BuyScreen />);

    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();

    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
  });

  it('waits for wallet init and authenticated customer before requesting Frick, then fires without confirmation', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockHasAuthenticatedCustomer.mockReturnValue(false);
    mockWalletInitialized.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    const rendered = render(<BuyScreen />);

    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();

    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockWalletInitialized.mockReturnValue(true);
    rendered.rerender(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();

    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();
  });

  it('does not request Frick when wallet is initialized but customer is not authenticated', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockWalletInitialized.mockReturnValue(true);
    mockHasAuthenticatedCustomer.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    render(<BuyScreen />);

    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('does not request Frick when customer is authenticated but wallet is not initialized', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockWalletInitialized.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    render(<BuyScreen />);

    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('offers continue-without for an unrecognized selector instead of Retry-only (A3)', async () => {
    mockPersonalIban.mockReturnValue('unknown-provider');
    mockRequestedPersonalIban.mockReturnValue('unknown-provider');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    render(<BuyScreen />);

    await waitFor(() =>
      expect(screen.getByText('The requested personal IBAN provider is not recognized.')).toBeInTheDocument(),
    );
    await settle();
    expect(screen.getByRole('button', { name: CONTINUE_WITHOUT })).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    // No request with the unrecognized selector.
    expect(mockReceiveFor).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.queryByText('The requested personal IBAN provider is not recognized.')).not.toBeInTheDocument();
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('defaults an eligible legacy Yapeal holder to Frick on the first quote request', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(frickChfOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
  });

  it('uses currency and provider from the same debounced snapshot', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockImplementation((request: { currency: { name: string } }) =>
      Promise.resolve(request.currency.name === 'CHF' ? frickChfOffer() : ordinaryEurOffer()),
    );

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    const requestCountBeforeCurrencyChange = mockReceiveFor.mock.calls.length;

    // The timer-free debounce mock publishes its next snapshot from an effect. Changing the live
    // currency here exercises the same gap as the production 500 ms debounce window.
    await act(async () => {
      screen.getByTestId('select-currency-EUR').click();
    });

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeCurrencyChange),
    );
    await settle();
    const requestsAfterCurrencyChange = mockReceiveFor.mock.calls
      .slice(requestCountBeforeCurrencyChange)
      .map(([request]) => request);
    const actualPairings = requestsAfterCurrencyChange.map((request) => ({
      currency: request.currency.name,
      personalIbanProvider: request.personalIbanProvider,
    }));
    const expectedPairings = requestsAfterCurrencyChange.map((request) => {
      if (request.currency.name === 'CHF') {
        return { currency: 'CHF', personalIbanProvider: 'Frick' };
      }
      if (request.currency.name === 'EUR') {
        return { currency: 'EUR', personalIbanProvider: undefined };
      }
      throw new Error(`Unexpected request currency: ${request.currency.name}`);
    });
    expect(actualPairings).toEqual(expectedPairings);
  });

  it('continues with a normal quote when loading personal IBAN rows fails', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockRejectedValue(new Error('row load failed'));
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    expect(
      screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show Bank Frick IBAN' }),
    ).not.toBeInTheDocument();
  });

  it('discards rows that resolve after the customer identity has changed', async () => {
    let customerIdentity = 1;
    let resolveOldRows: (rows: typeof activeChfYapealRow[]) => void = () => undefined;
    const oldRows = new Promise<typeof activeChfYapealRow[]>((resolve) => {
      resolveOldRows = resolve;
    });
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans
      .mockImplementationOnce(() => oldRows)
      .mockResolvedValueOnce([]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    const rendered = render(<BuyScreen />);

    await waitFor(() => expect(mockGetPersonalIbans).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor).not.toHaveBeenCalled();

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);

    await waitFor(() => expect(mockGetPersonalIbans).toHaveBeenCalledTimes(2));
    await settle();
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls.every(([request]) => request.personalIbanProvider === undefined)).toBe(
      true,
    );

    await act(async () => {
      resolveOldRows([activeChfYapealRow]);
      await Promise.resolve();
    });

    expect(mockReceiveFor.mock.calls.every(([request]) => request.personalIbanProvider === undefined)).toBe(
      true,
    );
    expect(
      screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' }),
    ).not.toBeInTheDocument();
  });

  it('requests Yapeal on the next quote after the legacy-provider toggle is clicked', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      Promise.resolve(
        request.personalIbanProvider === 'Yapeal'
          ? yapealChfOffer()
          : frickChfOffer(),
      ),
    );

    render(<BuyScreen />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
    await settle();
    const requestCountBeforeToggle = mockReceiveFor.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }).click();
    });

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeToggle),
    );
    await settle();
    expect(mockReceiveFor.mock.calls[requestCountBeforeToggle][0].personalIbanProvider).toBe(
      'Yapeal',
    );
  });

  it('falls back from an automatic Frick KycRequired response without showing the blocking KYC screen', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      request.personalIbanProvider === 'Frick'
        ? Promise.reject({ message: 'KycRequired' })
        : Promise.resolve(yapealChfOffer()),
    );

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByText(FRICK_FALLBACK_HINT)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(
      mockReceiveFor.mock.calls.some(
        ([request]) => request.personalIbanProvider === undefined,
      ),
    ).toBe(true);
    expect(screen.queryByTestId('quote-error-hint')).not.toBeInTheDocument();
  });

  it('clears the automatic Frick fallback hint when the customer explicitly toggles back to Frick', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    let frickRequestCount = 0;
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) => {
      if (request.personalIbanProvider === 'Frick') {
        frickRequestCount += 1;
        return frickRequestCount === 1
          ? Promise.reject({ message: 'KycRequired' })
          : Promise.resolve(frickChfOffer());
      }
      return Promise.resolve(yapealChfOffer());
    });

    render(<BuyScreen />);

    await waitFor(() => expect(screen.getByText(FRICK_FALLBACK_HINT)).toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      screen.getByRole('button', { name: 'Show Bank Frick IBAN' }).click();
    });

    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
  });

  it('reloads rows and clears the provider override when the customer identity changes', async () => {
    let customerIdentity = 1;
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockImplementation(() =>
      Promise.resolve(customerIdentity === 1 ? [activeChfYapealRow] : []),
    );
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) => {
      if (request.personalIbanProvider === 'Frick') return Promise.resolve(frickChfOffer());
      if (request.personalIbanProvider === 'Yapeal') return Promise.resolve(yapealChfOffer());
      return Promise.resolve(chfOffer());
    });

    const rendered = render(<BuyScreen />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }).click();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).toBeInTheDocument(),
    );
    await settle();
    const requestCountBeforeSwap = mockReceiveFor.mock.calls.length;

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);

    await waitFor(() => expect(mockGetPersonalIbans).toHaveBeenCalledTimes(2));
    await settle();
    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeSwap),
    );
    await settle();
    expect(mockReceiveFor.mock.calls[requestCountBeforeSwap][0]).not.toHaveProperty(
      'personalIbanProvider',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('fails open after the personal IBAN row timeout and discards a late row response', async () => {
    jest.useFakeTimers();
    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    try {
      mockPersonalIban.mockReturnValue(undefined);
      mockRequestedPersonalIban.mockReturnValue(undefined);
      mockUser.mockReturnValue({ kyc: { level: 50 } });
      mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);
      mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
      mockReceiveFor.mockResolvedValue(chfOffer());

      render(<BuyScreen />);
      await settle();
      expect(mockReceiveFor).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalled();
      expect(
        mockReceiveFor.mock.calls.every(
          ([request]) => request.personalIbanProvider === undefined,
        ),
      ).toBe(true);

      await act(async () => {
        rowsDeferred.resolve([activeChfYapealRow]);
        await Promise.resolve();
      });
      await settle();
      expect(
        mockReceiveFor.mock.calls.every(
          ([request]) => request.personalIbanProvider === undefined,
        ),
      ).toBe(true);
      expect(
        screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts the automatic Frick quote when user loading changes from true to false', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockIsUserLoading.mockReturnValue(true);
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const quoteDeferred = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    const rendered = render(<BuyScreen />);
    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();

    mockIsUserLoading.mockReturnValue(false);
    rendered.rerender(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      quoteDeferred.resolve(frickChfOffer());
    });
    await settle();

    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('does not delay the first quote when the user context is already loaded', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockIsUserLoading.mockReturnValue(false);
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const quoteDeferred = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    render(<BuyScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      quoteDeferred.resolve(frickChfOffer());
    });
    await settle();

    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('fails open selector-less after the user-loading timeout', async () => {
    jest.useFakeTimers();
    try {
      mockPersonalIban.mockReturnValue(undefined);
      mockRequestedPersonalIban.mockReturnValue(undefined);
      mockUser.mockReturnValue({ kyc: { level: 50 } });
      mockIsUserLoading.mockReturnValue(true);
      mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
      mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
      mockReceiveFor.mockResolvedValue(chfOffer());

      render(<BuyScreen />);
      await settle();
      expect(mockReceiveFor).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();

      expect(mockReceiveFor).toHaveBeenCalled();
      expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty(
        'personalIbanProvider',
      );
      await settle();
    } finally {
      jest.useRealTimers();
    }
  });

  it('discards a quote rejection from the previous customer identity', async () => {
    let customerIdentity = 1;
    const staleQuote = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor
      .mockReturnValueOnce(staleQuote.promise)
      .mockResolvedValue(frickChfOffer());

    const rendered = render(<BuyScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      staleQuote.reject({ message: 'PersonalIbanProviderNotAvailable' });
      await Promise.resolve();
    });
    await settle();

    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-error-hint')).not.toBeInTheDocument();
  });

  it('does not let a stale successful quote overwrite the new customer offer', async () => {
    let customerIdentity = 1;
    const staleQuote = createDeferred<ReturnType<typeof frickChfOffer>>();
    const currentOffer = frickChfOffer();
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockReturnValueOnce(staleQuote.promise).mockResolvedValue(currentOffer);

    const rendered = render(<BuyScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      staleQuote.resolve(
        frickOffer({
          currency: { name: 'CHF' },
          name: 'Stale customer',
          iban: 'LI-ST-ALE',
        }),
      );
      await Promise.resolve();
    });
    await settle();

    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('Stale customer');
    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('LI-ST-ALE');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quote-error-hint')).not.toBeInTheDocument();
  });

  it('does not carry selector suppression across customer identities', async () => {
    let customerIdentity = 1;
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockPersonalIban.mockReturnValue('unknown-provider');
    mockRequestedPersonalIban.mockReturnValue('unknown-provider');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    const rendered = render(<BuyScreen />);
    await waitFor(() =>
      expect(
        screen.getByText('The requested personal IBAN provider is not recognized.'),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    const requestCountBeforeSwap = mockReceiveFor.mock.calls.length;

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);

    await waitFor(() =>
      expect(
        screen.getByText('The requested personal IBAN provider is not recognized.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: CONTINUE_WITHOUT })).toBeInTheDocument();
    expect(mockReceiveFor).toHaveBeenCalledTimes(requestCountBeforeSwap);
  });

  it('requires a fresh mismatch acknowledgement after the customer identity changes', async () => {
    let customerIdentity = 1;
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));
    mockReceiveFor.mockResolvedValue(usdOffer());

    const rendered = render(<BuyScreen />);
    await waitFor(() => expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    customerIdentity = 2;
    rendered.rerender(<BuyScreen />);

    await waitFor(() => expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument());
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });
});
