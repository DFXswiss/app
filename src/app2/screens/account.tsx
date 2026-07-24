// DFX App 2.0 — account screen.
//
// Ported from the static preview's `v-account` section (public/app2/index.html,
// lines ~839-935 markup, `renderAccount()` around line 4199 for behaviour).
// Data comes from `useUserContext()` (mail, KYC level/limit, addresses,
// volumes — DfxContextProvider already mounts UserContextProvider, see
// node_modules/@dfx.swiss/react/dist/contexts/dfx.context.js) and `useUser()`
// for the referral code (`getRef()`, not part of the reactive user context).

import { type Blockchain, KycLevel, Referral, type UserProfile, useUser, useUserContext } from '@dfx.swiss/react';
import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountSheets, type AccountSheet } from '../components/AccountSheets';
import { LoadingRow, onActivate, Sheet, SheetHeader, useToast } from '../components/ui';
import { LANGUAGES, useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { chainName, mainnetOnly } from './trade/blockchain-meta';
import { formatChf, localeFor, shortAddress } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';

/** Original collapses the chain set: a single chain shows its friendly name, several show
 * "N networks" — never a long raw ·-joined dump (mainnet only, no raw enum values). */
function chainList(blockchains: readonly Blockchain[] | undefined, t: (key: 'networks') => string): string {
  const names = mainnetOnly(blockchains ?? []).map(chainName);
  if (names.length === 0) return '';
  return names.length === 1 ? names[0] : `${names.length} ${t('networks')}`;
}

const PERIOD_KEY: Record<string, TranslationKey> = { Day: 'perDay', Month: 'perMonth', Year: 'perYear' };

const AVATAR_ICON = (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 30, height: 30 }}>
    <circle cx={12} cy={8} r={4} stroke="#fff" strokeWidth={1.8} />
    <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
const VERIFIED_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.8} />
  </svg>
);
const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
const KYC_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 2 4 5v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V5l-8-3Z" stroke="currentColor" strokeWidth={1.7} />
  </svg>
);
const LIMIT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M3 17l5-5 4 4 8-8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WALLET_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={6} width={18} height={13} rx={3} stroke="currentColor" strokeWidth={1.8} />
    <circle cx={16.5} cy={12.5} r={1.6} fill="currentColor" />
  </svg>
);
const PAYROUTES_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 8h16M4 8l3-3M4 8l3 3M20 16H4m16 0-3-3m3 3-3 3"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const VOLUME_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 19V5m0 14h16M8 15v-4m4 4V8m4 7v-6"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const REFERRAL_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M16 8a3 3 0 1 0-3-3M8 12a3 3 0 1 0 3 3M15.5 6.5l-7 5"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </svg>
);
const CARET_ICON = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SIGNOUT_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M15 17l5-5-5-5M20 12H9M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const BANK_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 9.5 12 4l8 5.5M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const PIN_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
    <circle cx={12} cy={10} r={2.4} stroke="currentColor" strokeWidth={1.7} />
  </svg>
);
const MAIL_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={3} y={5.5} width={18} height={13} rx={3} stroke="currentColor" strokeWidth={1.7} />
    <path
      d="M4.5 8 12 13.2 19.5 8"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const PHONE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M4 5c0 8.3 6.7 15 15 15a1.6 1.6 0 0 0 1.6-1.6v-2.3a1.6 1.6 0 0 0-1.3-1.6l-2.7-.5a1.6 1.6 0 0 0-1.5.6l-.8 1a12 12 0 0 1-5-5l1-.8a1.6 1.6 0 0 0 .6-1.5l-.5-2.7A1.6 1.6 0 0 0 8.9 3.4H6.6A1.6 1.6 0 0 0 5 5Z"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
  </svg>
);
const GLOBE_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.7} />
    <path
      d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
  </svg>
);
const CURRENCY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.7} />
    <path
      d="M15 9.5C14 8.5 12.5 8.3 11 9c-2 1-2 3.5 0 4.5 2 1 2 3.5 0 4.5-1.5.7-3 .5-4-.5"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    />
    <path d="M12 6v12" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);
const KEY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M15 7a4 4 0 1 1-3.9 5H7v3H4v-3H2.5v-2H11.1A4 4 0 0 1 15 7Z"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
    />
  </svg>
);

/** One `.arow` account-management row: icon + title/sub + optional value + caret. */
function AccountRow({
  icon,
  title,
  sub,
  value,
  onOpen,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  value?: string;
  onOpen: () => void;
}) {
  return (
    <div className="arow" role="button" tabIndex={0} onClick={onOpen} onKeyDown={onActivate(onOpen)}>
      <span className="ic">{icon}</span>
      <span className="tx">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      {value != null && <span className="val">{value}</span>}
      <span className="caret">{CARET_ICON}</span>
    </div>
  );
}

