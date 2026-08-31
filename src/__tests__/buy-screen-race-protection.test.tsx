// Race-protection test: BuyScreen must discard a stale, slower-resolving quote
// when a newer fetch (triggered by personalIban change) already resolved.
// Mounts the real default-exported BuyScreen (react-hook-form runs for real;
// The debounce hook is replaced with an effect-driven, timer-free equivalent.
// personalIban comes from usePersonalIbanSelection() (not useAppParams).

const mockReceiveFor = jest.fn();
const mockConfirmFor = jest.fn();
const mockUseAppParams = jest.fn();
const mockPersonalIban = jest.fn();
const mockSetParams = jest.fn();
const mockLogout = jest.fn();
const mockNavigate = jest.fn();
const mockSwitchBlockchain = jest.fn();
const mockEmptyPersonalIbans: never[] = [];
const mockTranslate = (_ns: string, key: string) => key;
const mockTranslateError = (key: string) => key;
let mockSession: { address: string } | undefined;
let mockUser: { kyc: { level: number }; accountId: number } = { kyc: { level: 0 }, accountId: 1 };
let mockIsUserLoading = false;
let mockIsInitialized = true;
let mockPersonalIbanRows = {
  activePersonalIbans: undefined as unknown[] | undefined,
  personalIbanRowsSettled: true,
  userLoadTimedOut: false,
};

