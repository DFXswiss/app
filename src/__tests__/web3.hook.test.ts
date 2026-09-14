/**
 * Tests for useWeb3 hook - chain id mapping and MetaMask chain objects
 */
import { renderHook } from '@testing-library/react';

jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
  },
}));

jest.mock('web3', () => {
  const MockWeb3: any = jest.fn();
  MockWeb3.utils = jest.requireActual('web3').utils;
  return MockWeb3;
});

import { Blockchain } from '@dfx.swiss/react';
import Web3 from 'web3';
import { useWeb3 } from '../hooks/web3.hook';

const chains: [Blockchain, string, string][] = [
  [Blockchain.ETHEREUM, '1', '0x1'],
  [Blockchain.SEPOLIA, '11155111', '0xaa36a7'],
  [Blockchain.BINANCE_SMART_CHAIN, '56', '0x38'],
  [Blockchain.ARBITRUM, '42161', '0xa4b1'],
  [Blockchain.OPTIMISM, '10', '0xa'],
  [Blockchain.POLYGON, '137', '0x89'],
  [Blockchain.BASE, '8453', '0x2105'],
  [Blockchain.GNOSIS, '100', '0x64'],
  [Blockchain.HAQQ, '11235', '0x2be3'],
  [Blockchain.CITREA, '4114', '0x1012'],
  [Blockchain.CITREA_TESTNET, '5115', '0x13fb'],
];

describe('useWeb3', () => {
  beforeEach(() => {
    // constructing Web3 throws, like with a conflicting injected wallet provider; only the static utils are usable
    // (set per test, because resetMocks clears mock implementations before each test)
    (Web3 as unknown as jest.Mock).mockImplementation(() => {
      throw new TypeError("'get' on proxy: property 'on' is a read-only and non-configurable data property");
    });
  });

  describe.each(chains)('%s', (blockchain: Blockchain, chainId: string, chainHex: string) => {
    it('should map the chain id both ways', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainId(blockchain)).toBe(chainId);
      expect(result.current.toBlockchain(chainId)).toBe(blockchain);
      expect(result.current.toBlockchain(+chainId)).toBe(blockchain);
    });

    it('should return the chain id as hex', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainHex(blockchain)).toBe(chainHex);
    });

    it('should return a complete chain object', () => {
      const { result } = renderHook(() => useWeb3());
      const chain = result.current.toChainObject(blockchain);

      expect(chain?.chainId).toBe(chainHex);
      expect(chain?.chainName).toEqual(expect.any(String));
      expect(chain?.nativeCurrency).toEqual({
        name: expect.any(String),
        symbol: expect.any(String),
        decimals: 18,
      });
      expect(chain?.rpcUrls).toEqual([expect.stringMatching(/^https:\/\//)]);
      expect(chain?.blockExplorerUrls).toEqual([expect.stringMatching(/^https:\/\//)]);
    });
  });

  describe('unsupported blockchain', () => {
    it('should return undefined for chain id, hex and chain object', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainId(Blockchain.BITCOIN)).toBeUndefined();
      expect(result.current.toChainHex(Blockchain.BITCOIN)).toBeUndefined();
      expect(result.current.toChainObject(Blockchain.BITCOIN)).toBeUndefined();
    });

    it('should return undefined for an unknown chain id', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toBlockchain(999999)).toBeUndefined();
    });
  });

  it('should not construct Web3 to convert a chain id', () => {
    const { result } = renderHook(() => useWeb3());

    expect(result.current.toChainHex(Blockchain.ETHEREUM)).toBe('0x1');
    expect(Web3).not.toHaveBeenCalled();
    expect(() => new (Web3 as any)()).toThrow('read-only and non-configurable');
  });

  it('should keep the same interface across renders', () => {
    const { result, rerender } = renderHook(() => useWeb3());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
