const mockOnFetch = jest.fn();
const mockConfirm = jest.fn();
const mockHandlePaymentInfoFetch = jest.fn();
const mockLastEditedFieldRef = { current: 'source' };
const mockSession = { address: '0x1' };
const mockEmptyList: never[] = [];
const mockGetDefaultCurrency = (list: any[]) => list?.[0];
const mockGetAvailableCurrencies = () => mockEmptyList;
const mockGetAvailablePaymentMethods = () => mockEmptyList;
const mockHandlePaymentInfoFetchWrapper = (...args: unknown[]) => mockHandlePaymentInfoFetch(...args);
let mockPaymentInfoError: string | undefined;
let mockOrderPaymentInfo: { paymentInfo?: { id: number } } | undefined;

jest.mock('@dfx.swiss/react', () => ({
  Utils: { formatAmountCrypto: (n: number) => String(n), createRules: () => ({}) },
  Validations: { Required: undefined },
  useAuthContext: () => ({ session: mockSession }),
  useFiat: () => ({ getDefaultCurrency: mockGetDefaultCurrency }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  StyledButton: ({ label }: any) => <button type="button">{label}</button>,
  StyledButtonWidth: { FULL: 'full' },
  StyledDropdown: () => null,
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  StyledInfoText: ({ children }: any) => <div data-testid="bank-account-hint">{children}</div>,
  StyledLink: ({ label, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

jest.mock('src/config/labels', () => ({
  PaymentMethodDescriptions: {},
  PaymentMethodLabels: {},
}));
jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true }),
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: { current: null } }),
}));
jest.mock('src/contexts/order-ui.context', () => ({
  useOrderUIContext: () => ({ bankAccountSelection: false, setBankAccountSelection: jest.fn() }),
}));
const mockNavigate = jest.fn();
jest.mock('react-i18next', () => ({
  Trans: ({ children }: any) => children,
}));
jest.mock('src/hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ blockchain: undefined, hideTargetSelection: true }),
}));
jest.mock('src/hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => value,
}));
jest.mock('src/hooks/order.hook', () => ({
  OrderType: { BUY: 'buy', SELL: 'sell' },
  Side: { SOURCE: 'source', TARGET: 'target' },
  useOrder: () => ({
    isBuy: false,
    isSell: true,
    addressItems: mockEmptyList,
    cryptoBalances: mockEmptyList,
    paymentInfo: mockOrderPaymentInfo,
    isFetchingPaymentInfo: false,
    lastEditedFieldRef: mockLastEditedFieldRef,
    paymentInfoError: mockPaymentInfoError,
    amountError: undefined,
    kycError: undefined,
    setSelectedAddress: jest.fn(),
    getAvailableCurrencies: mockGetAvailableCurrencies,
    getAvailablePaymentMethods: mockGetAvailablePaymentMethods,
    handlePaymentInfoFetch: mockHandlePaymentInfoFetchWrapper,
  }),
}));
jest.mock('src/util/utils', () => ({ blankedAddress: (v: string) => v }));
jest.mock('src/components/order/asset-input', () => ({
  AssetInput: () => <div data-testid="asset-input" />,
}));
jest.mock('src/components/order/bank-account-selector', () => ({
  BankAccountSelector: ({ onChange, onError, onCreateStart, retryToken }: any) => (
    <div>
      <div data-testid="bank-account-retry-token">{retryToken}</div>
      <button type="button" data-testid="bank-account-error" onClick={() => onError?.('create failed', 'other')}>
        error
      </button>
      <button
        type="button"
        data-testid="bank-account-kyc"
        onClick={() => onError?.('You cannot add an IBAN to a KYC only account', 'kyc-only')}
      >
        kyc
      </button>
      <button
        type="button"
        data-testid="bank-account-multi"
        onClick={() => onError?.('Multi-account IBAN', 'multi-account')}
      >
        multi
      </button>
      <button type="button" data-testid="bank-account-create-start" onClick={() => onCreateStart?.()}>
        start
      </button>
      <button
        type="button"
        data-testid="bank-account-success"
        onClick={() => onChange?.({ id: 1, iban: 'CH9300762011623852957' })}
      >
        success
      </button>
    </div>
  ),
}));
jest.mock('src/components/order/payment-info', () => ({
  PaymentInfo: ({ errorMessage, retry, paymentInfo }: any) => (
    <div>
      <div data-testid="payment-error">{errorMessage}</div>
      {paymentInfo && <div data-testid="payment-body" />}
      <button type="button" data-testid="payment-retry" onClick={retry}>
        retry
      </button>
    </div>
  ),
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { OrderInterface } from 'src/components/order/order-interface';
import { OrderType } from 'src/hooks/order.hook';

describe('OrderInterface bank-account error channel', () => {
  beforeEach(() => {
    mockPaymentInfoError = undefined;
    mockOrderPaymentInfo = undefined;
    mockHandlePaymentInfoFetch.mockReset();
  });

  it('shows BankAccountSelector onError through PaymentInfo errorMessage', () => {
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
    fireEvent.click(screen.getByTestId('bank-account-error'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('create failed');
  });

  it('clears a bank-account error when a new attempt starts and after a successful selection', () => {
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    fireEvent.click(screen.getByTestId('bank-account-error'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('create failed');

    fireEvent.click(screen.getByTestId('bank-account-create-start'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');

    fireEvent.click(screen.getByTestId('bank-account-error'));
    fireEvent.click(screen.getByTestId('bank-account-success'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
  });

  it('shows a connect link instead of the raw API sentence for a KYC-only create', () => {
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    fireEvent.click(screen.getByTestId('bank-account-kyc'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
    expect(screen.getByTestId('bank-account-hint')).toHaveTextContent(
      'Before you can add a bank account, your DFX account needs a wallet.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connect a wallet' }));
    expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });

    fireEvent.click(screen.getByTestId('bank-account-create-start'));
    expect(screen.getByTestId('bank-account-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-body')).not.toBeInTheDocument();
  });

  it('hides an existing quote and its raw error while the connect hint is showing', () => {
    mockOrderPaymentInfo = { paymentInfo: { id: 1 } };
    mockPaymentInfoError = 'quote failed';
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    expect(screen.getByTestId('payment-body')).toBeInTheDocument();
    expect(screen.getByTestId('payment-error')).toHaveTextContent('quote failed');

    fireEvent.click(screen.getByTestId('bank-account-kyc'));
    expect(screen.queryByTestId('payment-body')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
    expect(screen.getByTestId('bank-account-hint')).toBeInTheDocument();

    mockHandlePaymentInfoFetch.mockClear();
    fireEvent.click(screen.getByTestId('payment-retry'));
    expect(mockHandlePaymentInfoFetch).not.toHaveBeenCalled();
  });

  it('cancels a quote that was already requested when the connect hint appears', () => {
    const cancel = jest.fn();
    mockHandlePaymentInfoFetch.mockReturnValue(cancel);
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    expect(mockHandlePaymentInfoFetch).toHaveBeenCalled();
    cancel.mockClear();
    mockHandlePaymentInfoFetch.mockClear();
    fireEvent.click(screen.getByTestId('bank-account-kyc'));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mockHandlePaymentInfoFetch).not.toHaveBeenCalled();
  });

  it('keeps a quote for an account that is already selected and clears the hint when another is chosen', () => {
    mockOrderPaymentInfo = { paymentInfo: { id: 1 } };
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
        defaultValues={{ bankAccount: { id: 7, iban: 'CH9300762011623852957' } }}
      />,
    );

    fireEvent.click(screen.getByTestId('bank-account-kyc'));
    expect(screen.getByTestId('bank-account-hint')).toBeInTheDocument();
    expect(screen.getByTestId('payment-body')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('bank-account-success'));
    expect(screen.queryByTestId('bank-account-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-body')).toBeInTheDocument();
  });

  it('shows the support hint instead of the raw API sentence for a multi-account create', () => {
    process.env.REACT_APP_PUBLIC_URL = 'http://localhost:3001/';
    render(
      <OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />,
    );

    fireEvent.click(screen.getByTestId('bank-account-multi'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
    expect(screen.getByTestId('bank-account-hint')).toHaveTextContent(
      'This is a multi-account IBAN and cannot be added as a personal account.',
    );
  });

  it('uses the visible retry action to start another bank-account attempt', () => {
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    expect(screen.getByTestId('bank-account-retry-token')).toHaveTextContent('0');
    fireEvent.click(screen.getByTestId('bank-account-error'));
    fireEvent.click(screen.getByTestId('payment-retry'));
    expect(screen.getByTestId('bank-account-retry-token')).toHaveTextContent('1');
    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
  });

  it('shows the blocking bank-account error before an older payment-info error', () => {
    mockPaymentInfoError = 'quote failed';
    render(<OrderInterface orderType={OrderType.SELL} onFetchPaymentInfo={mockOnFetch} confirmPayment={mockConfirm} />);

    expect(screen.getByTestId('payment-error')).toHaveTextContent('quote failed');
    fireEvent.click(screen.getByTestId('bank-account-error'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('create failed');
  });
});
