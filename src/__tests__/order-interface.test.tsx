import { createRef } from 'react';

const mockOrder: {
  isBuy: boolean;
  isSell: boolean;
  addressItems: { address: string; label: string; chain?: string }[];
  cryptoBalances: { asset: { id: number }; amount: number | null }[];
  paymentInfo: { paymentInfo?: unknown } | undefined;
  isFetchingPaymentInfo: boolean;
  lastEditedFieldRef: { current: unknown };
  paymentInfoError: string | undefined;
  amountError:
    | { key: string; defaultValue: string; interpolation?: Record<string, string | number>; hideInfos: boolean }
    | undefined;
  kycError: { message: string } | undefined;
  setSelectedAddress: jest.Mock;
  getAvailableCurrencies: jest.Mock;
  getAvailablePaymentMethods: jest.Mock;
  handlePaymentInfoFetch: jest.Mock;
} = {
  isBuy: false,
  isSell: false,
  addressItems: [],
  cryptoBalances: [],
  paymentInfo: undefined,
  isFetchingPaymentInfo: false,
  lastEditedFieldRef: createRef(),
  paymentInfoError: undefined,
  amountError: undefined,
  kycError: undefined,
  setSelectedAddress: jest.fn(),
  getAvailableCurrencies: jest.fn(() => []),
  getAvailablePaymentMethods: jest.fn(() => []),
  handlePaymentInfoFetch: jest.fn(),
};

const mockEnv: {
  width: number;
  session: { address?: string } | undefined;
  rootRef: { current: null };
  getDefaultCurrency: jest.Mock;
  isInitialized: boolean;
  blockchain: string | undefined;
  hideTargetSelection: boolean;
  bankAccountSelection: boolean;
  setBankAccountSelection: jest.Mock;
} = {
  width: 400,
  session: undefined,
  rootRef: { current: null },
  getDefaultCurrency: jest.fn(() => undefined),
  isInitialized: false,
  blockchain: undefined,
  hideTargetSelection: false,
  bankAccountSelection: false,
  setBankAccountSelection: jest.fn(),
};

const mockGetDefaultCurrency = (currencies: unknown) => mockEnv.getDefaultCurrency(currencies);

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: { BITCOIN: 'Bitcoin', ETHEREUM: 'Ethereum' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant' },
  FileType: {},
  FundOrigin: {},
  InvestmentDate: {},
  Limit: {},
  PaymentQuoteStatus: {},
  PhoneCallTime: {},
  SupportIssueReason: {},
  SupportIssueType: {},
  TransactionFailureReason: {},
  TransactionState: {},
  UserRole: {},
  Utils: {
    createRules: () => ({ sourceAmount: {}, sourceAsset: {}, targetAsset: {}, targetAmount: {} }),
    formatAmountCrypto: (amount: unknown) => String(amount),
  },
  Validations: { Required: {} },
  useAuthContext: () => ({ session: mockEnv.session }),
  useFiat: () => ({
    getDefaultCurrency: mockGetDefaultCurrency,
  }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  const { useController } = jest.requireActual('react-hook-form');

  function fieldText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'address' in value && value.address) {
      return String(value.address);
    }
    if (typeof value === 'object' && value !== null && 'name' in value && value.name) return String(value.name);
    return String(value);
  }

  return {
    Form: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    StyledVerticalStack: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    StyledButtonWidth: { FULL: 'full' },
    StyledButton: ({
      label,
      disabled,
      hidden,
      onClick,
      isLoading,
    }: {
      label?: string;
      disabled?: boolean;
      hidden?: boolean;
      onClick?: () => void;
      isLoading?: boolean;
    }) => (
      <button
        type="button"
        data-testid="next"
        data-disabled={String(!!disabled)}
        data-hidden={String(!!hidden)}
        data-loading={String(!!isLoading)}
        onClick={onClick}
      >
        {label}
      </button>
    ),
    StyledDropdown: ({
      control,
      name,
      items,
      labelFunc,
      descriptionFunc,
    }: {
      control: unknown;
      name: string;
      items?: unknown[];
      labelFunc: (item: never) => string;
      descriptionFunc?: (item: never) => string;
    }) => {
      const { field } = useController({ control, name });
      const list = items ?? [];
      return (
        <div data-testid={`dropdown-${name}`}>
          {list.map((item, index) => (
            <span key={index} data-testid={`label-${name}-${index}`}>
              {labelFunc(item as never)}
              {descriptionFunc ? descriptionFunc(item as never) : ''}
            </span>
          ))}
          <button type="button" data-testid={`select-${name}`} onClick={() => field.onChange(list[0])}>
            select
          </button>
          <span data-testid={`field-${name}`}>{fieldText(field.value)}</span>
        </div>
      );
    },
  };
});

