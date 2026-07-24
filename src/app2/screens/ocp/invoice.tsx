// DFX App 2.0 — OpenCryptoPay » Invoice sub-view.
//
// Faithful port of the static preview's `ocpInvoiceHtml` (public/app2/index.html
// ~2418) + `wireInvoice`/`genInvoice` (~2432-2463): pick a settlement route, enter
// an invoice id + amount, and generate a one-off OCP payment link. The returned
// LNURL is rendered as a real, scannable QR via react-qr-code (value =
// qrData(lnurl) from lnurl.ts, exactly like trade/QrBill.tsx), with the copyable
// LNURL and the download-PNG / print / sticker toolbar the static `qrCard` shows
// (ports qrToPng ~2165 / qrPrint ~2171 / qrSticker ~2176, rendering from the
// React-rendered QR <svg> through a ref + canvas — CSP-safe, no qrcode.js).

import { ApiException, ResponseType, useApi } from '@dfx.swiss/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { parseAmt } from '../trade/amount';
import { qrData } from './lnurl';
import type { OcpSubViewProps } from './useOcp';

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.7} />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);

const DOWNLOAD_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PRINT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M7 9V4h10v5M7 19H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M7 15h10v5H7z"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
  </svg>
);

const STICKER_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={4} y={3} width={16} height={18} rx={2} stroke="currentColor" strokeWidth={1.7} />
    <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);

