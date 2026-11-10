import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PasskeyWalletHistory, { PasskeyHistory, PasskeyTx } from '../components/home/wallet/passkey-wallet-history';

jest.mock('../contexts/settings.context', () => ({
  useSettingsContext: () => ({ translate: (_: string, text: string) => text }),
}));

const items: PasskeyTx[] = Array.from({ length: 6 }, (_, index) => ({
  type: 'receive',
  direction: 'in',
  title: `Transaction ${index}`,
  date: '2026-11-06',
  amount: '1 BTC',
  fiatValue: '1 CHF',
}));

describe('Passkey wallet history', () => {
  it.each([
    ['buy', 'in', '-1 BTC', 'text-dfxGreen-300', 'M12 5v14M5 12h14'],
    ['buy', 'out', '+1 BTC', '', 'M12 5v14M5 12h14'],
    ['receive', 'in', '1 BTC', 'text-dfxGreen-300', 'M17 7L7 17M15 17H7V9'],
    [
      'sell',
      'out',
      '-1 BTC',
      '',
      'M3 8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
    ],
    ['swap', 'out', '1 BTC', '', 'M5 8h13l-3-3M19 16H6l3 3'],
    ['swap', 'in', '-1 BTC', 'text-dfxGreen-300', 'M5 8h13l-3-3M19 16H6l3 3'],
    ['send', 'out', '-1 BTC', '', 'M7 17L17 7M9 7h8v8'],
    [
      'pay',
      'out',
      '-1 BTC',
      '',
      'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10',
    ],
  ] as const)('renders the %s transaction icon and %s amount', (type, direction, amount, color, path) => {
    render(
      <PasskeyWalletHistory
        history={{ items: [{ ...items[0], type, direction, amount }], hasMore: false, loadMore: async () => undefined }}
      />,
    );
    const title = screen.getByText('Transaction 0');
    const row = title.parentElement?.parentElement;
    expect(row?.querySelector('svg path')).toHaveAttribute('d', path);
    expect(row?.querySelector('svg')?.parentElement).toHaveClass('bg-dfxGray-300', 'rounded-[10px]');
    const value = screen.getByText(amount);
    expect(value).toHaveClass('font-semibold');
    if (color) expect(value).toHaveClass(color);
    else expect(value).not.toHaveClass('text-dfxGreen-300');
  });

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
      for (let index = 0; index < 5; index += 1) {
        expect(screen.getByText(`Transaction ${index}`)).toBeInTheDocument();
      }
      expect(screen.queryByText('Transaction 5')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show more' })).toHaveClass('w-full', 'min-h-[48px]');
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
    const callbacks: IntersectionObserverCallback[] = [];
    const original = global.IntersectionObserver;
    global.IntersectionObserver = class {
      constructor(next: IntersectionObserverCallback) {
        callbacks.push(next);
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
      const first = callbacks[0];
      expect(first).toBeDefined();
      act(() => first?.([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(loadMore).not.toHaveBeenCalled();
      act(() => first?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      expect(await screen.findByText('Could not load transactions.')).toBeInTheDocument();
      const beforeRetry = callbacks.length;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.queryByText('Could not load transactions.')).not.toBeInTheDocument());
      expect(callbacks.length).toBeGreaterThan(beforeRetry);
      const retry = callbacks[callbacks.length - 1];
      expect(retry).not.toBe(first);
      act(() => retry?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      await waitFor(() => expect(loadMore).toHaveBeenCalledTimes(2));
    } finally {
      global.IntersectionObserver = original;
    }
  });
  it('shows pending status and expands the existing list without IntersectionObserver', () => {
    const original = global.IntersectionObserver;
    global.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
    try {
      render(
        <PasskeyWalletHistory
          history={{ items: [{ ...items[0], pending: true }], hasMore: true, loadMore: async () => undefined }}
        />,
      );
      expect(screen.getByText('Payout pending')).toBeInTheDocument();
      expect(screen.getByText('Payout pending')).toHaveClass('text-[#8A5A00]');
      expect(screen.getByText('1 BTC')).toHaveClass('text-[#8A5A00]');
      expect(screen.getByText('Transaction 0').parentElement?.parentElement?.querySelector('svg path')).toHaveAttribute(
        'd',
        'M12 7v5l3 2M12 3a9 9 0 110 18 9 9 0 010-18z',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    } finally {
      global.IntersectionObserver = original;
    }
  });
});
