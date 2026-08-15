import { renderHook, act } from '@testing-library/react';
import { useSessionStore } from '../hooks/session-store.hook';

// Mock sessionStorage
const sessionStorageMock = (() => {
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

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

describe('useSessionStore', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
  });

  describe('supportIssueUid', () => {
    it('should return undefined when not set', () => {
      const { result } = renderHook(() => useSessionStore());
      expect(result.current.supportIssueUid.get()).toBeUndefined();
    });

    it('should set and get supportIssueUid', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('issue-uid-123');
      });

      expect(result.current.supportIssueUid.get()).toBe('issue-uid-123');
    });

    it('should remove supportIssueUid', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('issue-uid-123');
        result.current.supportIssueUid.remove();
      });

      expect(result.current.supportIssueUid.get()).toBeUndefined();
    });
  });

  describe('paymentLinkApiUrlStore', () => {
    it('should return undefined when not set', () => {
      const { result } = renderHook(() => useSessionStore());
      expect(result.current.paymentLinkApiUrlStore.get()).toBeUndefined();
    });

    it('should set and get paymentLinkApiUrlStore', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.paymentLinkApiUrlStore.set('https://api.example.com/payment');
      });

      expect(result.current.paymentLinkApiUrlStore.get()).toBe('https://api.example.com/payment');
    });

    it('should remove paymentLinkApiUrlStore', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.paymentLinkApiUrlStore.set('https://api.example.com/payment');
        result.current.paymentLinkApiUrlStore.remove();
      });

      expect(result.current.paymentLinkApiUrlStore.get()).toBeUndefined();
    });
  });

  describe('editMailReturn', () => {
    it('should return undefined when not set', () => {
      const { result } = renderHook(() => useSessionStore());
      expect(result.current.editMailReturn.get()).toBeUndefined();
    });

    it('should set and get editMailReturn', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.editMailReturn.set('/account');
      });

      expect(result.current.editMailReturn.get()).toBe('/account');
    });

    it('should remove editMailReturn', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.editMailReturn.set('/account');
        result.current.editMailReturn.remove();
      });

      expect(result.current.editMailReturn.get()).toBeUndefined();
    });
  });

  describe('isolation', () => {
    it('should not leak values between keys', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('uid-only');
        result.current.paymentLinkApiUrlStore.set('https://api.example.com');
        result.current.editMailReturn.set('/settings');
      });

      expect(result.current.supportIssueUid.get()).toBe('uid-only');
      expect(result.current.paymentLinkApiUrlStore.get()).toBe('https://api.example.com');
      expect(result.current.editMailReturn.get()).toBe('/settings');

      act(() => {
        result.current.paymentLinkApiUrlStore.remove();
      });

      expect(result.current.supportIssueUid.get()).toBe('uid-only');
      expect(result.current.paymentLinkApiUrlStore.get()).toBeUndefined();
      expect(result.current.editMailReturn.get()).toBe('/settings');
    });
  });

  describe('persistence', () => {
    it('should persist data across hook instances', () => {
      const { result: result1 } = renderHook(() => useSessionStore());

      act(() => {
        result1.current.supportIssueUid.set('persisted-uid');
        result1.current.paymentLinkApiUrlStore.set('https://persisted.example.com');
        result1.current.editMailReturn.set('/persisted-path');
      });

      const { result: result2 } = renderHook(() => useSessionStore());

      expect(result2.current.supportIssueUid.get()).toBe('persisted-uid');
      expect(result2.current.paymentLinkApiUrlStore.get()).toBe('https://persisted.example.com');
      expect(result2.current.editMailReturn.get()).toBe('/persisted-path');
    });
  });
});
