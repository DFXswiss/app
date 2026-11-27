jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
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
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    DEFICHAIN: 'DeFiChain',
    ARWEAVE: 'Arweave',
    CARDANO: 'Cardano',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    SOLANA: 'Solana',
    TRON: 'Tron',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import { renderHook } from '@testing-library/react';
import { Protocol, useBlockchain } from '../hooks/blockchain.hook';

describe('useBlockchain', () => {
  it('marks Bitcoin regtest as a test network', () => {
    const { result } = renderHook(() => useBlockchain());
    const regtest = 'BitcoinRegtest' as Blockchain;

    expect(result.current.toString(regtest)).toBe('Bitcoin Regtest (test network)');
    expect(result.current.toMainToken(regtest)).toBe('BTC');
  });

  it('keeps the existing names, headers, protocols and main tokens', () => {
    const { result } = renderHook(() => useBlockchain());

    expect(result.current.toString(Blockchain.BITCOIN)).toBe('Bitcoin');
    expect(result.current.toString(Blockchain.SEPOLIA)).toBe('Sepolia Testnet');
    expect(result.current.toHeader(Blockchain.ETHEREUM)).toBe('Ethereum mainnet · ERC-20 token');
    expect(result.current.toProtocol(Blockchain.BINANCE_SMART_CHAIN)).toBe(Protocol.BEP_20);
    expect(result.current.toMainToken(Blockchain.POLYGON)).toBe('MATIC');
  });

  it('returns undefined for a chain without an entry', () => {
    const { result } = renderHook(() => useBlockchain());

    expect(result.current.toHeader(Blockchain.BITCOIN)).toBeUndefined();
  });
});
