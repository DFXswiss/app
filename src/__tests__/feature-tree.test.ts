jest.mock('@dfx.swiss/react', () => ({
  Blockchain: {
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    GNOSIS: 'Gnosis',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    CITREA: 'Citrea',
    SOLANA: 'Solana',
    TRON: 'Tron',
    FIRO: 'Firo',
    MONERO: 'Monero',
    ZANO: 'Zano',
    INTERNET_COMPUTER: 'InternetComputer',
  },
}));

jest.mock('../contexts/wallet.context', () => ({
  WalletType: {
    META_MASK: 'MetaMask',
    LEDGER_BTC: 'LedgerBtc',
    LEDGER_ETH: 'LedgerEth',
    BITBOX_BTC: 'BitBoxBtc',
    BITBOX_ETH: 'BitBoxEth',
    TREZOR_BTC: 'TrezorBtc',
    TREZOR_ETH: 'TrezorEth',
    CLI_BTC: 'CliBtc',
    CLI_SPARK: 'CliSpark',
    CLI_ARK: 'CliArk',
    CLI_FIRO: 'CliFiro',
    CLI_XMR: 'CliXmr',
    CLI_ZANO: 'CliZano',
    CLI_ICP: 'CliIcp',
    CLI_ETH: 'CliEth',
    CLI_ADA: 'CliAda',
    CLI_AR: 'CliAr',
    CLI_LN: 'CliLn',
    CLI_SOL: 'CliSol',
    CLI_TRX: 'CliTrx',
    DFX_TARO: 'DfxTaro',
    WALLET_CONNECT: 'WalletConnect',
    CAKE: 'Cake',
    MONERO: 'Monero',
    PHANTOM_SOL: 'PhantomSol',
    TRUST_SOL: 'TrustSol',
    TRUST_TRX: 'TrustTrx',
    TRONLINK_TRX: 'TronLinkTrx',
    MAIL: 'Mail',
    ADDRESS: 'Address',
  },
}));

import { Blockchain } from '@dfx.swiss/react';
import { FeatureTree } from '../config/feature-tree';
import { WalletType } from '../contexts/wallet.context';

// Pre-existing data defect in the feature tree, reported in the pull request, not fixed here.
const KNOWN_DANGLING_ALLOW_LIST_IDS: string[] = [
  'shapeshift-buy-arbitrum-stable/shapeshift-dai -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum-stable/shapeshift-dai -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum-stable/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum-stable/shapeshift-other -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum-stable/shapeshift-usdc -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum-stable/shapeshift-usdc -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum-stable/shapeshift-usdt -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum-stable/shapeshift-usdt -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum/shapeshift-eth -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum/shapeshift-eth -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum/shapeshift-other -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-arbitrum/shapeshift-wbtc -> shapeshift-wallets: cli',
  'shapeshift-buy-arbitrum/shapeshift-wbtc -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-bsc-stable/shapeshift-dai -> shapeshift-wallets: cli',
  'shapeshift-buy-bsc-stable/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-bsc-stable/shapeshift-usdt -> shapeshift-wallets: cli',
  'shapeshift-buy-bsc/shapeshift-bnb -> shapeshift-wallets: cli',
  'shapeshift-buy-bsc/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-bsc/shapeshift-wbtc -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum-stable/shapeshift-dai -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum-stable/shapeshift-dai -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-ethereum-stable/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum-stable/shapeshift-other -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-ethereum-stable/shapeshift-usdc -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum-stable/shapeshift-usdc -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-ethereum-stable/shapeshift-usdt -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum-stable/shapeshift-usdt -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-ethereum/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum/shapeshift-other -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-ethereum/shapeshift-wbtc -> shapeshift-wallets: cli',
  'shapeshift-buy-ethereum/shapeshift-wbtc -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-optimism-stable/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-optimism-stable/shapeshift-other -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-optimism-stable/shapeshift-usdt -> shapeshift-wallets: cli',
  'shapeshift-buy-optimism-stable/shapeshift-usdt -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-optimism-stable/shapeshift-xchf -> shapeshift-wallets: cli',
  'shapeshift-buy-optimism-stable/shapeshift-xchf -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-optimism/shapeshift-eth -> shapeshift-wallets: cli',
  'shapeshift-buy-optimism/shapeshift-eth -> shapeshift-wallets: hw-wallet',
  'shapeshift-buy-optimism/shapeshift-other -> shapeshift-wallets: cli',
  'shapeshift-buy-optimism/shapeshift-other -> shapeshift-wallets: hw-wallet',
];

