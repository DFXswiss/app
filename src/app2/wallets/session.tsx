// Wallet-session contract for App 2.0.
//
// Trade/secondary screens consume ONLY this interface; the wallet-connect
// implementation (providers, signing, ?session= bootstrap) lives behind it.

import {
  AuthWalletType,
  type Blockchain,
  type UserAddress,
  useApi,
  useApiSession,
  useAuth,
  useAuthContext,
  useSessionContext,
  useUserContext,
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
import pecunityLogo from '../assets/wallets/pecunity.png';
import realunitLogo from '../assets/wallets/realunit.svg';
import urbleLogo from '../assets/wallets/urble.webp';
import { connectAlby } from './alby';
import { connectCardano } from './cardano';
import { catalogEntryByWalletType, walletIconFor, type WalletCatalogEntry } from './catalog';
import { connectChainWallet } from './chain-providers';
import { isPlausibleCliAddress } from './cli';
import { connectHardware, isWebHidAvailable, type HardwareChain, type HardwareId } from './hardware-providers';
import { normalizeInviteCode } from './invite';
import { rememberWallet, seenWallets } from './seen';
import { mainnetOnly } from '../screens/trade/blockchain-meta';
import {
  type CancelToken,
  checksumAddress,
  connectInjected,
  connectWalletConnect,
  createCancelToken,
  disconnectWalletConnect,
  getInjectedProvider,
  isUserRejection,
  resolveInjectedProvider,
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
  /** Hardware wallets: chain picked (Bitcoin/Ethereum) after tapping the tile. */
  onSelectHwChain: (entry: WalletCatalogEntry, chain: HardwareChain) => void;
  onSubmitRecommendation: (pending: PendingCredentials, code: string) => void;
  /** CLI / manual signing: fetch the DFX sign-message for a pasted address (throws
   * on an invalid address or an unexpected challenge). Used by the CLI paste form. */
  requestSignMessage: (address: string) => Promise<string>;
  /** CLI / manual signing: submit the pasted address + externally-produced signature
   * (+ public key where the chain's auth contract requires one). Resolves when the
   * attempt settles — on failure the sheet stays on the (still-filled-in) form. */
  onCliConnect: (entry: WalletCatalogEntry, address: string, signature: string, key?: string) => Promise<void>;
  onBackToList: () => void;
}

/** One row in the switch-wallet sheet. `linked` addresses belong to the active DFX account and
 * switch seamlessly (changeAddress, no re-signing); others are re-authenticated on switch. */
export interface WalletSwitchEntry {
  address: string;
  name: string;
  walletType?: string;
  blockchains: readonly Blockchain[];
  active: boolean;
  linked: boolean;
  icon?: string;
}

/** Switch-wallet sheet state + handlers — rendered by <Shell> alongside the connect sheet. */
export interface WalletSwitcherState {
  open: boolean;
  entries: WalletSwitchEntry[];
  onClose: () => void;
  onSwitch: (entry: WalletSwitchEntry) => void;
  onConnectAnother: () => void;
}

export interface WalletSession {
  isLoggedIn: boolean;
  address?: string;
  blockchains?: readonly Blockchain[];
  /** First chain, retained only for compact display labels. Reachability uses `blockchains`. */
  blockchain?: string;
  /** Active wallet's display name + brand icon, for the wallet bar. */
  activeWallet?: { name: string; icon?: string };
  /** Opens the connect sheet (or focuses it if already open). Pass `filterChain` to restrict the
   * list to wallets that can receive on a specific chain (asset-specific connect). */
  openConnect: (recommendationCode?: string, filterChain?: Blockchain) => void;
  /** Closes the connect sheet — call on route change too (finding #4). */
  closeConnect: () => void;
  /** Opens the switch-wallet sheet (previously-connected wallets). */
  openSwitcher: () => void;
  logout: () => Promise<void>;
  connectSheet: ConnectSheetState;
  switcher: WalletSwitcherState;
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

function decodeJwtPayload(token: string): { exp?: number; blockchains?: Blockchain[] } | undefined {
  try {
    const segment = token.split('.')[1];
    if (!segment) return undefined;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized)) as { exp?: number; blockchains?: Blockchain[] };
  } catch {
    return undefined;
  }
}

/** Blockchains the freshly-issued DFX access token authorizes for this address — read straight
 * from the JWT payload (the same source restoreSession/jwtPayload used in the static app). Persisted
 * on the remembered wallet so a wallet remembered from another account still shows its chain chips. */
function jwtBlockchains(token: string): Blockchain[] {
  const payload = decodeJwtPayload(token);
  return Array.isArray(payload?.blockchains) ? payload.blockchains : [];
}

