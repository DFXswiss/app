export type PartnerTheme = 'light' | 'dark';

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

/**
 * Embedded in the main app (light wallet surface). No local theme switcher —
 * main-app chrome has no dark mode to sync with.
 */
export function resolveInitialTheme(): PartnerTheme {
  return 'light';
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
 * Chart options are built during React render (useMemo); resolve against a probe
 * that carries the requested theme class when the live root is not ready.
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
