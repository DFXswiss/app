// Swap flip must refuse a pairing that is not sellable→buyable after the swap, and must
// clear the typed amount (units of the previous source) on a successful flip.

const mockCall = jest.fn();
const mockAssets: Array<{
  id: number;
  name: string;
  description: string;
  blockchain: string;
  buyable: boolean;
  sellable: boolean;
}> = [];

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
  TransactionError: { AMOUNT_TOO_LOW: 'AmountTooLow', AMOUNT_TOO_HIGH: 'AmountTooHigh' },
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
  useFiatContext: () => ({ currencies: [{ id: 2, name: 'EUR', buyable: true, sellable: true }] }),
  useBankAccountContext: () => ({ bankAccounts: [], isLoading: false, createAccount: jest.fn() }),
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

import { act, fireEvent, render, screen } from '@testing-library/react';
import HomeScreen from '../screens/home';
import { LanguageProvider } from '../i18n';
import { ToastProvider } from '../components/ui';

function renderHome() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <HomeScreen />
      </ToastProvider>
    </LanguageProvider>,
  );
}

async function openSwapTab() {
  fireEvent.click(screen.getByRole('tab', { name: /swap|tausch/i }));
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
}

describe('swap flip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockAssets.length = 0;
    mockCall.mockResolvedValue({
      estimatedAmount: 1,
      amount: 0.1,
      isValid: true,
      fees: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      feesTarget: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      exchangeRate: 1,
      rate: 1,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disables flip when the reversed pairing is not sellable→buyable', async () => {
    // FROM sell-only, TO buy-only — current swap works, reverse does not.
    mockAssets.push(
      {
        id: 1,
        name: 'FROM',
        description: 'From token',
        blockchain: 'Ethereum',
        buyable: false,
        sellable: true,
      },
      {
        id: 2,
        name: 'TO',
        description: 'To token',
        blockchain: 'Ethereum',
        buyable: true,
        sellable: false,
      },
    );

    renderHome();
    await openSwapTab();

    const flip = screen.getByRole('button', { name: /flip direction/i });
    expect(flip).toBeDisabled();
  });

  it('clears the typed amount after a successful flip', async () => {
    mockAssets.push(
      {
        id: 10,
        name: 'AAA',
        description: 'A',
        blockchain: 'Ethereum',
        buyable: true,
        sellable: true,
      },
      {
        id: 11,
        name: 'BBB',
        description: 'B',
        blockchain: 'Ethereum',
        buyable: true,
        sellable: true,
      },
    );

    renderHome();
    await openSwapTab();

    const flip = screen.getByRole('button', { name: /flip direction/i });
    expect(flip).not.toBeDisabled();

    const amountInput = screen.getByRole('textbox', { name: /amount you pay/i });
    fireEvent.change(amountInput, { target: { value: '42.5' } });
    expect(amountInput).toHaveValue('42.5');

    fireEvent.click(flip);
    expect(amountInput).toHaveValue('');
  });
});
