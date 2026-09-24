// DFX App 2.0 — OpenCryptoPay » Point-of-sale sub-view.
//
// Faithful port of the static preview's POS terminal (public/app2/index.html:
// `ocpPosHtml` 2541-2552, `wirePos`/`posCharge` 2553-2572, `pollPos` 2530-2540,
// `posPaidView`/`posFailView` 2527-2528). The cashier picks an active payment
// link, enters an amount, and charges it: `ocp.charge` returns an LNURL that is
// rendered as a scannable QR (react-qr-code, value = qrData(lnurl)). While the
// customer pays we live-poll `ocp.pollPayment` by the charge's external ID with
// the static app's backoff loop (start 2000ms ×1.35, capped 10s, 5-min deadline)
// until the payment is Completed / Cancelled / Expired. Demo mode skips polling
// and resolves to paid via a single timer. Every timer is cleared on unmount and
// whenever the view is left (the shell unmounts this component), so no poll leaks.

import { ApiException, PaymentLinkPaymentStatus, PaymentLinkStatus, type PaymentLink } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useT } from '../../i18n';
import { parseAmt } from '../trade/amount';
import { isValidLnurl, qrData } from './lnurl';
import type { OcpSubViewProps } from './useOcp';
import { cx } from '../../css';

// Mirrors the static app's CHECK_SVG (public/app2/index.html:2524).
const CHECK_SVG = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M5 12.5l4.5 4.5L19 7"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type FailKey = 'posFailed';

// The active charge being awaited. A fresh `token` on every charge restarts the
// polling effect (and its cleanup tears down the previous timer — no leak).
// `currency` is frozen at charge time so the open QR/paid line keep the till
// currency the cashier charged — not whatever link is selected afterwards.
interface Charge {
  token: number;
  linkId: string;
  externalId: string;
  amount: number;
  lnurl: string;
  currency: string;
}

interface RecoveredCharge extends Charge {
  key: string;
  label: string;
  recoveredStatus: 'waiting' | 'paid' | 'failed';
}

/**
 * Resolve the display currency for a POS link from its sell route — same source
 * and fallback as invoice.tsx (`selectedRoute.currency?.name || 'CHF'`).
 * PaymentLink carries only `routeId`; the currency lives on the matching sell route.
 */
export function currencyForPosLink(
  link: { routeId?: string | number } | null | undefined,
  sellRoutes: Array<{ id: string | number; currency?: { name?: string } | null }>,
): string {
  if (!link) return 'CHF';
  const route = sellRoutes.find((r) => String(r.id) === String(link.routeId));
  return route?.currency?.name || 'CHF';
}

