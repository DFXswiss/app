// DFX App 2.0 — wallet catalog for the connect sheet.
//
// Mirrors the grouping/order of the static preview's WALLETS config
// (public/app2/index.html, around line 1580: {g:"wEvm",items:[...]}, ...).
// The EVM browser wallets (MetaMask, Rabby, Coinbase) and WalletConnect are
// wired up (connector !== 'soon'); each injected entry carries the EIP-6963
// `rdns` and the legacy vendor `flavor` flag used to reach that specific
// wallet (see providers.ts resolveInjectedProvider). Hardware wallets and the
// non-EVM chains (Solana/Tron/Lightning) are still rendered greyed with a
// "coming soon" badge — honest UI, no dead buttons that pretend to work.

import { AuthWalletType, Blockchain } from '@dfx.swiss/react';
import type { ChainAdapterId, ChainConnector } from './chain-providers';
import type { HardwareId } from './hardware-providers';
import type { InjectedTarget } from './providers';
import type { TranslationKey } from '../i18n';
import iconLightning from '../assets/networks/lightning.svg';
import iconIcp from '../assets/tokens/ICP.svg';
import iconAlby from '../assets/wallets/alby.svg';
import iconBitBox from '../assets/wallets/bitbox.svg';
import iconCardano from '../assets/networks/cardano.svg';
import iconCli from '../assets/wallets/cli.svg';
import iconCoinbase from '../assets/wallets/coinbase.svg';
import iconLedger from '../assets/wallets/ledger.svg';
import iconMetaMask from '../assets/wallets/metamask.svg';
import iconPhantom from '../assets/wallets/phantom.svg';
import iconRabby from '../assets/wallets/rabby.svg';
import iconTrezor from '../assets/wallets/trezor.svg';
import iconTron from '../assets/wallets/tron.svg';
import iconTrust from '../assets/wallets/trust.svg';
import iconWalletConnect from '../assets/wallets/wallet-connect.svg';

/** Connectors that need no in-page wallet object: `'cli'` opens the manual
 * address+signature paste form; `'cardano'` drives a CIP-30 browser wallet;
 * `'alby'` drives WebLN / hosted-Alby Lightning login. */
export type ManualConnector = 'cli' | 'cardano' | 'alby';

/** Which connector implements a catalog entry. `'soon'` entries are
 * rendered but disabled — no handler is wired up yet. */
export type WalletConnector = 'injected' | 'wallet-connect' | ChainConnector | HardwareId | ManualConnector | 'soon';

export interface WalletCatalogEntry {
  id: string;
  name: string;
  icon: string;
  /** Static context line under the wallet name. EVM browser wallets omit it and set `evm`
   * instead, so their "EVM · N networks" hint is localized at render time (t('networks')). */
  hint?: string;
  /** EVM browser wallet: the hint is rendered as `EVM · ${EVM_NETWORK_COUNT} ${t('networks')}`
   * at display time, mirroring the original's `w.type==="evm" ? "EVM · "+EVM_CH.length+" "+t("networks")`. */
  evm?: boolean;
  /** Blockchains this wallet can receive on — used to filter the connect sheet when a caller
   * opens it for a specific asset's chain (openConnect(code, filterChain)); mirrors the original
   * `w.chains` used by openWalletSheet(filterChain). */
  chains?: readonly Blockchain[];
  connector: WalletConnector;
  walletType?: AuthWalletType;
  /** For `connector === 'injected'`: how to locate this specific wallet's
   * EIP-1193 provider (EIP-6963 rdns + legacy vendor flag). */
  injected?: InjectedTarget;
  /** For `connector === 'solana' | 'tron'`: which wallet-adapter to lazy-load. */
  adapterId?: ChainAdapterId;
}

export interface WalletCatalogGroup {
  key: TranslationKey;
  items: WalletCatalogEntry[];
}

