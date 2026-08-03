import { useCallback, useEffect, useState } from 'react';

export type PartnerTheme = 'light' | 'dark';

export const PARTNER_THEME_STORAGE_KEY = 'partner-dashboard-theme';
export const PARTNER_LANG_STORAGE_KEY = 'partner-dashboard-language';

export type PartnerLanguage = 'de' | 'en';

/** Series colours validated for each surface (dataviz skill). Not from the design pod. */
export const SERIES_COLORS_BY_THEME: Record<
  PartnerTheme,
  { buy: string; sell: string; swap: string }
> = {
  light: {
    buy: '#1e6ef7',
    sell: '#0f9b8e',
    swap: '#8b5cf6',
  },
  dark: {
    buy: '#3f86fb',
    sell: '#19a08f',
    swap: '#9a7bf2',
  },
};

/** Sequential bar shades — cool blue family, theme-aware (not pod hex in component code). */
export const SEQUENTIAL_BAR_COLORS_BY_THEME: Record<PartnerTheme, readonly string[]> = {
  light: ['#1e6ef7', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#f8fafc'],
  dark: ['#3f86fb', '#5a81bb', '#4a6fa0', '#3d5a80', '#2a4a70', '#1d3a5c', '#152d4a', '#0d2240'],
};

export function readStoredTheme(): PartnerTheme | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PARTNER_THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // ignore storage errors
  }
  return null;
}

/**
 * Partner dashboard defaults to light when nothing is stored.
 * Deliberate product choice: do not follow prefers-color-scheme (even if the
 * OS is dark) so first paint stays light until the user picks a theme.
 */
export function resolveInitialTheme(): PartnerTheme {
  return readStoredTheme() ?? 'light';
}

export function persistTheme(theme: PartnerTheme): void {
  try {
    window.localStorage.setItem(PARTNER_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

export function readStoredLanguage(): PartnerLanguage | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PARTNER_LANG_STORAGE_KEY);
    if (raw === 'de' || raw === 'en') return raw;
  } catch {
    // ignore
  }
  return null;
}

export function persistLanguage(lang: PartnerLanguage): void {
  try {
    window.localStorage.setItem(PARTNER_LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

/** Theme class names applied on the partner root (and probe elements). */
export function themeClassName(theme: PartnerTheme): string {
  return theme === 'light' ? 'theme-light' : 'theme-dark';
}

/** Read a CSS custom property from the partner root (or documentElement). */
export function readCssVar(name: string, el?: Element | null): string {
  const target =
    el ??
    (typeof document !== 'undefined'
      ? document.getElementById('partner-dashboard-root') ?? document.documentElement
      : null);
  if (!target || typeof getComputedStyle === 'undefined') return '';
  return getComputedStyle(target).getPropertyValue(name).trim();
}

/**
 * Read a pod CSS variable for a given theme — never from a stale host class.
 *
 * Chart options are built during React render (useMemo). At that moment the
 * committed DOM may still carry the previous theme class, so reading
 * `#partner-dashboard-root` yields the wrong colours (white legend on light
 * surface after dark→light). Prefer the live root only when its class already
 * matches; otherwise resolve against a short-lived probe that carries the
 * requested theme class (pod tokens live on `.theme-light` / `.theme-dark`).
 */
export function readThemeCssVar(name: string, theme: PartnerTheme): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return '';

  const expected = themeClassName(theme);
  const root = document.getElementById('partner-dashboard-root');
  if (root?.classList.contains(expected)) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  const probe = document.createElement('div');
  probe.className = expected;
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  document.documentElement.appendChild(probe);
  try {
    return getComputedStyle(probe).getPropertyValue(name).trim();
  } finally {
    probe.remove();
  }
}

const HATCH_PATTERN_ID = 'partner-suppressed-hatch';

/**
 * Ensure an SVG diagonal-hatch pattern exists and matches the current text colour.
 * Used for suppressed timeline buckets (second encoding for CVD / print).
 */
export function ensureSuppressedHatchPattern(root?: Element | null): void {
  if (typeof document === 'undefined') return;
  const host = root ?? document.getElementById('partner-dashboard-root');
  const textColor = readCssVar('--text', host) || '#a8b5c8';

  let svg = document.getElementById('partner-hatch-defs') as SVGSVGElement | null;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'partner-hatch-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.overflow = 'hidden';
    document.body.appendChild(svg);
  }

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
  }

  let pattern = defs.querySelector(`#${HATCH_PATTERN_ID}`) as SVGPatternElement | null;
  if (!pattern) {
    pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', HATCH_PATTERN_ID);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '8');
    pattern.setAttribute('height', '8');
    pattern.setAttribute('patternTransform', 'rotate(45)');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('y1', '0');
    line.setAttribute('x2', '0');
    line.setAttribute('y2', '8');
    line.setAttribute('stroke-width', '1.25');
    line.setAttribute('stroke-opacity', '0.28');
    pattern.appendChild(line);
    defs.appendChild(pattern);
  }

  const line = pattern.querySelector('line');
  if (line) {
    line.setAttribute('stroke', textColor);
  }
}

export function usePartnerTheme(): {
  theme: PartnerTheme;
  setTheme: (theme: PartnerTheme) => void;
  toggleTheme: () => void;
} {
  const [theme, setThemeState] = useState<PartnerTheme>(() => resolveInitialTheme());

  const setTheme = useCallback((next: PartnerTheme) => {
    setThemeState(next);
    persistTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: PartnerTheme = prev === 'dark' ? 'light' : 'dark';
      persistTheme(next);
      return next;
    });
  }, []);

  useEffect(() => {
    ensureSuppressedHatchPattern();
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
