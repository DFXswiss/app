// DFX App 2.0 — amount parsing/formatting for the trade screens.
//
// `parseAmt` follows the static app's shared decimal parser
// (public/app2/index.html: "shared decimal parser: accepts '12,50'/'12.50', rejects
// thousands separators / stray chars → null (never a partial value)"), with locale-aware
// handling for English commas. Money-path
// safety: a partially-typed or malformed amount must never silently become 0 or NaN —
// it must be `null`, so callers can tell "no amount yet" apart from "invalid amount".

import type { Language } from '../../i18n';

/** Accepts "12,50" / "12.50", rejects thousands separators or stray characters.
 * In English, a comma is a grouping separator and is therefore rejected instead of
 * silently turning an input such as "1,000" into the value `1`.
 * Returns `null` — never a partial/garbage value — for anything that isn't a clean
 * positive decimal. */
export function parseAmt(raw: string | number | null | undefined, language?: Language): number | null {
  const normalized = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (language === 'en' && normalized.includes(',')) return null;
  const s = normalized.replace(',', '.');
  if (!/^[0-9]*\.?[0-9]+$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const LOCALES: Record<Language, string> = { en: 'en-GB', de: 'de-CH', it: 'it-CH', fr: 'fr-CH' };

export function localeFor(language: Language): string {
  return LOCALES[language];
}

/** Currency-formatted fiat amount, e.g. "€ 100.00" / "CHF 100.00" (locale-aware symbol + grouping). */
export function formatFiat(amount: number, currencyCode: string, language: Language): string {
  try {
    return new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

/** Plain grouped number, e.g. nfmt(1.23456789, 6) → "1.234568" — for crypto amounts and rates. */
export function formatAmount(amount: number, decimals: number, language: Language): string {
  try {
    return amount.toLocaleString(localeFor(language), { maximumFractionDigits: decimals });
  } catch {
    return amount.toFixed(Math.min(decimals, 8));
  }
}

/** Just the currency symbol/code ("€", "CHF", ...) — for compact labels like the quick-amount chips. */
export function fiatSymbol(currencyCode: string, language: Language): string {
  try {
    const parts = new Intl.NumberFormat(localeFor(language), {
      style: 'currency',
      currency: currencyCode,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? currencyCode;
  } catch {
    return currencyCode;
  }
}

/** Fixed symbol table for the quick-amount chips ("€50", "CHF 500"), byte-for-byte the static
 * app's `SYM`/`sym()` (public/app2/index.html: `const SYM={EUR:"€",CHF:"CHF ",USD:"$",GBP:"£"};
 * const sym=c=>SYM[c]||(c+" ");`). Intentionally NOT locale-aware like `fiatSymbol` above — in
 * de-CH, `Intl.NumberFormat` renders EUR's currency part as the literal string "EUR" (no "€"
 * glyph in that locale's CLDR data), which produced chips reading "EUR50" instead of "€50". */
const QUICK_CHIP_SYMBOLS: Record<string, string> = { EUR: '€', CHF: 'CHF ', USD: '$', GBP: '£' };

export function quickChipSymbol(currencyCode: string): string {
  return QUICK_CHIP_SYMBOLS[currencyCode] ?? `${currencyCode} `;
}

/** "0x1234…abcd" — same truncation the static app used for wallet addresses (`short()`). */
export function shortAddress(address: string | undefined, head = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export { isSafeHttpsUrl as isHttpsUrl } from '../../utils/url';
