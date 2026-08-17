// DFX App 2.0 — external-return route handlers.
//
// A single result panel shared by three flows, ported from the static preview's
// routeAccountMerge / routeBuySuccess / routeBuyFailure (public/app2/index.html,
// ~lines 4688-4747) and its #mergeBody markup (~1070-1074):
//
//   /account-merge?otp=          confirm an account-merge link
//   /buy/success?cko-payment-id= Checkout.com card-payment return (poll the tx)
//   /buy/failure                 static card-payment failure panel
//
// URL CONTRACT NOTE: the original used real pathname routing; App 2.0 is
// hash-routed (createHashRouter — see App.tsx). These are registered as HASH
// routes so the flows WORK when reached (e.g. #/buy/success?cko-payment-id=…).
// The production deep-link contract — the email/Checkout.com return URLs use
// real paths (/buy/success) with a query string — is a hosting/deployment
// concern (an SPA rewrite or a redirect that folds the real path+query into the
// hash) OUTSIDE this component. To stay robust either way, params are read from
// the router (hash) search first, then fall back to window.location.search.

import { ApiException, useApi, useApiSession, useTransaction } from '@dfx.swiss/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useT, type TranslationKey } from '../i18n';
import { useWalletSession } from '../wallets/session';

const SPINNER = <span className="spin" />;

/**
 * CKO payment poll schedule — same shape as ocp/pos.tsx (`pollPos`):
 * start 2000ms, ×1.35, capped at 10s, hard stop after 5 minutes.
 */
export const CKO_POLL = {
  deadlineMs: 300_000,
  initialDelayMs: 2_000,
  maxDelayMs: 10_000,
  growth: 1.35,
} as const;

/** Next backoff delay after a non-terminal poll tick (mirrors pos.tsx). */
export function nextPollDelay(delayMs: number): number {
  return Math.min(CKO_POLL.maxDelayMs, Math.round(delayMs * CKO_POLL.growth));
}

/** JWT sanity check (mirrors session.tsx's isLikelyValidJwt / the static app's
 * tokenValid): the token must decode and still be valid for at least 60s. */
