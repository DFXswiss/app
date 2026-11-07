import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';

export interface PasskeyTx {
  type: 'buy' | 'sell' | 'swap' | 'send' | 'receive' | 'pay';
  title: string;
  date: string;
  amount: string;
  direction: 'in' | 'out';
  fiatValue: string;
  pending?: boolean;
}
export interface PasskeyHistory {
  items: PasskeyTx[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

const icons: Record<PasskeyTx['type'] | 'clock', string> = {
  buy: 'M12 5v14M5 12h14',
  sell: 'M3 8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z',
  swap: 'M5 8h13l-3-3M19 16H6l3 3',
  send: 'M7 17L17 7M9 7h8v8',
  receive: 'M17 7L7 17M15 17H7V9',
  pay: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M7 12h10',
  clock: 'M12 7v5l3 2M12 3a9 9 0 110 18 9 9 0 010-18z',
};

export default function PasskeyWalletHistory({ history }: { history?: PasskeyHistory }): JSX.Element {
  const { translate } = useSettingsContext();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const marker = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  useEffect(() => {
    if (
      !expanded ||
      loading ||
      error ||
      !history?.hasMore ||
      !marker.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || pending.current) return;
        pending.current = true;
        setLoading(true);
        setError(false);
        void history
          .loadMore()
          .catch(() => setError(true))
          .finally(() => {
            pending.current = false;
            setLoading(false);
          });
      },
      { rootMargin: '300px' },
    );
    observer.observe(marker.current);
    return () => observer.disconnect();
  }, [expanded, history, loading, error]);
  return (
    <section className="mt-8 text-left" aria-label={translate('screens/home', 'History')}>
      <h2 className="text-lg font-bold">{translate('screens/home', 'History')}</h2>
      {!history ? (
        <div aria-label={translate('screens/home', 'Loading transactions')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="my-3 h-12 animate-pulse rounded bg-dfxGray-300" />
          ))}
        </div>
      ) : (
        <>
          {history.items.length === 0 && !history.hasMore && (
            <p className="py-5 text-dfxGray-700">{translate('screens/home', 'No transactions yet.')}</p>
          )}
          {(expanded ? history.items : history.items.slice(0, 5)).map((tx, i) => (
            <div
              key={`${tx.type}:${tx.date}:${i}`}
              className="grid min-h-[64px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 border-b border-dfxGray-300 px-0.5 py-2.5"
            >
              <span
                className={`grid h-10 w-10 place-items-center rounded-[10px] ${tx.pending ? 'bg-[#FFF6E0] text-[#8A5A00]' : 'bg-dfxGray-300 text-dfxBlue-800'}`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={icons[tx.pending ? 'clock' : tx.type]} />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="font-semibold">{tx.title}</div>
                <div className="text-sm text-dfxGray-800">
                  {tx.date}
                  {tx.pending && (
                    <span className="block font-medium text-[#8A5A00]">
                      {translate('screens/home', 'Payout pending')}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`text-base font-semibold ${
                    tx.pending ? 'text-[#8A5A00]' : tx.direction === 'in' ? 'text-dfxGreen-300' : ''
                  }`}
                >
                  {tx.amount}
                </div>
                <div className="text-sm text-dfxGray-800">{tx.fiatValue}</div>
              </div>
            </div>
          ))}
          {!expanded && (history.items.length > 5 || history.hasMore) && (
            <button
              className="mt-2 min-h-[48px] w-full rounded-[12px] border border-dfxGray-500 px-3 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2"
              onClick={() => setExpanded(true)}
            >
              {translate('screens/home', 'Show more')}
            </button>
          )}
          {expanded && loading && (
            <div aria-label={translate('screens/home', 'Loading more transactions')}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="my-3 h-12 animate-pulse rounded bg-dfxGray-300" />
              ))}
            </div>
          )}
          {expanded && error && (
            <div className="text-dfxRed-150">
              <p>{translate('screens/home', 'Could not load transactions.')}</p>
              <button className="min-h-[44px] underline" onClick={() => setError(false)}>
                {translate('screens/home', 'Try again')}
              </button>
            </div>
          )}
          {expanded && history.hasMore && <div ref={marker} className="h-px" />}
          {expanded && !history.hasMore && history.items.length > 0 && (
            <p className="pb-1 pt-5 text-center text-sm text-dfxGray-800">
              {translate('screens/home', 'That is all your transactions.')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
