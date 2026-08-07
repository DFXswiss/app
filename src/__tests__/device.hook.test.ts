// useIsHandheld: UA (isMobile) OR coarse pointer; older Safari uses addListener.

const mockDevice = { isMobile: false };

jest.mock('react-device-detect', () => ({
  get isMobile() {
    return mockDevice.isMobile;
  },
}));

import { act, renderHook } from '@testing-library/react';
import { useIsHandheld } from '../hooks/device.hook';

type Listener = (event?: MediaQueryListEvent) => void;

function installMatchMedia(options: {
  matches: boolean;
  /** Prefer modern API; set false to exercise addListener fallback. */
  modern?: boolean;
}): { listeners: Listener[]; mediaQuery: MediaQueryList } {
  const listeners: Listener[] = [];
  const modern = options.modern !== false;

  const mediaQuery = {
    matches: options.matches,
    media: '(pointer: coarse)',
    onchange: null,
    addEventListener: modern
      ? jest.fn((event: string, cb: Listener) => {
          if (event === 'change') listeners.push(cb);
        })
      : undefined,
    removeEventListener: modern
      ? jest.fn((event: string, cb: Listener) => {
          if (event === 'change') {
            const idx = listeners.indexOf(cb);
            if (idx >= 0) listeners.splice(idx, 1);
          }
        })
      : undefined,
    addListener: jest.fn((cb: Listener) => {
      listeners.push(cb);
    }),
    removeListener: jest.fn((cb: Listener) => {
      const idx = listeners.indexOf(cb);
      if (idx >= 0) listeners.splice(idx, 1);
    }),
    dispatchEvent: jest.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => {
      if (query === '(pointer: coarse)') return mediaQuery;
      return { ...mediaQuery, matches: false };
    }),
  });

  return { listeners, mediaQuery };
}

describe('useIsHandheld', () => {
  beforeEach(() => {
    mockDevice.isMobile = false;
  });

  it('returns false when desktop UA and fine pointer', () => {
    installMatchMedia({ matches: false });
    mockDevice.isMobile = false;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(false);
  });

  it('returns true when isMobile even if pointer is fine', () => {
    installMatchMedia({ matches: false });
    mockDevice.isMobile = true;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(true);
  });

  it('returns true when coarse pointer even if UA is desktop (request desktop site)', () => {
    installMatchMedia({ matches: true });
    mockDevice.isMobile = false;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia is missing and isMobile is false', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    mockDevice.isMobile = false;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(false);
  });

  it('returns true when matchMedia is missing and isMobile is true', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    mockDevice.isMobile = true;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(true);
  });

  it('subscribes via addEventListener and updates on change', () => {
    const { listeners, mediaQuery } = installMatchMedia({ matches: false, modern: true });
    mockDevice.isMobile = false;
    const { result } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(false);
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    act(() => {
      (mediaQuery as unknown as { matches: boolean }).matches = true;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(true);
  });

  it('falls back to addListener when addEventListener is absent (older Safari)', () => {
    const { listeners, mediaQuery } = installMatchMedia({ matches: false, modern: false });
    mockDevice.isMobile = false;
    const { result, unmount } = renderHook(() => useIsHandheld());
    expect(result.current).toBe(false);
    expect(mediaQuery.addListener).toHaveBeenCalledWith(expect.any(Function));
    expect(mediaQuery.addEventListener).toBeUndefined();

    act(() => {
      (mediaQuery as unknown as { matches: boolean }).matches = true;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe(true);

    unmount();
    expect(mediaQuery.removeListener).toHaveBeenCalled();
  });

  it('cleans up the modern change listener on unmount', () => {
    const { mediaQuery } = installMatchMedia({ matches: false, modern: true });
    const { unmount } = renderHook(() => useIsHandheld());
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('subscribes to nothing when neither addEventListener nor addListener exist', () => {
    const mediaQuery = {
      matches: true,
      media: '(pointer: coarse)',
      onchange: null,
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: jest.fn().mockReturnValue(mediaQuery),
    });
    mockDevice.isMobile = false;
    const { result, unmount } = renderHook(() => useIsHandheld());
    // Initial state still reads matches via readCoarsePointer / update().
    expect(result.current).toBe(true);
    unmount();
  });
});
