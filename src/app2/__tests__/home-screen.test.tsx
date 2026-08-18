const mockCall = jest.fn();
const mockReceiveForBuy = jest.fn();
const mockReceiveForSell = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockCreateAccount = jest.fn();
const mockAssets: Array<Record<string, unknown>> = [];
const mockCurrencies: Array<Record<string, unknown>> = [];
const mockBankAccounts: Array<Record<string, unknown>> = [];
const mockLocation = { search: '' };
const mockSession = {
  isLoggedIn: true,
  address: '0x7099797000000000000000000000000000000000' as string | undefined,
  blockchain: 'Ethereum' as string | undefined,
  blockchains: ['Ethereum', 'Bitcoin', 'Arbitrum'] as string[],
  activeWallet: undefined as { name: string; icon?: string } | undefined,
  openConnect: jest.fn(),
  openSwitcher: jest.fn(),
};

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
  AuthWalletType: {
    METAMASK: 'MetaMask',
    RABBY: 'Rabby',
    WALLET_BROWSER: 'WalletBrowser',
    TRUST: 'Trust',
    PHANTOM: 'Phantom',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
    LEDGER: 'Ledger',
    BIT_BOX: 'BitBox',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    WALLET_CONNECT: 'WalletConnect',
    DFX_TARO: 'DfxTaro',
  },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  TransactionError: {
    AMOUNT_TOO_LOW: 'AmountTooLow',
    AMOUNT_TOO_HIGH: 'AmountTooHigh',
    LIMIT_EXCEEDED: 'LimitExceeded',
    EMAIL_REQUIRED: 'EmailRequired',
    KYC_REQUIRED: 'KycRequired',
  },
  BuyUrl: { quote: 'buy/quote' },
  SellUrl: { quote: 'sell/quote' },
  SwapUrl: { quote: 'swap/quote' },
  ApiException: class ApiException extends Error {
    statusCode: number;
    code?: string;
    constructor(httpStatus: number, errorMessage: string, errorCode?: string) {
      super(errorMessage);
      this.statusCode = httpStatus;
      this.code = errorCode;
    }
  },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap }),
  useAuth: () => ({ signInWithMail: jest.fn() }),
  useUser: () => ({ updateMail: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
  useAssetContext: () => ({ getAssets: () => mockAssets }),
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useBankAccountContext: () => ({ bankAccounts: mockBankAccounts, isLoading: false, createAccount: mockCreateAccount }),
}));

jest.mock('react-router-dom', () => ({ useLocation: () => mockLocation }));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => mockSession,
}));

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiException } from '@dfx.swiss/react';
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
    id: `${name}-${blockchain}`,
    name,
    description: name,
    blockchain,
    buyable: true,
    sellable: true,
    instantBuyable: false,
    ...extra,
  };
}

