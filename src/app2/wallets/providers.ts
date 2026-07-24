// DFX App 2.0 — thin wallet-connector adapters.
//
// These are deliberately NOT the src/hooks/wallets/* hooks: those are wired
// to the main app's wagmi `config` singleton (src/wagmi.config.ts) and its
// React context (useWeb3, WagmiProvider from src/Main.tsx). Pulling them in
// here would couple app2 to a wagmi provider tree it doesn't mount. Instead
// we talk to `window.ethereum` and `@walletconnect/ethereum-provider`
// directly — the same libraries those hooks use underneath, just without
// the main app's context.

import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { getAddress } from 'ethers';
import { clearWalletConnectStorage } from './storage';

/** Same Reown/WalletConnect Cloud project id as src/wagmi.config.ts
 * (WALLET_CONNECT_PROJECT_ID). Duplicated as a literal rather than imported
 * so this module never pulls in @wagmi/core's chain list or connectors. */
const WALLET_CONNECT_PROJECT_ID = '8c8a3a14d25438a1e1b8f4d91d8d2674';

// EVM chain ids WalletConnect may request session permission for. 1 = Ethereum
// mainnet (required); the rest mirror src/wagmi.config.ts's optional chains.
const WC_REQUIRED_CHAINS: [number] = [1];
const WC_OPTIONAL_CHAINS = [10, 56, 137, 4114, 5115, 8453, 42161];

export class WalletConnectorError extends Error {
  constructor(
    message: string,
    readonly reason: 'not-installed' | 'rejected' | 'no-account' | 'failed',
  ) {
    super(message);
    this.name = 'WalletConnectorError';
  }
}

// ---------------------------------------------------------------------------
// Cancellation token — lets a caller abandon a pending connect attempt (e.g. Cancel in the
// WalletConnect QR view, or the sheet closing on a route change) without waiting for whatever
// async call is currently in flight. Created *before* any await in the connector function so a
// cancel() called while e.g. the WC provider is still initializing is never missed.
// ---------------------------------------------------------------------------

export interface CancelToken {
  cancelled: boolean;
  /** Rejects with `error` once, no-op afterwards. Racing this promise against the in-flight
   * connector call is what lets a cancelled attempt stop waiting immediately. */
  promise: Promise<never>;
  cancel: (error: Error) => void;
}

export function createCancelToken(): CancelToken {
  const token = { cancelled: false } as CancelToken;
  token.promise = new Promise<never>((_, reject) => {
    token.cancel = (error: Error) => {
      if (token.cancelled) return;
      token.cancelled = true;
      reject(error);
    };
  });
  return token;
}

// ---------------------------------------------------------------------------
// Injected (EIP-1193) — MetaMask, Rabby, Coinbase Wallet, Brave, Trust and any
// other browser-extension wallet. Individual wallets are disambiguated via
// EIP-6963 (each announces its own provider tagged with a stable `rdns`), which
// is how a click on the "Rabby" tile reaches Rabby even when MetaMask also owns
// the legacy `window.ethereum`. For older wallets that never announce, we fall
// back to the single `window.ethereum` provider, matched against the wallet's
// vendor flag (isRabby / isCoinbaseWallet / …) so we never sign into a
// different wallet than the one the user tapped.
// ---------------------------------------------------------------------------

/** Vendor flags an injected provider may expose to identify itself, mirroring
 * the detection in the main app's metamask.hook.ts (isMetaMask/isRabby/…). */
type InjectedFlavorFlag = 'isMetaMask' | 'isRabby' | 'isCoinbaseWallet' | 'isTrust' | 'isBraveWallet';

export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isBraveWallet?: boolean;
}

/** How a catalog entry locates its injected provider: the EIP-6963 `rdns` is
 * tried first, then the vendor flag on `window.ethereum` as a legacy fallback. */
export interface InjectedTarget {
  rdns?: string;
  flavor?: InjectedFlavorFlag;
}

// `window.ethereum` is already declared `any` by a transitive dependency
// (viem's injected-provider global augmentation), so it can't be re-declared
// with a stricter type here without a conflicting-merge error. Read it as
// `unknown` and narrow locally instead of augmenting the global `Window`.
function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return typeof value === 'object' && value !== null && typeof (value as { request?: unknown }).request === 'function';
}

