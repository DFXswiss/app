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

import { Blockchain, type Asset } from '@dfx.swiss/react';
import {
  assetFor,
  availableAssets,
  chainsFor,
  groupAssets,
  heldBalance,
  isReachable,
  parseBalances,
  shownChainsFor,
} from '../screens/trade/asset-pool';
import type { TradeAsset } from '../screens/trade/types';

function asset(partial: Partial<Asset> & Pick<Asset, 'name' | 'blockchain'>): Asset {
  return {
    id: 1,
    description: '',
    buyable: true,
    sellable: true,
    comingSoon: false,
    ...partial,
  } as Asset;
}

describe('groupAssets', () => {
  it('groups by ticker, drops coming-soon / uncurated / testnet, and sorts by chain count', () => {
    const pool = groupAssets([
      asset({ id: 1, name: 'USDT', description: 'Tether', blockchain: Blockchain.ETHEREUM }),
      asset({ id: 2, name: 'USDT', blockchain: Blockchain.ARBITRUM }),
      asset({ id: 3, name: 'BTC', description: 'Bitcoin', blockchain: Blockchain.BITCOIN }),
      asset({ id: 4, name: 'USDT', blockchain: Blockchain.SEPOLIA }),
      asset({ id: 5, name: 'SPK', blockchain: Blockchain.SPARK }),
      asset({ id: 6, name: 'SOON', blockchain: Blockchain.ETHEREUM, comingSoon: true }),
      asset({ id: 7, name: 'USDT', blockchain: Blockchain.POLYGON }),
    ]);

    expect(pool.map((entry) => entry.code)).toEqual(['USDT', 'BTC']);
    expect(pool[0].description).toBe('Tether');
    expect(pool[0].chains.map((chain) => chain.blockchain)).toEqual([
      Blockchain.ETHEREUM,
      Blockchain.ARBITRUM,
      Blockchain.POLYGON,
    ]);
    expect(pool[1].description).toBe('Bitcoin');
  });

  it('uses the ticker as description when the API leaves it empty', () => {
    const [entry] = groupAssets([asset({ name: 'ETH', blockchain: Blockchain.ETHEREUM, description: '' })]);
    expect(entry.description).toBe('ETH');
  });
});

describe('capability filters', () => {
  const usdt: TradeAsset = {
    code: 'USDT',
    description: 'Tether',
    chains: [
      {
        blockchain: Blockchain.ETHEREUM,
        asset: asset({ name: 'USDT', blockchain: Blockchain.ETHEREUM, buyable: true, sellable: false }),
      },
      {
        blockchain: Blockchain.ARBITRUM,
        asset: asset({ name: 'USDT', blockchain: Blockchain.ARBITRUM, buyable: false, sellable: true }),
      },
    ],
  };
  const btc: TradeAsset = {
    code: 'BTC',
    description: 'Bitcoin',
    chains: [
      {
        blockchain: Blockchain.BITCOIN,
        asset: asset({ name: 'BTC', blockchain: Blockchain.BITCOIN, buyable: false, sellable: false }),
      },
    ],
  };

  it('keeps tokens that support the capability on at least one chain', () => {
    expect(availableAssets([usdt, btc], 'buy').map((tk) => tk.code)).toEqual(['USDT']);
    expect(availableAssets([usdt, btc], 'sell').map((tk) => tk.code)).toEqual(['USDT']);
  });

  it('resolves the capable chain and underlying asset', () => {
    expect(chainsFor(usdt, 'buy').map((c) => c.blockchain)).toEqual([Blockchain.ETHEREUM]);
    expect(chainsFor(usdt, 'sell').map((c) => c.blockchain)).toEqual([Blockchain.ARBITRUM]);
    expect(assetFor(usdt, Blockchain.ETHEREUM, 'buy')?.id).toBe(1);
    expect(assetFor(usdt, Blockchain.ETHEREUM, 'sell')).toBeUndefined();
    expect(assetFor(usdt, Blockchain.POLYGON, 'buy')).toBeUndefined();
  });
});

describe('wallet reachability', () => {
  const token: TradeAsset = {
    code: 'USDT',
    description: 'Tether',
    chains: [
      { blockchain: Blockchain.ETHEREUM, asset: asset({ name: 'USDT', blockchain: Blockchain.ETHEREUM }) },
      { blockchain: Blockchain.ARBITRUM, asset: asset({ name: 'USDT', blockchain: Blockchain.ARBITRUM }) },
      { blockchain: Blockchain.SEPOLIA, asset: asset({ name: 'USDT', blockchain: Blockchain.SEPOLIA }) },
    ],
  };

  it('treats an empty session as reachable on every chain', () => {
    expect(isReachable(Blockchain.ETHEREUM, undefined)).toBe(true);
    expect(isReachable(Blockchain.ETHEREUM, [])).toBe(true);
  });

  it('requires the chain to appear anywhere in the JWT list', () => {
    expect(isReachable(Blockchain.ARBITRUM, [Blockchain.ETHEREUM, Blockchain.ARBITRUM])).toBe(true);
    expect(isReachable(Blockchain.POLYGON, [Blockchain.ETHEREUM])).toBe(false);
  });

  it('lists only curated, reachable, capable chains', () => {
    expect(shownChainsFor(token, 'buy', undefined).map((c) => c.blockchain)).toEqual([
      Blockchain.ETHEREUM,
      Blockchain.ARBITRUM,
    ]);
    expect(shownChainsFor(token, 'buy', [Blockchain.ARBITRUM]).map((c) => c.blockchain)).toEqual([Blockchain.ARBITRUM]);
    expect(shownChainsFor(token, 'buy', [Blockchain.SOLANA])).toEqual([]);
  });
});

describe('parseBalances / heldBalance', () => {
  it('returns an empty map when the param is missing', () => {
    expect(parseBalances('')).toEqual({});
    expect(parseBalances('?foo=1')).toEqual({});
  });

  it('parses, uppercases and accumulates ticker amounts', () => {
    expect(parseBalances('?balances=1.5@btc,2@USDT,3@btc')).toEqual({ BTC: 4.5, USDT: 2 });
  });

  it('skips entries without a ticker or with a non-numeric amount', () => {
    expect(parseBalances('?balances=1@,abc@ETH,2@USDC')).toEqual({ USDC: 2 });
  });

  it('looks up a held amount case-insensitively', () => {
    expect(heldBalance({ BTC: 1.25 }, 'btc')).toBe(1.25);
    expect(heldBalance({ BTC: 1.25 }, 'ETH')).toBe(0);
  });
});
