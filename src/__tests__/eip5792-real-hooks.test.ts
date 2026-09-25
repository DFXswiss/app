/**
 * EIP-5792 Real Hook Tests
 *
 * Tests the ACTUAL hook code in metamask.hook.ts with complete mocking.
 * Uses global mocks at module level to avoid React multiple-instance issues.
 */

// Test constants
const TEST_ACCOUNT = '0x1234567890123456789012345678901234567890';
const TEST_CHAIN_ID = 1;
const TEST_PAYMASTER_URL = 'https://api.pimlico.io/v2/ethereum/rpc?apikey=test';

// Mock ethereum request function - defined at module level
let mockEthereumRequest: jest.Mock;
let mockEthereumOn: jest.Mock;

// Setup window.ethereum BEFORE any imports
beforeAll(() => {
  mockEthereumRequest = jest.fn();
  mockEthereumOn = jest.fn();

  (window as any).ethereum = {
    isMetaMask: true,
    selectedAddress: TEST_ACCOUNT,
    chainId: '0x1',
    request: mockEthereumRequest,
    on: mockEthereumOn,
    removeListener: jest.fn(),
  };
});

// Mock @dfx.swiss/react
jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    ETHEREUM: 'Ethereum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    ARBITRUM: 'Arbitrum',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    SEPOLIA: 'Sepolia',
  },
  AssetType: {
    COIN: 'Coin',
    TOKEN: 'Token',
  },
}));

// Mock web3.hook
jest.mock('../hooks/web3.hook', () => ({
  useWeb3: () => ({
    toBlockchain: (chainId: number) => {
      const map: Record<number, string> = {
        1: 'Ethereum',
        10: 'Optimism',
        137: 'Polygon',
        42161: 'Arbitrum',
        8453: 'Base',
      };
      return map[chainId];
    },
    toChainHex: (blockchain: string) => {
      const map: Record<string, string> = {
        Ethereum: '0x1',
        Optimism: '0xa',
        Polygon: '0x89',
        Arbitrum: '0xa4b1',
        Base: '0x2105',
      };
      return map[blockchain];
    },
    toChainObject: () => undefined,
  }),
}));

// Mock Web3 - simplified, no window access
jest.mock('web3', () => {
  const mockAccount = '0x1234567890123456789012345678901234567890';
  const MockWeb3: any = function (this: any) {
    this.eth = {
      getAccounts: jest.fn().mockResolvedValue([mockAccount]),
      getChainId: jest.fn().mockResolvedValue(1),
      requestAccounts: jest.fn().mockResolvedValue([mockAccount]),
      getBalance: jest.fn().mockResolvedValue('1000000000000000000'),
      personal: { sign: jest.fn() },
      sendTransaction: jest.fn(),
      Contract: jest.fn().mockReturnValue({ methods: {} }),
    };
    this.utils = {
      toChecksumAddress: (addr: string) => addr,
      toHex: (val: number) => `0x${val.toString(16)}`,
      toWei: (val: string) => val,
      fromWei: (val: string) => val,
    };
  };
  MockWeb3.givenProvider = {};
  MockWeb3.utils = {
    toChecksumAddress: (addr: string) => addr,
    toHex: (val: number) => `0x${val.toString(16)}`,
    toWei: (val: string) => val,
    fromWei: (val: string) => val,
  };
  return MockWeb3;
});

// Mock react-device-detect
jest.mock('react-device-detect', () => ({
  isMobile: false,
}));

// Mock src/dto/safe.dto
jest.mock('src/dto/safe.dto', () => ({}));

// NOW import testing utilities and the hook
import { renderHook, act } from '@testing-library/react';
import { useMetaMask } from '../hooks/wallets/metamask.hook';

