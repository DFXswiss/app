// DFX App 2.0 — display metadata for `Blockchain` enum values.
//
// The `Asset`/`Fiat` API types (@dfx.swiss/react) carry no display name, icon or color —
// the static app's per-chain names/icons/colors were its own hardcoded `CH` map, not API
// data. We port the same idea as a small local table instead of bundling the static app's
// image assets (out of scope for this rewrite; see AssetGlyph/ChainBadge for the resulting
// monochrome-badge fallback used everywhere here).

import { Blockchain } from '@dfx.swiss/react';

export const CHAIN_NAME: Record<Blockchain, string> = {
  [Blockchain.BITCOIN]: 'Bitcoin',
  [Blockchain.LIGHTNING]: 'Lightning',
  [Blockchain.SPARK]: 'Spark',
  [Blockchain.ARKADE]: 'Arkade',
  [Blockchain.FIRO]: 'Firo',
  [Blockchain.MONERO]: 'Monero',
  [Blockchain.ZANO]: 'Zano',
  [Blockchain.INTERNET_COMPUTER]: 'Internet Computer',
  [Blockchain.ETHEREUM]: 'Ethereum',
  [Blockchain.SEPOLIA]: 'Sepolia',
  [Blockchain.BINANCE_SMART_CHAIN]: 'BNB Chain',
  [Blockchain.OPTIMISM]: 'Optimism',
  [Blockchain.ARBITRUM]: 'Arbitrum',
  [Blockchain.POLYGON]: 'Polygon',
  [Blockchain.BASE]: 'Base',
  [Blockchain.GNOSIS]: 'Gnosis',
  [Blockchain.HAQQ]: 'HAQQ',
  [Blockchain.LIQUID]: 'Liquid',
  [Blockchain.ARWEAVE]: 'Arweave',
  [Blockchain.CARDANO]: 'Cardano',
  [Blockchain.RAILGUN]: 'Railgun',
  [Blockchain.SOLANA]: 'Solana',
  [Blockchain.TRON]: 'Tron',
  [Blockchain.CITREA]: 'Citrea',
  [Blockchain.CITREA_TESTNET]: 'Citrea Testnet',
  [Blockchain.DEFICHAIN]: 'DeFiChain',
};

export function chainName(blockchain: Blockchain): string {
  return CHAIN_NAME[blockchain] ?? blockchain;
}

// Test networks — never shown or offered to users. The dev API (dev.api.dfx.swiss) exposes
// Sepolia / Citrea Testnet alongside their mainnets; production only has mainnets, so this filter
// is a no-op there and a cleanup on dev. EVM addresses always resolve to Ethereum, BTC to Bitcoin.
export const TESTNET_CHAINS = new Set<Blockchain>([Blockchain.SEPOLIA, Blockchain.CITREA_TESTNET]);

export function isTestnetChain(blockchain: Blockchain): boolean {
  return TESTNET_CHAINS.has(blockchain);
}

/** Drops test networks from a chain list (display + selection). */
export function mainnetOnly<T extends Blockchain>(chains: readonly T[]): T[] {
  return chains.filter((chain) => !TESTNET_CHAINS.has(chain));
}

/** Deterministic HSL color for a badge background — every chain/ticker gets a stable, distinct
 * color without maintaining a hand-picked entry per value. */
export function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 58%, 34%)`;
}

/** Popular tickers shown first / under the "Popular" filter chip — mirrors the static app's
 * hardcoded `FAVS` list (also UI-only curation, not API data). */
export const POPULAR_ASSETS = [
  'BTC',
  'ETH',
  'USDT',
  'USDC',
  'ZCHF',
  'SOL',
  'XMR',
  'ADA',
  'cBTC',
  'DAI',
  'EURC',
  'BNB',
  'LINK',
];

/** Ticker codes treated as stablecoins for the "Stablecoins" filter chip — ported from the
 * static app's hardcoded `stable` set in `loadAssets()`. */
export const STABLE_ASSETS = new Set([
  'USDT',
  'USDC',
  'DAI',
  'EURC',
  'ZCHF',
  'DEURO',
  'USDC.E',
  'EURS',
  'DEPS',
  'JUSD',
  'CTUSD',
  'GUSD',
  'CRVUSD',
]);

/** Ticker codes treated as Swiss-franc-pegged assets for the "Swiss" filter chip. */
export const SWISS_ASSETS = new Set(['ZCHF', 'FPS', 'WFPS', 'FRANKENCOIN']);

export function isStableAsset(code: string): boolean {
  return STABLE_ASSETS.has(code.toUpperCase());
}

export function isSwissAsset(code: string): boolean {
  return SWISS_ASSETS.has(code.toUpperCase());
}

export function isBtcAsset(code: string): boolean {
  return /btc/i.test(code);
}
