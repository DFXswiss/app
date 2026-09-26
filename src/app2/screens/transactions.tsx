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
  useApiSession,
  useCountry,
  useTransaction,
  useUser,
  useUserContext,
} from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingRow, useToast } from '../components/ui';
import { useT } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatAmount, formatDate, formatNumber, shortAddress } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';
import { stateLabel } from './transaction-state-label';
import { cx } from '../css';

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

/**
 * Server-supplied crypto refund target from `getTransactionRefund`.
 * Empty/whitespace-only values count as missing. Never accepts a session
 * wallet address — when the API omits a target the UI lets the user pick
 * from `userAddresses` filtered to the tx input blockchain instead.
 */
export function resolveCryptoRefundTarget(refundTarget: string | null | undefined): string | undefined {
  if (refundTarget == null) return undefined;
  const trimmed = refundTarget.trim();
  return trimmed ? trimmed : undefined;
}

/** Returns only a refund destination authorized by the current account and chain. */
export function resolveCryptoRefundSubmission(
  accountMatches: boolean,
  serverTarget: string | undefined,
  allowedAddresses: Array<{ address: string }>,
  selectedAddress: string,
): string | undefined {
  if (!accountMatches) return undefined;
  if (serverTarget) return serverTarget;
  return allowedAddresses.some((address) => address.address === selectedAddress) ? selectedAddress : undefined;
}

export function resolveScopedAssignmentData(
  accountScope: string | undefined,
  unassignedOwner: string | undefined,
  unassigned: UnassignedTransaction[],
  targetsOwner: string | undefined,
  targets: TransactionTarget[],
  index: number,
): { payment: UnassignedTransaction | undefined; activeTargets: TransactionTarget[] } {
  return {
    payment: accountScope !== undefined && unassignedOwner === accountScope ? unassigned[index] : undefined,
    activeTargets: accountScope !== undefined && targetsOwner === accountScope ? targets : [],
  };
}

export function submitCryptoRefundIfAuthorized(
  accountMatches: boolean,
  serverTarget: string | undefined,
  allowedAddresses: Array<{ address: string }>,
  selectedAddress: string,
  submit: (body: { refundTarget: string }) => void,
): void {
  const refundTarget = resolveCryptoRefundSubmission(accountMatches, serverTarget, allowedAddresses, selectedAddress);
  if (!refundTarget) return;
  submit({ refundTarget });
}

function copyToClipboard(value: string, showToast: (m: string) => void, t: (k: 'copied' | 'copyFail') => string) {
  if (!navigator.clipboard) {
    showToast(t('copyFail'));
    return;
  }
  navigator.clipboard
    .writeText(value)
    .then(() => showToast(t('copied')))
    .catch(() => showToast(t('copyFail')));
}

