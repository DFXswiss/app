// The sell panel must price itself with the public quote and only ask for payment details —
// which create a route and a transaction request server-side (api › sell.service) — when the
// user actually moves to pay. This is asserted on the screen, not on the hook, because the
// decision lives in HomeScreen's wiring: the hook alone would happily do either.

const mockReceiveForSell = jest.fn();
const mockCall = jest.fn();
const mockBankAccounts: unknown[] = [];

jest.mock('@dfx.swiss/react', () => ({
  // Enum values verbatim from @dfx.swiss/core (definitions/{blockchain,transaction}.js).
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
  TransactionError: { AMOUNT_TOO_LOW: 'AmountTooLow', AMOUNT_TOO_HIGH: 'AmountTooHigh' },
  BuyUrl: { quote: 'buy/quote' },
  SellUrl: { quote: 'sell/quote' },
  SwapUrl: { quote: 'swap/quote' },
  useApi: () => ({ call: mockCall }),
  useBuy: () => ({ receiveFor: jest.fn() }),
  useSell: () => ({ receiveFor: mockReceiveForSell }),
  useSwap: () => ({ receiveFor: jest.fn() }),
  useUser: () => ({ updateMail: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
  // Fixtures live inside the factory: jest hoists this call above every other statement, so it
  // may not reference module-scope consts declared below.
  useAssetContext: () => ({
    getAssets: () => [
      {
        id: 123,
        name: 'USDT',
        description: 'Tether',
        blockchain: 'Ethereum',
        buyable: true,
        sellable: true,
      },
    ],
  }),
  useFiatContext: () => ({ currencies: [{ id: 2, name: 'EUR', buyable: true, sellable: true }] }),
  useBankAccountContext: () => ({ bankAccounts: mockBankAccounts, isLoading: false, createAccount: jest.fn() }),
}));

jest.mock('react-router-dom', () => ({ useLocation: () => ({ search: '' }) }));

jest.mock('../wallets/session', () => ({
  useWalletSession: () => ({
    isLoggedIn: true,
    address: '0x7099797000000000000000000000000000000000',
    blockchain: 'Ethereum',
    blockchains: ['Ethereum'],
    activeWallet: undefined,
    openConnect: jest.fn(),
    openSwitcher: jest.fn(),
  }),
}));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomeScreen from '../screens/home';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

const quote = {
  estimatedAmount: 86.13,
  amount: 100,
  fees: { total: 1.75 },
  feesTarget: { total: 1.75 },
  isValid: true,
};
const paymentInfo = { ...quote, depositAddress: '0xdeposit', blockchain: 'Ethereum' };

function renderHome() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <HomeScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

/** Selects the sell tab and lets the debounced quote fire. */
async function openSellTab() {
  fireEvent.click(screen.getByRole('tab', { name: /sell|verkaufen/i }));
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

describe('App2 sell timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockBankAccounts.length = 0;
    mockCall.mockResolvedValue(quote);
    mockReceiveForSell.mockResolvedValue(paymentInfo);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prices the panel with the public quote and creates no payment request', async () => {
    // A payout account on file is the regression case: it used to switch the panel itself over
    // to the authenticated endpoint, which both gated the rate and created a payment request.
    mockBankAccounts.push({ id: 1, iban: 'DE89370400440532013000', active: true });
    renderHome();
    await openSellTab();

    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockCall.mock.calls.some(([config]) => config.url === 'sell/quote' && config.token === false)).toBe(true);
    // The account has a payout account on file — the panel must still not touch paymentInfos.
    expect(mockReceiveForSell).not.toHaveBeenCalled();
  });

  it('asks for payment details once the user taps the CTA', async () => {
    mockBankAccounts.push({ id: 1, iban: 'DE89370400440532013000', active: true });
    renderHome();
    await openSellTab();
    await waitFor(() => expect(mockCall).toHaveBeenCalled());
    expect(mockReceiveForSell).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /sell|verkaufen/i }));
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => expect(mockReceiveForSell).toHaveBeenCalledTimes(1));
    expect(mockReceiveForSell).toHaveBeenCalledWith(expect.objectContaining({ iban: 'DE89370400440532013000' }));
  });
});
