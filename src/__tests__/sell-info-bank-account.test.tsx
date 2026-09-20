const mockCreateAccount = jest.fn();
const mockReceiveFor = jest.fn();
const mockGetAccount = jest.fn();
const mockTranslate = (_ns: string, key: string) => key;
const mockEmptyList: never[] = [];

const chf = { name: 'CHF', sellable: true };
const eth = { name: 'ETH', uniqueName: 'Ethereum/ETH', blockchain: 'Ethereum' };

jest.mock('@dfx.swiss/react', () => ({
  TransactionError: {},
  TransactionType: { SELL: 'Sell' },
  Utils: { formatAmountCrypto: (n: number) => String(n) },
  Validations: { Iban: () => ({ validate: () => true }) },
  useAsset: () => ({ getAsset: (_list: any[], name?: string) => (name ? eth : undefined) }),
  useAssetContext: () => ({ getAssets: () => [eth] }),
  useBankAccount: () => ({ getAccount: mockGetAccount }),
  useBankAccountContext: () => ({
    bankAccounts: mockEmptyList,
    createAccount: (...args: unknown[]) => mockCreateAccount(...args),
  }),
  useFiat: () => ({ getCurrency: () => chf }),
  useSell: () => ({ currencies: [chf], receiveFor: (...args: unknown[]) => mockReceiveFor(...args) }),
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
  useAppParams: () => ({
    assetIn: 'ETH',
    assetOut: 'CHF',
    amountIn: '0.1',
    amountOut: undefined,
    bankAccount: 'DE89370400440532013000',
    externalTransactionId: undefined,
    availableBlockchains: ['Ethereum'],
  }),
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
    mockGetAccount.mockReturnValue(undefined);
    mockReceiveFor.mockResolvedValue({});
    mockCreateAccount.mockRejectedValue({ message: 'You cannot add an IBAN to a KYC only account' });
  });

  it('shows the translated add-bank-account failure and not the raw API message', async () => {
    await act(async () => {
      render(<SellInfoScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('error-hint')).toHaveTextContent('The bank account could not be added.');
    expect(screen.queryByText(/Failed to create bank account/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You cannot add an IBAN to a KYC only account/)).not.toBeInTheDocument();
  });
});
