// DFX App 2.0 — OpenCryptoPay » Point-of-sale sub-view.
//
// Faithful port of the static preview's POS terminal (public/app2/index.html:
// `ocpPosHtml` 2541-2552, `wirePos`/`posCharge` 2553-2572, `pollPos` 2530-2540,
// `posPaidView`/`posFailView` 2527-2528). The cashier picks an active payment
// link, enters an amount, and charges it: `ocp.charge` returns an LNURL that is
// rendered as a scannable QR (react-qr-code, value = qrData(lnurl)). While the
// customer pays we live-poll `ocp.pollPayment` with the static app's backoff
// loop (start 2000ms ×1.35, capped 10s, 5-min deadline) until the payment is
// Completed / Cancelled / Expired. Demo mode skips polling and resolves to paid
// via a single timer. Every timer is cleared on unmount and whenever the view is
// left (the shell unmounts this component), so no poll can leak.

import { ApiException, PaymentLinkPaymentStatus, PaymentLinkStatus } from '@dfx.swiss/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useT } from '../../i18n';
import { parseAmt } from '../trade/amount';
import { qrData } from './lnurl';
import type { OcpSubViewProps } from './useOcp';

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

type FailKey = 'posFailed' | 'posExpired';

// The active charge being awaited. A fresh `token` on every charge restarts the
// polling effect (and its cleanup tears down the previous timer — no leak).
// `currency` is frozen at charge time so the open QR/paid line keep the till
// currency the cashier charged — not whatever link is selected afterwards.
interface Charge {
  token: number;
  linkId: string;
  amount: number;
  lnurl: string;
  currency: string;
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
  const [status, setStatus] = useState<'waiting' | 'paid' | 'failed'>('waiting');
  const [failKey, setFailKey] = useState<FailKey>('posFailed');
  const amountRef = useRef<HTMLInputElement>(null);
  // Synchronous lock: `charging` cannot stop a second Enter/click in the same
  // tick, before React commits. Stays true for the whole open payment so a
  // later tap cannot replace the QR and drop the poll on a still-payable LNURL.
  const chargingRef = useRef(false);

  const unlockTill = useCallback(() => {
    chargingRef.current = false;
    setCharging(false);
  }, []);

  // Load links + routes on entry — routes supply the currency for the selected link.
  useEffect(() => {
    if (ocp.links === null) void ocp.loadLinks();
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp]);

  const activeLinks = useMemo(
    () => (ocp.links ?? []).filter((l) => l.status === PaymentLinkStatus.ACTIVE),
    [ocp.links],
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

  const doCharge = useCallback(async () => {
    if (chargingRef.current) return;
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
    const chargeCurrency = currency;
    setNote(null);
    setCharging(true);
    try {
      const { lnurl } = await ocp.charge(selectedId, amt);
      setCharge({
        token: Date.now(),
        linkId: selectedId,
        amount: amt,
        lnurl,
        currency: chargeCurrency,
      });
      setStatus('waiting');
      // Stay locked until paid / failed / expired. Re-enabling here used to let
      // a second charge replace the QR and cancel the poll for the previous
      // LNURL, which the customer could still pay.
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setCharge(null);
      setNote(`${t('genErr')}${msg ? `: ${msg}` : ''}`);
      unlockTill();
    }
  }, [amount, language, selectedId, currency, ocp, t, unlockTill]);

  // Payment polling — runs only while a charge is awaiting payment. The cleanup
  // clears the pending timer on unmount, on leaving the view, and before the
  // next charge (new token), so exactly one loop is ever live.
  useEffect(() => {
    if (!charge || status !== 'waiting') return;
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

    const deadline = Date.now() + 300000;
    let delay = 2000;
    const tick = async () => {
      const st = await ocp.pollPayment(charge.linkId);
      if (cancelled) return;
      if (st === PaymentLinkPaymentStatus.COMPLETED) {
        setStatus('paid');
        unlockTill();
        return;
      }
      if (st === PaymentLinkPaymentStatus.CANCELLED || st === PaymentLinkPaymentStatus.EXPIRED) {
        setFailKey('posFailed');
        setStatus('failed');
        unlockTill();
        return;
      }
      if (Date.now() >= deadline) {
        setFailKey('posExpired');
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
    };
  }, [charge, status, ocp, unlockTill]);

  if (ocp.links === null) {
    return (
      <div className="ocp-empty">
        <span className="spin" /> {t('loading')}
      </div>
    );
  }

  if (!activeLinks.length) {
    return (
      <>
        <div className="ocp-empty">{t('posNoLink')}</div>
        <div className="ocp-actions">
          <button className="btn-primary" onClick={() => go('links')}>
            {t('createLink')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>{t('posLead')}</p>
      <div className="tform">
        <label className="flabel">{t('posLink')}</label>
        <select className="tinput" value={selectedId} onChange={(e) => setLinkId(e.target.value)}>
          {activeLinks.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {l.label || `#${l.id}`}
            </option>
          ))}
        </select>
        <label className="flabel">
          {t('amount')} ({currency})
        </label>
        <input
          ref={amountRef}
          className="tinput"
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
        <button className="btn-primary" onClick={() => void doCharge()} disabled={charging} style={{ marginTop: 6 }}>
          {t('posCharge')}
        </button>
      </div>
      <div>
        {note && <div className="paybox-note warn">{note}</div>}
        {charge && (
          <>
            <div className="qrcard">
              <QRCode value={qrData(charge.lnurl)} size={212} level="M" bgColor="#ffffff" fgColor="#000000" />
              <div className="qcap">
                {/* Frozen at charge time — must not track a later select change. */}
                {charge.currency} {charge.amount}
              </div>
            </div>
            {status === 'paid' ? (
              <div className="posstat paid">
                <span className="okbubble">{CHECK_SVG}</span> {t('posPaid')} · {charge.currency} {charge.amount}
              </div>
            ) : status === 'failed' ? (
              <div className="posstat fail">
                {t(failKey)}{' '}
                <button
                  className="btn-mini"
                  onClick={() => void doCharge()}
                  disabled={charging}
                  style={{ marginLeft: 10, width: 'auto' }}
                >
                  {t('retry')}
                </button>
              </div>
            ) : (
              <div className="posstat">
                <span className="spin" /> {t('posWaiting')}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
