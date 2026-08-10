// Race-protection test: BuyScreen must discard a stale, slower-resolving quote
// when a newer fetch (triggered by personalIban change) already resolved.
// Mounts the real default-exported BuyScreen (react-hook-form runs for real;
// The debounce hook is replaced with an effect-driven, timer-free equivalent.
// personalIban comes from usePersonalIbanSelection() (not useAppParams).

const mockReceiveFor = jest.fn();
const mockUseAppParams = jest.fn();
const mockPersonalIban = jest.fn();
const mockSetParams = jest.fn();

const mockAssets = [
  { name: 'BTC', uniqueName: 'Bitcoin', category: 'Public', blockchain: 'Ethereum', description: 'Bitcoin' },
];
const mockAssetsMap = new Map([['Ethereum', mockAssets]]);
const mockGetAssets = () => mockAssets;
const mockGetAsset = (list: any[], name: string) =>
  (list ?? []).find((a: any) => a.name === name) ?? list?.[0];
const mockIsSameAsset = () => false;
const mockGetCurrency = (list: any[], name: string) => (list ?? []).find((c: any) => c.name === name);
const mockGetDefaultCurrency = (list: any[]) => list?.[0];
const mockCurrencies = [
  { name: 'EUR', sellable: true },
  { name: 'CHF', sellable: true },
  { name: 'USD', sellable: true },
];
// Stable reference: buy.screen currency-selection effect depends on prefCurrency by identity.
const mockPrefCurrency = { name: 'CHF' };

jest.mock('@dfx.swiss/react', () => ({
  AssetCategory: { PUBLIC: 'Public', PRIVATE: 'Private' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick' },
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
  useAuthContext: () => ({ session: undefined }),
  useBuy: () => ({
    currencies: mockCurrencies,
    receiveFor: mockReceiveFor,
    confirmFor: jest.fn(),
  }),
  useFiat: () => ({
    toSymbol: () => '',
    toDescription: () => '',
    getCurrency: mockGetCurrency,
    getDefaultCurrency: mockGetDefaultCurrency,
  }),
  useSessionContext: () => ({ logout: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
}));

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
    Form: ({ children, control }: any) => <div>{enrich(children, control)}</div>,
    IconColor: { BLUE: 'blue' },
    SpinnerSize: { SM: 'sm', LG: 'lg' },
    StyledButton: ({ label, onClick }: any) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
    StyledButtonColor: { STURDY_WHITE: 'sturdy-white' },
    StyledButtonWidth: { MIN: 'min', FULL: 'full' },
    StyledDropdown: ({ name, items, labelFunc, control }: any) => (
      <Controller
        name={name}
        control={control}
        render={({ field }: any) => (
          <div data-testid={`dropdown-${name}`}>
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
    StyledHorizontalStack: ({ children }: any) => <div>{children}</div>,
    StyledInfoText: ({ children }: any) => <div>{children}</div>,
    StyledInput: () => null,
    StyledLink: ({ children, label }: any) => <div>{label ?? children}</div>,
    StyledLoadingSpinner: () => null,
    StyledSearchDropdown: () => null,
    StyledVerticalStack: ({ children }: any) => <div>{children}</div>,
  };
});

jest.mock('src/components/payment/payment-info-buy', () => ({
  PaymentInformationContent: ({ info }: any) => <div data-testid="payment-info">{info.amount}</div>,
}));
jest.mock('../components/edit/name.edit', () => ({ NameEdit: () => null }));
jest.mock('../components/error-hint', () => ({ ErrorHint: ({ message }: any) => <div>{message}</div> }));
jest.mock('../components/exchange-rate', () => ({ ExchangeRate: () => null }));
jest.mock('../components/payment/address-switch', () => ({ AddressSwitch: () => null }));
jest.mock('../components/payment/buy-completion', () => ({ BuyCompletion: () => null }));
jest.mock('../components/private-asset-hint', () => ({ PrivateAssetHint: () => null }));
jest.mock('../components/quote-error-hint', () => ({ QuoteErrorHint: () => null }));
jest.mock('../components/sanction-hint', () => ({ SanctionHint: () => null }));

// labels.ts pulls many runtime enums from @dfx.swiss/react at module load; mock the only
// export BuyScreen uses so we do not need a full enum surface.
jest.mock('../config/labels', () => ({
  addressLabel: (wallet: any) => wallet?.address ?? '',
}));

jest.mock('../contexts/app-handling.context', () => ({
  useAppHandlingContext: () => ({ isInitialized: true }),
}));
jest.mock('../contexts/layout.context', () => ({
  useLayoutContext: () => ({ scrollToTop: jest.fn(), rootRef: { current: null } }),
}));
// prefCurrency must be truthy: currency effect only calls setVal when prefCurrency && currency.
jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({
    translate: (_ns: string, key: string) => key,
    translateError: (key: string) => key,
    currency: mockPrefCurrency,
  }),
}));
jest.mock('../contexts/wallet.context', () => ({
  useWalletContext: () => ({ blockchain: undefined, isInitialized: true, switchBlockchain: jest.fn() }),
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
    hasAuthenticatedCustomer: true,
  }),
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
  useNavigation: () => ({ navigate: jest.fn() }),
}));

import { act, render, screen } from '@testing-library/react';
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