// Pre-existing data defect in the feature tree, reported in the pull request, not fixed here.
const KNOWN_DUPLICATE_PAGE_IDS: string[] = ['sunnydecree-buy', 'sunnydecree-sell'];

// Pre-existing data defect in the feature tree, reported in the pull request, not fixed here.
const KNOWN_MISSING_NEXT_PAGES: string[] = ['kevinsoell-sell/erc20 -> sell-erc20'];

interface TestTile {
  id: string;
  img: string;
  disabled?: boolean;
  next?: { page: string; tiles?: string[]; options?: { service?: string; query?: Record<string, string> } };
  wallet?: { type: string; blockchain?: string } | ((params: { blockchain?: string }) => { type: string });
}

interface TestPage {
  id: string;
  header?: string;
  description?: string;
  bottomImage?: string;
  tiles: TestTile[];
}

const pages = FeatureTree as unknown as TestPage[];

const blockchainVariants = [
  Blockchain.BITCOIN,
  Blockchain.FIRO,
  Blockchain.MONERO,
  Blockchain.ZANO,
  Blockchain.INTERNET_COMPUTER,
  Blockchain.SOLANA,
  Blockchain.TRON,
  Blockchain.ETHEREUM,
];

interface WalletSelectorTest {
  pageId: string;
  tileId: string;
  select: (params: { blockchain?: string }) => { type: string };
}

const walletSelectors: WalletSelectorTest[] = pages.flatMap((page) =>
  page.tiles
    .filter((tile) => typeof tile.wallet === 'function')
    .map((tile) => ({
      pageId: page.id,
      tileId: tile.id,
      select: tile.wallet as (params: { blockchain?: string }) => { type: string },
    })),
);

function walletTypeOf(tile: TestTile, blockchain: string): string | undefined {
  if (typeof tile.wallet === 'function') return tile.wallet({ blockchain }).type;
  return tile.wallet?.type;
}

