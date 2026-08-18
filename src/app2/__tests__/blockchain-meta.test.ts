jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SPARK: 'Spark',
    ARKADE: 'Arkade',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
    ETHEREUM: 'Ethereum',
    SEPOLIA: 'Sepolia',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    OPTIMISM: 'Optimism',
    ARBITRUM: 'Arbitrum',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    HAQQ: 'Haqq',
    LIQUID: 'Liquid',
    ARWEAVE: 'Arweave',
    CARDANO: 'Cardano',
    RAILGUN: 'Railgun',
    SOLANA: 'Solana',
    TRON: 'Tron',
    CITREA: 'Citrea',
    CITREA_TESTNET: 'CitreaTestnet',
    DEFICHAIN: 'DeFiChain',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import {
  CHAIN_NAME,
  POPULAR_ASSETS,
  STABLE_ASSETS,
  SWISS_ASSETS,
  TESTNET_CHAINS,
  chainName,
  hashColor,
  isBtcAsset,
  isStableAsset,
  isSwissAsset,
  isTestnetChain,
  mainnetOnly,
} from '../screens/trade/blockchain-meta';

describe('blockchain-meta', () => {
  it('names every known chain and falls back to the raw value', () => {
    expect(chainName(Blockchain.BITCOIN)).toBe('Bitcoin');
    expect(chainName(Blockchain.BINANCE_SMART_CHAIN)).toBe('BNB Chain');
    expect(chainName(Blockchain.INTERNET_COMPUTER)).toBe('Internet Computer');
    expect(chainName(Blockchain.CITREA_TESTNET)).toBe('Citrea Testnet');
    expect(chainName('UnknownChain' as Blockchain)).toBe('UnknownChain');
    expect(Object.keys(CHAIN_NAME).length).toBeGreaterThan(20);
  });

  it('filters test networks from a mixed list', () => {
    expect(isTestnetChain(Blockchain.SEPOLIA)).toBe(true);
    expect(isTestnetChain(Blockchain.CITREA_TESTNET)).toBe(true);
    expect(isTestnetChain(Blockchain.ETHEREUM)).toBe(false);
    expect(TESTNET_CHAINS.has(Blockchain.SEPOLIA)).toBe(true);
    expect(
      mainnetOnly([Blockchain.ETHEREUM, Blockchain.SEPOLIA, Blockchain.CITREA, Blockchain.CITREA_TESTNET]),
    ).toEqual([Blockchain.ETHEREUM, Blockchain.CITREA]);
  });

  it('returns a stable HSL color for a given seed', () => {
    expect(hashColor('USDT')).toMatch(/^hsl\(\d+, 58%, 34%\)$/);
    expect(hashColor('USDT')).toBe(hashColor('USDT'));
    expect(hashColor('BTC')).not.toBe(hashColor('ETH'));
    expect(hashColor('')).toBe('hsl(0, 58%, 34%)');
  });

  it('classifies popular, stable, Swiss and BTC tickers case-insensitively', () => {
    expect(POPULAR_ASSETS).toContain('BTC');
    expect(isStableAsset('usdt')).toBe(true);
    expect(isStableAsset('USDC.E')).toBe(true);
    expect(isStableAsset('ETH')).toBe(false);
    expect(STABLE_ASSETS.has('DAI')).toBe(true);
    expect(isSwissAsset('zchf')).toBe(true);
    expect(isSwissAsset('FRANKENCOIN')).toBe(true);
    expect(isSwissAsset('USDT')).toBe(false);
    expect(SWISS_ASSETS.has('FPS')).toBe(true);
    expect(isBtcAsset('BTC')).toBe(true);
    expect(isBtcAsset('cBTC')).toBe(true);
    expect(isBtcAsset('WBTC')).toBe(true);
    expect(isBtcAsset('ETH')).toBe(false);
  });
});
