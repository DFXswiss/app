const mockCreateAccount = jest.fn();
const mockReceiveFor = jest.fn();
const mockGetAccount = jest.fn();
const mockTranslate = jest.fn();
const mockValidateIban = jest.fn();
const mockGetAsset = jest.fn();
const mockGetAssets = jest.fn();
const mockGetCurrency = jest.fn();
const mockGetTransactionByRequestId = jest.fn();
const mockStartTimer = jest.fn();
const mockSendTransaction = jest.fn();
const mockCanSendTransaction = jest.fn();
const mockCloseServices = jest.fn();

const mockUseAsset = jest.fn();
const mockUseAssetContext = jest.fn();
const mockUseBankAccount = jest.fn();
const mockUseBankAccountContext = jest.fn();
const mockUseFiat = jest.fn();
const mockUseSell = jest.fn();
const mockUseTransaction = jest.fn();
const mockUseWalletContext = jest.fn();
const mockUseCountdown = jest.fn();
const mockUseTxHelper = jest.fn();
const mockUseAppHandlingContext = jest.fn();
const mockUseSettingsContext = jest.fn();
const mockUseAppParams = jest.fn();

const mockTransactionError = {
  AMOUNT_TOO_LOW: 'AmountTooLow',
  AMOUNT_TOO_HIGH: 'AmountTooHigh',
  BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
  BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
  KYC_REQUIRED: 'KycRequired',
  KYC_DATA_REQUIRED: 'KycDataRequired',
  NAME_REQUIRED: 'NameRequired',
  KYC_REQUIRED_INSTANT: 'KycRequiredInstant',
  LIMIT_EXCEEDED: 'LimitExceeded',
  NATIONALITY_NOT_ALLOWED: 'NationalityNotAllowed',
  PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
  VIDEO_IDENT_REQUIRED: 'VideoIdentRequired',
  IBAN_CURRENCY_MISMATCH: 'IbanCurrencyMismatch',
  TRADING_NOT_ALLOWED: 'TradingNotAllowed',
  RECOMMENDATION_REQUIRED: 'RecommendationRequired',
  EMAIL_REQUIRED: 'EmailRequired',
};

const mockEmptyList: never[] = [];
const chf = { name: 'CHF', sellable: true };
const eth = { name: 'ETH', uniqueName: 'Ethereum/ETH', blockchain: 'Ethereum' };
const mockAssets = [eth];
const mockCurrencies = [chf];
const mockAvailableBlockchains = ['Ethereum'];
const mockBankAccount = {
  id: 1,
  iban: 'DE89370400440532013000',
  active: true,
  default: true,
  preferredCurrency: chf,
};
const mockWallet = { id: 7 };
const mockAppParams = {
  assetIn: 'ETH' as string | undefined,
  assetOut: 'CHF' as string | undefined,
  amountIn: '0.1' as string | undefined,
  amountOut: undefined as string | undefined,
  bankAccount: mockBankAccount.iban as string | undefined,
  externalTransactionId: undefined as string | undefined,
  availableBlockchains: mockAvailableBlockchains as string[] | undefined,
};

let mockBankAccounts: (typeof mockBankAccount)[] | undefined = [mockBankAccount];
let mockActiveWallet: typeof mockWallet | undefined;
let mockCountdownState = {
  timer: { minutes: 10, seconds: 0 },
  remainingSeconds: 600,
  startTimer: mockStartTimer,
};
let mockLastButtonAction: Promise<void> | undefined;
let mockCompleteAction: (() => Promise<void>) | undefined;

function makeSell(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    timestamp: new Date('2026-09-21T10:00:00.000Z'),
    estimatedAmount: 123.45,
    currency: chf,
    beneficiary: { iban: 'CH9300762011623852957', name: 'DFX AG' },
    rate: 0.0005,
    asset: eth,
    minVolume: 0.02,
    maxVolume: 3,
    ...overrides,
  };
}

