// Partner widget params: each test asserts the effect, not that the string appears.

const mockCall = jest.fn();
const mockReceiveForBuy = jest.fn();
const mockReceiveForSell = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockCreateAccount = jest.fn();
const mockAssets: Array<Record<string, unknown>> = [];
const mockCurrencies: Array<Record<string, unknown>> = [];
const mockBankAccounts: Array<Record<string, unknown>> = [];
let mockBankAccountsLoaded = true;
const mockLocation = { search: '' };

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    SOLANA: 'Solana',
    MONERO: 'Monero',
    TRON: 'Tron',
    CARDANO: 'Cardano',
    INTERNET_COMPUTER: 'InternetComputer',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    SEPOLIA: 'Sepolia',
    FIRO: 'Firo',
    ZANO: 'Zano',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    RAILGUN: 'Railgun',
    DEFICHAIN: 'DeFiChain',
  },
  AuthWalletType: { METAMASK: 'MetaMask', CLI: 'CLI', WALLET_CONNECT: 'WalletConnect' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
  VirtualIbanStatus: { ACTIVE: 'Active' },
  TransactionError: { AMOUNT_TOO_LOW: 'AmountTooLow' },
  BuyUrl: { quote: 'buy/quote' },
  SellUrl: { quote: 'sell/quote' },
  SwapUrl: { quote: 'swap/quote' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap }),
  useUser: () => ({ updateMail: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
  useAssetContext: () => ({ getAssets: () => mockAssets }),
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useBankAccountContext: () => ({
    bankAccounts: mockBankAccountsLoaded ? mockBankAccounts : undefined,
    isLoading: false,
    createAccount: mockCreateAccount,
  }),
}));

jest.mock('react-router-dom', () => ({ useLocation: () => mockLocation }));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({
    isLoggedIn: true,
    address: '0x7099797000000000000000000000000000000000',
    blockchain: 'Ethereum',
    blockchains: ['Ethereum', 'Bitcoin', 'Arbitrum'],
    activeWallet: undefined,
    openConnect: jest.fn(),
    openSwitcher: jest.fn(),
  }),
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HomeScreen from '../screens/home';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

