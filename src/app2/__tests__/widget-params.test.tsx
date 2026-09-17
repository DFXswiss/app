// Partner widget params: each test asserts the effect, not that the string appears.

const mockCall = jest.fn();
const mockAssets: Array<Record<string, unknown>> = [];
const mockCurrencies: Array<Record<string, unknown>> = [];
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
  TransactionError: { AMOUNT_TOO_LOW: 'AmountTooLow' },
  BuyUrl: { quote: 'buy/quote' },
  SellUrl: { quote: 'sell/quote' },
  SwapUrl: { quote: 'swap/quote' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: jest.fn() }),
  useSell: () => ({ receiveFor: jest.fn() }),
  useSwap: () => ({ receiveFor: jest.fn() }),
  useUser: () => ({ updateMail: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
  useAssetContext: () => ({ getAssets: () => mockAssets }),
  useFiatContext: () => ({ currencies: mockCurrencies }),
  useBankAccountContext: () => ({ bankAccounts: [], isLoading: false, createAccount: jest.fn() }),
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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    coin('BTC', 'Bitcoin'),
    coin('USDT', 'Ethereum', { instantBuyable: true }),
    coin('ETH', 'Ethereum'),
    coin('DEPS', 'Ethereum', { category: 'Private' }),
  );
  mockCurrencies.push(
    { id: 1, name: 'EUR', buyable: true, sellable: true },
    { id: 2, name: 'CHF', buyable: true, sellable: true },
    { id: 3, name: 'USD', buyable: true, sellable: true },
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
    mockLocation.search = '';
    mockCall.mockResolvedValue(validQuote);
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
});
