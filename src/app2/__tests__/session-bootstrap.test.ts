jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: { METAMASK: 'MetaMask', CLI: 'CLI', ALBY: 'Alby', LEDGER: 'Ledger' },
  Blockchain: { ETHEREUM: 'Ethereum' },
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
  signWithInjected: jest.fn(),
  resolveInjectedProvider: jest.fn(),
  connectWalletConnect: jest.fn(),
  createCancelToken: jest.fn(() => ({ cancel: jest.fn(), promise: new Promise(() => undefined) })),
  disconnectWalletConnect: jest.fn().mockResolvedValue(undefined),
  getInjectedProvider: jest.fn(),
  isUserRejection: () => false,
  signWithWalletConnect: jest.fn(),
}));

jest.mock('../wallets/alby', () => ({ connectAlby: jest.fn() }));
jest.mock('../wallets/cardano', () => ({ connectCardano: jest.fn() }));
jest.mock('../wallets/chain-providers', () => ({ connectChainWallet: jest.fn() }));
jest.mock('../wallets/hardware-providers', () => ({
  connectHardware: jest.fn(),
  isWebHidAvailable: () => true,
}));
jest.mock('../assets/brand/dfx-mark.svg', () => 'dfx-mark.svg');
jest.mock('../assets/wallets/pecunity.png', () => 'pecunity.png');
jest.mock('../assets/wallets/realunit.svg', () => 'realunit.svg');
jest.mock('../assets/wallets/urble.webp', () => 'urble.webp');

describe('credentialed-load storage clear', () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    window.localStorage.clear();
  });

  function loadWithSearch(search: string, throwOnStorage = false) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, search, pathname: '/app2/', hash: '' },
    });
    if (throwOnStorage) {
      jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      });
    }
    jest.isolateModules(() => {
      require('../wallets/session');
    });
  }

  it('clears the auth token when the URL carries a session', () => {
    window.localStorage.setItem('dfx.authenticationToken', 'stale');
    loadWithSearch('?session=fresh-token');
    expect(window.localStorage.getItem('dfx.authenticationToken')).toBeNull();
  });

  it('clears storage for address+signature params and swallows a storage throw', () => {
    window.localStorage.setItem('dfx.authenticationToken', 'stale');
    expect(() => loadWithSearch('?address=0xabc&signature=0xsig', true)).not.toThrow();
  });
});
