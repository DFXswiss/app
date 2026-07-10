// DFX App 2.0 — wallet catalog for the connect sheet.
//
// Mirrors the grouping/order of the static preview's WALLETS config
// (public/app2/index.html, around line 1580: {g:"wEvm",items:[...]}, ...).
// Only MetaMask (generic EIP-1193 injected) and WalletConnect are wired up
// in this slice (kind !== 'soon'); every other entry the static app offers
// is rendered greyed with a "coming soon" badge — honest UI, no dead
// buttons that pretend to work.

import { AuthWalletType } from '@dfx.swiss/react';
import type { TranslationKey } from '../i18n';
import iconAlby from '../assets/wallets/alby.svg';
import iconBitBox from '../assets/wallets/bitbox.svg';
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

/** Which connector implements a catalog entry. `'soon'` entries are
 * rendered but disabled — no handler is wired up yet. */
export type WalletConnector = 'injected' | 'wallet-connect' | 'soon';

export interface WalletCatalogEntry {
  id: string;
  name: string;
  icon: string;
  hint: string;
  connector: WalletConnector;
  walletType?: AuthWalletType;
}

export interface WalletCatalogGroup {
  key: TranslationKey;
  items: WalletCatalogEntry[];
}

export const WALLET_CATALOG: WalletCatalogGroup[] = [
  {
    key: 'wEvm',
    items: [
      {
        id: 'MetaMask',
        name: 'MetaMask',
        icon: iconMetaMask,
        hint: 'EVM · browser extension',
        connector: 'injected',
        walletType: AuthWalletType.METAMASK,
      },
      {
        id: 'WalletConnect',
        name: 'WalletConnect',
        icon: iconWalletConnect,
        hint: 'EVM · QR / mobile',
        connector: 'wallet-connect',
        walletType: AuthWalletType.WALLET_CONNECT,
      },
      {
        id: 'Coinbase Wallet',
        name: 'Coinbase Wallet',
        icon: iconCoinbase,
        hint: 'EVM',
        connector: 'soon',
      },
      {
        id: 'Rabby',
        name: 'Rabby',
        icon: iconRabby,
        hint: 'EVM',
        connector: 'soon',
      },
    ],
  },
  {
    key: 'wHw',
    items: [
      { id: 'BitBox', name: 'BitBox', icon: iconBitBox, hint: 'Bitcoin + EVM', connector: 'soon' },
      { id: 'Ledger', name: 'Ledger', icon: iconLedger, hint: 'Bitcoin + EVM', connector: 'soon' },
      { id: 'Trezor', name: 'Trezor', icon: iconTrezor, hint: 'Bitcoin + EVM', connector: 'soon' },
    ],
  },
  {
    key: 'wLn',
    items: [{ id: 'Alby', name: 'Alby', icon: iconAlby, hint: 'Lightning', connector: 'soon' }],
  },
  {
    key: 'wOther',
    items: [
      { id: 'Phantom', name: 'Phantom', icon: iconPhantom, hint: 'Solana', connector: 'soon' },
      { id: 'Trust Wallet', name: 'Trust Wallet', icon: iconTrust, hint: 'Solana', connector: 'soon' },
      { id: 'TronLink', name: 'TronLink', icon: iconTron, hint: 'Tron', connector: 'soon' },
      { id: 'CLI', name: 'CLI', icon: iconCli, hint: 'Manual signing', connector: 'soon' },
    ],
  },
];
