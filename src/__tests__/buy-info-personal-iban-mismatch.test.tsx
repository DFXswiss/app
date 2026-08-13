// Wiring test: when personalIban is set but the currency is outside the Bank Frick currency set
// (EUR, CHF), BuyInfoScreen omits personalIbanProvider from the quote request AND requires
// continue acknowledgement (A2).
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
const mockWalletInitialized = jest.fn();
const mockCloseServices = jest.fn();
const mockCurrencies = [{ name: 'CHF' }, { name: 'EUR' }, { name: 'USD' }];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

jest.mock('@dfx.swiss/react', () => {
  const buyInterface = {
    get currencies() {
      return mockCurrencies;
    },
    receiveFor: (...args: unknown[]) => mockReceiveFor(...args),
    getPersonalIbans: (...args: unknown[]) => mockGetPersonalIbans(...args),
  };
  return {
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
    Utils: { formatAmount: (n: number) => String(n) },
    useAsset: () => ({
      getAsset: (list: any[], name: string) =>
        (list ?? []).find((a: any) => a.name === name) ?? list?.[0],
    }),
    useAssetContext: () => ({
      getAssets: () => [{ name: 'BTC', uniqueName: 'Bitcoin' }],
    }),
    useBuy: () => buyInterface,
    useFiat: () => ({
      getCurrency: (list: any[], name: string) =>
        (list ?? []).find((c: any) => c.name === name),
    }),
    useUserContext: () => {
      const user = mockUser();
      return {
        user:
          user === undefined || user.accountId !== undefined
            ? user
            : { ...user, accountId: mockCustomerIdentity() },
        isUserLoading: mockIsUserLoading(),
      };
    },
  };
});

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { SM: 'sm', LG: 'lg' },
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
  StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({
    info,
    showBank,
    personalIbanProviderSwitch,
  }: any) => (
    <div data-testid="payment-info" data-show-bank={showBank ? 'true' : 'false'}>
      <span>{info.iban}</span>
      <span>{info.name}</span>
      {personalIbanProviderSwitch !== undefined && (
        <button
          type="button"
          aria-label={
            personalIbanProviderSwitch.target === 'Yapeal'
              ? 'Show legacy Yapeal IBAN'
              : 'Show Bank Frick IBAN'
          }
          onClick={() =>
            personalIbanProviderSwitch.onSwitch(
              personalIbanProviderSwitch.target,
            )
          }
        >
          switch provider
        </button>
      )}
    </div>
  ),
}));
jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/components/payment/buy-completion', () => ({
  BuyCompletion: ({ paymentInfo }: { paymentInfo: { iban?: string } }) => (
    <div data-testid="buy-completion">{paymentInfo.iban}</div>
  ),
}));
jest.mock('src/components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error, message }: any) => (
    <div data-testid="quote-error-hint">
      <span data-testid="quote-error-code">{error}</span>
      {message && <span data-testid="quote-error-message">{message}</span>}
    </div>
  ),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', PAYMENT: 'payment', CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn() }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));