// EVM chains an EVM browser wallet reaches, and the Bitcoin+EVM subset the hardware login supports
// — mirrors the original's EVM_CH / HW_CH (public/app2/index.html:1572-1573). Used both for the
// connect-sheet chain filter and to derive the localized "EVM · N networks" hint count.
const EVM_CH: readonly Blockchain[] = [
  Blockchain.ETHEREUM,
  Blockchain.ARBITRUM,
  Blockchain.OPTIMISM,
  Blockchain.POLYGON,
  Blockchain.BASE,
  Blockchain.BINANCE_SMART_CHAIN,
  Blockchain.GNOSIS,
  Blockchain.CITREA,
];
const HW_CH: readonly Blockchain[] = [
  Blockchain.BITCOIN,
  Blockchain.ETHEREUM,
  Blockchain.ARBITRUM,
  Blockchain.OPTIMISM,
  Blockchain.POLYGON,
];

/** The "8" in "EVM · 8 networks" — kept in sync with EVM_CH so the localized hint matches the
 * actual reachable-chain list. */
export const EVM_NETWORK_COUNT = EVM_CH.length;

// Real WalletConnect v2 (Reown) is only offered when a Cloud project id is configured — mirrors the
// original's `if(WC_PROJECT_ID)…` gate (public/app2/index.html:1599, "leave empty to hide the
// WalletConnect option"). The id itself lives in providers.ts (WALLET_CONNECT_PROJECT_ID);
// duplicated here as the gate source, matching that module's own "duplicated as a literal rather
// than imported" note. Set to '' to hide the WalletConnect row.
const WC_PROJECT_ID = '8c8a3a14d25438a1e1b8f4d91d8d2674';

const EVM_WALLETS: WalletCatalogEntry[] = [
  {
    id: 'MetaMask',
    name: 'MetaMask',
    icon: iconMetaMask,
    // hint computed at render: "EVM · " + EVM_NETWORK_COUNT + " " + t("networks").
    evm: true,
    chains: EVM_CH,
    connector: 'injected',
    walletType: AuthWalletType.METAMASK,
    injected: { rdns: 'io.metamask', flavor: 'isMetaMask' },
  },
  {
    id: 'Coinbase Wallet',
    name: 'Coinbase Wallet',
    icon: iconCoinbase,
    evm: true,
    chains: EVM_CH,
    connector: 'injected',
    walletType: AuthWalletType.WALLET_BROWSER,
    injected: { rdns: 'com.coinbase.wallet', flavor: 'isCoinbaseWallet' },
  },
  {
    id: 'Rabby',
    name: 'Rabby',
    icon: iconRabby,
    evm: true,
    chains: EVM_CH,
    connector: 'injected',
    walletType: AuthWalletType.RABBY,
    injected: { rdns: 'io.rabby', flavor: 'isRabby' },
  },
];

if (WC_PROJECT_ID) {
  EVM_WALLETS.push({
    id: 'WalletConnect',
    name: 'WalletConnect',
    icon: iconWalletConnect,
    hint: 'EVM · QR / mobile',
    chains: EVM_CH,
    connector: 'wallet-connect',
    walletType: AuthWalletType.WALLET_CONNECT,
  });
}

