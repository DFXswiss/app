// DFX App 2.0 — asset pool: groups the flat `Asset[]` from `useAssetContext()` into
// per-ticker `TradeAsset`s (one entry per code, with every chain it settles on), and the
// buy/sell-capability + wallet-reachability filters the static app's asset picker used
// (`availTokens`, `availChainsFor`, `reachable`, `sheetPool` in public/app2/index.html).

import type { Asset, Blockchain } from '@dfx.swiss/react';
import type { AssetChain, Capability, TradeAsset } from './types';

/** Groups a flat asset list by ticker (`Asset.name`), same key the static app grouped
 * `TOKENS` by in `loadAssets()`. */
export function groupAssets(assets: Asset[]): TradeAsset[] {
  const byCode = new Map<string, TradeAsset>();
  for (const asset of assets) {
    if (asset.comingSoon) continue;
    let entry = byCode.get(asset.name);
    if (!entry) {
      entry = { code: asset.name, description: asset.description || asset.name, chains: [] };
      byCode.set(asset.name, entry);
    }
    entry.chains.push({ blockchain: asset.blockchain, asset });
  }
  // more chains first, matching the static app's `TOKENS.sort((a,b)=>b.chains.length-a.chains.length)`
  return Array.from(byCode.values()).sort((a, b) => b.chains.length - a.chains.length);
}

function supports(chain: AssetChain, cap: Capability): boolean {
  return cap === 'sell' ? chain.asset.sellable : chain.asset.buyable;
}

/** Tokens that support the given capability on at least one chain. */
export function availableAssets(pool: TradeAsset[], cap: Capability): TradeAsset[] {
  return pool.filter((tk) => tk.chains.some((c) => supports(c, cap)));
}

/** The chains of one token that support the given capability. */
export function chainsFor(token: TradeAsset, cap: Capability): AssetChain[] {
  return token.chains.filter((c) => supports(c, cap));
}

/** The underlying `Asset` for one (token, chain) pair with the given capability, or
 * `undefined` if that combination can't actually settle (a "doomed quote" guard). */
export function assetFor(token: TradeAsset, blockchain: Blockchain, cap: Capability): Asset | undefined {
  return chainsFor(token, cap).find((c) => c.blockchain === blockchain)?.asset;
}

/** A chain is reachable by the connected wallet if there's no session yet (anything is
 * pickable pre-login — the connect step still needs to happen) or if it's the chain the
 * session is actually connected on. The static app tracked every chain a wallet's JWT could
 * settle on (`S.chains`); the `WalletSession` contract here only exposes the single active
 * `blockchain`, so "reachable" narrows to "is the active chain". */
export function isReachable(blockchain: Blockchain, sessionBlockchain: string | undefined): boolean {
  if (!sessionBlockchain) return true;
  return blockchain === sessionBlockchain;
}

/** Chains to actually list for a token: reachable chains if any exist, otherwise every
 * capable chain (so a logged-out user, or a wallet connected on an unrelated chain, still
 * sees every network DFX supports for that asset). */
export function shownChainsFor(
  token: TradeAsset,
  cap: Capability,
  sessionBlockchain: string | undefined,
): AssetChain[] {
  const chains = chainsFor(token, cap);
  const reachable = chains.filter((c) => isReachable(c.blockchain, sessionBlockchain));
  return reachable.length ? reachable : chains;
}

/** Parses the embed contract's `?balances=amount@asset,amount@asset,...` query param (top-level,
 * outside the hash route) into a `{ TICKER: amount }` map — same format/semantics as the static
 * app's `BAL` (public/app2/index.html). Used to show only held assets in the sell/swap-source
 * picker when a partner wallet passes its balances in. */
export function parseBalances(search: string): Record<string, number> {
  const raw = new URLSearchParams(search).get('balances');
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const [amountStr, codeRaw] = entry.split('@');
    const amount = parseFloat(amountStr);
    const code = (codeRaw || '').trim().toUpperCase();
    if (code && Number.isFinite(amount)) out[code] = (out[code] || 0) + amount;
  }
  return out;
}

export function heldBalance(balances: Record<string, number>, code: string): number {
  return balances[code.toUpperCase()] || 0;
}
