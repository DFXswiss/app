// DFX App 2.0 — formatting helpers shared by the secondary screens
// (account/transactions/kyc/support). Mirrors the small utility functions the
// static preview kept inline (public/app2/index.html: `loc()`, `fmtDate()`,
// `fmtDateTime()`, `short()`), rewritten as pure, typed functions so every
// screen formats dates/amounts/addresses the same way.

import { Blockchain } from '@dfx.swiss/react';
import type { Language } from '../../i18n';

const LOCALES: Record<Language, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-CH', it: 'it-CH' };

export function localeFor(language: Language): string {
  return LOCALES[language] ?? 'en-US';
}

/** `0x1234…abcd`, same slice points as the static app's `short()`. */
export function shortAddress(address?: string): string {
  if (!address) return '';
  return address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function toDate(value: Date | string | undefined | null): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDate(value: Date | string | undefined | null, language: Language): string {
  const date = toDate(value);
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function formatDateTime(value: Date | string | undefined | null, language: Language): string {
  const date = toDate(value);
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(localeFor(language), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Calendar-day key (local time) used to group the transaction list by date. */
export function dateGroupKey(value: Date | string | undefined | null): string {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatNumber(value: number | undefined | null, language: Language, maximumFractionDigits = 6): string {
  if (value == null || Number.isNaN(value)) return '—';
  try {
    return value.toLocaleString(localeFor(language), { maximumFractionDigits });
  } catch {
    return String(value);
  }
}

/** `1.234 BTC` — trims to `maximumFractionDigits`, omits the asset when absent. */
export function formatAmount(
  value: number | undefined | null,
  asset: string | undefined,
  language: Language,
  maximumFractionDigits = 6,
): string {
  if (value == null) return '';
  const amount = formatNumber(value, language, maximumFractionDigits);
  return asset ? `${amount} ${asset}` : amount;
}

/** `12'500 CHF` — trading limits and volumes are always CHF-denominated,
 * same as the static app's `fmtCHF()`. */
export function formatChf(value: number | undefined | null, language: Language): string {
  if (value == null) return '—';
  return `${formatNumber(Math.round(value), language, 0)} CHF`;
}

/**
 * True only for well-formed `https:` URLs. Every href built from API data
 * (KYC ident sessions, transaction tx links, ...) must pass this check first
 * — the static app opened `ses.url` / `x.*TxUrl` unchecked, which is exactly
 * the gap this app must not repeat.
 */
export function isSafeHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Hardcoded, well-known block-explorer bases — used only as a fallback to
// build a tx link from `(blockchain, txId)` when the API didn't already
// provide a `*TxUrl`. Never built from anything API-supplied besides the id.
const EXPLORER_TX_BASE: Partial<Record<Blockchain, string>> = {
  [Blockchain.BITCOIN]: 'https://mempool.space/tx/',
  [Blockchain.ETHEREUM]: 'https://etherscan.io/tx/',
  [Blockchain.SEPOLIA]: 'https://sepolia.etherscan.io/tx/',
  [Blockchain.BINANCE_SMART_CHAIN]: 'https://bscscan.com/tx/',
  [Blockchain.OPTIMISM]: 'https://optimistic.etherscan.io/tx/',
  [Blockchain.ARBITRUM]: 'https://arbiscan.io/tx/',
  [Blockchain.POLYGON]: 'https://polygonscan.com/tx/',
  [Blockchain.BASE]: 'https://basescan.org/tx/',
  [Blockchain.GNOSIS]: 'https://gnosisscan.io/tx/',
  [Blockchain.HAQQ]: 'https://explorer.haqq.network/tx/',
  [Blockchain.SOLANA]: 'https://solscan.io/tx/',
  [Blockchain.TRON]: 'https://tronscan.org/#/transaction/',
  [Blockchain.CARDANO]: 'https://cardanoscan.io/transaction/',
  [Blockchain.DEFICHAIN]: 'https://defiscan.live/transactions/',
};

/** Builds `<explorerBase>/<txId>` from a hardcoded base map — returns
 * `undefined` (never a guess) for chains without a known explorer. */
export function explorerTxUrl(blockchain: Blockchain | undefined, txId: string | undefined): string | undefined {
  if (!blockchain || !txId) return undefined;
  const base = EXPLORER_TX_BASE[blockchain];
  if (!base) return undefined;
  const url = `${base}${encodeURIComponent(txId)}`;
  return isSafeHttpsUrl(url) ? url : undefined;
}

/** Prefers the API-provided tx URL (once https-validated), falls back to a
 * hardcoded-base link built from the blockchain + txId. */
export function resolveTxUrl(
  apiTxUrl: string | undefined,
  blockchain: Blockchain | undefined,
  txId: string | undefined,
): string | undefined {
  if (isSafeHttpsUrl(apiTxUrl)) return apiTxUrl;
  return explorerTxUrl(blockchain, txId);
}
