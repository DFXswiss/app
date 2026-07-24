// DFX App 2.0 — increase-your-limit screen.
//
// Ported from the static preview's `renderLimit()` / `submitLimit()`
// (public/app2/index.html, ~lines 2996-3045, with LIMIT_TIERS/FUND_ORIGINS at
// ~2624). Shows the current trading limit, a KYC<30 warning, and a request
// form (requested limit, when to invest, origin of funds, details, name, and a
// conditional email when the account has none on file). Submit PUTs the email
// first when needed (409 → mailTaken), then POSTs the limit request as a
// SupportIssue of type LimitRequest.

import {
  ApiException,
  FundOrigin,
  InvestmentDate,
  Limit,
  LimitPeriod,
  SupportIssueReason,
  SupportIssueType,
  useSupportChat,
  useUser,
  useUserContext,
} from '@dfx.swiss/react';
import { type ReactNode, useEffect, useState } from 'react';
import { useToast } from '../components/ui';
import { useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';
import { formatChf } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';

// Matches the production Limit enum; the baseline limit is already 100k so the
// lower tiers make no sense (mirrors the static app's LIMIT_TIERS).
const LIMIT_TIERS: Limit[] = [Limit.K_500, Limit.M_1, Limit.M_5, Limit.M_10, Limit.M_15];

// Exact enum values the API expects (Savings / BusinessProfits / StockGains /
// CryptoGains / Inheritance / Other) — mirrors the static app's FUND_ORIGINS.
const FUND_ORIGINS: FundOrigin[] = [
  FundOrigin.SAVINGS,
  FundOrigin.BUSINESS_PROFITS,
  FundOrigin.STOCK_GAINS,
  FundOrigin.CRYPTO_GAINS,
  FundOrigin.INHERITANCE,
  FundOrigin.OTHER,
];

const PERIOD_KEY: Record<string, TranslationKey> = {
  [LimitPeriod.DAY]: 'perDay',
  [LimitPeriod.MONTH]: 'perMonth',
  [LimitPeriod.YEAR]: 'perYear',
};

const SPINNER = <span className="spin" />;

interface Result {
  variant: '' | 'ok' | 'warn';
  node: ReactNode;
}

export default function LimitScreen() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { isLoggedIn } = useWalletSession();
  const { user, updateMail } = useUserContext();
  const { getProfile } = useUser();
  const { createIssue } = useSupportChat();

  const [limit, setLimit] = useState<Limit>(LIMIT_TIERS[0]);
  const [when, setWhen] = useState<InvestmentDate>(InvestmentDate.NOW);
  const [origin, setOrigin] = useState<FundOrigin>(FUND_ORIGINS[0]);
  const [details, setDetails] = useState('');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Prefill the name field with the verified real name (first/last from the
  // profile) — mirrors renderLimit()'s `n.value = realName()`. Only fills while
  // the user hasn't typed their own value.
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
    // `getProfile`/`nameTouched` intentionally omitted — only re-run when the
    // session changes; the guard inside keeps a user-typed value.
  }, [isLoggedIn]);

  if (!isLoggedIn) return <LoggedOutState title={t('limitTitle')} />;

  const tradingLimit = user?.tradingLimit;
  const currentValue = tradingLimit ? formatChf(tradingLimit.limit, language) : '—';
  const currentPeriod = tradingLimit ? t(PERIOD_KEY[tradingLimit.period] ?? 'perMonth') : '';
  const level = user?.kyc.level;
  const needMail = !user?.mail;

  const submit = async () => {
    if (submitting || submitted) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
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
          {SPINNER} {t('tkSending')}
        </>
      ),
    });

    // Register the email first when the account has none — a 409 means it is
    // already used on another account (mirrors submitLimit()'s PUT /user/mail).
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

    try {
      const issue = await createIssue({
        type: SupportIssueType.LIMIT_REQUEST,
        reason: SupportIssueReason.OTHER,
        name: trimmedName,
        message: details.trim(),
        limitRequest: {
          limit,
          investmentDate: when,
          fundOrigin: origin,
          fundOriginText: details.trim(),
        },
      });
      const uid = issue?.uid;
      setResult({
        variant: 'ok',
        node: (
          <>
            {t('limitOk')}
            {uid && (
              <>
                {' '}
                <b>{uid}</b>
              </>
            )}
            <br />
            <span style={{ color: 'var(--t-muted)' }}>{t('limitOkSub')}</span>
          </>
        ),
      });
      setSubmitted(true);
      showToast(t('limitToast'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setResult({ variant: 'warn', node: message ? `${t('genErr')}: ${message}` : t('genErr') });
      setSubmitting(false);
    }
  };

  return (
    <div className="account">
      <div className="limit-now">
        <div className="lab">{t('currentLimit')}</div>
        <div className="big">{currentValue}</div>
        <div className="per">{currentPeriod}</div>
      </div>

      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '8px 4px 12px' }}>{t('limitLead')}</p>

      {level != null && level < 30 && (
        <div className="paybox-note warn" style={{ margin: '0 0 12px' }}>
          {t('kycNeeded')}
        </div>
      )}

      <div className="tform">
        <label className="flabel" htmlFor="lmLimit">
          {t('limitWanted')}
        </label>
        <select
          id="lmLimit"
          className="tinput"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value) as Limit)}
        >
          {LIMIT_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {formatChf(tier, language)}
            </option>
          ))}
        </select>

        <label className="flabel" htmlFor="lmWhen">
          {t('limitWhen')}
        </label>
        <select id="lmWhen" className="tinput" value={when} onChange={(e) => setWhen(e.target.value as InvestmentDate)}>
          <option value={InvestmentDate.NOW}>{t('invNow')}</option>
          <option value={InvestmentDate.FUTURE}>{t('invFuture')}</option>
        </select>

        <label className="flabel" htmlFor="lmOrigin">
          {t('limitOrigin')}
        </label>
        <select
          id="lmOrigin"
          className="tinput"
          value={origin}
          onChange={(e) => setOrigin(e.target.value as FundOrigin)}
        >
          {FUND_ORIGINS.map((fo) => (
            <option key={fo} value={fo}>
              {t(`fo_${fo}` as TranslationKey)}
            </option>
          ))}
        </select>

        <label className="flabel" htmlFor="lmText">
          {t('limitDetails')}
        </label>
        <textarea
          id="lmText"
          className="tinput"
          rows={3}
          placeholder={t('limitDetailsP')}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        <label className="flabel" htmlFor="lmName">
          {t('ticketName')}
        </label>
        <input
          id="lmName"
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
            <label className="flabel" htmlFor="lmMail">
              {t('ticketEmail')}
            </label>
            <input
              id="lmMail"
              className="tinput"
              type="email"
              placeholder="you@email.com"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}

        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: 6 }}
          disabled={submitting || submitted}
          onClick={submit}
        >
          {t('limitSend')}
        </button>

        {result && (
          <div className={`paybox-note ${result.variant}`.trim()} style={{ marginTop: 12 }}>
            {result.node}
          </div>
        )}
      </div>
    </div>
  );
}