describe('EIP-5792 Real Hook Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset ethereum mock
    mockEthereumRequest = jest.fn();
    mockEthereumOn = jest.fn();

    (window as any).ethereum = {
      isMetaMask: true,
      selectedAddress: TEST_ACCOUNT,
      chainId: '0x1',
      request: mockEthereumRequest,
      on: mockEthereumOn,
      removeListener: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('useMetaMask - supportsEip5792Paymaster', () => {
    it('should return true when wallet supports paymaster on the chain', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return {
            '0x1': { paymasterService: { supported: true } },
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = false;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(1);
      });

      expect(supported).toBe(true);
      expect(mockEthereumRequest).toHaveBeenCalledWith({
        method: 'wallet_getCapabilities',
        params: [TEST_ACCOUNT],
      });
    });

    it('should return false when wallet does not support paymaster', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return {
            '0x1': { paymasterService: { supported: false } },
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = true;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(1);
      });

      expect(supported).toBe(false);
    });

    it('should return false when wallet_getCapabilities fails', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          throw new Error('Method not supported');
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = true;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(1);
      });

      expect(supported).toBe(false);
    });

    it('should return false when no account connected', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [];
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = true;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(1);
      });

      expect(supported).toBe(false);
    });

    it('should check correct chain hex for Optimism (chainId 10)', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return {
            '0xa': { paymasterService: { supported: true } },
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = false;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(10);
      });

      expect(supported).toBe(true);
    });

    it('should check correct chain hex for Polygon (chainId 137)', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return {
            '0x89': { paymasterService: { supported: true } },
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let supported = false;
      await act(async () => {
        supported = await result.current.supportsEip5792Paymaster(137);
      });

      expect(supported).toBe(true);
    });
  });

  describe('useMetaMask - sendCallsWithPaymaster', () => {
    const mockCalls = [
      {
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        data: '0xa9059cbb0000000000000000',
        value: '0x0',
      },
    ];

    it('should send transaction and return txHash on success', async () => {
      mockEthereumRequest.mockImplementation(async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          expect(params?.[0]).toMatchObject({
            version: '1.0',
            chainId: '0x1',
            from: TEST_ACCOUNT,
            capabilities: {
              paymasterService: { url: TEST_PAYMASTER_URL },
            },
          });
          return { id: 'bundle-123' };
        }
        if (method === 'wallet_getCallsStatus') {
          return {
            status: 'CONFIRMED',
            receipts: [{ transactionHash: '0xfinaltxhash' }],
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let txHash = '';
      await act(async () => {
        txHash = await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
      });

      expect(txHash).toBe('0xfinaltxhash');
    });

    it('should throw error when wallet does not support paymaster', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: false } } };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
        }),
      ).rejects.toThrow();
    });

    it('should handle user rejection (code 4001)', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          throw { code: 4001, message: 'User rejected the request' };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
        }),
      ).rejects.toThrow();
    });

    it('should handle pending request error (code -32002)', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          throw { code: -32002, message: 'Request already pending' };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
        }),
      ).rejects.toThrow();
    });

    it('should handle transaction failure', async () => {
      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          return { id: 'bundle-fail' };
        }
        if (method === 'wallet_getCallsStatus') {
          return { status: 'FAILED' };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      await expect(
        act(async () => {
          await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
        }),
      ).rejects.toThrow();
    });

    it('should poll for transaction status until confirmed', async () => {
      let pollCount = 0;

      mockEthereumRequest.mockImplementation(async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          return { id: 'bundle-poll' };
        }
        if (method === 'wallet_getCallsStatus') {
          pollCount++;
          if (pollCount < 3) {
            return { status: 'PENDING' };
          }
          return {
            status: 'CONFIRMED',
            receipts: [{ transactionHash: '0xpolledtxhash' }],
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      let txHash = '';
      await act(async () => {
        txHash = await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
      });

      expect(txHash).toBe('0xpolledtxhash');
      expect(pollCount).toBeGreaterThanOrEqual(3);
    }, 15000);

    it('should format calls correctly in wallet_sendCalls', async () => {
      let capturedParams: any;

      mockEthereumRequest.mockImplementation(async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_accounts') return [TEST_ACCOUNT];
        if (method === 'wallet_getCapabilities') {
          return { '0x1': { paymasterService: { supported: true } } };
        }
        if (method === 'wallet_sendCalls') {
          capturedParams = params;
          return { id: 'bundle-format' };
        }
        if (method === 'wallet_getCallsStatus') {
          return {
            status: 'CONFIRMED',
            receipts: [{ transactionHash: '0xtxhash' }],
          };
        }
        return null;
      });

      const { result } = renderHook(() => useMetaMask());

      await act(async () => {
        await result.current.sendCallsWithPaymaster(mockCalls, TEST_PAYMASTER_URL, TEST_CHAIN_ID);
      });

      expect(capturedParams[0]).toEqual({
        version: '1.0',
        chainId: '0x1',
        from: TEST_ACCOUNT,
        calls: [
          {
            to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            data: '0xa9059cbb0000000000000000',
            value: '0x0',
          },
        ],
        capabilities: {
          paymasterService: { url: TEST_PAYMASTER_URL },
        },
      });
    });
  });

  describe('useMetaMask - isInstalled and getWalletType', () => {
    it('should detect MetaMask installation', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
    });

    it('should return MetaMask wallet type', () => {
      const { result } = renderHook(() => useMetaMask());
      expect(result.current.getWalletType()).toBe('MetaMask');
    });

    it('should return false when ethereum not available', () => {
      delete (window as any).ethereum;

      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(false);
    });

    it('should detect Rabby wallet', () => {
      (window as any).ethereum = {
        isRabby: true,
        request: mockEthereumRequest,
        on: mockEthereumOn,
      };

      const { result } = renderHook(() => useMetaMask());
      expect(result.current.isInstalled()).toBe(true);
      expect(result.current.getWalletType()).toBe('Rabby');
    });
  });

  describe('Multi-chain EIP-5792 Support', () => {
    const chains = [
      { name: 'Ethereum', chainId: 1, chainHex: '0x1' },
      { name: 'Optimism', chainId: 10, chainHex: '0xa' },
      { name: 'Polygon', chainId: 137, chainHex: '0x89' },
      { name: 'Arbitrum', chainId: 42161, chainHex: '0xa4b1' },
      { name: 'Base', chainId: 8453, chainHex: '0x2105' },
    ];

    for (const chain of chains) {
      it(`should correctly format chainId for ${chain.name}`, () => {
        const formatted = `0x${chain.chainId.toString(16)}`;
        expect(formatted).toBe(chain.chainHex);
      });
    }
  });
});