export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === 'undefined') return undefined;
  const injected: unknown = (window as { ethereum?: unknown }).ethereum;
  return isEip1193Provider(injected) ? injected : undefined;
}

// EIP-6963 provider discovery — wallets answer an `eip6963:requestProvider`
// event by dispatching `eip6963:announceProvider` with `{ info: { rdns, … },
// provider }`. We keep the latest announcement per rdns; several wallets can
// coexist without fighting over window.ethereum.
interface Eip6963AnnounceDetail {
  info?: { rdns?: string; name?: string; icon?: string };
  provider?: unknown;
}

const eip6963Providers = new Map<string, Eip1193Provider>();
let eip6963DiscoveryStarted = false;

function startEip6963Discovery(): void {
  if (eip6963DiscoveryStarted || typeof window === 'undefined') return;
  eip6963DiscoveryStarted = true;
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const detail = (event as CustomEvent<Eip6963AnnounceDetail>).detail;
    const rdns = detail?.info?.rdns;
    if (rdns && isEip1193Provider(detail?.provider)) eip6963Providers.set(rdns, detail.provider);
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

// Begin discovery as soon as this module loads so announcements are collected
// well before the user opens the connect sheet.
startEip6963Discovery();

/** Resolves the EIP-1193 provider for a specific injected wallet. Returns
 * `undefined` when that wallet is not present — the caller surfaces a
 * "not detected" prompt rather than silently connecting a different wallet. */
export function resolveInjectedProvider(target: InjectedTarget): Eip1193Provider | undefined {
  // Re-request in case the wallet extension loaded after the initial dispatch.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('eip6963:requestProvider'));

  if (target.rdns) {
    const announced = eip6963Providers.get(target.rdns);
    if (announced) return announced;
  }

  // Legacy fallback: the single window.ethereum, but only when it actually is
  // (or, for MetaMask with no flag required, plausibly is) the wallet tapped.
  const injected = getInjectedProvider();
  if (!injected) return undefined;
  if (target.flavor && !injected[target.flavor]) return undefined;
  return injected;
}

export function isUserRejection(error: unknown): boolean {
  const code = (error as { code?: number } | undefined)?.code;
  const message = String((error as { message?: unknown } | undefined)?.message ?? error ?? '');
  return code === 4001 || code === 5000 || /reject|cancel|denied|abort/i.test(message);
}

/** Normalizes every EVM entry path to the same EIP-55 representation used by the main app. */
export function checksumAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    throw new WalletConnectorError('Invalid account returned', 'no-account');
  }
}

/** personal_sign wire format: hex-encoded UTF-8 bytes of the message,
 * matching public/app2/index.html's personalHex() — wallets hash the
 * decoded bytes, so the hex prefix must be present. */
function personalSignHex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function connectInjected(provider: Eip1193Provider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
  const address = accounts?.[0];
  if (!address) throw new WalletConnectorError('No account returned', 'no-account');
  return checksumAddress(address);
}

export async function signWithInjected(provider: Eip1193Provider, address: string, message: string): Promise<string> {
  return provider.request<string>({ method: 'personal_sign', params: [personalSignHex(message), address] });
}

// ---------------------------------------------------------------------------
// WalletConnect v2 — vendored via @walletconnect/ethereum-provider (already
// a project dependency for the main app's wagmi connector). showQrModal is
// false: the connect sheet draws its own QR (react-qr-code, already a
// project dependency) instead of pulling in WalletConnect's modal bundle.
// ---------------------------------------------------------------------------

// The package's public entry only exports `EthereumProvider` as a value
// (`export declare const EthereumProvider: typeof Provider`) — the class
// type itself lives one level deeper. InstanceType<> recovers it without
// reaching into dist internals.
type WcEthereumProvider = InstanceType<typeof EthereumProvider>;

let wcProviderPromise: Promise<WcEthereumProvider> | undefined;

function initWalletConnectProvider(): Promise<WcEthereumProvider> {
  wcProviderPromise ??= EthereumProvider.init({
    projectId: WALLET_CONNECT_PROJECT_ID,
    chains: WC_REQUIRED_CHAINS,
    optionalChains: WC_OPTIONAL_CHAINS,
    showQrModal: false,
    methods: ['personal_sign', 'eth_sendTransaction', 'eth_accounts'],
    metadata: {
      name: 'DFX',
      description: 'Buy, sell and swap crypto',
      url: window.location.origin,
      icons: [],
    },
  }).catch((error: unknown) => {
    wcProviderPromise = undefined;
    throw error;
  });
  return wcProviderPromise;
}

