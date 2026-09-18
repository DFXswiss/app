/**
 * Tests for useMetaMask hook - Basic functionality
 *
 * Note: EIP-5792 flow logic is tested in src/__tests__/eip5792-flow.test.ts
 * with proper isolation. These tests focus on hook setup and wallet detection.
 */
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

const mockToBlockchain = jest.fn();
const mockToChainHex = jest.fn();
const mockToChainObject = jest.fn();
let mockIsMobile = false;

jest.mock('../../web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (...args: unknown[]) => mockToBlockchain(...args),
    toChainHex: (...args: unknown[]) => mockToChainHex(...args),
    toChainObject: (...args: unknown[]) => mockToChainObject(...args),
  }),
}));

// Mock Web3 — mirrors web3-core-requestmanager setProvider: currentProvider is
// assigned first, then `.on` is read. A mere read of `.on` can throw; that throw
// leaves the assigned provider in place (it does not roll the assignment back).
jest.mock('web3', () => {
  const instances: any[] = [];

  function applyProvider(instance: any, provider: any) {
    instance.currentProvider = provider || null;
    if (instance.currentProvider && instance.currentProvider.on && typeof instance.currentProvider.on === 'function') {
      instance.currentProvider.on('message', () => undefined);
    }
  }

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
      currentProvider: null,
      setProvider: (next: any) => applyProvider(instance, next),
      eth: {
        getAccounts: (cb?: any) =>
          invoke(
            cb,
            (async () => {
              const p = instance.currentProvider;
              if (!p) throw new Error('Provider not set or invalid');
              if (typeof p.request === 'function') {
                return (await p.request({ method: 'eth_accounts' })) ?? [];
              }
              return [];
            })(),
          ),
        getChainId: (cb?: any) =>
          invoke(
            cb,
            (async () => {
              const p = instance.currentProvider;
              if (!p) throw new Error('Provider not set or invalid');
              if (typeof p.request === 'function') {
                const result = await p.request({ method: 'eth_chainId' });
                return typeof result === 'string' ? parseInt(result, 16) : (result ?? 1);
              }
              return 1;
            })(),
          ),
        requestAccounts: async () => {
          const p = instance.currentProvider;
          if (!p) throw new Error('Provider not set or invalid');
          if (typeof p.request === 'function') {
            return (await p.request({ method: 'eth_requestAccounts' })) ?? [];
          }
          return [];
        },
        getBalance: jest.fn().mockResolvedValue('0'),
        personal: { sign: jest.fn() },
        sendTransaction: jest.fn(),
        Contract: jest.fn().mockReturnValue({ methods: {} }),
      },
      utils: {
        toChecksumAddress: (addr: string) => addr,
        toHex: (val: number) => `0x${val.toString(16)}`,
        toWei: jest.fn((val: string) => val),
      },
    };
    applyProvider(instance, provider);
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
import { act, renderHook, waitFor } from '@testing-library/react';
import BigNumber from 'bignumber.js';
import Web3 from 'web3';
import { AbortError } from '../../../util/abort-error';
import { TranslatedError } from '../../../util/translated-error';
import { useMetaMask } from '../metamask.hook';

const TEST_ACCOUNT = '0x1111111111111111111111111111111111111111';

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

const ETH_CHAIN = {
  chainId: '0x1',
  chainName: 'Ethereum Mainnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://rpc.example'],
  blockExplorerUrls: ['https://explorer.example'],
};

function mockRequest(handler: (args: { method: string; params?: any[] }) => any) {
  return jest.fn(async (args: { method: string; params?: any[] }) => handler(args));
}

function installedProvider(request: jest.Mock, extra: Record<string, unknown> = {}) {
  (window as any).ethereum = { isMetaMask: true, on: jest.fn(), request, ...extra };
}

function tokenContract(methods: Record<string, () => { call?: jest.Mock; send?: jest.Mock }>) {
  lastWeb3Instance().eth.Contract.mockReturnValue({ methods });
}

