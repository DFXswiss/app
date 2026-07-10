// DFX App 2.0 — shared trade types.
//
// `Mode` mirrors the static app's `S.mode` (public/app2/index.html `S={mode:'buy',...}`).
// `Capability` is the buy/sell direction an asset must support to appear in a picker —
// the static app's `cap(m)` helper (`m==="sell"?"sell":"buy"`).

import type { Asset, Blockchain } from '@dfx.swiss/react';

export type Mode = 'buy' | 'sell' | 'swap';

export type Capability = 'buy' | 'sell';

/** One chain an asset settles on, paired with the underlying API `Asset` (id, buyable/sellable flags, ...). */
export interface AssetChain {
  blockchain: Blockchain;
  asset: Asset;
}

/** A ticker (e.g. "BTC", "USDC") grouped across every blockchain it settles on — mirrors the static app's
 * `TOKENS` entries (built in `loadAssets()`), but derived from `useAssetContext().getAssets(...)` instead of
 * a hand-rolled `/asset` fetch. */
export interface TradeAsset {
  /** Ticker / API `Asset.name`, e.g. "BTC", "USDC" — stable across chains. */
  code: string;
  /** Longer display name — `Asset.description`, falls back to `code`. */
  description: string;
  chains: AssetChain[];
}
