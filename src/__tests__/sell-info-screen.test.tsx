const mockReceiveFor = jest.fn();
const mockCreateAccount = jest.fn();
const mockValidateIban = jest.fn();
const mockCloseServices = jest.fn();
const mockSendTransaction = jest.fn();
const mockCanSendTransaction = jest.fn();
const mockGetTransactionByRequestId = jest.fn();

const mockEth = { name: 'ETH', blockchain: 'Ethereum' };
const mockChf = { name: 'CHF' };
const mockAssets = [mockEth, { name: 'BTC', blockchain: 'Bitcoin' }];
const mockCurrencies = [mockChf, { name: 'EUR' }];
const mockAllowedCountries: unknown[] = [];
const mockBankAccount = { id: 1, iban: 'CH9300762011623852957' };
let mockBankAccounts: { id: number; iban: string }[] | undefined;
let mockAppParams: Record<string, unknown>;
let mockActiveWallet: string | undefined;

const mockGetAssets = () => mockAssets;
const mockFindByName = (list: { name: string }[], name?: string) => list.find((i) => i.name === name);
const mockGetAccount = (accounts: { iban: string }[], iban: string) => accounts.find((a) => a.iban === iban);

jest.mock('@dfx.swiss/react', () => ({
  TransactionError: {
    AMOUNT_TOO_LOW: 'AmountTooLow',
    AMOUNT_TOO_HIGH: 'AmountTooHigh',
    LIMIT_EXCEEDED: 'LimitExceeded',
    KYC_REQUIRED: 'KycRequired',
    KYC_DATA_REQUIRED: 'KycDataRequired',
    KYC_REQUIRED_INSTANT: 'KycRequiredInstant',
    BANK_TRANSACTION_MISSING: 'BankTransactionMissing',
    BANK_TRANSACTION_OR_VIDEO_MISSING: 'BankTransactionOrVideoMissing',
    VIDEO_IDENT_REQUIRED: 'VideoIdentRequired',
    NATIONALITY_NOT_ALLOWED: 'NationalityNotAllowed',
    IBAN_CURRENCY_MISMATCH: 'IbanCurrencyMismatch',
    PAYMENT_METHOD_NOT_ALLOWED: 'PaymentMethodNotAllowed',
    TRADING_NOT_ALLOWED: 'TradingNotAllowed',
    RECOMMENDATION_REQUIRED: 'RecommendationRequired',
    EMAIL_REQUIRED: 'EmailRequired',
  },
  TransactionType: { SELL: 'Sell' },
  Utils: {
    formatAmount: (n: number) => String(n),
    formatAmountCrypto: (n: number) => String(n),
    formatIban: (iban: string) => iban,
  },
  Validations: { Iban: () => ({ validate: (iban: string) => mockValidateIban(iban) }) },
  useAsset: () => ({ getAsset: mockFindByName }),
  useAssetContext: () => ({ getAssets: mockGetAssets }),
  useBankAccount: () => ({ getAccount: mockGetAccount }),
  useBankAccountContext: () => ({
    bankAccounts: mockBankAccounts,
    createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  }),
  useFiat: () => ({ getCurrency: mockFindByName }),
  useSell: () => ({
    get currencies() {
      return mockCurrencies;
    },
    receiveFor: (...args: unknown[]) => mockReceiveFor(...args),
  }),
  useTransaction: () => ({
    getTransactionByRequestId: (...args: unknown[]) => mockGetTransactionByRequestId(...args),
  }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  AlignContent: {},
  CopyButton: () => null,
  DfxIcon: () => null,
  IconColor: {},
  IconSize: {},
  IconVariant: {},
  SpinnerSize: {},
  SpinnerVariant: {},
  StyledButton: ({ label, onClick, isLoading }: any) => (
    <button
      type="button"
      aria-busy={isLoading}
      onClick={() => {
        Promise.resolve(onClick()).catch(() => undefined);
      }}
    >
      {label}
    </button>
  ),
  StyledButtonColor: {},
  StyledButtonWidth: {},
  StyledDataTable: ({ children }: any) => <div>{children}</div>,
  StyledDataTableRow: ({ label, children }: any) => (
    <div>
      {label}
      {children}
    </div>
  ),
  StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
  StyledInfoTextSize: {},
  StyledLink: ({ label }: any) => <div>{label}</div>,
  StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/components/payment/payment-info-sell', () => ({
  PaymentInformationContent: ({ info }: any) => <div data-testid="payment-info">{info.uid}</div>,
}));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: any) => <div data-testid="quote-error">{error}</div>,
}));
jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { SELL: 'sell', CANCEL: 'cancel' },
  useAppHandlingContext: () => ({ closeServices: mockCloseServices }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    allowedCountries: mockAllowedCountries,
    translate: (_namespace: string, key: string) => key,
  }),
}));
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ activeWallet: mockActiveWallet }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('../hooks/app-params.hook', () => ({ useAppParams: () => mockAppParams }));
jest.mock('../hooks/guard.hook', () => ({ useAddressGuard: () => undefined }));
jest.mock('../hooks/layout-config.hook', () => ({ useLayoutOptions: () => undefined }));
jest.mock('src/hooks/tx-helper.hook', () => ({
  useTxHelper: () => ({
    sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
    canSendTransaction: () => mockCanSendTransaction(),
  }),
}));