jest.mock('src/hooks/personal-iban.hook', () => ({
  usePersonalIbanSelection: () => ({
    requestedPersonalIban: mockRequestedPersonalIban(),
    personalIban: mockPersonalIban(),
    customerIdentity: mockCustomerIdentity(),
    hasAuthenticatedCustomer: mockHasAuthenticatedCustomer(),
  }),
}));
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: mockWalletInitialized() }),
}));
jest.mock('src/hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('src/hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

import { format } from 'util';
import { act, render, screen, waitFor } from '@testing-library/react';
import BuyInfoScreen from 'src/screens/buy-info.screen';

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

function baseAppParams(overrides: Record<string, unknown> = {}) {
  return {
    assetIn: 'CHF',
    assetOut: 'BTC',
    amountIn: '100',
    amountOut: undefined,
    externalTransactionId: undefined,
    availableBlockchains: undefined,
    ...overrides,
  };
}

function chfOffer() {
  return {
    id: 1,
    amount: 100,
    currency: { name: 'CHF' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC' },
    minVolume: 1,
    maxVolume: 10000,
    isPersonalIban: false,
    name: 'DFX AG',
  };
}

function usdOffer() {
  return {
    id: 3,
    amount: 100,
    currency: { name: 'USD' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC' },
    minVolume: 1,
    maxVolume: 10000,
    isPersonalIban: false,
    name: 'DFX AG',
  };
}

function frickOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    amount: 100,
    currency: { name: 'EUR' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC' },
    minVolume: 1,
    maxVolume: 10000,
    isPersonalIban: true,
    bank: 'Bank Frick',
    name: 'DFX AG',
    iban: 'LI35088110102979K002E',
    ...overrides,
  };
}

function frickChfOffer() {
  return frickOffer({ currency: { name: 'CHF' } });
}

function yapealChfOffer() {
  return {
    ...chfOffer(),
    id: 4,
    isPersonalIban: true,
    bank: 'Yapeal',
    iban: activeChfYapealRow.iban,
    name: 'Max Muster',
  };
}

type BuyInfoOffer =
  | ReturnType<typeof chfOffer>
  | ReturnType<typeof frickChfOffer>
  | ReturnType<typeof yapealChfOffer>;

describe('BuyInfoScreen personal IBAN mismatch hint', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockCustomerIdentity.mockReset().mockReturnValue(1);
    mockUser.mockReset().mockReturnValue({ kyc: { level: 0 } });
    mockIsUserLoading.mockReset().mockReturnValue(false);
    mockGetPersonalIbans.mockReset().mockResolvedValue([]);
    mockWalletInitialized.mockReturnValue(true);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockResolvedValue(chfOffer());
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
    // Drain microtasks so the quote effect's promise.then(commit)/finally(setIsLoading) chain
    // settles under act(): resolving the promise, running .then(), then running .finally() each
    // consume their own microtask tick, so three Promise.resolve() ticks are required (A6).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it('does not quote the persisted customer while an incoming widget session is authenticating', async () => {
    mockWalletInitialized.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));

    const rendered = render(<BuyInfoScreen />);
    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();

    mockWalletInitialized.mockReturnValue(true);
    rendered.rerender(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());
    await settle();
  });

  it('does not quote the persisted customer while authentication is still settling', async () => {
    mockPersonalIban.mockReturnValue('Yapeal');
    mockRequestedPersonalIban.mockReturnValue('Yapeal');
    mockHasAuthenticatedCustomer.mockReturnValue(false);
    mockWalletInitialized.mockReturnValue(true);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));

    const rendered = render(<BuyInfoScreen />);
    await settle();
    expect(mockReceiveFor).not.toHaveBeenCalled();

    mockHasAuthenticatedCustomer.mockReturnValue(true);
    rendered.rerender(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Yapeal');
    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());
    await settle();
  });

  it('omits personalIbanProvider and requires continue acknowledgement before payment details (A2)', async () => {
    // USD, not the CHF default: after the Bank Frick CHF cutover, CHF is itself Frick-applicable
    // (see the dedicated CHF test below), so a genuine currency mismatch now needs a currency
    // outside the Bank Frick set (EUR, CHF) entirely.
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));
    mockReceiveFor.mockResolvedValue(usdOffer());

    render(<BuyInfoScreen />);

    await waitFor(() => {
      expect(mockReceiveFor).toHaveBeenCalled();
    });
    await settle();

    const request = mockReceiveFor.mock.calls[0][0];
    expect(request.personalIbanProvider).toBeUndefined();
    expect(request).not.toHaveProperty('personalIbanProvider');

    await waitFor(() => {
      expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
  });

  it('requests a Frick personal IBAN directly for CHF, mirroring the EUR flow', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(frickOffer({ currency: { name: 'CHF' } }));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
  });

  it('does not show the mismatch hint for customers without personal-iban', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);

    render(<BuyInfoScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'false');
  });

  it('does not delay a selector-free quote while authentication is unsettled', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockHasAuthenticatedCustomer.mockReturnValue(false);
    mockWalletInitialized.mockReturnValue(false);

    const rendered = render(<BuyInfoScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty(
      'personalIbanProvider',
    );

    mockHasAuthenticatedCustomer.mockReturnValue(true);
    mockWalletInitialized.mockReturnValue(true);
    rendered.rerender(<BuyInfoScreen />);
    await settle();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
  });

  it('does not show the mismatch hint while paymentInfo is absent (loading)', async () => {
    mockReceiveFor.mockReturnValue(new Promise(() => undefined));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
  });

  it('uses generic KYC path for EUR bank transfer without personal-iban selector (KycRequired)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockRejectedValue({ message: 'KycRequired' });

    render(<BuyInfoScreen />);

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

    render(<BuyInfoScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('quote-error-hint')).toHaveTextContent('PaymentMethodNotAllowed'),
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

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.getByTestId('quote-error-code')).toHaveTextContent('KycRequired');
    expect(screen.getByTestId('quote-error-message')).toHaveTextContent(
      'Personal IBANs require KYC level 50.',
    );
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('fetches and shows standard details after rejecting an unverifiable Frick response (B2)', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    const rejected = frickOffer({ name: 'Customer B', iban: 'LI-REJECTED-PERSONAL' });
    const standard = frickOffer({
      isPersonalIban: false,
      bank: undefined,
      name: 'DFX AG',
      iban: 'CH9300762011623852957',
    });
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      Promise.resolve(request.personalIbanProvider ? rejected : standard),
    );

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
    expect(mockReceiveFor.mock.calls[1][0]).not.toHaveProperty('personalIbanProvider');
    expect(screen.getByTestId('payment-info')).toHaveTextContent('CH9300762011623852957');
    expect(screen.getByTestId('payment-info')).toHaveTextContent('DFX AG');
    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('LI-REJECTED-PERSONAL');
    expect(screen.getByTestId('payment-info')).not.toHaveTextContent('Customer B');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'false');
  });

  it('offers Close when the fresh selector-free fallback request fails (B2)', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    const rejected = frickOffer({ name: 'Customer B', iban: 'LI-REJECTED-PERSONAL' });
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      request.personalIbanProvider
        ? Promise.resolve(rejected)
        : Promise.reject({ message: 'Fallback request failed' }),
    );

    render(<BuyInfoScreen />);
    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(screen.getByText('Fallback request failed')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();

    await act(async () => screen.getByRole('button', { name: 'Close' }).click());
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
  });

  it('shows verified Frick details immediately with showBank (B5)', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(frickOffer());

    render(<BuyInfoScreen />);

    expect(
      screen.queryByRole('button', { name: 'Request and use personal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Bank Frick will assign you a unique IBAN for transfers. The account behind it belongs to DFX AG. This cannot be undone. Do you want to request and use it?',
      ),
    ).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
    expect(screen.getByTestId('payment-info')).toHaveAttribute('data-show-bank', 'true');
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

  it('defaults an eligible legacy Yapeal holder to Frick on the first quote request', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const quoteDeferred = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor).toHaveBeenNthCalledWith(1, {
      asset: { name: 'BTC', uniqueName: 'Bitcoin' },
      currency: { name: 'CHF' },
      externalTransactionId: undefined,
      amount: 100,
      personalIbanProvider: 'Frick',
    });

    await act(async () => {
      quoteDeferred.resolve(frickChfOffer());
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('does not reuse a loaded user from the previous customer for the automatic Frick default', async () => {
    jest.useFakeTimers();
    try {
      let customerIdentity = 1;
      mockPersonalIban.mockReturnValue(undefined);
      mockRequestedPersonalIban.mockReturnValue(undefined);
      mockCustomerIdentity.mockImplementation(() => customerIdentity);
      mockUser.mockReturnValue({ kyc: { level: 50 }, accountId: 1 });
      mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

      const rowsDeferreds: ReturnType<
        typeof createDeferred<(typeof activeChfYapealRow)[]>
      >[] = [];
      mockGetPersonalIbans.mockImplementation(() => {
        const deferred = createDeferred<(typeof activeChfYapealRow)[]>();
        rowsDeferreds.push(deferred);
        return deferred.promise;
      });
      mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
        Promise.resolve(
          request.personalIbanProvider === 'Frick'
            ? frickChfOffer()
            : chfOffer(),
        ),
      );

      const rendered = render(<BuyInfoScreen />);
      await settle();
      expect(mockGetPersonalIbans).toHaveBeenCalledTimes(1);

      await act(async () => {
        rowsDeferreds[0].resolve([activeChfYapealRow]);
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
      expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
      const requestCountBeforeSwap = mockReceiveFor.mock.calls.length;

      customerIdentity = 2;
      rendered.rerender(<BuyInfoScreen />);
      await settle();
      expect(mockGetPersonalIbans).toHaveBeenCalledTimes(2);

      await act(async () => {
        rowsDeferreds[1].resolve([activeChfYapealRow]);
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(requestCountBeforeSwap);

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();

      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeSwap);
      expect(mockReceiveFor.mock.calls[requestCountBeforeSwap][0]).not.toHaveProperty(
        'personalIbanProvider',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for the new customer rows when the previous customer used the Frick KYC fallback', async () => {
    let customerIdentity = 1;
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferreds: ReturnType<
      typeof createDeferred<(typeof activeChfYapealRow)[]>
    >[] = [];
    mockGetPersonalIbans.mockImplementation(() => {
      const deferred = createDeferred<(typeof activeChfYapealRow)[]>();
      rowsDeferreds.push(deferred);
      return deferred.promise;
    });

    const receiveForDeferreds: ReturnType<typeof createDeferred<BuyInfoOffer>>[] = [];
    mockReceiveFor.mockImplementation(() => {
      const deferred = createDeferred<BuyInfoOffer>();
      receiveForDeferreds.push(deferred);
      return deferred.promise;
    });

    const rendered = render(<BuyInfoScreen />);
    await settle();
    expect(mockGetPersonalIbans).toHaveBeenCalledTimes(1);

    await act(async () => {
      rowsDeferreds[0].resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      receiveForDeferreds[0].reject({ message: 'KycRequired' });
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    expect(mockReceiveFor.mock.calls[1][0]).not.toHaveProperty('personalIbanProvider');
    const requestCountBeforeSwap = mockReceiveFor.mock.calls.length;

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);
    await settle();

    expect(mockGetPersonalIbans).toHaveBeenCalledTimes(2);
    expect(mockReceiveFor).toHaveBeenCalledTimes(requestCountBeforeSwap);

    await act(async () => {
      rowsDeferreds[1].resolve([activeChfYapealRow]);
    });
    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeSwap),
    );
    expect(mockReceiveFor.mock.calls[requestCountBeforeSwap][0].personalIbanProvider).toBe(
      'Frick',
    );
  });

  it('requests Yapeal on the next quote after the legacy-provider toggle is clicked', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const receiveForDeferreds: ReturnType<typeof createDeferred<BuyInfoOffer>>[] = [];
    mockReceiveFor.mockImplementation(() => {
      const deferred = createDeferred<BuyInfoOffer>();
      receiveForDeferreds.push(deferred);
      return deferred.promise;
    });

    render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    await act(async () => {
      receiveForDeferreds[0].resolve(frickChfOffer());
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
    const requestCountBeforeToggle = mockReceiveFor.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }).click();
    });

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeToggle),
    );
    expect(mockReceiveFor.mock.calls[requestCountBeforeToggle][0].personalIbanProvider).toBe(
      'Yapeal',
    );
    await act(async () => {
      receiveForDeferreds[requestCountBeforeToggle].resolve(yapealChfOffer());
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor).toHaveBeenNthCalledWith(requestCountBeforeToggle + 1, {
      asset: { name: 'BTC', uniqueName: 'Bitcoin' },
      currency: { name: 'CHF' },
      externalTransactionId: undefined,
      amount: 100,
      personalIbanProvider: 'Yapeal',
    });
  });

  it('recovers from an unavailable toggled Yapeal provider without showing the Frick KYC hint', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) => {
      if (request.personalIbanProvider === 'Yapeal') {
        return Promise.reject({ message: 'PersonalIbanProviderNotAvailable' });
      }
      return Promise.resolve(
        request.personalIbanProvider === 'Frick'
          ? frickChfOffer()
          : chfOffer(),
      );
    });

    render(<BuyInfoScreen />);

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
        screen.getByRole('button', { name: 'Show available IBAN' }),
      ).toBeInTheDocument(),
    );
    const requestCountBeforeRecovery = mockReceiveFor.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Show available IBAN' }).click();
    });

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(
        requestCountBeforeRecovery,
      ),
    );
    expect(mockReceiveFor.mock.calls[requestCountBeforeRecovery][0]).not.toHaveProperty(
      'personalIbanProvider',
    );
    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();
  });

  it('recovers from an unavailable URL-selected provider without showing the Frick KYC hint', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockReceiveFor.mockImplementation((request: { personalIbanProvider?: string }) =>
      request.personalIbanProvider === 'Frick'
        ? Promise.reject({ message: 'PersonalIbanProviderNotAvailable' })
        : Promise.resolve(chfOffer()),
    );

    render(<BuyInfoScreen />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show available IBAN' }),
      ).toBeInTheDocument(),
    );
    const requestCountBeforeRecovery = mockReceiveFor.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Show available IBAN' }).click();
    });

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(
        requestCountBeforeRecovery,
      ),
    );
    expect(mockReceiveFor.mock.calls[requestCountBeforeRecovery][0]).not.toHaveProperty(
      'personalIbanProvider',
    );
    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();
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

    render(<BuyInfoScreen />);

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
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const receiveForDeferreds: ReturnType<typeof createDeferred<BuyInfoOffer>>[] = [];
    mockReceiveFor.mockImplementation(() => {
      const deferred = createDeferred<BuyInfoOffer>();
      receiveForDeferreds.push(deferred);
      return deferred.promise;
    });

    render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    await act(async () => {
      receiveForDeferreds[0].reject({ message: 'KycRequired' });
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    await act(async () => {
      receiveForDeferreds[1].resolve(yapealChfOffer());
    });

    await waitFor(() => expect(screen.getByText(FRICK_FALLBACK_HINT)).toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).toBeInTheDocument(),
    );
    const requestCountBeforeToggle = mockReceiveFor.mock.calls.length;

    await act(async () => {
      screen.getByRole('button', { name: 'Show Bank Frick IBAN' }).click();
    });

    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(requestCountBeforeToggle),
    );
    await act(async () => {
      receiveForDeferreds[requestCountBeforeToggle].resolve(frickChfOffer());
    });

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
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferreds: ReturnType<typeof createDeferred<(typeof activeChfYapealRow)[]>>[] = [];
    mockGetPersonalIbans.mockImplementation(() => {
      const deferred = createDeferred<(typeof activeChfYapealRow)[]>();
      rowsDeferreds.push(deferred);
      return deferred.promise;
    });

    const receiveForDeferreds: ReturnType<typeof createDeferred<BuyInfoOffer>>[] = [];
    mockReceiveFor.mockImplementation(() => {
      const deferred = createDeferred<BuyInfoOffer>();
      receiveForDeferreds.push(deferred);
      return deferred.promise;
    });

    const rendered = render(<BuyInfoScreen />);

    await waitFor(() => expect(mockGetPersonalIbans).toHaveBeenCalledTimes(1));
    await act(async () => {
      rowsDeferreds[0].resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    await act(async () => {
      receiveForDeferreds[0].resolve(frickChfOffer());
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }).click();
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    await act(async () => {
      receiveForDeferreds[1].resolve(yapealChfOffer());
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).toBeInTheDocument(),
    );
    const requestCountBeforeSwap = mockReceiveFor.mock.calls.length;

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);

    await waitFor(() => expect(mockGetPersonalIbans).toHaveBeenCalledTimes(2));
    await act(async () => {
      rowsDeferreds[1].resolve([]);
    });
    await waitFor(() =>
      expect(
        mockReceiveFor.mock.calls
          .slice(requestCountBeforeSwap)
          .some(([request]) => request.personalIbanProvider === undefined),
      ).toBe(true),
    );
    await act(async () => {
      receiveForDeferreds[requestCountBeforeSwap].resolve(chfOffer());
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show Bank Frick IBAN' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('continues with a normal quote when loading personal IBAN rows fails', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const quoteDeferred = createDeferred<ReturnType<typeof chfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.reject(new Error('row load failed'));
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');

    await act(async () => {
      quoteDeferred.resolve(chfOffer());
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Show legacy Yapeal IBAN' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show Bank Frick IBAN' }),
    ).not.toBeInTheDocument();
  });

  it('offers continue-without and Close for an unrecognized selector (A3)', async () => {
    mockPersonalIban.mockReturnValue('unknown-provider');
    mockRequestedPersonalIban.mockReturnValue('unknown-provider');
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor.mockResolvedValue(chfOffer());

    render(<BuyInfoScreen />);

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
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(mockReceiveFor).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    await settle();
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
  });

  it('shows the verification-failure acknowledgement copy instead of the mismatch copy', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockResolvedValue(
      frickOffer({ name: 'Customer B', iban: 'LI-UNVERIFIED-PERSONAL' }),
    );

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByText(VERIFY_HINT)).toBeInTheDocument());
    expect(screen.queryByText(MISMATCH_HINT)).not.toBeInTheDocument();
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');
  });

  it('passes the provider toggle through and shows the KYC fallback hint only after fallback', async () => {
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

    render(<BuyInfoScreen />);
    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(FRICK_FALLBACK_HINT)).toBeInTheDocument());
    const toFrickToggle = screen.getByRole('button', { name: 'Show Bank Frick IBAN' });
    expect(toFrickToggle).toBeInTheDocument();

    await act(async () => {
      toFrickToggle.click();
    });

    expect(screen.queryByText(FRICK_FALLBACK_HINT)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Show legacy Yapeal IBAN' }),
      ).toBeInTheDocument(),
    );
    expect(mockReceiveFor.mock.calls[mockReceiveFor.mock.calls.length - 1][0]).toHaveProperty(
      'personalIbanProvider',
      'Frick',
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

      render(<BuyInfoScreen />);
      await settle();
      expect(mockReceiveFor).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
      expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty(
        'personalIbanProvider',
      );

      await act(async () => {
        rowsDeferred.resolve([activeChfYapealRow]);
        await Promise.resolve();
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
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
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const quoteDeferred = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    const rendered = render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.resolve([activeChfYapealRow]);
    });
    expect(mockReceiveFor).not.toHaveBeenCalled();

    mockIsUserLoading.mockReturnValue(false);
    rendered.rerender(<BuyInfoScreen />);

    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      quoteDeferred.resolve(frickChfOffer());
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
  });

  it('does not delay the first quote when the user context is already loaded', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockReturnValue({ kyc: { level: 50 } });
    mockIsUserLoading.mockReturnValue(false);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const rowsDeferred = createDeferred<(typeof activeChfYapealRow)[]>();
    mockGetPersonalIbans.mockReturnValue(rowsDeferred.promise);

    const quoteDeferred = createDeferred<ReturnType<typeof frickChfOffer>>();
    mockReceiveFor.mockReturnValue(quoteDeferred.promise);

    render(<BuyInfoScreen />);

    await act(async () => {
      rowsDeferred.resolve([activeChfYapealRow]);
    });
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBe('Frick');

    await act(async () => {
      quoteDeferred.resolve(frickChfOffer());
    });

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await settle();
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

      render(<BuyInfoScreen />);
      await settle();
      expect(mockReceiveFor).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();

      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
      expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty(
        'personalIbanProvider',
      );
      await settle();
    } finally {
      jest.useRealTimers();
    }
  });

  it('replaces a fail-open quote when user loading resolves and never exposes it during the corrective request', async () => {
    jest.useFakeTimers();
    const userLoadDeferred = createDeferred<{ kyc: { level: number } }>();
    const quoteDeferreds: ReturnType<typeof createDeferred<ReturnType<typeof chfOffer>>>[] = [];
    try {
      let currentUser = { kyc: { level: 50 } };
      let isUserLoading = true;
      mockPersonalIban.mockReturnValue(undefined);
      mockRequestedPersonalIban.mockReturnValue(undefined);
      mockUser.mockImplementation(() => currentUser);
      mockIsUserLoading.mockImplementation(() => isUserLoading);
      mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
      mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
      mockReceiveFor.mockImplementation(() => {
        const deferred = createDeferred<ReturnType<typeof chfOffer>>();
        quoteDeferreds.push(deferred);
        return deferred.promise;
      });

      const rendered = render(<BuyInfoScreen />);
      await settle();
      expect(mockReceiveFor).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(10000);
        await Promise.resolve();
      });
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
      expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');

      await act(async () => {
        quoteDeferreds[0].resolve({
          ...chfOffer(),
          name: 'Old selector-less quote',
          iban: 'OLD-SELECTORLESS-IBAN',
        });
      });
      await settle();
      expect(screen.getByText('Old selector-less quote')).toBeInTheDocument();
      expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();

      await act(async () => {
        userLoadDeferred.resolve({ kyc: { level: 50 } });
        currentUser = await userLoadDeferred.promise;
        isUserLoading = false;
        rendered.rerender(<BuyInfoScreen />);
      });
      await settle();

      expect(mockReceiveFor).toHaveBeenCalledTimes(2);
      expect(mockReceiveFor.mock.calls[1][0].personalIbanProvider).toBe('Frick');
      expect(screen.queryByText('Old selector-less quote')).not.toBeInTheDocument();
      expect(screen.queryByText(TRANSFER_BUTTON)).not.toBeInTheDocument();

      await act(async () => {
        quoteDeferreds[1].resolve(frickChfOffer());
      });
      await settle();

      expect(screen.getByTestId('payment-info')).toHaveTextContent('LI35088110102979K002E');
      expect(screen.queryByText('Old selector-less quote')).not.toBeInTheDocument();
      expect(screen.getByText(TRANSFER_BUTTON)).toBeInTheDocument();
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

    const rendered = render(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);
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
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));
    mockReceiveFor
      .mockReturnValueOnce(staleQuote.promise)
      .mockResolvedValue(frickChfOffer());

    const rendered = render(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);
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

    const rendered = render(<BuyInfoScreen />);
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
    rendered.rerender(<BuyInfoScreen />);

    await waitFor(() =>
      expect(
        screen.getByText('The requested personal IBAN provider is not recognized.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: CONTINUE_WITHOUT })).toBeInTheDocument();
    expect(mockReceiveFor).toHaveBeenCalledTimes(requestCountBeforeSwap);
    await settle();
  });

  it('requires a fresh mismatch acknowledgement after the customer identity changes', async () => {
    let customerIdentity = 1;
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));
    mockReceiveFor.mockResolvedValue(usdOffer());

    const rendered = render(<BuyInfoScreen />);
    await waitFor(() => expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: CONTINUE_WITHOUT }).click();
    });
    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByText(MISMATCH_HINT)).toBeInTheDocument());
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps the completed payment information after a user-context re-quote completes', async () => {
    let currentUser = { kyc: { level: 50 } };
    mockPersonalIban.mockReturnValue(undefined);
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockUser.mockImplementation(() => currentUser);
    mockIsUserLoading.mockReturnValue(false);
    mockGetPersonalIbans.mockResolvedValue([activeChfYapealRow]);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'CHF' }));

    const quoteA = {
      ...frickChfOffer(),
      id: 10,
      iban: 'LI-COMPLETED-QUOTE-A',
    };
    const quoteB = {
      ...yapealChfOffer(),
      id: 11,
    };
    const quoteADeferred = createDeferred<typeof quoteA>();
    const quoteBDeferred = createDeferred<typeof quoteB>();
    mockReceiveFor
      .mockReturnValueOnce(quoteADeferred.promise)
      .mockReturnValueOnce(quoteBDeferred.promise);

    const rendered = render(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

    await act(async () => {
      quoteADeferred.resolve(quoteA);
    });
    await waitFor(() =>
      expect(screen.getByTestId('payment-info')).toHaveTextContent('LI-COMPLETED-QUOTE-A'),
    );

    await act(async () => {
      screen.getByRole('button', { name: TRANSFER_BUTTON }).click();
    });
    expect(screen.getByTestId('buy-completion')).toHaveTextContent('LI-COMPLETED-QUOTE-A');

    currentUser = { kyc: { level: 0 } };
    rendered.rerender(<BuyInfoScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('buy-completion')).toHaveTextContent('LI-COMPLETED-QUOTE-A');

    await act(async () => {
      quoteBDeferred.resolve(quoteB);
    });
    await settle();

    expect(screen.getByTestId('buy-completion')).toHaveTextContent('LI-COMPLETED-QUOTE-A');
    expect(screen.getByTestId('buy-completion')).not.toHaveTextContent(activeChfYapealRow.iban);
  });

  it('does not carry completion state into a quote for another customer identity', async () => {
    let customerIdentity = 1;
    mockCustomerIdentity.mockImplementation(() => customerIdentity);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));
    mockReceiveFor.mockImplementation(() =>
      Promise.resolve(
        frickOffer({
          iban: customerIdentity === 1 ? 'LI-FIRST-CUSTOMER' : 'LI-SECOND-CUSTOMER',
        }),
      ),
    );

    const rendered = render(<BuyInfoScreen />);
    await waitFor(() => expect(screen.getByText('LI-FIRST-CUSTOMER')).toBeInTheDocument());

    await act(async () => {
      screen.getByRole('button', { name: TRANSFER_BUTTON }).click();
    });
    expect(screen.getByTestId('buy-completion')).toHaveTextContent('LI-FIRST-CUSTOMER');

    customerIdentity = 2;
    rendered.rerender(<BuyInfoScreen />);
    await settle();

    expect(screen.queryByTestId('buy-completion')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-info')).toHaveTextContent('LI-SECOND-CUSTOMER');
    expect(screen.getByRole('button', { name: TRANSFER_BUTTON })).toBeInTheDocument();
  });
});
