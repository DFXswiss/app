import { SERIES_COLORS_BY_THEME } from 'src/partner-dashboard/util/theme';

/**
 * Partner brand shape used by the header and period controls.
 * Branding is resolved at runtime from public/partner-brands/brands.json
 * (see partner-dashboard/util/brands.ts) — not via REACT_APP_PARTNER_KEY.
 */
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
  /**
   * Absolute (or root-relative) URL of the partner logo under public/partner-brands/.
   * Null = unknown partner fallback: DFX logo + plain display name only (no empty box).
   */
  logoUrl: string | null;
  /** True when no registry entry matched. */
  isFallback?: boolean;
}

/**
 * Series colours for buy / sell / swap — categories only (time-series charts).
 *
 * Validated palette (dataviz skill, both themes pass Helligkeitsband / Chroma / CVD /
 * Normal-distance / contrast). Dark values are checked against navy surface #0d4070,
 * not derived from light. Theme-specific values live in SERIES_COLORS_BY_THEME;
 * this export is the dark default for non-theme callers.
 *
 * Red is reserved for brand actions — not for "Buy" on a revenue dashboard.
 */
export const SERIES_COLORS = SERIES_COLORS_BY_THEME.dark;

/** English base labels (repo language) — UI translates via screens/partner. */
export const SERIES_LABELS = {
  buy: 'Buy',
  sell: 'Sell',
  swap: 'Swap',
} as const;

/**
 * Active filter control fill — design-pod primary (red in dark, blue in light).
 * Components should prefer `var(--primary)`; this constant is a dark-theme fallback
 * for environments without CSS variables (tests).
 */
export const FILTER_ACTIVE_COLOR = 'var(--primary)';

/**
 * Product program name — same for every partner. Not part of brand.title (document title only)
 * and not configured per partner.
 */
export const PARTNER_PROGRAM_NAME = 'Non-Custodial Partner Program';
