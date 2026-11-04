import type { AuthResult } from '@dfx.swiss/wallet';

// The open passkey stays in this tab. It is not written to localStorage, sessionStorage or a cookie.
// Keys and the account token disappear when the tab closes.
export type OpenPasskey = AuthResult;

let current: OpenPasskey | undefined;
const listeners = new Set<() => void>();

export function getOpenPasskey(): OpenPasskey | undefined {
  return current;
}

export function setOpenPasskey(next: OpenPasskey | undefined): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribeOpenPasskey(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