jest.mock('src/hooks/order.hook', () => ({
  OrderType: { BUY: 'buy', SELL: 'sell', SWAP: 'swap', DEPOSIT: 'deposit' },
  Side: { SOURCE: 'source', TARGET: 'target' },
  useOrder: () => mockOrder,
}));

let mockPassDebounce = true;

jest.mock('src/hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => (mockPassDebounce ? value : undefined),
}));

jest.mock('src/hooks/app-params.hook', () => ({
  useAppParams: () => ({ blockchain: mockEnv.blockchain, hideTargetSelection: mockEnv.hideTargetSelection }),
}));

jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: mockEnv.width }),
}));

jest.mock('src/contexts/layout.context', () => ({
  useLayoutContext: () => ({ rootRef: mockEnv.rootRef }),
}));

jest.mock('src/contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_ns: string, key: string) => key }),
}));

jest.mock('src/contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: mockEnv.isInitialized }),
}));

jest.mock('src/contexts/order-ui.context', () => ({
  useOrderUIContext: () => ({
    bankAccountSelection: mockEnv.bankAccountSelection,
    setBankAccountSelection: mockEnv.setBankAccountSelection,
  }),
}));

jest.mock('src/components/order/asset-input', () => ({
  AssetInput: ({
    name,
    label,
    availableItems,
    selectedItem,
    balanceFunc,
    onMaxButtonClick,
    onAmountChange,
    forceErrorMessage,
  }: {
    name: string;
    label?: string;
    availableItems?: { name?: string }[];
    selectedItem?: { name?: string };
    balanceFunc: (item: { name?: string }) => string;
    onMaxButtonClick: (value: number) => void;
    onAmountChange: () => void;
    forceErrorMessage?: string;
  }) => (
    <div data-testid={`asset-${name}`}>
      <span>{label}</span>
      <span data-testid={`selected-${name}`}>{selectedItem?.name ?? ''}</span>
      <span data-testid={`balances-${name}`}>
        {(availableItems ?? []).map((item) => `${item?.name ?? ''}:${balanceFunc(item)}`).join('|')}
      </span>
      <span data-testid={`error-${name}`}>{forceErrorMessage}</span>
      <button type="button" data-testid={`max-${name}`} onClick={() => onMaxButtonClick(1.5)}>
        max
      </button>
      <button type="button" data-testid={`amount-${name}`} onClick={() => onAmountChange()}>
        amount
      </button>
    </div>
  ),
}));

jest.mock('src/components/order/bank-account-selector', () => ({
  BankAccountSelector: ({ placeholder, onChange }: { placeholder?: string; onChange: (account: object) => void }) => (
    <div data-testid="bank-selector">
      <span>{placeholder}</span>
      <button type="button" data-testid="bank-change" onClick={() => onChange({ id: 7, iban: 'CH00' })}>
        bank
      </button>
    </div>
  ),
}));

