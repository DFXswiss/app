// sessionConnectorFor must map catalog connectors onto the three-way session monitor
// binding — only real injected / wallet-connect sessions may use provider refs; hardware,
// Cardano, Alby, CLI, Solana, Tron must resolve to `'other'` so they never borrow wcProviderRef.

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    WALLET_BROWSER: 'WalletBrowser',
    RABBY: 'Rabby',
    WALLET_CONNECT: 'WalletConnect',
    BIT_BOX: 'BitBox',
    LEDGER: 'Ledger',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
  },
  Blockchain: {
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    CITREA: 'Citrea',
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    TRON: 'Tron',
    INTERNET_COMPUTER: 'InternetComputer',
    CARDANO: 'Cardano',
  },
  useApi: () => ({ defaultUrl: 'https://api.dfx.swiss/v1' }),
  useApiSession: () => ({ createSessionNew: jest.fn(), updateSession: jest.fn() }),
  useAuth: () => ({ getSignMessage: jest.fn() }),
  useAuthContext: () => ({ session: undefined }),
  useSessionContext: () => ({ isLoggedIn: false, logout: jest.fn() }),
  useUserContext: () => ({ userAddresses: [], changeAddress: jest.fn(), reloadUser: jest.fn() }),
}));

jest.mock('../wallets/providers', () => ({
  WalletConnectorError: class WalletConnectorError extends Error {
    reason: string;
    constructor(message: string, reason: string) {
      super(message);
      this.reason = reason;
    }
  },
  connectInjected: jest.fn(),
  connectWalletConnect: jest.fn(),
  createCancelToken: jest.fn(),
  disconnectWalletConnect: jest.fn(),
  getInjectedProvider: jest.fn(),
  isUserRejection: jest.fn(),
  resolveInjectedProvider: jest.fn(),
  signWithInjected: jest.fn(),
  signWithWalletConnect: jest.fn(),
}));

jest.mock('../wallets/alby', () => ({ connectAlby: jest.fn() }));
jest.mock('../wallets/cardano', () => ({ connectCardano: jest.fn() }));
jest.mock('../wallets/chain-providers', () => ({ connectChainWallet: jest.fn() }));
jest.mock('../wallets/hardware-providers', () => ({
  connectHardware: jest.fn(),
  isWebHidAvailable: jest.fn(() => false),
}));
jest.mock('../wallets/cli', () => ({ isPlausibleCliAddress: jest.fn() }));
jest.mock('../wallets/seen', () => ({ rememberWallet: jest.fn(), seenWallets: () => [] }));
jest.mock('../components/ui', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('../i18n', () => ({ useT: () => ({ t: (k: string) => k, language: 'en' }) }));
jest.mock('../screens/trade/blockchain-meta', () => ({ mainnetOnly: (x: unknown) => x }));

jest.mock('../assets/brand/dfx-mark.svg', () => 'dfx-mark.svg');
jest.mock('../assets/wallets/pecunity.png', () => 'pecunity.png');
jest.mock('../assets/wallets/realunit.svg', () => 'realunit.svg');
jest.mock('../assets/wallets/urble.webp', () => 'urble.webp');
jest.mock('../assets/networks/lightning.svg', () => 'lightning.svg');
jest.mock('../assets/tokens/ICP.svg', () => 'icp.svg');
jest.mock('../assets/wallets/alby.svg', () => 'alby.svg');
jest.mock('../assets/wallets/bitbox.svg', () => 'bitbox.svg');
jest.mock('../assets/networks/cardano.svg', () => 'cardano.svg');
jest.mock('../assets/wallets/cli.svg', () => 'cli.svg');
jest.mock('../assets/wallets/coinbase.svg', () => 'coinbase.svg');
jest.mock('../assets/wallets/ledger.svg', () => 'ledger.svg');
jest.mock('../assets/wallets/metamask.svg', () => 'metamask.svg');
jest.mock('../assets/wallets/phantom.svg', () => 'phantom.svg');
jest.mock('../assets/wallets/rabby.svg', () => 'rabby.svg');
jest.mock('../assets/wallets/trezor.svg', () => 'trezor.svg');
jest.mock('../assets/wallets/tron.svg', () => 'tron.svg');
jest.mock('../assets/wallets/trust.svg', () => 'trust.svg');
jest.mock('../assets/wallets/wallet-connect.svg', () => 'wallet-connect.svg');

import { sessionConnectorFor } from '../wallets/session';
import type { WalletConnector } from '../wallets/catalog';

describe('sessionConnectorFor', () => {
  it('maps injected and wallet-connect to themselves', () => {
    expect(sessionConnectorFor('injected')).toBe('injected');
    expect(sessionConnectorFor('wallet-connect')).toBe('wallet-connect');
  });

  it('maps hardware / Cardano / Alby / CLI / Solana / Tron to other (not wallet-connect)', () => {
    const others: WalletConnector[] = ['ledger', 'bitbox', 'trezor', 'cardano', 'alby', 'cli', 'solana', 'tron'];
    for (const connector of others) {
      expect(sessionConnectorFor(connector)).toBe('other');
    }
  });

  it('does not treat soon or missing connectors as wallet-connect', () => {
    expect(sessionConnectorFor('soon')).toBeUndefined();
    expect(sessionConnectorFor(undefined)).toBeUndefined();
  });
});
