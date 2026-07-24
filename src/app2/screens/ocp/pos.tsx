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
interface Charge {
  token: number;
  linkId: string;
  amount: number;
  lnurl: string;
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

  // Load links on entry (the shell doesn't preload them for this sub-view).
  useEffect(() => {
    if (ocp.links === null) void ocp.loadLinks();
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

  const doCharge = useCallback(async () => {
    const amt = parseAmt(amount, language);
    if (amt === null) {
      setCharge(null);
      setNote(t('amtInvalid'));
      amountRef.current?.focus();
      return;
    }
    if (!selectedId) return;
    setNote(null);
    setCharging(true);
    try {
      const { lnurl } = await ocp.charge(selectedId, amt);
      setCharge({ token: Date.now(), linkId: selectedId, amount: amt, lnurl });
      setStatus('waiting');
      // Live: re-enable immediately so the till can re-charge; demo keeps the
      // button disabled until the fake resolution (mirrors the static app).
      if (!ocp.demo) setCharging(false);
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setCharge(null);
      setNote(`${t('genErr')}${msg ? `: ${msg}` : ''}`);
      setCharging(false);
    }
  }, [amount, language, selectedId, ocp, t]);

  // Payment polling — runs only while a charge is awaiting payment. The cleanup
  // clears the pending timer on unmount, on leaving the view, and before the
  // next charge (new token), so exactly one loop is ever live.
  useEffect(() => {
    if (!charge || status !== 'waiting') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    if (ocp.demo) {
      timer = setTimeout(() => {
        if (cancelled) return;
        setStatus('paid');
        setCharging(false);
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
        setCharging(false);
        return;
      }
      if (st === PaymentLinkPaymentStatus.CANCELLED || st === PaymentLinkPaymentStatus.EXPIRED) {
        setFailKey('posFailed');
        setStatus('failed');
        setCharging(false);
        return;
      }
      if (Date.now() >= deadline) {
        setFailKey('posExpired');
        setStatus('failed');
        setCharging(false);
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
  }, [charge, status, ocp]);

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
        <label className="flabel">{t('amount')} (CHF)</label>
        <input
          ref={amountRef}
          className="tinput"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void doCharge();
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
              <div className="qcap">CHF {charge.amount}</div>
            </div>
            {status === 'paid' ? (
              <div className="posstat paid">
                <span className="okbubble">{CHECK_SVG}</span> {t('posPaid')} · CHF {charge.amount}
              </div>
            ) : status === 'failed' ? (
              <div className="posstat fail">
                {t(failKey)}{' '}
                <button className="btn-mini" onClick={() => void doCharge()} style={{ marginLeft: 10, width: 'auto' }}>
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
