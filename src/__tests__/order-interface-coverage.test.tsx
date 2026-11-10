const mockOnFetch = jest.fn();
const mockConfirm = jest.fn();
const mockHandlePaymentInfoFetch = jest.fn();
const mockSetSelectedAddress = jest.fn();
const mockSetBankAccountSelection = jest.fn();
const mockTranslateCall = jest.fn();
const mockFormatAmountCryptoCall = jest.fn();

const mockLastEditedFieldRef = { current: 'source' };
const mockRootRef = { current: null };
const mockSession = { address: '0x1' };
const mockUsd = { id: 10, name: 'USD' };
const mockChf = { id: 11, name: 'CHF' };
const mockEur = { id: 12, name: 'EUR' };
const mockBtc = { id: 1, name: 'BTC' };
const mockEth = { id: 2, name: 'ETH' };
const mockSourceAssets = [mockUsd, mockChf];
const mockSingleSourceAsset = [mockBtc];
const mockTargetAssets = [mockUsd, mockChf];
const mockAvailableCurrencies = [mockChf, mockUsd];
const mockPaymentMethods = ['bank', 'card'];
const mockAddresses = [
  { address: '0xaaa', label: 'Primary', chain: 'ethereum' },
  { address: 'bc1bbb', label: 'Savings', chain: 'bitcoin' },
];
const mockBalances = [{ asset: mockBtc, amount: 1.25 }];
const mockEmptyList: never[] = [];
const mockDebouncedData = { sourceAmount: '1' };

let mockIsBuy = false;
let mockIsSell = true;
let mockAddressItemsValue: typeof mockAddresses | never[] | undefined = mockEmptyList;
let mockCryptoBalancesValue: typeof mockBalances | never[] = mockEmptyList;
let mockAvailableCurrenciesValue: typeof mockAvailableCurrencies | undefined = mockEmptyList;
let mockAvailablePaymentMethodsValue: typeof mockPaymentMethods | undefined = mockEmptyList;
let mockDefaultCurrencyValue: typeof mockChf | undefined;
let mockPaymentInfoValue: { paymentInfo: string } | undefined;
let mockPaymentInfoError: string | undefined;
let mockAmountError: { key: string; defaultValue?: string; interpolation?: object; hideInfos?: boolean } | undefined;
let mockKycError: string | undefined;
let mockDebounceEnabled = true;
let mockHideTargetSelection = true;
let mockBlockchain: string | undefined;
let mockIsInitialized = true;
let mockSessionValue: typeof mockSession | undefined = mockSession;
let mockBankAccountSelection = false;

const mockGetDefaultCurrency = (list: typeof mockAvailableCurrencies | undefined) =>
  mockDefaultCurrencyValue ?? list?.[0];
const mockGetAvailableCurrencies = () => mockAvailableCurrenciesValue;
const mockGetAvailablePaymentMethods = () => mockAvailablePaymentMethodsValue;
const mockHandlePaymentInfoFetchWrapper = (...args: unknown[]) => mockHandlePaymentInfoFetch(...args);
const mockSetSelectedAddressWrapper = (...args: unknown[]) => mockSetSelectedAddress(...args);
const mockSetBankAccountSelectionWrapper = (...args: unknown[]) => mockSetBankAccountSelection(...args);
const mockTranslate = (namespace: string, key: string, defaultValue?: string, interpolation?: object) => {
  mockTranslateCall(namespace, key, defaultValue, interpolation);
  return key;
};

jest.mock('@dfx.swiss/react', () => ({
  Utils: {
    formatAmountCrypto: (amount: number) => {
      mockFormatAmountCryptoCall(amount);
      return `formatted:${amount}`;
    },
    createRules: () => ({}),
  },
  Validations: { Required: undefined },
  useAuthContext: () => ({ session: mockSessionValue }),
  useFiat: () => ({ getDefaultCurrency: mockGetDefaultCurrency }),
}));

