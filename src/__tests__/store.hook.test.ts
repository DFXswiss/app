jest.mock('../util/client-error', () => ({ reportClientError: jest.fn() }));

import { renderHook, act } from '@testing-library/react';
import { useStore } from '../hooks/store.hook';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

describe('useStore', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });
    localStorageMock.clear();
    sessionStorage.clear();
  });

  describe('redirectUri', () => {
    it('keeps the redirectUri in sessionStorage, not in localStorage', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.redirectUri.set('https://example.com/redirect');
      });

      expect(sessionStorage.getItem('dfx.srv.redirectUri')).toBe('https://example.com/redirect');
      expect(localStorageMock.getItem('dfx.srv.redirectUri')).toBeNull();

      act(() => {
        result.current.redirectUri.remove();
      });

      expect(sessionStorage.getItem('dfx.srv.redirectUri')).toBeNull();
    });

    it('does not read a redirectUri an older version left in localStorage', () => {
      localStorageMock.setItem('dfx.srv.redirectUri', 'https://example.com/old');
      const { result } = renderHook(() => useStore());

      expect(result.current.redirectUri.get()).toBeUndefined();
    });

    it('removes the redirectUri an older version left in localStorage', () => {
      localStorageMock.setItem('dfx.srv.redirectUri', 'https://example.com/old');
      sessionStorage.setItem('dfx.srv.redirectUri', 'https://example.com/current');
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.redirectUri.removeLegacy();
      });

      expect(localStorageMock.getItem('dfx.srv.redirectUri')).toBeNull();
      expect(result.current.redirectUri.get()).toBe('https://example.com/current');
    });

    it('should set and get redirectUri', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.redirectUri.set('https://example.com/redirect');
      });
      
      expect(result.current.redirectUri.get()).toBe('https://example.com/redirect');
    });

    it('should return undefined when not set', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.redirectUri.get()).toBeUndefined();
    });

    it('should remove redirectUri', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.redirectUri.set('https://example.com');
        result.current.redirectUri.remove();
      });
      
      expect(result.current.redirectUri.get()).toBeUndefined();
    });
  });

  describe('balances', () => {
    it('should set and get balances', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.balances.set('100.50');
      });
      
      expect(result.current.balances.get()).toBe('100.50');
    });

    it('should remove balances', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.balances.set('100.50');
        result.current.balances.remove();
      });

      expect(result.current.balances.get()).toBeUndefined();
    });
  });

  describe('language', () => {
    it('should set and get language', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.language.set('de');
      });
      
      expect(result.current.language.get()).toBe('de');
    });

    it('should support different languages', () => {
      const { result } = renderHook(() => useStore());
      
      const languages = ['en', 'de', 'fr', 'it'];
      
      languages.forEach(lang => {
        act(() => {
          result.current.language.set(lang);
        });
        expect(result.current.language.get()).toBe(lang);
      });
    });

    it('should remove language', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.language.set('de');
        result.current.language.remove();
      });

      expect(result.current.language.get()).toBeUndefined();
    });
  });

  describe('activeWallet', () => {
    it('should set and get activeWallet', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.activeWallet.set('MetaMask' as any);
      });
      
      expect(result.current.activeWallet.get()).toBe('MetaMask');
    });

    it('should remove activeWallet', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.activeWallet.set('MetaMask' as any);
        result.current.activeWallet.remove();
      });

      expect(result.current.activeWallet.get()).toBeUndefined();
    });
  });

  describe('infoBanner', () => {
    it('should set and get infoBanner as JSON', () => {
      const { result } = renderHook(() => useStore());
      
      const banner = { message: 'Test banner', type: 'info' };
      
      act(() => {
        result.current.infoBanner.set(banner as any);
      });
      
      expect(result.current.infoBanner.get()).toEqual(banner);
    });

    it('should return undefined when not set', () => {
      const { result } = renderHook(() => useStore());
      expect(result.current.infoBanner.get()).toBeUndefined();
    });

    it('should remove infoBanner', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.infoBanner.set({ message: 'Test banner', type: 'info' } as any);
        result.current.infoBanner.remove();
      });

      expect(result.current.infoBanner.get()).toBeUndefined();
    });
  });

  describe('queryParams', () => {
    it('should set and get queryParams as JSON', () => {
      const { result } = renderHook(() => useStore());
      
      const params = { mode: 'buy', blockchain: 'Bitcoin' };
      
      act(() => {
        result.current.queryParams.set(params as any);
      });
      
      expect(result.current.queryParams.get()).toEqual(params);
    });

    it('should handle complex objects', () => {
      const { result } = renderHook(() => useStore());
      
      const params = {
        mode: 'sell',
        blockchain: 'Ethereum',
        nested: { value: 123 },
        array: [1, 2, 3],
      };
      
      act(() => {
        result.current.queryParams.set(params as any);
      });
      
      expect(result.current.queryParams.get()).toEqual(params);
    });

    it('should remove queryParams', () => {
      const { result } = renderHook(() => useStore());

      act(() => {
        result.current.queryParams.set({ mode: 'buy', blockchain: 'Bitcoin' } as any);
        result.current.queryParams.remove();
      });

      expect(result.current.queryParams.get()).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should persist data across hook instances', () => {
      const { result: result1 } = renderHook(() => useStore());
      
      act(() => {
        result1.current.language.set('de');
      });
      
      const { result: result2 } = renderHook(() => useStore());
      
      expect(result2.current.language.get()).toBe('de');
    });
  });

  describe('blocked and invalid storage', () => {
    it('useStore does not throw when window.localStorage getter throws', () => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Denied', 'SecurityError');
        },
        configurable: true,
      });

      expect(() => renderHook(() => useStore())).not.toThrow();
      const { result } = renderHook(() => useStore());
      expect(result.current.balances.get()).toBeUndefined();
      expect(() => result.current.balances.set('x')).not.toThrow();
      expect(() => result.current.balances.remove()).not.toThrow();
      expect(() => result.current.redirectUri.removeLegacy()).not.toThrow();
    });

    it('redirectUri does not throw when window.sessionStorage is blocked', () => {
      const original = window.sessionStorage;
      const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
      try {
        Object.defineProperty(window, 'sessionStorage', {
          get() {
            throw new DOMException('Denied', 'SecurityError');
          },
          configurable: true,
        });

        const { result } = renderHook(() => useStore());
        expect(result.current.redirectUri.get()).toBeUndefined();
        expect(() => result.current.redirectUri.set('https://example.com')).not.toThrow();
        expect(() => result.current.redirectUri.remove()).not.toThrow();

        Object.defineProperty(window, 'sessionStorage', {
          value: {
            getItem: () => null,
            setItem: () => {
              throw quota;
            },
            removeItem: () => undefined,
            clear: () => undefined,
          },
          configurable: true,
        });

        expect(() => result.current.redirectUri.set('https://example.com')).not.toThrow();
        expect(result.current.redirectUri.get()).toBeUndefined();
        expect(() => result.current.redirectUri.remove()).not.toThrow();
      } finally {
        Object.defineProperty(window, 'sessionStorage', { configurable: true, value: original });
      }
    });

    it.each(['undefined', '<!doctype html>', '{kaputt'])(
      'queryParams.get on stored %j returns undefined and removes the key',
      (raw) => {
        localStorageMock.setItem('dfx.srv.queryParams', raw);
        const { result } = renderHook(() => useStore());
        expect(result.current.queryParams.get()).toBeUndefined();
        expect(localStorageMock.getItem('dfx.srv.queryParams')).toBeNull();
      },
    );

    it('set and setJson do not throw on QuotaExceededError by name', () => {
      const quota = new Error('quota');
      quota.name = 'QuotaExceededError';
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw quota;
          },
          removeItem: () => undefined,
          clear: () => undefined,
        },
        configurable: true,
      });

      const { result } = renderHook(() => useStore());
      expect(() => result.current.balances.set('x')).not.toThrow();
      expect(() => result.current.queryParams.set({ mode: 'buy' } as any)).not.toThrow();
    });

    it('set does not throw on QuotaExceededError DOMException', () => {
      const quota = new DOMException('Quota exceeded', 'QuotaExceededError');
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => {
            throw quota;
          },
          removeItem: () => undefined,
          clear: () => undefined,
        },
        configurable: true,
      });

      const { result } = renderHook(() => useStore());
      expect(() => result.current.language.set('de')).not.toThrow();
      expect(() => result.current.infoBanner.set({ message: 'x' } as any)).not.toThrow();
    });
  });
});
