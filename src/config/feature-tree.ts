import { Blockchain } from '@dfx.swiss/react';
import { WalletType } from '../contexts/wallet.context';
import { Page } from '../hooks/feature-tree.hook';

export const FeatureTree: Page[] = [
  // --- DEFAULT CONFIG --- //
  {
    id: 'home',
    dfxStyle: true,
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
      {
        id: 'swap',
        img: 'swap',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'swap',
          },
        },
      },
    ],
  },
  {
    id: 'buy',
    dfxStyle: true,
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
      {
        id: 'evm',
        img: 'evmchain',
        next: {
          page: 'buy-evm',
        },
      },
      {
        id: 'monero',
        img: 'monero',
        next: {
          page: 'wallets-cake',
          tiles: ['cake', 'monero-wallet', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.MONERO, assetOut: 'XMR' },
          },
        },
      },
      {
        id: 'zano',
        img: 'zano',
        next: {
          page: 'wallets-cake',
          tiles: ['cake', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ZANO, assetOut: 'ZANO' },
          },
        },
      },
      {
        id: 'solana',
        img: 'solanachain',
        next: {
          page: 'buy-solana',
        },
      },
      {
        id: 'tron',
        img: 'tron',
        next: {
          page: 'buy-tron',
        },
      },
    ],
  },
  {
    id: 'buy-evm',
    dfxStyle: true,
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'buy-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'buy-arbitrum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'buy-polygon',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'buy-optimism',
        },
      },
      {
        id: 'bsc',
        img: 'binancesmartchainchain',
        next: {
          page: 'buy-bsc',
        },
      },
      {
        id: 'base',
        img: 'basechain',
        next: {
          page: 'buy-base',
        },
      },
      {
        id: 'gnosis',
        img: 'gnosis',
        next: {
          page: 'buy-gnosis',
        },
      },
      {
        id: 'citrea',
        img: 'citrea',
        next: {
          page: 'buy-citrea',
        },
      },
    ],
  },
  {
    id: 'buy-ethereum',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-ethereum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersethereum',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-ethereum-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'buy-arbitrum',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-arbitrum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersarbitrum',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-arbitrum-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersarbitrum',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-optimism',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-optimism-stable',
        },
      },
      {
        id: 'other',
        img: 'othersoptimism',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-optimism-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersoptimism',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-base',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        disabled: true,
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-base-stable',
        },
      },
    ],
  },
  {
    id: 'buy-base-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        disabled: true,
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        disabled: true,
      },
    ],
  },
  {
    id: 'buy-polygon',
    dfxStyle: true,
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'POL' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-polygon-stable',
        },
      },
      {
        id: 'sand',
        img: 'sand',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'SAND' },
          },
        },
      },
    ],
  },
  {
    id: 'buy-polygon-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'buy-bsc',
    dfxStyle: true,
    tiles: [
      {
        id: 'bnb',
        img: 'bnb',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'BNB' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'buy-bsc-stable',
        },
      },
      {
        id: 'other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-bsc-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'buy-gnosis',
    dfxStyle: true,
    tiles: [
      {
        id: 'xdai',
        img: 'xdai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.GNOSIS, assetOut: 'xDAI' },
          },
        },
      },
    ],
  },
  {
    id: 'buy-citrea',
    dfxStyle: true,
    tiles: [
      {
        id: 'cbtc',
        img: 'cbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'cBTC' },
          },
        },
      },
      {
        id: 'jusd',
        img: 'jusd',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'JUSD' },
          },
        },
      },
      {
        id: 'ctusd',
        img: 'ctusd',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'ctUSD' },
          },
        },
      },
      {
        id: 'wbtce',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'WBTC.e' },
          },
        },
      },
      {
        id: 'usdte',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'USDT.e' },
          },
        },
      },
      {
        id: 'usdce',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'USDC.e' },
          },
        },
      },
      {
        id: 'juice',
        img: 'juice',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.CITREA, assetOut: 'JUICE' },
          },
        },
      },
    ],
  },
  {
    id: 'sell',
    dfxStyle: true,
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
      {
        id: 'evm',
        img: 'evmchain',
        next: {
          page: 'sell-evm',
        },
      },
      {
        id: 'monero',
        img: 'monero',
        next: {
          page: 'wallets-cake',
          tiles: ['cake', 'monero-wallet', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.MONERO, assetIn: 'XMR' },
          },
        },
      },
      {
        id: 'zano',
        img: 'zano',
        next: {
          page: 'wallets-cake',
          tiles: ['cake', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ZANO, assetIn: 'ZANO' },
          },
        },
      },
      {
        id: 'solana',
        img: 'solanachain',
        next: {
          page: 'sell-solana',
        },
      },
      {
        id: 'tron',
        img: 'tron',
        next: {
          page: 'sell-tron',
        },
      },
    ],
  },
  {
    id: 'sell-evm',
    dfxStyle: true,
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'sell-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'sell-arbitrum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'sell-polygon',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'sell-optimism',
        },
      },
      {
        id: 'bsc',
        img: 'binancesmartchainchain',
        next: {
          page: 'sell-bsc',
        },
      },
      {
        id: 'base',
        img: 'basechain',
        next: {
          page: 'sell-base',
        },
      },
      {
        id: 'gnosis',
        img: 'gnosis',
        next: {
          page: 'sell-gnosis',
        },
      },
      {
        id: 'citrea',
        img: 'citrea',
        next: {
          page: 'sell-citrea',
        },
      },
    ],
  },
  {
    id: 'sell-ethereum',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-ethereum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersethereum',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'sell-ethereum-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-arbitrum',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-arbitrum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersarbitrum',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'sell-arbitrum-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-optimism',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-optimism-stable',
        },
      },
      {
        id: 'other',
        img: 'othersoptimism',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'sell-optimism-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        disabled: true,
      },
      {
        id: 'xchf',
        img: 'xchf',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'XCHF' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-base',
    dfxStyle: true,
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BASE, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        disabled: true,
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-base-stable',
        },
      },
    ],
  },
  {
    id: 'sell-base-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BASE, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BASE, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        disabled: true,
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        disabled: true,
      },
    ],
  },
  {
    id: 'sell-polygon',
    dfxStyle: true,
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-polygon-stable',
        },
      },
      {
        id: 'sand',
        img: 'sand',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'SAND' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-polygon-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-bsc',
    dfxStyle: true,
    tiles: [
      {
        id: 'bnb',
        img: 'bnb',
        next: {
          page: 'wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'BNB' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'sell-bsc-stable',
        },
      },
      {
        id: 'other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'sell-bsc-stable',
    dfxStyle: true,
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'sell-gnosis',
    dfxStyle: true,
    tiles: [
      {
        id: 'xdai',
        img: 'xdai',
        next: {
          page: 'wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.GNOSIS, assetIn: 'xDAI' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-citrea',
    dfxStyle: true,
    tiles: [
      {
        id: 'cbtc',
        img: 'cbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'cBTC' },
          },
        },
      },
      {
        id: 'jusd',
        img: 'jusd',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'JUSD' },
          },
        },
      },
      {
        id: 'ctusd',
        img: 'ctusd',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'ctUSD' },
          },
        },
      },
      {
        id: 'wbtce',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'WBTC.e' },
          },
        },
      },
      {
        id: 'usdte',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'USDT.e' },
          },
        },
      },
      {
        id: 'usdce',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'USDC.e' },
          },
        },
      },
      {
        id: 'juice',
        img: 'juice',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.CITREA, assetIn: 'JUICE' },
          },
        },
      },
    ],
  },

  // --- LOGIN  --- //
  {
    id: 'login',
    header: 'Login',
    dfxStyle: true,
    description: 'Login to DFX Services',
    tiles: [
      {
        id: 'login-with-crypto-wallet',
        img: 'cryptowallet',
        next: {
          page: 'wallets',
        },
      },

      {
        id: 'login-with-mail',
        img: 'mail',
        wallet: { type: WalletType.MAIL },
      },

      {
        id: 'login-with-passkey',
        img: 'key',
        feature: 'passkey',
        wallet: { type: WalletType.PASSKEY },
      },
    ],
  },

  // --- WALLETS --- //
  {
    id: 'wallets',
    tiles: [
      {
        id: 'dfx-wallet',
        img: 'bitcoinapp',
        wallet: { type: WalletType.DFX_TARO, blockchain: Blockchain.LIGHTNING },
      },
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'hw-wallet',
        img: 'hardwarewallets',
        next: {
          page: 'hw-wallets',
        },
      },
      {
        id: 'alby',
        img: 'alby',
        wallet: { type: WalletType.ALBY, blockchain: Blockchain.LIGHTNING },
      },
      {
        id: 'phantom-sol',
        img: 'phantom',
        wallet: { type: WalletType.PHANTOM_SOL, blockchain: Blockchain.SOLANA },
      },
      {
        id: 'trust-sol',
        img: 'trust',
        wallet: { type: WalletType.TRUST_SOL, blockchain: Blockchain.SOLANA },
      },
      {
        id: 'tronlink-trx',
        img: 'tronlink',
        wallet: { type: WalletType.TRONLINK_TRX, blockchain: Blockchain.TRON },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.BITCOIN:
              return { type: WalletType.CLI_BTC };
            case Blockchain.FIRO:
              return { type: WalletType.CLI_FIRO };
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            case Blockchain.INTERNET_COMPUTER:
              return { type: WalletType.CLI_ICP };
            case Blockchain.SOLANA:
              return { type: WalletType.CLI_SOL };
            case Blockchain.TRON:
              return { type: WalletType.CLI_TRX };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },
  {
    id: 'wallets-cake',
    tiles: [
      {
        id: 'cake',
        img: 'cake',
        wallet: {
          type: WalletType.CAKE,
        },
      },
      {
        id: 'monero-wallet',
        img: 'monerowallet',
        wallet: {
          type: WalletType.MONERO,
        },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },
  {
    id: 'tron-wallets', // TODO: join with normal wallets
    tiles: [
      {
        id: 'trust-trx',
        img: 'trust',
        wallet: { type: WalletType.TRUST_TRX, blockchain: Blockchain.TRON },
      },
      {
        id: 'tronlink-trx',
        img: 'tronlink',
        wallet: { type: WalletType.TRONLINK_TRX, blockchain: Blockchain.TRON },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: {
          type: WalletType.CLI_TRX,
        },
      },
    ],
  },
  {
    id: 'hw-wallets',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.BITBOX_BTC : WalletType.BITBOX_ETH,
        }),
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.TREZOR_BTC : WalletType.TREZOR_ETH,
        }),
      },
    ],
  },

  // --- Single Wallet Pages --- //
  {
    id: 'only-dfx-wallet',
    tiles: [
      {
        id: 'dfx-wallet',
        img: 'bitcoinapp',
        wallet: { type: WalletType.DFX_TARO, blockchain: Blockchain.LIGHTNING },
      },
    ],
  },
  {
    id: 'only-metamask-wallet',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
    ],
  },
  {
    id: 'only-walletconnect-wallet',
    tiles: [
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
    ],
  },
  {
    id: 'only-cli-wallet',
    tiles: [
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.BITCOIN:
              return { type: WalletType.CLI_BTC };
            case Blockchain.FIRO:
              return { type: WalletType.CLI_FIRO };
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            case Blockchain.INTERNET_COMPUTER:
              return { type: WalletType.CLI_ICP };
            case Blockchain.SOLANA:
              return { type: WalletType.CLI_SOL };
            case Blockchain.TRON:
              return { type: WalletType.CLI_TRX };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },
  {
    id: 'only-cake-wallet',
    tiles: [
      {
        id: 'cake',
        img: 'cake',
        disabled: true,
      },
    ],
  },
  {
    id: 'only-monero-wallet',
    tiles: [
      {
        id: 'monero-wallet',
        img: 'monerowallet',
        disabled: true,
      },
    ],
  },

  // --- BITCOIN ONLY --- //
  {
    id: 'bitcoinonly',
    tiles: [
      {
        id: 'bitcoinonly-buy',
        img: 'kaufen',
        next: {
          page: 'bitcoinonly-buy',
        },
      },
      {
        id: 'bitcoinonly-sell',
        img: 'verkaufen',
        next: {
          page: 'bitcoinonly-sell',
        },
      },
    ],
  },
  {
    id: 'bitcoinonly-buy',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
    ],
  },
  {
    id: 'bitcoinonly-sell',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['alby'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
    ],
  },
  // ---   Sunny-Decree --- //
  {
    id: 'sunnydecree',
    tiles: [
      {
        id: 'sunnydecree-buy',
        img: 'kaufenbitcoinlightningonly',
        next: {
          page: 'sunnydecree-buy',
        },
      },
      {
        id: 'sunnydecree-sell',
        img: 'verkaufen',
        next: {
          page: 'sunnydecree-sell',
        },
      },
    ],
  },
  {
    id: 'sunnydecree-buy',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
    ],
  },
  {
    id: 'sunnydecree-sell',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
    ],
  },
  {
    id: 'sunnydecree2',
    tiles: [
      {
        id: 'sunnydecree-buy',
        img: 'kaufenbitcoinlightningonly',
        next: {
          page: 'sunnydecree-buy',
        },
      },
      {
        id: 'sunnydecree-sell',
        img: 'verkaufen',
        next: {
          page: 'sunnydecree-sell',
        },
      },
    ],
  },
  {
    id: 'sunnydecree-buy',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.BITBOX_BTC : WalletType.BITBOX_ETH,
        }),
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.TREZOR_BTC : WalletType.TREZOR_ETH,
        }),
      },
    ],
  },
  {
    id: 'sunnydecree-sell',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['dfx-wallet', 'hw-wallet', 'alby'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
    ],
  },

  // --- FRANKENCOIN --- //
  {
    id: 'frankencoin',
    header: 'Frankencoin',
    description: 'Buy and sell Frankencoin Assets',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'frankencoin-buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'frankencoin-sell',
        },
      },
      {
        id: 'swap',
        img: 'swap',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'swap',
          },
        },
      },
    ],
  },

  {
    id: 'frankencoin-buy',
    header: 'Blockchain',
    description: 'Select a blockchain to buy Frankencoin Assets',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'frankencoin-buy-ethereum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'frankencoin-buy-polygon',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'frankencoin-buy-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'frankencoin-buy-optimism',
        },
      },
      {
        id: 'base',
        img: 'basechain',
        next: {
          page: 'frankencoin-buy-base',
        },
      },
    ],
  },

  {
    id: 'frankencoin-sell',
    header: 'Blockchain',
    description: 'Select a blockchain to sell Frankencoin Assets',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'frankencoin-sell-ethereum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'frankencoin-sell-polygon',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'frankencoin-sell-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'frankencoin-sell-optimism',
        },
      },
    ],
  },

  {
    id: 'frankencoin-buy-ethereum',
    header: 'Buy Frankencoin Assets on Ethereum',
    description: 'Buy Frankencoin Assets on Ethereum',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'fps',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'FPS' },
          },
        },
      },
    ],
  },

  {
    id: 'frankencoin-buy-polygon',
    header: 'Buy Frankencoin Assets on Polygon',
    description: 'Buy Frankencoin Assets on Polygon',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'POL' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'WFPS',
        img: 'polygonWFPS',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'WFPS' },
          },
        },
      },
    ],
  },

  {
    id: 'frankencoin-buy-arbitrum',
    header: 'Buy Frankencoin Assets on Arbitrum',
    description: 'Buy Frankencoin Assets on Arbitrum',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'fps',
        disabled: true,
      },
    ],
  },

  {
    id: 'frankencoin-buy-base',
    header: 'Buy Frankencoin Assets on Base',
    description: 'Buy Frankencoin Assets on Base',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'fps',
        disabled: true,
      },
    ],
  },

  {
    id: 'frankencoin-buy-optimism',
    header: 'Buy Frankencoin Assets on Optimism',
    description: 'Buy Frankencoin Assets on Optimism',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'fps',
        disabled: true,
      },
    ],
  },

  {
    id: 'frankencoin-sell-ethereum',
    header: 'Sell Frankencoin Assets on Ethereum',
    description: 'Sell Frankencoin Assets on Ethereum',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'fps',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'FPS' },
          },
        },
      },
    ],
  },

  {
    id: 'frankencoin-sell-polygon',
    header: 'Sell Frankencoin Assets on Polygon',
    description: 'Sell Frankencoin Assets on Polygon',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'polygonWFPS',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'WFPS' },
          },
        },
      },
    ],
  },

  {
    id: 'frankencoin-sell-arbitrum',
    header: 'Sell Frankencoin Assets on Arbitrum',
    description: 'Sell Frankencoin Assets on Arbitrum',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'polygonWFPS',
        disabled: true,
      },
    ],
  },

  {
    id: 'frankencoin-sell-optimism',
    header: 'Sell Frankencoin Assets on Optimism',
    description: 'Sell Frankencoin Assets on Optimism',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'ZCHF',
        img: 'frankencoin',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'ZCHF' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'frankencoin-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'FPS',
        img: 'polygonWFPS',
        disabled: true,
      },
    ],
  },

  {
    id: 'frankencoin-wallets',
    header: 'Frankencoin Assets',
    description: 'Buy and Sell Frankencoin Assets',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'hw-wallet',
        img: 'hardwarewallets',
        next: {
          page: 'frankencoin-hw-wallets',
        },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.BITCOIN:
              return { type: WalletType.CLI_BTC };
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            case Blockchain.SOLANA:
              return { type: WalletType.CLI_SOL };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },

  {
    id: 'frankencoin-hw-wallets',
    header: 'Frankencoin Assets',
    description: 'Buy and Sell Frankencoin Assets',
    bottomImage: 'https://dfx.swiss/images/app/frankencoin_services.jpg',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.BITBOX_BTC : WalletType.BITBOX_ETH,
        }),
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.TREZOR_BTC : WalletType.TREZOR_ETH,
        }),
      },
    ],
  },

  // --- dEURO --- //
  {
    id: 'deuro',
    header: 'dEURO',
    description: 'Buy and sell decentralized EURO Assets',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'deuro-buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'deuro-sell',
        },
      },
      {
        id: 'swap',
        img: 'swap',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'swap',
          },
        },
      },
    ],
  },

  {
    id: 'deuro-buy',
    header: 'Blockchain',
    description: 'Select a blockchain to buy dEURO Assets',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'deuro-buy-ethereum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'deuro-buy-polygon',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'deuro-buy-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'deuro-buy-optimism',
        },
      },
      {
        id: 'base',
        img: 'basechain',
        next: {
          page: 'deuro-buy-base',
        },
      },
    ],
  },

  {
    id: 'deuro-sell',
    header: 'Blockchain',
    description: 'Select a blockchain to sell dEURO Assets',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'deuro-sell-ethereum',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'deuro-sell-polygon',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'deuro-sell-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'deuro-sell-optimism',
        },
      },
    ],
  },

  {
    id: 'deuro-buy-ethereum',
    header: 'Buy dEURO Assets on Ethereum',
    description: 'Buy dEURO Assets on Ethereum',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'nDEPS',
        img: 'ndeps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'nDEPS' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DEPS' },
          },
        },
      },
    ],
  },

  {
    id: 'deuro-buy-polygon',
    header: 'Buy dEURO Assets on Polygon',
    description: 'Buy dEURO Assets on Polygon',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'POL' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'DEPS' },
          },
        },
      },
    ],
  },

  {
    id: 'deuro-buy-arbitrum',
    header: 'Buy dEURO Assets on Arbitrum',
    description: 'Buy dEURO Assets on Arbitrum',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        disabled: true,
      },
    ],
  },

  {
    id: 'deuro-buy-base',
    header: 'Buy dEURO Assets on Base',
    description: 'Buy dEURO Assets on Base',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BASE, assetOut: 'dEURO' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        disabled: true,
      },
    ],
  },

  {
    id: 'deuro-buy-optimism',
    header: 'Buy dEURO Assets on Optimism',
    description: 'Buy dEURO Assets on Optimism',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        disabled: true,
      },
    ],
  },

  {
    id: 'deuro-sell-ethereum',
    header: 'Sell dEURO Assets on Ethereum',
    description: 'Sell dEURO Assets on Ethereum',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'nDEPS',
        img: 'ndeps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'nDEPS' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'DEPS' },
          },
        },
      },
    ],
  },

  {
    id: 'deuro-sell-polygon',
    header: 'Sell dEURO Assets on Polygon',
    description: 'Sell dEURO Assets on Polygon',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'DEPS' },
          },
        },
      },
    ],
  },

  {
    id: 'deuro-sell-arbitrum',
    header: 'Sell dEURO Assets on Arbitrum',
    description: 'Sell dEURO Assets on Arbitrum',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        disabled: true,
      },
    ],
  },

  {
    id: 'deuro-sell-optimism',
    header: 'Sell dEURO Assets on Optimism',
    description: 'Sell dEURO Assets on Optimism',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'dEURO',
        img: 'deuro',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'dEURO' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'deuro-wallets',
          tiles: ['metamask', 'hw-wallet', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'DEPS',
        img: 'deps',
        disabled: true,
      },
    ],
  },

  {
    id: 'deuro-wallets',
    header: 'dEURO Assets',
    description: 'Buy and Sell dEURO Assets',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'hw-wallet',
        img: 'hardwarewallets',
        next: {
          page: 'deuro-hw-wallets',
        },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.BITCOIN:
              return { type: WalletType.CLI_BTC };
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            case Blockchain.SOLANA:
              return { type: WalletType.CLI_SOL };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },

  {
    id: 'deuro-hw-wallets',
    header: 'dEURO Assets',
    description: 'Buy and Sell dEURO Assets',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.BITBOX_BTC : WalletType.BITBOX_ETH,
        }),
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.TREZOR_BTC : WalletType.TREZOR_ETH,
        }),
      },
    ],
  },

  // --- ONLY BUY BITCOIN on HW --- //
  {
    id: 'bitcoin-hardwarewallets',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: { type: WalletType.BITBOX_BTC, blockchain: Blockchain.BITCOIN },
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: { type: WalletType.LEDGER_BTC, blockchain: Blockchain.BITCOIN },
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: { type: WalletType.TREZOR_BTC, blockchain: Blockchain.BITCOIN },
      },
    ],
  },

  // --- ONLY BUY BITCOIN with Trezor --- //
  {
    id: 'only-trezor',
    tiles: [
      {
        id: 'trezor',
        img: 'trezor',
        wallet: { type: WalletType.TREZOR_BTC, blockchain: Blockchain.BITCOIN },
      },
    ],
  },

  // --- ONLY BUY BITCOIN with Ledger --- //
  {
    id: 'only-ledger',
    tiles: [
      {
        id: 'ledger',
        img: 'ledger',
        wallet: { type: WalletType.LEDGER_BTC, blockchain: Blockchain.BITCOIN },
      },
    ],
  },

  // --- ONLY BUY BITCOIN with BitBox --- //
  {
    id: 'only-bitbox',
    tiles: [
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: { type: WalletType.BITBOX_BTC, blockchain: Blockchain.BITCOIN },
      },
    ],
  },

  // --- BITCOIN Lightning --- //

  {
    id: 'lightning-wallets',
    tiles: [
      {
        id: 'dfx-wallet',
        img: 'bitcoinapp',
        wallet: { type: WalletType.DFX_TARO, blockchain: Blockchain.LIGHTNING },
      },
      {
        id: 'alby',
        img: 'alby',
        wallet: { type: WalletType.ALBY, blockchain: Blockchain.LIGHTNING },
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.CLI_BTC : WalletType.CLI_ETH,
        }),
      },
    ],
  },

  // --- ALBY ONLY --- //
  {
    id: 'albyonly',
    header: 'Buy and sell with Alby',
    description: 'Buy and sell Bitcoin directly on your Alby Account!',
    bottomImage:
      'https://getalby.com/assets/alby-logo-head-da6c4355b69a3baac3fc306d47741c9394a825e54905ef67c5dd029146b89edf.svg',
    tiles: [
      {
        id: 'albyonly-buy',
        img: 'kaufen_simple',
        next: {
          page: 'wallets',
          tiles: ['alby'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.LIGHTNING, assetOut: 'BTC' },
          },
        },
      },
      {
        id: 'albyonly-sell',
        img: 'verkaufen_simple',
        next: {
          page: 'wallets',
          tiles: ['alby'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.LIGHTNING, assetIn: 'BTC' },
          },
        },
      },
    ],
  },

  // --- BitBox ONLY Buy --- //
  {
    id: 'bitboxonly-buy',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
      {
        id: 'erc20',
        img: 'ethereumarbitrumoptimismpolygon',
        next: {
          page: 'bitboxonly-buy-erc20',
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-erc20',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'bitboxonly-buy-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'bitboxonly-buy-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'bitboxonly-buy-optimism',
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-ethereum',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'bitboxonly-buy-ethereum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersethereum',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-ethereum-stable',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersethereum',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-arbitrum',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'bitboxonly-buy-arbitrum-stable',
        },
      },
      {
        id: 'other',
        img: 'othersarbitrum',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-arbitrum-stable',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersarbitrum',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-optimism',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'bitboxonly-buy-optimism-stable',
        },
      },
      {
        id: 'other',
        img: 'othersoptimism',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'bitboxonly-buy-optimism-stable',
    header: 'Buy Crypto',
    description: 'Buy Bitcoin and crypto directly on your BitBox!',
    bottomImage: 'https://bitbox.shop/media/__sized__/products/email-image-thumbnail-540x540-70.jpg',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'xchf',
        img: 'xchf',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'XCHF' },
          },
        },
      },
      {
        id: 'other',
        img: 'othersoptimism',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },

  // --- MARC STEINER --- //
  {
    id: 'marcsteiner',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'marcsteiner-buy',
        img: 'kaufen_simple',
        next: {
          page: 'marcsteiner-buy',
        },
      },
      {
        id: 'marcsteiner-sell',
        img: 'verkaufen_simple',
        next: {
          page: 'marcsteiner-sell',
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'marcsteiner-buy-bitcoin',
        img: 'bitcoinlightning_simple',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox', 'ledger'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
      {
        id: 'marcsteiner-buy-erc20',
        img: 'ethereumarbitrumoptimismpolygon_simple',
        next: {
          page: 'marcsteiner-buy-erc20',
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy-erc20',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'marcsteiner-buy-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'marcsteiner-buy-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'marcsteiner-buy-optimism',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'marcsteiner-buy-polygon',
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy-ethereum',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy-arbitrum',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy-optimism',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-buy-polygon',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'POL' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.POLYGON, assetOut: 'USDT' },
          },
        },
      },
    ],
  },

  {
    id: 'marcsteiner-sell',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'marcsteiner-sell-bitcoin',
        img: 'bitcoinlightning_simple',
        next: {
          page: 'hw-wallets',
          tiles: ['bitbox', 'ledger'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
      {
        id: 'marcsteiner-sell-erc20',
        img: 'ethereumarbitrumoptimismpolygon_simple',
        next: {
          page: 'marcsteiner-sell-erc20',
        },
      },
    ],
  },
  {
    id: 'marcsteiner-sell-erc20',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'marcsteiner-sell-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'marcsteiner-sell-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'marcsteiner-sell-optimism',
        },
      },
      {
        id: 'polygon',
        img: 'polygon',
        next: {
          page: 'marcsteiner-sell-polygon',
        },
      },
    ],
  },
  {
    id: 'marcsteiner-sell-ethereum',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-sell-arbitrum',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-sell-optimism',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'marcsteiner-sell-polygon',
    header: 'marcsteiner-consulting.ch',
    description: 'Kaufe und verkaufe Crypto direkt in Deine Wallet!',
    bottomImage: 'https://dfx.swiss/images/app/marcsteiner.png',
    tiles: [
      {
        id: 'pol',
        img: 'Pol',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'POL' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.POLYGON, assetIn: 'USDT' },
          },
        },
      },
    ],
  },

  // --- KEVIN SOELL --- //
  {
    id: 'kevinsoell',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'kevinsoell-buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'kevinsoell-sell',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BITCOIN, assetOut: 'BTC' },
          },
        },
      },
      {
        id: 'kevinsoell-buy-erc20',
        img: 'ethereumarbitrumoptimismpolygon',
        next: {
          page: 'kevinsoell-buy-erc20',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-erc20',
    tiles: [
      {
        id: 'ethereum',
        img: 'ethereum',
        next: {
          page: 'kevinsoell-buy-ethereum',
        },
      },
      {
        id: 'arbitrum',
        img: 'arbitrum',
        next: {
          page: 'kevinsoell-buy-arbitrum',
        },
      },
      {
        id: 'optimism',
        img: 'optimism',
        next: {
          page: 'kevinsoell-buy-optimism',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-ethereum',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'kevinsoell-buy-ethereum-stable',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-ethereum-stable',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'frankencoin',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-arbitrum',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'kevinsoell-buy-arbitrum-stable',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-arbitrum-stable',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'frankencoin',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ZCHF' },
          },
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-optimism',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'wbtc',
        img: 'wbtc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'stable',
        img: 'stablecoin',
        next: {
          page: 'kevinsoell-buy-optimism-stable',
        },
      },
    ],
  },
  {
    id: 'kevinsoell-buy-optimism-stable',
    tiles: [
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'dai',
        img: 'dai',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'DAI' },
          },
        },
      },
    ],
  },
  {
    id: 'kevinsoell-sell',
    tiles: [
      {
        id: 'bitcoin',
        img: 'bitcoinlightning',
        next: {
          page: 'wallets',
          tiles: ['alby'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BITCOIN, assetIn: 'BTC' },
          },
        },
      },
      {
        id: 'erc20',
        img: 'ethereumarbitrumoptimismpolygon',
        next: {
          page: 'sell-erc20',
        },
      },
    ],
  },

  // --- REALUNIT --- //
  {
    id: 'realunit',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'realunit-buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'realunit-sell',
        },
      },
    ],
  },
  {
    id: 'realunit-buy',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ZCHF' },
          },
        },
      },
    ],
  },

  {
    id: 'realunit-sell',
    tiles: [
      {
        id: 'eth',
        img: 'eth',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'zchf',
        img: 'frankencoin',
        next: {
          page: 'wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
    ],
  },

  // --- zkfinance --- //
  {
    id: 'zkfinance',
    header: 'zkfinance x DFX',
    description: 'Buy and sell Crypto directly on your zkfinance Account!',
    bottomImage:
      'https://uploads-ssl.webflow.com/639728e2c3052849296e109e/645e86ae7fc88f6bce87a001_assets%20ZKArtboard%205-p-500.png',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- thorwallet --- //
  {
    id: 'thorwallet',
    header: 'Thorwallet x DFX',
    description: 'Buy and sell Crypto directly on your Thorwallet Account!',
    bottomImage: 'https://miro.medium.com/v2/resize:fit:3000/0*87PlPSH1ksnMtdb9',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
    ],
  },
  // --- OnRamper --- //
  {
    id: 'onramper',
    header: 'OnRamper x DFX',
    description: 'Buy and sell crypto directly into your wallet!',
    bottomImage: 'https://dfx.swiss/images/app/OnRamper.jpg',
    tiles: [
      {
        id: 'dfx-wallet',
        img: 'bitcoinapp',
        wallet: { type: WalletType.DFX_TARO, blockchain: Blockchain.LIGHTNING },
      },
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
      {
        id: 'bitbox',
        img: 'bitbox',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.BITBOX_BTC : WalletType.BITBOX_ETH,
        }),
      },
      {
        id: 'ledger',
        img: 'ledger',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.LEDGER_BTC : WalletType.LEDGER_ETH,
        }),
      },
      {
        id: 'trezor',
        img: 'trezor',
        wallet: (params) => ({
          type: params.blockchain === Blockchain.BITCOIN ? WalletType.TREZOR_BTC : WalletType.TREZOR_ETH,
        }),
      },
      {
        id: 'cli',
        img: 'command',
        wallet: (params) => {
          switch (params.blockchain) {
            case Blockchain.BITCOIN:
              return { type: WalletType.CLI_BTC };
            case Blockchain.MONERO:
              return { type: WalletType.CLI_XMR };
            case Blockchain.ZANO:
              return { type: WalletType.CLI_ZANO };
            case Blockchain.SOLANA:
              return { type: WalletType.CLI_SOL };
            default:
              return { type: WalletType.CLI_ETH };
          }
        },
      },
    ],
  },

  //  --- Metamask --- //
  {
    id: 'metamask',
    header: 'Metamask x DFX',
    description: 'Buy and sell Crypto directly on your Metamask Wallet!',
    bottomImage: 'https://logowik.com/content/uploads/images/metamask4112.jpg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- Buy Fox Only --- //
  {
    id: 'buy-fox',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Fox Token directly on your Wallet!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK, blockchain: Blockchain.ETHEREUM },
      },
      {
        id: 'hw-wallet',
        img: 'hardwarewallets',
        next: {
          page: 'hw-wallets',
        },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT, blockchain: Blockchain.ETHEREUM },
      },
    ],
  },

  // --- Shapeshift --- //
  {
    id: 'shapeshift',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-buy',
        img: 'kaufen',
        next: {
          page: 'shapeshift-buy',
        },
      },
      {
        id: 'shapeshift-sell',
        img: 'verkaufen',
        next: {
          page: 'shapeshift-sell',
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-erc20',
        img: 'ethereumarbitrumoptimismpolygon',
        next: {
          page: 'shapeshift-buy-erc20',
        },
      },
      {
        id: 'shapeshift-bsc',
        img: 'binancesmartchain',
        next: {
          page: 'shapeshift-buy-bsc',
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-erc20',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-ethereum',
        img: 'ethereum',
        next: {
          page: 'shapeshift-buy-ethereum',
        },
      },
      {
        id: 'shapeshift-arbitrum',
        img: 'arbitrum',
        next: {
          page: 'shapeshift-buy-arbitrum',
        },
      },
      {
        id: 'shapeshift-optimism',
        img: 'optimism',
        next: {
          page: 'shapeshift-buy-optimism',
        },
      },
      {
        id: 'shapeshift-polygon',
        img: 'polygon',
        disabled: true,
      },
    ],
  },
  {
    id: 'shapeshift-buy-ethereum',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-buy-ethereum-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersethereum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-ethereum-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-usdc',
        img: 'usdc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersethereum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-arbitrum',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-buy-arbitrum-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersarbitrum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-arbitrum-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-usdc',
        img: 'usdc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersarbitrum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ARBITRUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-optimism',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-buy-optimism-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersoptimism',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-optimism-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-xchf',
        img: 'xchf',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: 'XCHF' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersoptimism',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['hw-wallet', 'metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.OPTIMISM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-bsc',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-bnb',
        img: 'bnb',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'BNB' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-buy-bsc-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-buy-bsc-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask', 'walletconnect', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-erc20',
        img: 'ethereumarbitrumoptimismpolygon',
        next: {
          page: 'shapeshift-sell-erc20',
        },
      },
      {
        id: 'shapeshift-bsc',
        img: 'binancesmartchain',
        next: {
          page: 'shapeshift-sell-bsc',
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-erc20',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-ethereum',
        img: 'ethereum',
        next: {
          page: 'shapeshift-sell-ethereum',
        },
      },
      {
        id: 'shapeshift-arbitrum',
        img: 'arbitrum',
        next: {
          page: 'shapeshift-sell-arbitrum',
        },
      },
      {
        id: 'shapeshift-optimism',
        img: 'optimism',
        next: {
          page: 'shapeshift-sell-optimism',
        },
      },
      {
        id: 'shapeshift-polygon',
        img: 'polygon',
        disabled: true,
      },
    ],
  },
  {
    id: 'shapeshift-sell-ethereum',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-sell-ethereum-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersethereum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-ethereum-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-usdc',
        img: 'usdc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersethereum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ETHEREUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-arbitrum',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'sell-arbitrum-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersarbitrum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-arbitrum-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-usdc',
        img: 'usdc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'USDC' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersarbitrum',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.ARBITRUM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-optimism',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-eth',
        img: 'eth',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'ETH' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-sell-optimism-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersoptimism',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-optimism-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-xchf',
        img: 'xchf',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: 'XCHF' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersoptimism',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.OPTIMISM, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-bsc',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-bnb',
        img: 'bnb',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'BNB' },
          },
        },
      },
      {
        id: 'shapeshift-wbtc',
        img: 'wbtc',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'WBTC' },
          },
        },
      },
      {
        id: 'shapeshift-stable',
        img: 'stablecoin',
        next: {
          page: 'shapeshift-sell-bsc-stable',
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-sell-bsc-stable',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'shapeshift-usdt',
        img: 'usdt',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'shapeshift-dai',
        img: 'dai',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: 'DAI' },
          },
        },
      },
      {
        id: 'shapeshift-other',
        img: 'othersbinancesmartchain',
        next: {
          page: 'shapeshift-wallets',
          tiles: ['metamask'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.BINANCE_SMART_CHAIN, assetIn: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'shapeshift-wallets',
    header: 'Shapeshift x DFX',
    description: 'Buy and sell Crypto directly on your Shapeshift Account!',
    bottomImage:
      'https://assets.website-files.com/5cec55545d0f47cfe2a39a8e/5e9aacff05bf3ab1bb0f86b4_ss-horizontal-light.png',
    tiles: [
      {
        id: 'metamask',
        img: 'metamaskrabby',
        wallet: { type: WalletType.META_MASK },
      },
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
    ],
  },

  // --- Liquity --- //
  {
    id: 'liquity',
    header: 'Liquity x DFX',
    description: 'Buy and sell Crypto directly on your Liquity Account!',
    bottomImage: 'https://uploads-ssl.webflow.com/5fd883457ba5da4c3822b02c/606a462c6889a25d00ccd9c6_logo-text.svg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- Bitget --- //
  {
    id: 'bitget',
    header: 'Bitget x DFX',
    description: 'Buy and sell Crypto directly on your Bitget Account!',
    bottomImage: 'https://www.bitget.com/micro-runtime/images/logo-dark.svg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- GMX --- //
  {
    id: 'gmx',
    header: 'GMX x DFX',
    description: 'Buy and sell Crypto directly on your GMX Account!',
    bottomImage: 'https://altcoinsbox.com/wp-content/uploads/2023/03/full-gmx-logo.png',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- Chainreport --- //
  {
    id: 'chainreport',
    header: 'Chainreport x DFX',
    description: 'Buy and sell Crypto directly on your Account!',
    bottomImage: 'https://dfx.swiss/images/app/chainreport.jpg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
      {
        id: 'chainreport',
        img: 'chainreport',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'csvexport',
        img: 'csvexport',
        next: {
          page: 'buy',
        },
      },
    ],
  },

  // --- LN Bits --- //
  {
    id: 'lnbits',
    header: 'LN Bits x DFX',
    description: 'Buy and sell Crypto directly on your LN Bits Account!',
    bottomImage: 'https://lnbits.com/assets/images/logo/logo.svg',
    tiles: [
      {
        id: 'buy',
        img: 'kaufen',
        next: {
          page: 'buy',
        },
      },
      {
        id: 'sell',
        img: 'verkaufen',
        next: {
          page: 'sell',
        },
      },
    ],
  },

  // --- Cake Wallet --- //
  {
    id: 'cakewallet',
    header: 'Cake Wallet x DFX',
    description: 'Buy and sell Crypto directly on your Cake Wallet!',
    bottomImage: 'https://cakewallet.com/assets/image/cake_wallet_logo.png',
    tiles: [
      {
        id: 'cakewallet-eth',
        img: 'eth',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'ETH' },
          },
        },
      },
      {
        id: 'cakewallet-wbtc',
        img: 'wbtc',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'WBTC' },
          },
        },
      },
      {
        id: 'cakewallet-stable',
        img: 'stablecoin',
        next: {
          page: 'cakewallet-buy-ethereum-stable',
        },
      },
      {
        id: 'cakewallet-other',
        img: 'othersethereum',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'cakewallet-buy-ethereum-stable',
    header: 'Cake Wallet x DFX',
    description: 'Buy and sell Crypto directly on your Cake Wallet!',
    bottomImage: 'https://cakewallet.com/assets/image/cake_wallet_logo.png',
    tiles: [
      {
        id: 'cakewallet-usdt',
        img: 'usdt',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'cakewallet-usdc',
        img: 'usdc',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'USDC' },
          },
        },
      },
      {
        id: 'cakewallet-dai',
        img: 'dai',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: 'DAI' },
          },
        },
      },
      {
        id: 'cakewallet-other',
        img: 'othersethereum',
        next: {
          page: 'cakewallet-wallets',
          tiles: ['walletconnect'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.ETHEREUM, assetOut: undefined },
          },
        },
      },
    ],
  },
  {
    id: 'cakewallet-wallets',
    header: 'Cake Wallet x DFX',
    description: 'Buy and sell Crypto directly on your Cake Wallet!',
    bottomImage: 'https://cakewallet.com/assets/image/cake_wallet_logo.png',
    tiles: [
      {
        id: 'walletconnect',
        img: 'walletconnect',
        wallet: { type: WalletType.WALLET_CONNECT },
      },
    ],
  },

  // --- SOLANA --- //
  {
    id: 'buy-solana',
    dfxStyle: true,
    tiles: [
      {
        id: 'solana',
        img: 'solana',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.SOLANA, assetOut: 'SOL' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.SOLANA, assetOut: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.SOLANA, assetOut: 'USDC' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-solana',
    dfxStyle: true,
    tiles: [
      {
        id: 'solana',
        img: 'solana',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.SOLANA, assetIn: 'SOL' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.SOLANA, assetIn: 'USDT' },
          },
        },
      },
      {
        id: 'usdc',
        img: 'usdc',
        next: {
          page: 'wallets',
          tiles: ['phantom-sol', 'trust-sol', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.SOLANA, assetIn: 'USDC' },
          },
        },
      },
    ],
  },

  // --- TRON --- //
  {
    id: 'buy-tron',
    dfxStyle: true,
    tiles: [
      {
        id: 'tron',
        img: 'trx',
        next: {
          page: 'tron-wallets',
          tiles: ['trust-trx', 'tronlink-trx', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.TRON, assetOut: 'TRX' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'tron-wallets',
          tiles: ['trust-trx', 'tronlink-trx', 'cli'],
          options: {
            service: 'buy',
            query: { blockchain: Blockchain.TRON, assetOut: 'USDT' },
          },
        },
      },
    ],
  },
  {
    id: 'sell-tron',
    dfxStyle: true,
    tiles: [
      {
        id: 'tron',
        img: 'trx',
        next: {
          page: 'tron-wallets',
          tiles: ['trust-trx', 'tronlink-trx', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.TRON, assetIn: 'TRX' },
          },
        },
      },
      {
        id: 'usdt',
        img: 'usdt',
        next: {
          page: 'tron-wallets',
          tiles: ['trust-trx', 'tronlink-trx', 'cli'],
          options: {
            service: 'sell',
            query: { blockchain: Blockchain.TRON, assetIn: 'USDT' },
          },
        },
      },
    ],
  },
];