export interface WalletConnectSession {
  provider: WcEthereumProvider;
  address: string;
}

/** Starts a WalletConnect v2 pairing. `onUri` is called (possibly several
 * times) with the pairing URI to render as a QR code once it's known.
 * Resolves once the remote wallet approves the session.
 *
 * `token` lets the caller abandon this attempt (Cancel in the QR view, or the sheet closing on
 * a route change) without waiting for `provider.enable()` to settle — which, mid-pairing, may
 * never happen on its own (the remote wallet simply never responds). `provider.enable()` is
 * raced against `token.promise` rather than awaited directly for exactly that reason; the
 * abandoned `enable()` call, if it ever does resolve or reject later, is left with a no-op
 * `.catch()` so it doesn't surface as an unhandled rejection. There is no SDK-level "abort this
 * pairing" call to make instead: @walletconnect/universal-provider's `abortPairingAttempt()` is
 * a documented no-op in the installed version — `disconnectWalletConnect()` (called by the
 * caller alongside `token.cancel()`) is the most teardown the API allows. */
export async function connectWalletConnect(
  onUri: (uri: string) => void,
  token: CancelToken,
): Promise<WalletConnectSession> {
  if (token.cancelled) throw new WalletConnectorError('Connection cancelled', 'rejected');

  // EthereumProvider restores persisted sessions during init and enable() reuses them. A new
  // user-initiated pairing must therefore always start from a clean provider, otherwise a
  // previous visitor's wallet can silently pre-empt the QR flow on a shared browser.
  await disconnectWalletConnect();
  if (token.cancelled) throw new WalletConnectorError('Connection cancelled', 'rejected');

  const provider = await Promise.race([initWalletConnectProvider(), token.promise]).catch((error: unknown) => {
    if (token.cancelled) throw error;
    throw new WalletConnectorError('Could not start WalletConnect', 'failed');
  });
  if (token.cancelled) throw new WalletConnectorError('Connection cancelled', 'rejected');

  const handleUri = (uri: string) => onUri(uri);
  provider.on('display_uri', handleUri);
  const enablePromise = provider.enable();
  enablePromise.catch(() => undefined); // see doc comment above — avoid an unhandled rejection if we race away from this
  try {
    const accounts = await Promise.race([enablePromise, token.promise]);
    const address = accounts?.[0];
    if (!address) throw new WalletConnectorError('No account returned', 'no-account');
    return { provider, address: checksumAddress(address) };
  } catch (error) {
    if (error instanceof WalletConnectorError) throw error;
    if (isUserRejection(error)) throw new WalletConnectorError('Connection cancelled', 'rejected');
    throw error;
  } finally {
    provider.removeListener('display_uri', handleUri);
  }
}

export async function signWithWalletConnect(
  provider: WcEthereumProvider,
  address: string,
  message: string,
): Promise<string> {
  return provider.request<string>({ method: 'personal_sign', params: [personalSignHex(message), address] });
}

/** Tears down the current WalletConnect provider as best the SDK allows (finding #1: cancelling
 * mid-QR-pairing must not leave a zombie connect attempt around). Resetting `wcProviderPromise`
 * unconditionally — even when there's no session yet to hand `provider.disconnect()` — is the
 * real fix here: `EthereumProvider#disconnect()` is a no-op beyond a local state reset until a
 * session exists, so it can't kill an unapproved pairing on its own, but discarding the cached
 * provider means the *next* connect attempt always starts from a fresh instance instead of
 * reusing (and getting stuck behind) this one. */
export async function disconnectWalletConnect(): Promise<void> {
  // A page reload restores the persisted SDK session before this module has a live provider.
  // Clear storage even in that no-provider case, and repeat after disconnect in case the SDK
  // wrote state while completing its own teardown.
  clearWalletConnectStorage();
  if (!wcProviderPromise) return;
  const providerPromise = wcProviderPromise;
  wcProviderPromise = undefined;
  const provider = await providerPromise.catch(() => undefined);
  if (provider) await provider.disconnect().catch(() => undefined);
  clearWalletConnectStorage();
}