const mockAssets = [
  { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public', blockchain: 'Ethereum', description: 'Bitcoin' },
  { name: 'ETH', uniqueName: 'Ethereum/ETH', category: 'Public', blockchain: 'Ethereum', description: 'Ethereum' },
  { name: 'USDT', uniqueName: 'Ethereum/USDT', category: 'Private', blockchain: 'Ethereum', description: 'Tether' },
  { name: 'WBTC', uniqueName: 'Bitcoin/WBTC', category: 'Public', blockchain: 'Bitcoin', description: 'Wrapped' },
];
const mockAssetsMap = new Map([['Ethereum', mockAssets]]);
const mockGetAssets = () => mockAssets;
const mockGetAsset = (list: any[], name?: string) =>
  name ? (list ?? []).find((a: any) => a.name === name || a.uniqueName === name) : undefined;
const mockIsSameAsset = (asset: any, filter: string) => asset.name === filter || asset.uniqueName === filter;
const mockGetCurrency = (list: any[], name: string) => (list ?? []).find((c: any) => c.name === name);
const mockGetDefaultCurrency = (list: any[]) => list?.[0];
let mockCurrencies = [
  { name: 'EUR', sellable: true },
  { name: 'CHF', sellable: true },
  { name: 'USD', sellable: true },
];
// Stable reference: buy.screen currency-selection effect depends on prefCurrency by identity.
let mockPrefCurrency: { name: string } | undefined = { name: 'CHF' };

jest.mock('@dfx.swiss/react', () => {
  const buyInterface = {
    get currencies() {
      return mockCurrencies;
    },
    receiveFor: (...args: unknown[]) => mockReceiveFor(...args),
    confirmFor: (...args: unknown[]) => mockConfirmFor(...args),
    getPersonalIbans: () => Promise.resolve(mockEmptyPersonalIbans),
  };
  return {
    AssetCategory: { PUBLIC: 'Public', PRIVATE: 'Private' },
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
    Utils: { formatAmount: (n: number) => String(n), createRules: () => ({}) },
    Validations: { Required: undefined },
    useAsset: () => ({
      getAsset: mockGetAsset,
      isSameAsset: mockIsSameAsset,
    }),
    useAssetContext: () => ({
      assets: mockAssetsMap,
      getAssets: mockGetAssets,
    }),
    useAuthContext: () => ({ session: mockSession }),
    useBuy: () => buyInterface,
    useFiat: () => ({
      toSymbol: () => '',
      toDescription: () => '',
      getCurrency: mockGetCurrency,
      getDefaultCurrency: mockGetDefaultCurrency,
    }),
    useSessionContext: () => ({ logout: mockLogout }),
    useUserContext: () => ({ user: mockUser, isUserLoading: mockIsUserLoading }),
  };
});

jest.mock('@dfx.swiss/react-components', () => {
  // babel-plugin-jest-hoist moves this factory above the module's imports, so React and
  // react-hook-form are not yet in scope here and must be required directly instead.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Controller } = require('react-hook-form');

  // Mirror the real Form: inject `control` into descendants that declare `name`.
  function enrich(elements: any, control: any): any {
    if (!elements) return elements;
    return React.Children.map(elements, (element: any) => {
      if (!React.isValidElement(element)) return element;
      const props: any = element.props;
      const newChildren = enrich(props.children, control);
      if (props.name) {
        return React.cloneElement(element, { control, children: newChildren });
      }
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
    IconColor: { BLUE: 'blue' },
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
                data-testid={`select-${name}-${labelFunc(item) || index}`}
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
    StyledInfoText: ({ children }: any) => <div>{children}</div>,
    // Interactive so the clear/retype protection can drive the amount fields like a user would.
    StyledInput: ({ name, control, forceErrorMessage, loading, disabled }: any) =>
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
              {forceErrorMessage && <div data-testid={`input-${name}-error`}>{forceErrorMessage}</div>}
            </>
          )}
        />
      ) : null,
    StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
    StyledLoadingSpinner: () => <div data-testid="loading-spinner" />,
    StyledSearchDropdown: ({ name, items, labelFunc, control, filterFunc, descriptionFunc, assetIconFunc }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
            {items?.[0] && filterFunc?.(items[0], undefined)}
            {items?.[0] && filterFunc?.(items[0], 'btc')}
            {items?.[0] && descriptionFunc?.(items[0])}
            {items?.[0] && assetIconFunc?.(items[0])}
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

jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({ info, personalIbanProviderSwitch }: any) => (
    <div>
      <div data-testid="payment-info">{info.amount}</div>
      {personalIbanProviderSwitch && (
        <button
          type="button"
          data-testid="switch-provider"
          onClick={() => personalIbanProviderSwitch.onSwitch(personalIbanProviderSwitch.target)}
        >
          switch
        </button>
      )}
    </div>
  ),
}));
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
jest.mock('../components/payment/buy-completion', () => ({
  BuyCompletion: () => <div data-testid="buy-completion" />,
}));
jest.mock('../components/private-asset-hint', () => ({
  PrivateAssetHint: () => <div data-testid="private-asset-hint" />,
}));
jest.mock('../components/quote-error-hint', () => ({
  QuoteErrorHint: ({ error }: any) => <div data-testid="quote-error">{error}</div>,
}));
jest.mock('../components/sanction-hint', () => ({ SanctionHint: () => null }));

// labels.ts pulls many runtime enums from @dfx.swiss/react at module load; mock the only
// export BuyScreen uses so we do not need a full enum surface.
jest.mock('../config/labels', () => ({
  addressLabel: (wallet: any) => wallet?.address ?? '',
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: mockIsInitialized }),
}));
jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn(), rootRef: { current: null } }),
}));
// prefCurrency must be truthy: currency effect only calls setVal when prefCurrency && currency.
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: mockTranslate,
    translateError: mockTranslateError,
    currency: mockPrefCurrency,
  }),
}));
jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({
    blockchain: undefined,
    isInitialized: true,
    switchBlockchain: mockSwitchBlockchain,
  }),
}));
jest.mock('src/contexts/window.context', () => ({
  useWindowContext: () => ({ width: 800 }),
}));
jest.mock('../hooks/app-params.hook', () => ({
  useAppParams: () => mockUseAppParams(),
}));
jest.mock('../hooks/debounce.hook', () => ({
  __esModule: true,
  default: (value: unknown) => {
    // Hoisted factory again: React has to be required here rather than imported.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    const [debouncedValue, setDebouncedValue] = React.useState();
    const previousValue = React.useRef();
    const serializedValue = JSON.stringify(value);

    React.useEffect(() => {
      if (serializedValue !== previousValue.current) {
        previousValue.current = serializedValue;
        setDebouncedValue(value);
      }
    }, [serializedValue, value]);

    return debouncedValue;
  },
}));
jest.mock('../hooks/personal-iban.hook', () => ({
  usePersonalIbanSelection: () => ({
    requestedPersonalIban: mockPersonalIban(),
    personalIban: mockPersonalIban(),
    customerIdentity: 1,
    hasAuthenticatedCustomer: true,
  }),
}));
jest.mock('../hooks/personal-iban-rows.hook', () => ({
  usePersonalIbanRows: () => mockPersonalIbanRows,
}));
jest.mock('../hooks/blockchain.hook', () => ({
  useBlockchain: () => ({ toString: () => '' }),
}));
jest.mock('../hooks/guard.hook', () => ({
  useAddressGuard: () => undefined,
}));
jest.mock('../hooks/layout-config.hook', () => ({
  useLayoutOptions: () => undefined,
}));
jest.mock('../hooks/navigation.hook', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import BuyScreen from 'src/screens/buy.screen';

function baseAppParams(overrides: Record<string, unknown> = {}) {
  return {
    assets: undefined,
    assetIn: 'CHF',
    assetOut: 'BTC',
    amountIn: undefined,
    amountOut: undefined,
    blockchain: undefined,
    paymentMethod: undefined,
    externalTransactionId: undefined,
    flags: undefined,
    setParams: mockSetParams,
    hideTargetSelection: true,
    availableBlockchains: [],
    ...overrides,
  };
}

describe('BuyScreen quote race protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = undefined;
    mockPrefCurrency = { name: 'CHF' };
    mockCurrencies = [
      { name: 'EUR', sellable: true },
      { name: 'CHF', sellable: true },
      { name: 'USD', sellable: true },
    ];
  });

  async function waitFor(callback: () => unknown) {
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });
    return callback();
  }

  it('discards a stale, slower-resolving quote in favor of a newer, faster one', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'EUR' }));

    function offerFor(provider: string | undefined) {
      return {
        id: provider === undefined ? 1 : 2,
        amount: provider === undefined ? 111 : 222,
        currency: { name: 'EUR' },
        estimatedAmount: 0.01,
        asset: { name: 'BTC', uniqueName: 'Bitcoin' },
        minVolume: 1,
        maxVolume: 100000,
        isValid: true,
        exchangeRate: 1,
        rate: 1,
        fees: {},
        priceSteps: [],
        // Verified Frick fields so B1/C1 acknowledgement does not hide payment-info.
        ...(provider !== undefined
          ? { isPersonalIban: true, bank: 'Bank Frick', name: 'DFX AG' }
          : { isPersonalIban: false, name: 'DFX AG' }),
      };
    }

    let resolveSlow!: (value: ReturnType<typeof offerFor>) => void;
    const slow = new Promise<ReturnType<typeof offerFor>>((resolve) => {
      resolveSlow = resolve;
    });
    mockReceiveFor.mockImplementation((req: any) =>
      req.personalIbanProvider === undefined
        ? slow
        : Promise.resolve(offerFor(req.personalIbanProvider)),
    );

    const { rerender } = render(<BuyScreen />);

    // The timer-free debounce starts the first (slow) flight deterministically.
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(mockReceiveFor.mock.calls[0][0].personalIbanProvider).toBeUndefined();

    // personalIban is NOT itself debounced (only validatedData is) — changing it re-runs the
    // effect immediately with the current validatedData, firing the second (fast) flight
    // before the first (slow) one has resolved.
    mockPersonalIban.mockReturnValue('frick');
    rerender(<BuyScreen />);

    await waitFor(() =>
      expect(mockReceiveFor.mock.calls.some((c: any) => c[0].personalIbanProvider === 'Frick')).toBe(true),
    );

    // The fast flight wins first.
    await waitFor(() => expect(screen.getByTestId('payment-info')).toHaveTextContent('222'));

    // Resolve the first flight explicitly after the fast one has landed.
    await act(async () => {
      resolveSlow(offerFor(undefined));
      await Promise.resolve();
    });

    // Stale slow data must never overwrite the newer fast data.
    expect(screen.getByTestId('payment-info')).toHaveTextContent('222');
    expect(screen.queryByText('111')).not.toBeInTheDocument();
  });

  it('uses a pending USD response after the live selector toggles on an offer that cannot carry it (A2)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'USD' }));

    const offer = {
      id: 3,
      amount: 333,
      currency: { name: 'USD' },
      estimatedAmount: 0.03,
      asset: { name: 'BTC', uniqueName: 'Bitcoin' },
      minVolume: 1,
      maxVolume: 100000,
      isValid: true,
      exchangeRate: 1,
      rate: 1,
      fees: {},
      priceSteps: [],
      isPersonalIban: false,
      name: 'DFX AG',
    };
    let resolvePending!: (value: typeof offer) => void;
    const pending = new Promise<typeof offer>((resolve) => {
      resolvePending = resolve;
    });
    mockReceiveFor.mockImplementationOnce(() => pending).mockResolvedValue(offer);

    const { rerender } = render(<BuyScreen />);
    await waitFor(() => expect(mockReceiveFor).toHaveBeenCalledTimes(1));
    expect(mockReceiveFor.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');

    mockPersonalIban.mockReturnValue('frick');
    rerender(<BuyScreen />);

    await act(async () => {
      resolvePending(offer);
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Your requested personal IBAN is only available for EUR and CHF bank transfers, so it was not used for this offer.',
        ),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Continue without personal IBAN' }).click();
    });
    await waitFor(() => expect(screen.getByTestId('payment-info')).toHaveTextContent('333'));
    expect(mockReceiveFor.mock.calls.every((call: any) => !('personalIbanProvider' in call[0]))).toBe(true);
  });
});

