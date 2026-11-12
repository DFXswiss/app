import type { AuthResult } from '@dfx.swiss/wallet';

// The open passkey stays in this tab. It is not written to localStorage, sessionStorage or a cookie.
// Keys and the account token disappear when the tab closes.
export type OpenPasskey = AuthResult;

export function sameSession(a: OpenPasskey | undefined, b: OpenPasskey): boolean {
  return Boolean(
    a?.wallet &&
    a.wallet.id === b.wallet.id &&
    a.wallet.credentialId === b.wallet.credentialId &&
    a.accessToken === b.accessToken,
  );
}

// Account id bound to an open passkey. An expired token still carries session.account,
// but isLoggedIn is false. Storing that number looks like another account and the guard wipes the keys.
export function dfxPasskeyAccount(
  isLoggedIn: boolean,
  session: { account?: unknown } | null | undefined,
): number | undefined {
  const account = session?.account;
  if (isLoggedIn && typeof account === 'number') return account;
  return undefined;
}

declare global {
  interface Window {
    __dfxSetOpenPasskey?: (next: OpenPasskey | undefined, ...accountArg: [] | [number | undefined]) => void;
  }
}

let current: OpenPasskey | undefined;
export type PasskeyCloseReason = 'revoked' | 'blocked' | 'session-changed';
let closeReason: PasskeyCloseReason | undefined;
// Account id from the DFX session that was current when this passkey was opened.
// Undefined means the passkey was opened with no DFX session.
let openedForAccount: number | undefined;
const listeners = new Set<() => void>();
// A wallet refresh calls setOpenPasskey with one argument. That must keep the account.
// Clearing it would look like a session change and wipe the keys.
// A default parameter would also treat an explicit undefined as omitted, so the second
// argument is a rest parameter: length 0 keeps the account, a present argument sets it.

export function getOpenPasskey(): OpenPasskey | undefined {
  return current;
}

export function getOpenPasskeyAccount(): number | undefined {
  return openedForAccount;
}

export function setPasskeyCloseReason(reason: PasskeyCloseReason): void {
  closeReason = reason;
}

export function readPasskeyCloseReason(): PasskeyCloseReason | undefined {
  return closeReason;
}

export function takePasskeyCloseReason(): PasskeyCloseReason | undefined {
  const reason = closeReason;
  closeReason = undefined;
  return reason;
}

export function setOpenPasskey(next: OpenPasskey | undefined, ...accountArg: [] | [number | undefined]): void {
  current = next;
  if (next === undefined) {
    openedForAccount = undefined;
  } else {
    closeReason = undefined;
    if (accountArg.length > 0) openedForAccount = accountArg[0];
  }
  listeners.forEach((listener) => listener());
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
