// DFX App 2.0 — OpenCryptoPay screen shell.
//
// Ported from the static preview's OCP view (public/app2/index.html markup
// ~line 981; `renderOcp` ~2231, `ocpHomeHtml` 2259, `demoToggleHtml` 2297,
// `ocpApplyHtml`/`wireApply`/`submitApply` 2311-2347). This file owns the
// sub-view router + activation gate, the HOME hub (benefits / 3-step / Apply CTA
// + demo toggle) and the APPLY form (→ PartnershipRequest support issue). The
// six managed sub-views (routes/invoice/links/pos/history/config) live in their
// own files and receive `{ ocp, go }` (see useOcp.ts › OcpSubViewProps).
//
// Sub-view selection is URL-driven: `/ocp` is the hub, `/ocp?sub=<name>` opens a
// sub-view. That lets the Drawer deep-link to a sub-view (payRoutes → routes)
// while keeping in-screen navigation (tiles, back) consistent with the browser
// back button. The gated sub-views require an active merchant account; reaching
// one before activation probes GET /paymentLink/config and falls back to home.

import {
  ApiException,
  SupportIssueReason,
  SupportIssueType,
  useSupportChat,
  useUser,
  useUserContext,
} from '@dfx.swiss/react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '../../components/ui';
import { useT, type TranslationKey } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { LoggedOutState } from '../parts/LoggedOutState';
import ConfigView from './config';
import HistoryView from './history';
import InvoiceView from './invoice';
import LinksView from './links';
import PosView from './pos';
import RoutesView from './routes';
import { type OcpApi, type OcpSub, useOcp } from './useOcp';

const SUBS: OcpSub[] = ['home', 'apply', 'routes', 'invoice', 'links', 'pos', 'history', 'config'];
const GATED = new Set<OcpSub>(['routes', 'invoice', 'links', 'pos', 'history', 'config']);

function normalizeSub(value: string | null): OcpSub {
  return value && (SUBS as string[]).includes(value) ? (value as OcpSub) : 'home';
}

const TITLE_KEY: Partial<Record<OcpSub, TranslationKey>> = {
  routes: 'payRoutes',
  invoice: 'ocpInvoice',
  links: 'ocpLinks',
  apply: 'ocpApplyTitle',
  pos: 'ocpPos',
  history: 'ocpHistory',
  config: 'ocpSettings',
};

const BACK_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Brand mark for the hero badge. NOTE: the static preview loads the real
// `brand/ocp-logo-white.svg`; that asset isn't vendored into app2 yet, so this
// Lightning glyph stands in (white on the badge's gradient). Swap for the real
// OpenCryptoPay logo SVG when it lands under assets/brand/.
const OCP_BADGE = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" stroke="#fff" strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.7} />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);

const SPINNER_ROW = (label: string): ReactNode => (
  <div className="ocp-empty">
    <span className="spin" /> {label}
  </div>
);

export default function OcpScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  const { isLoggedIn } = useWalletSession();
  const [searchParams] = useSearchParams();
  const ocp = useOcp();

  const sub = normalizeSub(searchParams.get('sub'));
  const gated = GATED.has(sub);

  const go = useCallback((next: OcpSub) => navigate(next === 'home' ? '/ocp' : `/ocp?sub=${next}`), [navigate]);

  // Home and every gated sub-view need to know activation state — probe once.
  useEffect(() => {
    if (isLoggedIn && ocp.active === null && (gated || sub === 'home')) void ocp.probe();
  }, [isLoggedIn, ocp.active, ocp.probe, gated, sub]);

  // A gated sub-view reached without an active account falls back to the hub.
  useEffect(() => {
    if (gated && ocp.active === false) go('home');
  }, [gated, ocp.active, go]);

  if (!isLoggedIn) return <LoggedOutState title="OpenCryptoPay" />;

  let body: ReactNode;
  if (sub === 'apply') {
    body = <ApplyView />;
  } else if (sub === 'home') {
    body = <HomeView ocp={ocp} go={go} />;
  } else if (ocp.active === null) {
    body = SPINNER_ROW(t('loading'));
  } else if (!ocp.active) {
    body = <HomeView ocp={ocp} go={go} />; // redirect to home is in-flight
  } else {
    body = renderSub(sub, ocp, go);
  }

  const titleKey = TITLE_KEY[sub];

  return (
    <div className="account">
      <div className="txhead">
        <button
          type="button"
          className="rbtn"
          aria-label="Back"
          style={{ width: 40, height: 40 }}
          onClick={() => (sub === 'home' ? navigate('/account') : go('home'))}
        >
          {BACK_ICON}
        </button>
        <h2>
          {titleKey ? t(titleKey) : 'OpenCryptoPay'}
          {ocp.demo && <span className="demobadge">{t('demoTag')}</span>}
        </h2>
      </div>
      {body}
    </div>
  );
}

