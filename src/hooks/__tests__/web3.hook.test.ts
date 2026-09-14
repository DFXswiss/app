import { renderHook } from '@testing-library/react';

// Mock @dfx.swiss/react (ships untransformed ESM); values mirror the real Blockchain enum
jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import { useWeb3 } from '../web3.hook';

function setup() {
  const { result } = renderHook(() => useWeb3());
  return result.current;
}

describe('useWeb3', () => {
  describe('toBlockchain', () => {
    it('maps a numeric chain id', () => {
      expect(setup().toBlockchain(1)).toBe(Blockchain.ETHEREUM);
    });

    it('maps a decimal string chain id', () => {
      expect(setup().toBlockchain('137')).toBe(Blockchain.POLYGON);
    });

    it('maps a hex string chain id', () => {
      expect(setup().toBlockchain('0x38')).toBe(Blockchain.BINANCE_SMART_CHAIN);
    });

    it('returns undefined for an unknown chain id', () => {
      expect(setup().toBlockchain(999)).toBeUndefined();
    });
  });

  describe('toChainId', () => {
    it('returns the chain id of a mapped blockchain', () => {
      expect(setup().toChainId(Blockchain.ETHEREUM)).toBe('1');
    });

    it('returns undefined for an unmapped blockchain', () => {
      expect(setup().toChainId(Blockchain.BITCOIN)).toBeUndefined();
    });
  });

  describe('toChainHex', () => {
    it('returns the chain id as hex', () => {
      expect(setup().toChainHex(Blockchain.ARBITRUM)).toBe('0xa4b1');
    });

    it('returns undefined for an unmapped blockchain', () => {
      expect(setup().toChainHex(Blockchain.BITCOIN)).toBeUndefined();
    });
  });

  describe('toChainObject', () => {
    it('returns the full MetaMask chain parameters', () => {
      expect(setup().toChainObject(Blockchain.BINANCE_SMART_CHAIN)).toEqual({
        chainId: '0x38',
        chainName: 'BNB Smart Chain Mainnet',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'BNB',
          decimals: 18,
        },
        rpcUrls: ['https://bsc-dataseed.binance.org/'],
        blockExplorerUrls: ['https://bscscan.com/'],
      });
    });

    it.each([
      [Blockchain.ETHEREUM, '0x1', 'Ethereum Mainnet'],
      [Blockchain.SEPOLIA, '0xaa36a7', 'Ethereum Sepolia'],
      [Blockchain.BINANCE_SMART_CHAIN, '0x38', 'BNB Smart Chain Mainnet'],
      [Blockchain.ARBITRUM, '0xa4b1', 'Arbitrum One'],
      [Blockchain.OPTIMISM, '0xa', 'OP Mainnet'],
      [Blockchain.POLYGON, '0x89', 'Polygon Mainnet'],
      [Blockchain.BASE, '0x2105', 'Base'],
      [Blockchain.GNOSIS, '0x64', 'Gnosis'],
      [Blockchain.HAQQ, '0x2be3', 'Haqq Network'],
      [Blockchain.CITREA, '0x1012', 'Citrea'],
      [Blockchain.CITREA_TESTNET, '0x13fb', 'Citrea Testnet'],
    ])('describes %s with chain id %s', (blockchain, chainId, chainName) => {
      expect(setup().toChainObject(blockchain)).toMatchObject({ chainId, chainName });
    });

    it('returns undefined for an unmapped blockchain', () => {
      expect(setup().toChainObject(Blockchain.BITCOIN)).toBeUndefined();
    });
  });
});
