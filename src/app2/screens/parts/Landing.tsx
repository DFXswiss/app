// DFX App 2.0 — pre-login landing hero (finding #1: this whole screen was missing; the trade
// form used to render even for a signed-out visitor). Markup/classes ported 1:1 from the
// static preview's `#v-login` (public/app2/index.html, `.login > .hero`) so styles.css's
// `.login`/`.hero`/`.auth`/`.btn-glass`/`.wstrip`/`.trust` rules apply unchanged.

import { useAuth } from '@dfx.swiss/react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/ui';
import { useT } from '../../i18n';
import { useWalletSession } from '../../wallets/session';
import { normalizeInviteCode } from '../../wallets/invite';
import { WALLET_CATALOG } from '../../wallets/catalog';

// Mirrors the static app's STRIP_IDS (public/app2/index.html) — the wallets shown in the
// "works with your wallet" strip below the auth buttons.
const STRIP_IDS = ['MetaMask', 'Coinbase Wallet', 'Rabby', 'Phantom', 'TronLink'];

const WALLET_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M3 8a3 3 0 0 1 3-3h11a1 1 0 0 1 1 1v2" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
    <rect x={3} y={7} width={18} height={13} rx={3} stroke="#fff" strokeWidth={1.7} />
    <circle cx={16.5} cy={13.5} r={1.7} fill="#fff" />
  </svg>
);
const MAIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={5.5} width={18} height={13} rx={3} stroke="#5FA8FF" strokeWidth={1.7} />
    <path d="M4.5 8 12 13.2 19.5 8" stroke="#5FA8FF" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ARROW_ICON = (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SEND_ICON = (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const INVITE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M16 8a3 3 0 1 0-3-3M8 12a3 3 0 1 0 3 3M15.5 6.5l-7 5"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
  </svg>
);
const SHIELD_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3Z" stroke="currentColor" strokeWidth={1.6} />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={5} y={11} width={14} height={9} rx={2} stroke="currentColor" strokeWidth={1.6} />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth={1.6} />
  </svg>
);
const CLOCK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.6} />
    <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);

const STRIP_ENTRIES = WALLET_CATALOG.flatMap((group) => group.items).filter((entry) => STRIP_IDS.includes(entry.id));

export function Landing() {
  const { t } = useT();
  const { openConnect } = useWalletSession();
  const { signInWithMail } = useAuth();
  const { showToast } = useToast();

  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);

  const initialInvite = useMemo(() => new URLSearchParams(window.location.search).get('refcode')?.trim() || '', []);
  const [inviteOpen, setInviteOpen] = useState(() => Boolean(initialInvite));
  const [invite, setInvite] = useState(initialInvite);
  // ?wallet= (partner wallet id) — same param WalletSessionProvider reads for the wallet-connect
  // sign-in path (session.tsx), so the mail path stays consistent with it.
  const walletParam = useMemo(() => new URLSearchParams(window.location.search).get('wallet')?.trim() || undefined, []);
  const normalizedInvite = normalizeInviteCode(invite) ?? '';

  const submitEmail = async () => {
    if (sending) return;
    const value = email.trim();
    // finding #13: an invalid submit used to just silently no-op, leaving only the native
    // browser tooltip (if any) to explain why nothing happened — show an inline error instead.
    if (!value || !value.includes('@')) {
      setEmailInvalid(true);
      return;
    }
    setEmailInvalid(false);
    setSending(true);
    try {
      // SDK contract mirrors the static app's POST /auth/mail: {mail, redirectUri,
      // recommendationCode?, wallet?} — the emailed magic link returns to redirectUri with the
      // session token.
      await signInWithMail(
        value,
        window.location.origin + window.location.pathname,
        normalizedInvite || undefined,
        walletParam,
      );
      showToast(t('checkEmail'));
    } catch {
      showToast(t('mailErr'), { assertive: true });
    } finally {
      setSending(false);
    }
  };

  const handleEmailButton = () => {
    if (!emailOpen) {
      setEmailOpen(true);
      return;
    }
    void submitEmail();
  };

  return (
    <div className="login">
      <div className="hero">
        <h1>
          <span>{t('h1a')}</span>
          <br />
          <em>{t('h1b')}</em>
        </h1>
        <p className="lead">{t('lead')}</p>

        <div className="auth">
          <button className="btn-glass cta-wallet" onClick={() => openConnect(normalizedInvite || undefined)}>
            <span className="ic">{WALLET_ICON}</span>
            <span className="tx">
              <b>{t('connect')}</b>
              <span className="sub">{t('connectSub')}</span>
            </span>
            <span className="arr">{ARROW_ICON}</span>
          </button>
          <button className="btn-glass" onClick={handleEmailButton}>
            <span className="ic">{MAIL_ICON}</span>
            <span className="tx">
              <b>{t('email')}</b>
              <span className="sub">{t('emailSub')}</span>
            </span>
            <span className="arr">{ARROW_ICON}</span>
          </button>
          <div className={`emailwrap${emailOpen ? ' open' : ''}`}>
            <div>
              <div className={`efield${emailInvalid ? ' invalid' : ''}`}>
                <input
                  type="email"
                  placeholder="you@email.com"
                  autoComplete="email"
                  aria-label={t('email')}
                  aria-invalid={emailInvalid || undefined}
                  aria-describedby={emailInvalid ? 'emailFieldErr' : undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailInvalid) setEmailInvalid(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitEmail();
                  }}
                />
                <button aria-label="Send magic link" onClick={() => void submitEmail()} disabled={sending}>
                  {SEND_ICON}
                </button>
              </div>
              {emailInvalid && (
                <p className="ferr" id="emailFieldErr" role="alert">
                  {t('emailInvalid')}
                </p>
              )}
            </div>
          </div>
        </div>

        <button className={`invite-toggle${invite ? ' applied' : ''}`} onClick={() => setInviteOpen((v) => !v)}>
          {INVITE_ICON}
          <span>{invite ? `${t('inviteApplied')} ${invite}` : t('haveInvite')}</span>
        </button>
        <div className={`emailwrap${inviteOpen ? ' open' : ''}`}>
          <div>
            <div className="efield" style={{ paddingTop: 10 }}>
              <input
                type="text"
                placeholder="DFX-XXXX"
                autoComplete="off"
                aria-label={t('haveInvite')}
                maxLength={14}
                style={{ textTransform: 'uppercase' }}
                value={invite}
                onChange={(e) => setInvite(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </div>

        <div className="supported">
          <div className="cap">{t('worksWith')}</div>
          <div className="wstrip">
            {STRIP_ENTRIES.map((entry) => (
              <button
                key={entry.id}
                className="wchip"
                type="button"
                title={entry.id}
                onClick={() => openConnect(normalizedInvite || undefined)}
              >
                <img src={entry.icon} alt="" width={25} height={25} />
              </button>
            ))}
          </div>
        </div>
        <div className="trust">
          <div className="t">
            {SHIELD_ICON}
            <span>{t('t1')}</span>
          </div>
          <div className="t">
            {LOCK_ICON}
            <span>{t('t2')}</span>
          </div>
          <div className="t">
            {CLOCK_ICON}
            <span>{t('t3')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