function renderSub(sub: OcpSub, ocp: OcpApi, go: (sub: OcpSub) => void): ReactNode {
  switch (sub) {
    case 'routes':
      return <RoutesView ocp={ocp} go={go} />;
    case 'invoice':
      return <InvoiceView ocp={ocp} go={go} />;
    case 'links':
      return <LinksView ocp={ocp} go={go} />;
    case 'pos':
      return <PosView ocp={ocp} go={go} />;
    case 'history':
      return <HistoryView ocp={ocp} go={go} />;
    case 'config':
      return <ConfigView ocp={ocp} go={go} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// HOME hub (ocpHomeHtml + demoToggleHtml)
// ---------------------------------------------------------------------------

interface Benefit {
  icon: ReactNode;
  title: TranslationKey;
  sub: TranslationKey;
}

const BENEFITS: Benefit[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
      </svg>
    ),
    title: 'ocpB1',
    sub: 'ocpB1s',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x={4} y={4} width={7} height={7} rx={1.5} stroke="currentColor" strokeWidth={1.7} />
        <rect x={13} y={4} width={7} height={7} rx={1.5} stroke="currentColor" strokeWidth={1.7} />
        <rect x={4} y={13} width={7} height={7} rx={1.5} stroke="currentColor" strokeWidth={1.7} />
        <rect x={13} y={13} width={3} height={3} rx={0.8} fill="currentColor" />
        <rect x={17} y={17} width={3} height={3} rx={0.8} fill="currentColor" />
        <rect x={17} y={13} width={3} height={3} rx={0.8} stroke="currentColor" strokeWidth={1.4} />
        <rect x={13} y={17} width={3} height={3} rx={0.8} stroke="currentColor" strokeWidth={1.4} />
      </svg>
    ),
    title: 'ocpB2',
    sub: 'ocpB2s',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x={3} y={7} width={18} height={10} rx={2} stroke="currentColor" strokeWidth={1.7} />
        <circle cx={12} cy={12} r={2.6} stroke="currentColor" strokeWidth={1.6} />
        <path d="M6.4 10.6v2.8M17.6 10.6v2.8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
    ),
    title: 'ocpB3',
    sub: 'ocpB3s',
  },
];

interface Tile {
  sub: OcpSub;
  icon: ReactNode;
  title: TranslationKey;
  subtitle: TranslationKey;
}

const TILES: Tile[] = [
  {
    sub: 'links',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M9 13a5 5 0 0 1 0-7l2-2a5 5 0 0 1 7 7l-1 1M15 11a5 5 0 0 1 0 7l-2 2a5 5 0 0 1-7-7l1-1"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      </svg>
    ),
    title: 'ocpLinks',
    subtitle: 'ocpLinksSub',
  },
  {
    sub: 'invoice',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M6 3h9l3 3v15l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5L6 3Z"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
    ),
    title: 'ocpInvoice',
    subtitle: 'ocpInvoiceSub',
  },
  {
    sub: 'pos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x={4} y={3} width={16} height={18} rx={2.5} stroke="currentColor" strokeWidth={1.7} />
        <rect x={7} y={6} width={10} height={4} rx={1} stroke="currentColor" strokeWidth={1.6} />
        <circle cx={8.5} cy={14} r={1} fill="currentColor" />
        <circle cx={12} cy={14} r={1} fill="currentColor" />
        <circle cx={15.5} cy={14} r={1} fill="currentColor" />
        <circle cx={8.5} cy={17.5} r={1} fill="currentColor" />
        <circle cx={12} cy={17.5} r={1} fill="currentColor" />
      </svg>
    ),
    title: 'ocpPos',
    subtitle: 'ocpPosSub',
  },
  {
    sub: 'history',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
      </svg>
    ),
    title: 'ocpHistory',
    subtitle: 'ocpHistorySub',
  },
  {
    sub: 'routes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M4 8h16M4 8l3-3M4 8l3 3M20 16H4m16 0-3-3m3 3-3 3"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: 'payRoutes',
    subtitle: 'ocpRoutesSub',
  },
  {
    sub: 'config',
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx={12} cy={12} r={3} stroke="currentColor" strokeWidth={1.7} />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </svg>
    ),
    title: 'ocpSettings',
    subtitle: 'ocpSettingsSub',
  },
];

