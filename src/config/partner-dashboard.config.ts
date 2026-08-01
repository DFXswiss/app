import { createElement, ReactNode } from 'react';
import { CakeLogo } from 'src/partner-dashboard/logos/cake-logo';

export interface PartnerBrand {
  key: string;
  displayName: string;
  /** Full product title (document <title> / meta only — not repeated next to logos). */
  title: string;
  /**
   * Partner brand accent — reserved for rare brand marks, not for full-width UI chrome.
   * Active filters use FILTER_ACTIVE_COLOR (dfxBlue) instead so two loud fills do not compete.
   */
  accent: string;
  logo: ReactNode;
}

/**
 * Whitelabel partner registry. Selection via REACT_APP_PARTNER_KEY (default: cake).
 * Do not branch on partner key outside this module.
 */
export const PARTNER_BRANDS: Record<string, PartnerBrand> = {
  cake: {
    key: 'cake',
    displayName: 'Cake',
    title: 'DFX × Cake',
    // Kept for brand identity; not used as a full-button fill (see FILTER_ACTIVE_COLOR).
    accent: '#E91E8C',
    // Larger mark on dark ground (currentColor → white via header). Equal optical weight to DFX wordmark.
    logo: createElement(CakeLogo, { className: 'h-9 w-auto text-white', title: 'Cake' }),
  },
};

export const DEFAULT_PARTNER_KEY = 'cake';

export function resolvePartnerKey(envKey?: string | null): string {
  const key = (envKey ?? process.env.REACT_APP_PARTNER_KEY ?? DEFAULT_PARTNER_KEY).toLowerCase().trim();
  if (PARTNER_BRANDS[key]) return key;
  return DEFAULT_PARTNER_KEY;
}

export function getPartnerBrand(key?: string | null): PartnerBrand {
  const resolved = resolvePartnerKey(key);
  const brand = PARTNER_BRANDS[resolved];
  if (brand) return brand;
  const fallback = PARTNER_BRANDS.cake;
  if (fallback == null) {
    throw new Error('Default partner brand "cake" is not registered');
  }
  return fallback;
}

/**
 * Series colours for buy / sell / swap — categories only (time-series charts).
 *
 * Kauf/Verkauf use the two checked DFX accents (red + blue). Swap is deliberately
 * dfxGray, not a third accent: at this partner it is by far the smallest series, so
 * grey marks it as a residual category rather than an equal third colour. That is a
 * conscious deviation from the saturation rule and is only acceptable because Swap is
 * always named in the legend, the tooltip, and the collapsible table view — colour is
 * never the sole identity channel.
 */
export const SERIES_COLORS = {
  buy: '#F5516C', // DFX-Rot (dfxRed-100)
  sell: '#1F6FD0', // Blau
  swap: '#9AA5B8', // dfxGray-700 — residual, not a third accent (see comment above)
} as const;

export const SERIES_LABELS = {
  buy: 'Kauf',
  sell: 'Verkauf',
  swap: 'Swap',
} as const;

/**
 * Completion state scale — red/blue/gray only (no green, no yellow).
 * Shared by Stage A and Stage B with identical mapping; never code a positive state in red.
 *
 * good      → Zahlung eingegangen / Ausgeliefert   kräftiges Blau  (#1F6FD0)
 * pending   → Wartet auf Zahlung / In Bearbeitung  helles Blau    (dfxGray-600 cool, clearly lighter)
 * absent    → Keine Zahlung                        Grau           (dfxGray-800)
 * rejected  → Abgelehnt                            Rot            (#F5516C / dfxRed-100)
 *
 * Pending uses a much lighter cool tone than good so the two blues separate in a stacked bar
 * (a mid dfxBlue-300 step is too close to #1F6FD0 by ΔE). If they still merge, lighten pending
 * further — do not switch hue family.
 */
export const STATE_COLORS = {
  good: '#1F6FD0',
  pending: '#B8C4D8', // dfxGray-600 — light cool blue-gray, clearly above good on the bar
  absent: '#65728A', // dfxGray-800
  rejected: '#F5516C', // dfxRed-100 — negative outcome only
} as const;

export type CompletionState = keyof typeof STATE_COLORS;

/** Active filter control fill — dfxBlue-400, not the partner magenta accent. */
export const FILTER_ACTIVE_COLOR = '#124370';

/** Partial-bucket band in charts — quiet cool gray, not yellow. */
export const PARTIAL_BAND_COLOR = '#9AA5B8'; // dfxGray-700

/** Suppressed-bucket band in charts — darker cool slate so it reads as withheld, not incomplete. */
export const SUPPRESSED_BAND_COLOR = '#65728A'; // dfxGray-800

/**
 * Product program name — same for every partner. Not part of brand.title (document title only)
 * and not configured per partner.
 */
export const PARTNER_PROGRAM_NAME = 'Non-Custodial Partner Program';