import { act, cleanup, render, screen } from '@testing-library/react';
import SellInfoScreen from 'src/screens/sell-info.screen';

const completionText = 'Nice! You are all set! Give us a minute to handle your transaction.';
const confirmLabel = 'Complete transaction in your wallet';

function baseAppParams(overrides: Record<string, unknown> = {}) {
  return {
    assetIn: 'ETH',
    assetOut: 'CHF',
    amountIn: '0.1',
    amountOut: undefined,
    bankAccount: mockBankAccount.iban,
    externalTransactionId: 'ext-1',
    availableBlockchains: ['Ethereum'],
    ...overrides,
  };
}

function quote(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    uid: `uid-${id}`,
    timestamp: new Date().toISOString(),
    amount: 0.1,
    estimatedAmount: 250,
    currency: mockChf,
    asset: mockEth,
    beneficiary: { iban: mockBankAccount.iban, name: 'DFX AG' },
    minVolume: 0.001,
    maxVolume: 100,
    rate: 2500,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

async function renderScreen() {
  const view = render(<SellInfoScreen />);
  await flush();
  return view;
}

async function advance(milliseconds: number) {
  await act(async () => {
    jest.advanceTimersByTime(milliseconds);
  });
  await flush();
}

// The first tick renders the running countdown before the rest of the 15 minutes passes.
async function expireQuote() {
  await advance(1000);
  await advance(15 * 60 * 1000);
}

async function clickButton(name: string) {
  await act(async () => {
    screen.getByRole('button', { name }).click();
  });
  await flush();
}

async function expectCloseWithFirstOrder() {
  await clickButton('Close');
  expect(mockCloseServices).toHaveBeenCalledTimes(1);
  expect(mockCloseServices).toHaveBeenCalledWith(
    { type: 'sell', isComplete: true, sell: expect.objectContaining({ uid: 'uid-1' }) },
    false,
  );
}

describe('SellInfoScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockBankAccounts = [mockBankAccount];
    mockAppParams = baseAppParams();
    mockActiveWallet = 'mm';
    mockCanSendTransaction.mockReturnValue(true);
    mockValidateIban.mockReturnValue(true);
    mockGetTransactionByRequestId.mockRejectedValue(new Error('Not Found'));
    let quotes = 0;
    mockReceiveFor.mockImplementation(() => {
      quotes += 1;
      return Promise.resolve(quote(quotes));
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps the confirmed order when the quote expires on the completion view', async () => {
    mockSendTransaction.mockResolvedValue('0xtx');
    await renderScreen();
    await advance(1000);
    await clickButton(confirmLabel);
    expect(screen.getByText(completionText)).toBeInTheDocument();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);

    await expireQuote();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    await expectCloseWithFirstOrder();
  });

  it('does not refresh the quote while the wallet send is pending and closes with the confirmed order', async () => {
    let resolveSend: (value: unknown) => void = () => undefined;
    mockSendTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    await renderScreen();
    await advance(1000);
    await clickButton(confirmLabel);
    expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ uid: 'uid-1' }));

    await expireQuote();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSend('0xtx');
    });
    await flush();
    expect(screen.getByText(completionText)).toBeInTheDocument();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    await expectCloseWithFirstOrder();
  });

  it('refreshes a quote that expired during a wallet send once the send fails', async () => {
    let rejectSend: (error: unknown) => void = () => undefined;
    mockSendTransaction.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSend = reject;
        }),
    );
    await renderScreen();
    await advance(1000);
    await clickButton(confirmLabel);
    await expireQuote();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);

    await act(async () => {
      rejectSend({ code: 4001 });
    });
    await flush();
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('payment-info')).toHaveTextContent('uid-2');
    expect(screen.queryByText(completionText)).not.toBeInTheDocument();
  });

  it('completes with the order the status poll resolved', async () => {
    await renderScreen();
    await advance(5000);
    expect(mockGetTransactionByRequestId).toHaveBeenCalledWith(1);
    expect(screen.queryByText(completionText)).not.toBeInTheDocument();

    mockGetTransactionByRequestId.mockResolvedValue({ inputTxId: '0xin' });
    await advance(5000);
    expect(screen.getByText(completionText)).toBeInTheDocument();
    expect(screen.getByText('0xin')).toBeInTheDocument();

    await expireQuote();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    await expectCloseWithFirstOrder();
  });

  it('refreshes an expired quote on the form', async () => {
    await renderScreen();
    expect(screen.getByTestId('payment-info')).toHaveTextContent('uid-1');
    await advance(1000);

    let resolveQuote: (value: unknown) => void = () => undefined;
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        }),
    );
    await advance(15 * 60 * 1000);
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    await act(async () => {
      resolveQuote(quote(2));
    });
    await flush();
    expect(screen.getByTestId('payment-info')).toHaveTextContent('uid-2');
  });

  it('closes as not complete when no wallet is connected', async () => {
    mockActiveWallet = undefined;
    await renderScreen();
    await clickButton(confirmLabel);
    expect(mockSendTransaction).not.toHaveBeenCalled();
    expect(mockCloseServices).toHaveBeenCalledWith(
      { type: 'sell', isComplete: false, sell: expect.objectContaining({ uid: 'uid-1' }) },
      false,
    );
  });

  it('completes without sending when the wallet can no longer send', async () => {
    await renderScreen();
    mockCanSendTransaction.mockReturnValue(false);
    await clickButton(confirmLabel);
    expect(mockSendTransaction).not.toHaveBeenCalled();
    expect(screen.getByText(completionText)).toBeInTheDocument();
  });

  it('offers no wallet button when the wallet cannot send', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    await renderScreen();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: confirmLabel })).not.toBeInTheDocument();
  });

  it('requests the spend amount', async () => {
    await renderScreen();
    expect(mockReceiveFor).toHaveBeenCalledWith({
      asset: mockEth,
      currency: mockChf,
      iban: mockBankAccount.iban,
      externalTransactionId: 'ext-1',
      exactPrice: true,
      amount: 0.1,
    });
  });

  it('requests the target amount when only amount-out is present', async () => {
    mockAppParams = baseAppParams({ amountIn: undefined, amountOut: '250', availableBlockchains: undefined });
    await renderScreen();
    expect(mockReceiveFor).toHaveBeenCalledWith(expect.objectContaining({ targetAmount: 250 }));
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('amount');
  });

  it('keeps the selected asset and currency when the parameters change', async () => {
    const { rerender } = await renderScreen();
    mockAppParams = baseAppParams({ assetIn: 'BTC', assetOut: 'EUR', amountIn: '0.2' });
    rerender(<SellInfoScreen />);
    await flush();
    expect(mockReceiveFor).toHaveBeenLastCalledWith(
      expect.objectContaining({ asset: mockEth, currency: mockChf, amount: 0.2 }),
    );
  });

  it('omits the beneficiary name when there is none', async () => {
    mockReceiveFor.mockResolvedValue(quote(1, { beneficiary: { iban: mockBankAccount.iban } }));
    await renderScreen();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.queryByText('Beneficiary name')).not.toBeInTheDocument();
  });

  it('reports missing route information', async () => {
    mockAppParams = baseAppParams({
      assetIn: undefined,
      assetOut: undefined,
      amountIn: undefined,
      bankAccount: undefined,
    });
    await renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Missing required information');
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('waits for the bank accounts', async () => {
    mockBankAccounts = undefined;
    await renderScreen();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('creates an unknown bank account once', async () => {
    let resolveAccount: (value: unknown) => void = () => undefined;
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccount = resolve;
        }),
    );
    mockBankAccounts = [];
    const { rerender } = await renderScreen();
    mockBankAccounts = [];
    rerender(<SellInfoScreen />);
    await flush();
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateAccount).toHaveBeenCalledWith({ iban: mockBankAccount.iban });

    await act(async () => {
      resolveAccount(mockBankAccount);
    });
    await flush();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('shows an error when the bank account cannot be created', async () => {
    mockCreateAccount.mockRejectedValue({ message: 'not supported' });
    mockBankAccounts = [];
    await renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Failed to create bank account: not supported');
  });

  it('shows an error for an invalid IBAN', async () => {
    mockValidateIban.mockReturnValue('iban_invalid');
    mockBankAccounts = [];
    await renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Invalid IBAN: iban_invalid');
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it.each([
    { error: {}, expectedMessage: 'Unknown error' },
    { error: { message: 'Quote failed' }, expectedMessage: 'Quote failed' },
  ])('shows the quote error $expectedMessage and retries', async ({ error, expectedMessage }) => {
    mockReceiveFor.mockRejectedValueOnce(error);
    await renderScreen();
    expect(screen.getByTestId('error-hint')).toHaveTextContent(expectedMessage);
    await clickButton('Retry');
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it.each([
    'AmountTooLow',
    'AmountTooHigh',
    'LimitExceeded',
    'KycRequired',
    'KycDataRequired',
    'KycRequiredInstant',
    'BankTransactionMissing',
    'BankTransactionOrVideoMissing',
    'VideoIdentRequired',
    'NationalityNotAllowed',
    'IbanCurrencyMismatch',
    'PaymentMethodNotAllowed',
    'TradingNotAllowed',
    'RecommendationRequired',
    'EmailRequired',
  ])('offers no payment for a quote with the error %s', async (error) => {
    mockReceiveFor.mockResolvedValue(quote(1, { error }));
    await renderScreen();
    expect(mockReceiveFor).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: confirmLabel })).not.toBeInTheDocument();
  });

  it('shows the minimum amount for a quote below it and cancels on close', async () => {
    mockReceiveFor.mockResolvedValue(quote(1, { error: 'AmountTooLow' }));
    await renderScreen();
    expect(screen.getByText('Entered amount is below minimum deposit of {{amount}} {{currency}}')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();

    await clickButton('Close');
    expect(mockCloseServices).toHaveBeenCalledTimes(1);
    expect(mockCloseServices).toHaveBeenCalledWith({ type: 'cancel' }, false);
  });

  it('shows the maximum amount for a quote above it', async () => {
    mockReceiveFor.mockResolvedValue(quote(1, { error: 'AmountTooHigh' }));
    await renderScreen();
    expect(screen.getByText('Entered amount is above maximum deposit of {{amount}} {{currency}}')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('shows the quote error hint for a quote that requires KYC', async () => {
    mockReceiveFor.mockResolvedValue(quote(1, { error: 'KycRequired' }));
    await renderScreen();
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  it('replaces the minimum amount with the quote error hint when the next quote requires KYC', async () => {
    const minimumText = 'Entered amount is below minimum deposit of {{amount}} {{currency}}';
    mockReceiveFor.mockResolvedValueOnce(quote(1, { error: 'AmountTooLow' }));
    const { rerender } = await renderScreen();
    expect(screen.getByText(minimumText)).toBeInTheDocument();

    mockReceiveFor.mockResolvedValueOnce(quote(2, { error: 'KycRequired' }));
    mockAppParams = baseAppParams({ amountIn: '0.2' });
    rerender(<SellInfoScreen />);
    await flush();
    expect(mockReceiveFor).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
    expect(screen.queryByText(minimumText)).not.toBeInTheDocument();
  });
});
