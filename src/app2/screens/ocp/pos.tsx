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
// and resolves to paid via a single timer. Regular polling timers are cleared
// on unmount/view exit. An ambiguous status request has a 20-second UI timeout;
// its underlying HTTP request may outlive the view, but completion is guarded
// against stale account state and releases the shared outstanding-request slot.

import { ApiException, PaymentLinkPaymentStatus, PaymentLinkStatus } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useT } from '../../i18n';
import { parseAmt } from '../trade/amount';
import { isValidLnurl, qrData } from './lnurl';
import type { OcpApi, OcpSubViewProps } from './useOcp';
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

interface AmbiguousChargeAttempt {
  ownerIdentity: string;
  linkId: string;
  externalId: string;
  amount: number;
  currency: string;
}

type PosPaymentLink = NonNullable<OcpApi['links']>[number];

function recoverablePendingCharge(
  link: PosPaymentLink,
  sellRoutes: OcpApi['sellRoutes'],
  tokenOffset = 0,
): RecoveredCharge | null {
  const payment = link.payment;
  const externalId = payment?.externalId?.trim();
  const lnurl = payment?.lnurl?.trim();
  if (
    !payment ||
    payment.status !== PaymentLinkPaymentStatus.PENDING ||
    !externalId ||
    !lnurl ||
    !isValidLnurl(lnurl) ||
    !Number.isFinite(payment.amount) ||
    payment.amount <= 0
  ) return null;
  const paymentCurrency = typeof payment.currency === 'string' ? payment.currency : payment.currency?.name;
  return {
    token: Number(payment.id) || Date.now() + tokenOffset,
    key: `${link.id}:${externalId}`,
    label: link.label || link.externalId || `#${link.id}`,
    linkId: String(link.id),
    externalId,
    amount: payment.amount,
    lnurl,
    currency: paymentCurrency || currencyForPosLink(link, sellRoutes),
    recoveredStatus: 'waiting',
  };
}

function isPendingPaymentConflict(error: unknown): boolean {
  return error instanceof ApiException &&
    error.statusCode === 409 &&
    error.message === 'There is already a pending payment for the specified payment link';
}

const ambiguousPollReservations = new Map<string, Set<symbol>>();
const ambiguousPollSubscribers = new Map<string, Set<() => void>>();

function publishAmbiguousPollCount(key: string): void {
  ambiguousPollSubscribers.get(key)?.forEach((subscriber) => subscriber());
}

function reserveAmbiguousPoll(key: string): (() => void) | null {
  const reservations = ambiguousPollReservations.get(key) ?? new Set<symbol>();
  if (reservations.size >= 2) return null;
  const token = Symbol(key);
  reservations.add(token);
  ambiguousPollReservations.set(key, reservations);
  publishAmbiguousPollCount(key);
  return () => {
    reservations.delete(token);
    if (reservations.size === 0) ambiguousPollReservations.delete(key);
    publishAmbiguousPollCount(key);
  };
}

function subscribeAmbiguousPolls(key: string, subscriber: () => void): () => void {
  const subscribers = ambiguousPollSubscribers.get(key) ?? new Set<() => void>();
  subscribers.add(subscriber);
  ambiguousPollSubscribers.set(key, subscribers);
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) ambiguousPollSubscribers.delete(key);
  };
}

function attemptStorageKey(identity: string): string {
  return `ocp-pos-ambiguous-charge:${identity}`;
}

function readAmbiguousAttempt(identity: string): AmbiguousChargeAttempt | null {
  try {
    const value = sessionStorage.getItem(attemptStorageKey(identity));
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const attempt = parsed as Partial<AmbiguousChargeAttempt>;
    if (
      attempt.ownerIdentity !== identity ||
      typeof attempt.linkId !== 'string' ||
      typeof attempt.externalId !== 'string' ||
      typeof attempt.amount !== 'number' ||
      !Number.isFinite(attempt.amount) ||
      typeof attempt.currency !== 'string'
    ) return null;
    return attempt as AmbiguousChargeAttempt;
  } catch {
    return null;
  }
}

