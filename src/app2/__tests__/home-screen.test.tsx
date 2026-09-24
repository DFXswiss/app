const mockCall = jest.fn();
const mockReceiveForBuy = jest.fn();
const mockReceiveForSell = jest.fn();
const mockReceiveForSwap = jest.fn();
const mockPublicBuyQuote = (info: unknown) =>
  mockCall({ url: 'buy/quote', method: 'PUT', data: info, token: false });
const mockPublicSellQuote = (info: unknown) =>
  mockCall({ url: 'sell/quote', method: 'PUT', data: info, token: false });
const mockPublicSwapQuote = (info: unknown) =>
  mockCall({ url: 'swap/quote', method: 'PUT', data: info, token: false });
const mockCreateAccount = jest.fn();
const mockUpdateMail = jest.fn();
const mockGetPaymentInfoRequestStatus = jest.fn();
const mockGetTransactionDetailByUid = jest.fn();
let mockApiAccount = 7;
const mockAssets: Array<Record<string, unknown>> = [];
const mockCurrencies: Array<Record<string, unknown>> = [];
const mockBankAccounts: Array<Record<string, unknown>> = [];
const mockLocation = { search: '' };
const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let mockUuidCounter = 0;
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
  PersonalIbanProvider: { FRICK: 'Frick', YAPEAL: 'Yapeal' },
  VirtualIbanStatus: { ACTIVE: 'Active' },
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
  useBuy: () => ({ receiveFor: mockReceiveForBuy, quote: mockPublicBuyQuote }),
  useSell: () => ({ receiveFor: mockReceiveForSell, quote: mockPublicSellQuote }),
  useSwap: () => ({ receiveFor: mockReceiveForSwap, quote: mockPublicSwapQuote }),
  useAuth: () => ({ signInWithMail: jest.fn() }),
  useUser: () => ({ updateMail: mockUpdateMail }),
  useUserContext: () => ({ user: undefined }),
  useApiSession: () => ({ session: { account: mockApiAccount } }),
  useTransaction: () => ({
    getPaymentInfoRequestStatus: mockGetPaymentInfoRequestStatus,
    getTransactionDetailByUid: mockGetTransactionDetailByUid,
  }),
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
    mockUuidCounter = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: () => `00000000-0000-4000-8000-${(++mockUuidCounter).toString(16).padStart(12, '0')}`,
      },
    });
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
    mockUpdateMail.mockResolvedValue(undefined);
    mockGetPaymentInfoRequestStatus.mockResolvedValue({ requestStatus: 'Processing' });
    mockGetTransactionDetailByUid.mockResolvedValue({ uid: 'request-uid', state: 'WaitingForPayment' });
    mockApiAccount = 7;
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (originalCryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
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

  it('discards an invalid stored request without opening or sending a payment', async () => {
    seedDefaultMarket();
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId: 'not-a-uuid', mode: 'buy' }));
    renderHome();
    await settleQuote();
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toBeNull();
    expect(screen.queryByTestId('pending-payment-recovery')).not.toBeInTheDocument();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it.each([
    ['missing request id', { mode: 'buy' }],
    ['unsupported mode', { requestId: 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa', mode: 'other' }],
  ])('discards a stored request with a %s', async (_description, stored) => {
    seedDefaultMarket();
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify(stored));
    renderHome();
    await settleQuote();
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toBeNull();
    expect(screen.queryByTestId('pending-payment-recovery')).not.toBeInTheDocument();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('reports when session storage cannot read a recovery record', async () => {
    seedDefaultMarket();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent(/recover|payment|zahlung/i);
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('creates a valid request id from secure random bytes when randomUUID is unavailable', async () => {
    seedDefaultMarket();
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: (bytes: Uint8Array) => { bytes.fill(7); return bytes; } },
    });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    expect(mockReceiveForBuy.mock.calls[0][0].clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('fails closed when secure request-id generation is unavailable', async () => {
    seedDefaultMarket();
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toBeNull();
    expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/safe retry key|sichere wiederholungsschlüssel/i);
  });

  it('keeps a confirmed pre-claim gate locked when the status endpoint still finds the claim', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    mockGetPaymentInfoRequestStatus.mockResolvedValueOnce({
      existingUid: 'still-pending-claim',
      requestStatus: 'WaitingForPayment',
    });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));

    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));
    await waitFor(() => expect(within(dialog).getByText('still-pending-claim')).toBeInTheDocument());
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('keeps the old pre-claim request when new secure randomness is unavailable', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new ApiException(404, 'ClaimNotFound', 'NotFound'));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));

    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));
    await waitFor(() =>
      expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/safe retry key|sichere wiederholungsschlüssel/i),
    );
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('does not start a payment if browser session storage cannot preserve its request id', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
    expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/could not save a safe retry key|sichere wiederholungsschlüssel konnte nicht gespeichert werden/i);
  });

  it('does not request payment details when the wallet has no API account', async () => {
    seedDefaultMarket();
    mockApiAccount = undefined as never;
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('disables a ready buy CTA immediately when the API account disappears', async () => {
    seedDefaultMarket();
    const view = renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    expect(screen.getByTestId('trade-cta')).toBeEnabled();

    mockApiAccount = undefined as never;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('does not create a sell request if the API account disappears while choosing the payout account', async () => {
    seedDefaultMarket();
    mockBankAccounts.length = 0;
    const view = renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay|amount you sell/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    mockBankAccounts.push(
      { id: 1, iban: 'DE89370400440532013000', active: true, default: true },
      { id: 2, iban: 'CH9300762011623852957', active: true },
    );
    mockApiAccount = undefined as never;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: /CH9300762011623852957/i }));
    expect(mockReceiveForSell).not.toHaveBeenCalled();
    expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/could not save a safe retry key|sichere wiederholungsschlüssel konnte nicht gespeichert werden/i);
  });

  it('does not create a sell request when secure randomness is unavailable in the bank picker', async () => {
    seedDefaultMarket();
    mockBankAccounts.length = 0;
    const view = renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay|amount you sell/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    mockBankAccounts.push({ id: 2, iban: 'CH9300762011623852957', active: true });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: /CH9300762011623852957/i }));
    expect(mockReceiveForSell).not.toHaveBeenCalled();
    expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/safe retry key|sichere wiederholungsschlüssel/i);
  });

  it('does not create a sell request when storage fails while choosing the payout account', async () => {
    seedDefaultMarket();
    mockBankAccounts.length = 0;
    const view = renderHome();
    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay|amount you sell/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    mockBankAccounts.push(
      { id: 1, iban: 'DE89370400440532013000', active: true, default: true },
      { id: 2, iban: 'CH9300762011623852957', active: true },
    );
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    fireEvent.click(screen.getByRole('button', { name: /CH9300762011623852957/i }));
    expect(mockReceiveForSell).not.toHaveBeenCalled();
    expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(/could not save a safe retry key|sichere wiederholungsschlüssel konnte nicht gespeichert werden/i);
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
    expect(screen.getByRole('textbox', { name: /amount you pay/i })).toHaveValue('');
    expect(mockCall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '€50' }));
    await settleQuote();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /buy|kaufen/i })).not.toBeDisabled();
    expect(screen.getByText(/refreshes|aktualisiert|aggiorna|rafraîch/i)).toBeInTheDocument();

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

  it('does not offer Instant in the buy flow while product approval is pending', async () => {
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
    expect(method).not.toHaveAttribute('role', 'button');
    expect(within(method).getByText(/bank|überweisung/i)).toBeInTheDocument();
    expect(within(method).queryByText(/instant|sofort/i)).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
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

  it('does not partner-redirect when Done closes a completed request loaded from a 409 conflict', async () => {
    seedDefaultMarket();
    mockLocation.search = '?redirect-uri=https://partner.example/done';
    const conflict = new ApiException(409, 'Payment info already exists', 'PAYMENT_INFO_ALREADY_EXISTS');
    Object.assign(conflict, {
      paymentInfoConflict: { existingUid: 'existing-request', requestStatus: 'Completed' },
    });
    mockReceiveForBuy.mockRejectedValueOnce(conflict);
    mockGetTransactionDetailByUid.mockResolvedValueOnce({ uid: 'existing-request', state: 'Completed' });
    renderHome();

    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();

    const dialog = await screen.findByRole('dialog', {
      name: /existing payment request|bestehende zahlungsanfrage/i,
    });
    await waitFor(() => expect(mockGetTransactionDetailByUid).toHaveBeenCalledWith('existing-request'));
    await waitFor(() => expect(within(dialog).getByText('Completed')).toBeInTheDocument());
    fireEvent.click(await within(dialog).findByRole('button', { name: /done|fertig|fatto|terminé/i }));

    expect(
      screen.queryByRole('dialog', { name: /leave dfx|dfx verlassen|uscire da dfx|quitter dfx/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i })).not.toBeInTheDocument();
  });

  it('pauses buy quote refresh while the sell tab is active', async () => {
    seedDefaultMarket();
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({ url: 'buy/quote' }));

    fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
    await settleQuote();
    mockCall.mockClear();

    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });

    expect(mockCall.mock.calls.some(([request]) => request.url === 'buy/quote')).toBe(false);
  });

  it('times out a stuck payment-details request', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockImplementation(() => new Promise(() => undefined));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/still being checked|wird noch geprüft|ancora in verifica|toujours en cours/i);
    const calls = mockReceiveForBuy.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0][0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(calls[calls.length - 1][0].clientRequestId).toBe(calls[0][0].clientRequestId);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(calls[0][0].clientRequestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('restores an existing payment by account and never starts another payment after reload', async () => {
    seedDefaultMarket();
    const requestId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    mockLocation.search = '?mode=sell';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId, mode: 'buy' }));
    mockGetPaymentInfoRequestStatus.mockResolvedValueOnce({ existingUid: 'request-uid', requestStatus: 'WaitingForPayment' });
    const view = renderHome();

    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));
    await waitFor(() => expect(within(dialog).getByText('request-uid')).toBeInTheDocument());
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
    view.rerender(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );
    await settleQuote();
    expect(mockGetTransactionDetailByUid).toHaveBeenCalledTimes(1);
  });

  it('does not let a delayed status response from one account overwrite another account request', async () => {
    seedDefaultMarket();
    const firstId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    const secondId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fb';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId: firstId, mode: 'buy' }));
    sessionStorage.setItem('app2:pending-payment-request:8', JSON.stringify({ requestId: secondId, mode: 'buy' }));
    let resolveFirst!: (value: { existingUid: string; requestStatus: string }) => void;
    mockGetPaymentInfoRequestStatus
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ existingUid: 'request-B', requestStatus: 'WaitingForPayment' });
    const view = renderHome();

    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(firstId, 'Buy'));
    mockApiAccount = 8;
    view.rerender(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );
    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(secondId, 'Buy'));
    await waitFor(() => expect(within(dialog).getByText('request-B')).toBeInTheDocument());

    await act(async () => {
      resolveFirst({ existingUid: 'request-A', requestStatus: 'Completed' });
    });
    expect(within(dialog).getByText('request-B')).toBeInTheDocument();
    expect(within(dialog).queryByText('request-A')).not.toBeInTheDocument();
  });

  it('keeps the new account recovery UI when the previous account status lookup rejects late', async () => {
    seedDefaultMarket();
    const firstId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    const secondId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fb';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId: firstId, mode: 'buy' }));
    sessionStorage.setItem('app2:pending-payment-request:8', JSON.stringify({ requestId: secondId, mode: 'buy' }));
    let rejectFirst!: (error: unknown) => void;
    mockGetPaymentInfoRequestStatus
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce({ existingUid: 'request-B', requestStatus: 'WaitingForPayment' });
    const view = renderHome();
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(firstId, 'Buy'));
    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(within(dialog).getByText('request-B')).toBeInTheDocument());
    await act(async () => rejectFirst(new Error('old-account-status-failed')));
    expect(within(dialog).getByText('request-B')).toBeInTheDocument();
    expect(within(dialog).queryByText(/unknown/i)).not.toBeInTheDocument();
  });

  it('ignores a completed status refresh from the previous account', async () => {
    seedDefaultMarket();
    const requestA = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    const requestB = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fb';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId: requestA, mode: 'buy' }));
    sessionStorage.setItem('app2:pending-payment-request:8', JSON.stringify({ requestId: requestB, mode: 'buy' }));
    let resolveRefresh!: (value: { existingUid: string; requestStatus: string }) => void;
    mockGetPaymentInfoRequestStatus
      .mockResolvedValueOnce({ existingUid: 'request-A', requestStatus: 'Processing' })
      .mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }))
      .mockResolvedValueOnce({ existingUid: 'request-B', requestStatus: 'Processing' });
    const view = renderHome();
    const firstDialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    fireEvent.click(within(firstDialog).getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /check request status|anfrage-status prüfen/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(2));
    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    const secondDialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(within(secondDialog).getByText('request-B')).toBeInTheDocument());
    await act(async () => resolveRefresh({ existingUid: 'stale-completed-A', requestStatus: 'Completed' }));
    expect(within(secondDialog).getByText('request-B')).toBeInTheDocument();
    expect(within(secondDialog).queryByText('stale-completed-A')).not.toBeInTheDocument();
  });

  it('ignores a failed manual status refresh after switching API accounts', async () => {
    seedDefaultMarket();
    const requestA = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    const requestB = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fb';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId: requestA, mode: 'buy' }));
    sessionStorage.setItem('app2:pending-payment-request:8', JSON.stringify({ requestId: requestB, mode: 'buy' }));
    let rejectRefresh!: (error: unknown) => void;
    mockGetPaymentInfoRequestStatus
      .mockResolvedValueOnce({ existingUid: 'request-A', requestStatus: 'Processing' })
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce({ existingUid: 'request-B', requestStatus: 'WaitingForPayment' });
    const view = renderHome();
    const firstDialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    fireEvent.click(within(firstDialog).getByRole('button', { name: /close/i }));
    fireEvent.click(screen.getByRole('button', { name: /check request status|anfrage-status prüfen/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(2));

    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    const secondDialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(within(secondDialog).getByText('request-B')).toBeInTheDocument());
    await act(async () => rejectRefresh(new Error('stale status lookup failed')));
    expect(within(secondDialog).getByText('request-B')).toBeInTheDocument();
    expect(within(secondDialog).queryByText(/unknown|unbekannt/i)).not.toBeInTheDocument();
  });

  it('opens a locked recovery sheet when the server status lookup is unavailable', async () => {
    seedDefaultMarket();
    const requestId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId, mode: 'buy' }));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new Error('status-unavailable'));
    renderHome();
    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    expect(within(dialog).getByText(/unknown|unbekannt/i)).toBeInTheDocument();
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('keeps an unresolved request locked and provides no new-payment escape hatch', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new Error('pay-down'));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new ApiException(404, 'ClaimNotFound', 'NotFound'));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await settleQuote();
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalled());
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
    expect(screen.getByText(/state is not confirmed|status ist nicht bestätigt/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start a separate payment|separate zahlung starten/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain('requestId');
  });

  it('rotates the request id only after the explicit EmailRequired gate is cleared', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new ApiException(404, 'ClaimNotFound', 'NotFound'));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();

    const dialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    const firstRequestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), {
      target: { value: 'trader@example.com' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    });
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('trader@example.com'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));
    await settleQuote();

    await waitFor(() =>
      expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(firstRequestId, 'Buy'),
    );
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(2));
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(2);
    expect(mockReceiveForBuy.mock.calls[1][0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mockReceiveForBuy.mock.calls[1][0].clientRequestId).not.toBe(firstRequestId);
    expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/aaaa-bbbb-cccc/i)).toBeInTheDocument();
  });

  it('keeps the original pre-claim request locked when status cannot confirm the old claim is missing', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new ApiException(500, 'status-down'));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('drops a late successful pre-claim status check after the API account changes', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    let resolveStatus!: (value: { existingUid: string; requestStatus: string }) => void;
    mockGetPaymentInfoRequestStatus.mockReturnValueOnce(new Promise((resolve) => { resolveStatus = resolve; }));
    const view = renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1));
    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    await act(async () => resolveStatus({ existingUid: 'old-account-claim', requestStatus: 'Completed' }));
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('old-account-claim')).not.toBeInTheDocument();
  });

  it('drops a late failed pre-claim status check after the API account changes', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    let rejectStatus!: (error: unknown) => void;
    mockGetPaymentInfoRequestStatus.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectStatus = reject; }));
    const view = renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1));
    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    await act(async () => rejectStatus(new ApiException(404, 'ClaimNotFound', 'NotFound')));
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /complete your purchase|kauf abschliessen/i })).not.toBeInTheDocument();
  });

  it('checks the server claim after an ambiguous payment-details failure instead of resending it', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(500, 'payment-down'));
    mockGetPaymentInfoRequestStatus.mockResolvedValueOnce({ requestStatus: 'Processing' });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.click(within(dialog).getByRole('button', { name: /retry|erneut|riprova|réessayer/i }));
    await settleQuote();
    expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy');
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('retains the old id and gate when recording a pre-claim retry fails in storage', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    mockGetPaymentInfoRequestStatus.mockRejectedValueOnce(new ApiException(404, 'ClaimNotFound', 'NotFound'));
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const dialog = await screen.findByRole('dialog', { name: /complete your purchase|kauf abschliessen/i });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), { target: { value: 'a@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('a@example.com'));
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'app2:pending-payment-request:7') throw new Error('storage unavailable');
      return originalSetItem.call(this, key, value);
    });
    fireEvent.click(await within(dialog).findByRole('button', { name: /i have confirmed/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));
    await waitFor(() => expect(setItemSpy).toHaveBeenCalledWith('app2:pending-payment-request:7', expect.any(String)));
    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    await waitFor(() =>
      expect(screen.getByTestId('app2-toast-alert')).toHaveTextContent(
        /could not save a safe retry key|sichere wiederholungsschlüssel konnte nicht gespeichert werden/i,
      ),
    );
  });

  it('keeps the same request id when a KYC error has an existing server claim', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'KycRequired', 'KycRequired'));
    mockGetPaymentInfoRequestStatus.mockResolvedValueOnce({ requestStatus: 'Processing' });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();

    const dialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    const requestId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    fireEvent.click(within(dialog).getByRole('button', { name: /check request status|anfrage-status prüfen/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledWith(requestId, 'Buy'));

    expect(mockReceiveForBuy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(screen.getByTestId('trade-cta')).toBeDisabled();
  });

  it('allows only one UUID rotation when the same pre-claim retry is clicked twice', async () => {
    seedDefaultMarket();
    mockReceiveForBuy.mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    let rejectLookup!: (error: ApiException) => void;
    mockGetPaymentInfoRequestStatus.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLookup = reject;
      }),
    );
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByRole('button', { name: /buy|kaufen/i }));
    await settleQuote();

    const dialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /email address/i }), {
      target: { value: 'trader@example.com' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /send link/i }));
    });
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledWith('trader@example.com'));
    const confirmButton = await within(dialog).findByRole('button', { name: /i have confirmed/i });
    act(() => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1));
    await act(async () => {
      rejectLookup(new ApiException(404, 'ClaimNotFound', 'NotFound'));
    });
    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalledTimes(2));

    expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1);
    expect(mockReceiveForBuy.mock.calls[1][0].clientRequestId).not.toBe(
      mockReceiveForBuy.mock.calls[0][0].clientRequestId,
    );
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(
      mockReceiveForBuy.mock.calls[1][0].clientRequestId,
    );
  });

  it('does not let an old account retry unlock a pending retry for the new account', async () => {
    seedDefaultMarket();
    mockReceiveForBuy
      .mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'))
      .mockRejectedValueOnce(new ApiException(400, 'EmailRequired', 'EmailRequired'));
    let resolveAccountA!: (value: { requestStatus: string }) => void;
    let resolveAccountB!: (value: { requestStatus: string }) => void;
    mockGetPaymentInfoRequestStatus
      .mockReturnValueOnce(new Promise((resolve) => { resolveAccountA = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveAccountB = resolve; }));

    const view = renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const accountADialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    fireEvent.change(within(accountADialog).getByRole('textbox', { name: /email address/i }), {
      target: { value: 'a@example.com' },
    });
    fireEvent.click(within(accountADialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledTimes(1));
    fireEvent.click(await within(accountADialog).findByRole('button', { name: /i have confirmed/i }));
    await waitFor(() => expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(1));

    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    await waitFor(() => expect(screen.getByTestId('trade-cta')).toBeEnabled());
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const accountBDialog = await screen.findByRole('dialog', {
      name: /complete your purchase|kauf abschliessen|completa l.acquisto|finalise ton achat/i,
    });
    fireEvent.change(within(accountBDialog).getByRole('textbox', { name: /email address/i }), {
      target: { value: 'b@example.com' },
    });
    fireEvent.click(within(accountBDialog).getByRole('button', { name: /send link/i }));
    await waitFor(() => expect(mockUpdateMail).toHaveBeenCalledTimes(2));
    const accountBConfirm = await within(accountBDialog).findByRole('button', { name: /i have confirmed/i });

    await act(async () => {
      accountBConfirm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      resolveAccountA({ requestStatus: 'Processing' });
      await Promise.resolve();
      await Promise.resolve();
      accountBConfirm.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(2);
    await act(async () => resolveAccountB({ requestStatus: 'Processing' }));
    expect(mockGetPaymentInfoRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('allows a separate payment only after a completed request is found and confirmed', async () => {
    seedDefaultMarket();
    const requestId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId, mode: 'buy' }));
    mockGetPaymentInfoRequestStatus.mockResolvedValue({ existingUid: 'completed-request', requestStatus: 'Completed' });
    mockGetTransactionDetailByUid.mockResolvedValue({ uid: 'completed-request', state: 'Completed' });
    renderHome();

    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(within(dialog).getByText('completed-request')).toBeInTheDocument());
    fireEvent.click(await within(dialog).findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    fireEvent.click(screen.getByRole('button', { name: /start a separate payment|separate zahlung starten/i }));
    const confirmation = screen.getByRole('dialog', { name: /start a separate payment|separate zahlung starten/i });
    fireEvent.click(within(confirmation).getByRole('button', { name: /start a separate payment|separate zahlung starten/i }));
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();
    expect(screen.getByTestId('trade-cta')).toBeEnabled();
    fireEvent.click(screen.getByTestId('trade-cta'));
    await settleQuote();
    const newAttemptId = mockReceiveForBuy.mock.calls[0][0].clientRequestId;
    expect(newAttemptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(newAttemptId).not.toBe(requestId);
  });

  it('keeps a completed request when the separate-payment confirmation is cancelled or loses its account scope', async () => {
    seedDefaultMarket();
    const requestId = 'cdab92dc-8f3f-4a90-bb37-a7026e12a9fa';
    sessionStorage.setItem('app2:pending-payment-request:7', JSON.stringify({ requestId, mode: 'buy' }));
    mockGetPaymentInfoRequestStatus.mockResolvedValue({ existingUid: 'completed-request', requestStatus: 'Completed' });
    mockGetTransactionDetailByUid.mockResolvedValue({ uid: 'completed-request', state: 'Completed' });
    const view = renderHome();
    const dialog = await screen.findByRole('dialog', { name: /existing payment request|bestehende zahlungsanfrage/i });
    await waitFor(() => expect(within(dialog).getByText('completed-request')).toBeInTheDocument());
    fireEvent.click(await within(dialog).findByRole('button', { name: /done|fertig|fatto|terminé/i }));
    fireEvent.click(screen.getByRole('button', { name: /start a separate payment|separate zahlung starten/i }));
    const confirmation = screen.getByRole('dialog', { name: /start a separate payment|separate zahlung starten/i });
    fireEvent.click(within(confirmation).getByRole('button', { name: /cancel|abbrechen|annulla|annuler/i }));
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);

    fireEvent.click(screen.getByRole('button', { name: /start a separate payment|separate zahlung starten/i }));
    mockApiAccount = 8;
    view.rerender(<LanguageProvider><ToastProvider><HomeScreen /></ToastProvider></LanguageProvider>);
    const staleConfirmation = screen.getByRole('dialog', { name: /start a separate payment|separate zahlung starten/i });
    fireEvent.click(within(staleConfirmation).getByRole('button', { name: /start a separate payment|separate zahlung starten/i }));
    expect(sessionStorage.getItem('app2:pending-payment-request:7')).toContain(requestId);
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
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

  it('shows an invalid buy estimate without a validity message or refresh countdown', async () => {
    seedDefaultMarket();
    mockCall.mockResolvedValue({ ...validQuote, estimatedAmount: 2, isValid: false });
    renderHome();
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
    await settleQuote();

    expect(screen.getByRole('textbox', { name: /amount you receive/i })).toHaveValue('2');
    expect(screen.queryByText(/refreshes in|aktualisiert in|aggiorna tra|actualisé dans/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /buy|kaufen/i })).toBeDisabled();
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '100' } });
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
    fireEvent.change(screen.getByRole('textbox', { name: /amount you pay/i }), { target: { value: '2' } });
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