export default function AccountScreen() {
  const { t, language } = useT();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isLoggedIn, address, logout, openSwitcher, activeWallet } = useWalletSession();
  const { user, isUserLoading, deleteAccount } = useUserContext();
  const { getRef, getProfile } = useUser();

  const [referral, setReferral] = useState<Referral | undefined>();
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sheet, setSheet] = useState<AccountSheet | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      setReferral(undefined);
      return undefined;
    }
    let cancelled = false;
    getRef()
      .then((r) => {
        if (!cancelled) setReferral(r);
      })
      .catch(() => {
        if (!cancelled) setReferral(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, getRef]);

  // Name lives on the profile, not the reactive user context — fetch it so the header
  // can prefer the real first/last name (matches renderAccount()'s /user/profile lookup).
  useEffect(() => {
    if (!isLoggedIn) {
      setProfile(undefined);
      return undefined;
    }
    let cancelled = false;
    getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, getProfile]);

  if (!isLoggedIn) return <LoggedOutState title={t('mAcct')} />;

  if (isUserLoading && !user) {
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mAcct')}</h2>
        </div>
        <p className="tnote" style={{ padding: '0 4px 8px' }}>
          <LoadingRow label={t('loading')} />
        </p>
      </div>
    );
  }

  const copy = (value: string | undefined, doneKey: TranslationKey) => {
    if (!value || !navigator.clipboard) {
      showToast(t('copyFail'));
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => showToast(t(doneKey)))
      .catch(() => showToast(t('copyFail')));
  };

  const handleLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    logout().finally(() => setIsLoggingOut(false));
  };

  const handleDeleteAccount = () => {
    if (isDeleting) return;
    setIsDeleting(true);
    deleteAccount()
      .then(() => {
        setConfirmDelete(false);
        showToast(t('accountDeleted'));
        return logout();
      })
      .catch(() => showToast(t('genErr')))
      .finally(() => setIsDeleting(false));
  };

  const level = user?.kyc.level;
  const verifiedLabel =
    level == null
      ? t('connected')
      : level >= KycLevel.Completed
        ? t('verified')
        : level >= KycLevel.Sell
          ? t('verifiedPartial')
          : t('notVerified');

  const limit = user?.tradingLimit;
  const limitLabel = limit ? `${formatChf(limit.limit, language)} ${t(PERIOD_KEY[limit.period] ?? 'perMonth')}` : '—';

  const volumeSums = (['buy', 'sell', 'swap'] as const).reduce(
    (acc, key) => {
      const v = user?.volumes?.[key];
      return { total: acc.total + (v?.total ?? 0), annual: acc.annual + (v?.annual ?? 0) };
    },
    { total: 0, annual: 0 },
  );
  const showVolume = volumeSums.total > 0 || volumeSums.annual > 0;

  // Prefer the real name (first/last from the profile), then the email, then the address —
  // matching renderAccount()'s name resolution in the static preview.
  const realName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const displayName = realName || user?.mail || shortAddress(address);
  const secondaryLine = user?.mail && user.mail !== displayName ? user.mail : shortAddress(address);
  // Payment routes available for the user's display currency (Bank always; Instant/Card
  // when the fiat supports it), mirroring payMethods() in the static preview.
  const payRoutes = [
    t('payBankN'),
    ...(user?.currency?.instantBuyable ? [t('payInstN')] : []),
    ...(user?.currency?.cardBuyable ? [t('payCardN')] : []),
  ].join(' · ');
  const languageLabel = LANGUAGES.find((l) => l.code === language)?.label ?? language;
  const currencyLabel = user?.currency?.name ?? '—';

  return (
    <div className="account">
      <div className="acct-head">
        <div className="avatar">{AVATAR_ICON}</div>
        <h2>{displayName}</h2>
        <div className="mail">{secondaryLine}</div>
        <div className="verified">
          {VERIFIED_ICON}
          <span>{verifiedLabel}</span>
        </div>
        <div className="acct-num">
          <span>{t('walletAddr')}</span> <span>{shortAddress(address)}</span>
          <button aria-label="Copy address" onClick={() => copy(address, 'copied')}>
            {COPY_ICON}
          </button>
        </div>
      </div>

      <div className="stat2">
        <div
          className="statcard glass"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/kyc')}
          onKeyDown={onActivate(() => navigate('/kyc'))}
        >
          <div className="k">
            {KYC_ICON}
            <span>{t('kycLevel')}</span>
          </div>
          <div className="v">{level != null ? t('levelN', { n: level }) : '—'}</div>
          <div className="note">{t('kycNote')}</div>
        </div>
        <div
          className="statcard glass"
          role="button"
          tabIndex={0}
          style={{ cursor: 'pointer' }}
          onClick={() => navigate('/limit')}
          onKeyDown={onActivate(() => navigate('/limit'))}
        >
          <div className="k">
            {LIMIT_ICON}
            <span>{t('limit')}</span>
          </div>
          <div className="v">{limitLabel}</div>
          <div className="note">{chainList(user?.activeAddress?.blockchains, t)}</div>
        </div>
      </div>

      <div className="glass rowlist">
        <div className="arow" role="button" tabIndex={0} onClick={openSwitcher} onKeyDown={onActivate(openSwitcher)}>
          <span className="ic">{WALLET_ICON}</span>
          <span className="tx">
            <b>{t('connWallet')}</b>
            {/* walletDisplayName() + " · " + short(addr) from the static preview (orig 4124):
                the wallet brand/label first, then the short address. */}
            <small>
              {activeWallet?.name ? `${activeWallet.name} · ${shortAddress(address)}` : shortAddress(address)}
            </small>
          </span>
          <span className="caret">{CARET_ICON}</span>
        </div>
        <div className="arow static">
          <span className="ic">{PAYROUTES_ICON}</span>
          <span className="tx">
            <b>{t('payRoutes')}</b>
            <small>{payRoutes}</small>
          </span>
        </div>
        {showVolume && (
          <div
            className="arow"
            role="button"
            tabIndex={0}
            onClick={() => navigate('/tx')}
            onKeyDown={onActivate(() => navigate('/tx'))}
          >
            <span className="ic">{VOLUME_ICON}</span>
            <span className="tx">
              <b>{t('tradingVolume')}</b>
              <small>
                {t('volThisYear')} {formatChf(volumeSums.annual, language)}
              </small>
            </span>
            <span className="val">{formatChf(volumeSums.total, language)}</span>
            <span className="caret">{CARET_ICON}</span>
          </div>
        )}
        <div
          className="arow"
          role="button"
          tabIndex={0}
          onClick={() => setSheet('referral')}
          onKeyDown={onActivate(() => setSheet('referral'))}
        >
          <span className="ic">{REFERRAL_ICON}</span>
          <span className="tx">
            <b>{t('referral')}</b>
            <small>
              {referral?.code
                ? referral.commission != null
                  ? `${referral.commission * 100 >= 0.01 ? (referral.commission * 100).toLocaleString(localeFor(language), { maximumFractionDigits: 2 }) : '0'}% ${t('commission')}`
                  : t('referralSub')
                : t('referralSub')}
            </small>
          </span>
          <span className="val">{referral?.code ?? '—'}</span>
          <span className="caret">{CARET_ICON}</span>
        </div>
      </div>

      <div className="sectionlabel">{t('accSecurity')}</div>
      <div className="glass rowlist">
        <AccountRow
          icon={BANK_ICON}
          title={t('bankAccounts')}
          sub={t('bankAccountsSub')}
          onOpen={() => setSheet('bankaccts')}
        />
        <AccountRow
          icon={PIN_ICON}
          title={t('addresses')}
          sub={t('addressesSub')}
          onOpen={() => setSheet('addresses')}
        />
        <AccountRow
          icon={MAIL_ICON}
          title={t('changeEmail')}
          sub={t('changeEmailSub')}
          onOpen={() => setSheet('email')}
        />
        <AccountRow icon={PHONE_ICON} title={t('verifCall')} sub={t('verifCallSub')} onOpen={() => setSheet('vcall')} />
      </div>

      <div className="sectionlabel">{t('prefs')}</div>
      <div className="glass rowlist">
        <AccountRow icon={GLOBE_ICON} title={t('language')} value={languageLabel} onOpen={() => setSheet('language')} />
        <AccountRow
          icon={CURRENCY_ICON}
          title={t('currency')}
          value={currencyLabel}
          onOpen={() => setSheet('currency')}
        />
        <AccountRow icon={KEY_ICON} title={t('ctConnect')} sub={t('ctConnectSub')} onOpen={() => setSheet('ctkey')} />
      </div>

      <button className="signout" onClick={handleLogout} disabled={isLoggingOut}>
        {SIGNOUT_ICON}
        <span>{t('signOut')}</span>
      </button>
      <button className="dangerlink" type="button" onClick={() => setConfirmDelete(true)}>
        {t('deleteAccount')}
      </button>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} titleId="delAcctTitle">
        <SheetHeader titleId="delAcctTitle" title={t('deleteAccount')} onClose={() => setConfirmDelete(false)} />
        <div className="slist" style={{ paddingBottom: 24 }}>
          <p className="paybox-note warn" style={{ margin: '2px 2px 14px' }}>
            {t('deleteAccountWarn')}
          </p>
          <button
            type="button"
            className="signout"
            style={{ marginTop: 0 }}
            disabled={isDeleting}
            onClick={handleDeleteAccount}
          >
            <span>{t('deleteAccountConfirm')}</span>
          </button>
          <button
            type="button"
            className="btn-glass"
            style={{ height: 48, justifyContent: 'center', marginTop: 10, color: 'var(--t-muted)' }}
            onClick={() => setConfirmDelete(false)}
          >
            {t('cancel')}
          </button>
        </div>
      </Sheet>

      <AccountSheets open={sheet} onClose={() => setSheet(null)} referral={referral} />
    </div>
  );
}
