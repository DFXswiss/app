/**
 * Display formatters for the partner dashboard.
 * null means the value is genuinely absent (e.g. no transactions to average), 0 means a
 * real zero — never conflate them.
 * Locale follows the active UI language (default: en-US, repo base language).
 */

import { getPartnerLocale } from './i18n';

/** Neutral placeholder when a value is not available. */
export const ABSENT_LABEL = '–';

/** Amount with thousands separators and currency code, e.g. "123'456.78 CHF". */
export function formatAmount(
  value: number | null | undefined,
  currency: string,
  fractionDigits = 2,
  locale: string = getPartnerLocale(),
): string {
  if (value == null) return '';
  const formatted = value.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return `${formatted} ${currency}`;
}

/** Whole-number amount (KPIs), still with currency. */
export function formatAmountWhole(
  value: number | null | undefined,
  currency: string,
  locale: string = getPartnerLocale(),
): string {
  return formatAmount(value, currency, 0, locale);
}

/** Count with thousands separators. */
export function formatCount(
  value: number | null | undefined,
  locale: string = getPartnerLocale(),
): string {
  if (value == null) return '';
  return value.toLocaleString(locale, { maximumFractionDigits: 0 });
}

/** Rate 0..1 → "12.3 %". */
export function formatPercent(
  rate: number | null | undefined,
  fractionDigits = 1,
  locale: string = getPartnerLocale(),
): string {
  if (rate == null) return '';
  const pct = rate * 100;
  return `${pct.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} %`;
}

export type DisplayValue =
  | { kind: 'value'; text: string }
  | { kind: 'absent'; text: string }
  | { kind: 'empty'; text: string };

export function displayNullable(
  value: number | null | undefined,
  format: (n: number) => string,
): DisplayValue {
  if (value === null) {
    return { kind: 'absent', text: '–' };
  }
  if (value === undefined) {
    return { kind: 'empty', text: '–' };
  }
  return { kind: 'value', text: format(value) };
}

export function isFixtureMode(): boolean {
  return process.env.REACT_APP_PARTNER_FIXTURE === 'true';
}
