// Round-4 C6 + F4: catalog resolution must prefer walletId (catalog entry id) over shared
// walletType. Production rememberWallet persists walletType AuthWalletType.CLI for both Cardano
// and CLI; without walletId that key alone must open CLI (identity), not Cardano. With walletId
// 'Cardano' the re-auth path must open the Cardano connector.

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

import { catalogEntryByWalletType, walletIconFor } from '../wallets/catalog';

describe('catalogEntryByWalletType (round-4 C6 / F4)', () => {
  it('resolves production key CLI (no walletId) to the CLI entry, not Cardano', () => {
    // Real production key from rememberWallet({ walletType: AuthWalletType.CLI }) — never 'Cardano'.
    const entry = catalogEntryByWalletType('CLI');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('CLI');
    expect(entry?.connector).toBe('cli');
  });

  it('resolves a remembered Cardano wallet via walletId despite walletType CLI (F4)', () => {
    // Production path: rememberWallet writes walletType:'CLI' + walletId:'Cardano'.
    const entry = catalogEntryByWalletType('CLI', 'Cardano');
    expect(entry).toBeDefined();
    expect(entry?.id).toBe('Cardano');
    expect(entry?.connector).toBe('cardano');
  });

  it('resolves a remembered CLI wallet via walletId CLI', () => {
    const entry = catalogEntryByWalletType('CLI', 'CLI');
    expect(entry?.id).toBe('CLI');
    expect(entry?.connector).toBe('cli');
  });

  it('uses the same identity-over-type precedence as walletIconFor for CLI', () => {
    const cliIcon = walletIconFor('CLI');
    const cardanoIcon = walletIconFor('Cardano');
    expect(cliIcon).toBeDefined();
    expect(cardanoIcon).toBeDefined();
    expect(cliIcon).not.toBe(cardanoIcon);

    const cliEntry = catalogEntryByWalletType('CLI');
    expect(cliEntry?.icon).toBe(cliIcon);
  });

  it('still resolves a unique walletType (MetaMask) to its catalog entry', () => {
    const entry = catalogEntryByWalletType('MetaMask');
    expect(entry?.id).toBe('MetaMask');
    expect(entry?.connector).toBe('injected');
  });
});
