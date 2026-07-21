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

// Mock react-device-detect
jest.mock('react-device-detect', () => ({
  isMobile: false,
}));

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
    });
  });
});
