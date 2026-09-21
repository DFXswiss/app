const mockCreateAccount = jest.fn();
const mockReceiveFor = jest.fn();
const mockGetAccount = jest.fn();
const mockTranslate = jest.fn((_ns: string, key: string) => key);
const mockEmptyList: never[] = [];

const chf = { name: 'CHF', sellable: true };
const eth = { name: 'ETH', uniqueName: 'Ethereum/ETH', blockchain: 'Ethereum' };
const mockAssets = [eth];
const mockCurrencies = [chf];
const mockAvailableBlockchains = ['Ethereum'];
const mockGetAsset = (_list: any[], name?: string) => (name ? eth : undefined);
const mockGetAssets = () => mockAssets;
const mockGetCurrency = () => chf;
const mockAppParams = {
  assetIn: 'ETH',
  assetOut: 'CHF',
  amountIn: '0.1',
  amountOut: undefined,
  bankAccount: 'DE89370400440532013000',
  externalTransactionId: undefined,
  availableBlockchains: mockAvailableBlockchains,
};

jest.mock('@dfx.swiss/react', () => ({
  TransactionError: {},
  TransactionType: { SELL: 'Sell' },
  Utils: { formatAmountCrypto: (n: number) => String(n) },
  Validations: { Iban: () => ({ validate: () => true }) },
  useAsset: () => ({ getAsset: mockGetAsset }),
  useAssetContext: () => ({ getAssets: mockGetAssets }),
  useBankAccount: () => ({ getAccount: mockGetAccount }),
  useBankAccountContext: () => ({
    bankAccounts: mockEmptyList,
    createAccount: mockCreateAccount,
  }),
  useFiat: () => ({ getCurrency: mockGetCurrency }),
  useSell: () => ({ currencies: mockCurrencies, receiveFor: mockReceiveFor }),
  useTransaction: () => ({ getTransactionByRequestId: jest.fn() }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  IconColor: {},
  SpinnerSize: { LG: 'lg' },
  SpinnerVariant: {},
  StyledButton: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
  StyledButtonWidth: { MIN: 'min', FULL: 'full' },
  StyledDataTable: ({ children }: any) => <div>{children}</div>,
  StyledDataTableRow: ({ children }: any) => <div>{children}</div>,
  StyledInfoText: ({ children }: any) => <div>{children}</div>,
  StyledInfoTextSize: {},
  StyledLink: ({ label }: any) => <div>{label}</div>,
  StyledLoadingSpinner: () => <div data-testid="spinner" />,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  AlignContent: {},
}));

jest.mock('src/config/urls', () => ({ Urls: {} }));
jest.mock('src/components/payment/payment-info-sell', () => ({
  PaymentInformationContent: () => <div data-testid="payment-info" />,
}));
jest.mock('src/contexts/wallet.context', () => ({
  useWalletContext: () => ({ activeWallet: undefined }),
}));
jest.mock('src/hooks/countdown.hook', () => ({
  useCountdown: () => ({ timer: 0, remainingSeconds: 0, startTimer: jest.fn() }),
}));
jest.mock('src/hooks/tx-helper.hook', () => ({
  useTxHelper: () => ({ sendTransaction: jest.fn(), canSendTransaction: () => false }),
}));
jest.mock('../components/error-hint', () => ({
  ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div>,
}));
jest.mock('../components/payment/sell-completion', () => ({
  SellCompletion: () => null,
}));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: () => null,
}));
jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { SELL: 'Sell', CANCEL: 'Cancel' },
  useAppHandlingContext: () => ({ closeServices: jest.fn() }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ allowedCountries: mockEmptyList, translate: mockTranslate }),
}));
jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockAppParams,
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));

import { act, render, screen } from '@testing-library/react';
import SellInfoScreen from 'src/screens/sell-info.screen';

describe('SellInfoScreen bank-account create error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // react-scripts sets resetMocks: true, which strips the implementation from every
    // jest.fn before each test. Without this line translate() returns undefined and the
    // screen stores an empty error message.
    mockTranslate.mockImplementation((_ns: string, key: string) => key);
    mockAppParams.bankAccount = 'DE89370400440532013000';
    mockGetAccount.mockReturnValue(undefined);
    mockReceiveFor.mockResolvedValue({});
  });

  it.each([
    {
      apiMessage: 'You cannot add an IBAN to a KYC only account',
      expected: 'Before you can add a bank account, your DFX account needs a wallet.',
    },
    {
      apiMessage: 'Multi-account IBANs cannot be added here',
      expected: 'This is a multi-account IBAN and cannot be added as a personal account.',
    },
    {
      apiMessage: 'Service unavailable',
      expected: 'The bank account could not be added.',
    },
  ])('shows the translated $expected message for $apiMessage', async ({ apiMessage, expected }) => {
    mockCreateAccount.mockRejectedValue({ message: apiMessage });

    render(<SellInfoScreen />);

    expect(await screen.findByTestId('error-hint')).toHaveTextContent(expected);
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(apiMessage)).not.toBeInTheDocument();
  });

  it('retries account creation after a rejection and clears the bank-account error after success', async () => {
    mockCreateAccount
      .mockRejectedValueOnce({ message: 'Service unavailable' })
      .mockResolvedValueOnce({ id: 1, iban: mockAppParams.bankAccount });
    mockReceiveFor.mockImplementation(() => new Promise(() => undefined));

    render(<SellInfoScreen />);
    expect(await screen.findByTestId('error-hint')).toHaveTextContent('The bank account could not be added.');

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateAccount).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('does not handle a create rejection after unmount', async () => {
    let rejectCreate: (reason?: unknown) => void = () => undefined;
    mockCreateAccount.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }),
    );

    const { unmount } = render(<SellInfoScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      rejectCreate({ message: 'Service unavailable' });
      await Promise.resolve();
    });

    expect(mockTranslate).not.toHaveBeenCalledWith('screens/sell', 'The bank account could not be added.');
  });

  it('processes a bank-account parameter that changes during account creation', async () => {
    let resolveFirstCreate: (value: unknown) => void = () => undefined;
    mockCreateAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstCreate = resolve;
        }),
    );
    mockCreateAccount.mockImplementationOnce(() => new Promise(() => undefined));

    const { rerender } = render(<SellInfoScreen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCreateAccount).toHaveBeenCalledWith({ iban: 'DE89370400440532013000' });

    mockAppParams.bankAccount = 'FR1420041010050500013M02606';
    rerender(<SellInfoScreen />);
    expect(mockCreateAccount).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstCreate({ id: 1, iban: 'DE89370400440532013000' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockCreateAccount).toHaveBeenCalledTimes(2);
    expect(mockCreateAccount).toHaveBeenLastCalledWith({ iban: 'FR1420041010050500013M02606' });
  });
});
