import {
  readCssVar,
  readStoredTheme,
  readThemeCssVar,
  resolveInitialTheme,
} from 'src/partner-dashboard/util/theme';

/**
 * Covers SSR guards (`typeof window/document === 'undefined'`) that are
 * unreachable under a normal jsdom lifecycle. We temporarily remove the
 * globals at call time so free-var `typeof` checks take the SSR arm, then
 * restore the original property descriptors.
 */
describe('partner theme SSR guards via runtime global deletion', () => {
  it('readStoredTheme returns null when window is removed at call time', () => {
    const g = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
    const descriptor = Object.getOwnPropertyDescriptor(g, 'window');
    expect(descriptor?.configurable).toBe(true);

    // @ts-expect-error test-only: remove window so typeof window === 'undefined'
    delete g.window;
    try {
      expect(typeof window).toBe('undefined');
      expect(readStoredTheme()).toBeNull();
      expect(resolveInitialTheme()).toBe('light');
    } finally {
      if (descriptor) {
        Object.defineProperty(g, 'window', descriptor);
      }
    }
    expect(typeof window).not.toBe('undefined');
  });

  it('readCssVar / readThemeCssVar return empty when document is removed', () => {
    const g = globalThis as typeof globalThis & { document?: Document };
    const descriptor = Object.getOwnPropertyDescriptor(g, 'document');
    expect(descriptor?.configurable).toBe(true);

    // @ts-expect-error test-only
    delete g.document;
    try {
      // el omitted → document branch is null → early return ''
      expect(readCssVar('--text')).toBe('');
      expect(readThemeCssVar('--text', 'dark')).toBe('');
      expect(readThemeCssVar('--text', 'light')).toBe('');
    } finally {
      if (descriptor) {
        Object.defineProperty(g, 'document', descriptor);
      }
    }
    expect(typeof document).not.toBe('undefined');
  });
});
