// Wallet-session contract for App 2.0.
//
// Trade/secondary screens consume ONLY this interface; the wallet-connect
// implementation (providers, signing, ?session= bootstrap) lives behind it.

import {
  AuthWalletType,
  type Blockchain,
  useApiSession,
  useAuth,
  useAuthContext,
  useSessionContext,
} from '@dfx.swiss/react';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { useToast } from '../components/ui';
import { useT } from '../i18n';
import type { WalletCatalogEntry } from './catalog';
import { normalizeInviteCode } from './invite';
import {
  type CancelToken,
  checksumAddress,
  connectInjected,
  connectWalletConnect,
  createCancelToken,
  disconnectWalletConnect,
  getInjectedProvider,
  isUserRejection,
  signWithInjected,
  signWithWalletConnect,
  WalletConnectorError,
  type WalletConnectSession,
} from './providers';

/** Connect-sheet state + handlers — rendered by <Shell> (inside `.app`, see finding #3: the
 * sheet's `position:absolute` must resolve against the 420px-wide `.app` frame, not the
 * viewport) instead of here, so the state/logic still lives with the rest of the wallet
 * session but the JSX moves down into the app's DOM subtree. */
export interface ConnectSheetState {
  open: boolean;
  view: ConnectView;
  onSelectWallet: (entry: WalletCatalogEntry) => void;
  onSubmitRecommendation: (pending: PendingCredentials, code: string) => void;
  onBackToList: () => void;
}

export interface WalletSession {
  isLoggedIn: boolean;
  address?: string;
  blockchains?: readonly Blockchain[];
  /** First chain, retained only for compact display labels. Reachability uses `blockchains`. */
  blockchain?: string;
  /** Opens the connect sheet (or focuses it if already open). */
  openConnect: (recommendationCode?: string) => void;
  /** Closes the connect sheet — call on route change too (finding #4). */
  closeConnect: () => void;
  logout: () => Promise<void>;
  connectSheet: ConnectSheetState;
}

const WalletSessionContext = createContext<WalletSession | undefined>(undefined);

export function useWalletSession(): WalletSession {
  const ctx = useContext(WalletSessionContext);
  if (!ctx) throw new Error('useWalletSession must be used within WalletSessionProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Stale-session clearing (mirrors src/index.tsx's pre-React clear)
//
// src/index.tsx clears storage BEFORE `ReactDOM.createRoot(...).render()` is
// called, so @dfx.swiss/react's AuthContextProvider never reads a stale
// token from a previous visitor when the URL carries fresh credentials. App
// 2.0's entry point (src/index-app2.tsx) isn't ours to edit, so this can't
// live there — but it doesn't need to. Module top-level code (below) runs
// while webpack resolves this module's import graph, which happens while
// index-app2.tsx's own `import MainApp2 from './Main.app2'` is being
// resolved — i.e. strictly before index-app2.tsx reaches its
// `root.render(...)` call, and therefore strictly before any
// @dfx.swiss/react component ever mounts or touches storage. This is
// earlier than even a useLayoutEffect in WalletSessionProvider could manage.
// ---------------------------------------------------------------------------

const CREDENTIAL_PARAM_KEYS = ['session', 'token', 'accessToken', 'address', 'signature'] as const;

function hasCredentialParams(params: URLSearchParams): boolean {
  const token = params.get('session') ?? params.get('token') ?? params.get('accessToken');
  const address = params.get('address');
  const signature = params.get('signature');
  return Boolean(token) || Boolean(address && signature);
}

(function clearStaleSessionOnCredentialedLoad() {
  if (typeof window === 'undefined') return;
  if (!hasCredentialParams(new URLSearchParams(window.location.search))) return;
  try {
    // 'dfx.authenticationToken' is @dfx.swiss/react's StoreKey.AUTH_TOKEN
    // (hooks/store.hook.ts) — the only storage key the library itself owns.
    window.localStorage.removeItem('dfx.authenticationToken');
    window.sessionStorage.clear();
  } catch {
    // storage unavailable (private mode, sandboxed embed, ...) — nothing to clear
  }
})();

// ---------------------------------------------------------------------------
// JWT sanity check (mirrors public/app2/index.html's tokenValid/jwtPayload)
// ---------------------------------------------------------------------------

function decodeJwtPayload(token: string): { exp?: number } | undefined {
  try {
    const segment = token.split('.')[1];
    if (!segment) return undefined;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized)) as { exp?: number };
  } catch {
    return undefined;
  }
}

