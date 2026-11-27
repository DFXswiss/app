import { Blockchain } from '@dfx.swiss/react';
import { useMemo } from 'react';
import { BITCOIN_REGTEST } from '../util/test-network';

export interface BlockchainInterface {
  toHeader: (blockchain: Blockchain) => string;
  toProtocol: (blockchain: Blockchain) => Protocol;
  toMainToken: (blockchain: Blockchain) => string;
  toString: (blockchain: Blockchain) => string;
}

export enum Protocol {
  ERC_20 = 'ERC-20',
  BEP_20 = 'BEP-20',
}

interface BlockchainDefinitions {
  headings: Record<string, string>;
  protocols: Record<string, Protocol>;
  mainToken: Record<string, string>;
  stringValue: Record<string, string>;
}

export function useBlockchain(): BlockchainInterface {
  const definitions: BlockchainDefinitions = {
    headings: {
      [Blockchain.ETHEREUM]: 'Ethereum mainnet · ERC-20 token',
      [Blockchain.SEPOLIA]: 'Ethereum sepolia · ERC-20 token',
      [Blockchain.BINANCE_SMART_CHAIN]: 'BNB Chain · BEP-20 token',
      [Blockchain.ARBITRUM]: 'Arbitrum One · ERC-20 token',
      [Blockchain.OPTIMISM]: 'Optimism · ERC-20 token',
      [Blockchain.POLYGON]: 'Polygon · ERC-20 token',
      [Blockchain.BASE]: 'Base · ERC-20 token',
      [Blockchain.GNOSIS]: 'Gnosis · ERC-20 token',
      [Blockchain.HAQQ]: 'Haqq · ERC-20 token',
      [Blockchain.CITREA]: 'Citrea · ERC-20 token',
      [Blockchain.CITREA_TESTNET]: 'Citrea Testnet · ERC-20 token',
    },
    protocols: {
      [Blockchain.ETHEREUM]: Protocol.ERC_20,
      [Blockchain.SEPOLIA]: Protocol.ERC_20,
      [Blockchain.BINANCE_SMART_CHAIN]: Protocol.BEP_20,
      [Blockchain.ARBITRUM]: Protocol.ERC_20,
      [Blockchain.OPTIMISM]: Protocol.ERC_20,
      [Blockchain.POLYGON]: Protocol.ERC_20,
      [Blockchain.BASE]: Protocol.ERC_20,
      [Blockchain.GNOSIS]: Protocol.ERC_20,
      [Blockchain.HAQQ]: Protocol.ERC_20,
      [Blockchain.CITREA]: Protocol.ERC_20,
      [Blockchain.CITREA_TESTNET]: Protocol.ERC_20,
    },
    mainToken: {
      [Blockchain.ETHEREUM]: 'ETH',
      [Blockchain.SEPOLIA]: 'ETH',
      [Blockchain.BINANCE_SMART_CHAIN]: 'BNB',
      [Blockchain.ARBITRUM]: 'ETH',
      [Blockchain.OPTIMISM]: 'ETH',
      [Blockchain.POLYGON]: 'MATIC',
      [Blockchain.BASE]: 'ETH',
      [Blockchain.GNOSIS]: 'xDAI',
      [Blockchain.HAQQ]: 'ISLM',
      [Blockchain.CITREA]: 'cBTC',
      [Blockchain.CITREA_TESTNET]: 'cBTC',
      [BITCOIN_REGTEST]: 'BTC',
    },
    stringValue: {
      [Blockchain.ETHEREUM]: 'Ethereum',
      [Blockchain.SEPOLIA]: 'Sepolia Testnet',
      [Blockchain.BINANCE_SMART_CHAIN]: 'BNB Chain',
      [Blockchain.ARBITRUM]: 'Arbitrum',
      [Blockchain.OPTIMISM]: 'Optimism',
      [Blockchain.POLYGON]: 'Polygon',
      [Blockchain.BASE]: 'Base',
      [Blockchain.GNOSIS]: 'Gnosis',
      [Blockchain.HAQQ]: 'Haqq',
      [Blockchain.BITCOIN]: 'Bitcoin',
      [Blockchain.LIGHTNING]: 'Lightning',
      [Blockchain.DEFICHAIN]: 'DeFiChain',
      [Blockchain.ARWEAVE]: 'Arweave',
      [Blockchain.CARDANO]: 'Cardano',
      [Blockchain.FIRO]: 'Firo',
      [Blockchain.MONERO]: 'Monero',
      [Blockchain.ZANO]: 'Zano',
      [Blockchain.INTERNET_COMPUTER]: 'Internet Computer',
      [Blockchain.SOLANA]: 'Solana',
      [Blockchain.TRON]: 'Tron',
      [Blockchain.SPARK]: 'Spark',
      [Blockchain.ARKADE]: 'Arkade',
      [Blockchain.CITREA]: 'Citrea',
      [Blockchain.CITREA_TESTNET]: 'Citrea Testnet',
      // Not yet in the Blockchain enum of @dfx.swiss/react; the API serves it outside PRD only.
      [BITCOIN_REGTEST]: 'Bitcoin Regtest (test network)',
    },
  };

  return useMemo(
    () => ({
      toHeader: (blockchain: Blockchain) => definitions.headings[blockchain],
      toProtocol: (blockchain: Blockchain) => definitions.protocols[blockchain],
      toMainToken: (blockchain: Blockchain) => definitions.mainToken[blockchain],
      toString: (blockchain: Blockchain) => definitions.stringValue[blockchain],
    }),
    [],
  );
}