export default function PosView({ ocp, go }: OcpSubViewProps) {
  const { t, language } = useT();

  const [linkId, setLinkId] = useState('');
  const [amount, setAmount] = useState('');
  const [charging, setCharging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [recoveredCharges, setRecoveredCharges] = useState<RecoveredCharge[]>([]);
  const [selectedRecoveryKey, setSelectedRecoveryKey] = useState('');
  const [unrecoverablePendingCount, setUnrecoverablePendingCount] = useState(0);
  const [unrecoverablePendingLinkIds, setUnrecoverablePendingLinkIds] = useState<string[]>([]);
  const [refreshingPendingStatus, setRefreshingPendingStatus] = useState(false);
  const [chargeIdentity, setChargeIdentity] = useState(ocp.sessionIdentity);
  const [status, setStatus] = useState<'waiting' | 'paid' | 'failed'>('waiting');
  const [failKey, setFailKey] = useState<FailKey>('posFailed');
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [awaitingChargeReconciliation, setAwaitingChargeReconciliation] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  // Synchronous lock: `charging` cannot stop a second Enter/click in the same
  // tick, before React commits. Stays true for the whole open payment so a
  // later tap cannot replace the QR and drop the poll on a still-payable LNURL.
  const chargingRef = useRef(false);
  const recoverySourceRef = useRef<unknown>(null);
  const chargeReconciliationSourceRef = useRef<unknown>(null);
  const recoveryChargesRef = useRef<RecoveredCharge[]>([]);
  const creatingChargeRef = useRef(false);
  const sessionIdentityRef = useRef(ocp.sessionIdentity);
  // Update during render so an in-flight promise from the previous account is
  // invalidated before its continuation can mutate the new account's POS state.
  sessionIdentityRef.current = ocp.sessionIdentity;

  recoveryChargesRef.current = recoveredCharges;

  const unlockTill = useCallback(() => {
    chargingRef.current = false;
    setCharging(false);
  }, []);

  const refreshPendingStatus = useCallback(async () => {
    if (refreshingPendingStatus) return;
    setRefreshingPendingStatus(true);
    try {
      await ocp.loadLinks();
    } finally {
      setRefreshingPendingStatus(false);
    }
  }, [ocp.loadLinks, refreshingPendingStatus]);

  // Load links + routes on entry — routes supply the currency for the selected link.
  useEffect(() => {
    if (ocp.links === null) void ocp.loadLinks();
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp]);

  // Clear local charge state immediately after an account switch. Until the
  // effect commits, the render guard below hides the previous account's QR and
  // keeps the charge button disabled.
  useEffect(() => {
    setCharge(null);
    setRecoveredCharges([]);
    setSelectedRecoveryKey('');
    setUnrecoverablePendingCount(0);
    setUnrecoverablePendingLinkIds([]);
    setChargeIdentity(ocp.sessionIdentity);
    recoverySourceRef.current = null;
    chargeReconciliationSourceRef.current = null;
    setPollTimedOut(false);
    setStatus('waiting');
    setAwaitingChargeReconciliation(false);
    creatingChargeRef.current = false;
    unlockTill();
  }, [ocp.sessionIdentity, unlockTill]);

  // A hard reload starts with no cached links; route remounts reuse the
  // server-backed list that `charge()` updates. Recover every still-pending
  // payment (including links since deactivated) before allowing a new charge.
  useEffect(() => {
    if (ocp.demo || !ocp.links || ocp.linksError || !ocp.sessionAddress || ocp.linksIdentity !== ocp.sessionIdentity) {
      return;
    }
    // A charge error can leave the POST result ambiguous. Do not interpret the
    // already-processed cached list as a fresh empty result while reload waits.
    if (awaitingChargeReconciliation && chargeReconciliationSourceRef.current === ocp.links) return;
    if (recoverySourceRef.current === ocp.links || charge || creatingChargeRef.current) return;
    recoverySourceRef.current = ocp.links;
    chargeReconciliationSourceRef.current = null;

    const pending = ocp.links.filter((link) => link.payment?.status === PaymentLinkPaymentStatus.PENDING);
    const restored: RecoveredCharge[] = [];
    const unresolvedLinkIds = new Set<string>();
    for (const unresolvedId of unrecoverablePendingLinkIds) {
      const link = ocp.links.find((item) => String(item.id) === unresolvedId);
      const paymentStatus = link?.payment?.status;
      const terminal =
        paymentStatus === PaymentLinkPaymentStatus.COMPLETED ||
        paymentStatus === PaymentLinkPaymentStatus.CANCELLED ||
        paymentStatus === PaymentLinkPaymentStatus.EXPIRED;
      const payment = link?.payment;
      const recoverablePending =
        paymentStatus === PaymentLinkPaymentStatus.PENDING &&
        Boolean(payment?.externalId?.trim()) &&
        Boolean(payment?.lnurl && isValidLnurl(payment.lnurl.trim())) &&
        typeof payment?.amount === 'number' &&
        Number.isFinite(payment.amount) &&
        (payment?.amount ?? 0) > 0;
      if (!terminal && !recoverablePending) unresolvedLinkIds.add(unresolvedId);
    }
    for (const link of pending) {
      const payment = link.payment;
      const externalId = payment?.externalId?.trim();
      const lnurl = payment?.lnurl?.trim();
      const previous = recoveryChargesRef.current.find(
        (item) =>
          item.recoveredStatus === 'waiting' &&
          item.linkId === String(link.id) &&
          (!externalId || item.externalId === externalId),
      );
      if (
        !payment ||
        !externalId ||
        !lnurl ||
        !isValidLnurl(lnurl) ||
        !Number.isFinite(payment.amount) ||
        payment.amount <= 0
      ) {
        if (previous) restored.push(previous);
        unresolvedLinkIds.add(String(link.id));
        continue;
      }
      const paymentCurrency = typeof payment.currency === 'string' ? payment.currency : payment.currency?.name;
      const key = `${link.id}:${externalId}`;
      restored.push({
        token: Number(payment.id) || Date.now() + restored.length,
        key,
        label: link.label || link.externalId || `#${link.id}`,
        linkId: String(link.id),
        externalId,
        amount: payment.amount,
        lnurl,
        currency: paymentCurrency || currencyForPosLink(link, ocp.sellRoutes),
        recoveredStatus: 'waiting',
      });
    }

    // The server list is the source of payable invoices, but a refresh after a
    // recovered payment becomes terminal no longer includes it in `pending`.
    // Keep the locally observed receipt visible for this mounted POS session.
    for (const previous of recoveryChargesRef.current) {
      if (previous.recoveredStatus !== 'waiting' && !restored.some((item) => item.key === previous.key)) {
        restored.push(previous);
      }
    }

    // Stable display order; the selector keeps every QR discoverable when
    // multiple tills each have a payable pending invoice.
    restored.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
    setRecoveredCharges(restored);
    setSelectedRecoveryKey(
      restored.find((item) => item.recoveredStatus === 'waiting')?.key ?? restored[0]?.key ?? '',
    );
    setUnrecoverablePendingLinkIds((previous) => {
      const next = [...unresolvedLinkIds].sort();
      return previous.length === next.length && previous.every((id, index) => id === next[index]) ? previous : next;
    });
    setUnrecoverablePendingCount(unresolvedLinkIds.size);
    if (pending.length || unresolvedLinkIds.size > 0) {
      setAwaitingChargeReconciliation(false);
      setChargeIdentity(ocp.sessionIdentity);
      chargingRef.current = true;
      setCharging(true);
      setCharge(null);
      setStatus('waiting');
    } else {
      unlockTill();
      setAwaitingChargeReconciliation(false);
    }
  }, [awaitingChargeReconciliation, charge, ocp.demo, ocp.links, ocp.linksIdentity, ocp.linksError, ocp.sessionAddress, ocp.sessionIdentity, ocp.sellRoutes, unlockTill, unrecoverablePendingLinkIds]);

  const activeLinks = useMemo(
    () =>
      (ocp.demo || ocp.linksIdentity === ocp.sessionIdentity ? (ocp.links ?? []) : []).filter(
        (l) => l.status === PaymentLinkStatus.ACTIVE,
      ),
    [ocp.demo, ocp.links, ocp.linksIdentity, ocp.sessionIdentity],
  );

  // Controlled <select> value: keep the current pick if still valid, else the
  // first active link — avoids an effect just to seed the default.
  const selectedId =
    linkId && activeLinks.some((l) => String(l.id) === linkId)
      ? linkId
      : activeLinks[0]
        ? String(activeLinks[0].id)
        : '';

  const selectedLink = activeLinks.find((l) => String(l.id) === selectedId);
  // Free currency from the currently selected link — correct for the amount
  // field label (the till the cashier is about to charge). Not used for an
  // already-open charge display (see Charge.currency).
  // Same resolution as invoice.tsx: route.currency?.name || 'CHF'.
  const currency = currencyForPosLink(selectedLink, ocp.sellRoutes);
  const accountMatches = chargeIdentity === ocp.sessionIdentity;
  const linksMatchAccount = ocp.demo || (!!ocp.sessionAddress && ocp.linksIdentity === ocp.sessionIdentity);
  const currentRecovery = accountMatches
    ? recoveredCharges.find((item) => item.key === selectedRecoveryKey) ?? recoveredCharges[0]
    : undefined;
  const displayCharge = accountMatches ? currentRecovery ?? charge : null;
  const displayStatus = currentRecovery?.recoveredStatus ?? status;
  const pendingFromServer =
    !ocp.demo &&
    accountMatches &&
    ocp.linksIdentity === ocp.sessionIdentity &&
    !!ocp.links?.some((link) => link.payment?.status === PaymentLinkPaymentStatus.PENDING);
  const recoveryNotProcessed = pendingFromServer && recoverySourceRef.current !== ocp.links && !charge;

  const doCharge = useCallback(async () => {
    if (chargingRef.current || chargeIdentity !== ocp.sessionIdentity || !linksMatchAccount) return;
    const attemptIdentity = ocp.sessionIdentity;
    const amt = parseAmt(amount, language);
    if (amt === null) {
      setCharge(null);
      setNote(t('amtInvalid'));
      amountRef.current?.focus();
      return;
    }
    // Freeze before the await boundary: after ocp.charge resolves the select may
    // already point at another link/currency (services#1270 class of bug).
    chargingRef.current = true;
    creatingChargeRef.current = true;
    setRecoveredCharges([]);
    setSelectedRecoveryKey('');
    setUnrecoverablePendingCount(0);
    setAwaitingChargeReconciliation(false);
    chargeReconciliationSourceRef.current = null;
    const chargeCurrency = currency;
    setNote(null);
    setCharge(null);
    setStatus('waiting');
    setCharging(true);
    try {
      const { lnurl, externalId } = await ocp.charge(selectedId, amt);
      if (sessionIdentityRef.current !== attemptIdentity) return;
      setChargeIdentity(ocp.sessionIdentity);
      setCharge({
        token: Date.now(),
        linkId: selectedId,
        externalId,
        amount: amt,
        lnurl,
        currency: chargeCurrency,
      });
      creatingChargeRef.current = false;
      setPollTimedOut(false);
      setStatus('waiting');
      // Stay locked until paid / failed / expired. Re-enabling here used to let
      // a second charge replace the QR and cancel the poll for the previous
      // LNURL, which the customer could still pay.
    } catch (err) {
      if (sessionIdentityRef.current !== attemptIdentity) return;
      creatingChargeRef.current = false;
      // A lost response can mean the server created the payment anyway. Refresh
      // before unlocking so an ambiguous POST cannot enable a duplicate charge.
      setAwaitingChargeReconciliation(true);
      chargeReconciliationSourceRef.current = ocp.links;
      let refreshedLinks: PaymentLink[] | null = null;
      try {
        refreshedLinks = await ocp.loadLinks();
      } catch {
        // A failed refresh leaves the charge outcome unknown; stay locked.
      }
      const msg = err instanceof ApiException ? err.message : '';
      setCharge(null);
      setNote(`${t('genErr')}${msg ? `: ${msg}` : ''}`);
      if (refreshedLinks === null) return;
      setAwaitingChargeReconciliation(false);
      chargeReconciliationSourceRef.current = null;
      const hasPendingPayment = refreshedLinks.some(
        (link) => link.payment?.status === PaymentLinkPaymentStatus.PENDING,
      );
      if (!hasPendingPayment) unlockTill();
    }
  }, [amount, language, selectedId, currency, ocp, chargeIdentity, linksMatchAccount, t, unlockTill]);

  // Payment polling — runs only while a charge is awaiting payment. The cleanup
  // clears the pending timer on unmount, on leaving the view, and before the
  // next charge (new token), so exactly one loop is ever live.
  useEffect(() => {
    if (!charge || status !== 'waiting' || chargeIdentity !== ocp.sessionIdentity) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    if (ocp.demo) {
      timer = setTimeout(() => {
        setStatus('paid');
        unlockTill();
      }, 2600);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Surface local silence even if the network request never settles. A late
    // server status remains authoritative; this timer only changes the warning.
    const deadlineTimer = setTimeout(() => setPollTimedOut(true), 300000);
    let delay = 2000;
    const tick = async () => {
      const st = await ocp.pollPayment(charge.linkId, charge.externalId);
      if (cancelled) return;
      if (st === PaymentLinkPaymentStatus.COMPLETED) {
        void ocp.loadLinks();
        setPollTimedOut(false);
        setStatus('paid');
        unlockTill();
        return;
      }
      if (st === PaymentLinkPaymentStatus.CANCELLED || st === PaymentLinkPaymentStatus.EXPIRED) {
        void ocp.loadLinks();
        setPollTimedOut(false);
        setFailKey('posFailed');
        setStatus('failed');
        unlockTill();
        return;
      }
      timer = setTimeout(tick, delay);
      delay = Math.min(10000, Math.round(delay * 1.35));
    };
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(deadlineTimer);
    };
  }, [charge, status, ocp, chargeIdentity, unlockTill, pollAttempt]);

  const pendingRecoveryKey = recoveredCharges
    .filter((item) => item.recoveredStatus === 'waiting')
    .map((item) => item.key)
    .join('|');

  // Poll each recovered QR independently. One stalled request must not hide or
  // stop status updates for another till's still-payable QR.
  useEffect(() => {
    const pending = recoveryChargesRef.current.filter((item) => item.recoveredStatus === 'waiting');
    if (ocp.demo || !pendingRecoveryKey || chargeIdentity !== ocp.sessionIdentity) return;
    let cancelled = false;
    let delay = 2000;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const deadlineTimer = setTimeout(() => setPollTimedOut(true), 300000);

    const poll = (item: RecoveredCharge) => {
      const timer = setTimeout(async () => {
        const result = await ocp.pollPayment(item.linkId, item.externalId);
        if (cancelled) return;
        if (
          result === PaymentLinkPaymentStatus.COMPLETED ||
          result === PaymentLinkPaymentStatus.CANCELLED ||
          result === PaymentLinkPaymentStatus.EXPIRED
        ) {
          void ocp.loadLinks();
          setRecoveredCharges((current) =>
            current.map((chargeItem) =>
              chargeItem.key === item.key
                ? { ...chargeItem, recoveredStatus: result === PaymentLinkPaymentStatus.COMPLETED ? 'paid' : 'failed' }
                : chargeItem,
            ),
          );
          setPollTimedOut(false);
          return;
        }
        delay = Math.min(10000, Math.round(delay * 1.35));
        poll(item);
      }, delay);
      timers.push(timer);
    };

    pending.forEach(poll);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      clearTimeout(deadlineTimer);
    };
  }, [pendingRecoveryKey, ocp.demo, ocp.pollPayment, ocp.loadLinks, chargeIdentity, ocp.sessionIdentity, pollAttempt]);

  useEffect(() => {
    const stillPending = recoveredCharges.some((item) => item.recoveredStatus === 'waiting');
    if (recoveredCharges.length && !stillPending && unrecoverablePendingCount === 0) unlockTill();
    if (unrecoverablePendingCount > 0) {
      chargingRef.current = true;
      setCharging(true);
    }
  }, [recoveredCharges, unrecoverablePendingCount, unlockTill]);

  if (ocp.linksError && !displayCharge && !recoveredCharges.length && unrecoverablePendingCount === 0) {
    return (
      <div className={cx('ocp-empty')} style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <div>{t('loadFail')}</div>
        <button
          type="button"
          className={cx('btn-mini')}
          style={{ width: 'auto' }}
          onClick={() => void ocp.loadLinks()}
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (
    ocp.links === null ||
    (!ocp.demo && !!ocp.sessionAddress && ocp.linksIdentity !== ocp.sessionIdentity)
  ) {
    return (
      <div className={cx('ocp-empty')}>
        <span className={cx('spin')} /> {t('loading')}
      </div>
    );
  }

  if (!activeLinks.length && !displayCharge && !recoveredCharges.length && unrecoverablePendingCount === 0) {
    return (
      <>
        <div className={cx('ocp-empty')}>{t('posNoLink')}</div>
        <div className={cx('ocp-actions')}>
          <button className={cx('btn-primary')} onClick={() => go('links')}>
            {t('createLink')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>{t('posLead')}</p>
      <div className={cx('tform')}>
        {currentRecovery !== undefined && recoveredCharges.length > 1 && (
          <>
            <label className={cx('flabel')}>{t('posWaiting')}</label>
            <select
              className={cx('tinput')}
              data-testid="ocp-pos-pending-charge"
              value={currentRecovery.key}
              onChange={(event) => setSelectedRecoveryKey(event.target.value)}
            >
              {recoveredCharges.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label} · {item.currency} {item.amount}
                </option>
              ))}
            </select>
          </>
        )}
        <label className={cx('flabel')}>{t('posLink')}</label>
        <select
          className={cx('tinput')}
          data-testid="ocp-pos-register"
          value={selectedId}
          onChange={(e) => setLinkId(e.target.value)}
        >
          {activeLinks.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.label || `#${l.id}`}
            </option>
          ))}
        </select>
        <label className={cx('flabel')}>
          {t('amount')} ({currency})
        </label>
        <input
          ref={amountRef}
          className={cx('tinput')}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void doCharge();
            }
          }}
        />
        <button
          className={cx('btn-primary')}
          onClick={() => void doCharge()}
          disabled={
            charging || !accountMatches || !linksMatchAccount || recoveryNotProcessed || unrecoverablePendingCount > 0
          }
          style={{ marginTop: 6 }}
        >
          {t('posCharge')}
        </button>
      </div>
      <div>
        {note && <div className={cx('paybox-note', 'warn')}>{note}</div>}
        {ocp.linksError && Boolean(displayCharge) && (
          <div className={cx('paybox-note', 'warn')}>
            {t('loadFail')}{' '}
            <button type="button" className={cx('btn-mini')} onClick={() => void ocp.loadLinks()}>
              {t('retry')}
            </button>
          </div>
        )}
        {unrecoverablePendingCount > 0 && accountMatches && (
          <div className={cx('paybox-note', 'warn')} data-testid="ocp-pos-recovery-error">
            <div>{t('posRecoveryUnclear')}</div>
            <div>{t('posRecoveryContactSupport')}</div>
            {ocp.linksError && <div>{t('loadFail')}</div>}
            <div className={cx('ocp-actions')}>
              <button
                type="button"
                className={cx('btn-mini')}
                disabled={refreshingPendingStatus}
                onClick={() => void refreshPendingStatus()}
              >
                {refreshingPendingStatus ? t('loading') : t('posRecoveryRefresh')}
              </button>
              <button type="button" className={cx('btn-mini')} onClick={() => go('links')}>
                {t('posRecoveryReviewLinks')}
              </button>
            </div>
          </div>
        )}
        {displayCharge && (
          <>
            <div className={cx('qrcard')}>
              <QRCode value={qrData(displayCharge.lnurl)} size={212} level="M" bgColor="#ffffff" fgColor="#000000" />
              <div className={cx('qcap')} data-testid="ocp-pos-charge-amount">
                {/* Frozen at charge time — must not track a later select change. */}
                {displayCharge.currency} {displayCharge.amount}
              </div>
            </div>
            {displayStatus === 'paid' ? (
              <div className={cx('posstat', 'paid')}>
                <span className={cx('okbubble')}>{CHECK_SVG}</span>{' '}
                {t('posPaid')} · {displayCharge.currency} {displayCharge.amount}
              </div>
            ) : displayStatus === 'failed' ? (
              <div className={cx('posstat', 'fail')}>
                {t(failKey)}{' '}
                <button
                  className={cx('btn-mini')}
                  onClick={() => void doCharge()}
                  disabled={charging}
                  style={{ marginLeft: 10, width: 'auto' }}
                >
                  {t('retry')}
                </button>
              </div>
            ) : pollTimedOut ? (
              <div className={cx('posstat', 'fail')}>
                {t('posNoUpdate')}{' '}
                <button
                  className={cx('btn-mini')}
                  onClick={() => {
                    setPollTimedOut(false);
                    setPollAttempt((attempt) => attempt + 1);
                  }}
                  style={{ marginLeft: 10, width: 'auto' }}
                >
                  {t('posKeepWaiting')}
                </button>
              </div>
            ) : (
              <div className={cx('posstat')}>
                <span className={cx('spin')} /> {t('posWaiting')}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