function isLikelyValidJwt(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000; // 60s skew
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function scrubCredentialParams(): void {
  const qp = new URLSearchParams(window.location.search);
  CREDENTIAL_PARAM_KEYS.forEach((key) => qp.delete(key));
  const query = qp.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
}

function apiErrorText(error: unknown): string {
  const withFields = error as { message?: unknown; code?: unknown } | undefined;
  return `${withFields?.message ?? ''} ${withFields?.code ?? ''}`;
}

function needsRecommendation(error: unknown): boolean {
  // exact literal, matching src/util/api-error.ts's getKycErrorFromMessage — not a loose
  // /recommend/i regex, which would also match unrelated server messages
  return apiErrorText(error).includes('RecommendationRequired');
}

function isUnauthorized(error: unknown): boolean {
  return (error as { statusCode?: unknown } | undefined)?.statusCode === 401;
}

// ---------------------------------------------------------------------------
// Sign-message sanity check (mirrors public/app2/index.html's authMsgOk, ~line 3477) — ported
// verbatim. The server-supplied challenge must actually name our address and look like a real
// DFX auth phrase before we ever hand it to a wallet to sign; a message that fails this check is
// refused rather than blindly signed.
// ---------------------------------------------------------------------------

function authMsgOk(address: string, message: unknown): boolean {
  const ml = (typeof message === 'string' ? message : '').toLowerCase();
  return (
    !!ml &&
    ml.includes(String(address).toLowerCase()) &&
    (ml.includes('by_signing_this_message') || ml.includes('dfx.swiss'))
  );
}

const METAMASK_INSTALL_URL = 'https://metamask.io/download/';

export interface PendingCredentials {
  address: string;
  signature: string;
  walletType?: AuthWalletType;
  connector?: 'injected' | 'wallet-connect';
}

export type ConnectView =
  | { kind: 'list' }
  | { kind: 'connecting'; walletId: string; label: string }
  | { kind: 'wallet-connect'; uri?: string }
  | { kind: 'recommend'; pending: PendingCredentials; invalidCode?: boolean };

export function WalletSessionProvider({ children }: PropsWithChildren): JSX.Element {
  const { isLoggedIn, logout: libLogout } = useSessionContext();
  // useSessionContext()'s own `address`/`blockchain` are only populated when
  // the caller feeds a matching `data.address` into DfxContextProvider (see
  // node_modules/@dfx.swiss/react session.context.js) — Main.app2.tsx mounts
  // `data={{}}`, so those would always read as undefined here. The JWT-
  // decoded session on the auth context doesn't have that gate.
  const { session: authSession } = useAuthContext();
  const address = authSession?.address;
  const blockchains = authSession?.blockchains as Blockchain[] | undefined;
  const blockchain = blockchains?.[0];
  const { createSessionNew, updateSession } = useApiSession();
  const { getSignMessage } = useAuth();
  const { t, language } = useT();
  const { showToast } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<ConnectView>({ kind: 'list' });
  const [activeConnector, setActiveConnector] = useState<'injected' | 'wallet-connect' | undefined>();
  const busyRef = useRef(false); // guards against double-sign on rapid repeat clicks
  const bootstrappedRef = useRef(false);
  // isLoggedIn as of the moment a sign-in attempt *started* (finding #6) — read via a ref
  // because signInWith is async and the session-context value can move under it.
  const isLoggedInRef = useRef(isLoggedIn);
  isLoggedInRef.current = isLoggedIn;
  // Per-attempt cancellation (finding #1): `attemptIdRef` invalidates whatever
  // handleSelectWallet() call is in flight so a late resolution after Cancel is discarded
  // instead of signing in behind the user's back; `wcTokenRef` is the live WalletConnect
  // attempt's CancelToken (see providers.ts), used to stop connectWalletConnect() from waiting
  // on a pairing nobody is going to approve.
  const attemptIdRef = useRef(0);
  const wcTokenRef = useRef<CancelToken | null>(null);
  const providerChangeRef = useRef(false);

  // ?refcode= (invite/referral) and ?wallet= (partner wallet id) — read once;
  // both map straight onto the /auth body (usedRef, wallet) per auth.d.ts.
  const inviteCode = useMemo(() => new URLSearchParams(window.location.search).get('refcode')?.trim() || undefined, []);
  const walletParam = useMemo(() => new URLSearchParams(window.location.search).get('wallet')?.trim() || undefined, []);
  const activeInviteRef = useRef(normalizeInviteCode(inviteCode));

  const openConnect = useCallback((recommendationCode?: string) => {
    activeInviteRef.current = normalizeInviteCode(recommendationCode) ?? normalizeInviteCode(inviteCode);
    setView({ kind: 'list' });
    setSheetOpen(true);
  }, [inviteCode]);

  /** Abandons whatever connect attempt is currently in flight: bumps the attempt id (so
   * handleSelectWallet's own post-await checks discard a late resolution), cancels the
   * WalletConnect pairing's CancelToken if there is one, frees `busyRef` immediately (not in
   * handleSelectWallet's `finally`, which may not run for a long time — or ever, if the remote
   * wallet never responds), and tears down the WC provider as best the API allows. */
  const cancelConnectAttempt = useCallback(() => {
    attemptIdRef.current += 1;
    wcTokenRef.current?.cancel(new WalletConnectorError('Connection cancelled', 'rejected'));
    wcTokenRef.current = null;
    busyRef.current = false;
    void disconnectWalletConnect();
  }, []);

  const closeConnect = useCallback(() => {
    // Closing during any connector phase is a real cancellation, including injected-wallet
    // prompts and the post-pairing WalletConnect signature phase (`view.kind === connecting`).
    if (busyRef.current || wcTokenRef.current) cancelConnectAttempt();
    setSheetOpen(false);
    setView({ kind: 'list' });
  }, [cancelConnectAttempt]);

  /** Backs out of a sub-view (WalletConnect QR / recommendation form) to the
   * wallet list without closing the sheet — drops any half-open WC pairing. */
  const cancelSubView = useCallback(() => {
    if (busyRef.current || wcTokenRef.current) cancelConnectAttempt();
    setView({ kind: 'list' });
  }, [cancelConnectAttempt]);

  const signInWith = useCallback(
    async (
      creds: PendingCredentials,
      recommendationCode?: string,
      stillCurrent: () => boolean = () => true,
    ) => {
      // Captured *before* the request, not read in the catch block: only a session that was
      // genuinely live when this attempt started should ever be reported as having "expired"
      // (finding #6) — a failed first-ever login has no session to expire.
      const wasLoggedIn = isLoggedInRef.current;
      try {
        await createSessionNew(
          creds.address,
          creds.signature,
          undefined,
          undefined,
          walletParam,
          activeInviteRef.current,
          creds.walletType,
          recommendationCode,
          language.toUpperCase(),
        );
        // The auth request itself cannot be aborted by the SDK. If the sheet was closed while
        // it was in flight, immediately discard the newly created DFX session and do not let a
        // late response sign in behind the user's back.
        if (!stillCurrent()) {
          await libLogout();
          return;
        }
        setActiveConnector(creds.connector);
        setSheetOpen(false);
        setView({ kind: 'list' });
        showToast(`${t('connected')} · ${shortAddress(creds.address)}`);
      } catch (error) {
        if (!stillCurrent()) return;
        if (needsRecommendation(error)) {
          setView({ kind: 'recommend', pending: creds, invalidCode: Boolean(recommendationCode) });
          setSheetOpen(true);
          return;
        }
        if (wasLoggedIn && isUnauthorized(error)) {
          await libLogout();
          showToast(t('sessionExpired'), { assertive: true });
        } else {
          showToast(t('signFail'), { assertive: true });
        }
        setView({ kind: 'list' });
      }
    },
    [createSessionNew, language, libLogout, showToast, t, walletParam],
  );

  const handleSelectWallet = useCallback(
    async (entry: WalletCatalogEntry) => {
      if (entry.connector === 'soon' || busyRef.current) return;
      busyRef.current = true;
      const myAttempt = ++attemptIdRef.current;
      const isCurrent = () => myAttempt === attemptIdRef.current;
      setView({ kind: 'connecting', walletId: entry.id, label: entry.name });
      try {
        let address: string;
        let signature: string;

        if (entry.connector === 'injected') {
          const provider = getInjectedProvider();
          if (!provider) {
            showToast(`${entry.name} ${t('notDetected')}`, { assertive: true });
            window.open(METAMASK_INSTALL_URL, '_blank', 'noopener');
            setView({ kind: 'list' });
            return;
          }
          address = await connectInjected(provider);
          const message = await getSignMessage(address);
          if (!isCurrent()) return;
          if (!authMsgOk(address, message)) {
            showToast(t('authMsgErr'), { assertive: true });
            setView({ kind: 'list' });
            return;
          }
          signature = await signWithInjected(provider, address, message);
        } else {
          setView({ kind: 'wallet-connect' });
          const token = createCancelToken();
          wcTokenRef.current = token;
          let session: WalletConnectSession;
          try {
            session = await connectWalletConnect(
              (uri) => setView((current) => (current.kind === 'wallet-connect' ? { ...current, uri } : current)),
              token,
            );
          } finally {
            if (wcTokenRef.current === token) wcTokenRef.current = null;
          }
          // Cancelled or superseded while waiting on the QR pairing — an abandoned attempt must
          // never sign in behind the user (finding #1's "no sign-in may fire" requirement).
          if (!isCurrent()) return;
          address = session.address;
          setView({ kind: 'connecting', walletId: entry.id, label: entry.name });
          const message = await getSignMessage(address);
          if (!isCurrent()) return;
          if (!authMsgOk(address, message)) {
            showToast(t('authMsgErr'), { assertive: true });
            setView({ kind: 'list' });
            return;
          }
          signature = await signWithWalletConnect(session.provider, address, message);
        }

        if (!isCurrent()) return;
        await signInWith(
          {
            address,
            signature,
            walletType: entry.walletType,
            connector: entry.connector === 'injected' ? 'injected' : 'wallet-connect',
          },
          undefined,
          isCurrent,
        );
      } catch (error) {
        // The attempt was cancelled — cancelConnectAttempt() already freed busyRef and reset the
        // view; an abandoned attempt's own error handling must not fire a toast for a flow the
        // user already backed out of.
        if (!isCurrent()) return;
        if (error instanceof WalletConnectorError) {
          showToast(error.reason === 'rejected' ? t('connCancel') : t('connErr'), { assertive: true });
        } else if (isUserRejection(error)) {
          showToast(t('signCancel'));
        } else {
          showToast(t('connErr'), { assertive: true });
        }
        setView({ kind: 'list' });
      } finally {
        // Guard against a superseded/cancelled attempt's `finally` clobbering the flag for a
        // genuinely-busy newer attempt (cancelConnectAttempt() already reset it for this one).
        if (isCurrent()) busyRef.current = false;
      }
    },
    [getSignMessage, showToast, signInWith, t],
  );

  const submitRecommendation = useCallback(
    async (pending: PendingCredentials, code: string) => {
      if (busyRef.current || !code.trim()) return;
      busyRef.current = true;
      const myAttempt = ++attemptIdRef.current;
      const isCurrent = () => myAttempt === attemptIdRef.current;
      setView({ kind: 'connecting', walletId: 'recommend', label: t('routeContinue') });
      try {
        await signInWith(pending, normalizeInviteCode(code), isCurrent);
      } finally {
        if (isCurrent()) busyRef.current = false;
      }
    },
    [signInWith, t],
  );

  // URL-param session bootstrap: ?session=/?token=/?accessToken= logs in
  // directly; ?address=&signature= performs the same sign-in the connect
  // sheet uses. Runs once — the stale-session clear above already ran (at
  // module-eval time) before this component ever mounted, so there is no
  // stale token in storage for AuthContextProvider to have picked up first.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    if (!hasCredentialParams(params)) return;

    const tokenParam = params.get('session') ?? params.get('token') ?? params.get('accessToken');
    const addressParam = params.get('address');
    const signatureParam = params.get('signature');

    if (tokenParam) {
      if (isLikelyValidJwt(tokenParam)) updateSession(tokenParam);
      scrubCredentialParams();
      return;
    }

    if (addressParam && signatureParam) {
      signInWith({ address: addressParam, signature: signatureParam }).finally(scrubCredentialParams);
    }
    // Intentionally run once on mount (empty deps): bootstrappedRef makes
    // re-runs a no-op, and re-reading `signInWith`/`updateSession` identities
    // here would only ever re-guard against the same already-consumed URL
    // params.
  }, []);

  // An authenticated injected-wallet session must never remain pinned to an address after the
  // extension changes accounts or chains. Re-authentication is required because the DFX JWT,
  // payment routes, and sell instructions all belong to the signed address.
  useEffect(() => {
    if (!isLoggedIn || !address) return undefined;
    if (activeConnector === 'wallet-connect') return undefined;
    const provider = getInjectedProvider();
    if (!provider?.on || !provider.removeListener) return undefined;

    let mounted = true;
    let monitorsThisSession = activeConnector === 'injected';
    if (!monitorsThisSession) {
      provider
        .request<string[]>({ method: 'eth_accounts' })
        .then((accounts) => {
          if (!mounted || !accounts?.[0]) return;
          try {
            monitorsThisSession = checksumAddress(accounts[0]) === checksumAddress(address);
          } catch {
            monitorsThisSession = false;
          }
        })
        .catch(() => undefined);
    }

    const invalidate = () => {
      if (!monitorsThisSession || providerChangeRef.current) return;
      providerChangeRef.current = true;
      cancelConnectAttempt();
      setActiveConnector(undefined);
      void libLogout()
        .then(() => showToast(t('sessionExpired'), { assertive: true }))
        .finally(() => {
          providerChangeRef.current = false;
        });
    };
    const onAccountsChanged = (accountsValue: unknown) => {
      const accounts = Array.isArray(accountsValue) ? accountsValue : [];
      try {
        if (accounts[0] && checksumAddress(String(accounts[0])) === checksumAddress(address)) return;
      } catch {
        // An invalid/empty account is a session change too.
      }
      invalidate();
    };
    const onChainChanged = () => invalidate();

    provider.on('accountsChanged', onAccountsChanged);
    provider.on('chainChanged', onChainChanged);
    return () => {
      mounted = false;
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [activeConnector, address, cancelConnectAttempt, isLoggedIn, libLogout, showToast, t]);

  const session = useMemo<WalletSession>(
    () => ({
      isLoggedIn,
      address,
      blockchains,
      blockchain,
      openConnect,
      closeConnect,
      logout: async () => {
        closeConnect();
        setActiveConnector(undefined);
        await disconnectWalletConnect();
        await libLogout();
        showToast(t('signOut'));
      },
      connectSheet: {
        open: sheetOpen,
        view,
        onSelectWallet: handleSelectWallet,
        onSubmitRecommendation: submitRecommendation,
        onBackToList: cancelSubView,
      },
    }),
    [
      address,
      blockchains,
      blockchain,
      cancelSubView,
      closeConnect,
      handleSelectWallet,
      isLoggedIn,
      libLogout,
      openConnect,
      sheetOpen,
      showToast,
      submitRecommendation,
      t,
      view,
    ],
  );

  return <WalletSessionContext.Provider value={session}>{children}</WalletSessionContext.Provider>;
}