// Clear/retype protection: an amount field the user just emptied must never be refilled from the
// opposite side — the exact-price echo used to write the recomputed equivalent (e.g. 299.98 for
// the 300 default) into the field mid-typing, making custom amounts nearly impossible to enter.
describe('BuyScreen cleared amount protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = undefined;
    mockUser = { kyc: { level: 0 }, accountId: 1 };
    mockIsUserLoading = false;
    mockIsInitialized = true;
    mockPrefCurrency = { name: 'CHF' };
    mockCurrencies = [
      { name: 'EUR', sellable: true },
      { name: 'CHF', sellable: true },
      { name: 'USD', sellable: true },
    ];
    mockPersonalIbanRows = {
      activePersonalIbans: undefined,
      personalIbanRowsSettled: true,
      userLoadTimedOut: false,
    };
  });

  async function settle(callback: () => unknown) {
    await act(async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });
    return callback();
  }

  function quoteFor(req: any) {
    const spendAmount = req.amount !== undefined ? Number(req.amount) : 300;
    return {
      id: 10,
      // the exact-price echo answers with the Rappen-exact equivalent, not the typed amount
      amount: req.exactPrice ? Number((spendAmount - 0.02).toFixed(2)) : spendAmount,
      currency: { name: req.currency?.name ?? 'CHF' },
      estimatedAmount: req.exactPrice ? 0.004709 : 0.0047,
      asset: { name: 'BTC', uniqueName: 'Bitcoin' },
      minVolume: 1,
      maxVolume: 100000,
      isValid: true,
      exchangeRate: 1,
      rate: 1,
      fees: {},
      priceSteps: [],
      isPersonalIban: false,
      name: 'DFX AG',
    };
  }

  it('does not write exact-price into a spend field cleared while a spend-side quote is in flight', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice && hangExact)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ targetAmount: '0.01', exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('does not write a resolving exact-price into spend when clear and resolve share a turn', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice && hangExact)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
      resolveExact(quoteFor({ targetAmount: '0.01', exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('does not write exact-price into a target field cleared while a get-side quote is in flight', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ amount: 150, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('does not write a resolving exact-price into target when clear and resolve share a turn', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
      resolveExact(quoteFor({ amount: 150, exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('does not let a stale exact-price overwrite a retyped spend amount', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice && hangExact)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ targetAmount: '0.01', exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('150');
  });

  it('does not write a resolving exact-price into a retyped spend amount in the same turn', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() =>
      expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.exactPrice && hangExact)).toBe(true),
    );
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
      resolveExact(quoteFor({ targetAmount: '0.01', exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('150');
  });

  it('still invalidates quotes when spend is cleared after an exact-price no-op write', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
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
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    hangExact = true;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      resolveExact(quoteFor({ targetAmount: '0.01', exactPrice: true }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('keeps a cleared amount field empty and accepts the retyped amount', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);

    // Default flow: 300 stays in the field, the exact estimate lands on the target side only.
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('payment-info')).toHaveTextContent('299.98'));
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.004709');

    // The user empties the field to retype: no cross-side recompute may refill it — and no
    // quote may fire at all for the emptied side (a fired quote would echo 299.98 back in).
    const callsBeforeClear = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument());
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.getByTestId('input-amount')).not.toBeDisabled();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(mockReceiveFor.mock.calls.length).toBe(callsBeforeClear);

    // Retyping works: the quote is requested for exactly the typed amount and the echo still
    // only updates the target side, so the purchase can be completed with the custom amount.
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toHaveTextContent('149.98'));
    expect(screen.getByTestId('input-amount')).toHaveValue('150');
    const retypedCalls = mockReceiveFor.mock.calls.slice(callsBeforeClear);
    expect(retypedCalls.length).toBeGreaterThan(0);
    expect(retypedCalls.every((call: any) => String(call[0].amount) === '150')).toBe(true);
  });

  it('keeps a cleared target amount field empty (mirrored protection)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.004709'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument());
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
  });

  it('accepts a retyped target amount as the quote source', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.004709'));

    const callsBeforeClear = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '0.01' } });
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.01');
    expect(screen.getByTestId('input-amount')).not.toHaveValue('');
    const retyped = mockReceiveFor.mock.calls.slice(callsBeforeClear);
    expect(retyped.length).toBeGreaterThan(0);
    expect(retyped.every((call: any) => String(call[0].targetAmount) === '0.01')).toBe(true);
  });

  it('does not restore amountOut after the user clears target and then changes asset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: undefined, amountOut: '0.01' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.01'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));

    await act(async () => {
      screen.getByTestId('select-asset-ETH').click();
    });
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));
  });

  it('still quotes from a never-set spend field via amountOut (deep-link fallback)', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: undefined, amountOut: '0.01' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue('0.01'));
    await settle(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(mockReceiveFor.mock.calls.some((call: any) => String(call[0].targetAmount) === '0.01')).toBe(true);
  });

  it('uses amountIn instead of the default 300', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: '100' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('100'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls.every((call: any) => String(call[0].amount) === '100')).toBe(true);
  });

  it('does not refill a cleared spend field when the currency changes', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));

    const callsBeforeCurrency = mockReceiveFor.mock.calls.length;
    await act(async () => {
      screen.getByTestId('select-currency-EUR').click();
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    const after = mockReceiveFor.mock.calls.slice(callsBeforeCurrency);
    expect(after.every((call: any) => call[0].amount === undefined)).toBe(true);
  });

  it('does not refill a cleared spend field when the asset changes', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));

    await act(async () => {
      screen.getByTestId('select-asset-ETH').click();
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('does not fall through to amountOut after the user clears spend', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: '100', amountOut: '0.01' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('100'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));

    const callsBeforeAsset = mockReceiveFor.mock.calls.length;
    await act(async () => {
      screen.getByTestId('select-asset-ETH').click();
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    const after = mockReceiveFor.mock.calls.slice(callsBeforeAsset);
    expect(after.every((call: any) => call[0].amount === undefined)).toBe(true);
  });

  it('does not restore amountIn after the user clears spend and then changes asset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ amountIn: '100' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('100'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));

    await act(async () => {
      screen.getByTestId('select-asset-ETH').click();
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('quotes the typed spend amount after both fields were cleared', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));

    const callsBeforeType = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByTestId('input-amount')).toHaveValue('150');
    const typed = mockReceiveFor.mock.calls.slice(callsBeforeType);
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.every((call: any) => String(call[0].amount) === '150')).toBe(true);
  });

  it('quotes from a new spend amount after the target field was cleared', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));

    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());

    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));

    const callsBeforeType = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByTestId('input-amount')).toHaveValue('150');
    const typed = mockReceiveFor.mock.calls.slice(callsBeforeType);
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.every((call: any) => String(call[0].amount) === '150')).toBe(true);
  });

  it('shows amount-too-low from the quote error field', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({ ...quoteFor(req), error: 'AmountTooLow', minVolume: 1 }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount-error')).toBeInTheDocument());
  });

  it('shows amount-too-high from the quote error field', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({ ...quoteFor(req), error: 'AmountTooHigh', maxVolume: 1 }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount-error')).toBeInTheDocument());
  });

  it('routes KYC quote errors through QuoteErrorHint', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error: 'KycRequired' }));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired'));
  });

  it.each(['LimitExceeded', 'EmailRequired', 'BankTransactionMissing', 'BankTransactionOrVideoMissing'])(
    'routes %s quote errors through QuoteErrorHint',
    async (error) => {
      mockPersonalIban.mockReturnValue(undefined);
      mockUseAppParams.mockReturnValue(baseAppParams());
      mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error }));
      render(<BuyScreen />);
      await settle(() => expect(screen.getByTestId('quote-error')).toHaveTextContent(error));
    },
  );

  it('does not retry a quote after the spend amount becomes invalid', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor
      .mockRejectedValueOnce({ statusCode: 500, message: 'boom' })
      .mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('0'));
    const retry = screen.queryByRole('button', { name: 'Retry' });
    if (retry) {
      await act(async () => {
        retry.click();
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
    }
    const after = mockReceiveFor.mock.calls.slice(callsBefore);
    expect(after.every((call: any) => Number(call[0]?.amount) !== 300)).toBe(true);
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
  });

  it('shows a generic error and retries', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValueOnce({ statusCode: 500, message: 'boom' }).mockImplementation((req: any) =>
      Promise.resolve(quoteFor(req)),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('uses Unknown error when the API omits a message', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 500 });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('filters assets when an asset filter is set', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assets: 'BTC', assetOut: 'BTC' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('select-asset-BTC')).toBeInTheDocument());
    expect(screen.queryByTestId('select-asset-ETH')).not.toBeInTheDocument();
  });

  it('shows the private-asset hint', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument());
  });

  it('uses the exact You get heading when rate is 1', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), rate: 1 }));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByText('You get')).toBeInTheDocument());
  });

  it('uses You get about when the rate is not 1', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), rate: 0.9 }));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByText('You get about')).toBeInTheDocument());
  });

  it('ignores confirm when the quote is not yet final', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice) return new Promise(() => undefined);
      return Promise.resolve(quoteFor(req));
    });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
    expect(screen.queryByTestId('buy-completion')).not.toBeInTheDocument();
  });

  it('drops a stale quote error after the form generation moved on', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    const rejectors: Array<(err: unknown) => void> = [];
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectors.push(reject);
        }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await settle(() => expect(rejectors.length).toBeGreaterThan(1));
    await act(async () => {
      rejectors[0]({ statusCode: 500, message: 'stale' });
      await Promise.resolve();
    });
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
  });

  it('drops a confirm result after the quote generation moved on', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    let resolveConfirm: (value?: unknown) => void = () => undefined;
    mockConfirmFor.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await act(async () => {
      resolveConfirm();
      await Promise.resolve();
    });
    expect(screen.queryByTestId('buy-completion')).not.toBeInTheDocument();
  });

  it('drops a confirm error after the quote generation moved on', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    let rejectConfirm: (err: unknown) => void = () => undefined;
    mockConfirmFor.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectConfirm = reject;
        }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '150' } });
    });
    await act(async () => {
      rejectConfirm({ message: 'stale-confirm' });
      await Promise.resolve();
    });
    expect(screen.queryByText('stale-confirm')).not.toBeInTheDocument();
  });

  it('confirms a final quote', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('buy-completion')).toBeInTheDocument());
  });

  it('shows a confirm error from the API', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockRejectedValue({ message: 'confirm-failed' });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('confirm-failed'));
  });

  it('opens and cancels the address switch', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum'],
        blockchain: 'Ethereum',
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('dropdown-address')).toBeInTheDocument());
    const switchButton = screen.getByTestId('select-address-Switch address');
    await act(async () => {
      switchButton.click();
    });
    expect(screen.getByTestId('address-switch')).toBeInTheDocument();
    await act(async () => {
      screen.getByTestId('address-switch-cancel').click();
    });
    expect(screen.queryByTestId('address-switch')).not.toBeInTheDocument();
  });

  it('logs out when the address switch is confirmed', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum'],
        blockchain: 'Ethereum',
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('dropdown-address')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('select-address-Switch address').click();
    });
    await act(async () => {
      screen.getByTestId('address-switch-confirm').click();
    });
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/connect', { setRedirect: true });
  });

  it('switches blockchain when another chain address is chosen', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum', 'Bitcoin'],
        blockchain: 'Ethereum',
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('dropdown-address')).toBeInTheDocument());
    const buttons = screen.getAllByTestId(/select-address-/);
    await act(async () => {
      buttons[1].click();
    });
    expect(mockSetParams).toHaveBeenCalled();
    expect(mockSwitchBlockchain).toHaveBeenCalled();
  });

  it('confirms a final quote from form submit', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('buy-completion')).toBeInTheDocument());
    expect(mockConfirmFor).toHaveBeenCalled();
  });

  it('does not confirm from form submit after spend is cleared', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
    expect(screen.queryByTestId('buy-completion')).not.toBeInTheDocument();
    expect(screen.getByTestId('input-amount')).toHaveValue('');
  });

  it('does not confirm from form submit after target is cleared', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
    expect(screen.queryByTestId('buy-completion')).not.toBeInTheDocument();
  });

  it('does not confirm from form submit when a quote error is showing', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 500, message: 'boom' });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('boom'));
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('does not confirm from form submit while the quote is not final', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => {
      if (req.exactPrice) return new Promise(() => undefined);
      return Promise.resolve(quoteFor(req));
    });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('does not confirm from form submit on a private asset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('private-asset-hint')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('confirms from form submit on a private asset when the private flag is set', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT', flags: 'private' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.queryByTestId('private-asset-hint')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('buy-completion')).toBeInTheDocument());
    expect(mockConfirmFor).toHaveBeenCalled();
  });

  it('confirms from the payment CTA on a private asset when the private flag is set', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'USDT', flags: 'private' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockResolvedValue(undefined);
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('buy-completion')).toBeInTheDocument());
    expect(mockConfirmFor).toHaveBeenCalled();
  });

  it('does not confirm from form submit when KYC blocks payment', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve({ ...quoteFor(req), error: 'KycRequired' }));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('quote-error')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('does not confirm from form submit when amount is too low', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({ ...quoteFor(req), error: 'AmountTooLow', minVolume: 1 }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount-error')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('does not confirm from form submit while personal IBAN needs acknowledgement', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() =>
      expect(screen.getByRole('button', { name: 'Continue without personal IBAN' })).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).not.toHaveBeenCalled();
  });

  it('does not confirm from form submit while a confirm is already in flight', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockImplementation(() => new Promise(() => undefined));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.submit(screen.getByTestId('form-submit').closest('form') as HTMLFormElement);
      await Promise.resolve();
    });
    expect(mockConfirmFor).toHaveBeenCalledTimes(1);
  });

  it('waits for personal IBAN rows instead of quoting while the user is loading', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockIsUserLoading = true;
    mockPersonalIbanRows = {
      activePersonalIbans: undefined,
      personalIbanRowsSettled: false,
      userLoadTimedOut: false,
    };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(mockReceiveFor).not.toHaveBeenCalled();
  });

  it('does not resume a stale quote after personal-IBAN rows settle on a cleared spend field', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockIsUserLoading = true;
    mockPersonalIbanRows = {
      activePersonalIbans: undefined,
      personalIbanRowsSettled: false,
      userLoadTimedOut: false,
    };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    const { rerender, unmount } = render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '' } });
      mockIsUserLoading = false;
      mockPersonalIbanRows = {
        activePersonalIbans: [],
        personalIbanRowsSettled: true,
        userLoadTimedOut: false,
      };
      rerender(<BuyScreen />);
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('');
    expect(screen.getByTestId('input-amount')).not.toBeDisabled();
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue(''));
    expect(screen.getByTestId('input-amount')).not.toBeDisabled();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    expect(
      mockReceiveFor.mock.calls.every((call: any) => call[0]?.amount !== 300 && Number(call[0]?.amount) !== 300),
    ).toBe(true);
    unmount();
  });

  it('does not resume a stale quote after a selector change on a cleared target field', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    const { rerender, unmount } = render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-targetAmount'), { target: { value: '' } });
      mockPersonalIban.mockReturnValue('Frick');
      rerender(<BuyScreen />);
    });
    expect(screen.getByTestId('input-targetAmount')).toHaveValue('');
    expect(screen.getByTestId('input-targetAmount')).not.toBeDisabled();
    await settle(() => expect(screen.getByTestId('input-targetAmount')).toHaveValue(''));
    expect(screen.getByTestId('input-targetAmount')).not.toBeDisabled();
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    unmount();
  });

  it('does not resume a stale quote after a selector change on a retyped spend field', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    const { rerender, unmount } = render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(screen.getByTestId('input-amount')).toHaveValue('300');
    const callsBeforeRetype = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '400' } });
      mockPersonalIban.mockReturnValue('Frick');
      rerender(<BuyScreen />);
    });
    expect(screen.getByTestId('input-amount')).toHaveValue('400');
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('400'));
    const afterRetype = mockReceiveFor.mock.calls.slice(callsBeforeRetype);
    expect(afterRetype.every((call: any) => Number(call[0]?.amount) !== 300)).toBe(true);
    unmount();
  });

  it('shows a personal-IBAN KYC hint when an explicit Frick selector is rejected', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'KycRequired' });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('quote-error')).toBeInTheDocument());
    expect(screen.getByTestId('quote-error')).toHaveTextContent('KycRequired');
  });

  it('offers Show available IBAN when the requested provider is missing', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'PersonalIbanProviderNotAvailable' });
    render(<BuyScreen />);
    await settle(() =>
      expect(screen.getByRole('button', { name: 'Show available IBAN' })).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Show available IBAN' }).click();
    });
    await settle(() =>
      expect(screen.queryByRole('button', { name: 'Show available IBAN' })).not.toBeInTheDocument(),
    );
  });

  it('suppresses automatic Frick after a KYC rejection when a Yapeal row exists', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUser = { kyc: { level: 50 }, accountId: 1 };
    mockPersonalIbanRows = {
      activePersonalIbans: [
        { bank: 'Yapeal', currency: 'CHF', active: true, acceptsPayments: true },
      ],
      personalIbanRowsSettled: true,
      userLoadTimedOut: false,
    };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor
      .mockRejectedValueOnce({ statusCode: 400, message: 'KycRequired' })
      .mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await settle(() => expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(0));
    const providers = mockReceiveFor.mock.calls.map((call: any) => call[0]?.personalIbanProvider);
    expect(providers.some((provider: unknown) => provider === 'Frick')).toBe(true);
    expect(providers[providers.length - 1]).not.toBe('Frick');
  });

  it('acknowledges a failed Frick verification and continues without the selector', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() =>
      expect(screen.getByRole('button', { name: 'Continue without personal IBAN' })).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Continue without personal IBAN' }).click();
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('maps a non-KYC personal-IBAN HTTP error onto QuoteErrorHint', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'EmailRequired' });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('quote-error')).toHaveTextContent('EmailRequired'));
  });

  it('switches personal IBAN provider on a verified Frick quote', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUser = { kyc: { level: 50 }, accountId: 1 };
    mockPersonalIbanRows = {
      activePersonalIbans: [
        { bank: 'Yapeal', currency: 'CHF', active: true, acceptsPayments: true },
      ],
      personalIbanRowsSettled: true,
      userLoadTimedOut: false,
    };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({
        ...quoteFor(req),
        isPersonalIban: true,
        bank: 'Bank Frick',
        name: 'DFX AG',
      }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('switch-provider')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('switch-provider').click();
    });
    expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(1);
  });

  it('blocks an unrecognized personal IBAN selector', async () => {
    mockPersonalIban.mockReturnValue('nope');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Continue without personal IBAN' })).toBeInTheDocument();
    await act(async () => {
      screen.getByRole('button', { name: 'Continue without personal IBAN' }).click();
    });
    await settle(() => expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument());
  });

  it('navigates to generate a personal IBAN from a non-Frick currency', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('select-currency-USD').click();
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Generate personal IBAN' }).click();
    });
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('treats a user with a different account id as not the active customer', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUser = { kyc: { level: 50 }, accountId: 99 };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    expect(
      mockReceiveFor.mock.calls.every((call: any) => call[0]?.personalIbanProvider !== 'Frick'),
    ).toBe(true);
  });

  it('falls back to the first asset when assetOut does not match', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetOut: 'NOPE', blockchain: 'Ethereum' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('select-asset-BTC')).toBeInTheDocument());
  });

  it('renders the spend field while the app is uninitialized', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockIsInitialized = false;
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toBeInTheDocument());
  });

  it('does not request an exact price when the first quote is empty', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      req.exactPrice ? Promise.resolve(quoteFor(req)) : Promise.resolve(undefined),
    );
    render(<BuyScreen />);
    await settle(() => expect(mockReceiveFor).toHaveBeenCalled());
    expect(mockReceiveFor.mock.calls.every((call: any) => !call[0]?.exactPrice)).toBe(true);
  });

  it('renders when wallet, URL blockchain and availableBlockchains are unset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(
      baseAppParams({ blockchain: undefined, availableBlockchains: undefined, assetOut: 'NOPE' }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toBeInTheDocument());
  });

  it('continues without personal IBAN when Frick is inapplicable for the currency', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    await act(async () => {
      screen.getByTestId('select-currency-USD').click();
    });
    await settle(() =>
      expect(screen.getByRole('button', { name: 'Continue without personal IBAN' })).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Continue without personal IBAN' }).click();
    });
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('maps an Instant paymentMethod param onto bank', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ paymentMethod: 'Instant' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    expect(mockReceiveFor.mock.calls.some((call: any) => call[0]?.paymentMethod === 'Bank')).toBe(true);
  });

  it('switches from a verified Yapeal quote to Frick', async () => {
    mockPersonalIban.mockReturnValue('Yapeal');
    mockUser = { kyc: { level: 50 }, accountId: 1 };
    mockPersonalIbanRows = {
      activePersonalIbans: [{ bank: 'Yapeal', currency: 'CHF', active: true, acceptsPayments: true }],
      personalIbanRowsSettled: true,
      userLoadTimedOut: false,
    };
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) =>
      Promise.resolve({
        ...quoteFor(req),
        isPersonalIban: true,
        bank: 'Yapeal',
        name: 'Customer',
      }),
    );
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('switch-provider')).toBeInTheDocument());
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      screen.getByTestId('switch-provider').click();
    });
    expect(mockReceiveFor.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('falls back to the preferred currency when assetIn is unknown', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('select-currency-CHF')).toBeInTheDocument());
  });

  it('falls back to the default currency when assetIn and preferred currency are unknown', async () => {
    mockPrefCurrency = { name: 'GBP' };
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('select-currency-EUR')).toBeInTheDocument());
  });

  it('renders when no preferred currency is set', async () => {
    mockPrefCurrency = undefined;
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams({ assetIn: 'NOPE' }));
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toBeInTheDocument());
  });

  it('renders when the currency list is empty', async () => {
    mockCurrencies = [];
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('form-submit')).toBeInTheDocument());
  });

  it('tolerates a repeated quote signature under StrictMode', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(
      <StrictMode>
        <BuyScreen />
      </StrictMode>,
    );
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
  });

  it('uses Unknown error when confirm omits a message', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    mockConfirmFor.mockRejectedValue({});
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('payment-info')).toBeInTheDocument());
    await act(async () => {
      screen.getByRole('button', { name: 'Click here once you have issued the transfer' }).click();
      await Promise.resolve();
    });
    await settle(() => expect(screen.getByTestId('error-hint')).toHaveTextContent('Unknown error'));
  });

  it('maps a personal-IBAN issuance failure without offering Show available IBAN', async () => {
    mockPersonalIban.mockReturnValue('Frick');
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockRejectedValue({ statusCode: 400, message: 'PersonalIbanIssuanceFailed' });
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('error-hint')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Show available IBAN' })).not.toBeInTheDocument();
  });

  it('renders the form when the URL chain is not in the address list', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum'],
        blockchain: 'Arbitrum',
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('form-submit')).toBeInTheDocument());
  });

  it('renders the form when blockchain is unset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum'],
        blockchain: undefined,
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('form-submit')).toBeInTheDocument());
  });

  it('renders while uninitialized with a session address present', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockIsInitialized = false;
    mockSession = { address: '0xabc' };
    mockUseAppParams.mockReturnValue(
      baseAppParams({
        hideTargetSelection: false,
        availableBlockchains: ['Ethereum'],
        blockchain: 'Ethereum',
      }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toBeInTheDocument());
  });

  it('drops a quote that resolves after unmount', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    let resolveQuote: (value: unknown) => void = () => undefined;
    mockReceiveFor.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveQuote = resolve;
        }),
    );
    const { unmount } = render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    unmount();
    await act(async () => {
      resolveQuote(quoteFor({ amount: 300 }));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('payment-info')).not.toBeInTheDocument();
    expect(screen.queryByTestId('error-hint')).not.toBeInTheDocument();
  });

  it('does not quote a zero spend amount', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(baseAppParams());
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('300'));
    const callsBefore = mockReceiveFor.mock.calls.length;
    await act(async () => {
      fireEvent.change(screen.getByTestId('input-amount'), { target: { value: '0' } });
    });
    await settle(() => expect(screen.getByTestId('input-amount')).toHaveValue('0'));
    const after = mockReceiveFor.mock.calls.slice(callsBefore);
    expect(after.every((call: any) => Number(call[0]?.amount) !== 0)).toBe(true);
  });

  it('uses availableBlockchains when both wallet and URL chain are unset', async () => {
    mockPersonalIban.mockReturnValue(undefined);
    mockUseAppParams.mockReturnValue(
      baseAppParams({ blockchain: undefined, availableBlockchains: ['Ethereum'] }),
    );
    mockReceiveFor.mockImplementation((req: any) => Promise.resolve(quoteFor(req)));
    render(<BuyScreen />);
    await settle(() => expect(screen.getByTestId('select-asset-BTC')).toBeInTheDocument());
  });
});
