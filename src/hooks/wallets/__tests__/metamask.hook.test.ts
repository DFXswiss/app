/**
 * Tests for useMetaMask hook - Basic functionality
 *
 * Note: EIP-5792 flow logic is tested in src/__tests__/eip5792-flow.test.ts
 * with proper isolation. These tests focus on hook setup and wallet detection.
 */
import { renderHook } from '@testing-library/react';

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

// Mock Web3
jest.mock('web3', () => {
  const MockWeb3: any = jest.fn().mockImplementation(() => ({
    eth: {
      getAccounts: jest.fn().mockResolvedValue([]),
      getChainId: jest.fn().mockResolvedValue(1),
      requestAccounts: jest.fn().mockResolvedValue([]),
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
  }));
  MockWeb3.givenProvider = {};
  MockWeb3.utils = {
    toChecksumAddress: (addr: string) => addr,
    toHex: (val: number) => `0x${val.toString(16)}`,
    toWei: (val: string) => val,
  };
  return MockWeb3;
});

// Mock react-device-detect
jest.mock('react-device-detect', () => ({
  isMobile: false,
}));

import Web3 from 'web3';
import { useMetaMask } from '../metamask.hook';

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
    it('should not throw when the injected provider breaks the Web3 constructor', () => {
      (window as any).ethereum = { isMetaMask: true };
      (Web3 as unknown as jest.Mock).mockImplementationOnce(() => {
        throw new TypeError(
          "'get' on proxy: property 'on' is a read-only and non-configurable data property on the proxy target but the proxy did not return its actual value",
        );
      });

      const { result } = renderHook(() => useMetaMask());

      expect(result.current.isInstalled()).toBe(true);
      expect(result.current.getWalletType()).toBe('MetaMask');
      expect(Web3).toHaveBeenLastCalledWith();
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
