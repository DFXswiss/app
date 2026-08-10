// An amount-out-of-range public quote must disable the CTA so a tap cannot arm
// authenticated paymentInfos (and create a server-side route) for a never-valid amount.
// Account-state gates stay openable; this test only pins the amount branch.

const mockReceiveForBuy = jest.fn();
const mockCall = jest.fn();

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
  useBuy: () => ({ receiveFor: mockReceiveForBuy }),
  useSell: () => ({ receiveFor: jest.fn() }),
  useSwap: () => ({ receiveFor: jest.fn() }),
  useUser: () => ({ updateMail: jest.fn() }),
  useUserContext: () => ({ user: undefined }),
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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('amount CTA gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['AmountTooLow', 'AmountTooLow'],
    ['AmountTooHigh', 'AmountTooHigh'],
  ])('disables the buy CTA and never arms paymentInfos for %s', async (_name, error) => {
    mockCall.mockResolvedValue({
      estimatedAmount: 0,
      amount: 100,
      fees: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      feesTarget: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      exchangeRate: 1,
      rate: 1,
      isValid: false,
      error,
      minVolume: 10,
      maxVolume: 1000,
    });

    renderHome();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(mockCall).toHaveBeenCalled());

    const cta = screen.getByRole('button', { name: /buy|kaufen/i });
    expect(cta).toBeDisabled();

    fireEvent.click(cta);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockReceiveForBuy).not.toHaveBeenCalled();
  });

  it('still enables the CTA when the public quote is valid', async () => {
    mockCall.mockResolvedValue({
      estimatedAmount: 111,
      amount: 100,
      fees: { total: 1.99, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      feesTarget: { total: 1.99, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      exchangeRate: 1.11,
      rate: 1.11,
      isValid: true,
    });

    renderHome();
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(mockCall).toHaveBeenCalled());

    const cta = screen.getByRole('button', { name: /buy|kaufen/i });
    expect(cta).not.toBeDisabled();
  });
});
