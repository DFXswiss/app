import { useEffect, useRef, useState } from 'react';
import { useSettingsContext } from '../../../contexts/settings.context';

export interface PasskeyTx {
  type: 'buy' | 'sell' | 'swap' | 'send' | 'receive' | 'pay';
  title: string;
  date: string;
  amount: string;
  fiatValue: string;
  pending?: boolean;
}
export interface PasskeyHistory {
  items: PasskeyTx[];
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{translate('screens/home', 'History')}</h2>
        {history && !expanded && (history.items.length > 5 || history.hasMore) && (
          <button className="min-h-[44px] px-3 font-semibold" onClick={() => setExpanded(true)}>
            {translate('screens/home', 'Show more')}
          </button>
        )}
      </div>
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
              className="flex min-h-[64px] items-center justify-between gap-3 border-b border-dfxGray-300 py-2"
            >
              <div>
                <div className="font-semibold">{tx.title}</div>
                <div className="text-sm text-dfxGray-700">
                  {tx.date}
                  {tx.pending ? ` · ${translate('screens/home', 'Pending')}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div>{tx.amount}</div>
                <div className="text-sm text-dfxGray-700">{tx.fiatValue}</div>
              </div>
            </div>
          ))}
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
            <p className="py-4 text-center text-sm text-dfxGray-700">
              {translate('screens/home', 'That is all your transactions.')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
