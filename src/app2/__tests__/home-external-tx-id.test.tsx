// Home must forward external-transaction-id from the URL into payment engines.

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
  AuthWalletType: { METAMASK: 'MetaMask', CLI: 'CLI', WALLET_CONNECT: 'WalletConnect' },
  FiatPaymentMethod: { BANK: 'Bank', INSTANT: 'Instant', CARD: 'Card' },
  TransactionError: { AMOUNT_TOO_LOW: 'AmountTooLow' },
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

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ search: '?external-transaction-id=partner-tx-9' }),
}));

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

describe('Home external-transaction-id wiring', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCall.mockResolvedValue({
      estimatedAmount: 1,
      amount: 100,
      fees: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      feesTarget: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      exchangeRate: 1,
      rate: 1,
      isValid: true,
      minVolume: 1,
      maxVolume: 10000,
    });
    mockReceiveForBuy.mockResolvedValue({
      estimatedAmount: 1,
      amount: 100,
      fees: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      feesTarget: { total: 0, rate: 0, fixed: 0, network: 0, dfx: 0, bank: 0 },
      exchangeRate: 1,
      rate: 1,
      isValid: true,
      minVolume: 1,
      maxVolume: 10000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('forwards external-transaction-id into the buy paymentInfos request', async () => {
    render(
      <LanguageProvider>
        <ToastProvider>
          <HomeScreen />
        </ToastProvider>
      </LanguageProvider>,
    );

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    await waitFor(() => expect(mockCall).toHaveBeenCalled());

    const cta = screen.getByRole('button', { name: /buy|kaufen/i });
    await act(async () => {
      fireEvent.click(cta);
    });
    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => expect(mockReceiveForBuy).toHaveBeenCalled());
    expect(mockReceiveForBuy).toHaveBeenCalledWith(expect.objectContaining({ externalTransactionId: 'partner-tx-9' }));
  });
});
