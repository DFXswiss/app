// DFX App 2.0 — pure decision logic for injected-wallet session invalidation.
//
// Kept independent of the provider plumbing (session.tsx/providers.ts) on purpose: the review
// finding this exists for was two account-mixing bugs caused by session.tsx listening on the
// wrong EIP-1193 provider instance (window.ethereum) instead of the one the session actually
// authenticated with (resolved via EIP-6963 in providers.ts, which can be a different object when
// several wallets are installed). A regression there is a wiring bug, not a decision-logic bug —
// this module is the one place the "should this event log the session out" decision lives, so it
// can be pinned by a table test independent of which provider instance ends up wired to it.

/** Whether an `accountsChanged` event on the wallet a session is currently bound to should force
 * that session to log out. `accounts` is whatever the event reported (possibly empty — the
 * extension locked, or the site's permission was revoked). Comparison is case-insensitive: EVM
 * addresses are not case-sensitive identity, only checksum-cased for typo detection, so a wallet
 * re-announcing the same account in a different case must never be treated as a switch. */
export function shouldInvalidateSession(activeAddress: string | undefined, accounts: readonly string[]): boolean {
  if (!activeAddress) return false;
  const next = accounts[0];
  if (!next) return true; // locked/disconnected — no account left to be signed in as
  return next.toLowerCase() !== activeAddress.toLowerCase();
}
