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
import { MetaMaskChainInterface, useWeb3 } from '../hooks/web3.hook';

interface ChainCase {
  blockchain: Blockchain;
  chainId: string;
  chain: MetaMaskChainInterface;
}

const ether = { name: 'Ether', symbol: 'ETH', decimals: 18 };
const cBtc = { name: 'Bitcoin', symbol: 'cBTC', decimals: 18 };

const chains: ChainCase[] = [
  {
    blockchain: Blockchain.ETHEREUM,
    chainId: '1',
    chain: {
      chainId: '0x1',
      chainName: 'Ethereum Mainnet',
      nativeCurrency: ether,
      rpcUrls: ['https://eth.llamarpc.com'],
      blockExplorerUrls: ['https://etherscan.io/'],
    },
  },
  {
    blockchain: Blockchain.SEPOLIA,
    chainId: '11155111',
    chain: {
      chainId: '0xaa36a7',
      chainName: 'Ethereum Sepolia',
      nativeCurrency: ether,
      rpcUrls: ['https://sepolia.drpc.org'],
      blockExplorerUrls: ['https://sepolia.etherscan.io/'],
    },
  },
  {
    blockchain: Blockchain.BINANCE_SMART_CHAIN,
    chainId: '56',
    chain: {
      chainId: '0x38',
      chainName: 'BNB Smart Chain Mainnet',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: ['https://bsc-dataseed.binance.org/'],
      blockExplorerUrls: ['https://bscscan.com/'],
    },
  },
  {
    blockchain: Blockchain.ARBITRUM,
    chainId: '42161',
    chain: {
      chainId: '0xa4b1',
      chainName: 'Arbitrum One',
      nativeCurrency: ether,
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io/'],
    },
  },
  {
    blockchain: Blockchain.OPTIMISM,
    chainId: '10',
    chain: {
      chainId: '0xa',
      chainName: 'OP Mainnet',
      nativeCurrency: ether,
      rpcUrls: ['https://mainnet.optimism.io'],
      blockExplorerUrls: ['https://optimistic.etherscan.io/'],
    },
  },
  {
    blockchain: Blockchain.POLYGON,
    chainId: '137',
    chain: {
      chainId: '0x89',
      chainName: 'Polygon Mainnet',
      nativeCurrency: { name: 'Matic Token', symbol: 'MATIC', decimals: 18 },
      rpcUrls: ['https://polygon-rpc.com/'],
      blockExplorerUrls: ['https://polygonscan.com/'],
    },
  },
  {
    blockchain: Blockchain.BASE,
    chainId: '8453',
    chain: {
      chainId: '0x2105',
      chainName: 'Base',
      nativeCurrency: ether,
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org/'],
    },
  },
  {
    blockchain: Blockchain.GNOSIS,
    chainId: '100',
    chain: {
      chainId: '0x64',
      chainName: 'Gnosis',
      nativeCurrency: { name: 'xDAI', symbol: 'xDAI', decimals: 18 },
      rpcUrls: ['https://rpc.gnosischain.com'],
      blockExplorerUrls: ['https://gnosisscan.io/'],
    },
  },
  {
    blockchain: Blockchain.HAQQ,
    chainId: '11235',
    chain: {
      chainId: '0x2be3',
      chainName: 'Haqq Network',
      nativeCurrency: { name: 'Islamic Coin', symbol: 'ISLM', decimals: 18 },
      rpcUrls: ['https://rpc.eth.haqq.network'],
      blockExplorerUrls: ['https://explorer.haqq.network/'],
    },
  },
  {
    blockchain: Blockchain.CITREA,
    chainId: '4114',
    chain: {
      chainId: '0x1012',
      chainName: 'Citrea',
      nativeCurrency: cBtc,
      rpcUrls: ['https://rpc.citreascan.com'],
      blockExplorerUrls: ['https://citreascan.com/'],
    },
  },
  {
    blockchain: Blockchain.CITREA_TESTNET,
    chainId: '5115',
    chain: {
      chainId: '0x13fb',
      chainName: 'Citrea Testnet',
      nativeCurrency: cBtc,
      rpcUrls: ['https://rpc.testnet.citreascan.com'],
      blockExplorerUrls: ['https://testnet.citreascan.com/'],
    },
  },
];

describe('useWeb3', () => {
  beforeEach(() => {
    // constructing Web3 throws, like with a conflicting injected wallet provider; only the static utils are usable
    // (set per test, because resetMocks clears mock implementations before each test)
    (Web3 as unknown as jest.Mock).mockImplementation(() => {
      throw new TypeError("'get' on proxy: property 'on' is a read-only and non-configurable data property");
    });
  });

  describe.each(chains)('$blockchain', ({ blockchain, chainId, chain }: ChainCase) => {
    it('should map the chain id both ways', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainId(blockchain)).toBe(chainId);
      expect(result.current.toBlockchain(chainId)).toBe(blockchain);
      expect(result.current.toBlockchain(+chainId)).toBe(blockchain);
    });

    it('should return the chain id as hex', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainHex(blockchain)).toBe(chain.chainId);
    });

    it('should return the chain object', () => {
      const { result } = renderHook(() => useWeb3());

      expect(result.current.toChainObject(blockchain)).toEqual(chain);
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
