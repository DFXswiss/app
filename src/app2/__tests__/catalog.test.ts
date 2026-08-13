// Remaining catalog resolution branches: empty keys, soon-entry icons, fuzzy prefix,
// and the injected-EVM predicate used by the reload probe.

jest.mock('@dfx.swiss/react', () => ({
  AuthWalletType: {
    METAMASK: 'MetaMask',
    WALLET_BROWSER: 'WalletBrowser',
    RABBY: 'Rabby',
    WALLET_CONNECT: 'WalletConnect',
    BIT_BOX: 'BitBox',
    LEDGER: 'Ledger',
    TREZOR: 'Trezor',
    ALBY: 'Alby',
    PHANTOM: 'Phantom',
    TRUST: 'Trust',
    TRON_LINK: 'TronLink',
    CLI: 'CLI',
  },
  Blockchain: {
    ETHEREUM: 'Ethereum',
    ARBITRUM: 'Arbitrum',
    OPTIMISM: 'Optimism',
    POLYGON: 'Polygon',
    BASE: 'Base',
    BINANCE_SMART_CHAIN: 'BinanceSmartChain',
    GNOSIS: 'Gnosis',
    CITREA: 'Citrea',
    BITCOIN: 'Bitcoin',
    LIGHTNING: 'Lightning',
    SOLANA: 'Solana',
    TRON: 'Tron',
    INTERNET_COMPUTER: 'InternetComputer',
    CARDANO: 'Cardano',
  },
}));

import {
  catalogEntryByWalletType,
  EVM_NETWORK_COUNT,
  isInjectedEvmCatalogEntry,
  WALLET_CATALOG,
  walletIconFor,
} from '../wallets/catalog';

function entryById(id: string) {
  return WALLET_CATALOG.flatMap((group) => group.items).find((entry) => entry.id === id);
}

describe('WALLET_CATALOG', () => {
  it('keeps the EVM hint count in sync with the EVM chain list and includes WalletConnect', () => {
    expect(EVM_NETWORK_COUNT).toBe(8);
    const evmIds = WALLET_CATALOG.find((group) => group.key === 'wEvm')?.items.map((item) => item.id);
    expect(evmIds).toEqual(expect.arrayContaining(['MetaMask', 'Coinbase Wallet', 'Rabby', 'WalletConnect']));
  });
});

describe('walletIconFor', () => {
  it('returns undefined when neither walletId nor name resolve', () => {
    expect(walletIconFor()).toBeUndefined();
    expect(walletIconFor('')).toBeUndefined();
    expect(walletIconFor('---')).toBeUndefined();
    expect(walletIconFor(undefined, '---')).toBeUndefined();
  });

  it('resolves a catalog id via walletId even when the type string is empty', () => {
    expect(walletIconFor('', 'MetaMask')).toBe(entryById('MetaMask')?.icon);
  });

  it('keeps coming-soon entries as icon sources (DFX Taro / Internet Computer)', () => {
    expect(walletIconFor('DFX Taro')).toBe(entryById('DFX Taro')?.icon);
    expect(walletIconFor('Internet Computer')).toBe(entryById('Internet Computer')?.icon);
  });

  it('fuzzy-matches a prefix variant such as MetaMask Mobile', () => {
    expect(walletIconFor('MetaMask Mobile')).toBe(entryById('MetaMask')?.icon);
  });
});

describe('catalogEntryByWalletType', () => {
  it('returns undefined for empty / punctuation-only keys and for coming-soon names', () => {
    expect(catalogEntryByWalletType()).toBeUndefined();
    expect(catalogEntryByWalletType('')).toBeUndefined();
    expect(catalogEntryByWalletType('---')).toBeUndefined();
    expect(catalogEntryByWalletType('DFX Taro')).toBeUndefined();
  });

  it('ignores a punctuation-only walletId and falls through to walletType', () => {
    expect(catalogEntryByWalletType('CLI', '---')?.id).toBe('CLI');
  });

  it('resolves Coinbase Wallet by identity before the shared WalletBrowser type', () => {
    expect(catalogEntryByWalletType('Coinbase Wallet')?.id).toBe('Coinbase Wallet');
  });
});

describe('isInjectedEvmCatalogEntry', () => {
  it('is true only for injected catalog rows', () => {
    expect(isInjectedEvmCatalogEntry(undefined)).toBe(false);
    expect(isInjectedEvmCatalogEntry(entryById('MetaMask'))).toBe(true);
    expect(isInjectedEvmCatalogEntry(entryById('WalletConnect'))).toBe(false);
    expect(isInjectedEvmCatalogEntry(entryById('Ledger'))).toBe(false);
  });
});
