import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PasskeyWalletHistory, { PasskeyHistory, PasskeyTx } from '../components/home/wallet/passkey-wallet-history';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_: string, text: string) => text }),
}));

const items: PasskeyTx[] = Array.from({ length: 6 }, (_, index) => ({
  type: 'receive',
  title: `Transaction ${index}`,
  date: '2026-11-06',
  amount: '1 BTC',
  fiatValue: '1 CHF',
}));

describe('Passkey wallet history', () => {
  it('shows a loading state without a source and an honest empty state', () => {
    const { rerender } = render(<PasskeyWalletHistory />);
    expect(screen.getByLabelText('Loading transactions').children).toHaveLength(3);
    rerender(<PasskeyWalletHistory history={{ items: [], hasMore: false, loadMore: async () => undefined }} />);
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });

  it('shows five entries, expands and loads more when the sentinel intersects', async () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = jest.fn();
    const disconnect = jest.fn();
    const original = global.IntersectionObserver;
    global.IntersectionObserver = class {
      constructor(next: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        callback = next;
        expect(options?.rootMargin).toBe('300px');
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = jest.fn();
      takeRecords = jest.fn(() => []);
      root = null;
      rootMargin = '300px';
      thresholds = [];
    } as unknown as typeof IntersectionObserver;
    try {
      let finish: (() => void) | undefined;
      const loadMore = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const history: PasskeyHistory = { items, hasMore: true, loadMore };
      const { rerender } = render(<PasskeyWalletHistory history={history} />);
      expect(screen.queryByText('Transaction 5')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(screen.getByText('Transaction 5')).toBeInTheDocument();
      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(loadMore).toHaveBeenCalledTimes(1);
      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(loadMore).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Loading more transactions').children).toHaveLength(3);
      await act(async () => finish?.());
      rerender(<PasskeyWalletHistory history={{ ...history, hasMore: false }} />);
      await waitFor(() => expect(screen.getByText('That is all your transactions.')).toBeInTheDocument());
      expect(observe).toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      global.IntersectionObserver = original;
    }
  });

  it('reports a failed load and allows retrying', async () => {
    let callback: IntersectionObserverCallback | undefined;
    const original = global.IntersectionObserver;
    global.IntersectionObserver = class {
      constructor(next: IntersectionObserverCallback) {
        callback = next;
      }
      observe = jest.fn();
      disconnect = jest.fn();
      unobserve = jest.fn();
      takeRecords = jest.fn(() => []);
      root = null;
      rootMargin = '300px';
      thresholds = [];
    } as unknown as typeof IntersectionObserver;
    try {
      const loadMore = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
      render(<PasskeyWalletHistory history={{ items, hasMore: true, loadMore }} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      act(() => callback?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(loadMore).not.toHaveBeenCalled();
      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(await screen.findByText('Could not load transactions.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.queryByText('Could not load transactions.')).not.toBeInTheDocument());
      act(() => callback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
    } finally {
      global.IntersectionObserver = original;
    }
  });
  it('shows pending status and keeps the expanded list usable without IntersectionObserver', () => {
    const original = global.IntersectionObserver;
    global.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    try {
      render(
        <PasskeyWalletHistory
          history={{ items: [{ ...items[0], pending: true }], hasMore: true, loadMore: async () => undefined }}
        />,
      );
      expect(screen.getByText(/Pending/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(screen.getByText('Transaction 0')).toBeInTheDocument();
    } finally {
      global.IntersectionObserver = original;
    }
  });
});
