const mockReceiveFor = jest.fn();
const mockUseAppParams = jest.fn();
const mockSetParams = jest.fn();
const mockSendTransaction = jest.fn();
const mockCanSendTransaction = jest.fn();
const mockGetBalances = jest.fn();
const mockNavigate = jest.fn();
const mockLogout = jest.fn();
const mockCloseServices = jest.fn();
const mockSwitchBlockchain = jest.fn();
const mockLayoutOptions = jest.fn();

const eth = {
  id: 1,
  name: 'ETH',
  uniqueName: 'Ethereum/ETH',
  category: 'Public',
  blockchain: 'Ethereum',
  description: 'Ethereum',
};
const btc = {
  id: 2,
  name: 'BTC',
  uniqueName: 'Bitcoin',
  blockchain: 'Bitcoin',
  category: 'Public',
  description: 'Bitcoin',
};
const usdtPrivate = {
  id: 3,
  name: 'USDT',
  uniqueName: 'Ethereum/USDT',
  category: 'Private',
  blockchain: 'Ethereum',
  description: 'Tether',
};

let mockAssets = [eth, btc];
let mockSession: { address: string; blockchains: string[] } | undefined;
let mockActiveWallet: string | undefined;
let mockFlags: string | undefined;
let mockHideTarget = true;
let mockWalletBlockchain: string | undefined = 'Ethereum';
const mockGetAsset = (list: any[], name?: string) =>
  name ? (list ?? []).find((a: any) => a.name === name || a.uniqueName === name) : undefined;
const mockGetAssets = () => mockAssets;
const mockIsSameAsset = (asset: any, filter: string) => asset.name === filter || asset.uniqueName === filter;
const mockTranslate = (_ns: string, key: string) => key;
const mockTranslateError = (key: string) => key;
const sessionAddress = { address: '0xabc', blockchains: ['Ethereum', 'Bitcoin'] };
let mockUserAddresses: { address: string; blockchains: string[] }[] = [];
const mockAssetsMap = () =>
  new Map([
    ['Ethereum', mockAssets.filter((a) => a.blockchain === 'Ethereum')],
    ['Bitcoin', mockAssets.filter((a) => a.blockchain === 'Bitcoin')],
  ]);
const mockTxHelper = {
  getBalances: (...args: unknown[]) => mockGetBalances(...args),
  sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
  canSendTransaction: () => mockCanSendTransaction(),
};

jest.mock('@dfx.swiss/react', () => ({
  AssetCategory: { PUBLIC: 'Public', PRIVATE: 'Private' },
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
  TransactionType: { SWAP: 'Swap' },
  Utils: {
    formatAmount: (n: number) => String(n),
    formatAmountCrypto: (n: number) => String(n),
    createRules: () => ({}),
  },
  Validations: { Required: undefined },
  useAsset: () => ({
    getAsset: mockGetAsset,
    isSameAsset: mockIsSameAsset,
  }),
  useAssetContext: () => ({
    assets: mockAssetsMap(),
    getAssets: mockGetAssets,
  }),
  useAuthContext: () => ({ session: mockSession }),
  useSessionContext: () => ({ logout: mockLogout }),
  useUserContext: () => ({ userAddresses: mockUserAddresses, user: { kyc: { level: 0 } }, isUserLoading: false }),
  useSwap: () => ({ receiveFor: (...args: unknown[]) => mockReceiveFor(...args) }),
}));

