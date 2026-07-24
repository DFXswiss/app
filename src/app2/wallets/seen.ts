// DFX App 2.0 — remembered wallets for the "switch wallet" sheet.
//
// Mirrors the static preview's `dfx_wallets` list (public/app2/index.html): every wallet the
// user has connected on this device is remembered so the switcher can offer them again. Addresses
// linked to the *active* DFX account are switched seamlessly via useUserContext().changeAddress
// (no re-signing); wallets that belong to a different account are re-authenticated by reconnecting
// that specific wallet. `userAddresses` is the authoritative source for the account's own wallets —
// this local list adds the connector identity (for the logo) and wallets from other accounts.

import type { Blockchain } from '@dfx.swiss/react';

export interface SeenWallet {
  /** AuthWalletType / connector label used to connect — drives the logo and re-auth. */
  walletType?: string;
  address: string;
  /** Blockchains this wallet connected with — kept so the switch-wallet sheet can still show the
   * chain chips for a wallet remembered under a *different* DFX account (mirrors the original's
   * `dfx_wallets` entry `chains`, public/app2/index.html:3505). */
  chains?: readonly Blockchain[];
}

const KEY = 'dfx_app2_wallets';
const MAX = 8;

function read(): SeenWallet[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as SeenWallet[]).filter((e) => e && typeof e.address === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: SeenWallet[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage unavailable (private mode / sandboxed) — the account's userAddresses still work
  }
}

export function seenWallets(): SeenWallet[] {
  return read();
}

/** Records a freshly connected wallet, most-recent first, de-duped by address. */
export function rememberWallet(wallet: SeenWallet): void {
  if (!wallet.address) return;
  const rest = read().filter((e) => e.address.toLowerCase() !== wallet.address.toLowerCase());
  write([wallet, ...rest]);
}

export function forgetWallet(address: string): void {
  write(read().filter((e) => e.address.toLowerCase() !== address.toLowerCase()));
}