describe('useMetaMask', () => {
  beforeEach(() => {
    mockIsMobile = false;
    mockToBlockchain.mockReset();
    mockToChainHex.mockReset();
    mockToChainObject.mockReset();
    mockToBlockchain.mockImplementation(() => 'Ethereum');
    mockToChainHex.mockImplementation(() => '0x1');
    mockToChainObject.mockImplementation(() => ETH_CHAIN);
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
    it('binds a provider whose .on access throws and forwards RPC to it', async () => {
      const request = jest.fn(async function (this: { isMetaMask?: boolean }, { method }: { method: string }) {
        // Without fn.bind(provider) this is the empty wrapper, which has no isMetaMask.
        expect(this.isMetaMask).toBe(true);
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        return [];
      });
      const provider = createBraveLikeProvider(request);
      (window as any).ethereum = provider;

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
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });

    it('leaves currentProvider.on undefined so web3 polls instead of subscribing', () => {
      const request = jest.fn().mockResolvedValue([]);
      (window as any).ethereum = createBraveLikeProvider(request);

      renderHook(() => useMetaMask());
      const instance = lastWeb3Instance();

      expect(instance.currentProvider).not.toBeNull();
      expect(instance.currentProvider.on).toBeUndefined();
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
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' });
      expect(request).toHaveBeenCalledWith({ method: 'eth_chainId' });
    });

    it('still registers accountsChanged and chainChanged listeners when .on works', () => {
      const on = jest.fn();
      (window as any).ethereum = {
        isMetaMask: true,
        request: jest.fn().mockResolvedValue([]),
        on,
      };

      const { result } = renderHook(() => useMetaMask());
      result.current.register(jest.fn(), jest.fn());

      expect(on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
      expect(on).toHaveBeenCalledWith('chainChanged', expect.any(Function));
    });

    it('picks up a provider that appears after the first render', async () => {
      const { result } = renderHook(() => useMetaMask());
      const instance = lastWeb3Instance();
      expect(instance.currentProvider).toBeNull();

      const request = jest.fn(async () => [TEST_ACCOUNT]);
      (window as any).ethereum = { isMetaMask: true, request, on: jest.fn() };

      let account: string | undefined;
      await act(async () => {
        account = await result.current.getAccount();
      });

      expect(instance.currentProvider).not.toBeNull();
      expect(account).toBe(TEST_ACCOUNT);
      expect(request).toHaveBeenCalledWith({ method: 'eth_accounts' });
    });

    it('re-renders when a provider appears after mount via ethereum#initialized', () => {
      const seen: boolean[] = [];
      renderHook(() => {
        const mm = useMetaMask();
        seen.push(mm.isInstalled());
        return mm;
      });

      expect(seen).toEqual([false]);

      act(() => {
        (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
        window.dispatchEvent(new Event('ethereum#initialized'));
      });

      expect(seen).toEqual([false, true]);
    });

    it('re-renders when a provider appears after mount within the bind timeout', async () => {
      const seen: boolean[] = [];
      renderHook(() => {
        const mm = useMetaMask();
        seen.push(mm.isInstalled());
        return mm;
      });

      expect(seen).toEqual([false]);

      await act(async () => {
        (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(seen).toEqual([false, true]);
    });

    it('replaces the web3 provider-missing error with a readable message', async () => {
      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.getAccount()).rejects.toBeInstanceOf(TranslatedError);
      await expect(result.current.getAccount()).rejects.toThrow(
        'No wallet found. Please check your wallet extension or set one up, then reload this page.',
      );
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

    it('returns undefined for a Coinbase desktop inject that is neither Rabby nor MetaMask', () => {
      (window as any).ethereum = { isCoinbaseWallet: true };

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.isInstalled()).toBe(true);
      expect(result.current.getWalletType()).toBeUndefined();
    });
  });

  describe('register listener callbacks', () => {
    it('forwards accountsChanged and chainChanged to the registered callbacks', async () => {
      const on = jest.fn();
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [];
        if (method === 'eth_chainId') return '0x1';
        return null;
      });
      installedProvider(request, { on });

      const { result } = renderHook(() => useMetaMask());
      const onAccountChanged = jest.fn();
      const onBlockchainChanged = jest.fn();
      result.current.register(onAccountChanged, onBlockchainChanged);

      const accountsHandler = on.mock.calls.find((call: unknown[]) => call[0] === 'accountsChanged')?.[1];
      const chainHandler = on.mock.calls.find((call: unknown[]) => call[0] === 'chainChanged')?.[1];
      expect(accountsHandler).toEqual(expect.any(Function));
      expect(chainHandler).toEqual(expect.any(Function));

      act(() => accountsHandler([TEST_ACCOUNT]));
      expect(onAccountChanged).toHaveBeenCalledWith(TEST_ACCOUNT);

      act(() => accountsHandler([]));
      expect(onAccountChanged).toHaveBeenCalledWith(undefined);

      act(() => chainHandler('0x1'));
      expect(onBlockchainChanged).toHaveBeenCalledWith('Ethereum');
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
      result.current.register(onAccountChanged, jest.fn());

      await waitFor(() => expect(onAccountChanged).toHaveBeenCalledWith(undefined));
    });
  });

  describe('requestAccount and checkConnection', () => {
    it('returns the checksum account after a successful connection check', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_requestAccounts') return [TEST_ACCOUNT];
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).resolves.toBe(TEST_ACCOUNT);
      expect(request).toHaveBeenCalledWith({ method: 'eth_requestAccounts' });
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

    it('does not reload when the connection check fails with a non-timeout error', async () => {
      const reload = jest.fn();
      Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.requestAccount()).rejects.toBeInstanceOf(TranslatedError);
      expect(reload).not.toHaveBeenCalled();
    });

    it('maps user rejection of eth_requestAccounts to AbortError', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'eth_requestAccounts') {
          throw { code: 4001, message: 'User rejected the request' };
        }
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
      const request = mockRequest(async () => [TEST_ACCOUNT]);
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.getBalance.mockResolvedValue('1000');

      await expect(result.current.requestBalance(TEST_ACCOUNT)).resolves.toBe('1000');
      expect(lastWeb3Instance().eth.getBalance).toHaveBeenCalledWith(TEST_ACCOUNT);
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
        if (method === 'wallet_switchEthereumChain') {
          throw { code: 4902, message: 'Unrecognized chain' };
        }
        if (method === 'wallet_addEthereumChain') return null;
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await result.current.requestChangeToBlockchain(Blockchain.ETHEREUM);
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

      await expect(result.current.requestChangeToBlockchain(Blockchain.ETHEREUM)).rejects.toThrow();
      expect(request).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'wallet_addEthereumChain' }));
    });

    it('maps a pending switch request to TranslatedError', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'wallet_switchEthereumChain') {
          throw { code: -32002, message: 'Already processing' };
        }
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
      const request = mockRequest(async () => [TEST_ACCOUNT]);
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.personal.sign.mockResolvedValue('0xsignature');

      await expect(result.current.sign(TEST_ACCOUNT, 'hello')).resolves.toBe('0xsignature');
      expect(lastWeb3Instance().eth.personal.sign).toHaveBeenCalledWith('hello', TEST_ACCOUNT, '');
    });

    it('maps a rejected signature to AbortError', async () => {
      const request = mockRequest(async () => [TEST_ACCOUNT]);
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.personal.sign.mockRejectedValue({ code: 4001, message: 'User rejected' });

      await expect(result.current.sign(TEST_ACCOUNT, 'hello')).rejects.toBeInstanceOf(AbortError);
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
      lastWeb3Instance().eth.getBalance.mockResolvedValue('1000000000000000000');

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

    it('returns a zero balance when a coin balance read throws', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.getBalance.mockImplementation(() => {
        throw new Error('network');
      });

      await expect(result.current.readBalance(coin, TEST_ACCOUNT)).resolves.toEqual({ asset: coin, amount: 0 });
    });

    it('returns a zero balance when a coin balance RPC rejects', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.getBalance.mockRejectedValue(new Error('rpc'));

      await expect(result.current.readBalance(coin, TEST_ACCOUNT)).resolves.toEqual({ asset: coin, amount: 0 });
    });

    it('rethrows a coin balance RPC rejection when exceptions are requested', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.getBalance.mockRejectedValue(new Error('rpc'));

      await expect(result.current.readBalance(coin, TEST_ACCOUNT, true)).rejects.toThrow('rpc');
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
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.sendTransaction.mockResolvedValue({ transactionHash: '0xcoin' });

      await expect(result.current.createTransaction(new BigNumber(2), coin, TEST_ACCOUNT, '0xto')).resolves.toBe(
        '0xcoin',
      );
      expect(lastWeb3Instance().utils.toWei).toHaveBeenCalledWith('2', 'ether');
      expect(lastWeb3Instance().eth.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ from: TEST_ACCOUNT, to: '0xto', value: '2' }),
      );
    });

    it('sends a coin transaction using the amount as wei when asked', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      lastWeb3Instance().eth.sendTransaction.mockResolvedValue({ transactionHash: '0xwei' });

      await expect(
        result.current.createTransaction(new BigNumber(500), coin, TEST_ACCOUNT, '0xto', {
          isWeiAmount: true,
          gasPrice: 20,
        }),
      ).resolves.toBe('0xwei');
      expect(lastWeb3Instance().utils.toWei).not.toHaveBeenCalled();
      expect(lastWeb3Instance().eth.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ value: '500', gasPrice: 20 }),
      );
    });

    it('sends a token transfer scaled by decimals', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      const send = jest.fn().mockResolvedValue({ transactionHash: '0xtoken' });
      const transfer = jest.fn().mockReturnValue({ send });
      lastWeb3Instance().eth.Contract.mockReturnValue({
        methods: {
          decimals: () => ({ call: jest.fn().mockResolvedValue(6) }),
          transfer,
        },
      });

      await expect(result.current.createTransaction(new BigNumber(1.5), token, TEST_ACCOUNT, '0xto')).resolves.toBe(
        '0xtoken',
      );
      expect(transfer).toHaveBeenCalledWith('0xto', '1500000');
      expect(send).toHaveBeenCalledWith({
        from: TEST_ACCOUNT,
        maxPriorityFeePerGas: null,
        maxFeePerGas: null,
        gasPrice: undefined,
      });
    });

    it('sends a token transfer without scaling when the amount is already wei', async () => {
      installedProvider(mockRequest(async () => []));
      const { result } = renderHook(() => useMetaMask());
      const send = jest.fn().mockResolvedValue({ transactionHash: '0xraw' });
      const transfer = jest.fn().mockReturnValue({ send });
      const decimals = jest.fn();
      lastWeb3Instance().eth.Contract.mockReturnValue({
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

  describe('bindIfNeeded without setProvider', () => {
    it('leaves a late provider unbound when web3 has no setProvider', async () => {
      const { result } = renderHook(() => useMetaMask());
      delete lastWeb3Instance().setProvider;

      installedProvider(mockRequest(async () => [TEST_ACCOUNT]));

      await expect(result.current.getAccount()).rejects.toBeInstanceOf(TranslatedError);
    });

    it('still answers getAccount when provider.on throws on subscribe', async () => {
      installedProvider(
        mockRequest(async ({ method }) => {
          if (method === 'eth_accounts') return [TEST_ACCOUNT];
          return [];
        }),
        {
          on: jest.fn(() => {
            throw new Error('subscribe failed');
          }),
        },
      );

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.getAccount()).resolves.toBe(TEST_ACCOUNT);
    });
  });

  describe('supportsEip5792Paymaster without an account', () => {
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
  });

  describe('sendCallsWithPaymaster remaining branches', () => {
    const calls = [{ to: '0xto', data: '0xdata', value: '0x0' }];

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

    it('queries call status with the raw result when wallet_sendCalls returns no id', async () => {
      const request = mockRequest(async ({ method, params }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') return 'raw-bundle-id';
        if (method === 'wallet_getCallsStatus') {
          expect(params?.[0]).toBe('raw-bundle-id');
          return { status: 'CONFIRMED', receipts: [{ transactionHash: '0xfromraw' }] };
        }
        return null;
      });
      installedProvider(request);

      const { result } = renderHook(() => useMetaMask());

      await expect(result.current.sendCallsWithPaymaster(calls, 'https://paymaster', 1)).resolves.toBe('0xfromraw');
    });

    it('times out when call status never confirms', async () => {
      const request = mockRequest(async ({ method }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') return { id: 'bundle-hang' };
        if (method === 'wallet_getCallsStatus') return { status: 'PENDING' };
        return null;
      });
      installedProvider(request);

      const realSetTimeout = global.setTimeout;
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number, ...args: unknown[]) => {
        if (ms === 1000) {
          fn();
          return 0 as unknown as NodeJS.Timeout;
        }
        return realSetTimeout(fn, ms, ...args);
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
          expect(JSON.parse(params?.[1])).toEqual(authData.typedData);
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