function isValidJwt(token: string): boolean {
  try {
    const segment = token.split('.')[1];
    if (!segment) return false;
    const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

function statusOf(error: unknown): number | undefined {
  return error instanceof ApiException ? error.statusCode : undefined;
}

interface ResultButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

type Panel =
  | { kind: 'spinner'; msgKey: TranslationKey }
  | { kind: 'result'; variant: 'ok' | 'warn'; title: ReactNode; buttons: ResultButton[] };

function ResultPanel({ panel }: { panel: Panel }) {
  const { t } = useT();
  if (panel.kind === 'spinner') {
    return (
      <div
        className="paybox-note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          justifyContent: 'center',
          padding: '26px 8px',
          fontSize: 13,
        }}
      >
        {SPINNER} {t(panel.msgKey)}
      </div>
    );
  }
  return (
    <div className="glass" style={{ padding: '22px 18px', textAlign: 'center', marginTop: 6 }}>
      <div className={`paybox-note ${panel.variant}`} style={{ fontSize: 14, margin: '0 0 14px' }}>
        {panel.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {panel.buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className={button.primary ? 'btn-primary' : 'btn-mini'}
            style={{ width: '100%' }}
            onClick={button.onClick}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReturnRouteScreen() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { isLoggedIn, openConnect } = useWalletSession();
  const { call } = useApi(); // account-merge OTP confirm has no SDK method
  const { getTransactionByCkoId } = useTransaction();
  const { updateSession } = useApiSession();

  const [panel, setPanel] = useState<Panel>({ kind: 'spinner', msgKey: 'mergeVerifying' });

  // Param from the hash query (router) first, else the real query string —
  // covers both the in-app hash link and a production real-path return.
  const getParam = useCallback(
    (key: string): string | null => searchParams.get(key) ?? new URLSearchParams(window.location.search).get(key),
    [searchParams],
  );

  const timerRef = useRef<number>();
  const cancelledRef = useRef(false);
  const mergeStartedRef = useRef(false);
  const ckoStartedRef = useRef(false);

  const goContinue = useCallback(() => navigate('/'), [navigate]);

  // One place to tear down the poll loop — called on unmount and before a retry.
  const stopPoll = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const startCkoPoll = useCallback(
    (ckoId: string) => {
      stopPoll();
      setPanel({ kind: 'spinner', msgKey: 'ckoWait' });
      // Same deadline + backoff as ocp/pos.tsx — never poll a parked tab forever.
      const deadline = Date.now() + CKO_POLL.deadlineMs;
      let delay: number = CKO_POLL.initialDelayMs;

      const failWithRetry = (titleKey: TranslationKey) => {
        setPanel({
          kind: 'result',
          variant: 'warn',
          title: t(titleKey),
          buttons: [
            { label: t('retry'), onClick: () => startCkoPoll(ckoId), primary: true },
            { label: t('done'), onClick: goContinue },
          ],
        });
      };

      const scheduleNext = () => {
        if (Date.now() >= deadline) {
          // Visible stop + retry — never silent, never indefinite.
          failWithRetry('waitTimedOut');
          return;
        }
        timerRef.current = window.setTimeout(tick, delay);
        delay = nextPollDelay(delay);
      };

      const tick = async () => {
        try {
          const tx = await getTransactionByCkoId(encodeURIComponent(ckoId));
          if (cancelledRef.current) return;
          if (tx && (tx.uid || tx.id != null)) {
            const uid = tx.uid ?? String(tx.id);
            setPanel({
              kind: 'result',
              variant: 'ok',
              title: (
                <>
                  {t('ckoDone')}
                  {uid && (
                    <>
                      <br />
                      <small style={{ opacity: 0.75 }}>{uid}</small>
                    </>
                  )}
                </>
              ),
              buttons: [
                { label: t('done'), onClick: goContinue, primary: true },
                { label: t('viewTx'), onClick: () => navigate('/tx') },
              ],
            });
            return;
          }
          // No tx id yet — keep polling with backoff until the deadline.
          scheduleNext();
        } catch (error) {
          if (cancelledRef.current) return;
          if (statusOf(error) === 404) {
            // Not settled yet — keep polling with backoff until the deadline.
            scheduleNext();
            return;
          }
          // Any other error → let the user retry.
          failWithRetry('ckoErr');
        }
      };
      void tick();
    },
    [getTransactionByCkoId, goContinue, navigate, stopPoll, t],
  );

  // Cancel any in-flight poll on unmount (no leaks).
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      stopPoll();
    };
  }, [stopPoll]);

  // /account-merge?otp= — confirm the merge link once (Bearer when a session
  // exists, else anonymous). A returned access token re-authenticates the app as
  // the merged account via updateSession() (App 2.0's equivalent of the static
  // app's SESSION=…/persistSession/onConnected re-auth).
  useEffect(() => {
    if (pathname !== '/account-merge' || mergeStartedRef.current) return;
    mergeStartedRef.current = true;

    const otp = getParam('otp');
    if (!otp) {
      setPanel({
        kind: 'result',
        variant: 'warn',
        title: t('mergeBad'),
        buttons: [{ label: t('routeContinue'), onClick: goContinue, primary: true }],
      });
      return;
    }

    setPanel({ kind: 'spinner', msgKey: 'mergeVerifying' });
    void (async () => {
      try {
        const data = await call<{ accessToken?: string }>({
          url: `auth/mail/confirm?code=${encodeURIComponent(otp)}`,
          method: 'GET',
          token: isLoggedIn ? undefined : false,
        });
        const token = data?.accessToken;
        if (token && isValidJwt(token)) {
          updateSession(token); // adopt the merged account's token, then land on /account
          navigate('/account');
          return;
        }
        setPanel({
          kind: 'result',
          variant: 'ok',
          title: t('mergeOk'),
          buttons: [{ label: t('routeContinue'), onClick: goContinue, primary: true }],
        });
      } catch (error) {
        const status = statusOf(error);
        const key: TranslationKey = status === 400 ? 'mergeBad' : status === 409 ? 'mergeDone' : 'mergeErr';
        setPanel({
          kind: 'result',
          variant: 'warn',
          title: t(key),
          buttons: [{ label: t('routeContinue'), onClick: goContinue, primary: true }],
        });
      }
    })();
    // Run once on mount for this route — re-reading isLoggedIn/call identities
    // would only re-consume the same (single-use) OTP.
  }, [pathname]);

  // /buy/success?cko-payment-id= — needs a session to look up the tx. Without
  // one, stash the id, open the connect flow, and resume polling once the user
  // is logged in (mirrors routeBuySuccess()'s CKO_PENDING → login → resume).
  useEffect(() => {
    if (pathname !== '/buy/success') return;
    const ckoId = getParam('cko-payment-id')?.trim();
    if (!ckoId) {
      setPanel({
        kind: 'result',
        variant: 'warn',
        title: t('ckoMissing'),
        buttons: [{ label: t('done'), onClick: goContinue, primary: true }],
      });
      return;
    }
    if (!isLoggedIn) {
      setPanel({
        kind: 'result',
        variant: 'warn',
        title: t('ckoNeedLogin'),
        buttons: [
          { label: t('connect'), onClick: () => openConnect(), primary: true },
          { label: t('done'), onClick: goContinue },
        ],
      });
      return;
    }
    if (ckoStartedRef.current) return;
    ckoStartedRef.current = true;
    startCkoPoll(ckoId);
    // Re-run when the login state flips so polling resumes after connect.
  }, [pathname, isLoggedIn]);

  // /buy/failure — static failure panel.
  useEffect(() => {
    if (pathname !== '/buy/failure') return;
    setPanel({
      kind: 'result',
      variant: 'warn',
      title: t('payFailed'),
      buttons: [{ label: t('retry'), onClick: goContinue, primary: true }],
    });
  }, [pathname]);

  return (
    <div className="account">
      <div style={{ padding: '8px 4px' }}>
        <ResultPanel panel={panel} />
      </div>
    </div>
  );
}
