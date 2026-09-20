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
    paymentInfo: undefined,
    isFetchingPaymentInfo: false,
    lastEditedFieldRef: mockLastEditedFieldRef,
    paymentInfoError: undefined,
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
  BankAccountSelector: ({ onError }: any) => (
    <button type="button" data-testid="bank-account-error" onClick={() => onError?.('create failed')}>
      error
    </button>
  ),
}));
jest.mock('src/components/order/payment-info', () => ({
  PaymentInfo: ({ errorMessage }: any) => <div data-testid="payment-error">{errorMessage}</div>,
}));

import { fireEvent, render, screen } from '@testing-library/react';
import { OrderInterface } from 'src/components/order/order-interface';
import { OrderType } from 'src/hooks/order.hook';

describe('OrderInterface bank-account error channel', () => {
  it('shows BankAccountSelector onError through PaymentInfo errorMessage', () => {
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('payment-error')).toHaveTextContent('');
    fireEvent.click(screen.getByTestId('bank-account-error'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('create failed');
  });
});
