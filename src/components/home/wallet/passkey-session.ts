import type { KeyRing } from '@dfx.swiss/wallet';
import type { PasskeyBitcoinNetwork } from './passkey-bitcoin';

// The open passkey stays in this tab. It is not written to localStorage, sessionStorage or a cookie.
// Keys and the wallet session token disappear when the tab closes.
export interface OpenPasskey {
  // wallet-api session token. It is never the DFX customer session; that one lives in the SDK session.
  token: string;
  credentialId: string;
  keys?: KeyRing;
  bitcoinNetwork: PasskeyBitcoinNetwork;
  // BIP-84 receive index the device found by gap-limit discovery against the wallet-api account.
  receiveIndex?: number;
}

export function sameSession(a: OpenPasskey | undefined, b: OpenPasskey): boolean {
  return Boolean(a && a.token === b.token && a.credentialId === b.credentialId);
}

declare global {
  interface Window {
    __dfxSetOpenPasskey?: (next: OpenPasskey | undefined) => void;
  }
}

let current: OpenPasskey | undefined;
const listeners = new Set<() => void>();

export function getOpenPasskey(): OpenPasskey | undefined {
  return current;
}

export function setOpenPasskey(next: OpenPasskey | undefined): void {
  current = next;
  listeners.forEach((listener) => listener());
}

// Applies a change only while the same session is still open, so a late answer never lands on a newer login.
export function updateOpenPasskey(session: OpenPasskey, patch: Partial<Pick<OpenPasskey, 'receiveIndex'>>): void {
  if (!current || !sameSession(current, session)) return;
  setOpenPasskey({ ...current, ...patch });
}

export function subscribeOpenPasskey(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// The wallet-entry handbook shot sets an unlocked session through this hook.
export function installHandbookSessionHook(target: Window | undefined, env: string | undefined): void {
  if (env === 'production' || target === undefined) return;
  // NODE_ENV is inlined. A production bundle drops the assignment and the property name.
  if (process.env.NODE_ENV === 'production') return;
  target.__dfxSetOpenPasskey = setOpenPasskey;
}

installHandbookSessionHook(window, process.env.NODE_ENV);
