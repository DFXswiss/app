const mockReceiveFor = jest.fn();
const mockCloseServices = jest.fn();
const mockScrollToTop = jest.fn();
const mockUseAppParams = jest.fn();
const mockRequestedPersonalIban = jest.fn();
const mockPersonalIban = jest.fn();
let mockPersonalIbanApplicable = true;
let mockPersonalIbanErrorText: string | undefined;

const mockAssets = [{ name: 'BTC', uniqueName: 'Bitcoin', category: 'Public' }];
const mockCurrencies = [{ name: 'EUR', sellable: true }];
const mockFiatCurrencies = [{ name: 'EUR' }, { name: 'CHF' }];

jest.mock('@dfx.swiss/react', () => ({
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
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
  Utils: { formatAmount: (value: number) => String(value) },
  useAsset: () => ({
    getAsset: (assets: { name: string }[], name: string) => assets.find((asset) => asset.name === name),
  }),
  useAssetContext: () => ({ getAssets: () => mockAssets }),
  useBuy: () => ({
    get currencies() {
      return mockCurrencies;
    },
    receiveFor: (...args: unknown[]) => mockReceiveFor(...args),
  }),
  useFiat: () => ({
    getCurrency: (currencies: { name: string }[], name: string) =>
      currencies.find((currency) => currency.name === name),
  }),
  useFiatContext: () => ({ currencies: mockFiatCurrencies }),
  useUserContext: () => ({ user: { accountId: 1, kyc: { level: 0 } }, isUserLoading: false }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  SpinnerSize: { LG: 'lg' },
  StyledButton: ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledInfoText: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  StyledLink: ({ label }: { label: string }) => <div>{label}</div>,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('src/components/error-hint', () => ({
  ErrorHint: ({ message }: { message: string }) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('src/components/payment/buy-completion', () => ({
  BuyCompletion: () => <div data-testid="buy-completion" />,
}));
jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({ info }: { info: { id: number } }) => <div data-testid="payment-info">{info.id}</div>,
}));
jest.mock('src/components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: { error: string }) => <div data-testid="quote-error-hint">{error}</div>,
}));
jest.mock('src/contexts/app-handling.context', () => ({
  CloseType: { CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: mockScrollToTop }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_namespace: string, key: string, values?: { amount?: string; currency?: string }) =>
      values?.amount === undefined ? key : `${key}:${values.amount}:${values.currency}`,
  }),
}));
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ isInitialized: true }),
}));
jest.mock('src/hooks/app-params.hook', () => ({ useAppParams: () => mockUseAppParams() }));
jest.mock('src/hooks/guard.hook', () => ({ useAddressGuard: () => undefined }));
jest.mock('src/hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/personal-iban-rows.hook', () => ({
  usePersonalIbanRows: () => ({
    activePersonalIbans: [],
    personalIbanRowsSettled: true,
    userLoadTimedOut: false,
  }),
}));
jest.mock('src/hooks/personal-iban.hook', () => ({
  usePersonalIbanSelection: () => ({
    requestedPersonalIban: mockRequestedPersonalIban(),
    personalIban: mockPersonalIban(),
    customerIdentity: 1,
    hasAuthenticatedCustomer: true,
  }),
}));
jest.mock('src/util/api-error', () => ({
  getKycErrorFromMessage: (message: string | undefined) => (message === 'KycRequired' ? 'KycRequired' : undefined),
}));
jest.mock('src/util/personal-iban', () => ({
  deriveEffectivePersonalIbanProvider: ({
    providerOverride,
    personalIban,
  }: {
    providerOverride?: string;
    personalIban?: string;
  }) => providerOverride ?? personalIban,
  displayedFrickCurrencies: (names: string[] | undefined) => names ?? ['EUR', 'CHF'],
  getPersonalIbanErrorMessage: () => mockPersonalIbanErrorText,
  getPersonalIbanKycMessage: () => 'Personal IBAN requires KYC',
  getYapealAlternative: () => undefined,
  isExplicitPersonalIbanRequest: (selector: string | undefined) => selector === 'Frick',
  isKycRequiredMessage: (message: string | undefined) => message === 'KycRequired',
  isPersonalIbanApplicable: () => mockPersonalIbanApplicable,
  isUnrecognizedPersonalIbanSelector: (selector: string | undefined) => selector === 'mystery',
  isVerifiedFrickPersonalIbanResponse: () => false,
  isVerifiedYapealPersonalIbanResponse: () => false,
  personalIbanMismatchSentence: () => 'Personal IBAN currency mismatch',
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BuyInfoScreen from 'src/screens/buy-info.screen';

function appParams(overrides: Record<string, unknown> = {}) {
  return {
    assetIn: 'EUR',
    assetOut: 'BTC',
    amountIn: '100',
    amountOut: undefined,
    externalTransactionId: undefined,
    availableBlockchains: [],
    ...overrides,
  };
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: 88001,
    amount: 100,
    currency: { name: 'EUR' },
    estimatedAmount: 0.01,
    asset: { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public' },
    minVolume: 10,
    maxVolume: 1000,
    isValid: true,
    isPersonalIban: false,
    ...overrides,
  };
}

describe('BuyInfoScreen remaining coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppParams.mockReturnValue(appParams());
    mockRequestedPersonalIban.mockReturnValue(undefined);
    mockPersonalIban.mockReturnValue(undefined);
    mockPersonalIbanApplicable = true;
    mockPersonalIbanErrorText = undefined;
    mockReceiveFor.mockResolvedValue(offer());
  });

  it.each([
    {
      overrides: { assetIn: undefined, assetOut: undefined, amountIn: undefined, amountOut: undefined },
      description: 'missing amount',
    },
    { overrides: { assetIn: undefined }, description: 'missing input asset' },
    { overrides: { assetOut: undefined }, description: 'missing output asset' },
  ])('reports missing route information for $description', async ({ overrides }) => {
    mockUseAppParams.mockReturnValue(appParams(overrides));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Missing required information'));
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it.each([
    { overrides: { assetOut: 'UNKNOWN' }, description: 'asset' },
    { overrides: { assetIn: 'UNKNOWN' }, description: 'currency' },
  ])('keeps loading when the complete route has an unresolved $description', async ({ overrides }) => {
    mockUseAppParams.mockReturnValue(appParams(overrides));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('loading-spinner')).toBeInTheDocument());
    expect(screen.queryByText('Missing required information')).not.toBeInTheDocument();
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('requests a target amount when only amount-out is present', async () => {
    mockUseAppParams.mockReturnValue(appParams({ amountIn: undefined, amountOut: '0.25' }));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor).toHaveBeenCalledWith(
      expect.objectContaining({ targetAmount: 0.25, asset: mockAssets[0], currency: mockCurrencies[0] }),
    );
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('amount');
  });

  it.each([
    ['AmountTooLow', 'Entered amount is below minimum deposit of {{amount}} {{currency}}:10:EUR'],
    ['AmountTooHigh', 'Entered amount is above maximum deposit of {{amount}} {{currency}}:1000:EUR'],
  ])('shows and closes the %s amount error', async (error, expectedMessage) => {
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error }));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByText(expectedMessage)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps onboarding errors on the quote-error path', async () => {
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error: 'EmailRequired' }));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toHaveTextContent('EmailRequired'));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps a limit-exceeded quote on the action-capable error path', async () => {
    mockReceiveFor.mockResolvedValue(offer({ isValid: false, error: 'LimitExceeded' }));

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('quote-error-hint')).toHaveTextContent('LimitExceeded'));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it.each([
    { mappedError: 'Mapped unsupported selector', expectedMessage: 'Mapped unsupported selector' },
    { mappedError: undefined, expectedMessage: 'The requested personal IBAN provider is not recognized.' },
  ])(
    'shows an unrecognized selector error and closes it ($expectedMessage)',
    async ({ mappedError, expectedMessage }) => {
      mockRequestedPersonalIban.mockReturnValue('mystery');
      mockPersonalIbanErrorText = mappedError;

      render(<BuyInfoScreen />);

      await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent(expectedMessage));
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
      expect(mockReceiveFor).not.toHaveBeenCalled();
    },
  );

  it.each([
    { message: 'PersonalIbanProviderNotAvailable', showsAvailableIban: true },
    { message: 'PersonalIbanCurrencyNotSupported', showsAvailableIban: false },
    { message: undefined, showsAvailableIban: false },
  ])('maps provider error $message and marks only provider unavailability', async ({ message, showsAvailableIban }) => {
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockPersonalIban.mockReturnValue('Frick');
    mockPersonalIbanErrorText = 'Personal IBAN request failed';
    mockReceiveFor.mockRejectedValue({ message });

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Personal IBAN request failed'));
    expect(screen.queryByRole('button', { name: 'Show available IBAN' }) !== null).toBe(showsAvailableIban);
    expect(mockReceiveFor).toHaveBeenCalledWith(expect.objectContaining({ personalIbanProvider: 'Frick' }));
  });

  it.each([
    { error: {}, expectedMessage: 'Unknown error' },
    { error: { message: 'Quote failed' }, expectedMessage: 'Quote failed' },
  ])('shows the generic quote error $expectedMessage', async ({ error, expectedMessage }) => {
    mockReceiveFor.mockRejectedValue(error);

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent(expectedMessage));
  });

  it('retries a failed quote request', async () => {
    mockReceiveFor.mockRejectedValueOnce({}).mockResolvedValueOnce(offer());

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
  });

  it('closes the personal-IBAN mismatch acknowledgement', async () => {
    mockRequestedPersonalIban.mockReturnValue('Frick');
    mockPersonalIban.mockReturnValue('Frick');
    mockPersonalIbanApplicable = false;

    render(<BuyInfoScreen />);

    await waitFor(() => expect(screen.getByText('Personal IBAN currency mismatch')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });
});