jest.mock('@dfx.swiss/react', () => ({
  TransactionError: {
    AMOUNT_TOO_LOW: 'AmountTooLow',
    AMOUNT_TOO_HIGH: 'AmountTooHigh',
    BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
    BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
    KYC_REQUIRED: 'KycRequired',
    KYC_DATA_REQUIRED: 'KycDataRequired',
    NAME_REQUIRED: 'NameRequired',
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
  TransactionType: { BUY: 'Buy', SELL: 'Sell', SWAP: 'Swap', REFERRAL: 'Referral' },
  Utils: {
    formatAmountCrypto: (value: number) => String(value),
    formatIban: (iban: string) => iban,
    formatAmount: (value: number) => String(value),
  },
  Validations: { Iban: () => ({ validate: mockValidateIban }) },
  get useAsset() {
    return mockUseAsset;
  },
  get useAssetContext() {
    return mockUseAssetContext;
  },
  get useBankAccount() {
    return mockUseBankAccount;
  },
  get useBankAccountContext() {
    return mockUseBankAccountContext;
  },
  get useFiat() {
    return mockUseFiat;
  },
  get useSell() {
    return mockUseSell;
  },
  get useTransaction() {
    return mockUseTransaction;
  },
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: { RIGHT: 'right' },
  IconColor: { GRAY: 'gray' },
  SpinnerSize: { LG: 'lg' },
  SpinnerVariant: { LIGHT_MODE: 'light-mode' },
  StyledButton: ({ label, onClick, isLoading }: any) => {
    if (label === 'Complete transaction in your wallet') mockCompleteAction = onClick;
    return (
      <button
        type="button"
        data-loading={String(Boolean(isLoading))}
        disabled={Boolean(isLoading)}
        onClick={() => {
          mockLastButtonAction = onClick();
        }}
      >
        {label}
      </button>
    );
  },
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledDataTable: ({ children, label }: any) => (
    <section aria-label={label}>
      <h2>{label}</h2>
      {children}
    </section>
  ),
  StyledDataTableRow: ({ children, label, isLoading }: any) => (
    <div data-loading={String(Boolean(isLoading))}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  ),
  StyledInfoText: ({ children, isLoading }: any) => (
    <div data-testid="info-text" data-loading={String(Boolean(isLoading))}>
      {children}
    </div>
  ),
  StyledInfoTextSize: { XS: 'xs' },
  StyledLink: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledLoadingSpinner: ({ variant }: any) => (
    <div data-testid={variant === 'light-mode' ? 'inline-spinner' : 'spinner'} data-variant={variant} />
  ),
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/config/urls', () => ({ Urls: { termsAndConditions: 'https://dfx.swiss/terms' } }));
jest.mock('src/components/payment/payment-info-sell', () => ({
  PaymentInformationContent: ({ infoText }: any) => <div data-testid="payment-info">{infoText}</div>,
}));
jest.mock('src/contexts/wallet.context', () => ({
  get useWalletContext() {
    return mockUseWalletContext;
  },
}));
jest.mock('src/hooks/countdown.hook', () => ({
  get useCountdown() {
    return mockUseCountdown;
  },
}));
jest.mock('src/hooks/tx-helper.hook', () => ({
  get useTxHelper() {
    return mockUseTxHelper;
  },
}));
const mockNavigate = jest.fn();
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/payment/sell-completion', () => ({
  SellCompletion: ({ txId }: any) => <div data-testid="sell-completion">{txId}</div>,
}));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: any) => <div data-testid="quote-error">{error}</div>,
}));
jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { SELL: 'Sell', CANCEL: 'Cancel' },
  get useAppHandlingContext() {
    return mockUseAppHandlingContext;
  },
}));
jest.mock('../contexts/settings.context', () => ({
  get useSettingsContext() {
    return mockUseSettingsContext;
  },
}));
jest.mock('../hooks/app-params.hook', () => ({
  get useAppParams() {
    return mockUseAppParams;
  },
}));
jest.mock('../hooks/guard.hook', () => ({ useAddressGuard: () => undefined }));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));

import { act, render, screen, waitFor } from '@testing-library/react';
import { CloseType } from '../contexts/app-handling.context';
import SellInfoScreen from 'src/screens/sell-info.screen';

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderHappyPath() {
  const result = render(<SellInfoScreen />);
  expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
  return result;
}