export const WALLET_CATALOG: WalletCatalogGroup[] = [
  {
    key: 'wEvm',
    items: EVM_WALLETS,
  },
  {
    key: 'wHw',
    items: [
      {
        id: 'BitBox',
        name: 'BitBox',
        icon: iconBitBox,
        hint: 'Bitcoin + EVM',
        chains: HW_CH,
        connector: 'bitbox',
        walletType: AuthWalletType.BIT_BOX,
      },
      {
        id: 'Ledger',
        name: 'Ledger',
        icon: iconLedger,
        hint: 'Bitcoin + EVM',
        chains: HW_CH,
        connector: 'ledger',
        walletType: AuthWalletType.LEDGER,
      },
      {
        id: 'Trezor',
        name: 'Trezor',
        icon: iconTrezor,
        hint: 'Bitcoin + EVM',
        chains: HW_CH,
        connector: 'trezor',
        walletType: AuthWalletType.TREZOR,
      },
    ],
  },
  {
    key: 'wLn',
    items: [
      {
        id: 'Alby',
        name: 'Alby',
        icon: iconAlby,
        hint: 'Lightning',
        chains: [Blockchain.LIGHTNING],
        connector: 'alby',
        walletType: AuthWalletType.ALBY,
      },
      // Coming-soon placeholder (original WALLETS wLn group): Lightning / Taproot Assets.
      {
        id: 'DFX Taro',
        name: 'DFX Taro',
        icon: iconLightning,
        hint: 'Taproot Assets',
        chains: [Blockchain.LIGHTNING],
        connector: 'soon',
      },
    ],
  },
  {
    key: 'wOther',
    items: [
      {
        id: 'Phantom',
        name: 'Phantom',
        icon: iconPhantom,
        hint: 'Solana',
        chains: [Blockchain.SOLANA],
        connector: 'solana',
        adapterId: 'phantom',
        walletType: AuthWalletType.PHANTOM,
      },
      {
        id: 'Trust Wallet',
        name: 'Trust Wallet',
        icon: iconTrust,
        hint: 'Solana',
        chains: [Blockchain.SOLANA],
        connector: 'solana',
        adapterId: 'trust-sol',
        walletType: AuthWalletType.TRUST,
      },
      {
        id: 'TronLink',
        name: 'TronLink',
        icon: iconTron,
        hint: 'Tron',
        chains: [Blockchain.TRON],
        connector: 'tron',
        adapterId: 'tronlink',
        walletType: AuthWalletType.TRON_LINK,
      },
      // Coming-soon placeholder (original WALLETS wOther group): Internet Computer.
      {
        id: 'Internet Computer',
        name: 'Internet Computer',
        icon: iconIcp,
        hint: 'Internet Computer',
        chains: [Blockchain.INTERNET_COMPUTER],
        connector: 'soon',
      },
      // Cardano: CIP-30 browser wallet (Nami/Eternl/Lace). Its auth is the CLI
      // contract (bech32 address + COSE signData signature + COSE key), like the
      // production CLI_ADA path — hence walletType CLI (original WALLETS wt:"CLI").
      {
        id: 'Cardano',
        name: 'Cardano',
        icon: iconCardano,
        hint: 'Cardano',
        chains: [Blockchain.CARDANO],
        connector: 'cardano',
        walletType: AuthWalletType.CLI,
      },
      {
        id: 'CLI',
        name: 'CLI',
        icon: iconCli,
        hint: 'Manual signing',
        connector: 'cli',
        walletType: AuthWalletType.CLI,
      },
    ],
  },
];

function normalizeWalletKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-effort brand icon for a wallet name / AuthWalletType — used by the wallet bar and the
 * switch-wallet rows. Returns undefined for wallets not in the catalog (e.g. partner wallets),
 * which then fall back to a generic wallet glyph. */
export function walletIconFor(nameOrType?: string): string | undefined {
  if (!nameOrType) return undefined;
  const key = normalizeWalletKey(nameOrType);
  if (!key) return undefined;
  for (const group of WALLET_CATALOG) {
    for (const entry of group.items) {
      const candidates = [entry.walletType, entry.id, entry.name]
        .filter((value): value is string => Boolean(value))
        .map(normalizeWalletKey);
      if (candidates.some((c) => c === key || c.startsWith(key) || key.startsWith(c))) return entry.icon;
    }
  }
  return undefined;
}

/** Catalog entry for a given AuthWalletType, used to re-authenticate a remembered wallet that
 * belongs to a different DFX account (only wired-up connectors, never `'soon'`). */
export function catalogEntryByWalletType(walletType?: string): WalletCatalogEntry | undefined {
  if (!walletType) return undefined;
  for (const group of WALLET_CATALOG) {
    for (const entry of group.items) {
      if (entry.connector !== 'soon' && entry.walletType === walletType) return entry;
    }
  }
  return undefined;
}
