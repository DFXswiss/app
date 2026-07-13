// DFX App 2.0 — transactions screen.
//
// Ported from the static preview's `v-tx` section (public/app2/index.html,
// markup ~line 938, `buildTx()` / `renderTx()` / `txDetail()` around line
// 4474 for behaviour). Data comes from `useTransaction().getDetailTransactions()`
// — the refund/CSV-export/bank-assignment flows on that screen are out of
// scope here (not part of this milestone's task list).

import { DetailTransaction, TransactionType, useTransaction } from '@dfx.swiss/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { LoadingRow, Sheet, SheetHeader } from '../components/ui';
import { useT } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { dateGroupKey, formatAmount, formatDate, formatNumber, isSafeHttpsUrl, resolveTxUrl } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';

type LoadState = 'loading' | 'error' | 'loaded';

type StateVariant = 'act' | 'pend' | 'ina' | 'warn';

const HISTORY_WINDOW_DAYS = 90;
const HISTORY_WINDOW_MS = HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const PENDING_STATES = new Set([
  'Processing',
  'LiquidityPending',
  'CheckPending',
  'PayoutInProgress',
  'WaitingForPayment',
]);
const WARN_STATES = new Set([
  'Failed',
  'Returned',
  'ReturnPending',
  'LimitExceeded',
  'FeeTooHigh',
  'PriceUndeterminable',
  'KycRequired',
]);

function stateVariant(state: string): StateVariant {
  if (state === 'Completed') return 'act';
  if (PENDING_STATES.has(state)) return 'pend';
  if (WARN_STATES.has(state)) return 'warn';
  return 'ina';
}

