// DFX App 2.0 — CLI / manual-signing helpers.
//
// The CLI connector needs no wallet in the browser at all: the user pastes an
// address, gets the DFX sign-message, signs it externally (dfx-cli, a hardware
// signer, a chain the app doesn't integrate, …) and pastes the signature back —
// plus a public key for the chains whose auth contract requires one (Cardano,
// Arweave, Internet Computer). This mirrors the static preview's CLI branch of
// openXmrSheet() (public/app2/index.html, ~line 3400) and the main app's
// connect-cli.tsx. The address check is deliberately loose — the DFX API is the
// real per-chain validator; we only guard against obviously-empty input.

/** Loose sanity check for a pasted CLI address (same bound as the static
 * preview's `/^\S{10,128}$/`): non-whitespace, 10–128 chars. */
export const CLI_ADDRESS_RE = /^\S{10,128}$/;

export function isPlausibleCliAddress(address: string): boolean {
  return CLI_ADDRESS_RE.test(address.trim());
}
