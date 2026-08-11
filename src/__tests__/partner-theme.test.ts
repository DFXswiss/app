import { act, renderHook } from '@testing-library/react';
import {
  PARTNER_THEME_STORAGE_KEY,
  persistTheme,
  readCssVar,
  readStoredTheme,
  readThemeCssVar,
  resolveInitialTheme,
  themeClassName,
  usePartnerTheme,
} from 'src/partner-dashboard/util/theme';

describe('partner theme helpers', () => {
  beforeEach(() => {
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    document.getElementById('partner-dashboard-root')?.remove();
  });

  afterEach(() => {
    window.localStorage.removeItem(PARTNER_THEME_STORAGE_KEY);
    document.getElementById('partner-dashboard-root')?.remove();
  });

  it('readStoredTheme returns null for missing or invalid values', () => {
    expect(readStoredTheme()).toBeNull();
    window.localStorage.setItem(PARTNER_THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBeNull();
  });

  it('readStoredTheme returns light/dark when stored', () => {
    window.localStorage.setItem(PARTNER_THEME_STORAGE_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    window.localStorage.setItem(PARTNER_THEME_STORAGE_KEY, 'light');
    expect(readStoredTheme()).toBe('light');
  });

  it('resolveInitialTheme defaults to light when nothing is stored', () => {
    expect(resolveInitialTheme()).toBe('light');
  });

  it('persistTheme writes the value and setTheme/toggleTheme round-trip through the hook', () => {
    const { result } = renderHook(() => usePartnerTheme());
    expect(result.current.theme).toBe('light');

    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(PARTNER_THEME_STORAGE_KEY)).toBe('dark');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('light');
    expect(window.localStorage.getItem(PARTNER_THEME_STORAGE_KEY)).toBe('light');

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
  });

  it('persistTheme swallows localStorage write errors', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => persistTheme('dark')).not.toThrow();
    setItem.mockRestore();
  });

  it('readStoredTheme swallows localStorage read errors', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBeNull();
    getItem.mockRestore();
  });

  it('themeClassName maps light/dark', () => {
    expect(themeClassName('light')).toBe('theme-light');
    expect(themeClassName('dark')).toBe('theme-dark');
  });

  it('readCssVar reads from an explicit element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--text', ' rgb(1, 2, 3) ');
    document.body.appendChild(el);
    expect(readCssVar('--text', el)).toBe('rgb(1, 2, 3)');
    el.remove();
  });

  it('readCssVar falls back to partner-dashboard-root then documentElement', () => {
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    root.style.setProperty('--border', '#abc');
    document.body.appendChild(root);
    expect(readCssVar('--border')).toBe('#abc');
    root.remove();

    // No root → documentElement (may be empty string if unset)
    const fromDoc = readCssVar('--nonexistent-partner-var');
    expect(typeof fromDoc).toBe('string');
  });

  it('readThemeCssVar uses a probe when the live root theme does not match', () => {
    const root = document.createElement('div');
    root.id = 'partner-dashboard-root';
    root.className = 'theme-dark';
    document.body.appendChild(root);

    // Request light while root is dark → probe path (still returns a string)
    const value = readThemeCssVar('--text', 'light');
    expect(typeof value).toBe('string');
    root.remove();
  });

  it('readCssVar returns empty string when getComputedStyle is unavailable', () => {
    const original = window.getComputedStyle;
    Object.defineProperty(window, 'getComputedStyle', {
      configurable: true,
      value: undefined,
    });
    try {
      const el = document.createElement('div');
      expect(readCssVar('--text', el)).toBe('');
    } finally {
      Object.defineProperty(window, 'getComputedStyle', {
        configurable: true,
        value: original,
      });
    }
  });

  it('readThemeCssVar returns empty string when getComputedStyle is unavailable', () => {
    const original = window.getComputedStyle;
    Object.defineProperty(window, 'getComputedStyle', {
      configurable: true,
      value: undefined,
    });
    try {
      expect(readThemeCssVar('--text', 'dark')).toBe('');
    } finally {
      Object.defineProperty(window, 'getComputedStyle', {
        configurable: true,
        value: original,
      });
    }
  });
});