jest.mock('src/components/order/payment-info', () => ({
  PaymentInfo: ({
    amountError,
    kycError,
    errorMessage,
    confirmButtonLabel,
    confirmPayment,
    retry,
    sourceAsset,
    targetAsset,
  }: {
    amountError?: { defaultValue?: string };
    kycError?: { message?: string };
    errorMessage?: string;
    confirmButtonLabel?: string;
    confirmPayment: () => void;
    retry: () => void;
    sourceAsset?: { name?: string };
    targetAsset?: { name?: string };
  }) => (
    <div data-testid="payment-info">
      <span data-testid="amount-error">{amountError ? JSON.stringify(amountError) : ''}</span>
      <span data-testid="kyc-error">{kycError ? JSON.stringify(kycError) : ''}</span>
      <span data-testid="pay-error">{errorMessage ?? ''}</span>
      <span data-testid="pay-label">{confirmButtonLabel ?? ''}</span>
      <span data-testid="pi-source">{sourceAsset?.name ?? ''}</span>
      <span data-testid="pi-target">{targetAsset?.name ?? ''}</span>
      <button type="button" data-testid="pay-confirm" onClick={() => confirmPayment()}>
        confirm
      </button>
      <button type="button" data-testid="pay-retry" onClick={() => retry()}>
        retry
      </button>
    </div>
  ),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OrderInterface } from '../components/order/order-interface';
import { OrderType, Side } from 'src/hooks/order.hook';
import { Lnurl } from 'src/util/lnurl';

const eur = { id: 1, name: 'EUR' };
const chf = { id: 2, name: 'CHF' };
const btc = { id: 3, name: 'BTC' };
const eth = { id: 4, name: 'ETH' };
const sol = { id: 5, name: 'SOL' };
const lightningAddress = Lnurl.encode('https://lightning.space/.well-known/lnurlp/abc');
const hotAddress = '0x1111111111111111111111111111111111111111';
const walletItems = [
  { address: hotAddress, label: 'Hot', chain: 'Ethereum' },
  { address: lightningAddress, label: 'Bolt', chain: 'Bitcoin' },
];

function resetOrderState(): void {
  mockPassDebounce = true;
  mockOrder.isBuy = false;
  mockOrder.isSell = false;
  mockOrder.addressItems = [];
  mockOrder.cryptoBalances = [];
  mockOrder.paymentInfo = undefined;
  mockOrder.isFetchingPaymentInfo = false;
  mockOrder.lastEditedFieldRef = createRef();
  mockOrder.paymentInfoError = undefined;
  mockOrder.amountError = undefined;
  mockOrder.kycError = undefined;
  mockOrder.setSelectedAddress = jest.fn();
  mockOrder.getAvailableCurrencies = jest.fn(() => []);
  mockOrder.getAvailablePaymentMethods = jest.fn(() => []);
  mockOrder.handlePaymentInfoFetch = jest.fn();
  mockEnv.width = 400;
  mockEnv.session = undefined;
  mockEnv.rootRef = { current: null };
  mockEnv.getDefaultCurrency = jest.fn(() => undefined);
  mockEnv.isInitialized = false;
  mockEnv.blockchain = undefined;
  mockEnv.hideTargetSelection = false;
  mockEnv.bankAccountSelection = false;
  mockEnv.setBankAccountSelection = jest.fn();
}

function renderOrder(props: Record<string, unknown> = {}) {
  const onFetchPaymentInfo = jest.fn(async () => undefined);
  const confirmPayment = jest.fn(async () => undefined);
  const view = render(
    <OrderInterface
      orderType={OrderType.BUY}
      onFetchPaymentInfo={onFetchPaymentInfo}
      confirmPayment={confirmPayment}
      {...props}
    />,
  );
  return { ...view, onFetchPaymentInfo, confirmPayment };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetOrderState();
});

describe('OrderInterface', () => {
  it('sets the only buy source, the only payment method, and the currency whose name matches', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailablePaymentMethods.mockReturnValue(['Bank']);
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'CHF' }]);
    mockEnv.getDefaultCurrency.mockReturnValue({ name: 'CHF' });
    const { confirmPayment } = renderOrder({
      header: 'Buy header',
      sourceAssets: [chf],
      targetAssets: [btc],
      confirmButtonLabel: 'Pay now',
    });

    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('CHF'));
    await waitFor(() => expect(screen.getByTestId('field-paymentMethod').textContent).toBe('Bank'));
    expect(screen.getByTestId('label-paymentMethod-0').textContent).toContain('Standard bank transaction');
    expect(screen.getByTestId('label-paymentMethod-0').textContent).toContain('SWIFT, SEPA, SIC, euroSIC');
    expect(screen.getByTestId('asset-targetAsset')).toBeInTheDocument();
    expect(screen.getByTestId('next').textContent).toBe('Buy header');
    expect(screen.getByTestId('next')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'false');
    expect(screen.getByTestId('pay-label').textContent).toBe('Pay now');
    expect(mockOrder.handlePaymentInfoFetch).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('select-paymentMethod'));
    expect(screen.getByTestId('field-paymentMethod').textContent).toBe('Bank');
    fireEvent.click(screen.getByTestId('max-sourceAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.SOURCE);
    fireEvent.click(screen.getByTestId('amount-sourceAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.SOURCE);
    fireEvent.click(screen.getByTestId('max-targetAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.TARGET);
    fireEvent.click(screen.getByTestId('amount-targetAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.TARGET);

    mockOrder.handlePaymentInfoFetch.mockClear();
    fireEvent.click(screen.getByTestId('next'));
    expect(mockOrder.handlePaymentInfoFetch).toHaveBeenCalledTimes(1);
    mockOrder.handlePaymentInfoFetch.mockClear();
    fireEvent.click(screen.getByTestId('pay-retry'));
    expect(mockOrder.handlePaymentInfoFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('pay-confirm'));
    });
    expect(confirmPayment).toHaveBeenCalled();
  });

  it('matches a buy currency against a later source asset when more than one exists', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'CHF' }]);
    mockEnv.getDefaultCurrency.mockReturnValue({ name: 'CHF' });
    renderOrder({ sourceAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('CHF'));
  });

  it('falls back to the first buy source when the default currency name matches nothing', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'CHF' }]);
    mockEnv.getDefaultCurrency.mockReturnValue({ name: 'NOPE' });
    renderOrder({ sourceAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('EUR'));
  });

  it('uses the first available currency when the default currency is missing', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'NOPE' }]);
    mockEnv.getDefaultCurrency.mockReturnValue(undefined);
    renderOrder({ sourceAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('EUR'));
  });

  it('uses the first buy source when the currency list is empty', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([]);
    mockEnv.getDefaultCurrency.mockReturnValue(undefined);
    renderOrder({ sourceAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('EUR'));
  });

  it('uses the first buy source when available currencies are missing', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailableCurrencies.mockReturnValue(undefined);
    mockEnv.getDefaultCurrency.mockReturnValue(undefined);
    renderOrder({ sourceAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('EUR'));
  });

  it('does not set a payment method when none are available', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailablePaymentMethods.mockReturnValue([]);
    renderOrder({ sourceAssets: [chf] });
    await flush();
    expect(screen.getByTestId('field-paymentMethod').textContent).toBe('');
  });

  it('renders the payment dropdown without items when payment methods are missing', async () => {
    mockOrder.isBuy = true;
    mockOrder.getAvailablePaymentMethods.mockReturnValue(undefined);
    renderOrder({ sourceAssets: [chf] });
    await flush();
    expect(screen.getByTestId('dropdown-paymentMethod')).toBeInTheDocument();
    expect(screen.queryByTestId('label-paymentMethod-0')).not.toBeInTheDocument();
  });

  it('renders buy inputs when source assets are missing', async () => {
    mockOrder.isBuy = true;
    renderOrder({});
    await flush();
    expect(screen.getByTestId('asset-sourceAsset')).toBeInTheDocument();
    expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('');
    expect(screen.getByTestId('balances-sourceAsset').textContent).toBe('');
  });

  it('does not auto-select a source when the source list is empty', async () => {
    mockOrder.isBuy = true;
    renderOrder({ sourceAssets: [] });
    await flush();
    expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('');
  });

  it('hides the target input when target assets are missing', async () => {
    renderOrder({});
    await flush();
    expect(screen.queryByTestId('asset-targetAsset')).not.toBeInTheDocument();
    expect(screen.getByTestId('next').textContent).toBe('Next');
    expect(document.querySelector('.flex-col-reverse')).toBeNull();
  });

  it('sells into the currency whose name matches and does not notify the source callback', async () => {
    mockOrder.isBuy = false;
    mockOrder.isSell = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'CHF' }]);
    mockEnv.getDefaultCurrency.mockReturnValue({ name: 'CHF' });
    const onSourceAssetChange = jest.fn();
    const { container } = renderOrder({
      orderType: OrderType.SELL,
      sourceAssets: [btc],
      targetAssets: [eur, chf],
      onSourceAssetChange,
    });

    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('BTC'));
    await waitFor(() => expect(screen.getByTestId('selected-targetAsset').textContent).toBe('CHF'));
    expect(onSourceAssetChange).not.toHaveBeenCalled();
    expect(container.querySelector('.flex-col-reverse')).not.toBeNull();
    expect(screen.getByText('Add or select your IBAN')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bank-change'));
    fireEvent.click(screen.getByTestId('max-targetAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.TARGET);
    fireEvent.click(screen.getByTestId('amount-targetAsset'));
    expect(mockOrder.lastEditedFieldRef.current).toBe(Side.TARGET);
  });

  it('falls back to the first sell target when the default currency name matches nothing', async () => {
    mockOrder.isSell = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([{ name: 'CHF' }]);
    mockEnv.getDefaultCurrency.mockReturnValue({ name: 'NOPE' });
    renderOrder({ orderType: OrderType.SELL, targetAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-targetAsset').textContent).toBe('EUR'));
  });

  it('uses the first sell target when the currency list is empty', async () => {
    mockOrder.isSell = true;
    mockOrder.getAvailableCurrencies.mockReturnValue([]);
    mockEnv.getDefaultCurrency.mockReturnValue(undefined);
    renderOrder({ orderType: OrderType.SELL, targetAssets: [eur, chf] });
    await waitFor(() => expect(screen.getByTestId('selected-targetAsset').textContent).toBe('EUR'));
  });

  it('skips the sell currency branch when target assets are missing', async () => {
    mockOrder.isSell = true;
    renderOrder({ orderType: OrderType.SELL });
    await flush();
    expect(screen.queryByTestId('asset-targetAsset')).not.toBeInTheDocument();
    expect(screen.getByTestId('bank-selector')).toBeInTheDocument();
  });

  it('shows an empty sell target list without choosing a currency', async () => {
    mockOrder.isSell = true;
    renderOrder({ orderType: OrderType.SELL, targetAssets: [] });
    await flush();
    expect(screen.getByTestId('asset-targetAsset')).toBeInTheDocument();
    expect(screen.getByTestId('selected-targetAsset').textContent).toBe('');
  });

  it('notifies the source callback for a non-sell once the source asset is set', async () => {
    const onSourceAssetChange = jest.fn();
    const { container } = renderOrder({
      orderType: OrderType.SWAP,
      sourceAssets: [btc],
      onSourceAssetChange,
    });
    await waitFor(() => expect(onSourceAssetChange).toHaveBeenCalledWith('BTC'));
    expect(container.querySelector('.flex-col')).not.toBeNull();
    expect(container.querySelector('.flex-col-reverse')).toBeNull();
    expect(screen.queryByTestId('bank-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dropdown-paymentMethod')).not.toBeInTheDocument();
  });

  it('resets the other fields when the source changes and no callback is passed', async () => {
    renderOrder({ orderType: OrderType.SWAP, sourceAssets: [btc], targetAssets: [eth] });
    await waitFor(() => expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('BTC'));
  });

  it('leaves the source effect idle when a non-sell has no source asset', async () => {
    const onSourceAssetChange = jest.fn();
    renderOrder({ orderType: OrderType.SWAP, sourceAssets: [eur, chf], onSourceAssetChange });
    await flush();
    expect(onSourceAssetChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected-sourceAsset').textContent).toBe('');
  });

  it('selects the address whose chain matches and renders both address labels', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockEnv.blockchain = 'Bitcoin';
    mockOrder.addressItems = walletItems;
    renderOrder({ sourceAssets: [btc] });
    await waitFor(() => expect(screen.getByTestId('field-address').textContent).toBe(lightningAddress));
    expect(screen.getByTestId('label-address-1').textContent).toContain('abc@lightning.space');
    expect(screen.getByTestId('label-address-0').textContent).toContain('...');
    expect(screen.getByTestId('label-address-0').textContent).toContain('Hot');
    expect(screen.getByTestId('label-address-1').textContent).toContain('Bolt');
    expect(mockOrder.setSelectedAddress).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('select-address'));
    expect(screen.getByTestId('field-address').textContent).toBe(hotAddress);
  });

  it('selects the first address when the blockchain matches nothing', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockEnv.blockchain = 'Solana';
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await waitFor(() => expect(screen.getByTestId('field-address').textContent).toBe(hotAddress));
  });

  it('selects the first address when no blockchain is set', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await waitFor(() => expect(screen.getByTestId('field-address').textContent).toBe(hotAddress));
  });

  it('does not select an address before the app is initialized', async () => {
    mockEnv.isInitialized = false;
    mockEnv.session = { address: 'session' };
    mockEnv.blockchain = 'Bitcoin';
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await flush();
    expect(screen.getByTestId('dropdown-address')).toBeInTheDocument();
    expect(screen.getByTestId('field-address').textContent).toBe('');
  });

  it('does not select an address without a session', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = undefined;
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await flush();
    expect(screen.getByTestId('field-address').textContent).toBe('');
  });

  it('does not select an address when the session has no address', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = {};
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await flush();
    expect(screen.getByTestId('field-address').textContent).toBe('');
  });

  it('hides the address dropdown when address items are missing', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockOrder.addressItems = undefined as never;
    renderOrder({});
    await flush();
    expect(screen.queryByTestId('dropdown-address')).not.toBeInTheDocument();
  });

  it('hides the address dropdown when the address list is empty', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockOrder.addressItems = [];
    renderOrder({});
    await flush();
    expect(screen.queryByTestId('dropdown-address')).not.toBeInTheDocument();
  });

  it('hides the address dropdown when target selection is hidden', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockEnv.hideTargetSelection = true;
    mockOrder.addressItems = walletItems;
    renderOrder({});
    await flush();
    expect(screen.queryByTestId('dropdown-address')).not.toBeInTheDocument();
  });

  it('does not touch the address when address selection is hidden', async () => {
    mockEnv.isInitialized = true;
    mockEnv.session = { address: 'session' };
    mockEnv.blockchain = 'Bitcoin';
    mockOrder.addressItems = walletItems;
    renderOrder({ hideAddressSelection: true });
    await flush();
    expect(mockOrder.setSelectedAddress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dropdown-address')).not.toBeInTheDocument();
  });

  it('reads found, empty, and missing crypto balances from the internal finder', async () => {
    mockOrder.cryptoBalances = [
      { asset: { id: 9 }, amount: 7 },
      { asset: { id: eth.id }, amount: 2 },
      { asset: { id: btc.id }, amount: null },
    ];
    renderOrder({ sourceAssets: [eth, btc, sol], targetAssets: [eth] });
    expect(screen.getByTestId('balances-sourceAsset').textContent).toBe('ETH:2|BTC:|SOL:');
    expect(screen.getByTestId('balances-targetAsset').textContent).toBe('ETH:2');
  });

  it('uses the balance function passed in instead of the internal finder', async () => {
    const balanceFunc = jest.fn(() => 'ext');
    renderOrder({ sourceAssets: [eth], balanceFunc });
    expect(screen.getByTestId('balances-sourceAsset').textContent).toBe('ETH:ext');
    expect(balanceFunc).toHaveBeenCalledWith(eth);
    expect(screen.queryByTestId('asset-targetAsset')).not.toBeInTheDocument();
  });

  it('shows an amount error with interpolation while payment info is present', async () => {
    mockOrder.paymentInfo = { paymentInfo: { ok: true } };
    mockOrder.amountError = { key: 'min', defaultValue: 'Too low', interpolation: { min: 2 }, hideInfos: false };
    mockOrder.kycError = { message: 'need-kyc' };
    mockOrder.paymentInfoError = 'pay-failed';
    renderOrder({ confirmButtonLabel: 'Pay now' });
    expect(screen.getByTestId('error-sourceAsset').textContent).toBe('Too low');
    expect(screen.getByTestId('amount-error').textContent).toContain('min');
    expect(screen.getByTestId('kyc-error').textContent).toContain('need-kyc');
    expect(screen.getByTestId('pay-error').textContent).toBe('pay-failed');
    expect(screen.getByTestId('next')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'true');
  });

  it('disables the button when the amount error hides payment info', async () => {
    mockOrder.paymentInfo = { paymentInfo: { ok: true } };
    mockOrder.amountError = { key: 'max', defaultValue: 'Too high', interpolation: { max: 5 }, hideInfos: true };
    renderOrder({});
    expect(screen.getByTestId('error-sourceAsset').textContent).toBe('Too high');
    expect(screen.getByTestId('next')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'false');
  });

  it('hides the button while a bank account is being selected', async () => {
    mockEnv.bankAccountSelection = true;
    mockOrder.paymentInfo = { paymentInfo: { ok: true } };
    mockOrder.amountError = { key: 'max', defaultValue: 'Too high', hideInfos: true };
    renderOrder({});
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'true');
  });

  it('hides the button from bank selection alone when payment info is absent', async () => {
    mockEnv.bankAccountSelection = true;
    renderOrder({});
    expect(screen.getByTestId('next')).toHaveAttribute('data-disabled', 'true');
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'true');
  });

  it('keeps the button enabled when payment info exists and there is no amount error', async () => {
    mockOrder.paymentInfo = { paymentInfo: undefined };
    renderOrder({});
    expect(screen.getByTestId('error-sourceAsset').textContent).toBe('');
    expect(screen.getByTestId('next')).toHaveAttribute('data-disabled', 'false');
    expect(screen.getByTestId('next')).toHaveAttribute('data-hidden', 'true');
  });

  it('marks the button loading while payment info is fetching', async () => {
    mockOrder.isFetchingPaymentInfo = true;
    renderOrder({});
    expect(screen.getByTestId('next')).toHaveAttribute('data-loading', 'true');
  });

  it('maps a missing source asset from the target name', async () => {
    const pairMap = jest.fn((name?: string) => ({ name: name ? `mapped-${name}` : 'mapped-empty' }));
    renderOrder({
      orderType: OrderType.SWAP,
      sourceAssets: [eur, chf],
      defaultValues: { targetAsset: eur },
      pairMap,
    });
    await flush();
    expect(screen.getByTestId('pi-source').textContent).toBe('mapped-EUR');
    expect(screen.getByTestId('pi-target').textContent).toBe('EUR');
  });

  it('maps a missing target asset from the source name', async () => {
    const pairMap = jest.fn((name?: string) => ({ name: name ? `mapped-${name}` : 'mapped-empty' }));
    renderOrder({
      orderType: OrderType.SWAP,
      sourceAssets: [eur, chf],
      defaultValues: { sourceAsset: eth },
      pairMap,
    });
    await flush();
    expect(screen.getByTestId('pi-source').textContent).toBe('ETH');
    expect(screen.getByTestId('pi-target').textContent).toBe('mapped-ETH');
  });

  it('calls the pair map with empty names when both assets are missing', async () => {
    const pairMap = jest.fn((name?: string) => ({ name: name ? `mapped-${name}` : 'mapped-empty' }));
    renderOrder({ orderType: OrderType.SWAP, sourceAssets: [eur, chf], pairMap });
    await flush();
    expect(screen.getByTestId('pi-source').textContent).toBe('mapped-empty');
    expect(screen.getByTestId('pi-target').textContent).toBe('mapped-empty');
    expect(pairMap).toHaveBeenCalledWith(undefined);
  });

  it('skips the pair map when it is omitted and both assets are missing', async () => {
    renderOrder({ orderType: OrderType.SWAP, sourceAssets: [eur, chf] });
    await flush();
    expect(screen.getByTestId('pi-source').textContent).toBe('');
    expect(screen.getByTestId('pi-target').textContent).toBe('');
  });

  it('does not fetch payment info before the debounced value exists', async () => {
    mockPassDebounce = false;
    mockOrder.isBuy = true;
    renderOrder({ sourceAssets: [chf], targetAssets: [btc] });
    await flush();

    expect(mockOrder.handlePaymentInfoFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('next'));
    fireEvent.click(screen.getByTestId('pay-retry'));
    expect(mockOrder.handlePaymentInfoFetch).not.toHaveBeenCalled();
  });

  it('keeps both assets when they are already set and does not call the pair map', async () => {
    const pairMap = jest.fn((name?: string) => ({ name: `mapped-${name}` }));
    renderOrder({
      orderType: OrderType.SWAP,
      sourceAssets: [eur, chf],
      defaultValues: { sourceAsset: eth, targetAsset: btc },
      pairMap,
    });
    await flush();
    expect(screen.getByTestId('pi-source').textContent).toBe('ETH');
    expect(screen.getByTestId('pi-target').textContent).toBe('BTC');
    expect(pairMap).not.toHaveBeenCalled();
  });
});