const TYPE_STYLE: Record<string, { bg: string; icon: JSX.Element }> = {
  [TransactionType.BUY]: {
    bg: 'rgba(52,211,153,.16)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 5v14M5 12l7 7 7-7"
          stroke="#34D399"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  [TransactionType.SELL]: {
    bg: 'rgba(248,113,113,.16)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 19V5M5 12l7-7 7 7"
          stroke="#F87171"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  [TransactionType.SWAP]: {
    bg: 'rgba(95,168,255,.16)',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M7 8h12l-3-3M17 16H5l3 3"
          stroke="#5FA8FF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
};
const DEFAULT_TYPE_STYLE = {
  bg: 'rgba(255,255,255,.08)',
  icon: (
    <svg viewBox="0 0 24 24" fill="none">
      <circle cx={12} cy={12} r={8} stroke="#8FA0BC" strokeWidth={2} />
    </svg>
  ),
};

const EXT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function KvRow({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div className="kv">
      <span className="kk">{label}</span>
      {href ? (
        <span className="vv">
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>
            {value}
          </a>
        </span>
      ) : (
        <span className="vv">{value}</span>
      )}
    </div>
  );
}

export default function TransactionsScreen() {
  const { t, language } = useT();
  const { isLoggedIn } = useWalletSession();
  const { getDetailTransactions } = useTransaction();
  const titleId = useId();

  const [state, setState] = useState<LoadState>('loading');
  const [transactions, setTransactions] = useState<DetailTransaction[]>([]);
  const [selected, setSelected] = useState<DetailTransaction | undefined>();
  const [rangeStart, setRangeStart] = useState<Date>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const load = () => {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_WINDOW_MS);
    setState('loading');
    setLoadMoreError(false);
    getDetailTransactions(from, to)
      .then((list) => {
        setTransactions([...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        setRangeStart(from);
        setState('loaded');
      })
      .catch(() => setState('error'));
  };

  const loadMore = () => {
    if (!rangeStart || loadingMore) return;
    const to = new Date(rangeStart.getTime() - 1);
    const from = new Date(to.getTime() - HISTORY_WINDOW_MS);
    setLoadingMore(true);
    setLoadMoreError(false);
    getDetailTransactions(from, to)
      .then((list) => {
        setTransactions((current) => {
          const byId = new Map<string, DetailTransaction>();
          [...current, ...list].forEach((transaction, index) => {
            const key = transaction.uid || String(transaction.id ?? `${transaction.date}-${index}`);
            byId.set(key, transaction);
          });
          return [...byId.values()].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
        setRangeStart(from);
      })
      .catch(() => setLoadMoreError(true))
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    load();
    // `load` intentionally omitted — it closes over `getDetailTransactions`,
    // which is re-created every render (no memoization in the hook), and
    // re-running this effect should only be driven by the session state.
  }, [isLoggedIn]);

  const groups = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; items: DetailTransaction[] }>();
    const today = dateGroupKey(new Date());
    const yesterday = dateGroupKey(new Date(Date.now() - 86400000));
    transactions.forEach((tx) => {
      const key = dateGroupKey(tx.date);
      if (!byKey.has(key)) {
        const label = key === today ? t('today') : key === yesterday ? t('yesterday') : formatDate(tx.date, language);
        byKey.set(key, { key, label, items: [] });
      }
      byKey.get(key)?.items.push(tx);
    });
    return [...byKey.values()];
  }, [transactions, language, t]);

  if (!isLoggedIn) return <LoggedOutState title={t('mTx')} />;

  return (
    <div className="account">
      <div className="txhead">
        <h2>{t('mTx')}</h2>
      </div>

      {state === 'loading' && (
        <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
          <LoadingRow label={t('loading')} />
        </div>
      )}

      {state === 'error' && (
        <div
          className="ocp-empty"
          style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: '30px 8px' }}
        >
          <span>{t('loadFail')}</span>
          <button className="btn-mini" style={{ width: 'auto' }} onClick={load}>
            {t('retry')}
          </button>
        </div>
      )}

      {state === 'loaded' && transactions.length === 0 && (
        <div className="sec" style={{ textAlign: 'center', padding: 30 }}>
          {t('noTx')}
        </div>
      )}

      {state === 'loaded' && transactions.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {groups.map((group) => (
            <div key={group.key}>
              <div className="sectionlabel tight">{group.label}</div>
              <div className="glass rowlist">
                {group.items.map((tx, i) => {
                  const style = TYPE_STYLE[tx.type] ?? DEFAULT_TYPE_STYLE;
                  const typeLabel =
                    tx.type === TransactionType.BUY
                      ? t('mBuy')
                      : tx.type === TransactionType.SELL
                        ? t('mSell')
                        : tx.type === TransactionType.SWAP
                          ? t('mSwap')
                          : tx.type;
                  const inA = formatAmount(tx.inputAmount, tx.inputAsset, language);
                  const outA = formatAmount(tx.outputAmount, tx.outputAsset, language);
                  const amount = inA && outA ? `${inA} → ${outA}` : inA || outA;
                  return (
                    <button
                      key={tx.uid || tx.id || i}
                      type="button"
                      className="txrow"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelected(tx)}
                    >
                      <span className="txicon" style={{ background: style.bg }}>
                        {style.icon}
                      </span>
                      <div className="ti">
                        <b>{typeLabel}</b>
                        <small>{formatDate(tx.date, language)}</small>
                      </div>
                      <div className="ta">
                        <b>{amount}</b>
                        <small className={`pill-chip ${stateVariant(tx.state)}`}>{tx.state}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {state === 'loaded' && (
        <>
          {loadMoreError && <div className="paybox-note warn">{t('loadFail')}</div>}
          <button
            className="btn-mini"
            type="button"
            style={{ width: '100%', marginTop: 12 }}
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <LoadingRow label={t('loading')} /> : t('txLoadMore')}
          </button>
        </>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(undefined)} titleId={titleId}>
        {selected && (
          <>
            <SheetHeader
              titleId={titleId}
              title={
                selected.type === TransactionType.BUY
                  ? t('mBuy')
                  : selected.type === TransactionType.SELL
                    ? t('mSell')
                    : selected.type === TransactionType.SWAP
                      ? t('mSwap')
                      : selected.type
              }
              onClose={() => setSelected(undefined)}
            />
            <div className="txbody">
              <KvRow label={t('fPay')} value={formatAmount(selected.inputAmount, selected.inputAsset, language)} />
              <KvRow label={t('fRecv')} value={formatAmount(selected.outputAmount, selected.outputAsset, language)} />
              <KvRow
                label={t('txRate')}
                value={
                  formatNumber(selected.rate ?? selected.exchangeRate, language, 6) === '—'
                    ? ''
                    : formatNumber(selected.rate ?? selected.exchangeRate, language, 6)
                }
              />
              {selected.fees && (
                <>
                  <KvRow label={t('feeDfx')} value={formatAmount(selected.fees.dfx, undefined, language, 8)} />
                  <KvRow label={t('feeNetwork')} value={formatAmount(selected.fees.network, undefined, language, 8)} />
                  {selected.fees.bank > 0 && (
                    <KvRow label={t('feeBank')} value={formatAmount(selected.fees.bank, undefined, language, 8)} />
                  )}
                  <KvRow label={t('totalFee')} value={formatAmount(selected.fees.total, undefined, language, 8)} />
                </>
              )}
              <KvRow label={t('txStatus')} value={selected.state} />
              <KvRow label={t('txRef')} value={selected.externalTransactionId ?? selected.uid} />
              {(() => {
                const href =
                  resolveTxUrl(selected.outputTxUrl, selected.outputBlockchain, selected.outputTxId) ??
                  resolveTxUrl(selected.inputTxUrl, selected.inputBlockchain, selected.inputTxId);
                if (!href || !isSafeHttpsUrl(href)) return null;
                return (
                  <div className="txactions">
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-mini"
                      style={{ textDecoration: 'none', flex: 1 }}
                    >
                      {t('viewTx')} {EXT_ICON}
                    </a>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
