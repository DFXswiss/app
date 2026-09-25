/**
 * Tests for useMetaMask.
 *
 * EIP-5792 flow logic is also tested in src/__tests__/eip5792-flow.test.ts.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

const mockToBlockchain = jest.fn();
const mockToChainHex = jest.fn();
const mockToChainObject = jest.fn();
const mockSendTransaction = jest.fn();
const mockContract = jest.fn();
const mockGetBalance = jest.fn();
const mockPersonalSign = jest.fn();
const mockToWei = jest.fn();
let mockIsMobile = false;

// Mock @dfx.swiss/react
jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    ETHEREUM: 'Ethereum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    ARBITRUM: 'Arbitrum',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
  },
  AssetType: {
    COIN: 'Coin',
    TOKEN: 'Token',
  },
}));

// Mock useWeb3 hook
jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (...args: unknown[]) => mockToBlockchain(...args),
    toChainHex: (...args: unknown[]) => mockToChainHex(...args),
    toChainObject: (...args: unknown[]) => mockToChainObject(...args),
  }),
}));

// Records the adapter given to Web3. Account, chain and requestAccounts RPCs go through that
// adapter. Balance, signing, sending and contracts are the shared mocks configured in beforeEach.
jest.mock('web3', () => {
  const instances: any[] = [];

  function invoke(cb: any, promise: Promise<any>) {
    if (typeof cb === 'function') {
      promise.then(
        (value) => cb(null, value),
        (err) => cb(err),
      );
    }
    return promise;
  }

  function MockWeb3(provider?: any) {
    const instance: any = {
      currentProvider: provider ?? null,
      eth: {
        getAccounts: (cb?: any) =>
          invoke(
            cb,
            (async () => {
              const p = instance.currentProvider;
              if (!p || typeof p.request !== 'function') throw new Error('Provider not set or invalid');
              return (await p.request({ method: 'eth_accounts' })) ?? [];
            })(),
          ),
        getChainId: (cb?: any) =>
          invoke(
            cb,
            (async () => {
              const p = instance.currentProvider;
              if (!p || typeof p.request !== 'function') throw new Error('Provider not set or invalid');
              const result = await p.request({ method: 'eth_chainId' });
              return typeof result === 'string' ? parseInt(result, 16) : (result ?? 1);
            })(),
          ),
        requestAccounts: async () => {
          const p = instance.currentProvider;
          if (!p || typeof p.request !== 'function') throw new Error('Provider not set or invalid');
          return (await p.request({ method: 'eth_requestAccounts' })) ?? [];
        },
        getBalance: (...args: unknown[]) => mockGetBalance(...args),
        personal: { sign: (...args: unknown[]) => mockPersonalSign(...args) },
        sendTransaction: (...args: unknown[]) => mockSendTransaction(...args),
        Contract: mockContract,
      },
      utils: {
        toChecksumAddress: (addr: string) => addr,
        toHex: (val: number) => `0x${val.toString(16)}`,
        toWei: (...args: unknown[]) => mockToWei(...args),
      },
    };
    instances.push(instance);
    return instance;
  }
  MockWeb3.givenProvider = {};
  MockWeb3.utils = {
    toChecksumAddress: (addr: string) => addr,
    toHex: (val: number) => `0x${val.toString(16)}`,
    toWei: (val: string) => val,
  };
  MockWeb3.__instances = instances;
  return MockWeb3;
});

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockIsMobile;
  },
}));

import { Asset, AssetType, Blockchain } from '@dfx.swiss/react';
import BigNumber from 'bignumber.js';
import { Buffer } from 'buffer';
import Web3 from 'web3';
import { AbortError } from '../../../util/abort-error';
import { TranslatedError } from '../../../util/translated-error';
import { useMetaMask } from '../metamask.hook';

const TEST_ACCOUNT = '0x1111111111111111111111111111111111111111';
const MISSING_PROVIDER = 'No wallet found. Please check your wallet extension or set one up, then reload this page.';

const ETH_CHAIN = {
  chainId: '0x1',
  chainName: 'Ethereum Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.example'],
  blockExplorerUrls: ['https://explorer.example'],
};

function lastWeb3Instance(): any {
  const instances = (Web3 as any).__instances as any[];
  return instances[instances.length - 1];
}

function createBraveLikeProvider(request: jest.Mock) {
  const target: any = {};
  Object.defineProperty(target, 'on', { value: jest.fn(), writable: false, configurable: false });
  target.request = request;
  target.isMetaMask = true;

  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'on') return jest.fn();
      return t[prop];
    },
  });
}

function mockRequest(handler: (args: { method: string; params?: any[] }) => any) {
  return jest.fn(async (args: { method: string; params?: any[] }) => handler(args));
}

function installedProvider(request: jest.Mock, extra: Record<string, unknown> = {}) {
  (window as any).ethereum = { isMetaMask: true, on: jest.fn(), request, ...extra };
}

function connectedProvider() {
  installedProvider(
    mockRequest(({ method }) => {
      if (method === 'eth_accounts') return [TEST_ACCOUNT];
      if (method === 'eth_chainId') return '0x1';
      return [];
    }),
  );
}

function tokenContract(methods: Record<string, () => { call?: jest.Mock; send?: jest.Mock }>) {
  lastWeb3Instance().eth.Contract.mockReturnValue({ methods });
}

function registeredHandler(on: jest.Mock, event: string): (value: any) => void {
  const handler = on.mock.calls.find((call: unknown[]) => call[0] === event)?.[1];
  if (typeof handler !== 'function') throw new Error(`missing ${event} handler`);
  return handler;
}

describe('useMetaMask', () => {
  beforeEach(() => {
    mockSendTransaction.mockReset();
    mockContract.mockReset().mockReturnValue({ methods: {} });
    mockGetBalance.mockReset().mockResolvedValue('0');
    mockPersonalSign.mockReset();
    mockToWei.mockReset().mockImplementation((val: string) => val);
    mockIsMobile = false;
    mockToBlockchain.mockReset().mockImplementation(() => 'Ethereum');
    mockToChainHex.mockReset().mockImplementation(() => '0x1');
    mockToChainObject.mockReset().mockImplementation(() => ETH_CHAIN);
  });

  afterEach(() => {
    delete (window as any).ethereum;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('isInstalled', () => {
    it('should return true when MetaMask is installed', () => {
      (window as any).ethereum = { isMetaMask: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return false when ethereum is not available', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(false);
    });

    it('should return true for Rabby wallet', () => {
      (window as any).ethereum = { isRabby: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return true for CoinbaseWallet', () => {
      (window as any).ethereum = { isCoinbaseWallet: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return true for Trust wallet', () => {
      (window as any).ethereum = { isTrust: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return false when ethereum is present but is not a known wallet', () => {
      (window as any).ethereum = {};
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(false);
    });
  });

  describe('getWalletType', () => {
    it('should return META_MASK for MetaMask wallet', () => {
      (window as any).ethereum = { isMetaMask: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('MetaMask');
    });

    it('should return RABBY for Rabby wallet', () => {
      (window as any).ethereum = { isRabby: true };
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('Rabby');
    });

    it('should return undefined when no wallet is detected', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBeUndefined();
    });
  });

  describe('conflicting injected provider', () => {
    it('forwards RPC to a provider whose .on access throws', async () => {
      const request = jest.fn(async function (this: { isMetaMask?: boolean }, { method }: { method: string }) {
        expect(this.isMetaMask).toBe(true);
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        return [];
      });
      const provider = createBraveLikeProvider(request);
      (window as any).ethereum = provider;
      expect(() => provider.on).toThrow(TypeError);

      const { result } = renderHook(() => useMetaMask());
      const instance = lastWeb3Instance();

      expect(instance.currentProvider).not.toBeNull();
      expect(instance.currentProvider).toBeDefined();
      expect(instance.currentProvider).not.toBe(provider);

      let account: string | undefined;
      await act(async () => {
        account = await result.current.getAccount();
      });

      expect(account).toBe(TEST_ACCOUNT);
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts', params: undefined });
    });

    it('never exposes the injected provider .on to Web3', () => {
      const request = jest.fn().mockResolvedValue([]);
      (window as any).ethereum = createBraveLikeProvider(request);

      renderHook(() => useMetaMask());
      const instance = lastWeb3Instance();

      expect(instance.currentProvider).not.toBeNull();
      expect(instance.currentProvider.on).toBeUndefined();
    });

    it('passes the lazy adapter through the real Web3 request manager', async () => {
      const request = jest.fn(async function (this: { isMetaMask?: boolean }, { method }: { method: string }) {
        expect(this.isMetaMask).toBe(true);
        if (method === 'eth_chainId') return '0x1';
        throw new Error(`Unexpected RPC: ${method}`);
      });
      const provider = createBraveLikeProvider(request);
      (window as any).ethereum = provider;
      expect(() => provider.on).toThrow(TypeError);

      renderHook(() => useMetaMask());
      const adapter = lastWeb3Instance().currentProvider;
      expect(adapter).not.toBe(provider);
      expect(adapter.on).toBeUndefined();

      const RealWeb3 = jest.requireActual('web3') as typeof Web3;
      const realWeb3 = new RealWeb3(adapter);
      await expect(realWeb3.eth.getChainId()).resolves.toBe(1);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith({ method: 'eth_chainId', params: [] });
    });

    it('forwards RPC parameters through real Web3 after a late injection', async () => {
      renderHook(() => useMetaMask());
      const adapter = lastWeb3Instance().currentProvider;
      const RealWeb3 = jest.requireActual('web3') as typeof Web3;
      const realWeb3 = new RealWeb3(adapter);
      const request = jest.fn().mockResolvedValue('0x0');

      (window as any).ethereum = { isMetaMask: true, request };

      await expect(realWeb3.eth.getBalance(TEST_ACCOUNT)).resolves.toBe('0');
      expect(request).toHaveBeenCalledWith({ method: 'eth_getBalance', params: [TEST_ACCOUNT, 'latest'] });
    });

    it('keeps register() working when .on throws so getAccounts/getChainId still run', async () => {
      const request = jest.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_chainId') return '0x1';
        return [];
      });
      (window as any).ethereum = createBraveLikeProvider(request);

      const { result } = renderHook(() => useMetaMask());
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();

      expect(() => result.current.register(onAccountChanged, onBlockchainChanged)).not.toThrow();

      await waitFor(() => {
        expect(onAccountChanged).toHaveBeenCalledWith(TEST_ACCOUNT);
        expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum');
      });
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts', params: undefined });
      expect(request).toHaveBeenCalledWith({ method: 'eth_chainId', params: undefined });
    });

    it('still registers accountsChanged and chainChanged listeners when .on works', () => {
      const on = jest.fn();
      const provider = {
        isMetaMask: true,
        request: jest.fn().mockResolvedValue([]),
        on,
      };
      (window as any).ethereum = provider;

      const { result } = renderHook(() => useMetaMask());
      expect(lastWeb3Instance().currentProvider).not.toBe(provider);
      result.current.register(jest.fn(), jest.fn());

      expect(on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
      expect(on).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });

    it('uses a replacement provider for later RPCs without rebinding Web3', async () => {
      const first = mockRequest(async () => [TEST_ACCOUNT]);
      installedProvider(first);
      const { result } = renderHook(() => useMetaMask());
      const adapter = lastWeb3Instance().currentProvider;

      await expect(result.current.getAccount()).resolves.toBe(TEST_ACCOUNT);
      const secondAccount = '0x2222222222222222222222222222222222222222';
      const second = mockRequest(async () => [secondAccount]);
      installedProvider(second);

      await expect(result.current.getAccount()).resolves.toBe(secondAccount);
      expect(lastWeb3Instance().currentProvider).toBe(adapter);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('reports a missing injected provider with a readable message', async () => {
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.getAccount()).rejects.toBeInstanceOf(TranslatedError);
      await expect(result.current.getAccount()).rejects.toThrow(
        'No wallet found. Please check your wallet extension or set one up, then reload this page.',
      );
    });

    it('keeps an injected wallet RPC error even when it matches Web3 provider wording', async () => {
      const rpcError = new Error('Provider not set or invalid');
      installedProvider(
        mockRequest(async () => {
          throw rpcError;
        }),
      );
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.getAccount()).rejects.toBe(rpcError);
    });
  });

  describe('hook interface', () => {
    it('should expose all required functions', () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      const { result } = renderHook(() => useMetaMask());

      expect(typeof result.current.isInstalled).toBe('function');
      expect(typeof result.current.getWalletType).toBe('function');
      expect(typeof result.current.register).toBe('function');
      expect(typeof result.current.getAccount).toBe('function');
      expect(typeof result.current.requestAccount).toBe('function');
      expect(typeof result.current.requestBlockchain).toBe('function');
      expect(typeof result.current.requestChangeToBlockchain).toBe('function');
      expect(typeof result.current.requestBalance).toBe('function');
      expect(typeof result.current.sign).toBe('function');
      expect(typeof result.current.addContract).toBe('function');
      expect(typeof result.current.readBalance).toBe('function');
      expect(typeof result.current.createTransaction).toBe('function');
      expect(typeof result.current.sendCallsWithPaymaster).toBe('function');
      expect(typeof result.current.supportsEip5792Paymaster).toBe('function');
      expect(typeof result.current.signEip7702Authorization).toBe('function');
    });
  });

  describe('getWalletType in-app and fallbacks', () => {
    const originalUserAgent = window.navigator.userAgent;

    afterEach(() => {
      Object.defineProperty(window.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    });

    it('returns IN_APP_BROWSER when the user agent names a wallet in-app browser', () => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MetaMaskMobile',
        configurable: true,
      });
      (window as any).ethereum = { isMetaMask: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('returns IN_APP_BROWSER for Trust on mobile even without a matching user agent', () => {
      mockIsMobile = true;
      (window as any).ethereum = { isTrust: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('returns IN_APP_BROWSER for Coinbase Wallet on mobile', () => {
      mockIsMobile = true;
      (window as any).ethereum = { isCoinbaseWallet: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.getWalletType()).toBe('InAppBrowser');
    });

    it('returns undefined for Trust on desktop', () => {
      (window as any).ethereum = { isTrust: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.isInstalled()).toBe(true);
      expect(result.current.getWalletType()).toBeUndefined();
    });

    it('returns undefined for a Coinbase desktop inject that is neither Rabby nor MetaMask', () => {
      (window as any).ethereum = { isCoinbaseWallet: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.isInstalled()).toBe(true);
      expect(result.current.getWalletType()).toBeUndefined();
    });
  });

  describe('register listener callbacks', () => {
    it('forwards accountsChanged and chainChanged to the registered callbacks', () => {
      const on = jest.fn();
      installedProvider(
        mockRequest(async () => []),
        { on },
      );
      mockToBlockchain.mockImplementation((chainId: unknown) => `chain:${String(chainId)}`);

      const { result } = renderHook(() => useMetaMask());
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();
      result.current.register(onAccountChanged, onBlockchainChanged);

      const accountsHandler = registeredHandler(on, 'accountsChanged');
      const chainHandler = registeredHandler(on, 'chainChanged');

      act(() => accountsHandler([TEST_ACCOUNT]));
      expect(onAccountChanged).toHaveBeenCalledWith(TEST_ACCOUNT);

      act(() => accountsHandler([]));
      expect(onAccountChanged).toHaveBeenCalledWith(undefined);

      act(() => chainHandler('0xa'));
      expect(onBlockchainChanged).toHaveBeenCalledWith('chain:0xa');
    });

    it('calls onAccountChanged with undefined when getAccounts fails so verifyAccount sees no list', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') throw new Error('accounts unavailable');
        if (method === 'eth_chainId') return '0x1';
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();
      result.current.register(onAccountChanged, onBlockchainChanged);

      await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(undefined));
      await waitFor(() => expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum'));
    });

    it('does not throw when register runs without an injected provider', async () => {
      const { result } = renderHook(() => useMetaMask());
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();

      expect(() => result.current.register(onAccountChanged, onBlockchainChanged)).not.toThrow();

      await waitFor(() => {
        expect(onAccountChanged).toHaveBeenCalledWith(undefined);
        expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum');
      });
    });
  });

  describe('requestAccount and checkConnection', () => {
    it('returns the checksum account after a successful connection check', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_ACCOUNT];
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).resolves.toBe(TEST_ACCOUNT);
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts', params: undefined });
      expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts', params: undefined });
    });

    it('returns the account from a Brave-like provider whose .on access throws', async () => {
      const request = jest.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [TEST_ACCOUNT];
        return [];
      });
      const provider = createBraveLikeProvider(request);
      (window as any).ethereum = provider;
      expect(() => provider.on).toThrow(TypeError);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).resolves.toBe(TEST_ACCOUNT);
      expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts', params: undefined });
    });

    it('reloads on a Timeout from the connection check and still requests the account', async () => {
      jest.useFakeTimers();
      const reload = jest.fn();
      Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });

      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return [TEST_ACCOUNT];
        }
        if (method === 'eth_requestAccounts') return [TEST_ACCOUNT];
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      let resolved: string | undefined;
      await act(async () => {
        const accountPromise = result.current.requestAccount();
        jest.advanceTimersByTime(1000);
        resolved = await accountPromise;
      });

      expect(reload).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(TEST_ACCOUNT);

      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    });

    it('reports a missing provider from requestAccount without reloading', async () => {
      const reload = jest.fn();
      Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).rejects.toBeInstanceOf(TranslatedError);
      await expect(result.current.requestAccount()).rejects.toThrow(MISSING_PROVIDER);
      expect(reload).not.toHaveBeenCalled();
    });

    it('maps user rejection of eth_requestAccounts to AbortError', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_requestAccounts') throw { code: 4001, message: 'User rejected the request' };
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).rejects.toBeInstanceOf(AbortError);
      await expect(result.current.requestAccount()).rejects.toThrow('User cancelled');
    });
  });

  describe('requestBlockchain and requestBalance', () => {
    it('maps the provider chain id through toBlockchain', async () => {
      mockToBlockchain.mockImplementation((chainId) => (chainId === 10 ? 'Optimism' : 'Ethereum'));
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_chainId') return '0xa';
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestBlockchain()).resolves.toBe('Optimism');
      expect(mockToBlockchain).toHaveBeenCalledWith(10);
    });

    it('reads the native balance for the given account', async () => {
      installedProvider(mockRequest(async () => [TEST_ACCOUNT]));

      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockResolvedValue('1000');

      await expect(result.current.requestBalance(TEST_ACCOUNT)).resolves.toBe('1000');
      expect(mockGetBalance).toHaveBeenCalledWith(TEST_ACCOUNT);
    });
  });

  describe('requestChangeToBlockchain', () => {
    it('returns without talking to the wallet when no blockchain is given', async () => {
      const request = mockRequest(async () => null);
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestChangeToBlockchain(undefined)).resolves.toBeUndefined();
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_switchEthereumChain' }));
    });

    it('returns without talking to the wallet when the chain hex is unknown', async () => {
      mockToChainHex.mockReturnValue(undefined);
      const request = mockRequest(async () => null);
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).resolves.toBeUndefined();
      expect(mockToChainHex).toHaveBeenCalledWith(Blockchain.ETHEREUM);
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_switchEthereumChain' }));
    });

    it('switches to the requested chain', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') return null;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await result.current.requestChangeToBlockchain(Blockchain.ETHEREUM);
      expect(request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
    });

    it('adds the chain when the wallet reports it is missing (4902)', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') throw { code: 4902, message: 'Unrecognized chain' };
        if (method === 'wallet_addEthereumChain') return null;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await result.current.requestChangeToBlockchain(Blockchain.ETHEREUM);
      expect(mockToChainObject).toHaveBeenCalledWith(Blockchain.ETHEREUM);
      expect(request).toHaveBeenCalledWith({
        method: 'wallet_addEthereumChain',
        params: [ETH_CHAIN],
      });
    });

    it('does not add a chain when switch fails without a 4902 payload', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') throw undefined;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toThrow(TypeError);
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_addEthereumChain' }));
    });

    it('rethrows a switch error that is neither pending nor a missing chain', async () => {
      const rpcError = { code: 123, message: 'switch failed' };
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') throw rpcError;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toBe(rpcError);
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_addEthereumChain' }));
    });

    it('maps a pending switch request to TranslatedError', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') throw { code: -32002, message: 'Already processing' };
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toBeInstanceOf(
        TranslatedError,
      );
      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toThrow(
        'There is already a request pending. Please confirm it in your MetaMask and retry.',
      );
    });
  });

  describe('sign', () => {
    it('signs the message with the connected address', async () => {
      installedProvider(mockRequest(async () => [TEST_ACCOUNT]));

      const { result } = renderHook(() => useMetaMask());
      mockPersonalSign.mockResolvedValue('0xsignature');

      await expect(result.current.sign(TEST_ACCOUNT, 'hello')).resolves.toBe('0xsignature');
      expect(mockPersonalSign).toHaveBeenCalledWith('hello', TEST_ACCOUNT, '');
    });

    it('maps a rejected signature to AbortError', async () => {
      installedProvider(mockRequest(async () => [TEST_ACCOUNT]));

      const { result } = renderHook(() => useMetaMask());
      mockPersonalSign.mockRejectedValue({ code: 4001, message: 'User rejected' });

      await expect(result.current.sign(TEST_ACCOUNT, 'hello')).rejects.toBeInstanceOf(AbortError);
    });

    it('rethrows a signature error that is not a user rejection or a pending request', async () => {
      const rpcError = { code: 123, message: 'sign failed' };
      installedProvider(mockRequest(async () => [TEST_ACCOUNT]));

      const { result } = renderHook(() => useMetaMask());
      mockPersonalSign.mockRejectedValue(rpcError);

      await expect(result.current.sign(TEST_ACCOUNT, 'hello')).rejects.toBe(rpcError);
    });
  });

  describe('addContract', () => {
    const token = {
      type: AssetType.TOKEN,
      blockchain: Blockchain.ETHEREUM,
      chainId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    } as Asset;

    it('switches chain and returns false when the asset lives on another network', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') return null;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.addContract(token, '<svg />', Blockchain.POLYGON)).resolves.toBe(false);
      expect(request).toHaveBeenCalledWith({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_watchAsset' }));
    });

    it('watches the ERC-20 with symbol, decimals and a data-URI image on the current chain', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_watchAsset') return true;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());
      tokenContract({
        symbol: () => ({ call: jest.fn().mockResolvedValue('USDC') }),
        decimals: () => ({ call: jest.fn().mockResolvedValue(6) }),
      });

      await expect(result.current.addContract(token, '<svg />', Blockchain.ETHEREUM)).resolves.toBe(true);
      expect(mockContract).toHaveBeenCalledWith(expect.any(Array), token.chainId);
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: {
              address: token.chainId,
              symbol: 'USDC',
              decimals: 6,
              image: `data:image/svg+xml;base64,${Buffer.from('<svg />').toString('base64')}`,
            },
          },
        }),
      );
    });
  });

  describe('readBalance', () => {
    const coin = { type: AssetType.COIN, blockchain: Blockchain.ETHEREUM } as Asset;
    const token = {
      type: AssetType.TOKEN,
      blockchain: Blockchain.ETHEREUM,
      chainId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    } as Asset;

    it('returns a zero balance when no address is given', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.readBalance(coin, undefined)).resolves.toEqual({ asset: coin, amount: 0 });
    });

    it('throws when no address is given and exceptions are requested', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.readBalance(coin, undefined, true)).rejects.toThrow('No address or asset provided');
    });

    it('returns a zero balance when the asset is missing', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.readBalance(undefined as unknown as Asset, TEST_ACCOUNT)).resolves.toEqual({
        asset: undefined,
        amount: 0,
      });
    });

    it('throws when the asset is missing and exceptions are requested', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.readBalance(undefined as unknown as Asset, TEST_ACCOUNT, true)).rejects.toThrow(
        'No address or asset provided',
      );
    });

    it('converts a coin wei balance with the default 18 decimals', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockResolvedValue('1000000000000000000');

      await expect(result.current.readBalance(coin, TEST_ACCOUNT)).resolves.toEqual({ asset: coin, amount: 1 });
    });

    it('converts a token balance using the contract decimals', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      tokenContract({
        decimals: () => ({ call: jest.fn().mockResolvedValue(6) }),
        balanceOf: () => ({ call: jest.fn().mockResolvedValue('2500000') }),
      });

      await expect(result.current.readBalance(token, TEST_ACCOUNT)).resolves.toEqual({ asset: token, amount: 2.5 });
    });

    it('returns a zero balance when a coin balance read throws synchronously', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockImplementation(() => {
        throw new Error('network');
      });

      await expect(result.current.readBalance(coin, TEST_ACCOUNT)).resolves.toEqual({ asset: coin, amount: 0 });
    });

    it('rethrows a synchronous coin balance failure when exceptions are requested', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockImplementation(() => {
        throw new Error('network');
      });

      await expect(result.current.readBalance(coin, TEST_ACCOUNT, true)).rejects.toThrow('network');
    });

    // getBalance().then() is returned without await, so a rejected RPC never enters the catch.
    it('propagates a rejected coin balance RPC instead of returning zero', async () => {
      const rpcError = new Error('rpc');
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockRejectedValue(rpcError);

      await expect(result.current.readBalance(coin, TEST_ACCOUNT)).rejects.toBe(rpcError);
    });

    it('propagates a rejected coin balance RPC when exceptions are requested', async () => {
      const rpcError = new Error('rpc');
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      mockGetBalance.mockRejectedValue(rpcError);

      await expect(result.current.readBalance(coin, TEST_ACCOUNT, true)).rejects.toBe(rpcError);
    });

    it('rethrows a token balance failure when exceptions are requested', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      tokenContract({
        decimals: () => ({ call: jest.fn().mockRejectedValue(new Error('network')) }),
      });

      await expect(result.current.readBalance(token, TEST_ACCOUNT, true)).rejects.toThrow('network');
    });

    it('returns a zero token balance when the contract call fails', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      tokenContract({
        decimals: () => ({ call: jest.fn().mockRejectedValue(new Error('network')) }),
      });

      await expect(result.current.readBalance(token, TEST_ACCOUNT)).resolves.toEqual({ asset: token, amount: 0 });
    });
  });

  describe('createTransaction', () => {
    const coin = { type: AssetType.COIN, blockchain: Blockchain.ETHEREUM } as Asset;
    const token = {
      type: AssetType.TOKEN,
      blockchain: Blockchain.ETHEREUM,
      chainId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    } as Asset;

    it('sends a coin transaction converting ether to wei', async () => {
      connectedProvider();
      const { result } = renderHook(() => useMetaMask());
      mockSendTransaction.mockResolvedValue({ transactionHash: '0xcoin' });

      await expect(result.current.createTransaction(new BigNumber(2), coin, TEST_ACCOUNT, '0xto')).resolves.toBe(
        '0xcoin',
      );
      expect(mockToWei).toHaveBeenCalledWith('2', 'ether');
      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: TEST_ACCOUNT,
          to: '0xto',
          value: '2',
          maxPriorityFeePerGas: null,
          maxFeePerGas: null,
        }),
      );
    });

    it('sends a coin transaction using the amount as wei when asked', async () => {
      connectedProvider();
      const { result } = renderHook(() => useMetaMask());
      mockSendTransaction.mockResolvedValue({ transactionHash: '0xwei' });

      await expect(
        result.current.createTransaction(new BigNumber(500), coin, TEST_ACCOUNT, '0xto', {
          isWeiAmount: true,
          gasPrice: 20,
        }),
      ).resolves.toBe('0xwei');
      expect(mockToWei).not.toHaveBeenCalled();
      expect(mockSendTransaction).toHaveBeenCalledWith(expect.objectContaining({ value: '500', gasPrice: 20 }));
    });

    it('sends a token transfer scaled by decimals', async () => {
      connectedProvider();
      const { result } = renderHook(() => useMetaMask());
      const send = jest.fn().mockResolvedValue({ transactionHash: '0xtoken' });
      const transfer = jest.fn().mockReturnValue({ send });
      mockContract.mockReturnValue({
        methods: {
          decimals: () => ({ call: jest.fn().mockResolvedValue(6) }),
          transfer,
        },
      });

      await expect(result.current.createTransaction(new BigNumber(1.5), token, TEST_ACCOUNT, '0xto')).resolves.toBe(
        '0xtoken',
      );
      expect(mockContract).toHaveBeenCalledWith(expect.any(Array), token.chainId);
      expect(transfer).toHaveBeenCalledWith('0xto', '1500000');
      expect(send).toHaveBeenCalledWith({
        from: TEST_ACCOUNT,
        maxPriorityFeePerGas: null,
        maxFeePerGas: null,
        gasPrice: undefined,
      });
    });

    it('sends a token transfer without scaling when the amount is already wei', async () => {
      connectedProvider();
      const { result } = renderHook(() => useMetaMask());
      const send = jest.fn().mockResolvedValue({ transactionHash: '0xraw' });
      const transfer = jest.fn().mockReturnValue({ send });
      const decimals = jest.fn();
      mockContract.mockReturnValue({
        methods: {
          decimals: () => ({ call: decimals }),
          transfer,
        },
      });

      await expect(
        result.current.createTransaction(new BigNumber(42), token, TEST_ACCOUNT, '0xto', { isWeiAmount: true }),
      ).resolves.toBe('0xraw');
      expect(decimals).not.toHaveBeenCalled();
      expect(transfer).toHaveBeenCalledWith('0xto', '42');
    });
  });

  describe('supportsEip5792Paymaster', () => {
    it('returns false when no account is connected', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [];
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when no wallet is injected', async () => {
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('returns false when the wallet rejects the capabilities request', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [TEST_ACCOUNT];
          if (method === 'wallet_getCapabilities') throw new Error('unsupported');
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it.each([
      ['no capabilities', null],
      ['an unknown chain', {}],
      ['no paymaster service', { '0x1': {} }],
      ['a paymaster that is not supported', { '0x1': { paymasterService: { supported: false } } }],
    ])('returns false for %s', async (_label, capabilities) => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [TEST_ACCOUNT];
          if (method === 'wallet_getCapabilities') return capabilities;
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(false);
    });

    it('reports paymaster support for the requested chain', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') return { '0x1': { paymasterService: { supported: true } } };
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.supportsEip5792Paymaster(1)).resolves.toBe(true);
      expect(request).toHaveBeenCalledWith({ method: 'wallet_getCapabilities', params: [TEST_ACCOUNT] });
    });
  });

  describe('sendCallsWithPaymaster', () => {
    const calls = [{ to: '0xto', data: '0xdata', value: '0x0' }];

    function paymasterRequest(
      status: { status: string; receipts?: Array<{ transactionHash: string }> } | string,
      sendResult: { id: string } | string,
    ) {
      return mockRequest(async ({ method, params }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') return { '0x1': { paymasterService: { supported: true } } };
        if (method === 'wallet_sendCalls') return sendResult;
        if (method === 'wallet_getCallsStatus') {
          expect(params?.[0]).toBe(typeof sendResult === 'string' ? sendResult : sendResult.id);
          return status;
        }
        return null;
      });
    }

    it('reports a missing wallet before sending gasless calls', async () => {
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'No wallet found',
      );
    });

    it('throws when no account is connected', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [];
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'No account connected',
      );
    });

    it('refuses gasless calls when the wallet does not support a paymaster', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') return { '0x1': { paymasterService: { supported: false } } };
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'Your wallet does not support gasless transactions. Please update MetaMask to v12.20+ and enable Smart Account.',
      );
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_sendCalls' }));
    });

    it('returns the confirmed transaction hash for a sponsored bundle', async () => {
      const request = paymasterRequest(
        { status: 'CONFIRMED', receipts: [{ transactionHash: '0xpaid' }] },
        { id: 'bundle-123' },
      );
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).resolves.toBe('0xpaid');
      expect(request).toHaveBeenCalledWith({
        method: 'wallet_sendCalls',
        params: [
          {
            version: '1.0',
            chainId: '0x1',
            from: TEST_ACCOUNT,
            calls: [{ to: '0xto', data: '0xdata', value: '0x0' }],
            capabilities: { paymasterService: { url: 'https://paymaster' } },
          },
        ],
      });
    });

    it('queries call status with the raw result when wallet_sendCalls returns no id', async () => {
      const request = paymasterRequest(
        { status: 'CONFIRMED', receipts: [{ transactionHash: '0xfromraw' }] },
        'raw-bundle-id',
      );
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).resolves.toBe('0xfromraw');
    });

    it('rejects when the sponsored bundle fails', async () => {
      const request = paymasterRequest({ status: 'FAILED' }, { id: 'bundle-failed' });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'Transaction failed',
      );
    });

    it('times out when call status never confirms', async () => {
      const request = paymasterRequest({ status: 'PENDING' }, { id: 'bundle-hang' });
      installedProvider(request);

      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number, ...args: unknown[]) => {
        if (ms === 1000) {
          fn();
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn, ms as number, ...(args as never[]));
      });

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).rejects.toThrow(
        'Transaction timeout - please check your wallet',
      );
    });
  });

  describe('signEip7702Authorization', () => {
    const authData = {
      contractAddress: '0xcontract',
      chainId: 1,
      nonce: 7,
      typedData: {
        domain: { name: 'Test' },
        types: { Authorization: [{ name: 'address', type: 'address' }] },
        primaryType: 'Authorization',
        message: { address: '0xcontract' },
      },
    };

    it('reports a missing wallet before signing an authorization', async () => {
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.signEip7702Authorization(authData)).rejects.toThrow('No wallet found');
    });

    it('throws when no account is connected', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [];
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.signEip7702Authorization(authData)).rejects.toThrow('No account connected');
    });

    it('splits the typed-data signature into r, s and yParity', async () => {
      const r = '11'.repeat(32);
      const s = '22'.repeat(32);
      const signature = `0x${r}${s}1c`;
      const request = mockRequest(async ({ method, params }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_signTypedData_v4') {
          expect(params?.[0]).toBe(TEST_ACCOUNT);
          expect(JSON.parse(params?.[1] as string)).toEqual(authData.typedData);
          return signature;
        }
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.signEip7702Authorization(authData)).resolves.toEqual({
        chainId: 1,
        address: '0xcontract',
        nonce: 7,
        r: `0x${r}`,
        s: `0x${s}`,
        yParity: 1,
      });
    });

    it('maps a rejected typed-data signature to AbortError', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_signTypedData_v4') throw { code: 4001, message: 'User rejected' };
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.signEip7702Authorization(authData)).rejects.toBeInstanceOf(AbortError);
    });
  });

  describe('getAccount empty result', () => {
    it('returns undefined when the provider has no accounts', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [];
          return null;
        }),
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.getAccount()).resolves.toBeUndefined();
    });
  });
});
