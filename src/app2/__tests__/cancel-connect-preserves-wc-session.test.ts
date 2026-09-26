// Cancelling an unrelated connect attempt (injected/hardware/CLI) must not tear down an
// already-authenticated WalletConnect session. cancelConnectAttempt used to always null
// wcProviderRef and call disconnectWalletConnect(), which killed the live monitor transport
// whenever the user closed the switch/connect sheet mid-attempt after a WC login.

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

import { applyConnectAttemptCancel } from '../wallets/session';
import type { Eip1193Provider } from '../wallets/providers';

function fakeProvider(label: string): Eip1193Provider {
  return { request: jest.fn(), label } as unknown as Eip1193Provider;
}

describe('applyConnectAttemptCancel (preserve live WC session)', () => {
  it('does not clear wcProviderRef or disconnect when cancelling a non-WC attempt while a WC session is live', () => {
    // Active authenticated WC session (promoted after sign-in).
    const liveWc = fakeProvider('live-wc-session');
    const wcProviderRef = { current: liveWc as Eip1193Provider | undefined };
    // No half-open WC pairing of our own — user cancelled an injected/hardware attempt.
    const pendingWcRef = { current: undefined as Eip1193Provider | undefined };
    const disconnectWc = jest.fn();

    applyConnectAttemptCancel(pendingWcRef, wcProviderRef, false, disconnectWc);

    expect(wcProviderRef.current).toBe(liveWc);
    expect(disconnectWc).not.toHaveBeenCalled();
    expect(pendingWcRef.current).toBeUndefined();
  });

  it('tears down a half-open own WC pairing (pending provider) without leaving it to watch a later session', () => {
    const pending = fakeProvider('pending-wc');
    const pendingWcRef = { current: pending as Eip1193Provider | undefined };
    // Not yet promoted — authenticated ref may be empty or still hold a prior session that
    // this new pairing superseded at connectWalletConnect start.
    const wcProviderRef = { current: undefined as Eip1193Provider | undefined };
    const disconnectWc = jest.fn();

    applyConnectAttemptCancel(pendingWcRef, wcProviderRef, false, disconnectWc);

    expect(pendingWcRef.current).toBeUndefined();
    expect(wcProviderRef.current).toBeUndefined();
    expect(disconnectWc).toHaveBeenCalledTimes(1);
  });

  it('tears down mid-QR WC pairing when only the cancel token is set (pending not yet staged)', () => {
    const pendingWcRef = { current: undefined as Eip1193Provider | undefined };
    const wcProviderRef = { current: undefined as Eip1193Provider | undefined };
    const disconnectWc = jest.fn();

    applyConnectAttemptCancel(pendingWcRef, wcProviderRef, true, disconnectWc);

    expect(disconnectWc).toHaveBeenCalledTimes(1);
    expect(wcProviderRef.current).toBeUndefined();
  });
});
