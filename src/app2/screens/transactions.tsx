// DFX App 2.0 — transactions screen.
//
// Ported from the static preview's `v-tx` section (public/app2/index.html,
// markup ~line 938, `buildTx()` / `renderTx()` / `txDetail()` around line
// 4474 for behaviour). Data comes from `useTransaction().getDetailTransactions()`.
// The CSV export (`txHeaderHtml`/`exportCompactCsv`/`exportCoinTracking`) and the
// unmatched-payment assignment flow (`txNoticeHtml`/`openAssign`/`renderAssign`/
// `doAssign`, index.html ~line 4424-4531) are ported here. So is the back button
// (`txBack`, index.html ~line 939), the per-transaction refund flow
// (`isRefundable`/`refundKind`/`startRefund`/`renderRefundForm`/`submitRefund`,
// index.html ~line 4415-4620) via `useTransaction().getTransactionRefund` /
// `setTransactionRefundTarget`, and the "Report a problem" / "My transaction is
// missing" support hand-offs (`txActions`/`wireTxHeader` → `openTicket`,
// index.html ~line 4415-4467).
//
// NOTE: the support hand-off navigates to /support carrying a `supportPreset` in
// react-router location state (type/reason/transactionUid). Pre-selecting that
// topic in the new-issue form requires a one-line follow-up in support.tsx to
// read `useLocation().state` — out of scope for this file. Until then the button
// still opens the support screen, where the "My transaction is missing" /
// "Funds not received" topics already exist in the ticket picker.

import {
  ApiException,
  Country,
  CreditorData,
  DetailTransaction,
  ExportFormat,
  ExportType,
  SupportIssueReason,
  SupportIssueType,
  TransactionRefundData,
  TransactionRefundTarget,
  TransactionTarget,
  TransactionType,
  UnassignedTransaction,
  useCountry,
  useTransaction,
  useUser,
} from '@dfx.swiss/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingRow, useToast } from '../components/ui';
import { useT } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatAmount, formatDate, formatNumber, shortAddress } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';

type LoadState = 'loading' | 'error' | 'loaded';

// Reveal the history in client-side pages of 40, matching the static app's
// `TXPAGE` — the full account history is fetched up-front, so "load more" just
// uncovers already-loaded rows (no extra network round-trip).
const TXPAGE = 40;

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
const ALERT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CARET_ICON = (
  <svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

const BACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Which transactions can be refunded — mirrors the static app's `REFUNDABLE_RE`
// / `isRefundable` (index.html ~line 4416): failed, returned, aborted, expired or
// otherwise stuck states. Tested against the `TransactionState` string.
const REFUNDABLE_RE = /fail|return|refund|abort|cancel|expire|kyc|limit|amlpend|feetoohigh|blocked/i;

function isRefundable(tx: DetailTransaction): boolean {
  // A server-supplied `refundTarget` marks the tx refundable regardless of its
  // state string (mirrors the static app's `isRefundable`). The field isn't on
  // the typed `DetailTransaction`, so it's read off the raw payload.
  const refundTarget = (tx as { refundTarget?: string | null }).refundTarget;
  return tx.id != null && (refundTarget != null || REFUNDABLE_RE.test(String(tx.state ?? '')));
}

type RefundKind = 'crypto' | 'card' | 'bank';

// Where the refund goes — mirrors `refundKind` (index.html ~line 4533): a
// sell/swap pays back to the user's own crypto address, a card-paid buy refunds
// to the card (no target needed), a bank-paid buy refunds by IBAN.
function refundKind(tx: DetailTransaction): RefundKind {
  if (tx.type === TransactionType.SELL || tx.type === TransactionType.SWAP) return 'crypto';
  const method = String(tx.inputPaymentMethod ?? '').toLowerCase();
  if (method === 'card' || method === 'creditcard' || method === 'checkout') return 'card';
  return 'bank';
}

function copyToClipboard(value: string, showToast: (m: string) => void, t: (k: 'copied' | 'copyFail') => string) {
  if (!value || !navigator.clipboard) {
    showToast(t('copyFail'));
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => showToast(t('copied')))
    .catch(() => showToast(t('copyFail')));
}

function KvRow({ label, value, href, onCopy }: { label: string; value: string; href?: string; onCopy?: () => void }) {
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
      {onCopy && (
        <button type="button" className="cpy" aria-label={label} onClick={onCopy}>
          {COPY_ICON}
        </button>
      )}
    </div>
  );
}

