// DFX App 2.0 — OpenCryptoPay » Payment links sub-view.
//
// Ported from the static preview (public/app2/index.html): ocpLinksHtml (2481),
// linkCard (2467), wireLinks / toggleLink / createLink / openPosLink
// (2490-2521). Lists the merchant's reusable payment links with a scannable
// LNURL QR, activate/deactivate (PUT /paymentLink), an "Open POS" jump, and a
// create-link form (POST /paymentLink) gated on having a Lightning sell route.
// All state + API calls come from the shared `ocp` prop (useOcp) — this view
// only loads its own data on mount and holds create/toggle form state.

import { ApiException, type PaymentLink, PaymentLinkStatus } from '@dfx.swiss/react';
import { type ReactNode, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { qrData } from './lnurl';
import type { OcpApi, OcpSubViewProps } from './useOcp';

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

const LINK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M9 13a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1M15 11a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </svg>
);

const CHEV_ICON = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const POS_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={5} y={3} width={14} height={18} rx={2} stroke="currentColor" strokeWidth={1.7} />
    <path d="M8 7h8" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="kk">{label}</span>
      <span className="vv">{value}</span>
    </div>
  );
}

interface LinkCardProps {
  link: PaymentLink;
  ocp: OcpApi;
  toggling: boolean;
  onToggle: () => void;
  onPos: () => void;
}

function LinkCard({ link, ocp, toggling, onToggle, onPos }: LinkCardProps) {
  const { t } = useT();
  const active = link.status === PaymentLinkStatus.ACTIVE;
  const pay = link.payment;
  const title = link.label || link.externalId || `${t('ocpLink')} ${link.id}`;
  const payCurrency = pay ? (typeof pay.currency === 'string' ? pay.currency : (pay.currency?.name ?? '')) : '';

  return (
    <details className="rcol">
      <summary>
        <span className="rci">{LINK_ICON}</span>
        <span className="rtt">
          <b>{title}</b>
          <small>
            {t('route')} {String(link.routeId)} · {String(link.status)}
          </small>
        </span>
        <span className={`pill-chip ${active ? 'act' : 'ina'}`}>{String(link.status)}</span>
        <span className="chev">{CHEV_ICON}</span>
      </summary>
      <div className="rbody">
        {link.lnurl && (
          <div className="qrcard">
            <QRCode value={qrData(link.lnurl)} size={212} level="M" bgColor="#ffffff" fgColor="#000000" />
            <div className="qcap">{link.label || `#${link.id}`}</div>
          </div>
        )}
        <KvRow label="ID" value={`#${link.id}`} />
        {link.externalId && <KvRow label={t('invoiceId')} value={link.externalId} />}
        {link.lnurl && (
          <div className="kv">
            <span className="kk">LNURL</span>
            <span className="vv" style={{ fontSize: 11 }}>
              {link.lnurl.slice(0, 26)}…
            </span>
            <button type="button" className="cpy" aria-label={t('copyLnurl')} onClick={() => ocp.copy(link.lnurl)}>
              {COPY_ICON}
            </button>
          </div>
        )}
        {pay && (
          <>
            <KvRow label={t('amount')} value={`${payCurrency} ${pay.amount}`.trim()} />
            <KvRow label={t('state')} value={String(pay.status)} />
          </>
        )}
        <div style={{ padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row2">
            {link.lnurl && (
              <button type="button" className="btn-mini" onClick={() => ocp.copy(link.lnurl)}>
                {COPY_ICON}
                {t('copyLnurl')}
              </button>
            )}
            <button type="button" className="btn-mini" onClick={onPos}>
              {POS_ICON}
              {t('openPos')}
            </button>
          </div>
          <button
            type="button"
            className={`btn-mini ${active ? 'danger' : ''}`.trim()}
            disabled={toggling}
            onClick={onToggle}
          >
            {active ? t('deactivate') : t('activate')}
          </button>
        </div>
      </div>
    </details>
  );
}

interface CreateNote {
  variant: '' | 'warn';
  node: ReactNode;
}

export default function LinksView({ ocp, go }: OcpSubViewProps) {
  const { t } = useT();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<CreateNote | null>(null);
  const [togglingId, setTogglingId] = useState<string | number | null>(null);

  // The create button gates on a Lightning sell route, so load routes too —
  // mirrors the static app loading /route alongside /paymentLink for this view.
  useEffect(() => {
    if (ocp.links === null) void ocp.loadLinks();
    if (ocp.routes === null) void ocp.loadRoutes();
  }, [ocp.links, ocp.routes, ocp.loadLinks, ocp.loadRoutes]);

  const canCreate = ocp.lnSellRoutes.length > 0;

  const create = async () => {
    const ln = ocp.lnSellRoutes;
    if (!ln.length) return;
    setCreating(true);
    setNote({
      variant: '',
      node: (
        <>
          <span className="spin" /> {t('tkSending')}
        </>
      ),
    });
    try {
      await ocp.createLink(ln[0].id);
      setNote(null);
      showToast(t('linkCreated'));
    } catch (err) {
      const msg = err instanceof ApiException ? err.message : '';
      setNote({ variant: 'warn', node: `${t('genErr')}${msg ? `: ${msg}` : ''}` });
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (link: PaymentLink) => {
    const target = link.status !== PaymentLinkStatus.ACTIVE;
    setTogglingId(link.id);
    try {
      await ocp.toggleLink(link.id, target);
      showToast(t('saved'));
    } catch {
      showToast(t('genErr'));
    } finally {
      setTogglingId(null);
    }
  };

  const openPos = async (id: string | number) => {
    if (ocp.demo) {
      go('pos');
      return;
    }
    showToast(`${t('openPos')}…`);
    const url = await ocp.createPosLink(id);
    if (url) window.open(url, '_blank', 'noopener');
    else go('pos');
  };

  if (ocp.links === null) {
    return (
      <div className="ocp-empty">
        <span className="spin" /> {t('loading')}
      </div>
    );
  }

  const links = ocp.links;

  return (
    <>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>{t('linksLead')}</p>
      {!canCreate && <div className="ocp-empty">{t('invoiceNoRoute')}</div>}
      {links.length ? (
        links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            ocp={ocp}
            toggling={togglingId === link.id}
            onToggle={() => void toggle(link)}
            onPos={() => void openPos(link.id)}
          />
        ))
      ) : (
        <div className="ocp-empty">{t('linksEmpty')}</div>
      )}
      <div className="ocp-actions">
        <button type="button" className="btn-primary" disabled={!canCreate || creating} onClick={() => void create()}>
          {t('createLink')}
        </button>
      </div>
      {note && (
        <div className={`paybox-note ${note.variant}`.trim()} style={{ marginTop: 10 }}>
          {note.node}
        </div>
      )}
    </>
  );
}