function isLikelyValidJwt(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000; // 60s skew
}

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

// Brand logos for DFX partner wallets that aren't in the connect catalog — matched by provider
// name (fuzzy: lowercased, non-alphanumerics stripped, substring). Mirrors the static preview's
// WALLET_LOGOS/walletLogoByName (public/app2/index.html).
const WALLET_LOGOS: Record<string, string> = {
  pecunity: pecunityLogo,
  bricktowers: urbleLogo,
  urble: urbleLogo,
  realunit: realunitLogo,
};

function walletLogoByName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const brand of Object.keys(WALLET_LOGOS)) {
    if (key.includes(brand)) return WALLET_LOGOS[brand];
  }
  return undefined;
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
  /** Public key required by some chains' auth contract (Cardano COSE key, Arweave, ICP). */
  key?: string;
  walletType?: AuthWalletType;
  connector?: 'injected' | 'wallet-connect';
}

export type ConnectView =
  // `filterChain` (openConnect's 2nd arg) restricts the list to wallets that can receive on that
  // chain and swaps the sheet title/note copy — see ConnectSheet + openWalletSheet(filterChain).
  | { kind: 'list'; filterChain?: Blockchain }
  | { kind: 'connecting'; walletId: string; label: string }
  | { kind: 'wallet-connect'; uri?: string }
  | { kind: 'hw-chain'; entry: WalletCatalogEntry }
  | { kind: 'hw-pairing'; code?: string; label: string }
  | { kind: 'cli'; entry: WalletCatalogEntry }
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
  // Drop test networks everywhere downstream (display + reachability). Production has none; on the
  // dev API this removes Sepolia/Citrea-Testnet so an EVM wallet always reads as Ethereum, BTC as Bitcoin.
  const blockchains = mainnetOnly((authSession?.blockchains as Blockchain[] | undefined) ?? []);
  const blockchain = blockchains[0];
  const { createSessionNew, updateSession } = useApiSession();
  const { getSignMessage } = useAuth();
  // Versioned API base (e.g. https://api.dfx.swiss/v1) — used to build the hosted-Alby OAuth redirect.
  const { defaultUrl: apiBaseUrl } = useApi();
  // Linked addresses on the active DFX account + seamless address switch (no re-signing). This is
  // the authoritative source of the user's own wallets for the switch-wallet sheet.
  const { userAddresses, changeAddress, reloadUser } = useUserContext();
  const { t, language } = useT();
  const { showToast } = useToast();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Bumped whenever we remember a wallet, so the switcher's entry list re-reads localStorage.
  const [seenVersion, setSeenVersion] = useState(0);
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

  // Invite/referral code and ?wallet= (partner wallet id) — read once; both map straight onto the
  // /auth body (usedRef, wallet) per auth.d.ts. A real DFX referral link is ?code= (REF_BASE
  // 'https://app.dfx.swiss/login?code='), with ?ref=/?usedRef= as legacy aliases and ?refcode= the
  // embed-contract param that overrides them — mirrors the original INVITE resolution
  // (public/app2/index.html:1638 code||ref||usedRef, then APPP.refcode override at :1656).
  const inviteCode = useMemo(() => {
    const qp = new URLSearchParams(window.location.search);
    return (
      qp.get('refcode')?.trim() ||
      qp.get('code')?.trim() ||
      qp.get('ref')?.trim() ||
      qp.get('usedRef')?.trim() ||
      undefined
    );
  }, []);
  const walletParam = useMemo(() => new URLSearchParams(window.location.search).get('wallet')?.trim() || undefined, []);
  const activeInviteRef = useRef(normalizeInviteCode(inviteCode));

  const openConnect = useCallback(
    (recommendationCode?: string, filterChain?: Blockchain) => {
      activeInviteRef.current = normalizeInviteCode(recommendationCode) ?? normalizeInviteCode(inviteCode);
      setView({ kind: 'list', filterChain });
      setSheetOpen(true);
    },
    [inviteCode],
  );

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
      // Where to return the view on a non-recommendation failure. The CLI paste form passes its
      // own view so a bad signature drops back to the (still-filled-in) form, not the wallet list.
      fallbackView: ConnectView = { kind: 'list' },
    ) => {
      // Captured *before* the request, not read in the catch block: only a session that was
      // genuinely live when this attempt started should ever be reported as having "expired"
      // (finding #6) — a failed first-ever login has no session to expire.
      const wasLoggedIn = isLoggedInRef.current;
      try {
        const token = await createSessionNew(
          creds.address,
          creds.signature,
          creds.key,
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
        // Remember this wallet so the switch-wallet sheet can offer it again (the connector label
        // gives the brand logo + lets a different-account wallet be re-authenticated on switch). The
        // session's blockchains are persisted too, so a wallet remembered here still renders its
        // chain chips when the switcher shows it under a *different* account (finding #7).
        rememberWallet({
          walletType: creds.walletType,
          address: creds.address,
          chains: mainnetOnly(jwtBlockchains(token)),
        });
        setSeenVersion((v) => v + 1);
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
        setView(fallbackView);
      }
    },
    [createSessionNew, language, libLogout, showToast, t, walletParam],
  );

  const handleSelectWallet = useCallback(
    async (entry: WalletCatalogEntry) => {
      if (entry.connector === 'soon' || busyRef.current) return;
      // Hardware wallets support Bitcoin and EVM — ask which chain to couple
      // before touching the device. The actual connect runs in handleSelectHwChain.
      if (entry.connector === 'bitbox' || entry.connector === 'ledger' || entry.connector === 'trezor') {
        setView({ kind: 'hw-chain', entry });
        return;
      }
      // CLI / manual signing: no wallet to reach — open the paste form, which
      // fetches the sign-message and submits the pasted signature via onCliConnect.
      if (entry.connector === 'cli') {
        setView({ kind: 'cli', entry });
        return;
      }
      busyRef.current = true;
      const myAttempt = ++attemptIdRef.current;
      const isCurrent = () => myAttempt === attemptIdRef.current;
      setView({ kind: 'connecting', walletId: entry.id, label: `${t('connecting')} ${entry.name}…` });
      try {
        let address: string;
        let signature: string;
        // Cardano's CIP-30 signData yields a COSE key alongside the signature; the API needs both.
        let key: string | undefined;

        if (entry.connector === 'injected') {
          const provider = resolveInjectedProvider(entry.injected ?? {});
          if (!provider) {
            showToast(`${entry.name} ${t('notDetected')}`, { assertive: true });
            // Only MetaMask has a canonical install page to send people to; for
            // any other wallet a wrong download link would be worse than none.
            if (entry.walletType === AuthWalletType.METAMASK) {
              window.open(METAMASK_INSTALL_URL, '_blank', 'noopener');
            }
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
        } else if (entry.connector === 'solana' || entry.connector === 'tron') {
          // Non-EVM adapters (Phantom/Trust/TronLink): a single connect prompt,
          // then the same challenge → authMsgOk → sign sequence as the injected
          // path. No QR/cancel-token phase; `isCurrent()` discards a late result
          // if the sheet was closed meanwhile.
          const chain = await connectChainWallet(entry);
          if (!isCurrent()) return;
          address = chain.address;
          const message = await getSignMessage(address);
          if (!isCurrent()) return;
          if (!authMsgOk(address, message)) {
            showToast(t('authMsgErr'), { assertive: true });
            setView({ kind: 'list' });
            return;
          }
          signature = await chain.sign(message);
        } else if (entry.connector === 'cardano') {
          // CIP-30 browser wallet (Nami/Eternl/Lace): connect → address → challenge →
          // signData, which returns the COSE signature plus the COSE key the API requires.
          const cardano = await connectCardano();
          if (!isCurrent()) return;
          address = cardano.address;
          const message = await getSignMessage(address);
          if (!isCurrent()) return;
          if (!authMsgOk(address, message)) {
            showToast(t('authMsgErr'), { assertive: true });
            setView({ kind: 'list' });
            return;
          }
          const signed = await cardano.sign(message);
          signature = signed.signature;
          key = signed.key;
        } else if (entry.connector === 'alby') {
          // WebLN / Lightning: a self-custodial node signs locally; a hosted getalby.com
          // account redirects to the DFX Alby OAuth page (which returns ?session= on return).
          const result = await connectAlby({ apiBaseUrl, wallet: walletParam, usedRef: activeInviteRef.current });
          if (result.kind === 'redirected') return; // page is navigating away to the OAuth endpoint
          if (!isCurrent()) return;
          address = result.session.address;
          const message = await getSignMessage(address);
          if (!isCurrent()) return;
          if (!authMsgOk(address, message)) {
            showToast(t('authMsgErr'), { assertive: true });
            setView({ kind: 'list' });
            return;
          }
          signature = await result.session.sign(message);
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
          setView({ kind: 'connecting', walletId: entry.id, label: `${t('connecting')} ${entry.name}…` });
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
            key,
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
    [apiBaseUrl, getSignMessage, showToast, signInWith, t, walletParam],
  );

  const handleSelectHwChain = useCallback(
    async (entry: WalletCatalogEntry, chain: HardwareChain) => {
      if (busyRef.current) return;
      // Trezor drives its own WebUSB popup (connect.trezor.io); only BitBox/Ledger need WebHID here.
      if (entry.connector !== 'trezor' && !isWebHidAvailable()) {
        showToast(t('hwNoHid'), { assertive: true });
        setView({ kind: 'list' });
        return;
      }
      busyRef.current = true;
      const myAttempt = ++attemptIdRef.current;
      const isCurrent = () => myAttempt === attemptIdRef.current;
      setView({ kind: 'connecting', walletId: entry.id, label: t('hwConnecting') });
      try {
        const hw = await connectHardware(entry.connector as HardwareId, chain, {
          onPairingCode: (code) => {
            if (isCurrent()) setView({ kind: 'hw-pairing', code, label: entry.name });
          },
          onStatus: (status) => {
            // 'pair' is represented by the pairing-code view (onPairingCode); the others
            // are plain status lines. Never overwrite a newer/cancelled attempt's view.
            if (!isCurrent() || status === 'pair') return;
            const label = status === 'unlock' ? t('hwUnlock') : t('hwDeriving');
            setView({ kind: 'connecting', walletId: entry.id, label });
          },
        });
        if (!isCurrent()) return;
        const { address } = hw;
        setView({ kind: 'connecting', walletId: entry.id, label: t('hwSign') });
        const message = await getSignMessage(address);
        if (!isCurrent()) return;
        if (!authMsgOk(address, message)) {
          showToast(t('authMsgErr'), { assertive: true });
          setView({ kind: 'list' });
          return;
        }
        const signature = await hw.sign(message);
        if (!isCurrent()) return;
        await signInWith(
          { address, signature, walletType: entry.walletType, connector: 'wallet-connect' },
          undefined,
          isCurrent,
        );
      } catch (error) {
        if (!isCurrent()) return;
        if (error instanceof WalletConnectorError && error.reason === 'rejected') {
          showToast(t('signCancel'));
        } else if (isUserRejection(error)) {
          showToast(t('signCancel'));
        } else {
          showToast(t('hwFail'), { assertive: true });
        }
        setView({ kind: 'list' });
      } finally {
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
      setView({ kind: 'connecting', walletId: 'recommend', label: `${t('routeContinue')}…` });
      try {
        await signInWith(pending, normalizeInviteCode(code), isCurrent);
      } finally {
        if (isCurrent()) busyRef.current = false;
      }
    },
    [signInWith, t],
  );

  // CLI / manual signing: fetch + sanity-check the DFX challenge for a pasted address. Throws
  // (WalletConnectorError) on a bad address or an unexpected challenge; the paste form surfaces it.
  const requestSignMessage = useCallback(
    async (rawAddress: string) => {
      const address = rawAddress.trim();
      if (!isPlausibleCliAddress(address)) throw new WalletConnectorError('Invalid address', 'failed');
      const message = await getSignMessage(address);
      if (!authMsgOk(address, message)) throw new WalletConnectorError('Unexpected sign-in message', 'failed');
      return message;
    },
    [getSignMessage],
  );

  // CLI / manual signing: submit the pasted address + externally-produced signature (+ key). A
  // non-recommendation failure returns to the still-filled-in CLI form rather than the wallet list.
  const handleCliConnect = useCallback(
    async (entry: WalletCatalogEntry, rawAddress: string, signature: string, key?: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const myAttempt = ++attemptIdRef.current;
      const isCurrent = () => myAttempt === attemptIdRef.current;
      try {
        await signInWith(
          {
            address: rawAddress.trim(),
            signature: signature.trim(),
            key: key?.trim() || undefined,
            walletType: entry.walletType,
            connector: 'wallet-connect',
          },
          undefined,
          isCurrent,
          { kind: 'cli', entry },
        );
      } finally {
        if (isCurrent()) busyRef.current = false;
      }
    },
    [signInWith],
  );

  // ---------------------------------------------------------------------------
  // Switch-wallet sheet — list every wallet the user has connected and let them
  // hop between them (ported from the static preview's switcher). Addresses on
  // the active DFX account switch seamlessly (changeAddress); wallets from a
  // different account are re-authenticated by reconnecting them.
  // ---------------------------------------------------------------------------

  const switchEntries = useMemo<WalletSwitchEntry[]>(() => {
    void seenVersion; // re-read localStorage whenever a wallet is remembered
    const current = (address ?? '').toLowerCase();
    const map = new Map<string, WalletSwitchEntry>();

    // 1) Wallets linked to the active DFX account — authoritative + seamless switch.
    (userAddresses ?? []).forEach((a: UserAddress) => {
      if (!a?.address || a.isCustody) return;
      const name = a.label || a.wallet || 'Wallet';
      map.set(a.address.toLowerCase(), {
        address: a.address,
        name,
        walletType: a.wallet,
        blockchains: mainnetOnly(a.blockchains ?? []),
        active: a.address.toLowerCase() === current,
        linked: true,
        icon: walletLogoByName(name) ?? walletLogoByName(a.wallet) ?? walletIconFor(a.wallet),
      });
    });

    // 2) Wallets connected on this device before — enrich with the connector logo/id, and add
    //    wallets that belong to a different account (re-authenticated on switch).
    seenWallets().forEach((e) => {
      const key = e.address.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.icon) existing.icon = walletLogoByName(e.walletType) ?? walletIconFor(e.walletType);
        if (existing.name === 'Wallet' && e.walletType) existing.name = e.walletType;
        if (!existing.walletType) existing.walletType = e.walletType;
      } else {
        map.set(key, {
          address: e.address,
          name: e.walletType || 'Wallet',
          walletType: e.walletType,
          // Chains persisted when this wallet was connected (finding #7) — mirrors the original's
          // switcherEntries `blockchains: e.chains||[]` so the chip row (· Bitcoin · Ethereum)
          // still renders for a wallet remembered under a different account.
          blockchains: mainnetOnly(e.chains ?? []),
          active: key === current,
          linked: false,
          icon: walletLogoByName(e.walletType) ?? walletIconFor(e.walletType),
        });
      }
    });

    // 3) Always include the current session address, even before either source has it.
    if (current && !map.has(current)) {
      map.set(current, {
        address: address as string,
        name: 'Wallet',
        blockchains: blockchains ?? [],
        active: true,
        linked: false,
      });
    }

    return Array.from(map.values()).sort((x, y) => (x.active ? -1 : y.active ? 1 : 0));
  }, [userAddresses, address, blockchains, seenVersion]);

  const activeWallet = useMemo(() => {
    const entry = switchEntries.find((e) => e.active);
    return entry ? { name: entry.name, icon: entry.icon } : undefined;
  }, [switchEntries]);

  const openSwitcher = useCallback(() => {
    setSwitcherOpen(true);
    void reloadUser(); // refresh the account's linked addresses when the sheet opens
  }, [reloadUser]);

  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);

  const switchTo = useCallback(
    async (entry: WalletSwitchEntry) => {
      setSwitcherOpen(false);
      if (entry.active) return;
      showToast(`${t('switching')} · ${shortAddress(entry.address)}`);
      try {
        // Seamless re-issue for any address linked to the active account (no re-signing).
        await changeAddress(entry.address);
        void reloadUser();
        showToast(`${t('connected')} · ${shortAddress(entry.address)}`);
      } catch (error) {
        // A linked address should have switched seamlessly — surface one clean error rather than
        // opening a wallet prompt for a flow that was supposed to be instant.
        if (entry.linked) {
          showToast(t('switchFail'), { assertive: true });
          return;
        }
        // Remembered from a different account/device — re-authenticate that specific wallet.
        const catalogEntry = catalogEntryByWalletType(entry.walletType);
        openConnect();
        if (catalogEntry) void handleSelectWallet(catalogEntry);
      }
    },
    [changeAddress, reloadUser, showToast, t, openConnect, handleSelectWallet],
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
      activeWallet,
      openConnect,
      closeConnect,
      openSwitcher,
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
        onSelectHwChain: handleSelectHwChain,
        onSubmitRecommendation: submitRecommendation,
        requestSignMessage,
        onCliConnect: handleCliConnect,
        onBackToList: cancelSubView,
      },
      switcher: {
        open: switcherOpen,
        entries: switchEntries,
        onClose: closeSwitcher,
        onSwitch: switchTo,
        onConnectAnother: () => {
          closeSwitcher();
          openConnect();
        },
      },
    }),
    [
      address,
      blockchains,
      blockchain,
      activeWallet,
      cancelSubView,
      closeConnect,
      closeSwitcher,
      handleCliConnect,
      handleSelectWallet,
      handleSelectHwChain,
      isLoggedIn,
      libLogout,
      openConnect,
      openSwitcher,
      requestSignMessage,
      sheetOpen,
      showToast,
      submitRecommendation,
      switchEntries,
      switchTo,
      switcherOpen,
      t,
      view,
    ],
  );

  return <WalletSessionContext.Provider value={session}>{children}</WalletSessionContext.Provider>;
}