const PLAY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M8 5v14l11-7z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />
  </svg>
);

function DemoToggle({ ocp }: { ocp: OcpApi }) {
  const { t } = useT();
  return (
    <>
      <div className="sectionlabel tight">{t('demoSection')}</div>
      <button
        type="button"
        className="suprow glass"
        style={{ cursor: 'pointer' }}
        onClick={() => (ocp.demo ? ocp.disableDemo() : ocp.enableDemo())}
      >
        <span className="ic">{PLAY_ICON}</span>
        <span className="tx">
          <b>{t(ocp.demo ? 'demoOnTitle' : 'demoOffTitle')}</b>
          <small>{t(ocp.demo ? 'demoOnSub' : 'demoOffSub')}</small>
        </span>
        <span className={`switch${ocp.demo ? ' on' : ''}`}>
          <span className="knob" />
        </span>
      </button>
    </>
  );
}

function HomeView({ ocp, go }: { ocp: OcpApi; go: (sub: OcpSub) => void }) {
  const { t } = useT();
  const active = ocp.active === true;
  const accessKey = ocp.config?.accessKey;

  return (
    <>
      <div className="ocp-hero">
        <div className="ocp-badge">{OCP_BADGE}</div>
        <h3>OpenCryptoPay</h3>
        <p>{t('ocpLead')}</p>
        {active && (
          <div className="statuschip on">
            <span className="dot" />
            {t('ocpActive')}
          </div>
        )}
      </div>

      {!active ? (
        <>
          <div className="glass ocp-benefits" style={{ padding: '6px 14px', marginTop: 14 }}>
            {BENEFITS.map((b) => (
              <div key={b.title} className="benefit">
                <span className="bi">{b.icon}</span>
                <div>
                  <b>{t(b.title)}</b>
                  <small>{t(b.sub)}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="sectionlabel tight">{t('ocpHowTitle')}</div>
          <div className="glass" style={{ borderRadius: 18, padding: '4px 14px' }}>
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className="ocp-step">
                <span className="stepn">{n}</span>
                <div>
                  <b>{t(`ocpStep${n}` as TranslationKey)}</b>
                  <small>{t(`ocpStep${n}s` as TranslationKey)}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="ocp-actions" style={{ marginTop: 16 }}>
            <button type="button" className="btn-primary" onClick={() => go('apply')}>
              {t('ocpApplyCta')}
            </button>
          </div>

          <DemoToggle ocp={ocp} />
        </>
      ) : (
        <>
          <div className="sectionlabel tight">{t('ocpManage')}</div>
          <div className="ocp-tiles">
            {TILES.map((tile) => (
              <button key={tile.sub} type="button" className="octile glass" onClick={() => go(tile.sub)}>
                <span className="ti">{tile.icon}</span>
                <span className="tx">
                  <b>{t(tile.title)}</b>
                  <small>{t(tile.subtitle)}</small>
                </span>
                <span className="caret">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <path
                      d="M9 6l6 6-6 6"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            ))}
          </div>

          {accessKey && (
            <>
              <div className="sectionlabel tight">{t('ocpAccess')}</div>
              <div className="glass" style={{ borderRadius: 16 }}>
                <div className="kv">
                  <span className="kk">{t('ocpKey')}</span>
                  <span className="vv" style={{ fontSize: 12 }}>
                    {accessKey}
                  </span>
                  <button type="button" className="cpy" aria-label={t('copied')} onClick={() => ocp.copy(accessKey)}>
                    {COPY_ICON}
                  </button>
                </div>
              </div>
            </>
          )}

          <DemoToggle ocp={ocp} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// APPLY form (ocpApplyHtml / wireApply / submitApply)
// ---------------------------------------------------------------------------

const STORE_TYPES = ['Online', 'Physical', 'OnlineAndPhysical'] as const;

interface ApplyResult {
  variant: '' | 'ok' | 'warn';
  node: ReactNode;
}

const APPLY_SPINNER = <span className="spin" />;

function ApplyView() {
  const { t } = useT();
  const { showToast } = useToast();
  const { isLoggedIn } = useWalletSession();
  const { user, updateMail } = useUserContext();
  const { getProfile } = useUser();
  const { createIssue } = useSupportChat();

  const [biz, setBiz] = useState('');
  const [type, setType] = useState<(typeof STORE_TYPES)[number]>(STORE_TYPES[0]);
  const [website, setWebsite] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [about, setAbout] = useState('');
  const [result, setResult] = useState<ApplyResult | null>(null);

  const needMail = !user?.mail;

  // Prefill the contact name with the verified real name (mirrors wireApply's
  // `n.value = realName()`), keeping any value the user has already typed.
  useEffect(() => {
    if (!isLoggedIn) return undefined;
    let cancelled = false;
    void getProfile()
      .then((profile) => {
        if (cancelled || !profile) return;
        const realName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
        if (realName) setName((current) => (nameTouched || current ? current : realName));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only re-run on session change; the inner guard preserves a user-typed value.
  }, [isLoggedIn]);

  const submit = async () => {
    if (submitting || submitted) return;
    const trimmedBiz = biz.trim();
    const trimmedName = name.trim();
    if (!trimmedBiz || !trimmedName) return;
    const trimmedMail = email.trim();
    if (needMail && (!trimmedMail || !trimmedMail.includes('@'))) {
      setResult({ variant: 'warn', node: t('tkNeedMail') });
      return;
    }

    setSubmitting(true);
    setResult({
      variant: '',
      node: (
        <>
          {APPLY_SPINNER} {t('tkSending')}
        </>
      ),
    });

    if (needMail) {
      try {
        await updateMail(trimmedMail);
      } catch (error) {
        const status = error instanceof ApiException ? error.statusCode : undefined;
        setResult({ variant: 'warn', node: status === 409 ? t('mailTaken') : t('mailErr') });
        setSubmitting(false);
        return;
      }
    }

    const trimmedWeb = website.trim();
    const trimmedAbout = about.trim();
    const message =
      `OpenCryptoPay application\nBusiness: ${trimmedBiz}\nType: ${type}` +
      (trimmedWeb ? `\nWebsite: ${trimmedWeb}` : '') +
      (trimmedAbout ? `\n\n${trimmedAbout}` : '');

    try {
      const issue = await createIssue({
        type: SupportIssueType.PARTNERSHIP_REQUEST,
        reason: SupportIssueReason.OTHER,
        name: trimmedName,
        message,
      });
      const uid = issue?.uid;
      setResult({
        variant: 'ok',
        node: (
          <>
            {t('ocpApplyOk')}
            {uid && (
              <>
                {' '}
                <b>{uid}</b>
              </>
            )}
            <br />
            <span style={{ color: 'var(--t-muted)' }}>{t('ocpApplyOkSub')}</span>
          </>
        ),
      });
      setSubmitted(true);
      showToast(t('ocpApplyToast'));
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      setResult({ variant: 'warn', node: detail ? `${t('genErr')}: ${detail}` : t('genErr') });
      setSubmitting(false);
    }
  };

  return (
    <>
      <p className="ocp-sub" style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '2px 4px 14px' }}>
        {t('ocpApplyLead')}
      </p>
      <div className="tform">
        <label className="flabel" htmlFor="apBiz">
          {t('ocpBizName')}
        </label>
        <input
          id="apBiz"
          className="tinput"
          placeholder={t('ocpBizNameP')}
          value={biz}
          onChange={(e) => setBiz(e.target.value)}
        />

        <label className="flabel" htmlFor="apType">
          {t('ocpBizType')}
        </label>
        <select
          id="apType"
          className="tinput"
          value={type}
          onChange={(e) => setType(e.target.value as (typeof STORE_TYPES)[number])}
        >
          {STORE_TYPES.map((s) => (
            <option key={s} value={s}>
              {t(`st_${s}` as TranslationKey)}
            </option>
          ))}
        </select>

        <label className="flabel" htmlFor="apWeb">
          {t('ocpWebsite')}
        </label>
        <input
          id="apWeb"
          className="tinput"
          placeholder="https://"
          inputMode="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        <label className="flabel" htmlFor="apName">
          {t('ocpContact')}
        </label>
        <input
          id="apName"
          className="tinput"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setNameTouched(true);
            setName(e.target.value);
          }}
        />

        {needMail && (
          <>
            <label className="flabel" htmlFor="apMail">
              {t('ticketEmail')}
            </label>
            <input
              id="apMail"
              className="tinput"
              type="email"
              placeholder="you@email.com"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}

        <label className="flabel" htmlFor="apMsg">
          {t('ocpAbout')}
        </label>
        <textarea
          id="apMsg"
          className="tinput"
          rows={3}
          placeholder={t('ocpAboutP')}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
        />

        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 6 }}
          disabled={submitting || submitted}
          onClick={submit}
        >
          {t('ocpApplySend')}
        </button>

        {result && (
          <div className={`paybox-note ${result.variant}`.trim()} style={{ marginTop: 12 }}>
            {result.node}
          </div>
        )}
      </div>
    </>
  );
}
