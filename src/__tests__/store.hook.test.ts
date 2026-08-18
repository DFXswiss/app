import { renderHook, act } from '@testing-library/react';
import { StoreKey, useStore } from '../hooks/store.hook';

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

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('StoreKey', () => {
    it('exports the localStorage keys a credentialed load must drop', () => {
      expect(StoreKey.AUTH_TOKEN).toBe('dfx.authenticationToken');
      expect(StoreKey.ACTIVE_WALLET).toBe('dfx.srv.activeWallet');
      expect(StoreKey.QUERY_PARAMS).toBe('dfx.srv.queryParams');
    });
  });

  describe('redirectUri', () => {
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

      act(() => {
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

      act(() => {
        result.current.language.remove();
      });

      expect(result.current.language.get()).toBeUndefined();
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
  });

  describe('activeWallet', () => {
    it('should set and get activeWallet', () => {
      const { result } = renderHook(() => useStore());
      
      act(() => {
        result.current.activeWallet.set('MetaMask' as any);
      });
      
      expect(result.current.activeWallet.get()).toBe('MetaMask');

      act(() => {
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

      act(() => {
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
});