/** Minimal HTML escape for values written into the print pop-up document. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

interface InvoiceOut {
  lnurl: string;
  currency: string;
  amount: number;
  invId: string;
  routeId: string;
}

interface NoteState {
  variant: '' | 'ok' | 'warn';
  node: ReactNode;
}

export default function InvoiceView({ ocp, go }: OcpSubViewProps) {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { call } = useApi();

  const [routeId, setRouteId] = useState('');
  const [invId, setInvId] = useState('');
  const [amountText, setAmountText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [note, setNote] = useState<NoteState | null>(null);
  const [out, setOut] = useState<InvoiceOut | null>(null);

  const invIdRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const qrCardRef = useRef<HTMLDivElement>(null);

  // Load routes on demand (the shell renders this behind the activation gate but
  // does not preload routes) — mirrors renderOcp's `if(!OCP.routes) ocpLoadRoutes`.
  useEffect(() => {
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp.routes, ocp.loadRoutes]);

  // Still resolving routes → spinner (matches the static app's gate spinner).
  if (ocp.routes === null) {
    return (
      <div className="ocp-empty">
        <span className="spin" /> {t('loading')}
      </div>
    );
  }

  const ln = ocp.lnSellRoutes;

  if (!ln.length) {
    return (
      <>
        <div className="ocp-empty">{t('invoiceNoRoute')}</div>
        <div className="ocp-actions">
          <button type="button" className="btn-primary" onClick={() => go('routes')}>
            {t('addSellRoute')}
          </button>
        </div>
      </>
    );
  }

  const selectedId = routeId || String(ln[0].id);
  const selectedRoute = ln.find((r) => String(r.id) === selectedId) ?? ln[0];
  const currency = selectedRoute.currency?.name || 'CHF';

  const generate = async () => {
    if (generating) return;
    const trimmedInvId = invId.trim();
    if (!trimmedInvId) {
      invIdRef.current?.focus();
      return;
    }
    const amount = parseAmt(amountText, language);
    if (amount === null) {
      setOut(null);
      setNote({ variant: 'warn', node: t('amtInvalid') });
      amountRef.current?.focus();
      return;
    }

    setOut(null);
    setGenerating(true);
    setNote({
      variant: '',
      node: (
        <>
          <span className="spin" /> {t('invoiceGenWait')}
        </>
      ),
    });

    try {
      const { lnurl } = await ocp.createInvoice({
        routeId: selectedId,
        amount,
        currency,
        message: trimmedInvId,
      });
      setNote(null);
      setOut({ lnurl, currency, amount, invId: trimmedInvId, routeId: selectedId });
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setNote({ variant: 'warn', node: `${t('genErr')}${msg ? `: ${msg}` : ''}` });
    } finally {
      setGenerating(false);
    }
  };

  // --- QR toolbar (qrToPng / qrPrint / qrSticker) ---------------------------

  const currentSvg = (): SVGSVGElement | null => qrCardRef.current?.querySelector('svg') ?? null;

  const downloadPng = () => {
    const svg = currentSvg();
    if (!svg || !out) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1000, 1000);
    const data = new XMLSerializer().serializeToString(svg).replace(/#072440/g, '#000000');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 1000, 1000);
      const a = document.createElement('a');
      a.download = `${`invoice_${out.invId}`.replace(/\s+/g, '_').toLowerCase()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(data)}`;
  };

  const printQr = () => {
    const svg = currentSvg();
    if (!svg || !out) return;
    const data = new XMLSerializer().serializeToString(svg).replace(/#072440/g, '#000000');
    const cap = escapeHtml(`${out.currency} ${out.amount} · ${out.invId}`);
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) {
      showToast(t('popupBlocked'));
      return;
    }
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>OpenCryptoPay</title>` +
        `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,Arial,sans-serif;color:#0A3055">` +
        `<div style="width:320px;height:320px">${data}</div>` +
        `<div style="margin-top:16px;font-size:19px;font-weight:600">${cap}</div>` +
        `<div style="margin-top:6px;font-size:12px;color:#888">OpenCryptoPay</div></body>`,
    );
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch {
        /* printing is best-effort */
      }
    }, 200);
  };

  const downloadSticker = async () => {
    if (!out) return;
    if (ocp.demo) {
      showToast(t('stickerDemo'));
      return;
    }
    showToast(`${t('downloadSticker')}…`);
    const query =
      `/paymentLink/stickers?route=${encodeURIComponent(out.routeId)}` +
      (out.invId ? `&externalIds=${encodeURIComponent(out.invId)}` : '') +
      `&type=BitcoinFocus&mode=Customer&lang=${encodeURIComponent(language.toUpperCase())}`;
    try {
      const blob = await call<Blob>({ url: query, method: 'GET', responseType: ResponseType.BLOB });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = 'DFX_OCP_stickers.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1500);
    } catch {
      showToast(t('genErr'));
    }
  };

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>
        {t('invoiceLead')}
      </p>
      <div className="tform">
        <label className="flabel" htmlFor="invRoute">
          {t('invoiceRoute')}
        </label>
        <select id="invRoute" className="tinput" value={selectedId} onChange={(e) => setRouteId(e.target.value)}>
          {ln.map((r) => (
            <option key={r.id} value={String(r.id)}>
              {t('route')} {r.id} · {r.currency?.name || ''}
            </option>
          ))}
        </select>

        <label className="flabel" htmlFor="invId">
          {t('invoiceId')}
        </label>
        <input
          id="invId"
          ref={invIdRef}
          className="tinput"
          placeholder={t('invoiceIdP')}
          value={invId}
          onChange={(e) => setInvId(e.target.value)}
        />

        <label className="flabel" htmlFor="invAmt">
          {t('amount')}
        </label>
        <input
          id="invAmt"
          ref={amountRef}
          className="tinput"
          inputMode="decimal"
          placeholder="0.00"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
        />

        <button type="button" className="btn-primary" style={{ marginTop: 6 }} disabled={generating} onClick={generate}>
          {t('invoiceGen')}
        </button>

        {note && (
          <div className={`paybox-note ${note.variant}`.trim()} style={{ marginTop: 8 }}>
            {note.node}
          </div>
        )}

        {out && (
          <div>
            <div className="qrcard" ref={qrCardRef}>
              <QRCode value={qrData(out.lnurl)} size={212} level="M" bgColor="#ffffff" fgColor="#000000" />
              <div className="qcap">
                {out.currency} {out.amount} · {out.invId}
              </div>
            </div>
            <div className="qractions">
              <button type="button" className="btn-mini" onClick={downloadPng}>
                {DOWNLOAD_ICON}
                {t('downloadQr')}
              </button>
              <button type="button" className="btn-mini" onClick={printQr}>
                {PRINT_ICON}
                {t('printQr')}
              </button>
              <button type="button" className="btn-mini" onClick={downloadSticker}>
                {STICKER_ICON}
                {t('downloadSticker')}
              </button>
            </div>
            <div className="glass" style={{ borderRadius: 16, marginTop: 6 }}>
              <div className="kv">
                <span className="kk">LNURL</span>
                <span className="vv" style={{ fontSize: 11 }}>
                  {out.lnurl.slice(0, 28)}…
                </span>
                <button type="button" className="cpy" aria-label={t('copyLnurl')} onClick={() => ocp.copy(out.lnurl)}>
                  {COPY_ICON}
                </button>
              </div>
            </div>
            <p
              style={{ color: 'var(--t-muted)', fontSize: 12.5, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}
            >
              {t('invoiceScan')}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