function seedDefaultMarket() {
  mockAssets.push(
    coin('BTC', 'Bitcoin'),
    coin('USDT', 'Ethereum', { instantBuyable: true }),
    coin('USDT', 'Arbitrum', { instantBuyable: true }),
    coin('ETH', 'Ethereum'),
  );
  mockCurrencies.push(
    { id: 1, name: 'EUR', buyable: true, sellable: true, instantSellable: true },
    { id: 2, name: 'CHF', buyable: true, sellable: true, instantSellable: false },
    { id: 3, name: 'USD', buyable: true, sellable: true, instantSellable: false },
  );
  mockBankAccounts.push({ id: 1, iban: 'DE89370400440532013000', active: true, default: true });
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

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAssets.length = 0;
    mockCurrencies.length = 0;
    mockBankAccounts.length = 0;
    mockLocation.search = '';
    mockSession.isLoggedIn = true;
    mockSession.address = '0x7099797000000000000000000000000000000000';
    mockSession.blockchain = 'Ethereum';
    mockSession.blockchains = ['Ethereum', 'Bitcoin', 'Arbitrum'];
    mockSession.activeWallet = undefined;
    mockCall.mockResolvedValue(validQuote);
    mockReceiveForBuy.mockResolvedValue({ ...validQuote, iban: 'CH93', remittanceInfo: 'aaaa-bbbb-cccc' });
    mockReceiveForSell.mockResolvedValue({ ...validQuote, depositAddress: '0xdeposit' });
    mockReceiveForSwap.mockResolvedValue({
      ...validQuote,
      depositAddress: '0xswap',
      sourceAsset: { name: 'BTC', blockchain: 'Bitcoin' },
      targetAsset: { name: 'USDT', blockchain: 'Ethereum' },
    });
    mockCreateAccount.mockResolvedValue({ id: 9, iban: 'CH9300762011623852957' });
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the landing hero while logged out', () => {
    mockSession.isLoggedIn = false;
    renderHome();
    expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument();
  });

  it('starts in sell when the URL asks for it', async () => {
    seedDefaultMarket();
    mockLocation.search = '?mode=sell';
    renderHome();
    await settleQuote();
    expect(screen.getByRole('tab', { name: /sell|verkaufen/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads the mode from the window search when the router has none', async () => {
    seedDefaultMarket();
    window.history.replaceState({}, '', '/?mode=swap');
    renderHome();
    await settleQuote();
    expect(screen.getByRole('tab', { name: /swap|tausch/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('covers buy receive states, quick amounts, flip and the wallet bar', async () => {
    seedDefaultMarket();
    mockSession.activeWallet = { name: 'MetaMask', icon: 'icon.png' };
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /buy|kaufen/i })).not.toBeDisabled();
    expect(screen.getByText(/refreshes|aktualisiert|aggiorna|rafraîch/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '€50' }));
    await settleQuote();
    const amount = screen.getByRole('textbox', { name: /amount you pay/i });
    expect(amount).toHaveValue('50');

    fireEvent.change(amount, { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('0');

    fireEvent.click(screen.getByRole('button', { name: /flip direction/i }));
    expect(screen.getByRole('tab', { name: /sell|verkaufen/i })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: /flip direction/i }));
    expect(screen.getByRole('tab', { name: /buy|kaufen/i })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: /metamask/i }));
    expect(mockSession.openSwitcher).toHaveBeenCalled();
  });

  it('shows a wallet address when the connected name is generic', () => {
    seedDefaultMarket();
    mockSession.activeWallet = { name: 'Wallet' };
    mockSession.address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    renderHome();
    expect(screen.getByText(/0xabcd/i)).toBeInTheDocument();
  });

  it('falls back to the chain label when no wallet name or address is set', () => {
    seedDefaultMarket();
    mockSession.activeWallet = undefined;
    mockSession.address = undefined;
    mockSession.blockchain = 'Ethereum';
    renderHome();
    expect(document.querySelector('.walletbar small')?.textContent).toMatch(/ethereum/i);
  });

  it('opens fiat, asset and payment-method pickers and resets Instant when it is no longer valid', async () => {
    seedDefaultMarket();
    renderHome();
    await settleQuote();

    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(screen.getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /ethereum/i }));
    await settleQuote();

    fireEvent.click(screen.getByRole('button', { name: /select pay currency/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('USD'));
    await settleQuote();

    fireEvent.click(screen.getByRole('button', { name: /select pay currency/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('EUR'));
    await settleQuote();

    const method = document.querySelector('.pmethod') as HTMLElement;
    expect(method).toHaveAttribute('role', 'button');
    fireEvent.click(method);
    fireEvent.click(screen.getByText(/instant|sofort/i));
    await settleQuote();

    fireEvent.click(screen.getByRole('button', { name: /select pay currency/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('CHF'));
    await settleQuote();
    expect(document.querySelector('.pmethod')?.getAttribute('role')).toBeNull();
  });

  it('switches to sell and swap, seeds amounts and opens those asset pickers', async () => {
    seedDefaultMarket();
    renderHome();
    await settleQuote();

    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('0.1');
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    fireEvent.click(screen.getByText('ETH'));
    fireEvent.click(screen.getByRole('button', { name: /select receive currency/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('CHF'));

    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    const fromDialog = screen.getByRole('dialog');
    fireEvent.click(within(fromDialog).getByText('ETH'));
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    const toDialog = screen.getByRole('dialog');
    fireEvent.click(within(toDialog).getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /ethereum/i }));
  });

  it('opens the payment sheet after a buy CTA and closes it with Done', async () => {
    seedDefaultMarket();
    renderHome();
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(screen.getByRole('dialog', { name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /done|fertig|fatto|terminé/i }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('times out a stuck payment-details request', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockImplementation(() => new Promise(() => undefined));
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/too long|zu lange|troppo tempo|trop de temps/i);
  });

  it('retries a generic payment error and reconnects after a 401', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new Error('pay-down'));
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /done|fertig|fatto|terminé/i }));

    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(401, 'gone'));
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    fireEvent.click(await screen.findByRole('button', { name: /connect/i }));
    expect(mockSession.openConnect).toHaveBeenCalled();
  });

  it('asks for a payout account on sell and continues once one is added', async () => {
    seedDefaultMarket();
    mockBankAccounts.length = 0;
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /sell|verkaufen/i }));
    expect(screen.getByRole('dialog', { name: /add bank account|bankkonto|conto bancario|compte bancaire/i })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: /add bank account|bankkonto hinzufügen|aggiungi conto bancario|ajouter un compte bancaire/i,
      }),
    );
    fireEvent.change(screen.getByLabelText(/payout iban|auszahlungs-iban|iban di accredito|iban de versement/i), {
      target: { value: 'CH93 0076 2011 6238 5295 7' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add account|konto hinzufügen|aggiungi conto|ajouter le compte/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
  });

  it('opens the sell sheet from an existing payout account', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /sell|verkaufen/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalled());
  });

  it('opens a swap payment sheet', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /swap|tausch/i }));
    await settleQuote();
    await waitFor(() => expect(mockReceiveForSwap).toHaveBeenCalled());
  });

  it('shows buy quote errors and retries them', async () => {
    seedDefaultMarket();
    mockCall.mockRejectedValue(new Error('quote-down'));
    renderHome();
    await settleQuote();
    expect(screen.getByText(/quote unavailable|kurs nicht|quotazione non|cotation indisponible/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await settleQuote();
    expect(mockCall.mock.calls.length).toBeGreaterThan(1);
  });

  it('shows a loading buy quote', async () => {
    seedDefaultMarket();
    mockCall.mockImplementation(() => new Promise(() => undefined));
    renderHome();
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('…');
  });

  it('keeps the CTA enabled for a non-amount validity error and disables it for AmountTooLow', async () => {
    seedDefaultMarket();
    mockCall.mockResolvedValue({
      ...validQuote,
      isValid: false,
      error: 'LimitExceeded',
      estimatedAmount: 0.001,
    });
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /buy|kaufen/i })).not.toBeDisabled();

    mockCall.mockResolvedValue({
      ...validQuote,
      isValid: false,
      error: 'AmountTooLow',
      estimatedAmount: 0,
    });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '1' } });
    await settleQuote();
    expect(screen.getByRole('button', { name: /buy|kaufen/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('covers sell receive-panel branches', async () => {
    seedDefaultMarket();
    mockCall.mockImplementation(async (config: { url: string }) => {
      if (config.url === 'sell/quote') return { ...validQuote, estimatedAmount: 86, isValid: true };
      return validQuote;
    });
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i }).value).not.toBe('');

    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('0');

    mockCall.mockImplementation(async (config: { url: string }) => {
      if (config.url === 'sell/quote') {
        return { ...validQuote, isValid: false, error: 'AmountTooLow', estimatedAmount: 0 };
      }
      return validQuote;
    });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '0.01' } });
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('—');

    mockCall.mockRejectedValue(new Error('sell-down'));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '0.2' } });
    await settleQuote();
    expect(screen.getByText(/quote unavailable|kurs nicht|quotazione non|cotation indisponible/i)).toBeInTheDocument();
  });

  it('covers swap receive-panel loading, validity and error branches', async () => {
    seedDefaultMarket();
    renderHome();
    mockCall.mockImplementation(() => new Promise(() => undefined));
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('…');

    mockCall.mockResolvedValue({ ...validQuote, isValid: false, error: 'AmountTooHigh', estimatedAmount: 0 });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '3' } });
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('—');

    mockCall.mockResolvedValue({ ...validQuote, estimatedAmount: 10, isValid: false, error: 'LimitExceeded' });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '4' } });
    await settleQuote();

    mockCall.mockRejectedValue(new Error('swap-down'));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '5' } });
    await settleQuote();
    expect(screen.getByText(/quote unavailable|kurs nicht|quotazione non|cotation indisponible/i)).toBeInTheDocument();
  });

  it('drops an armed payment request when the amount changes', async () => {
    seedDefaultMarket();
    let resolvePay: ((value: unknown) => void) | undefined;
    mockReceiveForBuy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePay = resolve;
        }),
    );
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '120' } });
    resolvePay?.({ ...validQuote, iban: 'CH93' });
    await settleQuote();
    expect(
      screen.queryByRole('dialog', { name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i }),
    ).not.toBeInTheDocument();
  });

  it('resets the buy chain when the current network is no longer reachable', async () => {
    seedDefaultMarket();
    renderHome();
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(screen.getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /arbitrum/i }));
    mockSession.blockchains = ['Ethereum'];
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '110' } });
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toBeInTheDocument();
  });

  it('handles an empty pool, an unreachable wallet and a missing currency list', () => {
    mockSession.blockchains = ['Monero'];
    mockAssets.push(coin('USDT', 'Ethereum'));
    mockCurrencies.length = 0;
    const { rerender } = renderHome();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    mockAssets.length = 0;
    rerender(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '1' } });
    expect(screen.getByRole('textbox', { name: /amount you receive/i }).value).toMatch(/0|—|…/);
  });

  it('filters the sell pool by held balances', () => {
    mockAssets.push(coin('USDT', 'Ethereum'), coin('ETH', 'Ethereum'));
    mockCurrencies.push({ id: 1, name: 'EUR', buyable: true, sellable: true });
    window.history.replaceState({}, '', '/?balances=5@USDT');
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('USDT')).toBeInTheDocument();
    expect(within(dialog).queryByText('ETH')).not.toBeInTheDocument();
  });

  it('disables swap when only one buyable asset exists', () => {
    mockAssets.push(coin('USDT', 'Ethereum'));
    mockCurrencies.push({ id: 1, name: 'EUR', buyable: true, sellable: true });
    renderHome();
    expect(screen.getByRole('tab', { name: /swap|tausch/i })).toHaveStyle({ pointerEvents: 'none' });
  });

  it('resets sell and swap-to chains when they are no longer reachable', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /arbitrum/i }));
    mockSession.blockchains = ['Ethereum'];
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '0.3' } });
    await settleQuote();

    mockSession.blockchains = ['Ethereum', 'Arbitrum', 'Bitcoin'];
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('ETH'));
    mockSession.blockchains = ['Bitcoin'];
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '0.4' } });
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toBeInTheDocument();
  });

  it('ignores a disabled swap flip', async () => {
    mockAssets.push(
      coin('FROM', 'Ethereum', { buyable: false, sellable: true }),
      coin('TO', 'Ethereum', { buyable: true, sellable: false }),
    );
    mockCurrencies.push({ id: 1, name: 'EUR', buyable: true, sellable: true });
    mockSession.blockchains = ['Ethereum'];
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    const flip = screen.getByRole('button', { name: /flip direction/i }) as HTMLButtonElement;
    expect(flip).toBeDisabled();
    flip.disabled = false;
    fireEvent.click(flip);
  });

  it('resets the swap-from chain when it is no longer reachable', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /arbitrum/i }));
    mockSession.blockchains = ['Ethereum'];
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '2' } });
    await settleQuote();
    expect(screen.getByRole('button', { name: /select pay asset/i })).toBeInTheDocument();
  });

  it('flips a two-way swap pair and shows a sell validity message', async () => {
    seedDefaultMarket();
    mockCall.mockImplementation(async (config: { url: string }) => {
      if (config.url === 'sell/quote') {
        return { ...validQuote, estimatedAmount: 80, isValid: false, error: 'LimitExceeded' };
      }
      if (config.url === 'swap/quote') return { ...validQuote, estimatedAmount: 9, isValid: true };
      return validQuote;
    });
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i }).value).not.toBe('—');

    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    const amount = screen.getByRole('textbox', { name: /amount you pay/i });
    fireEvent.change(amount, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /flip direction/i }));
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('');
  });

  it('prefills a stablecoin amount when switching to sell and swap', () => {
    mockAssets.push(coin('USDT', 'Ethereum'), coin('USDC', 'Ethereum'));
    mockCurrencies.push({ id: 1, name: 'EUR', buyable: true, sellable: true });
    mockSession.blockchains = ['Ethereum'];
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('100');
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('100');
  });

  it('resets the swap-to chain when that asset is still reachable on another network', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /select pay asset/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('ETH'));
    fireEvent.click(screen.getByRole('button', { name: /select receive asset/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('USDT'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /arbitrum/i }));
    mockSession.blockchains = ['Ethereum'];
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '3' } });
    await settleQuote();
    expect(screen.getByRole('button', { name: /select receive asset/i })).toBeInTheDocument();
  });

  it('ignores a disabled CTA and a disabled swap flip click', async () => {
    seedDefaultMarket();
    renderHome();
    await settleQuote();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '' } });
    const emptyCta = document.querySelector('.btn-primary.cta') as HTMLButtonElement;
    await waitFor(() => expect(emptyCta).toBeDisabled());
    emptyCta.disabled = false;
    fireEvent.click(emptyCta);

    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
  });

  it('falls back to the first currency when EUR is not listed', async () => {
    mockAssets.push(coin('BTC', 'Bitcoin'), coin('USDT', 'Ethereum'));
    mockCurrencies.push({ id: 2, name: 'CHF', buyable: true, sellable: true });
    mockBankAccounts.push({ id: 1, iban: 'CH9300762011623852957', default: true });
    renderHome();
    await settleQuote();
    expect(screen.getByRole('button', { name: /select pay currency/i })).toHaveTextContent('CHF');
  });

  it('covers empty-asset labels, nameless wallet bar and invalid quotes without copy', async () => {
    seedDefaultMarket();
    mockSession.blockchain = undefined;
    mockSession.activeWallet = undefined;
    mockCall.mockResolvedValue({ estimatedAmount: 0, isValid: false });
    renderHome();
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('—');

    mockCall.mockResolvedValue({ estimatedAmount: 1, isValid: false });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '2' } });
    await settleQuote();

    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    await settleQuote();
  });

  it('formats invalid quotes when the selected fiat or asset is still empty', async () => {
    mockCall.mockResolvedValue({ estimatedAmount: 1, isValid: false, error: 'LimitExceeded' });
    renderHome();
    await settleQuote();

    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '3' } });
    await settleQuote();

    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '4' } });
    await settleQuote();
  });

  it('shows a sell and swap validity message when the estimate is not displayable', async () => {
    seedDefaultMarket();
    mockCall.mockResolvedValue({ estimatedAmount: 0, isValid: false, error: 'LimitExceeded' });
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '5' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '6' } });
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('—');

    mockCall.mockResolvedValue({ estimatedAmount: 0, isValid: false });
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '7' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '8' } });
    await settleQuote();
  });

  it('keeps sell and swap receive copy blank when an invalid quote has no error', async () => {
    seedDefaultMarket();
    mockCall.mockResolvedValue({ estimatedAmount: 2, isValid: false });
    renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '5' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '6' } });
    await settleQuote();
    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('2');
  });
});
