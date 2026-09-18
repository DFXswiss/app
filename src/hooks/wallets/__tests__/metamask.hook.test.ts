/**
 * Tests for useMetaMask hook - Basic functionality
 *
 * Note: EIP-5792 flow logic is tested in src/__tests__/eip5792-flow.test.ts
 * with proper isolation. These tests focus on hook setup and wallet detection.
 */
import { act, renderHook, waitFor } from '@testing-library/react';

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
    toBlockchain: () => 'Ethereum',
    toChainHex: () => '0x1',
    toChainObject: () => undefined,
  }),
}));

// Mock Web3 — mirrors web3-core-requestmanager setProvider: a mere read of `.on` can throw,
// and currentProvider is only assigned if that read completes.
jest.mock('web3', () => {
  const instances: any[] = [];

  function applyProvider(instance: any, provider: any) {
    if (provider && provider.on && typeof provider.on === 'function') {
      provider.on('message', () => undefined);
    }
    instance.currentProvider = provider || null;
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
        toWei: (val: string) => val,
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

// Mock react-device-detect
jest.mock('react-device-detect', () => ({
  isMobile: false,
}));

import Web3 from 'web3';
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

describe('useMetaMask', () => {
  afterEach(() => {
    delete (window as any).ethereum;
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
      const request = jest.fn(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        return [];
      });
      (window as any).ethereum = createBraveLikeProvider(request);

      const { result } = renderHook(() => useMetaMask());
      const instance = lastWeb3Instance();

      expect(instance.currentProvider).not.toBeNull();
      expect(instance.currentProvider).toBeDefined();

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
});