const validQuote = {
  estimatedAmount: 0.002,
  amount: 100,
  fees: { total: 1.5, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
  feesTarget: { total: 1.5, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
  exchangeRate: 50000,
  rate: 50000,
  isValid: true,
  minVolume: 1,
  maxVolume: 10000,
};

function coin(name: string, blockchain: string, extra: Record<string, unknown> = {}) {
  return {
    id: extra.id ?? `${name}-${blockchain}`,
    name,
    uniqueName: `${blockchain}/${name}`,
    description: name,
    blockchain,
    buyable: true,
    sellable: true,
    instantBuyable: false,
    ...extra,
  };
}

function seedMarket() {
  mockAssets.push(
    coin('BTC', 'Bitcoin', { id: 113 }),
    coin('USDT', 'Ethereum', { id: 111, instantBuyable: true }),
    coin('ETH', 'Ethereum', { id: 112 }),
    coin('DEPS', 'Ethereum', { id: 114, category: 'Private' }),
  );
  mockCurrencies.push(
    { id: 1, name: 'EUR', buyable: true, sellable: true, instantSellable: true },
    { id: 2, name: 'CHF', buyable: true, sellable: true },
    { id: 3, name: 'USD', buyable: true, sellable: true },
  );
  mockBankAccounts.push(
    { id: 1, iban: 'DE89370400440532013000', label: 'Default', default: true },
    { id: 2, iban: 'CH9300762011623852957', label: 'Savings', default: false },
  );
}

function setParams(search: string) {
  mockLocation.search = search;
  window.history.replaceState({}, '', search ? `/${search}` : '/');
}

function renderHome() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <HomeScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

async function settleQuote() {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

describe('Home partner widget params', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAssets.length = 0;
    mockCurrencies.length = 0;
    mockBankAccounts.length = 0;
    mockBankAccountsLoaded = true;
    mockLocation.search = '';
    mockCall.mockResolvedValue(validQuote);
    mockReceiveForBuy.mockResolvedValue({ ...validQuote, iban: 'CH93', remittanceInfo: 'ref' });
    mockReceiveForSell.mockResolvedValue({
      ...validQuote,
      routeId: 9,
      amount: 0.1,
      asset: { name: 'BTC', blockchain: 'Bitcoin' },
      depositAddress: '0xdeposit',
    });
    mockCreateAccount.mockResolvedValue({ id: 9, iban: 'LI21088100002324013AA' });
    mockReceiveForSwap.mockResolvedValue({
      ...validQuote,
      routeId: 8,
      amount: 0.1,
      sourceAsset: { name: 'BTC', blockchain: 'Bitcoin' },
      targetAsset: { name: 'USDT', blockchain: 'Ethereum' },
      depositAddress: '0xswap',
    });
    seedMarket();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    jest.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('hides the receive-asset picker when hide-target-selection is set, and leaves it when absent', async () => {
    const visible = renderHome();
    await settleQuote();
    const open = screen.getByRole('button', { name: /select receive asset/i });
    expect(open).not.toBeDisabled();
    fireEvent.click(open);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    visible.unmount();

    setParams('?hide-target-selection=true');
    renderHome();
    await settleQuote();
    const hidden = screen.getByLabelText(/select receive asset/i);
    expect(hidden).toBeDisabled();
    fireEvent.click(hidden);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the receive-asset picker when hide-target-selection is any non-empty value', async () => {
    setParams('?hide-target-selection=1');
    renderHome();
    await settleQuote();
    expect(screen.getByLabelText(/select receive asset/i)).toBeDisabled();
  });

  it('hides the sell receive-currency picker when hide-target-selection is set', async () => {
    setParams('?mode=sell&hide-target-selection=true');
    renderHome();
    await settleQuote();
    const currency = screen.getByLabelText(/select receive currency/i);
    expect(currency).toBeDisabled();
    fireEvent.click(currency);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('selects the pay currency from asset-in and falls back when it is unknown', async () => {
    setParams('?asset-in=CHF');
    const chf = renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select pay currency/i })).toHaveTextContent('CHF');
    chf.unmount();

    setParams('?asset-in=NOPE');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select pay currency/i })).toHaveTextContent('EUR');
  });

  it('selects the receive asset from asset-out and falls back when it is unknown', async () => {
    setParams('?asset-out=Ethereum/USDT');
    const usdt = renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('USDT');
    usdt.unmount();

    setParams('?asset-out=NOPE');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('BTC');
  });

  it('limits the buy pool to assets=ETH and leaves BTC when the param is absent', async () => {
    const absent = renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('BTC');
    absent.unmount();

    setParams('?assets=ETH');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('ETH');
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    expect(screen.queryByRole('button', { name: /^BTC\b/ })).not.toBeInTheDocument();
  });

  it('empties the buy pool when assets names nothing in the market', async () => {
    setParams('?assets=NOPE');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).not.toHaveTextContent('BTC');
    expect(screen.getByRole('button', { name: /select receive asset/i })).not.toHaveTextContent('ETH');
  });

  it('limits buy chains to blockchains=Ethereum and keeps Bitcoin when the param is absent', async () => {
    const absent = renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('BTC');
    absent.unmount();

    setParams('?blockchains=Ethereum');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('USDT');
    expect(screen.getByRole('button', { name: /select receive asset/i })).not.toHaveTextContent('Bitcoin');
  });

  it('empties reachable buy chains when blockchains names nothing the wallet can reach', async () => {
    setParams('?blockchains=Mars');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).not.toHaveTextContent('BTC');
    expect(screen.getByRole('button', { name: /select receive asset/i })).not.toHaveTextContent('USDT');
  });

  it('makes a private buy-target visible only when asset-out names it', async () => {
    const hidden = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    expect(screen.queryByText('DEPS')).not.toBeInTheDocument();
    hidden.unmount();

    setParams('?asset-in=DEPS');
    const sellNameOnly = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    expect(screen.queryByText('DEPS')).not.toBeInTheDocument();
    sellNameOnly.unmount();

    setParams('?asset-out=DEPS');
    renderHome();
    await settleQuote();
    const pill = screen.getByRole('button', { name: /select receive asset/i });
    expect(pill).toHaveTextContent('DEPS');
    fireEvent.click(pill);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('makes a private sell-source visible only when asset-in names it', async () => {
    setParams('?mode=sell');
    const hidden = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    expect(screen.queryByText('DEPS')).not.toBeInTheDocument();
    hidden.unmount();

    setParams('?mode=sell&asset-out=DEPS');
    const buyNameOnly = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    expect(screen.queryByText('DEPS')).not.toBeInTheDocument();
    buyNameOnly.unmount();

    setParams('?mode=sell&asset-in=DEPS');
    renderHome();
    await settleQuote();
    const pill = screen.getByRole('button', { name: /select pay asset/i });
    expect(pill).toHaveTextContent('DEPS');
    fireEvent.click(pill);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lets a named private buy complete when flags includes private', async () => {
    setParams('?asset-out=DEPS&flags=private');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('DEPS');
    expect(screen.queryByText(/does not offer to buy or sell|bietet kauf und verkauf|non offre l'acquisto|n'offre pas l'achat/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('trade-cta')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
  });

  it('blocks a named private buy when flags is absent', async () => {
    setParams('?asset-out=DEPS');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('DEPS');
    expect(screen.getByText(/does not offer to buy or sell|bietet kauf und verkauf|non offre l'acquisto|n'offre pas l'achat/i)).toBeInTheDocument();
    const cta = screen.getByTestId('trade-cta');
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    await settleQuote();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('ignores an unknown flags value and still blocks a private buy', async () => {
    setParams('?asset-out=DEPS&flags=foo');
    renderHome();
    await settleQuote();
    const cta = screen.getByTestId('trade-cta');
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    await settleQuote();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('quotes from amount-out and does not restore it after the user clears receive', async () => {
    setParams('?amount-out=0.01');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetAmount: 0.01 }) }),
    );
    expect(mockCall.mock.calls.some((call) => Object.prototype.hasOwnProperty.call(call[0].data, 'amount'))).toBe(
      false,
    );
    const receive = screen.getByRole('textbox', { name: /amount you receive/i });
    expect(receive).toHaveValue('0.01');
    expect(receive).not.toHaveAttribute('readOnly');

    fireEvent.change(receive, { target: { value: '0.02' } });
    await settleQuote();
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ targetAmount: 0.02 }) }),
      ),
    );
    fireEvent.change(receive, { target: { value: '' } });
    expect(receive).toHaveValue('');
    mockCall.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(screen.getByText('USDT'));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('');
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 100 }) }),
    );
  });

  it('quotes a source amount when amount-out is absent', async () => {
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 100 }) }),
    );
    expect(
      mockCall.mock.calls.some((call) => Object.prototype.hasOwnProperty.call(call[0].data, 'targetAmount')),
    ).toBe(false);
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveAttribute('readOnly');
  });

  it('quotes from amount-in and does not restore it after the user clears pay', async () => {
    setParams('?amount-in=250');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 250 }) }),
    );
    const pay = screen.getByRole('textbox', { name: /amount you pay/i });
    expect(pay).toHaveValue('250');

    fireEvent.change(pay, { target: { value: '' } });
    expect(pay).toHaveValue('');
    mockCall.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(screen.getByText('USDT'));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('');
  });

  it('quotes the source amount when amount-in is set even if amount-out is also present', async () => {
    setParams('?amount-in=250&amount-out=0.01');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 250 }) }),
    );
    expect(
      mockCall.mock.calls.some((call) => Object.prototype.hasOwnProperty.call(call[0].data, 'targetAmount')),
    ).toBe(false);
    const receive = screen.getByRole('textbox', { name: /amount you receive/i });
    expect(receive).toHaveAttribute('readOnly');
    expect(receive).not.toHaveValue('0.01');
  });

  it('quotes a default source amount when amount-in is absent', async () => {
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 100 }) }),
    );
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('100');
  });

  it('prefers Instant when payment-method asks for it, and stays on Bank when it is absent or unknown', async () => {
    setParams('?asset-out=USDT&payment-method=instant');
    const instant = renderHome();
    await settleQuote();
    expect(document.querySelector('.pmethod b')?.textContent).toMatch(/instant|sofort/i);
    instant.unmount();

    setParams('?asset-out=USDT&payment-method=paypal');
    const unknown = renderHome();
    await settleQuote();
    expect(document.querySelector('.pmethod b')?.textContent).toMatch(/bank|sepa/i);
    unknown.unmount();

    setParams('?asset-out=USDT');
    renderHome();
    await settleQuote();
    expect(document.querySelector('.pmethod b')?.textContent).toMatch(/bank|sepa/i);
  });

  it('keeps Bank when payment-method is in the enum but not offered for the pair', async () => {
    // Card is a real FiatPaymentMethod; paymentMethodsFor never returns it (API rejects CARD).
    // Default BTC is not instantBuyable, so the pair offers Bank only — unlike `paypal`, which
    // parseEnumValue already drops.
    setParams('?payment-method=card');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall.mock.calls.every((call) => call[0].data.paymentMethod === 'Bank')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(mockReceiveForBuy.mock.calls.every((call) => call[0].paymentMethod === 'Bank')).toBe(true);
  });

  it('ignores an unknown blockchain and keeps the Bitcoin default', async () => {
    setParams('?blockchain=Mars');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('BTC');
  });

  it('filters the buy chain to blockchain=Ethereum, and defaults to Bitcoin without it', async () => {
    const absent = renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('BTC');
    absent.unmount();

    setParams('?blockchain=Ethereum');
    renderHome();
    await settleQuote();
    const pill = screen.getByRole('button', { name: /select receive asset/i });
    expect(pill).toHaveTextContent('USDT');
    expect(pill.querySelector('s')?.textContent).toMatch(/ethereum/i);
  });

  it('selects swap assets from asset-in and asset-out', async () => {
    setParams('?mode=swap&asset-in=ETH&asset-out=USDT');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select pay asset/i })).toHaveTextContent('ETH');
    expect(screen.getByRole('button', { name: /select receive asset/i })).toHaveTextContent('USDT');
  });

  it('selects the sell receive currency from asset-out', async () => {
    setParams('?mode=sell&asset-out=CHF');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive currency/i })).toHaveTextContent('CHF');
  });

  it('starts sell when service=sell, and leaves buy when service is absent', async () => {
    const absent = renderHome();
    await settleQuote();
    expect(screen.getByRole('tab', { name: /buy|kaufen/i })).toHaveAttribute('aria-selected', 'true');
    absent.unmount();

    setParams('?service=sell');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('tab', { name: /sell|verkaufen/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('lets mode win over service when both are set', async () => {
    setParams('?service=sell&mode=swap');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('tab', { name: /swap|tausch/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects the named sell payout account, and the default when bank-account is absent', async () => {
    // `?mode=sell` uses setMode, not changeMode, so sellRaw stays empty unless amount-in is set.
    setParams('?mode=sell&amount-in=0.1&bank-account=CH9300762011623852957');
    const named = renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'CH9300762011623852957' }));
    expect(
      screen.queryByRole('dialog', {
        name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
      }),
    ).not.toBeInTheDocument();
    expect(mockCreateAccount).not.toHaveBeenCalled();
    named.unmount();
    mockReceiveForSell.mockClear();

    setParams('?mode=sell&amount-in=0.1');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(
      screen.queryByRole('dialog', {
        name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
  });

  it('waits for bank accounts to load before applying bank-account', async () => {
    mockBankAccountsLoaded = false;
    setParams('?mode=sell&amount-in=0.1&bank-account=CH9300762011623852957');
    const view = renderHome();
    await settleQuote();
    expect(
      screen.queryByRole('dialog', {
        name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
      }),
    ).not.toBeInTheDocument();
    expect(mockCreateAccount).not.toHaveBeenCalled();

    mockBankAccountsLoaded = true;
    view.rerender(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'CH9300762011623852957' }));
  });

  it('ignores confirmation callbacks when no confirmation is pending', () => {
    renderHome();
    fireEvent.click(screen.getByText('Add account'));
    fireEvent.click(screen.getByText('Continue to host'));
    expect(mockCreateAccount).not.toHaveBeenCalled();
  });

  it('does not apply a bank-account create that resolves after the param has changed', async () => {
    let resolveCreate: ((account: { id: number; iban: string }) => void) | undefined;
    mockCreateAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    const view = renderHome();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /add account|konto hinzufügen|aggiungi conto|ajouter le compte/i,
      }),
    );
    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalled());
    // Drop the param so the effect cannot re-select a matching existing account (that path
    // would overwrite a stale create and hide a missing live-ref guard).
    setParams('?mode=sell&amount-in=0.1');
    view.rerender(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    mockReceiveForSell.mockClear();
    await act(async () => {
      resolveCreate?.({ id: 9, iban: 'LI21088100002324013AA' });
    });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
    expect(mockReceiveForSell).not.toHaveBeenCalledWith(expect.objectContaining({ iban: 'LI21088100002324013AA' }));
  });

  it('does not create a payout account for an invalid bank-account IBAN', async () => {
    setParams('?mode=sell&amount-in=0.1&bank-account=NOTANIBAN');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCreateAccount).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', {
        name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('shows the full new bank-account IBAN and creates it only after confirmation', async () => {
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    renderHome();
    await settleQuote();
    const confirmation = await screen.findByRole('dialog', {
      name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
    });
    expect(
      within(confirmation).getByText('Check the full IBAN before adding it as the payout account for this sale.'),
    ).toBeInTheDocument();
    expect(within(confirmation).getByText('LI21088100002324013AA')).toBeInTheDocument();
    expect(mockCreateAccount).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: /add account|konto hinzufügen|aggiungi conto|ajouter le compte/i,
      }),
    );
    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalledWith({ iban: 'LI21088100002324013AA' }));
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'LI21088100002324013AA' }));
  });

  it('offers to create the first payout account and waits for confirmation', async () => {
    mockBankAccounts.length = 0;
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    renderHome();
    await settleQuote();
    const confirmation = await screen.findByRole('dialog', {
      name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
    });
    expect(within(confirmation).getByText('LI21088100002324013AA')).toBeInTheDocument();
    expect(mockCreateAccount).not.toHaveBeenCalled();

    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: /add account|konto hinzufügen|aggiungi conto|ajouter le compte/i,
      }),
    );

    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalledTimes(1));
    expect(mockCreateAccount).toHaveBeenCalledWith({ iban: 'LI21088100002324013AA' });
  });

  it('keeps the default payout account when the new bank-account confirmation is rejected', async () => {
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    renderHome();
    const confirmation = await screen.findByRole('dialog', {
      name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(mockCreateAccount).not.toHaveBeenCalled();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(
      screen.queryByRole('dialog', {
        name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
  });

  it('keeps the first payout account when no account is marked as default', async () => {
    mockBankAccounts.forEach((account) => {
      account.default = false;
    });
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    renderHome();
    const confirmation = await screen.findByRole('dialog', {
      name: /add payout account|auszahlungskonto|conto di accredito|compte de versement/i,
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
  });

  it('reports a failed confirmed bank-account create and keeps the default payout account', async () => {
    mockCreateAccount.mockRejectedValueOnce(new Error('dup'));
    setParams('?mode=sell&amount-in=0.1&bank-account=LI21088100002324013AA');
    renderHome();
    await settleQuote();
    fireEvent.click(
      await screen.findByRole('button', {
        name: /add account|konto hinzufügen|aggiungi conto|ajouter le compte/i,
      }),
    );
    await waitFor(() => expect(mockCreateAccount).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong'));
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
  });

  it('hides an unverified Frick IBAN and retries without the provider on continue', async () => {
    mockReceiveForBuy.mockResolvedValue({
      ...validQuote,
      iban: 'LI75088110105923K000E',
      name: 'Someone Else',
      bank: 'Other Bank',
      isPersonalIban: false,
    });
    setParams('?personal-iban=frick');
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(document.body.textContent).not.toMatch(/LI75088110105923K000E/);
    mockReceiveForBuy.mockClear();
    mockReceiveForBuy.mockResolvedValue({ ...validQuote, iban: 'CH93', remittanceInfo: 'ref' });
    fireEvent.click(
      screen.getByRole('button', {
        name: /continue without personal iban|ohne persönliche iban|senza iban personale|sans iban personnel/i,
      }),
    );
    await settleQuote();
    await waitFor(() => {
      const last = mockReceiveForBuy.mock.calls.at(-1);
      expect(last).toBeTruthy();
      expect(last?.[0]).not.toHaveProperty('personalIbanProvider');
    });
  });

  it('sends personalIbanProvider on paymentInfos when personal-iban=frick, and omits it when absent', async () => {
    setParams('?personal-iban=frick');
    const withFrick = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(mockReceiveForBuy).toHaveBeenCalledWith(expect.objectContaining({ personalIbanProvider: 'Frick' }));
    withFrick.unmount();
    mockReceiveForBuy.mockClear();

    setParams('');
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(mockReceiveForBuy.mock.calls[0][0]).not.toHaveProperty('personalIbanProvider');
  });

  it('blocks an empty personal-iban instead of quoting as ordinary bank', async () => {
    setParams('?personal-iban=');
    renderHome();
    await settleQuote();
    expect(screen.getByText(/not recognized|nicht erkannt|non è riconosciuto|n'est pas reconnu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('blocks an unrecognized personal-iban instead of quoting as ordinary bank', async () => {
    setParams('?personal-iban=nope');
    renderHome();
    await settleQuote();
    expect(screen.getByText(/not recognized|nicht erkannt|non è riconosciuto|n'est pas reconnu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('blocks personal-iban when the offer is not EUR/CHF bank transfer', async () => {
    setParams('?asset-out=USDT&payment-method=instant&personal-iban=frick');
    const instant = renderHome();
    await settleQuote();
    const methodNote = document.querySelector('.paybox-note.warn');
    expect(methodNote).toBeTruthy();
    expect(methodNote).toHaveTextContent(/personal ibans require the bank transfer payment method/i);
    instant.unmount();

    setParams('?asset-in=USD&personal-iban=frick');
    renderHome();
    await settleQuote();
    const currencyNote = document.querySelector('.paybox-note.warn');
    expect(currencyNote).toBeTruthy();
    expect(currencyNote).toHaveTextContent(/eur and chf/i);
  });

  it('filters sell assets by a main-app asset-id balances list, and shows all without it', async () => {
    const absent = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    const allSheet = screen.getByRole('dialog');
    expect(within(allSheet).getByText('BTC')).toBeInTheDocument();
    expect(within(allSheet).getByText('USDT')).toBeInTheDocument();
    absent.unmount();

    setParams('?mode=sell&balances=1.5@111');
    renderHome();
    await settleQuote();
    const pill = screen.getByRole('button', { name: /select pay asset/i });
    expect(pill).toHaveTextContent('USDT');
    fireEvent.click(pill);
    const heldSheet = screen.getByRole('dialog');
    expect(within(heldSheet).getByText('USDT')).toBeInTheDocument();
    expect(within(heldSheet).queryByText('BTC')).not.toBeInTheDocument();
  });

  it('shows the external redirect host and redirects only after confirmation', async () => {
    const assign = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin, search: '', hash: '', pathname: '/' },
    });

    setParams('?redirect-uri=https://partner.example/done');
    const withUri = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /done|fertig|fatto|terminé/i }));
    const confirmation = screen.getByRole('dialog', {
      name: /leave dfx|dfx verlassen|uscire da dfx|quitter dfx/i,
    });
    expect(
      within(confirmation).getByText('The trade is complete. Continue to this external host?'),
    ).toBeInTheDocument();
    expect(within(confirmation).getByText('partner.example')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: /continue to host|zum host|continua verso|continuer vers/i,
      }),
    );
    expect(assign).toHaveBeenCalledWith('https://partner.example/done/buy');

    withUri.unmount();
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('stays on the trade screen when an external redirect is rejected', async () => {
    const assign = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin, search: '', hash: '', pathname: '/' },
    });

    setParams('?redirect-uri=https://partner.example/done');
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    fireEvent.click(await screen.findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    const confirmation = screen.getByRole('dialog', {
      name: /leave dfx|dfx verlassen|uscire da dfx|quitter dfx/i,
    });
    fireEvent.click(within(confirmation).getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(assign).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('dialog', {
        name: /leave dfx|dfx verlassen|uscire da dfx|quitter dfx/i,
      }),
    ).not.toBeInTheDocument();

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('stays when redirect-uri is unsafe or absent', async () => {
    const assign = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin, search: '', hash: '', pathname: '/' },
    });

    setParams('?redirect-uri=javascript:alert(1)');
    const unsafe = renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    fireEvent.click(await screen.findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    expect(assign).not.toHaveBeenCalled();
    unsafe.unmount();

    setParams('');
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    fireEvent.click(await screen.findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    expect(assign).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('redirects to the runtime origin without confirmation', async () => {
    const assign = jest.fn();
    const original = window.location;
    const runtimeOrigin = 'https://runtime.example';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: runtimeOrigin, search: '', hash: '', pathname: '/' },
    });

    setParams(`?redirect-uri=${encodeURIComponent(`${runtimeOrigin}/done`)}`);
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    fireEvent.click(await screen.findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    expect(assign).toHaveBeenCalledWith(`${runtimeOrigin}/done/buy`);
    expect(
      screen.queryByRole('dialog', {
        name: /leave dfx|dfx verlassen|uscire da dfx|quitter dfx/i,
      }),
    ).not.toBeInTheDocument();

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('appends sell details to a safe redirect-uri on Done', async () => {
    const assign = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin, search: '', hash: '', pathname: '/' },
    });
    setParams('?mode=sell&amount-in=0.1&redirect-uri=https://partner.example/done');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /done|fertig|fatto|terminé/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue to host|zum host|continua verso|continuer vers/i }));
    expect(assign).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/partner\.example\/done\/sell\?/),
    );
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('appends swap details to a safe redirect-uri on Done', async () => {
    const assign = jest.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign, origin: original.origin, search: '', hash: '', pathname: '/' },
    });
    setParams('?mode=swap&amount-in=0.1&redirect-uri=https://partner.example/done');
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSwap).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /done|fertig|fatto|terminé/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue to host|zum host|continua verso|continuer vers/i }));
    expect(assign).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/partner\.example\/done\/swap\?/),
    );
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});