describe('FeatureTree structure', () => {
  it('contains pages and tiles', () => {
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach((page) => {
      expect(page.id).toEqual(expect.any(String));
      expect(page.tiles.length).toBeGreaterThan(0);
    });
  });

  it('resolves every page referenced by a tile allow-list', () => {
    for (const page of pages) {
      for (const tile of page.tiles) {
        if (tile.next?.tiles == null) continue;

        const target = pages.find((candidate) => candidate.id === tile.next?.page);
        expect({ page: page.id, tile: tile.id, targetPage: tile.next?.page, resolved: target != null }).toEqual({
          page: page.id,
          tile: tile.id,
          targetPage: tile.next?.page,
          resolved: true,
        });
      }
    }
  });

  it('keeps every tile allow-list non-empty and free of unknown tile ids on its target page', () => {
    const dangling: string[] = [];

    for (const page of pages) {
      for (const tile of page.tiles) {
        const allowed = tile.next?.tiles;
        if (allowed == null) continue;

        expect(allowed.length).toBeGreaterThan(0);
        const targetPage = pages.find((candidate) => candidate.id === tile.next?.page) ?? pages[0];
        const targetTileIds = new Set(targetPage.tiles.map((candidate) => candidate.id));
        for (const allowedId of allowed) {
          if (!targetTileIds.has(allowedId)) {
            dangling.push(`${page.id}/${tile.id} -> ${targetPage.id}: ${allowedId}`);
          }
        }
      }
    }

    expect(dangling.sort()).toEqual(KNOWN_DANGLING_ALLOW_LIST_IDS);
  });

  it('has unique page ids except the known duplicates', () => {
    const ids = pages.map((page) => page.id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();

    expect(duplicates).toEqual(KNOWN_DUPLICATE_PAGE_IDS);
  });

  it('keeps no tile whose next page does not exist except the known one', () => {
    const knownPageIds = new Set(pages.map((page) => page.id));
    const missing: string[] = [];

    for (const page of pages) {
      for (const tile of page.tiles) {
        if (tile.next == null) continue;

        if (!knownPageIds.has(tile.next.page)) missing.push(`${page.id}/${tile.id} -> ${tile.next.page}`);
      }
    }

    expect(missing.sort()).toEqual(KNOWN_MISSING_NEXT_PAGES);
  });

  it('contains no Alby wallet type, image or id', () => {
    const offenders: string[] = [];

    pages.forEach((page) => {
      if (/alby/i.test(page.id)) offenders.push(`page ${page.id}`);
      page.tiles.forEach((tile) => {
        if (/alby/i.test(tile.id)) offenders.push(`tile ${tile.id}`);
        if (/alby/i.test(tile.img)) offenders.push(`img ${tile.img}`);
        blockchainVariants.forEach((blockchain) => {
          const type = walletTypeOf(tile, blockchain);
          if (type != null && /alby/i.test(type)) offenders.push(`wallet ${type}`);
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});

describe('FeatureTree wallet selectors', () => {
  it('defines selector functions', () => {
    expect(walletSelectors.length).toBeGreaterThan(0);
  });

  it('returns a known wallet type for every selector and blockchain input', () => {
    const knownTypes = Object.values(WalletType);

    for (const selector of walletSelectors) {
      for (const blockchain of blockchainVariants) {
        const wallet = selector.select({ blockchain });
        expect(wallet.type).toEqual(expect.any(String));
        expect(knownTypes).toContain(wallet.type);
      }
    }
  });

  it('selects the command line wallet for the main wallets page', () => {
    const page = pages.find((candidate) => candidate.id === 'wallets');
    const cli = page?.tiles.find((tile) => tile.id === 'cli');
    expect(cli).toBeDefined();

    expect(walletTypeOf(cli as TestTile, Blockchain.BITCOIN)).toBe(WalletType.CLI_BTC);
    expect(walletTypeOf(cli as TestTile, Blockchain.FIRO)).toBe(WalletType.CLI_FIRO);
    expect(walletTypeOf(cli as TestTile, Blockchain.MONERO)).toBe(WalletType.CLI_XMR);
    expect(walletTypeOf(cli as TestTile, Blockchain.ZANO)).toBe(WalletType.CLI_ZANO);
    expect(walletTypeOf(cli as TestTile, Blockchain.INTERNET_COMPUTER)).toBe(WalletType.CLI_ICP);
    expect(walletTypeOf(cli as TestTile, Blockchain.SOLANA)).toBe(WalletType.CLI_SOL);
    expect(walletTypeOf(cli as TestTile, Blockchain.TRON)).toBe(WalletType.CLI_TRX);
    expect(walletTypeOf(cli as TestTile, Blockchain.ETHEREUM)).toBe(WalletType.CLI_ETH);
  });

  it('selects the Bitcoin and Ethereum hardware wallets', () => {
    const page = pages.find((candidate) => candidate.id === 'hw-wallets');
    const expected = [
      ['bitbox', WalletType.BITBOX_BTC, WalletType.BITBOX_ETH],
      ['ledger', WalletType.LEDGER_BTC, WalletType.LEDGER_ETH],
      ['trezor', WalletType.TREZOR_BTC, WalletType.TREZOR_ETH],
    ];

    expected.forEach(([tileId, bitcoinType, ethereumType]) => {
      const tile = page?.tiles.find((candidate) => candidate.id === tileId) as TestTile;
      expect(walletTypeOf(tile, Blockchain.BITCOIN)).toBe(bitcoinType);
      expect(walletTypeOf(tile, Blockchain.ETHEREUM)).toBe(ethereumType);
    });
  });

  it('selects the command line wallet for the Cake wallet page', () => {
    const page = pages.find((candidate) => candidate.id === 'wallets-cake');
    const cli = page?.tiles.find((tile) => tile.id === 'cli') as TestTile;

    expect(walletTypeOf(cli, Blockchain.MONERO)).toBe(WalletType.CLI_XMR);
    expect(walletTypeOf(cli, Blockchain.ZANO)).toBe(WalletType.CLI_ZANO);
    expect(walletTypeOf(cli, Blockchain.ETHEREUM)).toBe(WalletType.CLI_ETH);
  });

  it('selects the command line wallet for the lightning page', () => {
    const page = pages.find((candidate) => candidate.id === 'lightning-wallets');
    const cli = page?.tiles.find((tile) => tile.id === 'cli') as TestTile;

    expect(walletTypeOf(cli, Blockchain.BITCOIN)).toBe(WalletType.CLI_BTC);
    expect(walletTypeOf(cli, Blockchain.ETHEREUM)).toBe(WalletType.CLI_ETH);
  });
});
