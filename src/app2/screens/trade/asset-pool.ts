// DFX App 2.0 — asset pool: groups the flat `Asset[]` from `useAssetContext()` into
// per-ticker `TradeAsset`s (one entry per code, with every chain it settles on), and the
// buy/sell-capability + wallet-reachability filters the static app's asset picker used
// (`availTokens`, `availChainsFor`, `reachable`, `sheetPool` in public/app2/index.html).

import { Blockchain } from '@dfx.swiss/react';
import type { Asset } from '@dfx.swiss/react';
import { isTestnetChain } from './blockchain-meta';
import type { AssetChain, Capability, TradeAsset } from './types';

/** Curated chains the pickers surface — the same whitelist the static app hardcoded as its `CH`
 * blockchain-metadata map (public/app2/index.html ~L1468). The static `loadAssets()` only ever
 * fetched `/asset?blockchains=Object.keys(CH)` and kept assets where `CH[a.blockchain]` existed, so
 * uncurated chains (Spark, Arkade, Zano, Railgun, Liquid, Arweave, DeFiChain) and test networks
 * (Sepolia, Citrea Testnet) never entered the pool and never showed as chain chips, network cards or
 * in the "N networks" count. We port that curation here rather than list every chain in CHAIN_NAME. */
const CURATED_CHAINS = new Set<Blockchain>([
  Blockchain.BITCOIN,
  Blockchain.LIGHTNING,
  Blockchain.ETHEREUM,
  Blockchain.ARBITRUM,
  Blockchain.OPTIMISM,
  Blockchain.POLYGON,
  Blockchain.BASE,
  Blockchain.BINANCE_SMART_CHAIN,
  Blockchain.GNOSIS,
  Blockchain.HAQQ,
  Blockchain.SOLANA,
  Blockchain.MONERO,
  Blockchain.TRON,
  Blockchain.CARDANO,
  Blockchain.INTERNET_COMPUTER,
  Blockchain.CITREA,
  Blockchain.FIRO,
]);

/** A chain surfaces in the pickers only if it's in the curated whitelist and is not a test network. */
function isCuratedChain(blockchain: Blockchain): boolean {
  return CURATED_CHAINS.has(blockchain) && !isTestnetChain(blockchain);
}

/** Groups a flat asset list by ticker (`Asset.name`), same key the static app grouped
 * `TOKENS` by in `loadAssets()`. */
export function groupAssets(assets: Asset[]): TradeAsset[] {
  const byCode = new Map<string, TradeAsset>();
  for (const asset of assets) {
    if (asset.comingSoon) continue;
    // Drop uncurated/testnet chains before they ever enter an asset's chain list, mirroring the
    // static app's `raw.filter(a=>…&&CH[a.blockchain])` at load. Assets that also settle on a curated
    // chain keep that chain; assets left with zero curated chains fall away below.
    if (!isCuratedChain(asset.blockchain)) continue;
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
 * pickable pre-login) or if it appears anywhere in the authenticated JWT's blockchain list.
 * EVM sessions deliberately carry several chains for the same address, so considering only
 * the first entry would hide valid routes on Arbitrum, Base, Polygon, and the other EVMs. */
export function isReachable(blockchain: Blockchain, sessionBlockchains: readonly string[] | undefined): boolean {
  if (!sessionBlockchains?.length) return true;
  return sessionBlockchains.includes(blockchain);
}

/** Chains to actually list for a token. A connected wallet must never fall back to incapable
 * networks: if none of the capable chains is present in its JWT, the asset is unavailable for
 * that wallet and callers render their empty/not-available state. */
export function shownChainsFor(
  token: TradeAsset,
  cap: Capability,
  sessionBlockchains: readonly string[] | undefined,
): AssetChain[] {
  const chains = chainsFor(token, cap).filter((c) => isCuratedChain(c.blockchain));
  return chains.filter((c) => isReachable(c.blockchain, sessionBlockchains));
}

type BalanceAsset = { id: number | string; name: string };

function balanceTicker(
  ident: string,
  assets: readonly BalanceAsset[] | undefined,
): string | undefined {
  if (!ident) return undefined;
  if (/^\d+$/.test(ident)) {
    const match = assets?.find((asset) => String(asset.id) === ident);
    return match ? match.name.toUpperCase() : undefined;
  }
  return ident.toUpperCase();
}

/** Parses the embed contract's `?balances=amount@asset,amount@asset,...` query param.
 * The main-app contract is `amount@assetId` (README). Ticker form (`amount@BTC`) remains
 * accepted so existing App 2.0 embeds keep working. Numeric IDs resolve against `assets`
 * to a ticker; unmatched IDs are skipped. */
export function parseBalances(search: string, assets?: readonly BalanceAsset[]): Record<string, number> {
  const raw = new URLSearchParams(search).get('balances');
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const entry of raw.split(',')) {
    const [amountStr, codeRaw] = entry.split('@');
    const amount = parseFloat(amountStr);
    const code = balanceTicker((codeRaw || '').trim(), assets);
    if (code && Number.isFinite(amount)) out[code] = (out[code] || 0) + amount;
  }
  return out;
}

export function heldBalance(balances: Record<string, number>, code: string): number {
  return balances[code.toUpperCase()] || 0;
}

/** Same discriminator as `AssetCategory.PRIVATE`. Compared by value so tests that mock
 * `@dfx.swiss/react` without the enum still exercise the partner-pool filter. */
const PRIVATE_ASSET_CATEGORY = 'Private';

/** Name / uniqueName match used by the main app's `getAsset(list, identifier)`. */
export function matchesAssetParam(
  asset: { name: string; uniqueName?: string },
  named: string,
): boolean {
  const needle = named.toLowerCase();
  return asset.name.toLowerCase() === needle || asset.uniqueName?.toLowerCase() === needle;
}

/**
 * Public assets always, plus a private asset when `named` matches (`a.category === PUBLIC
 * || a.name === named`). Callers pass buy's `asset-out` or sell's `asset-in` — not both —
 * matching buy.screen.tsx:358 and sell.screen.tsx:202. Missing `category` is treated as
 * public so existing fixtures without the field stay visible.
 */
export function includeInPartnerPool(
  asset: { name: string; uniqueName?: string; category?: string },
  named?: string,
): boolean {
  if (asset.category !== PRIVATE_ASSET_CATEGORY) return true;
  return named != null && matchesAssetParam(asset, named);
}

/** First pool entry whose ticker or uniqueName matches the partner param. */
export function findNamedTradeAsset(pool: TradeAsset[], named?: string): TradeAsset | undefined {
  if (!named) return undefined;
  const wanted = named.toLowerCase();
  return pool.find(
    (tk) => tk.code.toLowerCase() === wanted || tk.chains.some((chain) => matchesAssetParam(chain.asset, wanted)),
  );
}
