// DFX App 2.0 — account screen.
//
// Ported from the static preview's `v-account` section (public/app2/index.html,
// lines ~839-935 markup, `renderAccount()` around line 4199 for behaviour).
// Data comes from `useUserContext()` (mail, KYC level/limit, addresses,
// volumes — DfxContextProvider already mounts UserContextProvider, see
// node_modules/@dfx.swiss/react/dist/contexts/dfx.context.js) and `useUser()`
// for the referral code (`getRef()`, not part of the reactive user context).

import { KycLevel, Referral, useUser, useUserContext } from '@dfx.swiss/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingRow, onActivate, useToast } from '../components/ui';
import { useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatChf, localeFor, shortAddress } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';

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

export default function AccountScreen() {
  const { t, language } = useT();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { isLoggedIn, address, logout } = useWalletSession();
  const { user, isUserLoading, userAddresses } = useUserContext();
  const { getRef } = useUser();

  const [referral, setReferral] = useState<Referral | undefined>();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const displayName = user?.mail ?? shortAddress(address);
  const secondaryLine = user?.mail && user.mail !== displayName ? user.mail : shortAddress(address);
  const referralLink = referral?.code
    ? `https://app.dfx.swiss/login?code=${encodeURIComponent(referral.code)}`
    : undefined;

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
          onClick={() => navigate('/kyc')}
          onKeyDown={onActivate(() => navigate('/kyc'))}
        >
          <div className="k">
            {LIMIT_ICON}
            <span>{t('limit')}</span>
          </div>
          <div className="v">{limitLabel}</div>
          <div className="note">
            {user?.activeAddress?.blockchains?.length ? user.activeAddress.blockchains.join(' · ') : ''}
          </div>
        </div>
      </div>

      <div className="glass rowlist">
        <div className="arow static">
          <span className="ic">{WALLET_ICON}</span>
          <span className="tx">
            <b>{t('connWallet')}</b>
            <small>{shortAddress(address)}</small>
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
          onClick={() => copy(referralLink, 'copiedLink')}
          onKeyDown={onActivate(() => copy(referralLink, 'copiedLink'))}
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
          <span className="caret">{COPY_ICON}</span>
        </div>
      </div>

      {userAddresses.length > 0 && (
        <>
          <div className="sectionlabel">{t('addresses')}</div>
          <div className="glass rowlist">
            {userAddresses.map((a) => {
              const isActive = user?.activeAddress?.address === a.address;
              return (
                <div className="arow static" key={a.address}>
                  <span className="ic">{WALLET_ICON}</span>
                  <span className="tx">
                    <b>{a.label || shortAddress(a.address)}</b>
                    <small>{a.blockchains.join(' · ')}</small>
                  </span>
                  {isActive && <span className="chip-good">{t('active')}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      <button className="signout" onClick={handleLogout} disabled={isLoggingOut}>
        {SIGNOUT_ICON}
        <span>{t('signOut')}</span>
      </button>
    </div>
  );
}
