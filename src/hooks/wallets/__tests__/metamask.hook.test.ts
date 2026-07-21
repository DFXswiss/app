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

// Mock the viem client factories so hook logic (argument construction, error handling,
// amount math) can be tested without a real wallet/RPC endpoint.
const mockPublicClient = {
  getBalance: jest.fn(),
  readContract: jest.fn(),
  getChainId: jest.fn(),
  getGasPrice: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
};
const mockWalletClient = {
  getAddresses: jest.fn(),
  requestAddresses: jest.fn(),
  signMessage: jest.fn(),
  sendTransaction: jest.fn(),
  writeContract: jest.fn(),
};
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: () => mockPublicClient,
  createWalletClient: () => mockWalletClient,
}));

import BigNumber from 'bignumber.js';
import { useMetaMask } from '../metamask.hook';

const COIN_ASSET = { type: 'Coin', blockchain: 'Ethereum' } as any;
const TOKEN_ASSET = { type: 'Token', blockchain: 'Ethereum', chainId: '0xTokenAddress' } as any;
const TEST_ADDRESS = '0x1234567890123456789012345678901234567890';

describe('useMetaMask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  describe('readBalance', () => {
    beforeEach(() => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
    });

    it('reads a native coin balance', async () => {
      mockPublicClient.getBalance.mockResolvedValue(1_500000000000000000n); // 1.5 ETH in wei

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(COIN_ASSET, TEST_ADDRESS);

      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({ address: TEST_ADDRESS });
      expect(balance.amount).toBeCloseTo(1.5);
    });

    it('reads an ERC20 token balance using its own decimals', async () => {
      mockPublicClient.readContract.mockImplementation(({ functionName }: { functionName: string }) => {
        if (functionName === 'decimals') return Promise.resolve(6);
        if (functionName === 'balanceOf') return Promise.resolve(2_500000n); // 2.5 tokens at 6 decimals
        throw new Error(`unexpected call: ${functionName}`);
      });

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(TOKEN_ASSET, TEST_ADDRESS);

      expect(balance.amount).toBeCloseTo(2.5);
    });

    it('falls back to a zero balance instead of throwing when throwExceptions is not set', async () => {
      mockPublicClient.getBalance.mockRejectedValue(new Error('RPC unavailable'));

      const { result } = renderHook(() => useMetaMask());
      const balance = await result.current.readBalance(COIN_ASSET, TEST_ADDRESS);

      expect(balance).toEqual({ asset: COIN_ASSET, amount: 0 });
    });

    it('propagates the error when throwExceptions is true', async () => {
      mockPublicClient.getBalance.mockRejectedValue(new Error('RPC unavailable'));

      const { result } = renderHook(() => useMetaMask());
      await expect(result.current.readBalance(COIN_ASSET, TEST_ADDRESS, true)).rejects.toThrow('RPC unavailable');
    });
  });

  describe('createTransaction', () => {
    beforeEach(() => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValue({});
    });

    it('resolves the current network gas price and forces legacy pricing when no override is given', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(42n);
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      expect(mockPublicClient.getGasPrice).toHaveBeenCalled();
      const call = mockWalletClient.sendTransaction.mock.calls[0][0];
      expect(call.gasPrice).toBe(42n);
      expect(call.maxFeePerGas).toBeUndefined();
      expect(call.maxPriorityFeePerGas).toBeUndefined();
    });

    it('uses the provided gasPrice override instead of fetching the network gas price', async () => {
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS, {
        isWeiAmount: true,
        gasPrice: 99,
      });

      expect(mockPublicClient.getGasPrice).not.toHaveBeenCalled();
      const call = mockWalletClient.sendTransaction.mock.calls[0][0];
      expect(call.gasPrice).toBe(99n);
    });

    it('waits for the transaction to be mined before returning the hash', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1n);
      mockWalletClient.sendTransaction.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      const hash = await result.current.createTransaction(new BigNumber(1), COIN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: '0xhash' });
      expect(hash).toBe('0xhash');
    });

    it('sends an ERC20 transfer with the amount adjusted for the token decimals', async () => {
      mockPublicClient.getGasPrice.mockResolvedValue(1n);
      mockPublicClient.readContract.mockResolvedValue(6); // decimals
      mockWalletClient.writeContract.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useMetaMask());
      await result.current.createTransaction(new BigNumber(2.5), TOKEN_ASSET, TEST_ADDRESS, TEST_ADDRESS);

      const call = mockWalletClient.writeContract.mock.calls[0][0];
      expect(call.functionName).toBe('transfer');
      expect(call.args).toEqual([TEST_ADDRESS, 2_500000n]);
    });
  });

  describe('sign', () => {
    it('signs a message with the given account', async () => {
      (window as any).ethereum = { isMetaMask: true, request: jest.fn(), on: jest.fn() };
      mockWalletClient.signMessage.mockResolvedValue('0xsignature');

      const { result } = renderHook(() => useMetaMask());
      const signature = await result.current.sign(TEST_ADDRESS, 'hello');

      expect(mockWalletClient.signMessage).toHaveBeenCalledWith({ account: TEST_ADDRESS, message: 'hello' });
      expect(signature).toBe('0xsignature');
    });
  });
});