function makeExternalId(): string | null {
  if (typeof crypto === 'undefined') return null;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto.getRandomValues !== 'function') return null;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  const [initialAmbiguousAttempt] = useState(() => readAmbiguousAttempt(ocp.sessionIdentity));

  const [linkId, setLinkId] = useState('');
  const [amount, setAmount] = useState('');
  const [charging, setCharging] = useState(Boolean(initialAmbiguousAttempt));
  const [note, setNote] = useState<string | null>(null);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [recoveredCharges, setRecoveredCharges] = useState<RecoveredCharge[]>([]);
  const [selectedRecoveryKey, setSelectedRecoveryKey] = useState('');
  const [unrecoverablePendingCount, setUnrecoverablePendingCount] = useState(0);
  const [unrecoverablePendingLinkIds, setUnrecoverablePendingLinkIds] = useState<string[]>([]);
  const [refreshingPendingStatus, setRefreshingPendingStatus] = useState(false);
  const [checkingAmbiguousStatus, setCheckingAmbiguousStatus] = useState(false);
  const [, setAmbiguousPollRegistryVersion] = useState(0);
  const [chargeIdentity, setChargeIdentity] = useState(ocp.sessionIdentity);
  const [status, setStatus] = useState<'waiting' | 'paid' | 'failed'>('waiting');
  const [terminalAttemptReceipt, setTerminalAttemptReceipt] = useState<{
    attempt: AmbiguousChargeAttempt;
    status: 'paid' | 'failed';
  } | null>(null);
  const [failKey, setFailKey] = useState<FailKey>('posFailed');
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [ambiguousAttempt, setAmbiguousAttempt] = useState<AmbiguousChargeAttempt | null>(initialAmbiguousAttempt);
  const amountRef = useRef<HTMLInputElement>(null);
  // Synchronous lock: `charging` cannot stop a second Enter/click in the same
  // tick, before React commits. Stays true for the whole open payment so a
  // later tap cannot replace the QR and drop the poll on a still-payable LNURL.
  const chargingRef = useRef(false);
  const recoverySourceRef = useRef<unknown>(null);
  const recoveryChargesRef = useRef<RecoveredCharge[]>([]);
  const creatingChargeRef = useRef(false);
  const canStartChargeRef = useRef(false);
  const ambiguousAttemptRef = useRef(initialAmbiguousAttempt);
  const checkingAmbiguousStatusRef = useRef<string | null>(null);
  const ambiguousPollTimedOutRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionIdentityRef = useRef(ocp.sessionIdentity);
  // Update during render so an in-flight promise from the previous account is
  // invalidated before its continuation can mutate the new account's POS state.
  sessionIdentityRef.current = ocp.sessionIdentity;

  recoveryChargesRef.current = recoveredCharges;
  ambiguousAttemptRef.current = ambiguousAttempt;

  const currentAmbiguousPollKey = ambiguousAttempt
    ? `${ambiguousAttempt.ownerIdentity}:${ambiguousAttempt.externalId}`
    : null;
  const outstandingAmbiguousPolls = currentAmbiguousPollKey
    ? ambiguousPollReservations.get(currentAmbiguousPollKey)?.size ?? 0
    : 0;

  useEffect(() => {
    if (!currentAmbiguousPollKey) return;
    return subscribeAmbiguousPolls(currentAmbiguousPollKey, () =>
      setAmbiguousPollRegistryVersion((version) => version + 1),
    );
  }, [currentAmbiguousPollKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const unlockTill = useCallback(() => {
    chargingRef.current = false;
    setCharging(false);
  }, []);

  // Callers only reach this after the current-session guard (the mount path
  // uses readAmbiguousAttempt's owner check; the async POST path rechecks the
  // mounted view, account identity and exact attempt after its await).
  const adoptRecoveredCharge = useCallback((
    attempt: AmbiguousChargeAttempt,
    recovered: RecoveredCharge,
    adoptedFromOtherPayment = false,
  ): void => {
    try {
      sessionStorage.removeItem(attemptStorageKey(attempt.ownerIdentity));
    } catch {
      // Retaining the saved attempt is conservative across a later reload.
    }
    ambiguousAttemptRef.current = null;
    setAmbiguousAttempt(null);
    recoveryChargesRef.current = [recovered];
    setRecoveredCharges([recovered]);
    setSelectedRecoveryKey(recovered.key);
    setUnrecoverablePendingLinkIds([]);
    setUnrecoverablePendingCount(0);
    setCharge(null);
    setChargeIdentity(attempt.ownerIdentity);
    setTerminalAttemptReceipt(null);
    setPollTimedOut(false);
    setStatus('waiting');
    setNote(adoptedFromOtherPayment ? t('posExistingPaymentAdopted') : null);
    // `loadLinks()` may resolve before its updated prop reaches this view.
    // Mark the currently rendered list as consumed so the old prop cannot
    // immediately clear the just-adopted payment; a later fresh list has a new
    // reference and will still be reconciled normally.
    recoverySourceRef.current = ocp.links;
    chargingRef.current = true;
    setCharging(true);
  }, [ocp.links, t]);

  const refreshPendingStatus = useCallback(async () => {
    setRefreshingPendingStatus(true);
    try {
      await ocp.loadLinks();
    } finally {
      setRefreshingPendingStatus(false);
    }
  }, [ocp.loadLinks]);

  const checkAmbiguousAttempt = useCallback(async (attempt: AmbiguousChargeAttempt) => {
    const identity = sessionIdentityRef.current;
    const requestKey = `${identity}:${attempt.externalId}`;
    if (checkingAmbiguousStatusRef.current === requestKey) return;
    const releasePoll = reserveAmbiguousPoll(requestKey);
    if (!releasePoll) return;
    checkingAmbiguousStatusRef.current = requestKey;
    setCheckingAmbiguousStatus(true);
    let timeoutId!: ReturnType<typeof setTimeout>;
    const request = Promise.resolve().then(() => ocp.pollPayment(attempt.linkId, attempt.externalId));
    void request.then(releasePoll, releasePoll);
    try {
      const checked = await Promise.race([
        request.then((result) => ({ timedOut: false as const, result }), () => ({ timedOut: false as const, result: undefined })),
        new Promise<{ timedOut: true; result: undefined }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ timedOut: true, result: undefined }), 20000);
        }),
      ]);
      if (!mountedRef.current || sessionIdentityRef.current !== identity || ambiguousAttemptRef.current !== attempt) return;
      if (checked.timedOut) {
        ambiguousPollTimedOutRef.current = true;
        return;
      }
      clearTimeout(timeoutId);
      const result = checked.result;
      if (
        result !== PaymentLinkPaymentStatus.COMPLETED &&
        result !== PaymentLinkPaymentStatus.CANCELLED &&
        result !== PaymentLinkPaymentStatus.EXPIRED
      ) return;
      try {
        sessionStorage.removeItem(attemptStorageKey(identity));
      } catch {
        // Even if storage is unavailable, this mounted view can still show the
        // authoritative terminal result. A reload may conservatively re-check it.
      }
      ambiguousAttemptRef.current = null;
      setAmbiguousAttempt(null);
      setStatus(result === PaymentLinkPaymentStatus.COMPLETED ? 'paid' : 'failed');
      setTerminalAttemptReceipt({
        attempt,
        status: result === PaymentLinkPaymentStatus.COMPLETED ? 'paid' : 'failed',
      });
      setNote(t(result === PaymentLinkPaymentStatus.COMPLETED ? 'posPaid' : 'posFailed'));
      unlockTill();
      void ocp.loadLinks();
    } finally {
      clearTimeout(timeoutId);
      if (checkingAmbiguousStatusRef.current === requestKey) {
        checkingAmbiguousStatusRef.current = null;
        if (mountedRef.current) setCheckingAmbiguousStatus(false);
      }
    }
  }, [ocp.pollPayment, ocp.loadLinks, t, unlockTill]);

  // Load links + routes on entry — routes supply the currency for the selected link.
  useEffect(() => {
    if (ocp.links === null) void ocp.loadLinks();
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp]);

  // Clear local charge state immediately after an account switch. Until the
  // effect commits, the render guard below hides the previous account's QR and
  // keeps the charge button disabled.
  useEffect(() => {
    checkingAmbiguousStatusRef.current = null;
    setCheckingAmbiguousStatus(false);
    setCharge(null);
    setNote(null);
    setRecoveredCharges([]);
    setSelectedRecoveryKey('');
    setUnrecoverablePendingCount(0);
    setUnrecoverablePendingLinkIds([]);
    setChargeIdentity(ocp.sessionIdentity);
    recoverySourceRef.current = null;
    setPollTimedOut(false);
    setStatus('waiting');
    setTerminalAttemptReceipt(null);
    ambiguousPollTimedOutRef.current = false;
    const restoredAttempt = readAmbiguousAttempt(ocp.sessionIdentity);
    creatingChargeRef.current = false;
    ambiguousAttemptRef.current = restoredAttempt;
    setAmbiguousAttempt(restoredAttempt);
    if (restoredAttempt) {
      chargingRef.current = true;
      setCharging(true);
      setNote(t('posRecoveryUnclear'));
    } else {
      unlockTill();
    }
  }, [ocp.sessionIdentity, t, unlockTill]);

  // A hard reload starts with no cached links; route remounts reuse the
  // server-backed list that `charge()` updates. Recover every still-pending
  // payment (including links since deactivated) before allowing a new charge.
  useEffect(() => {
    if (ocp.demo || !ocp.links || ocp.linksError || !ocp.sessionAddress || ocp.linksIdentity !== ocp.sessionIdentity) {
      return;
    }
    if (recoverySourceRef.current === ocp.links || charge || creatingChargeRef.current) return;
    recoverySourceRef.current = ocp.links;

    const savedAttempt = ambiguousAttemptRef.current;
    if (savedAttempt) {
      // readAmbiguousAttempt validates ownerIdentity against the current
      // session, and the identity-reset effect replaces this ref before this
      // reconciliation effect runs after an account switch.
      const link = ocp.links.find((item) => String(item.id) === savedAttempt.linkId);
      const payment = link?.payment;
      const reportedCurrency = typeof payment?.currency === 'string'
        ? payment.currency
        : payment?.currency?.name;
      const matchesSavedAttempt =
        !!payment &&
        payment.externalId?.trim() === savedAttempt.externalId &&
        payment.amount === savedAttempt.amount &&
        (reportedCurrency === undefined || reportedCurrency === savedAttempt.currency);
      const recovered = matchesSavedAttempt && link
        ? recoverablePendingCharge(link, ocp.sellRoutes)
        : null;
      if (recovered) adoptRecoveredCharge(savedAttempt, recovered);
      // A remounted ambiguous attempt may only be reconciled by its exact
      // persisted ID and amount/currency. Missing or different list data keeps
      // the original status-check lock in place.
      return;
    }

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
        payment.amount > 0;
      if (!terminal && !recoverablePending) unresolvedLinkIds.add(unresolvedId);
    }
    for (const link of pending) {
      const recovered = recoverablePendingCharge(link, ocp.sellRoutes, restored.length);
      const externalId = link.payment?.externalId?.trim();
      const previous = recoveryChargesRef.current.find(
        (item) =>
          item.recoveredStatus === 'waiting' &&
          item.linkId === String(link.id) &&
          (!externalId || item.externalId === externalId),
      );
      if (!recovered) {
        if (previous) restored.push(previous);
        unresolvedLinkIds.add(String(link.id));
        continue;
      }
      restored.push(recovered);
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
      setChargeIdentity(ocp.sessionIdentity);
      chargingRef.current = true;
      setCharging(true);
      setCharge(null);
      setStatus('waiting');
    } else {
      unlockTill();
    }
  }, [
    charge,
    ocp.demo,
    ocp.links,
    ocp.linksIdentity,
    ocp.linksError,
    ocp.sessionAddress,
    ocp.sessionIdentity,
    ocp.sellRoutes,
    adoptRecoveredCharge,
    unlockTill,
    unrecoverablePendingLinkIds,
  ]);

  const routesReady = ocp.demo || (ocp.routes !== null && !ocp.routesError);
  const activeLinks = useMemo(
    () =>
      (ocp.demo || ocp.linksIdentity === ocp.sessionIdentity ? (ocp.links ?? []) : []).filter(
        (link) =>
          link.status === PaymentLinkStatus.ACTIVE &&
          (ocp.demo ||
            (routesReady &&
              ocp.sellRoutes.some((route) => String(route.id) === String(link.routeId) && route.active))),
      ),
    [ocp.demo, ocp.links, ocp.linksIdentity, ocp.sessionIdentity, ocp.sellRoutes, routesReady],
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
  const selectedRouteIsActive = Boolean(
    selectedLink &&
      (ocp.demo ||
        ocp.sellRoutes.some((route) => String(route.id) === String(selectedLink.routeId) && route.active)),
  );
  const accountMatches = chargeIdentity === ocp.sessionIdentity;
  const linksMatchAccount = ocp.demo || (!!ocp.sessionAddress && ocp.linksIdentity === ocp.sessionIdentity);
  const currentRecovery = accountMatches
    ? recoveredCharges.find((item) => item.key === selectedRecoveryKey) ?? recoveredCharges[0]
    : undefined;
  const displayCharge = accountMatches ? currentRecovery ?? charge : null;
  const displayStatus = currentRecovery?.recoveredStatus ?? status;
  const terminalReceipt = accountMatches && terminalAttemptReceipt ? (
    <div
      className={cx('posstat', 'posreceipt', terminalAttemptReceipt.status === 'paid' ? 'paid' : 'fail')}
      data-testid="ocp-pos-terminal-receipt"
    >
      <div>{t(terminalAttemptReceipt.status === 'paid' ? 'posPaid' : 'posFailed')}</div>
      <div>{terminalAttemptReceipt.attempt.currency} {terminalAttemptReceipt.attempt.amount}</div>
      <div>{t('posLink')}: {terminalAttemptReceipt.attempt.linkId}</div>
      <div data-testid="ocp-pos-terminal-external-id">
        <span>{t('posRecoveryReference')}: </span>
        <code>{terminalAttemptReceipt.attempt.externalId}</code>
      </div>
    </div>
  ) : null;
  const pendingFromServer =
    !ocp.demo &&
    accountMatches &&
    ocp.linksIdentity === ocp.sessionIdentity &&
    !!ocp.links?.some((link) => link.payment?.status === PaymentLinkPaymentStatus.PENDING);
  const recoveryNotProcessed = pendingFromServer && recoverySourceRef.current !== ocp.links && !charge;
  canStartChargeRef.current =
    accountMatches &&
    linksMatchAccount &&
    routesReady &&
    selectedRouteIsActive &&
    !chargingRef.current &&
    !ambiguousAttemptRef.current &&
    !recoveryNotProcessed &&
    unrecoverablePendingCount === 0;

  const doCharge = useCallback(async () => {
    if (
      chargingRef.current ||
      ambiguousAttemptRef.current ||
      !canStartChargeRef.current ||
      chargeIdentity !== ocp.sessionIdentity ||
      !linksMatchAccount
    ) return;
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
    setTerminalAttemptReceipt(null);
    ambiguousPollTimedOutRef.current = false;
    const chargeCurrency = currency;
    const externalId = makeExternalId();
    if (!externalId) {
      creatingChargeRef.current = false;
      unlockTill();
      setNote(t('genErr'));
      return;
    }
    const attempt = {
      ownerIdentity: attemptIdentity,
      linkId: selectedId,
      externalId,
      amount: amt,
      currency: chargeCurrency,
    };
    try {
      sessionStorage.setItem(attemptStorageKey(attemptIdentity), JSON.stringify(attempt));
    } catch {
      creatingChargeRef.current = false;
      unlockTill();
      setNote(t('genErr'));
      return;
    }
    ambiguousAttemptRef.current = attempt;
    setAmbiguousAttempt(attempt);
    setNote(null);
    setCharge(null);
    setStatus('waiting');
    setCharging(true);
    try {
      const { lnurl } = await ocp.charge(selectedId, amt, externalId);
      if (sessionIdentityRef.current !== attemptIdentity) return;
      try {
        sessionStorage.removeItem(attemptStorageKey(attemptIdentity));
      } catch {
        // The live response provides the server-backed recovery data.
      }
      ambiguousAttemptRef.current = null;
      setAmbiguousAttempt(null);
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
      const msg = err instanceof ApiException ? err.message : '';
      const isConcurrentPendingConflict = isPendingPaymentConflict(err);
      let refreshedLinks: NonNullable<OcpApi['links']> | null = null;
      try {
        refreshedLinks = await ocp.loadLinks();
      } catch {
        // A failed refresh is not evidence that the POST did not commit.
      }
      if (
        !mountedRef.current ||
        sessionIdentityRef.current !== attemptIdentity ||
        ocp.sessionIdentity !== attemptIdentity
      ) {
        return;
      }
      // loadLinks may commit its state update before this continuation resumes;
      // the mount reconciliation effect can already have adopted this exact
      // record and cleared the attempt in that render.
      if (ambiguousAttemptRef.current !== attempt) return;
      if (!refreshedLinks) {
        setCharge(null);
        setNote(`${t('posRecoveryUnclear')}${msg ? `: ${msg}` : ''}`);
        return;
      }

      const sameLink = refreshedLinks.find((link) => String(link.id) === attempt.linkId);
      const serverPayment = sameLink?.payment;
      const reportedCurrency = typeof serverPayment?.currency === 'string'
        ? serverPayment.currency
        : serverPayment?.currency?.name;
      const exactAttempt =
        !!serverPayment &&
        serverPayment.externalId?.trim() === attempt.externalId &&
        serverPayment.amount === attempt.amount &&
        (reportedCurrency === undefined || reportedCurrency === attempt.currency);
      const ownPending = exactAttempt && sameLink
        ? recoverablePendingCharge(sameLink, ocp.sellRoutes)
        : null;
      const otherPending = isConcurrentPendingConflict && sameLink &&
        serverPayment?.externalId?.trim() !== attempt.externalId
        ? recoverablePendingCharge(sameLink, ocp.sellRoutes)
        : null;
      const recovered = ownPending ?? otherPending;
      if (recovered) {
        adoptRecoveredCharge(attempt, recovered, Boolean(otherPending));
        // The refreshed server record proves this attempt committed (exact
        // external ID, amount and currency), or the exact 409 identifies a
        // different payment already occupying this link. In either case its
        // QR is now the authoritative payable charge, so hand it to the normal
        // recovered-payment poller without ever unlocking the till.
        return;
      }

      // Missing, malformed, mismatched, or stale list data cannot release the
      // idempotency lock. The persisted UUID remains available for later status
      // checks, including after reload.
      setCharge(null);
      setNote(`${t('posRecoveryUnclear')}${msg ? `: ${msg}` : ''}`);
    }
  }, [
    amount,
    language,
    selectedId,
    currency,
    ocp,
    chargeIdentity,
    linksMatchAccount,
    t,
    unlockTill,
    adoptRecoveredCharge,
  ]);

  // An ambiguous POST is polled by the external ID created before that POST.
  // The attempt survives POS unmount/remount in sessionStorage; Pending or an
  // unobservable status keeps the lock in place indefinitely.
  useEffect(() => {
    if (
      !ambiguousAttempt ||
      ambiguousPollTimedOutRef.current ||
      chargeIdentity !== ocp.sessionIdentity
    ) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 2000;
    const tick = async () => {
      await checkAmbiguousAttempt(ambiguousAttempt);
      if (cancelled || !ambiguousAttemptRef.current || ambiguousPollTimedOutRef.current) return;
      timer = setTimeout(tick, delay);
      delay = Math.min(10000, Math.round(delay * 1.35));
    };
    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ambiguousAttempt, chargeIdentity, ocp.sessionIdentity, checkAmbiguousAttempt, pollAttempt]);

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
        const reservation = reserveAmbiguousPoll(`${chargeIdentity}:${item.externalId}`);
        if (!reservation) {
          poll(item);
          return;
        }
        let result: string | undefined;
        try {
          result = await ocp.pollPayment(item.linkId, item.externalId);
        } finally {
          reservation();
        }
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

  if (accountMatches && !activeLinks.length && !displayCharge && !recoveredCharges.length && terminalAttemptReceipt) {
    return (
      <>
        {terminalReceipt}
        <div className={cx('ocp-actions')}>
          <button className={cx('btn-primary')} onClick={() => go('links')}>
            {t('createLink')}
          </button>
        </div>
      </>
    );
  }

  if (ocp.linksError && !displayCharge && !recoveredCharges.length && unrecoverablePendingCount === 0 && !ambiguousAttempt) {
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

  if (ambiguousAttempt && accountMatches && !displayCharge && !creatingChargeRef.current) {
    return (
      <div
        className={cx('paybox-note', 'warn')}
        data-testid="ocp-pos-ambiguous-charge"
        role="status"
        aria-live="polite"
      >
        <div>{t('posRecoveryUnclear')}</div>
        <div>{t('posRecoveryContactSupport')}</div>
        <div data-testid="ocp-pos-ambiguous-charge-amount">
          <span>{t('amount')}: </span>
          <strong>{ambiguousAttempt.currency} {ambiguousAttempt.amount}</strong>
        </div>
        <div data-testid="ocp-pos-ambiguous-charge-link">
          <span>{t('posLink')}: </span>
          <code>{ambiguousAttempt.linkId}</code>
        </div>
        <div data-testid="ocp-pos-ambiguous-charge-reference">
          <span>{t('posRecoveryReference')}: </span>
          <code style={{ overflowWrap: 'anywhere' }}>{ambiguousAttempt.externalId}</code>
        </div>
        {outstandingAmbiguousPolls >= 2 && (
          <div data-testid="ocp-pos-status-check-limit">{t('posRecoveryPollLimit')}</div>
        )}
        <div className={cx('ocp-actions')}>
          {outstandingAmbiguousPolls < 2 && (
            <button
              type="button"
              className={cx('btn-mini')}
              disabled={checkingAmbiguousStatus}
              onClick={() => {
                ambiguousPollTimedOutRef.current = false;
                void checkAmbiguousAttempt(ambiguousAttempt);
              }}
            >
              {checkingAmbiguousStatus ? t('loading') : t('posRecoveryRefresh')}
            </button>
          )}
          <button type="button" className={cx('btn-mini')} onClick={() => go('links')}>
            {t('posRecoveryReviewLinks')}
          </button>
        </div>
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

  if (!routesReady && !displayCharge && !recoveredCharges.length && unrecoverablePendingCount === 0 && !ambiguousAttempt) {
    return (
      <div className={cx('ocp-empty')} style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <div>{ocp.routesError ? t('loadFail') : t('loading')}</div>
        {ocp.routesError && (
          <button type="button" className={cx('btn-mini')} onClick={() => void ocp.loadRoutes()}>
            {t('retry')}
          </button>
        )}
      </div>
    );
  }

  if (!activeLinks.length && !displayCharge && !recoveredCharges.length && unrecoverablePendingCount === 0 && !ambiguousAttempt) {
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
        {!routesReady && (
          <div className={cx('paybox-note', 'warn')} data-testid="ocp-pos-routes-unavailable">
            <div>{ocp.routesError ? t('loadFail') : t('loading')}</div>
            {ocp.routesError && (
              <button type="button" className={cx('btn-mini')} onClick={() => void ocp.loadRoutes()}>
                {t('retry')}
              </button>
            )}
          </div>
        )}
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
            charging || !accountMatches || !linksMatchAccount || !selectedRouteIsActive || recoveryNotProcessed || unrecoverablePendingCount > 0
          }
          style={{ marginTop: 6 }}
        >
          {t('posCharge')}
        </button>
      </div>
      <div>
        {terminalReceipt}
        {note && !terminalAttemptReceipt && <div className={cx('paybox-note', 'warn')}>{note}</div>}
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