function KvRow({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  if (!value) return null;
  return (
    <div className={cx('kv')}>
      <span className={cx('kk')}>{label}</span>
      <span className={cx('vv')}>{value}</span>
      {onCopy && (
        <button type="button" className={cx('cpy')} aria-label={label} onClick={onCopy}>
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
//
// Crypto target selection mirrors the main app (`transaction.screen.tsx`): a
// server-supplied `refundTarget` is locked; otherwise the user picks from
// `userAddresses` filtered to `tx.inputBlockchain`. Never the session wallet.
export function RefundPanel({ tx, onClose }: { tx: DetailTransaction; onClose: () => void }) {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { getTransactionRefund, setTransactionRefundTarget } = useTransaction();
  const { getCountries } = useCountry();
  const { getProfile } = useUser();
  const { user, userAddresses } = useUserContext();
  const { session } = useApiSession();
  const accountId = session?.account;
  const priorRefundAccountRef = useRef(accountId);
  const refundAccountGenerationRef = useRef(0);
  if (priorRefundAccountRef.current !== accountId) {
    priorRefundAccountRef.current = accountId;
    refundAccountGenerationRef.current += 1;
  }
  const refundAccountScope = accountId === undefined ? undefined : `${accountId}:${refundAccountGenerationRef.current}`;
  const currentAccountRef = useRef(refundAccountScope);
  currentAccountRef.current = refundAccountScope;
  const requestGenerationRef = useRef(0);
  const countryGenerationRef = useRef(0);
  const accountMatches = user?.accountId !== undefined && user.accountId === session?.account;

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
  // User-chosen crypto refund address (only used when the API omitted refundTarget).
  const [selectedCryptoAddress, setSelectedCryptoAddress] = useState('');
  const ibanRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const [refundOwner, setRefundOwner] = useState<string>();
  const ownsRefundState = refundAccountScope !== undefined && refundOwner === refundAccountScope;
  const visiblePhase = ownsRefundState ? phase : 'loading';
  const visibleData = ownsRefundState ? data : undefined;
  const visibleIban = ownsRefundState ? iban : '';
  const visibleHolderName = ownsRefundState ? holderName : '';
  const visibleStreet = ownsRefundState ? street : '';
  const visibleHouseNumber = ownsRefundState ? houseNumber : '';
  const visibleZip = ownsRefundState ? zip : '';
  const visibleCity = ownsRefundState ? city : '';
  const visibleCountry = ownsRefundState ? country : 'CH';
  const visibleWarn = ownsRefundState ? warn : '';
  const visibleSubmitting = ownsRefundState && submitting;
  const [countriesOwner, setCountriesOwner] = useState<string>();
  const visibleCountries = refundAccountScope !== undefined && countriesOwner === refundAccountScope ? countries : [];

  // A server-supplied IBAN is locked (the refund must go back to the account that
  // paid); a missing one is editable so the user can enter the payout account.
  const ibanFixed = (visibleData?.refundTarget ?? '').trim() !== '';
  // Crypto: server target wins; else pick from account addresses on the input chain.
  const cryptoTarget = accountMatches ? resolveCryptoRefundTarget(visibleData?.refundTarget) : undefined;
  const allowedCryptoAddresses = useMemo(() => {
    if (kind !== 'crypto' || !accountMatches) return [];
    const chain = tx.inputBlockchain;
    if (!chain) return [];
    return (userAddresses ?? []).filter((a) => a.blockchains.includes(chain));
  }, [accountMatches, kind, tx.inputBlockchain, userAddresses]);

  // Pre-select when exactly one address matches (main-app behaviour). Keep a still-
  // valid multi-choice selection; clear when the filtered list becomes empty.
  useEffect(() => {
    if (cryptoTarget) {
      setSelectedCryptoAddress('');
      return;
    }
    if (allowedCryptoAddresses.length === 1) {
      setSelectedCryptoAddress(allowedCryptoAddresses[0].address);
      return;
    }
    setSelectedCryptoAddress((prev) => (prev && allowedCryptoAddresses.some((a) => a.address === prev) ? prev : ''));
  }, [cryptoTarget, allowedCryptoAddresses]);

  // Fail-closed only when there is neither a server target nor any account address
  // on the input chain (or the user hasn't picked one yet among several).
  const cryptoBlocked =
    kind === 'crypto' &&
    (!accountMatches ||
      (!cryptoTarget &&
        (allowedCryptoAddresses.length === 0 ||
          !allowedCryptoAddresses.some((a) => a.address === selectedCryptoAddress))));

  const load = useCallback(() => {
    const expectedAccount = refundAccountScope;
    const generation = ++requestGenerationRef.current;
    const isCurrent = () =>
      generation === requestGenerationRef.current && currentAccountRef.current === expectedAccount;
    if (expectedAccount === undefined) return;
    setRefundOwner(expectedAccount);
    setSubmitting(false);
    submittingRef.current = false;
    if (tx.id == null) {
      setPhase('error');
      return;
    }
    setWarn('');
    setPhase('loading');
    getTransactionRefund(tx.id)
      .then((refund) => {
        if (!isCurrent()) return;
        const bank = refund.bankDetails ?? {};
        setData(refund);
        setIban((refund.refundTarget ?? '').trim() || bank.iban || '');
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
              if (!isCurrent()) return;
              const realName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
              if (realName) setHolderName((current) => current || realName);
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (isCurrent()) setPhase('error');
      });
    // `getTransactionRefund` is re-created on every render (the hook doesn't
    // memoise it); keying on it would re-run the fetch and wipe the form on each
    // parent render, so the load is pinned to the transaction id.
  }, [accountId, refundAccountScope, tx.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Only a bank refund needs the country list (for the creditor's address).
    const generation = ++countryGenerationRef.current;
    const expectedAccount = refundAccountScope;
    const isCurrent = () =>
      generation === countryGenerationRef.current && currentAccountRef.current === expectedAccount;
    if (kind !== 'bank' || expectedAccount === undefined) {
      setCountriesOwner(undefined);
      setCountries([]);
      return undefined;
    }
    setCountriesOwner(undefined);
    getCountries()
      .then((list) => {
        if (!isCurrent()) return;
        setCountries(Array.isArray(list) ? list : []);
        setCountriesOwner(expectedAccount);
      })
      .catch(() => {
        if (!isCurrent()) return;
        setCountries([]);
        setCountriesOwner(expectedAccount);
      });
    return () => {
      countryGenerationRef.current += 1;
    };
    // `getCountries` is re-created each render; fetch once per refund kind.
  }, [accountId, kind, refundAccountScope]);

  const sendRefund = (body: TransactionRefundTarget, isCurrent: () => boolean) => {
    submittingRef.current = true;
    setSubmitting(true);
    setWarn('');
    setTransactionRefundTarget(tx.id as number, body)
      .then(() => {
        if (!isCurrent()) return;
        setPhase('done');
        showToast(t('refundDone'));
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
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
        submittingRef.current = false;
        setSubmitting(false);
      });
  };

  const submit = () => {
    if (submittingRef.current || tx.id == null || accountId === undefined || !ownsRefundState) return;
    const expectedAccount = refundAccountScope;
    const generation = requestGenerationRef.current;
    const isCurrent = () =>
      generation === requestGenerationRef.current && currentAccountRef.current === expectedAccount;
    if (kind === 'crypto') {
      // Server-supplied target is authoritative. Otherwise only an address from
      // the account's filtered `userAddresses` list may be sent — never the
      // currently connected session wallet.
      submitCryptoRefundIfAuthorized(
        accountMatches,
        cryptoTarget,
        allowedCryptoAddresses,
        selectedCryptoAddress,
        (body) => sendRefund(body, isCurrent),
      );
      return;
    }
    let body: TransactionRefundTarget;
    if (kind === 'bank') {
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
      // The API already has the destination when refundData supplied a fixed target.
      // Repeating it is rejected as an attempt to override that target; creditor data
      // is still required to process the bank refund.
      body = { ...(ibanFixed ? {} : { refundTarget: cleanIban }), creditorData };
    } else {
      body = {}; // card → refund goes back to the card automatically (empty body)
    }
    sendRefund(body, isCurrent);
  };

  if (visiblePhase === 'loading') {
    return (
      <div className={cx('refundbox')} style={{ padding: '18px 8px', textAlign: 'center' }}>
        <LoadingRow label={t('loading')} />
      </div>
    );
  }

  if (visiblePhase === 'error') {
    return (
      <div className={cx('refundbox')}>
        <div className={cx('paybox-note', 'warn')} style={{ marginBottom: 10 }}>
          {t('refundUnavailable')}
        </div>
        <div className={cx('txactions')}>
          <button type="button" className={cx('btn-mini')} onClick={load}>
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (visiblePhase === 'done') {
    return (
      <div className={cx('refundbox')}>
        <div className={cx('paybox-note', 'ok')} style={{ padding: 16, textAlign: 'center' }}>
          {t('refundDone')}
        </div>
      </div>
    );
  }

  const amountLabel = formatAmount(visibleData?.refundAmount, visibleData?.refundAsset?.name, language, 8) || '—';
  const sortedCountries = [...visibleCountries].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={cx('refundbox')}>
      <div
        className={cx('glass')}
        style={{ padding: '14px 16px', borderRadius: 14, textAlign: 'center', margin: '2px 0 10px' }}
      >
        <div style={{ fontSize: 12, color: 'var(--t-muted)' }}>{t('refundYouGet')}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{amountLabel}</div>
      </div>
      {visibleData?.fee && (
        <div className={cx('glass')} style={{ borderRadius: 12, padding: '2px 14px', marginBottom: 10 }}>
          <KvRow label={t('feeDfx')} value={formatNumber(visibleData.fee.dfx, language, 8)} />
          <KvRow label={t('feeNetwork')} value={formatNumber(visibleData.fee.network, language, 8)} />
          <KvRow label={t('feeBank')} value={formatNumber(visibleData.fee.bank, language, 8)} />
        </div>
      )}

      {kind === 'crypto' && (
        <>
          <label className={cx('flabel')} htmlFor={cryptoTarget ? undefined : 'refundCryptoAddr'}>
            {t('refundTo')}
          </label>
          {cryptoTarget ? (
            <input className={cx('tinput')} value={cryptoTarget} readOnly aria-readonly="true" />
          ) : allowedCryptoAddresses.length === 0 ? (
            <div className={cx('paybox-note', 'warn')} style={{ marginTop: 4 }}>
              {t('refundNoTarget')}
            </div>
          ) : (
            <select
              id="refundCryptoAddr"
              className={cx('tinput')}
              value={selectedCryptoAddress}
              aria-label={t('refundTo')}
              onChange={(event) => setSelectedCryptoAddress(event.target.value)}
            >
              {allowedCryptoAddresses.length > 1 && <option value="">{t('refundTo')}</option>}
              {allowedCryptoAddresses.map((a) => (
                <option key={a.address} value={a.address}>
                  {a.label ? `${a.label} · ${shortAddress(a.address)}` : shortAddress(a.address)}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {kind === 'card' && <p className={cx('paybox-note')}>{t('refundCardNote')}</p>}
      {kind === 'bank' && (
        <>
          <label className={cx('flabel')}>{t('iban')}</label>
          <input
            ref={ibanRef}
            className={cx('tinput')}
            value={visibleIban}
            readOnly={ibanFixed}
            aria-readonly={ibanFixed || undefined}
            placeholder="DE.."
            autoComplete="off"
            onChange={(event) => setIban(event.target.value)}
          />
          <div className={cx('sectionlabel', 'tight')}>{t('refundHolder')}</div>
          <label className={cx('flabel')}>{t('refundName')}</label>
          <input
            className={cx('tinput')}
            value={visibleHolderName}
            autoComplete="name"
            onChange={(event) => setHolderName(event.target.value)}
          />
          <label className={cx('flabel')}>{t('kycStreet')}</label>
          <input className={cx('tinput')} value={visibleStreet} onChange={(event) => setStreet(event.target.value)} />
          <label className={cx('flabel')}>{t('kycHouseNr')}</label>
          <input
            className={cx('tinput')}
            value={visibleHouseNumber}
            onChange={(event) => setHouseNumber(event.target.value)}
          />
          <label className={cx('flabel')}>{t('kycZip')}</label>
          <input
            className={cx('tinput')}
            value={visibleZip}
            inputMode="numeric"
            onChange={(event) => setZip(event.target.value)}
          />
          <label className={cx('flabel')}>{t('kycCity')}</label>
          <input className={cx('tinput')} value={visibleCity} onChange={(event) => setCity(event.target.value)} />
          <label className={cx('flabel')}>{t('kycCountry')}</label>
          <select className={cx('tinput')} value={visibleCountry} onChange={(event) => setCountry(event.target.value)}>
            {sortedCountries.map((option) => (
              <option key={option.id} value={option.symbol}>
                {option.name}
              </option>
            ))}
          </select>
        </>
      )}

      {visibleSubmitting ? (
        <div className={cx('paybox-note')} style={{ marginTop: 10 }}>
          <LoadingRow label={t('tkSending')} />
        </div>
      ) : visibleWarn ? (
        <div className={cx('paybox-note', 'warn')} style={{ marginTop: 10 }}>
          {visibleWarn}
        </div>
      ) : null}

      <div className={cx('txactions')} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={cx('btn-primary')}
          style={{ flex: 1 }}
          disabled={visibleSubmitting || cryptoBlocked || !ownsRefundState}
          onClick={submit}
        >
          {t('refundConfirm')}
        </button>
        <button type="button" className={cx('btn-mini')} style={{ width: 'auto', flex: '0 0 auto' }} onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

export default function TransactionsScreen() {
  const { t, language } = useT();
  const { isLoggedIn, address } = useWalletSession();
  const { session } = useApiSession();
  const sessionAccount = isLoggedIn ? session?.account : undefined;
  const priorAccountRef = useRef(sessionAccount);
  const accountGenerationRef = useRef(0);
  if (priorAccountRef.current !== sessionAccount) {
    priorAccountRef.current = sessionAccount;
    accountGenerationRef.current += 1;
  }
  const accountScope = sessionAccount === undefined ? undefined : `${sessionAccount}:${accountGenerationRef.current}`;
  const accountScopeRef = useRef(accountScope);
  accountScopeRef.current = accountScope;
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
  const [transactionsOwner, setTransactionsOwner] = useState<string>();
  // How many rows are revealed — grows by TXPAGE on each "load more" (client-side
  // reveal of the already-loaded history, matching the static app's `TX.shown`).
  const [shown, setShown] = useState(TXPAGE);

  // CSV export menu (txHeaderHtml/wireTxHeader in the static app).
  const [menuOpen, setMenuOpen] = useState(false);

  // Unmatched bank payments + the in-place assign view (txNoticeHtml/openAssign/renderAssign).
  const [unassigned, setUnassigned] = useState<UnassignedTransaction[]>([]);
  const [unassignedOwner, setUnassignedOwner] = useState<string>();
  const [unassignedState, setUnassignedState] = useState<LoadState>('loading');
  const [retryingUnassigned, setRetryingUnassigned] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [targets, setTargets] = useState<TransactionTarget[]>([]);
  const [targetsOwner, setTargetsOwner] = useState<string>();
  const [targetsState, setTargetsState] = useState<LoadState>('loading');
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [assigning, setAssigning] = useState<number | null>(null);
  const loadGenRef = useRef(0);
  const assignGenRef = useRef(0);
  const targetsGenRef = useRef(0);
  const unassignedGenRef = useRef(0);

  const loadUnassigned = (gen: number, expectedScope: string | undefined, retry = false) => {
    const unassignedGen = ++unassignedGenRef.current;
    // Reached only through the account-scoped load path or its account-scoped retry control.
    if (retry) setRetryingUnassigned(true);
    else setUnassignedState('loading');
    getUnassignedTransactions()
      .then((list) => {
        if (gen !== loadGenRef.current || unassignedGen !== unassignedGenRef.current || accountScopeRef.current !== expectedScope) return;
        setUnassigned(Array.isArray(list) ? list : []);
        setUnassignedOwner(expectedScope);
        setRetryingUnassigned(false);
        setUnassignedState('loaded');
      })
      .catch(() => {
        if (gen !== loadGenRef.current || unassignedGen !== unassignedGenRef.current || accountScopeRef.current !== expectedScope) return;
        setUnassigned([]);
        setUnassignedOwner(expectedScope);
        setRetryingUnassigned(false);
        setUnassignedState('error');
      });
  };

  const load = () => {
    const expectedScope = accountScopeRef.current;
    const gen = ++loadGenRef.current;
    const isCurrent = () => gen === loadGenRef.current && accountScopeRef.current === expectedScope;
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
        if (!isCurrent()) return;
        setTransactions(sortByDate(list));
        setTransactionsOwner(expectedScope);
        setState('loaded');
      })
      .catch(() => {
        if (!isCurrent()) return;
        getTransactions()
          .then((list) => {
            if (!isCurrent()) return;
            setTransactions(sortByDate(list as DetailTransaction[]));
            setTransactionsOwner(expectedScope);
            setState('loaded');
          })
          .catch(() => {
            if (!isCurrent()) return;
            setState('error');
            setTransactionsOwner(expectedScope);
          });
      });
    // A failure here must not hide the main history, but it must remain visible
    // because unmatched bank payments can represent money the account has sent.
    loadUnassigned(gen, expectedScope);
  };

  const loadTargets = () => {
    const gen = loadGenRef.current;
    const expectedScope = accountScopeRef.current;
    const targetsGen = ++targetsGenRef.current;
    setTargetsState('loading');
    setTargetsOwner(undefined);
    getTransactionTargets()
      .then((list) => {
        if (gen !== loadGenRef.current || targetsGen !== targetsGenRef.current || accountScopeRef.current !== expectedScope) return;
        setTargets(Array.isArray(list) ? list : []);
        setTargetsOwner(expectedScope);
        setTargetsState('loaded');
      })
      .catch(() => {
        if (gen !== loadGenRef.current || targetsGen !== targetsGenRef.current || accountScopeRef.current !== expectedScope) return;
        setTargets([]);
        setTargetsOwner(expectedScope);
        setTargetsState('error');
      });
  };

  const openAssign = () => {
    setPicked({});
    setAssignOpen(true);
    loadTargets();
  };

  const doAssign = (index: number) => {
    const { payment, activeTargets } = resolveScopedAssignmentData(
      accountScope,
      unassignedOwner,
      unassigned,
      targetsOwner,
      targets,
      index,
    );
    const raw = picked[index] ?? (activeTargets[0]?.id != null ? String(activeTargets[0].id) : '');
    const buyId = Number(raw);
    if (payment?.id == null || !raw || Number.isNaN(buyId)) return;
    const gen = loadGenRef.current;
    const expectedScope = accountScopeRef.current;
    const assignGen = ++assignGenRef.current;
    setAssigning(index);
    setTransactionTarget(payment.id, buyId)
      .then(() => {
        if (gen !== loadGenRef.current || accountScopeRef.current !== expectedScope) return;
        showToast(t('txAssignOk'));
        setAssignOpen(false);
        load(); // refresh reloads the (now shorter) unassigned list
      })
      .catch(() => {
        if (gen !== loadGenRef.current || accountScopeRef.current !== expectedScope) return;
        showToast(t('genErr'));
      })
      .finally(() => {
        if (assignGen !== assignGenRef.current || accountScopeRef.current !== expectedScope) return;
        setAssigning(null);
      });
  };

  const exportCompactCsv = () => {
    setMenuOpen(false);
    // The hook does PUT /transaction/detail/csv, then resolves a short-lived
    // /transaction/csv?key=… download URL served by the API as an attachment.
    // Reserve the tab during the click gesture; opening after the request is
    // commonly rejected by browser popup blockers.
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showToast(t('genErr'));
      return;
    }
    popup.opener = null;
    getTransactionCsv()
      .then((url) => {
        popup.location.replace(url);
        showToast(t('txExport'));
      })
      .catch(() => {
        popup.close();
        showToast(t('genErr'));
      });
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
    setAssignOpen(false);
    setPicked({});
    setRefundActiveId(null);
    setTargets([]);
    targetsGenRef.current += 1;
    setUnassigned([]);
    setMenuOpen(false);
    setAssigning(null);
    assignGenRef.current += 1;
    if (!isLoggedIn || accountScope === undefined) {
      loadGenRef.current += 1;
      unassignedGenRef.current += 1;
      setTransactions([]);
      setTransactionsOwner(undefined);
      setUnassigned([]);
      setRetryingUnassigned(false);
      setUnassignedState('loaded');
      return;
    }
    load();
    // `load` intentionally omitted — it closes over `getDetailTransactions`,
    // which is re-created every render (no memoization in the hook), and
    // re-running this effect should only be driven by the session state.
  }, [isLoggedIn, address, accountScope]);

  if (!isLoggedIn) return <LoggedOutState title={t('mTx')} />;

  const scopeMatches = accountScope !== undefined && transactionsOwner === accountScope;
  const currentState: LoadState = scopeMatches ? state : 'loading';
  const currentTransactions = scopeMatches ? transactions : [];
  const currentUnassigned = accountScope !== undefined && unassignedOwner === accountScope ? unassigned : [];
  const currentUnassignedState: LoadState = accountScope !== undefined && unassignedOwner === accountScope ? unassignedState : 'loading';
  const currentTargets = accountScope !== undefined && targetsOwner === accountScope ? targets : [];
  const currentTargetsState: LoadState = accountScope !== undefined && targetsOwner === accountScope ? targetsState : 'loading';
  const currentAssignOpen = assignOpen && accountScope !== undefined && unassignedOwner === accountScope;
  const visible = currentTransactions.slice(0, shown);

  return (
    <div className={cx('account')}>
      <div className={cx('txhead')}>
        <button
          type="button"
          className={cx('rbtn')}
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
      {currentAssignOpen ? (
        <>
          <div className={cx('txtop')}>
            <button type="button" className={cx('txlink')} onClick={() => setAssignOpen(false)}>
              ‹ {t('txBackToList')}
            </button>
          </div>
          <div className={cx('sectionlabel')}>{t('txAssignTitle')}</div>
          {currentTargetsState === 'loading' ? (
            <div style={{ padding: '18px 8px', textAlign: 'center' }}>
              <LoadingRow label={t('loading')} />
            </div>
          ) : currentTargetsState === 'error' ? (
            <div className={cx('paybox-note', 'warn')} style={{ padding: 12, marginBottom: 10 }}>
              <div>{t('loadFail')}</div>
              <button className={cx('btn-mini')} type="button" style={{ marginTop: 10 }} onClick={loadTargets}>
                {t('retry')}
              </button>
            </div>
          ) : (
            <>
              {currentTargets.length === 0 && (
                <div className={cx('paybox-note', 'warn')} style={{ padding: 12, marginBottom: 10 }}>
                  {t('txNoTargets')}
                </div>
              )}
              {currentUnassigned.map((payment, index) => {
                const amount = formatAmount(payment.inputAmount, payment.inputAsset, language);
                const label = amount || `#${payment.id ?? index}`;
                const value = picked[index] ?? (currentTargets[0]?.id != null ? String(currentTargets[0].id) : '');
                return (
                  <div className={cx('assignrow')} key={payment.uid || payment.id || index}>
                    <div className={cx('ah')}>
                      {label}
                      <small>{formatDate(payment.date, language)}</small>
                    </div>
                    <div className={cx('ac')}>
                      <select
                        className={cx('tinput')}
                        aria-label={t('txAssignTo')}
                        value={value}
                        disabled={currentTargets.length === 0}
                        onChange={(event) => setPicked((current) => ({ ...current, [index]: event.target.value }))}
                      >
                        {currentTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {`${target.asset.name} · ${shortAddress(target.address)}`}
                          </option>
                        ))}
                      </select>
                      <button
                        className={cx('btn-mini')}
                        type="button"
                        disabled={currentTargets.length === 0 || assigning === index}
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
          {currentState === 'loaded' && (
            <>
              <div className={cx('txtop')}>
                <button type="button" className={cx('txlink')} onClick={() => openReport()}>
                  {t('txMissing')}
                </button>
                <button
                  className={cx('btn-mini')}
                  type="button"
                  style={{ width: 'auto', height: 38, padding: '0 13px' }}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {t('txExport')}
                </button>
              </div>
              {menuOpen && (
                <div className={cx('txmenu')}>
                  <button className={cx('btn-mini')} type="button" onClick={exportCompactCsv}>
                    {t('csvCompact')}
                  </button>
                  <button className={cx('btn-mini')} type="button" onClick={exportCoinTracking}>
                    {t('csvCoinTracking')}
                  </button>
                </div>
              )}
            </>
          )}

          {currentUnassignedState === 'error' ? (
            <div className={cx('paybox-note', 'warn')} style={{ marginBottom: 10 }}>
              <div>{t('txUnassignedLoadFail')}</div>
              {retryingUnassigned ? (
                <div style={{ marginTop: 10 }}>
                  <LoadingRow label={t('loading')} />
                </div>
              ) : (
                <button
                  className={cx('btn-mini')}
                  type="button"
                  style={{ marginTop: 10 }}
                  onClick={() => loadUnassigned(loadGenRef.current, accountScope, true)}
                >
                  {t('retry')}
                </button>
              )}
            </div>
          ) : currentUnassignedState === 'loaded' && currentUnassigned.length > 0 ? (
            <button
              type="button"
              className={cx('txnotice')}
              style={{ font: 'inherit', textAlign: 'left' }}
              onClick={openAssign}
            >
              <span className={cx('ni')}>{ALERT_ICON}</span>
              <span className={cx('nt')}>
                {t('txUnassignedN', { n: currentUnassigned.length })}
                <small>{t('txUnassignedSub')}</small>
              </span>
              <span className={cx('caret')}>{CARET_ICON}</span>
            </button>
          ) : null}

          {currentState === 'loading' && (
            <div className={cx('sec')} style={{ textAlign: 'center', padding: 24 }}>
              <LoadingRow label={t('loading')} />
            </div>
          )}

          {currentState === 'error' && (
            <div
              className={cx('ocp-empty')}
              style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: '30px 8px' }}
            >
              <span>{t('loadFail')}</span>
              <button className={cx('btn-mini')} style={{ width: 'auto' }} onClick={load}>
                {t('retry')}
              </button>
            </div>
          )}

          {currentState === 'loaded' && currentTransactions.length === 0 && (
            <div className={cx('sec')} style={{ textAlign: 'center', padding: 30 }}>
              {t('noTx')}
            </div>
          )}

          {currentState === 'loaded' && currentTransactions.length > 0 && (
            <div className={cx('glass', 'rowlist')} style={{ marginTop: 6 }}>
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
                // 8 fraction digits (not the formatAmount default of 6) so sub-1e-6
                // amounts — e.g. Lightning sales of tens of sats — don't collapse to "0 BTC".
                // Same floor for the rate: sub-1e-6 quotes would otherwise also read as 0.
                const inA = formatAmount(tx.inputAmount, tx.inputAsset, language, 8);
                const outA = formatAmount(tx.outputAmount, tx.outputAsset, language, 8);
                const amount = inA && outA ? `${inA} → ${outA}` : inA || outA;
                const rate = formatNumber(tx.rate ?? tx.exchangeRate, language, 8);
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
                  <details className={cx('txitem')} key={tx.uid || tx.id || i}>
                    <summary className={cx('txrow')}>
                      <span className={cx('txicon')} style={{ background: style.bg }}>
                        {style.icon}
                      </span>
                      <div className={cx('ti')}>
                        <b>{typeLabel}</b>
                        <small>{formatDate(tx.date, language)}</small>
                      </div>
                      <div className={cx('ta')}>
                        <b>{amount}</b>
                        <small>{stateLabel(t, tx.state)}</small>
                      </div>
                    </summary>
                    <div className={cx('txbody')}>
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
                          <KvRow label={t('txStatus')} value={stateLabel(t, tx.state)} />
                          <KvRow
                            label={t('txRef')}
                            value={reference}
                            onCopy={reference ? () => copyToClipboard(reference, showToast, t) : undefined}
                          />
                          <div className={cx('txactions')}>
                            {isRefundable(tx) && (
                              <button
                                type="button"
                                className={cx('btn-mini')}
                                onClick={() => setRefundActiveId(refundKey)}
                              >
                                {t('txRefund')}
                              </button>
                            )}
                            <button type="button" className={cx('btn-mini')} onClick={() => openReport(tx.uid)}>
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
              {shown < currentTransactions.length && (
                <div className={cx('txbar')}>
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
