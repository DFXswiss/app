import { SessionStoreKey } from 'src/hooks/session-store.hook';
import { StoreKey } from 'src/hooks/store.hook';

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

function plausibleJwt(exp = Math.floor(Date.now() / 1000) + 3600): string {
  const payload = btoa(JSON.stringify({ exp, blockchains: ['Ethereum'] }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `e30.${payload}.sig`;
}

function seedOwnedAndForeignStorage(): void {
  window.localStorage.setItem(StoreKey.AUTH_TOKEN, 'stale');
  window.localStorage.setItem(StoreKey.ACTIVE_WALLET, 'MetaMask');
  window.localStorage.setItem(StoreKey.QUERY_PARAMS, '{"mail":"prev@example.com"}');
  window.localStorage.setItem(StoreKey.LANGUAGE, 'de');
  for (const key of Object.values(SessionStoreKey)) {
    window.sessionStorage.setItem(key, `owned-${key}`);
  }
  window.sessionStorage.setItem('dfx.bankTx.99', '{"id":99}');
  window.sessionStorage.setItem('other.origin.key', 'keep-me');
}

function expectOwnedStorageCleared(): void {
  expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBeNull();
  expect(window.localStorage.getItem(StoreKey.ACTIVE_WALLET)).toBeNull();
  expect(window.localStorage.getItem(StoreKey.QUERY_PARAMS)).toBeNull();
  expect(window.localStorage.getItem(StoreKey.LANGUAGE)).toBe('de');
  for (const key of Object.values(SessionStoreKey)) {
    expect(window.sessionStorage.getItem(key)).toBeNull();
  }
  expect(window.sessionStorage.getItem('dfx.bankTx.99')).toBeNull();
  expect(window.sessionStorage.getItem('other.origin.key')).toBe('keep-me');
}

function expectOwnedStorageIntact(): void {
  expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBe('stale');
  expect(window.localStorage.getItem(StoreKey.ACTIVE_WALLET)).toBe('MetaMask');
  expect(window.localStorage.getItem(StoreKey.QUERY_PARAMS)).toBe('{"mail":"prev@example.com"}');
  for (const key of Object.values(SessionStoreKey)) {
    expect(window.sessionStorage.getItem(key)).toBe(`owned-${key}`);
  }
  expect(window.sessionStorage.getItem('dfx.bankTx.99')).toBe('{"id":99}');
  expect(window.sessionStorage.getItem('other.origin.key')).toBe('keep-me');
}

describe('credentialed-load storage clear', () => {
  const original = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    window.localStorage.clear();
    window.sessionStorage.clear();
    jest.restoreAllMocks();
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

  it('leaves token and storage alone when ?session= is not a usable JWT', () => {
    seedOwnedAndForeignStorage();
    loadWithSearch('?session=garbage');
    expectOwnedStorageIntact();
  });

  it('clears the auth token and owned session keys when the URL carries a usable JWT', () => {
    seedOwnedAndForeignStorage();
    loadWithSearch(`?session=${plausibleJwt()}`);
    expectOwnedStorageCleared();
  });

  it('leaves storage alone when address+signature are obvious placeholders', () => {
    seedOwnedAndForeignStorage();
    loadWithSearch('?address=undefined&signature=null');
    expectOwnedStorageIntact();
  });

  it('leaves storage alone when address+signature are only whitespace', () => {
    seedOwnedAndForeignStorage();
    loadWithSearch('?address=%20%20&signature=0xsig');
    expect(window.localStorage.getItem(StoreKey.AUTH_TOKEN)).toBe('stale');
  });

  it('clears storage for address+signature params and swallows a storage throw', () => {
    window.localStorage.setItem(StoreKey.AUTH_TOKEN, 'stale');
    expect(() => loadWithSearch('?address=0xabc&signature=0xsig', true)).not.toThrow();
  });
});