jest.mock('@dfx.swiss/react-components', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  function enrich(elements: any, control: any): any {
    if (!elements) return elements;
    return React.Children.map(elements, (element: any) => {
      if (!React.isValidElement(element)) return element;
      const props: any = element.props;
      const newChildren = enrich(props.children, control);
      if (props.name) return React.cloneElement(element, { control, children: newChildren });
      return React.cloneElement(element, { children: newChildren });
    });
  }

  return {
    AssetIconVariant: {},
    Form: ({ children, control, onSubmit }: any) => (
      <div>
        {enrich(children, control)}
        <button
          type="button"
          data-testid="form-submit"
          onClick={() => onSubmit?.({ preventDefault() { return undefined; } })}
        >
          submit
        </button>
      </div>
    ),
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButton: ({ label, onClick }: any) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { MIN: 'min', FULL: 'full' },
    StyledDropdown: ({ name, items, labelFunc, descriptionFunc, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {(items ?? []).map((item: any, index: number) => (
              <button
                key={`${labelFunc(item)}-${index}`}
                type="button"
                data-testid={`select-${name}-${index}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc(item)}
                {descriptionFunc?.(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
    StyledInput: ({ name, control, buttonLabel, buttonClick, forceErrorMessage, loading, disabled }: any) =>
      name ? (
        <Controller
          name={name}
          control={control}
          render={({ field }: any) => (
            <>
              <input
                data-testid={`input-${name}`}
                value={field.value ?? ''}
                disabled={Boolean(loading || disabled)}
                onChange={(e: any) => field.onChange(e.target.value)}
              />
              {buttonLabel && (
                <button type="button" data-testid={`input-${name}-max`} onClick={buttonClick}>
                  {buttonLabel}
                </button>
              )}
              {forceErrorMessage && <div data-testid={`input-${name}-error`}>{forceErrorMessage}</div>}
            </>
          )}
        />
      ) : null,
    StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledSearchDropdown: ({
      name,
      items,
      labelFunc,
      control,
      filterFunc,
      balanceFunc,
      descriptionFunc,
      assetIconFunc,
    }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {filterFunc?.(items?.[0], undefined)}
            {filterFunc?.(items?.[0], 'eth')}
            {balanceFunc?.(items?.[0])}
            {descriptionFunc?.(items?.[0])}
            {assetIconFunc?.(items?.[0])}
            {(items ?? []).map((item: any) => (
              <button
                key={labelFunc(item)}
                type="button"
                data-testid={`select-${name}-${labelFunc(item)}`}
                onClick={() => field.onChange(item)}
              >
                {labelFunc(item)}
              </button>
            ))}
          </div>
        )}
      />
    ),
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('../components/error-hint', () => ({ ErrorHint: ({ message }: any) => <div data-testid="error-hint">{message}</div> }));
jest.mock('../components/exchange-rate', () => ({ ExchangeRate: () => <div data-testid="exchange-rate" /> }));
jest.mock('../components/payment/address-switch', () => ({
  AddressSwitch: ({ onClose }: any) => (
    <div data-testid="address-switch">
      <button type="button" data-testid="address-switch-confirm" onClick={() => onClose(true)}>
        confirm
      </button>
      <button type="button" data-testid="address-switch-cancel" onClick={() => onClose(false)}>
        cancel
      </button>
    </div>
  ),
}));
jest.mock('../components/payment/payment-info-sell', () => ({
  PaymentInformationContent: ({ info }: any) => <div data-testid="payment-info">{info.amount}</div>,
}));
jest.mock('../components/payment/swap-completion', () => ({
  SwapCompletion: () => <div data-testid="swap-completion" />,
}));
jest.mock('../components/private-asset-hint', () => ({
  PrivateAssetHint: () => <div data-testid="private-asset-hint" />,
}));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: any) => <div data-testid="quote-error">{error}</div>,
}));
jest.mock('../components/sanction-hint', () => ({ SanctionHint: () => <div data-testid="sanction-hint" /> }));
jest.mock('../config/labels', () => ({ addressLabel: (wallet: any) => wallet?.address ?? '' }));
jest.mock('../contexts/app-handling.context', () => ({
  CloseType: { SWAP: 'Swap' },
  useAppHandlingContext: () => ({ isInitialized: true, closeServices: mockCloseServices }),
}));
jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn(), rootRef: { current: null } }),
}));
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    translateError: mockTranslateError,
  }),
}));
jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({
    blockchain: mockWalletBlockchain,
    activeWallet: mockActiveWallet,
    switchBlockchain: mockSwitchBlockchain,
  }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));
jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: () => 'Ethereum' }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: (opts: unknown) => mockLayoutOptions(opts),
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../hooks/tx-helper.hook', () => ({
  useTxHelper: () => mockTxHelper,
}));

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SwapScreen from 'src/screens/swap.screen';

function baseAppParams(overrides: Record<string, unknown> = {}) {
  return {
    assets: undefined,
    assetIn: 'ETH',
    assetOut: 'BTC',
    amountIn: undefined,
    blockchain: 'Ethereum',
    externalTransactionId: 'ext-1',
    flags: mockFlags,
    setParams: mockSetParams,
    hideTargetSelection: mockHideTarget,
    availableBlockchains: ['Ethereum', 'Bitcoin'],
    ...overrides,
  };
}

function quoteFor(req: any) {
  const spendAmount = req.amount !== undefined ? Number(req.amount) : 0.1;
  const getAmount = req.targetAmount !== undefined ? Number(req.targetAmount) : 0.004;
  return {
    id: 10,
    amount: spendAmount,
    estimatedAmount: getAmount,
    sourceAsset: eth,
    targetAsset: btc,
    minVolume: 0.001,
    maxVolume: 100,
    isValid: true,
    exchangeRate: 0.04,
    rate: 0.04,
    fees: {},
    priceSteps: [],
  };
}

async function flushQuote() {
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

describe('SwapScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAssets = [eth, btc];
    mockSession = sessionAddress;
    mockUserAddresses = [];
    mockActiveWallet = undefined;
    mockFlags = undefined;
    mockHideTarget = true;
    mockWalletBlockchain = 'Ethereum';
    mockCanSendTransaction.mockReturnValue(false);
    mockGetBalances.mockResolvedValue([
      { asset: eth, amount: 10 },
      { asset: btc, amount: 1 },
    ]);
    mockUseAppParams.mockReturnValue(baseAppParams());
    let quotes = 0;
    mockReceiveFor.mockImplementation((req: any) => {
      quotes += 1;
      if (quotes > 25) return Promise.reject(new Error('quote loop'));
      return Promise.resolve(quoteFor(req));
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not write exact-price into a spend field cleared while a spend-side quote is in flight', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    expect(screen.getByTestId('input-amount')).not.toBeDisabled();
    await act(async () => {
      resolveExact(quoteFor({ targetAmount: 0.01, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
  });

  it('does not write a resolving exact-price into spend when clear and resolve share a turn', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
      resolveExact(quoteFor({ targetAmount: 0.01, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
  });

  it('does not write exact-price into a target field cleared while a get-side quote is in flight', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ amount: 0.2, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
  });

  it('does not write a resolving exact-price into target when clear and resolve share a turn', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
      resolveExact(quoteFor({ amount: 0.2, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
  });

  it('drops a quote error after the form generation has moved on', async () => {
    let rejectQuote: (err: unknown) => void = () => undefined;
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectQuote = reject;
        }),
    );
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      rejectQuote({ statusCode: 500, message: 'stale' });
      await Promise.resolve();
    });
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
  });

  it('does not let a stale exact-price overwrite a retyped spend amount', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.3' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ amount: 0.2, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('0.3');
  });

  it('still invalidates quotes when target is cleared after an exact-price no-op write', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    const targetBefore = (screen.getByTestId('input-targetAmount') as HTMLInputElement).value;
    expect(targetBefore).not.toBe('');
    hangExact = true;
    await act(async () => {
      screen.getByTestId('select-sourceAsset-BTC').click();
    });
    await flushQuote();
    expect(screen.getByTestId('input-targetAmount')).toHaveValue(targetBefore);
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ amount: 0.1, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('still invalidates quotes when spend is cleared after an exact-price no-op write', async () => {
    let resolveExact: (value: unknown) => void = () => undefined;
    let hangExact = false;
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice && hangExact) {
        return new Promise((resolve) => {
          resolveExact = resolve;
        });
      }
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.1');
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ targetAmount: 0.01, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('clears a KYC quote error when the user empties the spend field', async () => {
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error: 'KycRequired' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    expect(screen.queryByTestId('quote-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps a cleared amount field empty and accepts the retyped amount', async () => {
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.1');
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();

    const callsBeforeClear = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.getByTestId('input-amount')).not.toBeDisabled();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockReceiveFor.mock.calls.length).toBe(callsBeforeClear);

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.2');
    const retyped = mockReceiveFor.mock.calls.slice(callsBeforeClear);
    expect(retyped.length).toBeGreaterThan(0);
    expect(retyped.every((call: any) => String(call[0].amount) === '0.2')).toBe(true);
  });

  it('keeps a cleared target amount field empty', async () => {
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-targetAmount')).not.toHaveValue('');

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await flushQuote();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
  });

  it('uses amountIn instead of the asset default', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: '0.5' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.5');
  });

  it('uses a stablecoin default of 100', async () => {
    mockAssets = [usdtPrivate, btc];
    mockFlags = 'private';
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT', flags: 'private' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('100');
  });

  it('shows amount-too-low from the quote error field', async () => {
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({ ...quoteFor(req), error: 'AmountTooLow', minVolume: 1 }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount-error')).toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('shows amount-too-high from the quote error field', async () => {
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({ ...quoteFor(req), error: 'AmountTooHigh', maxVolume: 1 }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount-error')).toBeInTheDocument();
  });

  it('routes KYC quote errors through QuoteErrorHint', async () => {
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error: 'KycRequired' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
  });

  it('shows a balance error when the quote exceeds the wallet balance', async () => {
    mockGetBalances.mockResolvedValue([{ asset: eth, amount: 0.01 }]);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount-error')).toBeInTheDocument();
  });

  it('navigates to profile when ident data is incomplete', async () => {
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'Ident data incomplete' });
    render(<SwapScreen />);
    await flushQuote();
    expect(mockNavigate).toHaveBeenCalledWith('/profile');
  });

  it('shows a generic error and retries', async () => {
    mockReceiveFor.mockRejectedValueOnce({ statusCode: 500, message: 'boom' }).mockImplementation((req: any) =>
      Promise.resolve(quoteFor(req)),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.11' } });
    });
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('maps a KYC HTTP message onto QuoteErrorHint', async () => {
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'KycRequired' });
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
  });

  it('uses Unknown error when the API omits a message', async () => {
    mockReceiveFor.mockRejectedValue({ statusCode: 500 });
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error');
  });

  it('fills MAX from the available balance', async () => {
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByTestId('input-amount-max').click();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('10');
  });

  it('filters assets when an asset filter is set', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assets: 'ETH', assetIn: 'ETH', assetOut: 'ETH' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('select-sourceAsset-ETH')).toBeInTheDocument();
    expect(screen.queryByTestId('select-sourceAsset-BTC')).not.toBeInTheDocument();
  });

  it('closes services when the wallet can send but is not connected', async () => {
    mockCanSendTransaction.mockReturnValue(true);
    mockActiveWallet = undefined;
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click();
    });
    expect(mockCloseServices).toHaveBeenCalled();
  });

  it('completes after a successful wallet send', async () => {
    mockCanSendTransaction.mockReturnValue(true);
    mockActiveWallet = 'mm';
    mockSendTransaction.mockResolvedValue('0xtx');
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click();
      await Promise.resolve();
    });
    expect(screen.getByTestId('swap-completion')).toBeInTheDocument();
  });

  it('swallows a wallet rejection (4001)', async () => {
    mockCanSendTransaction.mockReturnValue(true);
    mockActiveWallet = 'mm';
    mockSendTransaction.mockRejectedValue({ code: 4001 });
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('shows a retryable error for other send failures', async () => {
    mockCanSendTransaction.mockReturnValue(true);
    mockActiveWallet = 'mm';
    mockSendTransaction.mockRejectedValue({ code: 500, message: 'nope' });
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByRole('button', { name: 'Complete transaction in your wallet' }).click();
      await Promise.resolve();
    });
    expect(screen.getByTestId('error-hint')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('marks a manual transfer complete without sending', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transaction' }).click();
      await Promise.resolve();
    });
    expect(screen.getByTestId('swap-completion')).toBeInTheDocument();
  });

  it('shows the private-asset hint', async () => {
    mockAssets = [usdtPrivate, btc];
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument();
  });

  it('opens and cancels the address switch', async () => {
    mockHideTarget = false;
    mockUseAppParams.mockReturnValue(baseAppParams({ hideTargetSelection: false }));
    render(<SwapScreen />);
    await flushQuote();
    const addressButtons = screen.getAllByTestId(/select-address-/);
    await act(async () => {
      addressButtons[addressButtons.length - 1].click();
    });
    expect(screen.getByTestId('address-switch')).toBeInTheDocument();
    await act(async () => {
      screen.getByTestId('address-switch-cancel').click();
    });
    expect(screen.queryByTestId('address-switch')).not.toBeInTheDocument();
  });

  it('logs out when the address switch is confirmed', async () => {
    mockHideTarget = false;
    mockUseAppParams.mockReturnValue(baseAppParams({ hideTargetSelection: false }));
    render(<SwapScreen />);
    await flushQuote();
    const addressButtons = screen.getAllByTestId(/select-address-/);
    await act(async () => {
      addressButtons[addressButtons.length - 1].click();
    });
    await act(async () => {
      screen.getByTestId('address-switch-confirm').click();
    });
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
  });

  it('does not complete from form submit after the spend amount changes before the new quote', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('does not complete from form submit while the quote is not final', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice) return new Promise(() => undefined);
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('completes a manual transfer from form submit', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.getByTestId('swap-completion')).toBeInTheDocument();
  });

  it('does not complete from form submit after spend is cleared', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
  });

  it('does not complete from form submit after target is cleared', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('does not complete from form submit on a private asset', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockAssets = [usdtPrivate, btc];
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('completes from form submit on a private source when the private flag is set', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockAssets = [usdtPrivate, btc];
    mockFlags = 'private';
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT', flags: 'private' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(screen.queryByTestId('private-asset-hint')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.getByTestId('swap-completion')).toBeInTheDocument();
  });

  it('completes from the payment CTA on a private source when the private flag is set', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockAssets = [usdtPrivate, btc];
    mockFlags = 'private';
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT', flags: 'private' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transaction' }).click();
      await Promise.resolve();
    });
    expect(screen.getByTestId('swap-completion')).toBeInTheDocument();
  });

  it('does not complete from form submit on a private target asset', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockAssets = [eth, usdtPrivate];
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('does not complete from form submit when KYC blocks payment', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error: 'KycRequired' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('quote-error')).toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('does not complete from form submit when a quote error is showing', async () => {
    mockCanSendTransaction.mockReturnValue(false);
    mockReceiveFor.mockRejectedValue({ statusCode: 500, message: 'boom' });
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(screen.queryByTestId('swap-completion')).not.toBeInTheDocument();
  });

  it('does not start a second send while form submit is already processing', async () => {
    mockCanSendTransaction.mockReturnValue(true);
    mockActiveWallet = 'mm';
    mockSendTransaction.mockImplementation(() => new Promise(() => undefined));
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockSendTransaction).toHaveBeenCalledTimes(1);
  });

  it('uses the exact You get heading when rate is 1', async () => {
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), rate: 1, exchangeRate: 1 }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByText('You get')).toBeInTheDocument();
  });

  it('switches blockchain when another chain address is chosen', async () => {
    mockHideTarget = false;
    mockUseAppParams.mockReturnValue(baseAppParams({ hideTargetSelection: false, assetOut: undefined }));
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      screen.getByTestId('select-address-1').click();
    });
    expect(mockSetParams).toHaveBeenCalled();
    expect(mockSwitchBlockchain).toHaveBeenCalled();
  });

  it('keeps the typed spend amount when only the receive address changes on the same chain', async () => {
    mockHideTarget = false;
    mockUserAddresses = [{ address: '0xdef', blockchains: ['Ethereum'] }];
    mockUseAppParams.mockReturnValue(baseAppParams({ hideTargetSelection: false }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.1');
    await act(async () => {
      screen.getByTestId('select-address-1').click();
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.1');
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
    expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.receiverAddress === '0xdef')).toBe(true);
  });

  it('does not retry a quote after the spend amount becomes invalid', async () => {
    mockReceiveFor
      .mockRejectedValueOnce({ statusCode: 500, message: 'boom' })
      .mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0' } });
    });
    await flushQuote();
    const retry = screen.queryByRole('button', { name: 'Retry' });
    if (retry) {
      await act(async () => {
        retry.click();
      });
      await flushQuote();
    }
    const after = mockReceiveFor.mock.calls.slice(callsBefore);
    expect(after.every((call: any) => Number(call[0]?.amount) !== 0.1)).toBe(true);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('invokes Retry after a generic error', async () => {
    mockReceiveFor
      .mockRejectedValueOnce({ statusCode: 500, message: 'boom' })
      .mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('error-hint')).toHaveTextContent('boom');
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('quotes from the target side after spend is cleared and the target asset changes', async () => {
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await act(async () => {
      screen.getByTestId('select-targetAsset-BTC').click();
    });
    await flushQuote();
    expect(mockReceiveFor.mock.calls.some((call: any) => String(call[0].targetAmount) === '0.01')).toBe(true);
  });

  it('aligns the blockchain with assetOut when an address exists for that chain', async () => {
    mockUserAddresses = [{ address: '0xbtc', blockchains: ['Bitcoin'] }];
    mockUseAppParams.mockReturnValue(
      baseAppParams({ assetOut: 'Bitcoin/BTC', blockchain: 'Ethereum' }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(mockSetParams).toHaveBeenCalledWith({ blockchain: 'Bitcoin' });
    expect(mockSwitchBlockchain).toHaveBeenCalledWith('Bitcoin');
  });

  it('shows the address dropdown when blockchain is unset and assetOut is set', async () => {
    mockHideTarget = false;
    mockUseAppParams.mockReturnValue(
      baseAppParams({ blockchain: undefined, assetOut: 'Bitcoin/BTC', hideTargetSelection: false }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('dropdown-address')).toBeInTheDocument();
  });

  it('falls back to the wallet blockchain when assetIn does not match', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('select-sourceAsset-ETH')).toBeInTheDocument();
  });

  it('quotes from get data when spend was never set', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await flushQuote();
    expect(mockReceiveFor.mock.calls.some((call: any) => String(call[0].targetAmount) === '0.01')).toBe(true);
  });

  it('quotes from a new spend amount after the target field was cleared', async () => {
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await flushQuote();
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0.2' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.2');
    const after = mockReceiveFor.mock.calls.slice(callsBefore);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((call: any) => String(call[0].amount) === '0.2')).toBe(true);
  });

  it('keeps leftover target and does not quote after spend is cleared and the source asset changes', async () => {
    render(<SwapScreen />);
    await flushQuote();
    const targetBefore = (screen.getByTestId('input-targetAmount') as HTMLInputElement).value;
    expect(targetBefore).not.toBe('');
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      screen.getByTestId('select-sourceAsset-BTC').click();
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.getByTestId('input-targetAmount')).toHaveValue(targetBefore);
    expect(mockReceiveFor.mock.calls.slice(callsBefore)).toEqual([]);
  });

  it('skips the exact-price request when the first quote is empty', async () => {
    mockReceiveFor.mockResolvedValueOnce(undefined);
    render(<SwapScreen />);
    await flushQuote();
    expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice)).toBe(false);
  });

  it('renders empty balances in the asset dropdown', async () => {
    mockGetBalances.mockResolvedValue([]);
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('select-sourceAsset-ETH')).toBeInTheDocument();
  });

  it('quotes spend from leftover get data after a typed target and a source-asset change', async () => {
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice) return Promise.resolve(undefined);
      return Promise.resolve(quoteFor(req));
    });
    render(<SwapScreen />);
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    await act(async () => {
      screen.getByTestId('select-sourceAsset-BTC').click();
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(mockReceiveFor.mock.calls.some((call: any) => String(call[0].targetAmount) === '0.01')).toBe(true);
  });

  it('groups multiple source assets on the same chain when loading balances', async () => {
    const usdc = {
      id: 4,
      name: 'USDC',
      uniqueName: 'Ethereum/USDC',
      category: 'Public',
      blockchain: 'Ethereum',
      description: 'USD Coin',
    };
    mockAssets = [eth, usdc, btc];
    mockGetBalances.mockResolvedValue([
      { asset: eth, amount: 10 },
      { asset: usdc, amount: 20 },
      { asset: btc, amount: 1 },
    ]);
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('select-sourceAsset-ETH')).toBeInTheDocument();
    expect(screen.getByTestId('select-sourceAsset-USDC')).toBeInTheDocument();
  });

  it('does not restore amountIn after the user clears spend and the source asset changes', async () => {
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: '0.2' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0.2');
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await flushQuote();
    await act(async () => {
      screen.getByTestId('select-sourceAsset-BTC').click();
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
  });

  it('does not quote a zero spend amount', async () => {
    render(<SwapScreen />);
    await flushQuote();
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0' } });
    });
    await flushQuote();
    expect(screen.getByTestId('input-amount')).toHaveValue('0');
    const after = mockReceiveFor.mock.calls.slice(callsBefore);
    expect(after.every((call: any) => Number(call[0]?.amount) !== 0)).toBe(true);
  });

  it('shows the private-asset hint for a private target asset', async () => {
    mockAssets = [eth, usdtPrivate];
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument();
  });

  it('shows payment details when the private flag is set', async () => {
    mockAssets = [usdtPrivate];
    mockFlags = 'private';
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USDT', flags: 'private' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('payment-info')).toBeInTheDocument();
  });

  it('renders the form when the assetOut chain is missing', async () => {
    mockHideTarget = false;
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        blockchain: undefined,
        assetOut: 'Monero/XMR',
        hideTargetSelection: false,
      }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('form-submit')).toBeInTheDocument();
  });

  it.each([
    'LimitExceeded',
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
  ])('routes %s through QuoteErrorHint', async (error) => {
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('quote-error')).toHaveTextContent(error);
  });

  it('renders the form when the session is missing', async () => {
    mockSession = undefined;
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('form-submit')).toBeInTheDocument();
  });

  it('renders when the wallet chain is unset and assetIn does not match', async () => {
    mockWalletBlockchain = undefined;
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    render(<SwapScreen />);
    await flushQuote();
    expect(screen.getByTestId('form-submit')).toBeInTheDocument();
  });

  it('keeps the blockchain when it already matches assetOut', async () => {
    mockUserAddresses = [{ address: '0xbtc', blockchains: ['Bitcoin'] }];
    mockUseAppParams.mockReturnValue(
      baseAppParams({ assetOut: 'Bitcoin/BTC', blockchain: 'Bitcoin' }),
    );
    render(<SwapScreen />);
    await flushQuote();
    expect(mockSetParams).not.toHaveBeenCalledWith({ blockchain: 'Bitcoin' });
  });

  it('drops a quote error that rejects after unmount', async () => {
    let rejectQuote: (err: unknown) => void = () => undefined;
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectQuote = reject;
        }),
    );
    const { unmount } = render(<SwapScreen />);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    unmount();
    await act(async () => {
      rejectQuote({ statusCode: 500, message: 'late' });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('drops a quote that resolves after unmount', async () => {
    let resolveQuote: (value: unknown) => void = () => undefined;
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        }),
    );
    const { unmount } = render(<SwapScreen />);
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    unmount();
    await act(async () => {
      resolveQuote({
        id: 10,
        amount: 0.1,
        estimatedAmount: 0.01,
        sourceAsset: eth,
        targetAsset: btc,
        minVolume: 0.001,
        maxVolume: 100,
        isValid: true,
        exchangeRate: 1,
        rate: 1,
        feesTarget: {},
        priceSteps: [],
      });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });
});