// Inline refund form rendered in place of a transaction's detail body — mirrors
// `startRefund` / `renderRefundForm` / `submitRefund` (index.html ~line 4544-4621).
// GET /transaction/{id}/refund (getTransactionRefund) fills the form; the confirm
// PUTs it back via setTransactionRefundTarget.
function RefundPanel({ tx, onClose }: { tx: DetailTransaction; onClose: () => void }) {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { address } = useWalletSession();
  const { getTransactionRefund, setTransactionRefundTarget } = useTransaction();
  const { getCountries } = useCountry();
  const { getProfile } = useUser();

  const kind = refundKind(tx);
  const [phase, setPhase] = useState<'loading' | 'error' | 'form' | 'done'>('loading');
  const [data, setData] = useState<TransactionRefundData>();
  const [countries, setCountries] = useState<Country[]>([]);
  const [warn, setWarn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [iban, setIban] = useState('');
  const [holderName, setHolderName] = useState('');
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('CH');
  const ibanRef = useRef<HTMLInputElement>(null);

  // A server-supplied IBAN is locked (the refund must go back to the account that
  // paid); a missing one is editable so the user can enter the payout account.
  const ibanFixed = (data?.refundTarget ?? '') !== '';

  const load = useCallback(() => {
    if (tx.id == null) {
      setPhase('error');
      return;
    }
    setWarn('');
    setPhase('loading');
    getTransactionRefund(tx.id)
      .then((refund) => {
        const bank = refund.bankDetails ?? {};
        setData(refund);
        setIban(refund.refundTarget ?? bank.iban ?? '');
        setHolderName(bank.name ?? '');
        setStreet(bank.address ?? '');
        setHouseNumber(bank.houseNumber ?? '');
        setZip(bank.zip ?? '');
        setCity(bank.city ?? '');
        setCountry(bank.country ?? 'CH');
        setPhase('form');
        // Pre-fill the account-holder name from the user's profile when the
        // refund payload carries none — mirrors `bd.name || realName()` in the
        // static app. Only a bank refund shows the name field.
        if (kind === 'bank' && !(bank.name ?? '')) {
          getProfile()
            .then((profile) => {
              const realName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
              if (realName) setHolderName((current) => current || realName);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => setPhase('error'));
    // `getTransactionRefund` is re-created on every render (the hook doesn't
    // memoise it); keying on it would re-run the fetch and wipe the form on each
    // parent render, so the load is pinned to the transaction id.
  }, [tx.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Only a bank refund needs the country list (for the creditor's address).
    if (kind !== 'bank') return undefined;
    let cancelled = false;
    getCountries()
      .then((list) => {
        if (!cancelled) setCountries(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      });
    return () => {
      cancelled = true;
    };
    // `getCountries` is re-created each render; fetch once per refund kind.
  }, [kind]);

  const submit = () => {
    if (submitting || tx.id == null) return;
    let body: TransactionRefundTarget;
    if (kind === 'crypto') {
      body = { refundTarget: data?.refundTarget ?? address };
    } else if (kind === 'bank') {
      const cleanIban = iban.replace(/\s+/g, '').trim();
      if (!cleanIban) {
        ibanRef.current?.focus();
        return;
      }
      const name = holderName.trim();
      const streetValue = street.trim();
      const zipValue = zip.trim();
      const cityValue = city.trim();
      if (!name || !streetValue || !zipValue || !cityValue || !country) {
        setWarn(t('refundNeedFields'));
        return;
      }
      const creditorData: CreditorData = {
        name,
        address: streetValue,
        zip: zipValue,
        city: cityValue,
        country,
      };
      const houseValue = houseNumber.trim();
      if (houseValue) creditorData.houseNumber = houseValue;
      body = { refundTarget: cleanIban, creditorData };
    } else {
      body = {}; // card → refund goes back to the card automatically (empty body)
    }
    setSubmitting(true);
    setWarn('');
    setTransactionRefundTarget(tx.id, body)
      .then(() => {
        setPhase('done');
        showToast(t('refundDone'));
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiException ? String(err.message ?? '') : '';
        // Surface the server-supplied error detail alongside the generic
        // message (mirrors the static app's `genErr + ": " + em`); the
        // MultiAccountIban case has its own dedicated hint.
        setWarn(
          /MultiAccountIban/i.test(message)
            ? t('refundMultiIban')
            : message
              ? `${t('genErr')}: ${message}`
              : t('genErr'),
        );
        setSubmitting(false);
      });
  };

  if (phase === 'loading') {
    return (
      <div className="refundbox" style={{ padding: '18px 8px', textAlign: 'center' }}>
        <LoadingRow label={t('loading')} />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="refundbox">
        <div className="paybox-note warn" style={{ marginBottom: 10 }}>
          {t('refundUnavailable')}
        </div>
        <div className="txactions">
          <button type="button" className="btn-mini" onClick={load}>
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="refundbox">
        <div className="paybox-note ok" style={{ padding: 16, textAlign: 'center' }}>
          {t('refundDone')}
        </div>
      </div>
    );
  }

  const amountLabel = data ? formatAmount(data.refundAmount, data.refundAsset?.name, language, 8) || '—' : '—';
  const sortedCountries = [...countries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="refundbox">
      <div
        className="glass"
        style={{ padding: '14px 16px', borderRadius: 14, textAlign: 'center', margin: '2px 0 10px' }}
      >
        <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{t('refundYouGet')}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{amountLabel}</div>
      </div>
      {data?.fee && (
        <div className="glass" style={{ borderRadius: 12, padding: '2px 14px', marginBottom: 10 }}>
          <KvRow label={t('feeDfx')} value={formatNumber(data.fee.dfx, language, 8)} />
          <KvRow label={t('feeNetwork')} value={formatNumber(data.fee.network, language, 8)} />
          <KvRow label={t('feeBank')} value={formatNumber(data.fee.bank, language, 8)} />
        </div>
      )}

      {kind === 'crypto' && (
        <>
          <label className="flabel">{t('refundTo')}</label>
          <input className="tinput" value={data?.refundTarget ?? address ?? ''} readOnly aria-readonly="true" />
        </>
      )}
      {kind === 'card' && <p className="paybox-note">{t('refundCardNote')}</p>}
      {kind === 'bank' && (
        <>
          <label className="flabel">{t('iban')}</label>
          <input
            ref={ibanRef}
            className="tinput"
            value={iban}
            readOnly={ibanFixed}
            aria-readonly={ibanFixed || undefined}
            placeholder="DE.."
            autoComplete="off"
            onChange={(event) => setIban(event.target.value)}
          />
          <div className="sectionlabel tight">{t('refundHolder')}</div>
          <label className="flabel">{t('refundName')}</label>
          <input
            className="tinput"
            value={holderName}
            autoComplete="name"
            onChange={(event) => setHolderName(event.target.value)}
          />
          <label className="flabel">{t('kycStreet')}</label>
          <input className="tinput" value={street} onChange={(event) => setStreet(event.target.value)} />
          <label className="flabel">{t('kycHouseNr')}</label>
          <input className="tinput" value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} />
          <label className="flabel">{t('kycZip')}</label>
          <input className="tinput" value={zip} inputMode="numeric" onChange={(event) => setZip(event.target.value)} />
          <label className="flabel">{t('kycCity')}</label>
          <input className="tinput" value={city} onChange={(event) => setCity(event.target.value)} />
          <label className="flabel">{t('kycCountry')}</label>
          <select className="tinput" value={country} onChange={(event) => setCountry(event.target.value)}>
            {sortedCountries.map((option) => (
              <option key={option.id} value={option.symbol}>
                {option.name}
              </option>
            ))}
          </select>
        </>
      )}

      {submitting ? (
        <div className="paybox-note" style={{ marginTop: 10 }}>
          <LoadingRow label={t('tkSending')} />
        </div>
      ) : warn ? (
        <div className="paybox-note warn" style={{ marginTop: 10 }}>
          {warn}
        </div>
      ) : null}

      <div className="txactions" style={{ marginTop: 12 }}>
        <button type="button" className="btn-primary" style={{ flex: 1 }} disabled={submitting} onClick={submit}>
          {t('refundConfirm')}
        </button>
        <button type="button" className="btn-mini" style={{ width: 'auto', flex: '0 0 auto' }} onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

export default function TransactionsScreen() {
  const { t, language } = useT();
  const { isLoggedIn, address } = useWalletSession();
  const {
    getTransactions,
    getDetailTransactions,
    getUnassignedTransactions,
    getTransactionTargets,
    setTransactionTarget,
    getTransactionCsv,
    getTransactionHistory,
  } = useTransaction();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  // Which transaction's inline refund form is open (keyed by uid, else id).
  const [refundActiveId, setRefundActiveId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<DetailTransaction[]>([]);
  // How many rows are revealed — grows by TXPAGE on each "load more" (client-side
  // reveal of the already-loaded history, matching the static app's `TX.shown`).
  const [shown, setShown] = useState(TXPAGE);

  // CSV export menu (txHeaderHtml/wireTxHeader in the static app).
  const [menuOpen, setMenuOpen] = useState(false);

  // Unmatched bank payments + the in-place assign view (txNoticeHtml/openAssign/renderAssign).
  const [unassigned, setUnassigned] = useState<UnassignedTransaction[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [targets, setTargets] = useState<TransactionTarget[]>([]);
  const [targetsState, setTargetsState] = useState<LoadState>('loading');
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [assigning, setAssigning] = useState<number | null>(null);

  const load = () => {
    const sortByDate = (list: DetailTransaction[]) =>
      [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setState('loading');
    setShown(TXPAGE);
    // Load the entire account history in one call (no date window), like the
    // static app's `jget2("/transaction/detail")`. On failure, fall back to the
    // public address-scoped endpoint (`getTransactions` → GET
    // /transaction?userAddress=…) before giving up, mirroring `buildTx`.
    getDetailTransactions()
      .then((list) => {
        setTransactions(sortByDate(list));
        setState('loaded');
      })
      .catch(() => {
        getTransactions()
          .then((list) => {
            setTransactions(sortByDate(list as DetailTransaction[]));
            setState('loaded');
          })
          .catch(() => setState('error'));
      });
    // Bank payments DFX couldn't match to a buy route — best-effort, a failure
    // here must not blow up the main history (mirrors buildTx's separate catch).
    getUnassignedTransactions()
      .then((list) => setUnassigned(Array.isArray(list) ? list : []))
      .catch(() => setUnassigned([]));
  };

  const openAssign = () => {
    setPicked({});
    setAssignOpen(true);
    setTargetsState('loading');
    getTransactionTargets()
      .then((list) => setTargets(Array.isArray(list) ? list : []))
      .catch(() => setTargets([]))
      .finally(() => setTargetsState('loaded'));
  };

  const doAssign = (index: number) => {
    const payment = unassigned[index];
    const raw = picked[index] ?? (targets[0]?.id != null ? String(targets[0].id) : '');
    const buyId = Number(raw);
    if (payment?.id == null || !raw || Number.isNaN(buyId)) return;
    setAssigning(index);
    setTransactionTarget(payment.id, buyId)
      .then(() => {
        showToast(t('txAssignOk'));
        setAssignOpen(false);
        load(); // refresh reloads the (now shorter) unassigned list
      })
      .catch(() => showToast(t('genErr')))
      .finally(() => setAssigning(null));
  };

  const exportCompactCsv = () => {
    setMenuOpen(false);
    // The hook does PUT /transaction/detail/csv, then resolves a short-lived
    // /transaction/csv?key=… download URL served by the API as an attachment.
    getTransactionCsv()
      .then((url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        showToast(t('txExport'));
      })
      .catch(() => showToast(t('genErr')));
  };

  const exportCoinTracking = () => {
    setMenuOpen(false);
    if (!address) {
      showToast(t('genErr'));
      return;
    }
    // GET /transaction/CoinTracking?…&format=csv → raw CSV text we turn into a
    // client-side download (matches exportCoinTracking in the static app).
    getTransactionHistory(ExportType.COIN_TRACKING, { userAddress: address, format: ExportFormat.CSV })
      .then((csv) => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'dfx-cointracking.csv';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast(t('txExport'));
      })
      .catch(() => showToast(t('genErr')));
  };

  // "Report a problem" (per tx) and "My transaction is missing" (header) both open
  // a preset support ticket — mirrors `openTicket({type:"TransactionIssue",…})`
  // (index.html ~line 4463/4467). With a tx uid it's a "funds not received"
  // report; without one it's a "transaction missing" report. The preset rides in
  // react-router location state for the support screen to pick up (see file note).
  const openReport = (transactionUid?: string) => {
    navigate('/support', {
      state: {
        supportPreset: {
          type: SupportIssueType.TRANSACTION_ISSUE,
          reason: transactionUid ? SupportIssueReason.FUNDS_NOT_RECEIVED : SupportIssueReason.TRANSACTION_MISSING,
          transactionUid,
        },
      },
    });
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    load();
    // `load` intentionally omitted — it closes over `getDetailTransactions`,
    // which is re-created every render (no memoization in the hook), and
    // re-running this effect should only be driven by the session state.
  }, [isLoggedIn]);

  if (!isLoggedIn) return <LoggedOutState title={t('mTx')} />;

  const visible = transactions.slice(0, shown);

  return (
    <div className="account">
      <div className="txhead">
        <button
          type="button"
          className="rbtn"
          aria-label="Back"
          style={{ width: 40, height: 40 }}
          onClick={() => navigate('/')}
        >
          {BACK_ICON}
        </button>
        <h2>{t('mTx')}</h2>
      </div>

      {/* The assign view replaces the whole list in place (mirrors the static
          app's `openAssign`/`renderAssign`), headed by a back-to-list link. */}
      {assignOpen ? (
        <>
          <div className="txtop">
            <button type="button" className="txlink" onClick={() => setAssignOpen(false)}>
              ‹ {t('txBackToList')}
            </button>
          </div>
          <div className="sectionlabel">{t('txAssignTitle')}</div>
          {targetsState === 'loading' ? (
            <div style={{ padding: '18px 8px', textAlign: 'center' }}>
              <LoadingRow label={t('loading')} />
            </div>
          ) : (
            <>
              {targets.length === 0 && (
                <div className="paybox-note warn" style={{ padding: 12, marginBottom: 10 }}>
                  {t('txNoTargets')}
                </div>
              )}
              {unassigned.map((payment, index) => {
                const amount = formatAmount(payment.inputAmount, payment.inputAsset, language);
                const label = amount || `#${payment.id ?? index}`;
                const value = picked[index] ?? (targets[0]?.id != null ? String(targets[0].id) : '');
                return (
                  <div className="assignrow" key={payment.uid || payment.id || index}>
                    <div className="ah">
                      {label}
                      <small>{formatDate(payment.date, language)}</small>
                    </div>
                    <div className="ac">
                      <select
                        className="tinput"
                        aria-label={t('txAssignTo')}
                        value={value}
                        disabled={targets.length === 0}
                        onChange={(event) => setPicked((current) => ({ ...current, [index]: event.target.value }))}
                      >
                        {targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {`${target.asset.name} · ${shortAddress(target.address)}`}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-mini"
                        type="button"
                        disabled={targets.length === 0 || assigning === index}
                        onClick={() => doAssign(index)}
                      >
                        {t('txAssignDo')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          {state === 'loaded' && (
            <>
              <div className="txtop">
                <button type="button" className="txlink" onClick={() => openReport()}>
                  {t('txMissing')}
                </button>
                <button
                  className="btn-mini"
                  type="button"
                  style={{ width: 'auto', height: 38, padding: '0 13px' }}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {t('txExport')}
                </button>
              </div>
              {menuOpen && (
                <div className="txmenu">
                  <button className="btn-mini" type="button" onClick={exportCompactCsv}>
                    {t('csvCompact')}
                  </button>
                  <button className="btn-mini" type="button" onClick={exportCoinTracking}>
                    {t('csvCoinTracking')}
                  </button>
                </div>
              )}
            </>
          )}

          {unassigned.length > 0 && (
            <button
              type="button"
              className="txnotice"
              style={{ font: 'inherit', textAlign: 'left' }}
              onClick={openAssign}
            >
              <span className="ni">{ALERT_ICON}</span>
              <span className="nt">
                {t('txUnassignedN', { n: unassigned.length })}
                <small>{t('txUnassignedSub')}</small>
              </span>
              <span className="caret">{CARET_ICON}</span>
            </button>
          )}

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
            <div className="glass rowlist" style={{ marginTop: 6 }}>
              {visible.map((tx, i) => {
                // Unknown/unlisted types fall back to the Buy style and icon
                // (mirrors the static app's `TXTYPES[type]||TXTYPES.Buy`).
                const style = TYPE_STYLE[tx.type] ?? TYPE_STYLE[TransactionType.BUY];
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
                const rate = formatNumber(tx.rate ?? tx.exchangeRate, language, 6);
                // These fields aren't on the typed `DetailTransaction` but the raw
                // API payload carries them — read them the way the static app does.
                const raw = tx as {
                  feeAmount?: number;
                  feeAsset?: string;
                  reference?: string;
                  usage?: string;
                  bankUsage?: string;
                  txId?: string;
                };
                // Single "Fees" line: prefer `feeAmount`, else the aggregate
                // `fees.total` (matches txDetail's one fee row, orig 4407-4408).
                const feeValue = raw.feeAmount ?? tx.fees?.total;
                // Reference falls through the same chain as the static app,
                // ending in `inputTxId` (orig 4410).
                const reference = raw.reference || raw.usage || raw.bankUsage || raw.txId || tx.inputTxId || '';
                const refundKey = tx.uid || String(tx.id ?? i);
                return (
                  <details className="txitem" key={tx.uid || tx.id || i}>
                    <summary className="txrow">
                      <span className="txicon" style={{ background: style.bg }}>
                        {style.icon}
                      </span>
                      <div className="ti">
                        <b>{typeLabel}</b>
                        <small>{formatDate(tx.date, language)}</small>
                      </div>
                      <div className="ta">
                        <b>{amount}</b>
                        <small>{tx.state}</small>
                      </div>
                    </summary>
                    <div className="txbody">
                      {refundActiveId === refundKey ? (
                        <RefundPanel tx={tx} onClose={() => setRefundActiveId(null)} />
                      ) : (
                        <>
                          <KvRow label={t('fPay')} value={formatAmount(tx.inputAmount, tx.inputAsset, language, 8)} />
                          <KvRow
                            label={t('fRecv')}
                            value={formatAmount(tx.outputAmount, tx.outputAsset, language, 8)}
                          />
                          <KvRow label={t('txRate')} value={rate === '—' ? '' : rate} />
                          <KvRow label={t('txFee')} value={formatAmount(feeValue, raw.feeAsset, language, 8)} />
                          <KvRow label={t('txStatus')} value={tx.state} />
                          <KvRow
                            label={t('txRef')}
                            value={reference}
                            onCopy={reference ? () => copyToClipboard(reference, showToast, t) : undefined}
                          />
                          <div className="txactions">
                            {isRefundable(tx) && (
                              <button type="button" className="btn-mini" onClick={() => setRefundActiveId(refundKey)}>
                                {t('txRefund')}
                              </button>
                            )}
                            <button type="button" className="btn-mini" onClick={() => openReport(tx.uid)}>
                              {t('txReport')}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </details>
                );
              })}

              {/* Reveal the next page of already-loaded rows — no network call,
                  hidden once every row is shown (mirrors `txMore`, orig 4456). */}
              {shown < transactions.length && (
                <div className="txbar">
                  <button type="button" onClick={() => setShown((current) => current + TXPAGE)}>
                    {t('txLoadMore')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
