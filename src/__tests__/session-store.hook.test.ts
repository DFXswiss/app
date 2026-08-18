import { renderHook, act } from '@testing-library/react';
import { SessionStoreKey, useSessionStore } from '../hooks/session-store.hook';

describe('useSessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('SessionStoreKey', () => {
    it('uses the owned dfx. prefixes that session cleanup allowlists', () => {
      expect(SessionStoreKey.SUPPORT_ISSUE_UID).toBe('dfx.supportIssueUid');
      expect(SessionStoreKey.PAYMENT_LINK_API_URL).toBe('dfx.paymentLinkApiUrl');
    });
  });

  describe('supportIssueUid', () => {
    it('returns undefined when the key is absent', () => {
      const { result } = renderHook(() => useSessionStore());

      expect(result.current.supportIssueUid.get()).toBeUndefined();
      expect(sessionStorage.getItem(SessionStoreKey.SUPPORT_ISSUE_UID)).toBeNull();
    });

    it('writes under the support-issue key and reads the same value back', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('issue-1');
      });

      expect(sessionStorage.getItem(SessionStoreKey.SUPPORT_ISSUE_UID)).toBe('issue-1');
      expect(result.current.supportIssueUid.get()).toBe('issue-1');
    });

    it('returns an empty string as stored, not as missing', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('');
      });

      expect(result.current.supportIssueUid.get()).toBe('');
    });

    it('removes the stored value so a later get is undefined', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('issue-1');
        result.current.supportIssueUid.remove();
      });

      expect(result.current.supportIssueUid.get()).toBeUndefined();
      expect(sessionStorage.getItem(SessionStoreKey.SUPPORT_ISSUE_UID)).toBeNull();
    });
  });

  describe('paymentLinkApiUrlStore', () => {
    it('returns undefined when the key is absent', () => {
      const { result } = renderHook(() => useSessionStore());

      expect(result.current.paymentLinkApiUrlStore.get()).toBeUndefined();
      expect(sessionStorage.getItem(SessionStoreKey.PAYMENT_LINK_API_URL)).toBeNull();
    });

    it('writes under the payment-link key and reads the same value back', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.paymentLinkApiUrlStore.set('https://api.example/pl');
      });

      expect(sessionStorage.getItem(SessionStoreKey.PAYMENT_LINK_API_URL)).toBe('https://api.example/pl');
      expect(result.current.paymentLinkApiUrlStore.get()).toBe('https://api.example/pl');
    });

    it('removes the stored value so a later get is undefined', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.paymentLinkApiUrlStore.set('https://api.example/pl');
        result.current.paymentLinkApiUrlStore.remove();
      });

      expect(result.current.paymentLinkApiUrlStore.get()).toBeUndefined();
      expect(sessionStorage.getItem(SessionStoreKey.PAYMENT_LINK_API_URL)).toBeNull();
    });
  });

  describe('isolation', () => {
    it('does not overwrite the other owned key', () => {
      const { result } = renderHook(() => useSessionStore());

      act(() => {
        result.current.supportIssueUid.set('issue-1');
        result.current.paymentLinkApiUrlStore.set('https://api.example/pl');
      });

      expect(result.current.supportIssueUid.get()).toBe('issue-1');
      expect(result.current.paymentLinkApiUrlStore.get()).toBe('https://api.example/pl');

      act(() => {
        result.current.supportIssueUid.remove();
      });

      expect(result.current.supportIssueUid.get()).toBeUndefined();
      expect(result.current.paymentLinkApiUrlStore.get()).toBe('https://api.example/pl');
    });

    it('persists values across hook instances', () => {
      const { result: first } = renderHook(() => useSessionStore());

      act(() => {
        first.current.supportIssueUid.set('issue-1');
        first.current.paymentLinkApiUrlStore.set('https://api.example/pl');
      });

      const { result: second } = renderHook(() => useSessionStore());

      expect(second.current.supportIssueUid.get()).toBe('issue-1');
      expect(second.current.paymentLinkApiUrlStore.get()).toBe('https://api.example/pl');
    });
  });
});
