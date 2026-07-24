// DFX App 2.0 — KYC (verification) screen.
//
// Ported from the static preview's `v-kyc` section (public/app2/index.html,
// markup ~line 1003, `renderKyc()` / `renderKycOverview()` / `renderKycStep()`
// around line 2685 for behaviour). This shell owns the overview (level + limit,
// the step list, the continue action), the 2FA enrolment flow, failed/in-review
// states and the account switch/merge hand-offs. The per-step data entry
// (ContactData, PersonalData, Ident/Sumsub, FinancialData, LegalEntity,
// BeneficialOwner, document uploads, ...) is completed IN THE APP by
// `KycStepForm` in `./kyc-steps`; only steps with no in-app form (e.g.
// PaymentAgreement, the name/address/phone-change flows) still hand off to the
// portal — see `isInAppStep()`.

import {
  isStepDone,
  KycInfo,
  KycLevel,
  KycSession,
  KycStepBase,
  KycStepName,
  KycStepReason,
  KycStepSession,
  KycStepStatus,
  TfaSetup,
  TfaType,
  useKyc,
  useUserContext,
} from '@dfx.swiss/react';
import { AnchorHTMLAttributes, FormEvent, ReactNode, useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { LoadingRow, useToast } from '../components/ui';
import { useT, type TranslationKey } from '../i18n';
import { appUrl, isSafeAppUrl } from '../utils/url';
import { useWalletSession } from '../wallets/session';
import { formatChf, isSafeHttpsUrl } from './parts/format';
import { LoggedOutState } from './parts/LoggedOutState';
import { isInAppStep, KycStepForm } from './kyc-steps';
import {
  apiStatusCode,
  isTfaAlreadyEnrolledError,
  isTfaRequiredError,
  kycHandoffFromError,
  type KycHandoff,
} from './kyc-recovery';

const PERIOD_KEY: Record<string, TranslationKey> = { Day: 'perDay', Month: 'perMonth', Year: 'perYear' };

const COPY_ICON = (
  <svg viewBox="0 0 24 24" fill="none">
    <rect x={9} y={9} width={11} height={11} rx={2} stroke="currentColor" strokeWidth={1.8} />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);

// KycStepStatus values whose chip should read as "attention needed".
const WARN_STATUSES = new Set<string>([KycStepStatus.FAILED, KycStepStatus.OUTDATED, KycStepStatus.DATA_REQUESTED]);

function stepChipVariant(status: KycStepStatus): 'act' | 'warn' | 'ina' {
  if (status === KycStepStatus.COMPLETED) return 'act';
  if (WARN_STATUSES.has(status)) return 'warn';
  return 'ina';
}

function stepNameLabel(t: (key: TranslationKey) => string, name: KycStepName): string {
  const key = `kn_${name}` as TranslationKey;
  const label = t(key);
  return label === key ? name : label;
}

function statusLabel(t: (key: TranslationKey) => string, status: KycStepStatus): string {
  const key = `ks_${status}` as TranslationKey;
  const label = t(key);
  return label === key ? status : label;
}

function portalKycUrl(code: string): string | undefined {
  return appUrl(`/kyc?code=${encodeURIComponent(code)}`);
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'handoff'; info: KycInfo; handoff: KycHandoff }
  | { kind: 'overview'; info: KycInfo }
  | { kind: 'step'; info: KycInfo; step: KycStepSession }
  | { kind: 'tfa'; info: KycInfo; setup?: TfaSetup; alreadyEnrolled: boolean; setupError?: string };

function apiErrorMessage(t: (key: TranslationKey) => string, err: unknown): string {
  // Never surface a raw server string — map to a friendly, translated message.
  if (apiStatusCode(err) === 0) return t('loadFail');
  return t('genErr');
}

export default function KycScreen() {
  const { t, language } = useT();
  const { showToast } = useToast();
  const { isLoggedIn } = useWalletSession();
  const { user, isUserLoading } = useUserContext();
  const kyc = useKyc();

  const copySecret = (value: string) => {
    if (!value || !navigator.clipboard) {
      showToast(t('copyFail'));
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => showToast(t('copied')))
      .catch(() => showToast(t('copyFail')));
  };

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [tfaToken, setTfaToken] = useState('');
  const [tfaError, setTfaError] = useState('');

  const code = user?.kyc.hash;

  const loadOverview = () => {
    if (!code) return;
    setPhase({ kind: 'loading' });
    kyc
      .getKycInfo(code)
      .then((info) => setPhase({ kind: 'overview', info }))
      .catch((err: unknown) => setPhase({ kind: 'error', message: apiErrorMessage(t, err) }));
  };

  const beginTfaSetup = (info: KycInfo) => {
    if (!code) return;
    setPhase({ kind: 'tfa', info, alreadyEnrolled: false });
    kyc
      .setup2fa(code)
      .then((setup) => setPhase({ kind: 'tfa', info, setup, alreadyEnrolled: false }))
      .catch((error: unknown) => {
        if (isTfaAlreadyEnrolledError(error)) {
          setPhase({ kind: 'tfa', info, alreadyEnrolled: true });
          return;
        }
        setPhase({ kind: 'tfa', info, alreadyEnrolled: false, setupError: apiErrorMessage(t, error) });
      });
  };

  useEffect(() => {
    if (!isLoggedIn || !code) return;
    loadOverview();
    // `loadOverview` intentionally omitted — re-created every render; this
    // effect should only re-run when the session or KYC code changes.
  }, [isLoggedIn, code]);

  if (!isLoggedIn) return <LoggedOutState title={t('mKyc')} />;

  if (isUserLoading && !user) {
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
          <LoadingRow label={t('loading')} />
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div
          className="ocp-empty"
          style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: '30px 8px' }}
        >
          <span>{t('loadFail')}</span>
        </div>
      </div>
    );
  }

  const runContinue = (info: KycInfo) => {
    if (busy) return;
    setBusy(true);
    setTfaError('');
    kyc
      .continueKyc(code, true)
      .then((session) => {
        if (session.currentStep) setPhase({ kind: 'step', info: session, step: session.currentStep });
        else setPhase({ kind: 'overview', info: session });
      })
      .catch((err: unknown) => {
        // KYC calls return the structured API error body directly. Branch only on its machine
        // fields; never parse a localized human-readable message.
        if (isTfaRequiredError(err)) {
          setBusy(false);
          beginTfaSetup(info);
          return;
        }
        const handoff = kycHandoffFromError(err);
        if (handoff) {
          setPhase({ kind: 'handoff', info, handoff });
          return;
        }
        setPhase({ kind: 'error', message: apiErrorMessage(t, err) });
      })
      .finally(() => setBusy(false));
  };

  const verifyTfa = (info: KycInfo) => (e: FormEvent) => {
    e.preventDefault();
    if (busy || !/^\d{6}$/.test(tfaToken)) return;
    setBusy(true);
    kyc
      .verify2fa(code, tfaToken)
      .then(() => {
        setTfaToken('');
        setTfaError('');
        runContinue(info);
      })
      .catch(() => setTfaError(t('kycTfaWrong')))
      .finally(() => setBusy(false));
  };

  if (phase.kind === 'loading') {
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="sec" style={{ textAlign: 'center', padding: 24 }}>
          <LoadingRow label={t('loading')} />
        </div>
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="paybox-note warn" style={{ margin: '10px 0' }}>
          {phase.message}
        </div>
        <button className="btn-mini" onClick={loadOverview}>
          {t('retry')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'handoff') {
    const handoffCode = phase.handoff.kind === 'switch' ? phase.handoff.code : code;
    const messageKey =
      phase.handoff.kind === 'switch'
        ? 'kycAccountSwitch'
        : phase.handoff.kind === 'merge'
          ? 'kycAccountMerge'
          : 'kycAccountExists';
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="paybox-note warn" style={{ margin: '10px 0' }}>
          {t(messageKey)}
        </div>
        <SafeExternalLink
          url={portalKycUrl(handoffCode)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
        >
          {t('finishOnDfx')}
        </SafeExternalLink>
        <button
          className="btn-mini"
          style={{ marginTop: 10, width: '100%' }}
          onClick={() => setPhase({ kind: 'overview', info: phase.info })}
        >
          {t('kycOverview')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'tfa') {
    const { setup, alreadyEnrolled, info, setupError } = phase;
    const appSetup = setup?.type === TfaType.APP;
    const mailSetup = setup?.type === TfaType.MAIL;
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="sectionlabel tight">{t('kycTfaTitle')}</div>
        {setupError ? (
          <>
            <div className="paybox-note warn" style={{ margin: '10px 0' }}>
              {t('kycTfaSetupFail')}
            </div>
            <button className="btn-primary" type="button" onClick={() => beginTfaSetup(info)}>
              {t('retry')}
            </button>
            <button
              className="btn-mini"
              type="button"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => setPhase({ kind: 'overview', info })}
            >
              {t('kycOverview')}
            </button>
          </>
        ) : appSetup && setup ? (
          <>
            <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '8px 4px 12px' }}>
              {t('kycTfaLead')}
            </p>
            {setup.uri && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 12px' }}>
                <div style={{ background: '#fff', padding: 14, borderRadius: 16, width: 210 }}>
                  <QRCode value={setup.uri} size={182} bgColor="#ffffff" fgColor="#0a2a4a" style={{ width: '100%' }} />
                </div>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                margin: '4px 2px 10px',
              }}
            >
              <code
                style={{
                  fontSize: 12,
                  color: '#fff',
                  wordBreak: 'break-all',
                }}
              >
                {setup.secret}
              </code>
              <button
                className="btn-mini"
                type="button"
                aria-label="Copy"
                style={{ width: 'auto', flex: 'none', padding: '0 12px' }}
                onClick={() => copySecret(setup.secret)}
              >
                {COPY_ICON}
              </button>
            </div>
          </>
        ) : (
          <div className="paybox-note" style={{ margin: '10px 0' }}>
            {alreadyEnrolled ? t('kycTfaExisting') : mailSetup ? t('kycTfaMail') : <LoadingRow label={t('loading')} />}
          </div>
        )}
        {!setupError && (alreadyEnrolled || setup) && (
          <form className="tform" style={{ marginTop: 12 }} onSubmit={verifyTfa(info)}>
            <label className="flabel">{t('kycTfaCode')}</label>
            <input
              className="tinput"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              style={{ textAlign: 'center', letterSpacing: 6, fontSize: 18 }}
              value={tfaToken}
              onChange={(e) => setTfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            {tfaError && (
              <div className="paybox-note warn" style={{ marginTop: 10 }}>
                {tfaError}
              </div>
            )}
            <button
              className="btn-primary"
              type="submit"
              style={{ marginTop: 10 }}
              disabled={busy || tfaToken.length !== 6}
            >
              {t('xmrContinue')}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (phase.kind === 'step') {
    const { step, info } = phase;
    const backToOverview = () => setPhase({ kind: 'overview', info });

    // Apply a session returned by an in-app step (continueKyc auto-step): move to
    // the next current step, or back to the overview once nothing is pending.
    const applySession = (session: KycSession) =>
      session.currentStep
        ? setPhase({ kind: 'step', info: session, step: session.currentStep })
        : setPhase({ kind: 'overview', info: session });

    if (step.status === KycStepStatus.FAILED) {
      const handoff =
        step.reason === KycStepReason.ACCOUNT_MERGE_REQUESTED
          ? ({ kind: 'merge' } as const)
          : step.reason === KycStepReason.ACCOUNT_EXISTS
            ? ({ kind: 'account-exists' } as const)
            : undefined;
      return (
        <div className="account">
          <div className="txhead">
            <h2>{t('mKyc')}</h2>
          </div>
          <div className="sectionlabel tight">{stepNameLabel(t, step.name)}</div>
          <div className="paybox-note warn" style={{ margin: '10px 0' }}>
            {t(handoff?.kind === 'merge' ? 'kycAccountMerge' : handoff ? 'kycAccountExists' : 'kycFailed')}
            {/* #75: surface the server's failure reason on a non-hand-off failure. */}
            {!handoff && step.reason && (
              <>
                <br />
                <span style={{ opacity: 0.85 }}>{step.reason}</span>
              </>
            )}
          </div>
          {handoff ? (
            <SafeExternalLink
              url={portalKycUrl(code)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
            >
              {t('finishOnDfx')}
            </SafeExternalLink>
          ) : (
            <button className="btn-primary" disabled={busy} onClick={() => runContinue(info)}>
              {t('xmrContinue')}
            </button>
          )}
          <button className="btn-mini" style={{ marginTop: 10, width: '100%' }} onClick={backToOverview}>
            {t('kycOverview')}
          </button>
        </div>
      );
    }

    if (
      step.status === KycStepStatus.IN_REVIEW ||
      step.name === KycStepName.DFX_APPROVAL ||
      step.name === KycStepName.COMMERCIAL_REGISTER
    ) {
      return (
        <div className="account">
          <div className="txhead">
            <h2>{t('mKyc')}</h2>
          </div>
          <div className="sectionlabel tight">{stepNameLabel(t, step.name)}</div>
          <div className="paybox-note" style={{ margin: '10px 0' }}>
            {t('kycInReview')}
          </div>
          <button className="btn-mini" style={{ width: 'auto' }} onClick={backToOverview}>
            {t('kycOverview')}
          </button>
        </div>
      );
    }

    // In-app data entry (ContactData, PersonalData, Ident/Sumsub, FinancialData,
    // LegalEntity, BeneficialOwner, document uploads, ...) — done inside the app.
    if (isInAppStep(step.name)) {
      return (
        <div className="account">
          <div className="txhead">
            <h2>{t('mKyc')}</h2>
          </div>
          <KycStepForm
            code={code}
            step={step}
            onAdvance={applySession}
            onFailed={(result: KycStepBase) => setPhase({ kind: 'step', info, step: { ...step, ...result } })}
            onTfaRequired={() => beginTfaSetup(info)}
            onHandoff={(handoff) => setPhase({ kind: 'handoff', info, handoff })}
            onBack={backToOverview}
          />
        </div>
      );
    }

    // Legacy steps with no in-app form (PaymentAgreement, name/address/phone
    // change, unknown future steps) — completed in the DFX portal.
    return (
      <div className="account">
        <div className="txhead">
          <h2>{t('mKyc')}</h2>
        </div>
        <div className="sectionlabel tight">{stepNameLabel(t, step.name)}</div>
        <div className="paybox-note" style={{ margin: '10px 0' }}>
          {t('kycLegacyNote')}
        </div>
        <SafeExternalLink
          url={portalKycUrl(code)}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
        >
          {t('kycLegacyOpen')}
        </SafeExternalLink>
        <button
          className="btn-mini"
          style={{ marginTop: 10, width: '100%' }}
          disabled={busy}
          onClick={() => runContinue(info)}
        >
          {t('kycIdentDone2')}
        </button>
      </div>
    );
  }

  // overview
  const { info } = phase;
  const level = info.kycLevel ?? user?.kyc.level;
  const limit = info.tradingLimit ?? user?.tradingLimit;
  const limitLabel = limit ? `${formatChf(limit.limit, language)} ${t(PERIOD_KEY[limit.period] ?? 'perMonth')}` : '';
  const steps = info.kycSteps ?? [];
  const started = steps.some((s) => s.status !== KycStepStatus.NOT_STARTED);
  const allDone = steps.length > 0 && steps.every((s) => isStepDone(s));

  return (
    <div className="account">
      <div className="txhead">
        <h2>{t('mKyc')}</h2>
      </div>
      <div className="limit-now">
        <div className="lab">{t('kycYourLevel')}</div>
        <div className="big">
          {/* #76: show "Level —" when the level is unknown, never "Level 0". */}
          {level != null && level >= KycLevel.Completed ? t('kycFull') : t('levelN', { n: level ?? '—' })}
        </div>
        <div className="per">{limitLabel}</div>
      </div>
      <p style={{ color: 'var(--t-muted)', fontSize: 13, lineHeight: 1.5, margin: '8px 4px 12px' }}>{t('kycLead')}</p>

      {steps.length > 0 && (
        <>
          <div className="sectionlabel tight">{t('kycSteps')}</div>
          <div className="glass" style={{ borderRadius: 18, padding: '2px 16px', marginBottom: 14 }}>
            {steps.map((s) => (
              <div key={s.name} className="pbrow" style={{ padding: '10px 0' }}>
                <span style={{ color: '#fff', fontWeight: 600 }}>{stepNameLabel(t, s.name)}</span>
                <span className={`pill-chip ${stepChipVariant(s.status)}`} style={{ marginLeft: 'auto', flex: 'none' }}>
                  {statusLabel(t, s.status)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {allDone ? (
        <div className="paybox-note ok">{t('kycAllDone')}</div>
      ) : (
        <button className="btn-primary" disabled={busy} onClick={() => runContinue(info)}>
          {t(started ? 'xmrContinue' : 'kycStart')}
        </button>
      )}
    </div>
  );
}

/** Renders `<a>` only once the URL has been verified as `https:` — the KYC
 * ident session link is the exact gap the static app left open. */
function SafeExternalLink({
  url,
  children,
  ...rest
}: { url: string | undefined; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (!isSafeHttpsUrl(url) && !isSafeAppUrl(url)) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}