jest.mock('@dfx.swiss/react-components', () => ({
  Form: ({ children }: any) => <div>{children}</div>,
  StyledButton: ({ label, onClick, disabled, hidden }: any) => (
    <button
      type="button"
      data-testid="fetch-payment-info"
      data-disabled={String(Boolean(disabled))}
      data-hidden={String(Boolean(hidden))}
      onClick={onClick}
    >
      {label}
    </button>
  ),
  StyledButtonWidth: { FULL: 'full' },
  StyledDropdown: ({ name, items, labelFunc, descriptionFunc }: any) => (
    <div data-testid={`${name}-dropdown`}>
      {items.map((item: unknown, index: number) => (
        <div key={index} data-testid={`${name}-option-${index}`}>
          <span>{labelFunc?.(item)}</span>
          <span>{descriptionFunc?.(item)}</span>
        </div>
      ))}
    </div>
  ),
  StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('src/config/labels', () => ({
  PaymentMethodDescriptions: { bank: 'Bank description', card: 'Card description' },
  PaymentMethodLabels: { bank: 'Bank transfer', card: 'Card' },
}));
jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: mockIsInitialized }),
}));
jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: mockRootRef }),
}));
jest.mock('src/contexts/order-ui.context', () => ({
  useOrderUIContext: () => ({
    bankAccountSelection: mockBankAccountSelection,
    setBankAccountSelection: mockSetBankAccountSelectionWrapper,
  }),
}));
jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: mockTranslate }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ blockchain: mockBlockchain, hideTargetSelection: mockHideTargetSelection }),
}));
jest.mock('src/hooks/debounce.hook', () => ({
  __esModule: true,
  default: () => (mockDebounceEnabled ? mockDebouncedData : undefined),
}));
jest.mock('src/hooks/order.hook', () => ({
  OrderType: { BUY: 'buy', SELL: 'sell' },
  Side: { SOURCE: 'source', TARGET: 'target' },
  useOrder: () => ({
    isBuy: mockIsBuy,
    isSell: mockIsSell,
    addressItems: mockAddressItemsValue,
    cryptoBalances: mockCryptoBalancesValue,
    paymentInfo: mockPaymentInfoValue,
    isFetchingPaymentInfo: false,
    lastEditedFieldRef: mockLastEditedFieldRef,
    paymentInfoError: mockPaymentInfoError,
    amountError: mockAmountError,
    kycError: mockKycError,
    setSelectedAddress: mockSetSelectedAddressWrapper,
    getAvailableCurrencies: mockGetAvailableCurrencies,
    getAvailablePaymentMethods: mockGetAvailablePaymentMethods,
    handlePaymentInfoFetch: mockHandlePaymentInfoFetchWrapper,
  }),
}));
jest.mock('src/util/utils', () => ({
  blankedAddress: (address: string, options: { width: number }) => `${address}@${options.width}`,
}));
jest.mock('src/components/order/asset-input', () => ({
  AssetInput: ({
    name,
    selectedItem,
    balanceFunc,
    onMaxButtonClick,
    onAmountChange,
    forceErrorMessage,
  }: any) => (
    <div data-testid={`${name}-input`}>
      <div data-testid={`${name}-selected`}>{selectedItem?.name ?? ''}</div>
      <div data-testid={`${name}-balance`}>{selectedItem ? balanceFunc(selectedItem) : ''}</div>
      <div data-testid={`${name}-error`}>{forceErrorMessage}</div>
      <button type="button" data-testid={`${name}-max`} onClick={() => onMaxButtonClick(42.5)}>
        max
      </button>
      <button type="button" data-testid={`${name}-change`} onClick={onAmountChange}>
        change
      </button>
    </div>
  ),
}));
jest.mock('src/components/order/bank-account-selector', () => ({
  BankAccountSelector: ({ onChange, onError, onCreateStart, retryToken, isModalOpen, onModalToggle }: any) => (
    <div data-testid="bank-account-selector">
      <div data-testid="bank-account-retry-token">{retryToken}</div>
      <button type="button" data-testid="bank-account-error" onClick={() => onError('create failed')}>
        error
      </button>
      <button type="button" data-testid="bank-account-create-start" onClick={onCreateStart}>
        start
      </button>
      <button
        type="button"
        data-testid="bank-account-success"
        onClick={() => onChange({ id: 1, iban: 'CH9300762011623852957' })}
      >
        success
      </button>
      <button type="button" data-testid="bank-account-modal" onClick={() => onModalToggle(!isModalOpen)}>
        modal
      </button>
    </div>
  ),
}));
jest.mock('src/components/order/payment-info', () => ({
  PaymentInfo: ({ paymentInfo, paymentMethod, sourceAsset, targetAsset, amountError, kycError, errorMessage, retry }: any) => (
    <div>
      <div data-testid="payment-info-value">{paymentInfo}</div>
      <div data-testid="payment-method-value">{paymentMethod}</div>
      <div data-testid="payment-source-asset">{sourceAsset?.name ?? ''}</div>
      <div data-testid="payment-target-asset">{targetAsset?.name ?? ''}</div>
      <div data-testid="payment-amount-error">{amountError?.key ?? ''}</div>
      <div data-testid="payment-kyc-error">{kycError ?? ''}</div>
      <div data-testid="payment-error">{errorMessage}</div>
      <button type="button" data-testid="payment-retry" onClick={retry}>
        retry
      </button>
    </div>
  ),
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrderInterface } from 'src/components/order/order-interface';
import { OrderType } from 'src/hooks/order.hook';

describe('OrderInterface remaining behavior', () => {
  beforeEach(() => {
    mockIsBuy = false;
    mockIsSell = true;
    mockAddressItemsValue = mockEmptyList;
    mockCryptoBalancesValue = mockEmptyList;
    mockAvailableCurrenciesValue = mockEmptyList;
    mockAvailablePaymentMethodsValue = mockEmptyList;
    mockDefaultCurrencyValue = undefined;
    mockPaymentInfoValue = undefined;
    mockPaymentInfoError = undefined;
    mockAmountError = undefined;
    mockKycError = undefined;
    mockDebounceEnabled = true;
    mockHideTargetSelection = true;
    mockBlockchain = undefined;
    mockIsInitialized = true;
    mockSessionValue = mockSession;
    mockBankAccountSelection = false;
    mockLastEditedFieldRef.current = 'unset';
  });

  it('selects the default buy currency and exposes source and payment-method behavior', () => {
    mockIsBuy = true;
    mockIsSell = false;
    mockAvailableCurrenciesValue = mockAvailableCurrencies;
    mockAvailablePaymentMethodsValue = mockPaymentMethods;
    mockDefaultCurrencyValue = mockChf;
    mockAmountError = {
      key: 'amount-too-small',
      defaultValue: 'Amount is too small',
      interpolation: { minimum: 10 },
    };
    const onSourceAssetChange = jest.fn();

    render(
      <OrderInterface
        orderType={OrderType.BUY}
        sourceAssets={mockSourceAssets}
        defaultValues={{ targetAsset: mockBtc } as any}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
        onSourceAssetChange={onSourceAssetChange}
      />,
    );

    expect(screen.getByTestId('sourceAsset-selected')).toHaveTextContent('CHF');
    expect(onSourceAssetChange).toHaveBeenCalledWith('CHF');
    expect(screen.getByTestId('sourceAsset-error')).toHaveTextContent('Amount is too small');
    expect(mockTranslateCall).toHaveBeenCalledWith(
      'amount-too-small',
      'Amount is too small',
      { minimum: 10 },
      undefined,
    );
    expect(screen.getByTestId('paymentMethod-option-0')).toHaveTextContent('Bank transfer');
    expect(screen.getByTestId('paymentMethod-option-0')).toHaveTextContent('Bank description');
    expect(screen.getByTestId('payment-method-value')).toHaveTextContent('bank');

    fireEvent.click(screen.getByTestId('sourceAsset-max'));
    expect(mockLastEditedFieldRef.current).toBe('source');
    mockLastEditedFieldRef.current = 'unset';
    fireEvent.click(screen.getByTestId('sourceAsset-change'));
    expect(mockLastEditedFieldRef.current).toBe('source');
  });

  it('uses the first buy asset when no available currency matches', () => {
    mockIsBuy = true;
    mockIsSell = false;
    mockAvailableCurrenciesValue = undefined;
    mockAvailablePaymentMethodsValue = undefined;
    mockDefaultCurrencyValue = mockEur;

    render(
      <OrderInterface
        orderType={OrderType.BUY}
        sourceAssets={mockSourceAssets}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('sourceAsset-selected')).toHaveTextContent('USD');
    expect(screen.getByTestId('paymentMethod-dropdown')).toBeEmptyDOMElement();
    expect(screen.getByTestId('sourceAsset-error')).toBeEmptyDOMElement();
  });

  it('auto-selects a single source asset and honors a supplied balance formatter', () => {
    const balanceFunc = jest.fn(() => 'external balance');

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        sourceAssets={mockSingleSourceAsset}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
        balanceFunc={balanceFunc}
      />,
    );

    expect(screen.getByTestId('sourceAsset-selected')).toHaveTextContent('BTC');
    expect(screen.getByTestId('sourceAsset-balance')).toHaveTextContent('external balance');
    expect(balanceFunc).toHaveBeenCalledWith(mockBtc);
  });

  it('formats a matching crypto balance and returns an empty value without a match', () => {
    mockCryptoBalancesValue = mockBalances;

    const firstRender = render(
      <OrderInterface
        orderType={OrderType.SELL}
        defaultValues={{ sourceAsset: mockBtc } as any}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('sourceAsset-balance')).toHaveTextContent('formatted:1.25');
    expect(mockFormatAmountCryptoCall).toHaveBeenCalledWith(1.25);
    firstRender.unmount();

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        defaultValues={{ sourceAsset: mockEth } as any}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('sourceAsset-balance')).toBeEmptyDOMElement();
  });

  it('selects the default sell currency and exposes target amount interactions', () => {
    mockAvailableCurrenciesValue = mockAvailableCurrencies;
    mockDefaultCurrencyValue = mockChf;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        targetAssets={mockTargetAssets}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('targetAsset-selected')).toHaveTextContent('CHF');
    fireEvent.click(screen.getByTestId('targetAsset-max'));
    expect(mockLastEditedFieldRef.current).toBe('target');
    mockLastEditedFieldRef.current = 'unset';
    fireEvent.click(screen.getByTestId('targetAsset-change'));
    expect(mockLastEditedFieldRef.current).toBe('target');
  });

  it('uses the first sell asset when the default currency does not match', () => {
    mockAvailableCurrenciesValue = mockAvailableCurrencies;
    mockDefaultCurrencyValue = mockEur;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        targetAssets={mockTargetAssets}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('targetAsset-selected')).toHaveTextContent('USD');
  });

  it('omits the target input when no target assets were supplied', () => {
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.queryByTestId('targetAsset-input')).not.toBeInTheDocument();
  });

  it('renders address labels and descriptions and selects the address for the requested chain', () => {
    mockHideTargetSelection = false;
    mockBlockchain = 'bitcoin';
    mockAddressItemsValue = mockAddresses;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('address-option-0')).toHaveTextContent('0xaaa@800');
    expect(screen.getByTestId('address-option-0')).toHaveTextContent('Primary');
    expect(mockSetSelectedAddress).toHaveBeenCalled();
    expect(mockSetSelectedAddress).toHaveBeenLastCalledWith(mockAddresses[1]);
  });

  it('falls back to the first address when no requested chain is present', () => {
    mockHideTargetSelection = false;
    mockAddressItemsValue = mockAddresses;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(mockSetSelectedAddress).toHaveBeenLastCalledWith(mockAddresses[0]);
  });

  it('short-circuits each address-dropdown visibility condition', () => {
    mockAddressItemsValue = mockAddresses;
    const targetHidden = render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(screen.queryByTestId('address-dropdown')).not.toBeInTheDocument();
    targetHidden.unmount();

    mockHideTargetSelection = false;
    const addressHidden = render(
      <OrderInterface
        orderType={OrderType.SELL}
        hideAddressSelection
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(screen.queryByTestId('address-dropdown')).not.toBeInTheDocument();
    addressHidden.unmount();

    mockAddressItemsValue = mockEmptyList;
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(screen.queryByTestId('address-dropdown')).not.toBeInTheDocument();
  });

  it('does not initialize an address while any initialization prerequisite is missing', () => {
    mockHideTargetSelection = false;
    mockAddressItemsValue = mockAddresses;
    mockIsInitialized = false;
    const uninitialized = render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(mockSetSelectedAddress).toHaveBeenLastCalledWith(undefined);
    uninitialized.unmount();

    mockSetSelectedAddress.mockClear();
    mockIsInitialized = true;
    mockSessionValue = undefined;
    const signedOut = render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(mockSetSelectedAddress).toHaveBeenLastCalledWith(undefined);
    signedOut.unmount();

    mockSetSelectedAddress.mockClear();
    mockSessionValue = mockSession;
    mockAddressItemsValue = undefined;
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(mockSetSelectedAddress).toHaveBeenLastCalledWith(undefined);
  });

  it('fetches payment information from both explicit actions when debounced data exists', () => {
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    mockHandlePaymentInfoFetch.mockClear();

    fireEvent.click(screen.getByTestId('fetch-payment-info'));
    expect(mockHandlePaymentInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockHandlePaymentInfoFetch.mock.calls[0][0]).toBe(mockDebouncedData);
    expect(mockHandlePaymentInfoFetch.mock.calls[0][1]).toBe(mockOnFetch);

    mockHandlePaymentInfoFetch.mockClear();
    fireEvent.click(screen.getByTestId('payment-retry'));
    expect(mockHandlePaymentInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockHandlePaymentInfoFetch.mock.calls[0][0]).toBe(mockDebouncedData);
    expect(mockHandlePaymentInfoFetch.mock.calls[0][1]).toBe(mockOnFetch);
  });

  it('does not fetch from either explicit action when debounced data is absent', () => {
    mockDebounceEnabled = false;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('fetch-payment-info'));
    fireEvent.click(screen.getByTestId('payment-retry'));
    expect(mockHandlePaymentInfoFetch).not.toHaveBeenCalled();
  });

  it('prioritizes bank-account retry state over fetching a new quote', () => {
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    mockHandlePaymentInfoFetch.mockClear();

    fireEvent.click(screen.getByTestId('bank-account-error'));
    fireEvent.click(screen.getByTestId('payment-retry'));

    expect(screen.getByTestId('bank-account-retry-token')).toHaveTextContent('1');
    expect(screen.getByTestId('payment-error')).toBeEmptyDOMElement();
    expect(mockHandlePaymentInfoFetch).not.toHaveBeenCalled();
  });

  it('forwards bank-account selection and modal changes and hides the selector for buys', () => {
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    fireEvent.click(screen.getByTestId('bank-account-error'));
    expect(screen.getByTestId('payment-error')).toHaveTextContent('create failed');
    fireEvent.click(screen.getByTestId('bank-account-create-start'));
    expect(screen.getByTestId('payment-error')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByTestId('bank-account-success'));
    expect(screen.getByTestId('payment-error')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByTestId('bank-account-modal'));
    expect(mockSetBankAccountSelection).toHaveBeenCalledWith(true);

    cleanup();
    mockIsBuy = true;
    mockIsSell = false;
    mockAvailableCurrenciesValue = undefined;
    render(
      <OrderInterface
        orderType={OrderType.BUY}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );
    expect(screen.queryByTestId('bank-account-selector')).not.toBeInTheDocument();
  });

  it('derives missing source and target assets through pairMap', () => {
    const sourcePairMap = jest.fn(() => mockBtc);
    const sourceFallback = render(
      <OrderInterface
        orderType={OrderType.SELL}
        defaultValues={{ targetAsset: mockChf } as any}
        pairMap={sourcePairMap}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('payment-source-asset')).toHaveTextContent('BTC');
    expect(screen.getByTestId('payment-target-asset')).toHaveTextContent('CHF');
    expect(sourcePairMap).toHaveBeenCalledWith('CHF');
    sourceFallback.unmount();

    const targetPairMap = jest.fn(() => mockChf);
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        defaultValues={{ sourceAsset: mockBtc } as any}
        pairMap={targetPairMap}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('payment-source-asset')).toHaveTextContent('BTC');
    expect(screen.getByTestId('payment-target-asset')).toHaveTextContent('CHF');
    expect(targetPairMap).toHaveBeenCalledWith('BTC');
  });

  it('reports quote state through the button and payment-info props', () => {
    mockPaymentInfoValue = { paymentInfo: 'quote-ready' };
    mockAmountError = { key: 'limit', hideInfos: false };
    mockKycError = 'kyc-required';
    mockPaymentInfoError = 'quote-failed';

    const visibleInfo = render(
      <OrderInterface
        orderType={OrderType.SELL}
        header="Review"
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('fetch-payment-info')).toHaveTextContent('Review');
    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByTestId('payment-info-value')).toHaveTextContent('quote-ready');
    expect(screen.getByTestId('payment-amount-error')).toHaveTextContent('limit');
    expect(screen.getByTestId('payment-kyc-error')).toHaveTextContent('kyc-required');
    expect(screen.getByTestId('payment-error')).toHaveTextContent('quote-failed');
    visibleInfo.unmount();

    mockAmountError = { key: 'blocked', hideInfos: true };
    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('fetch-payment-info')).toHaveTextContent('Next');
    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-hidden', 'false');
  });

  it('hides the fetch action while bank-account selection is open without a quote', () => {
    mockBankAccountSelection = true;

    render(
      <OrderInterface
        orderType={OrderType.SELL}
        onFetchPaymentInfo={mockOnFetch}
        confirmPayment={mockConfirm}
      />,
    );

    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('fetch-payment-info')).toHaveAttribute('data-hidden', 'true');
  });
});
