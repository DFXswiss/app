// After connectLedger succeeds, the WebHID transport stays open for the subsequent sign.
// If the user aborts between connect and sign (sheet close / superseded attempt / bad auth
// message), handleSelectHwChain must call dispose so the next connect does not hit
// "device already claimed".

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
    BITCOIN: 'Bitcoin',
  },
  useApi: () => ({ defaultUrl: 'https://api.dfx.swiss/v1' }),
  useApiSession: () => ({ createSessionNew: jest.fn(), updateSession: jest.fn() }),
  useAuth: () => ({ getSignMessage: jest.fn() }),
  useAuthContext: () => ({ session: undefined }),
  useSessionContext: () => ({ isLoggedIn: false, logout: jest.fn() }),
  useUserContext: () => ({ userAddresses: [], changeAddress: jest.fn(), reloadUser: jest.fn() }),
}));

jest.mock('../wallets/alby', () => ({ connectAlby: jest.fn() }));
jest.mock('../wallets/cardano', () => ({ connectCardano: jest.fn() }));
jest.mock('../wallets/chain-providers', () => ({ connectChainWallet: jest.fn() }));
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

import { releaseUnusedHardwareSession } from '../wallets/session';

describe('releaseUnusedHardwareSession (abort between connect and sign)', () => {
  it('calls dispose when the user aborts after connect without signing', async () => {
    const dispose = jest.fn().mockResolvedValue(undefined);
    const hw = {
      address: '0xabc',
      sign: jest.fn(),
      dispose,
    };

    // Simulates handleSelectHwChain finally after !isCurrent() / authMsgOk fail / early return.
    await releaseUnusedHardwareSession(hw, false);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hw.sign).not.toHaveBeenCalled();
  });

  it('does not call dispose after a successful sign (sign finally already closed the transport)', async () => {
    const dispose = jest.fn().mockResolvedValue(undefined);
    const hw = {
      address: '0xabc',
      sign: jest.fn(),
      dispose,
    };

    await releaseUnusedHardwareSession(hw, true);

    expect(dispose).not.toHaveBeenCalled();
  });

  it('is a no-op when the session has no dispose (BitBox/Trezor)', async () => {
    await expect(
      releaseUnusedHardwareSession({ address: 'bc1qexample', sign: jest.fn() }, false),
    ).resolves.toBeUndefined();
  });
});

describe('connectLedger attaches dispose that closes the WebHID transport', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exposes dispose that closes the transport after a successful eth connect', async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    const transport = { close };

    Object.defineProperty(global.navigator, 'hid', {
      configurable: true,
      value: {},
    });

    jest.doMock('../wallets/providers', () => ({
      WalletConnectorError: class WalletConnectorError extends Error {
        reason: string;
        constructor(message: string, reason: string) {
          super(message);
          this.reason = reason;
        }
      },
    }));
    jest.doMock(
      '@ledgerhq/hw-transport-webhid',
      () => ({
        __esModule: true,
        default: { create: jest.fn().mockResolvedValue(transport) },
      }),
      { virtual: true },
    );
    jest.doMock(
      '@ledgerhq/hw-app-eth',
      () => ({
        __esModule: true,
        default: function Eth() {
          return {
            getAddress: jest.fn().mockResolvedValue({ address: '0xLedgerEthAddress' }),
            signPersonalMessage: jest.fn(),
          };
        },
      }),
      { virtual: true },
    );

    const { connectHardware } = await import('../wallets/hardware-providers');
    const session = await connectHardware('ledger', 'eth');

    expect(session.address).toBe('0xLedgerEthAddress');
    expect(typeof session.dispose).toBe('function');
    expect(close).not.toHaveBeenCalled();

    await session.dispose?.();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
