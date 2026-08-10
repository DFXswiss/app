// On reload, an eth_accounts probe that returns a *present but different*
// account must force logout only for injected-EVM sessions. Non-EVM JWT addresses (Bitcoin,
// Cardano, Solana, …) and sessions with no positive injected-EVM association must keep the
// safe behaviour (monitoring off, no logout).
//
// Pure exports from session.tsx; the heavy wallet/session graph is stubbed so Jest never loads
// @dfx.swiss/react ESM or WalletConnect/viem.

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
// Real catalog is needed for isInjectedEvmSession — mock only the pure provider/UI surface.
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

import { isInjectedEvmSession, shouldInvalidateOnAccountProbe } from '../wallets/session';
import { shouldInvalidateSession } from '../wallets/session-guards';

const jwt = '0xAbC1230000000000000000000000000000dEaD';
const other = '0x0000000000000000000000000000000000000001';
const btc = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const cardano = 'addr1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlhxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

describe('shouldInvalidateOnAccountProbe', () => {
  it('forces logout when eth_accounts returns a different present account on an injected-EVM session', () => {
    expect(shouldInvalidateOnAccountProbe(jwt, [other], true)).toBe(true);
    // Default keeps prior EVM-only callers working.
    expect(shouldInvalidateOnAccountProbe(jwt, [other])).toBe(true);
  });

  it('does not force logout on an empty account list (locked / permission revoked)', () => {
    // Contrast: accountsChanged treats empty as invalidate (session-guards), the mount probe must not.
    expect(shouldInvalidateSession(jwt, [])).toBe(true);
    expect(shouldInvalidateOnAccountProbe(jwt, [], true)).toBe(false);
  });

  it('does not force logout when the present account still matches the JWT (any case)', () => {
    expect(shouldInvalidateOnAccountProbe(jwt, [jwt.toLowerCase()], true)).toBe(false);
    expect(shouldInvalidateOnAccountProbe(jwt, [jwt], true)).toBe(false);
  });

  it('never force-logs-out a non-injected-EVM session on probe mismatch', () => {
    // Bitcoin / Cardano JWT vs MetaMask eth_accounts — the reload regression.
    expect(shouldInvalidateOnAccountProbe(btc, [other], false)).toBe(false);
    expect(shouldInvalidateOnAccountProbe(cardano, [other], false)).toBe(false);
    // Even a 0x JWT with no injected-EVM association (e.g. unknown WalletConnect after reload)
    // must not log out — safe default when association is missing.
    expect(shouldInvalidateOnAccountProbe(jwt, [other], false)).toBe(false);
  });
});

describe('isInjectedEvmSession association', () => {
  it('returns true for a remembered MetaMask address', () => {
    expect(isInjectedEvmSession(jwt, [{ address: jwt, walletType: 'MetaMask', walletId: 'MetaMask' }])).toBe(true);
  });

  it('returns false for remembered Bitcoin / Cardano / CLI / Ledger sessions', () => {
    expect(isInjectedEvmSession(btc, [{ address: btc, walletType: 'Ledger', walletId: 'Ledger' }])).toBe(false);
    expect(isInjectedEvmSession(cardano, [{ address: cardano, walletType: 'CLI', walletId: 'Cardano' }])).toBe(false);
    expect(isInjectedEvmSession(btc, [{ address: btc, walletType: 'CLI', walletId: 'CLI' }])).toBe(false);
  });

  it('returns false when no association is available (safe default)', () => {
    expect(isInjectedEvmSession(jwt, [])).toBe(false);
    expect(isInjectedEvmSession(btc, [])).toBe(false);
  });

  it('falls back to userAddresses.wallet when seen list has no entry', () => {
    expect(isInjectedEvmSession(jwt, [], [{ address: jwt, wallet: 'MetaMask' }])).toBe(true);
    expect(isInjectedEvmSession(jwt, [], [{ address: jwt, wallet: 'Ledger' }])).toBe(false);
  });
});