describe('SellInfoScreen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockBankAccounts = [mockBankAccount];
    mockActiveWallet = undefined;
    mockCountdownState = {
      timer: { minutes: 10, seconds: 0 },
      remainingSeconds: 600,
      startTimer: mockStartTimer,
    };
    mockLastButtonAction = undefined;
    mockCompleteAction = undefined;
    Object.assign(mockAppParams, {
      assetIn: 'ETH',
      assetOut: 'CHF',
      amountIn: '0.1',
      amountOut: undefined,
      bankAccount: mockBankAccount.iban,
      externalTransactionId: undefined,
      availableBlockchains: mockAvailableBlockchains,
    });

    mockTranslate.mockImplementation((_namespace: string, key: string, values?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? `{{${name}}}`)),
    );
    mockValidateIban.mockReturnValue(true);
    mockGetAsset.mockReturnValue(eth);
    mockGetAssets.mockReturnValue(mockAssets);
    mockGetCurrency.mockReturnValue(chf);
    mockGetAccount.mockImplementation((accounts: (typeof mockBankAccount)[] | undefined, iban: string) =>
      accounts?.find((account) => account.iban === iban),
    );
    mockCreateAccount.mockResolvedValue(mockBankAccount);
    mockReceiveFor.mockResolvedValue(makeSell());
    mockGetTransactionByRequestId.mockRejectedValue({ status: 404 });
    mockSendTransaction.mockResolvedValue('wallet-tx-id');
    mockCanSendTransaction.mockReturnValue(false);

    mockUseAsset.mockImplementation(() => ({ getAsset: mockGetAsset }));
    mockUseAssetContext.mockImplementation(() => ({ getAssets: mockGetAssets }));
    mockUseBankAccount.mockImplementation(() => ({ getAccount: mockGetAccount }));
    mockUseBankAccountContext.mockImplementation(() => ({
      bankAccounts: mockBankAccounts,
      createAccount: mockCreateAccount,
    }));
    mockUseFiat.mockImplementation(() => ({ getCurrency: mockGetCurrency }));
    mockUseSell.mockImplementation(() => ({ currencies: mockCurrencies, receiveFor: mockReceiveFor }));
    mockUseTransaction.mockImplementation(() => ({ getTransactionByRequestId: mockGetTransactionByRequestId }));
    mockUseWalletContext.mockImplementation(() => ({ activeWallet: mockActiveWallet }));
    mockUseCountdown.mockImplementation(() => mockCountdownState);
    mockUseTxHelper.mockImplementation(() => ({
      sendTransaction: mockSendTransaction,
      canSendTransaction: mockCanSendTransaction,
    }));
    mockUseAppHandlingContext.mockImplementation(() => ({ closeServices: mockCloseServices }));
    mockUseSettingsContext.mockImplementation(() => ({ allowedCountries: mockEmptyList, translate: mockTranslate }));
    mockUseAppParams.mockImplementation(() => mockAppParams);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('bank-account resolution', () => {
    it('uses an existing account, clears a prior validation error, and never creates a duplicate', async () => {
      mockBankAccounts = [];
      mockValidateIban.mockReturnValue('checksum failed');
      const { rerender } = render(<SellInfoScreen />);
      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Invalid IBAN: checksum failed');
      expect(mockCreateAccount).not.toHaveBeenCalled();

      mockBankAccounts = [mockBankAccount];
      rerender(<SellInfoScreen />);

      expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      expect(mockGetAccount).toHaveBeenCalledWith([mockBankAccount], mockBankAccount.iban);
      expect(mockCreateAccount).not.toHaveBeenCalled();
    });

    it('rejects an invalid IBAN before attempting account creation', async () => {
      mockBankAccounts = [];
      mockValidateIban.mockReturnValue('country not allowed');
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Invalid IBAN: country not allowed');
      expect(mockCreateAccount).not.toHaveBeenCalled();
      expect(mockReceiveFor).not.toHaveBeenCalled();
    });

    it.each([
      [
        { statusCode: 500, message: 'You cannot add an IBAN to a KYC only account' },
        'The bank account could not be added.',
      ],
      [{ message: 'Service unavailable' }, 'The bank account could not be added.'],
      [{}, 'The bank account could not be added.'],
    ])('maps account-creation failure %p to %s', async (apiError, expected) => {
      mockBankAccounts = [];
      mockCreateAccount.mockRejectedValue(apiError);
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('error-hint')).toHaveTextContent(expected);
      expect(screen.queryByTestId('info-text')).not.toBeInTheDocument();
      expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    });

    it('sends a KYC-only account to connect a wallet instead of the generic error box', async () => {
      mockBankAccounts = [];
      mockCreateAccount.mockRejectedValue({
        statusCode: 400,
        message: 'You cannot add an IBAN to a KYC only account',
      });
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('info-text')).toHaveTextContent(
        'A bank account can only be added once a wallet is linked to this account.',
      );
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

      screen.getByRole('button', { name: 'Connect your wallet' }).click();
      expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
    });

    it('points a multi-account IBAN at a support ticket', async () => {
      process.env.REACT_APP_PUBLIC_URL = 'http://localhost:3001/';
      mockBankAccounts = [];
      mockCreateAccount.mockRejectedValue({ statusCode: 400, message: 'Multi-account IBAN' });
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('info-text')).toHaveTextContent(
        'This is a multi-account IBAN and cannot be added as a personal account.',
      );
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    });

    it('retries account creation after a rejection and clears the error after success', async () => {
      mockBankAccounts = [];
      mockCreateAccount
        .mockRejectedValueOnce({ message: 'Service unavailable' })
        .mockResolvedValueOnce(mockBankAccount);
      render(<SellInfoScreen />);
      expect(await screen.findByTestId('error-hint')).toHaveTextContent('The bank account could not be added.');

      screen.getByRole('button', { name: 'Retry' }).click();

      expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
      expect(mockCreateAccount).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    });

    it.each(['resolve', 'reject'])('ignores a create %s after unmount', async (outcome) => {
      let finishCreate: (value?: unknown) => void = () => undefined;
      mockBankAccounts = [];
      mockCreateAccount.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            finishCreate = outcome === 'resolve' ? resolve : reject;
          }),
      );
      const { unmount } = render(<SellInfoScreen />);
      await settle();
      expect(mockCreateAccount).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => {
        finishCreate(outcome === 'resolve' ? mockBankAccount : { message: 'Service unavailable' });
        await Promise.resolve();
      });

      expect(mockReceiveFor).not.toHaveBeenCalled();
      expect(mockTranslate).not.toHaveBeenCalledWith('screens/sell', 'The bank account could not be added.');
    });

    it.each(['resolve', 'reject'])(
      'ignores a stale create %s after an existing account supersedes it',
      async (outcome) => {
        let finishCreate: (value?: unknown) => void = () => undefined;
        mockBankAccounts = [];
        mockCreateAccount.mockImplementation(
          () =>
            new Promise((resolve, reject) => {
              finishCreate = outcome === 'resolve' ? resolve : reject;
            }),
        );
        const { rerender } = render(<SellInfoScreen />);
        await settle();

        mockBankAccounts = [mockBankAccount];
        rerender(<SellInfoScreen />);
        expect(await screen.findByTestId('payment-info')).toBeInTheDocument();

        await act(async () => {
          finishCreate(
            outcome === 'resolve'
              ? { ...mockBankAccount, id: 2, iban: 'CH5604835012345678009' }
              : { message: 'Service unavailable' },
          );
          await Promise.resolve();
        });

        expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
        expect(mockReceiveFor).not.toHaveBeenCalledWith(expect.objectContaining({ iban: 'CH5604835012345678009' }));
      },
    );

    it.each(['resolve', 'reject'])(
      'ignores a create %s for an obsolete IBAN and processes the new one',
      async (outcome) => {
        let finishFirstCreate: (value?: unknown) => void = () => undefined;
        mockBankAccounts = [];
        mockCreateAccount.mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              finishFirstCreate = outcome === 'resolve' ? resolve : reject;
            }),
        );
        const frenchAccount = { ...mockBankAccount, id: 2, iban: 'FR1420041010050500013M02606' };
        mockCreateAccount.mockResolvedValueOnce(frenchAccount);

        const { rerender } = render(<SellInfoScreen />);
        await settle();
        expect(mockCreateAccount).toHaveBeenCalledWith({ iban: mockBankAccount.iban });

        mockAppParams.bankAccount = frenchAccount.iban;
        rerender(<SellInfoScreen />);
        expect(mockCreateAccount).toHaveBeenCalledTimes(2);
        expect(mockCreateAccount).toHaveBeenLastCalledWith({ iban: frenchAccount.iban });

        await act(async () => {
          finishFirstCreate(outcome === 'resolve' ? mockBankAccount : { message: 'Service unavailable' });
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(mockCreateAccount).toHaveBeenCalledTimes(2);
        expect(mockCreateAccount).toHaveBeenLastCalledWith({ iban: frenchAccount.iban });
        expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
        expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      },
    );
  });

  describe('required inputs and quote requests', () => {
    it('hides the old account quote as soon as the link requests a different IBAN', async () => {
      const { rerender } = await renderHappyPath();
      const previousQuoteCount = mockReceiveFor.mock.calls.length;
      mockAppParams.bankAccount = 'FR1420041010050500013M02606';
      mockCreateAccount.mockImplementation(() => new Promise(() => undefined));

      rerender(<SellInfoScreen />);

      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
      expect(mockReceiveFor).toHaveBeenCalledTimes(previousQuoteCount);
    });

    it('refuses an old completion action after the link requests a different IBAN', async () => {
      mockCanSendTransaction.mockReturnValue(true);
      const { rerender } = await renderHappyPath();
      const previousCompleteAction = mockCompleteAction;
      expect(previousCompleteAction).toBeDefined();

      mockAppParams.bankAccount = 'FR1420041010050500013M02606';
      mockCreateAccount.mockImplementation(() => new Promise(() => undefined));
      rerender(<SellInfoScreen />);
      await act(async () => {
        await previousCompleteAction?.();
      });

      expect(mockCloseServices).not.toHaveBeenCalled();
      expect(mockSendTransaction).not.toHaveBeenCalled();
    });

    it('ignores a quote for the previous IBAN when it resolves after the link changes', async () => {
      let finishOldQuote: (value: unknown) => void = () => undefined;
      mockReceiveFor.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldQuote = resolve;
          }),
      );
      const { rerender } = render(<SellInfoScreen />);
      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

      mockAppParams.bankAccount = 'FR1420041010050500013M02606';
      mockCreateAccount.mockImplementation(() => new Promise(() => undefined));
      rerender(<SellInfoScreen />);
      await act(async () => {
        finishOldQuote(makeSell());
        await Promise.resolve();
      });

      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    });

    it('ignores a failed quote for the previous IBAN after the link changes', async () => {
      let failOldQuote: (error: unknown) => void = () => undefined;
      mockReceiveFor.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failOldQuote = reject;
          }),
      );
      const { rerender } = render(<SellInfoScreen />);
      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));

      mockAppParams.bankAccount = 'FR1420041010050500013M02606';
      mockCreateAccount.mockImplementation(() => new Promise(() => undefined));
      rerender(<SellInfoScreen />);
      await act(async () => {
        failOldQuote({ message: 'Old quote failed' });
        await Promise.resolve();
      });

      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    });

    it('uses an empty blockchain filter when no available-blockchain parameter is provided', async () => {
      mockAppParams.availableBlockchains = undefined;
      await renderHappyPath();
      expect(mockGetAssets).toHaveBeenCalledWith([], { sellable: true, comingSoon: false });
    });

    it('does not let a finished create start another one after retry', async () => {
      let finishFirst: (value?: unknown) => void = () => undefined;
      mockAppParams.amountIn = undefined;
      mockAppParams.amountOut = undefined;
      mockBankAccounts = [];
      mockCreateAccount.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          }),
      );

      render(<SellInfoScreen />);
      await settle();
      expect(mockCreateAccount).toHaveBeenCalledTimes(1);
      expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();

      await act(async () => {
        screen.getByRole('button', { name: 'Retry' }).click();
      });
      await settle();
      expect(mockCreateAccount).toHaveBeenCalledTimes(2);

      await act(async () => {
        finishFirst(mockBankAccount);
      });
      await settle();
      expect(mockCreateAccount).toHaveBeenCalledTimes(2);
    });

    it('shows a missing-information error when the external input is incomplete', async () => {
      mockAppParams.amountIn = undefined;
      mockAppParams.bankAccount = undefined;
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Missing required information');
      expect(mockReceiveFor).not.toHaveBeenCalled();
    });

    it('waits without an error when the input is complete but accounts have not loaded', async () => {
      mockBankAccounts = undefined;
      render(<SellInfoScreen />);
      await settle();

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
      expect(mockGetAccount).not.toHaveBeenCalled();
      expect(mockCreateAccount).not.toHaveBeenCalled();
    });

    it('sends amountIn as an exact source amount', async () => {
      await renderHappyPath();
      const request = mockReceiveFor.mock.calls[mockReceiveFor.mock.calls.length - 1][0];
      expect(request).toEqual(
        expect.objectContaining({
          amount: 0.1,
          exactPrice: true,
          iban: mockBankAccount.iban,
          asset: eth,
          currency: chf,
        }),
      );
      expect(request).not.toHaveProperty('targetAmount');
    });

    it('sends amountOut as an exact target amount', async () => {
      mockAppParams.amountIn = undefined;
      mockAppParams.amountOut = '250.75';
      await renderHappyPath();

      const request = mockReceiveFor.mock.calls[mockReceiveFor.mock.calls.length - 1][0];
      expect(request).toEqual(expect.objectContaining({ targetAmount: 250.75, exactPrice: true }));
      expect(request).not.toHaveProperty('amount');
    });

    it.each([
      [{ message: 'Quote service unavailable' }, 'Quote service unavailable'],
      [{}, 'Unknown error'],
    ])('shows the appropriate receiveFor rejection for %p', async (rejection, expected) => {
      mockReceiveFor.mockRejectedValue(rejection);
      render(<SellInfoScreen />);

      expect(await screen.findByTestId('error-hint')).toHaveTextContent(expected);
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    });

    it('retries quote loading directly once the bank account already exists', async () => {
      mockReceiveFor.mockRejectedValueOnce({ message: 'Quote service unavailable' }).mockResolvedValueOnce(makeSell());
      render(<SellInfoScreen />);
      expect(await screen.findByTestId('error-hint')).toHaveTextContent('Quote service unavailable');

      screen.getByRole('button', { name: 'Retry' }).click();

      expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
      expect(mockReceiveFor).toHaveBeenCalledTimes(2);
      expect(mockCreateAccount).not.toHaveBeenCalled();
    });

    it('refreshes the quote when the countdown expires', async () => {
      const { rerender } = await renderHappyPath();
      mockCountdownState = {
        timer: { minutes: 0, seconds: 1 },
        remainingSeconds: 1,
        startTimer: mockStartTimer,
      };
      rerender(<SellInfoScreen />);

      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(2));
    });

    it('keeps the resolved asset and currency when only their external parameters change', async () => {
      const { rerender } = await renderHappyPath();
      expect(mockGetAsset).toHaveBeenCalledTimes(1);
      expect(mockGetCurrency).toHaveBeenCalledTimes(1);

      mockAppParams.assetIn = 'BTC';
      mockAppParams.assetOut = 'EUR';
      rerender(<SellInfoScreen />);

      await waitFor(() => expect(mockGetAssets).toHaveBeenCalledTimes(2));
      expect(mockGetAsset).toHaveBeenCalledTimes(1);
      expect(mockGetCurrency).toHaveBeenCalledTimes(1);
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    });
  });

  describe('quote validation', () => {
    it.each([
      [mockTransactionError.AMOUNT_TOO_LOW, 0.02, 'below minimum'],
      [mockTransactionError.AMOUNT_TOO_HIGH, 3, 'above maximum'],
    ])('formats the %s boundary with the configured volume and asset', async (error, volume, wording) => {
      mockReceiveFor.mockResolvedValue(makeSell({ error }));
      render(<SellInfoScreen />);

      await waitFor(() => {
        expect(mockTranslate).toHaveBeenCalledWith(
          'screens/payment',
          expect.stringContaining(wording),
          expect.objectContaining({ amount: String(volume), currency: 'ETH' }),
        );
      });
      expect(screen.getByTestId('info-text')).toHaveTextContent(wording);
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    });

    it.each([
      mockTransactionError.LIMIT_EXCEEDED,
      mockTransactionError.KYC_REQUIRED,
      mockTransactionError.KYC_DATA_REQUIRED,
      mockTransactionError.KYC_REQUIRED_INSTANT,
      mockTransactionError.BANK_TRANSACTION_MISSING,
      mockTransactionError.BANK_TRANSACTION_OR_VIDEO_MISSING,
      mockTransactionError.VIDEO_IDENT_REQUIRED,
      mockTransactionError.NATIONALITY_NOT_ALLOWED,
      mockTransactionError.IBAN_CURRENCY_MISMATCH,
      mockTransactionError.PAYMENT_METHOD_NOT_ALLOWED,
      mockTransactionError.TRADING_NOT_ALLOWED,
      mockTransactionError.RECOMMENDATION_REQUIRED,
      mockTransactionError.EMAIL_REQUIRED,
    ])('does not expose payment instructions for validation error %s', async (error) => {
      mockReceiveFor.mockResolvedValue(makeSell({ error }));
      render(<SellInfoScreen />);
      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
      await settle();

      expect(screen.getByTestId('quote-error')).toHaveTextContent(error);
      expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    });

    it('clears a prior amount validation state when a later quote is valid', async () => {
      mockReceiveFor
        .mockResolvedValueOnce(makeSell({ error: mockTransactionError.AMOUNT_TOO_LOW }))
        .mockResolvedValueOnce(makeSell());
      const { rerender } = render(<SellInfoScreen />);
      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
      await settle();

      mockAppParams.amountIn = '0.2';
      rerender(<SellInfoScreen />);

      expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
      expect(screen.queryByText(/below minimum/)).not.toBeInTheDocument();
    });

    it('clears a prior KYC validation state when a later quote is valid', async () => {
      mockReceiveFor
        .mockResolvedValueOnce(makeSell({ error: mockTransactionError.KYC_REQUIRED }))
        .mockResolvedValueOnce(makeSell());
      const { rerender } = render(<SellInfoScreen />);
      await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
      await settle();

      mockAppParams.amountIn = '0.2';
      rerender(<SellInfoScreen />);

      expect(await screen.findByTestId('payment-info')).toBeInTheDocument();
      expect(screen.queryByTestId('quote-error')).not.toBeInTheDocument();
    });

    it('closes a custom amount error with the cancel result', async () => {
      mockReceiveFor.mockResolvedValueOnce(makeSell()).mockImplementationOnce(() => ({
        then: (validate: (sell: ReturnType<typeof makeSell>) => void) => {
          validate(makeSell({ error: mockTransactionError.AMOUNT_TOO_LOW }));
          return new Promise(() => undefined);
        },
      }));
      const { rerender } = await renderHappyPath();

      mockAppParams.amountIn = '0.2';
      rerender(<SellInfoScreen />);

      expect(screen.getByTestId('info-text')).toHaveTextContent('Entered amount is below minimum deposit of 0.02 ETH');
      screen.getByRole('button', { name: 'Close' }).click();

      expect(mockCloseServices).toHaveBeenCalledTimes(1);
      expect(mockCloseServices).toHaveBeenCalledWith({ type: CloseType.CANCEL }, false);
    });

    it('shows the quote error while a refreshed KYC-invalid quote is being processed', async () => {
      mockReceiveFor.mockResolvedValueOnce(makeSell()).mockImplementationOnce(() => ({
        then: (validate: (sell: ReturnType<typeof makeSell>) => void) => {
          validate(makeSell({ error: mockTransactionError.KYC_REQUIRED }));
          return new Promise(() => undefined);
        },
      }));
      const { rerender } = await renderHappyPath();

      mockAppParams.amountIn = '0.2';
      rerender(<SellInfoScreen />);

      expect(screen.getByTestId('quote-error')).toHaveTextContent(mockTransactionError.KYC_REQUIRED);
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    });
  });

  describe('transaction polling', () => {
    it('ignores an old account poll that resolves after a new IBAN quote loads', async () => {
      jest.useFakeTimers();
      let finishOldPoll: (value: unknown) => void = () => undefined;
      mockGetTransactionByRequestId.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldPoll = resolve;
          }),
      );
      mockReceiveFor
        .mockResolvedValueOnce(makeSell())
        .mockResolvedValueOnce(makeSell({ id: 43, estimatedAmount: 246.9 }));
      const nextAccount = { ...mockBankAccount, id: 2, iban: 'FR1420041010050500013M02606' };
      mockCreateAccount.mockResolvedValue(nextAccount);

      const { rerender } = render(<SellInfoScreen />);
      await settle();
      act(() => jest.advanceTimersByTime(5000));
      expect(mockGetTransactionByRequestId).toHaveBeenCalledWith(42);

      mockAppParams.bankAccount = nextAccount.iban;
      rerender(<SellInfoScreen />);
      await settle();
      expect(screen.getByText('246.90 CHF')).toBeInTheDocument();

      await act(async () => {
        finishOldPoll({ inputTxId: 'old-account-tx' });
        await Promise.resolve();
      });
      expect(screen.queryByTestId('sell-completion')).not.toBeInTheDocument();
    });

    it('starts the expiry timer and shows completion when polling finds a transaction', async () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      mockGetTransactionByRequestId.mockResolvedValue({ inputTxId: 'polled-tx-id' });
      render(<SellInfoScreen />);
      await settle();

      expect(screen.getByTestId('payment-info')).toBeInTheDocument();
      expect(mockStartTimer).toHaveBeenCalledWith(new Date('2026-09-21T10:15:00.000Z'));

      act(() => {
        jest.advanceTimersByTime(5000);
      });
      await settle();

      expect(mockGetTransactionByRequestId).toHaveBeenCalledWith(42);
      expect(screen.getByTestId('sell-completion')).toHaveTextContent('polled-tx-id');
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('ignores a polling rejection and keeps showing the payment instructions', async () => {
      jest.useFakeTimers();
      mockGetTransactionByRequestId.mockRejectedValue({ status: 404 });
      render(<SellInfoScreen />);
      await settle();

      act(() => {
        jest.advanceTimersByTime(5000);
      });
      await settle();

      expect(mockGetTransactionByRequestId).toHaveBeenCalledWith(42);
      expect(screen.getByTestId('payment-info')).toBeInTheDocument();
      expect(screen.queryByTestId('sell-completion')).not.toBeInTheDocument();
    });

    it('clears an active polling interval when the screen unmounts', async () => {
      jest.useFakeTimers();
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      const { unmount } = render(<SellInfoScreen />);
      await settle();
      expect(screen.getByTestId('payment-info')).toBeInTheDocument();

      clearIntervalSpy.mockClear();
      unmount();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('payment details and wallet completion', () => {
    it('keeps a pending wallet send locked when the quote expires', async () => {
      let finishSend: (txId: string) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSend = resolve;
          }),
      );
      const { rerender } = await renderHappyPath();
      act(() => screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click());
      expect(mockSendTransaction).toHaveBeenCalledTimes(1);

      mockCountdownState = { ...mockCountdownState, remainingSeconds: 1 };
      rerender(<SellInfoScreen />);
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);
      const completeButton = screen.getByRole('button', { name: 'Complete transaction in your wallet' });
      expect(completeButton).toBeDisabled();
      completeButton.click();
      await mockCompleteAction?.();
      expect(mockSendTransaction).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishSend('wallet-tx-id');
        await mockLastButtonAction;
      });
      expect(screen.getByTestId('sell-completion')).toHaveTextContent('wallet-tx-id');
    });

    it('refreshes an expired quote after a pending wallet send fails', async () => {
      let rejectSend: (error: Error) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSend = reject;
          }),
      );
      mockReceiveFor
        .mockResolvedValueOnce(makeSell())
        .mockResolvedValueOnce(makeSell({ id: 43, estimatedAmount: 246.9 }));

      const { rerender } = await renderHappyPath();
      act(() => screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click());
      const action = mockLastButtonAction;
      if (!action) throw new Error('Expected a pending wallet send');
      const rejection = expect(action).rejects.toThrow('Wallet rejected');

      mockCountdownState = { ...mockCountdownState, remainingSeconds: 1 };
      rerender(<SellInfoScreen />);
      await settle();
      expect(mockReceiveFor).toHaveBeenCalledTimes(1);

      await act(async () => {
        rejectSend(new Error('Wallet rejected'));
        await rejection;
      });
      expect(await screen.findByText('246.90 CHF')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Complete transaction in your wallet' })).not.toBeDisabled();
    });

    it('ignores wallet completion after the screen unmounts', async () => {
      let finishSend: (txId: string) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSend = resolve;
          }),
      );

      const { unmount } = await renderHappyPath();
      act(() => screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click());
      unmount();
      await act(async () => {
        finishSend('old-wallet-tx');
        await mockLastButtonAction;
      });
      expect(mockCloseServices).not.toHaveBeenCalled();
    });

    it('ignores an old wallet send that resolves after a new IBAN quote loads', async () => {
      let finishOldSend: (txId: string) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldSend = resolve;
          }),
      );
      mockReceiveFor
        .mockResolvedValueOnce(makeSell())
        .mockResolvedValueOnce(makeSell({ id: 43, estimatedAmount: 246.9 }));
      const nextAccount = { ...mockBankAccount, id: 2, iban: 'FR1420041010050500013M02606' };
      mockCreateAccount.mockResolvedValue(nextAccount);

      const { rerender } = await renderHappyPath();
      act(() => screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click());
      expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));

      mockAppParams.bankAccount = nextAccount.iban;
      rerender(<SellInfoScreen />);
      expect(await screen.findByText('246.90 CHF')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Complete transaction in your wallet' })).toBeDisabled();
      await act(async () => {
        finishOldSend('old-account-tx');
        await mockLastButtonAction;
      });
      expect(screen.queryByTestId('sell-completion')).not.toBeInTheDocument();
    });

    it('renders all complete quote details and hides wallet completion when sending is unavailable', async () => {
      await renderHappyPath();

      expect(screen.getByRole('heading', { name: 'Transaction Details' })).toBeInTheDocument();
      expect(screen.getByText('123.45 CHF')).toBeInTheDocument();
      expect(screen.getByText('CH9300762011623852957')).toBeInTheDocument();
      expect(screen.getByText('DFX AG')).toBeInTheDocument();
      expect(screen.getByTestId('payment-info')).toHaveTextContent(
        'Please send the specified amount to the address below.',
      );
      expect(screen.getByText(/The exchange rate of 2000 CHF\/ETH is fixed for 10m 0s/)).toBeInTheDocument();
      expect(screen.getByText(/automatically accept our terms and conditions/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Complete transaction in your wallet' })).not.toBeInTheDocument();
    });

    it('omits the beneficiary-name row when the quote has no beneficiary name', async () => {
      mockReceiveFor.mockResolvedValue(makeSell({ beneficiary: { iban: 'CH9300762011623852957', name: '' } }));
      await renderHappyPath();

      expect(screen.queryByText('Beneficiary name')).not.toBeInTheDocument();
      expect(screen.getByText('CH9300762011623852957')).toBeInTheDocument();
    });

    it('marks the rate as loading when the countdown has reached zero', async () => {
      mockCountdownState = {
        timer: { minutes: 0, seconds: 0 },
        remainingSeconds: 600,
        startTimer: mockStartTimer,
      };
      await renderHappyPath();
      expect(screen.getByTestId('info-text')).toHaveAttribute('data-loading', 'true');
    });

    it('uses the seconds component when less than one minute remains', async () => {
      mockCountdownState = {
        timer: { minutes: 0, seconds: 30 },
        remainingSeconds: 30,
        startTimer: mockStartTimer,
      };
      await renderHappyPath();

      expect(screen.getByTestId('info-text')).toHaveAttribute('data-loading', 'false');
      expect(screen.getByText(/fixed for 0m 30s/)).toBeInTheDocument();
    });

    it('shows the inline light-mode spinner while refreshing an existing quote', async () => {
      let resolveRefresh: (value: unknown) => void = () => undefined;
      mockReceiveFor.mockResolvedValueOnce(makeSell()).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const { rerender } = await renderHappyPath();

      mockAppParams.amountIn = '0.2';
      rerender(<SellInfoScreen />);

      expect(await screen.findByTestId('inline-spinner')).toHaveAttribute('data-variant', 'light-mode');
      expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();

      await act(async () => {
        resolveRefresh(makeSell({ estimatedAmount: 246.9 }));
        await Promise.resolve();
      });
    });

    it('closes with an incomplete sell when sending is possible but no active wallet exists', async () => {
      mockCanSendTransaction.mockReturnValue(true);
      await renderHappyPath();

      const completeButton = screen.getByRole('button', { name: 'Complete transaction in your wallet' });
      completeButton.click();
      await settle();

      expect(mockCloseServices).toHaveBeenCalledWith(
        { type: 'Sell', isComplete: false, sell: expect.objectContaining({ id: 42 }) },
        false,
      );
      expect(mockSendTransaction).not.toHaveBeenCalled();
      expect(completeButton).toHaveAttribute('data-loading', 'true');
    });

    it('sends through the active wallet, waits for its transaction id, and shows completion', async () => {
      let resolveSend: (txId: string) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSend = resolve;
          }),
      );
      await renderHappyPath();

      const completeButton = screen.getByRole('button', { name: 'Complete transaction in your wallet' });
      act(() => completeButton.click());
      expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
      expect(completeButton).toHaveAttribute('data-loading', 'true');

      await act(async () => {
        resolveSend('wallet-tx-id');
        await Promise.resolve();
      });

      expect(screen.getByTestId('sell-completion')).toHaveTextContent('wallet-tx-id');
      expect(mockCloseServices).not.toHaveBeenCalled();
    });

    it('clears processing in finally when wallet sending rejects', async () => {
      let rejectSend: (error: Error) => void = () => undefined;
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      mockSendTransaction.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            rejectSend = reject;
          }),
      );
      await renderHappyPath();

      const completeButton = screen.getByRole('button', { name: 'Complete transaction in your wallet' });
      act(() => completeButton.click());
      expect(completeButton).toHaveAttribute('data-loading', 'true');

      const action = mockLastButtonAction;
      if (!action) throw new Error('Expected the button to retain the async click action');
      const rejection = expect(action).rejects.toThrow('Wallet rejected');
      await act(async () => {
        rejectSend(new Error('Wallet rejected'));
        await rejection;
      });

      expect(completeButton).toHaveAttribute('data-loading', 'false');
      expect(screen.queryByTestId('sell-completion')).not.toBeInTheDocument();
    });

    it('completes without sending when wallet sending becomes unavailable after render', async () => {
      mockActiveWallet = mockWallet;
      mockCanSendTransaction.mockReturnValue(true);
      await renderHappyPath();

      const completeButton = screen.getByRole('button', { name: 'Complete transaction in your wallet' });
      mockCanSendTransaction.mockReturnValue(false);
      completeButton.click();
      await settle();

      expect(mockSendTransaction).not.toHaveBeenCalled();
      expect(mockCloseServices).not.toHaveBeenCalled();
      expect(screen.getByTestId('sell-completion')).toBeEmptyDOMElement();
    });
  });
});
