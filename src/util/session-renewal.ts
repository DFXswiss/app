import { jwtDecode } from 'jwt-decode';
import { storageGetJson, storageRemove, storageSetJson } from './safe-storage';

export interface LaunchCredentials {
  address: string;
  signature: string;
  pubkey?: string;
}

type Renew = (credentials: LaunchCredentials) => Promise<string>;
type CurrentSession = () => string | undefined;

const LAUNCH_CREDENTIALS_KEY = 'dfx.srv.launchCredentials';

// A 401 from the sign-in itself is a failed re-login, not a rejected session.
const AUTH_PATH = /\/v\d+\/auth(\/|\?|$)/;

// The `address` + `signature` a partner opened this tab with; kept for this tab only and dropped on logout.
export const launchCredentials = {
  get: () => storageGetJson<LaunchCredentials>('sessionStorage', LAUNCH_CREDENTIALS_KEY),
  set: (credentials: LaunchCredentials) => storageSetJson('sessionStorage', LAUNCH_CREDENTIALS_KEY, credentials),
  remove: () => storageRemove('sessionStorage', LAUNCH_CREDENTIALS_KEY),
};

function headerList(headers: HeadersInit = []): [string, string][] {
  if (Array.isArray(headers)) return headers as [string, string][];
  if (typeof (headers as Headers).entries === 'function') return Array.from((headers as Headers).entries());
  return Object.entries(headers);
}

function isAuthorization([name]: [string, string]): boolean {
  return name.toLowerCase() === 'authorization';
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'object' && 'url' in input ? input.url : String(input);
}

function tokenAddress(token: string): string | undefined {
  try {
    return jwtDecode<{ address?: string }>(token).address;
  } catch {
    return undefined;
  }
}

const HEX_ADDRESS = /^0x[0-9a-f]+$/i;

// A hex (EVM) address is case-insensitive: the launch URL carries the checksummed form, the session may carry another
// case. Base58 addresses (Bitcoin legacy, Solana, Tron, Monero) are case-sensitive and must match exactly.
function isSameAddress(sessionAddress: string | undefined, launchAddress: string): boolean {
  return (
    sessionAddress === launchAddress ||
    (sessionAddress !== undefined &&
      HEX_ADDRESS.test(sessionAddress) &&
      HEX_ADDRESS.test(launchAddress) &&
      sessionAddress.toLowerCase() === launchAddress.toLowerCase())
  );
}

// The sign-in of a re-login goes out without the rejected session: the API binds a sign-in that carries a session to
// that session's account, which after a merge is the merged (rejected) account again.
function withoutSession(init: RequestInit | undefined): RequestInit | undefined {
  if (init?.method?.toUpperCase() !== 'POST') return init;
  return { ...init, headers: headerList(init.headers).filter((header) => !isAuthorization(header)) };
}

// When the API rejects the current session of the launch address with 401 (the account was merged into another one),
// the launch signature signs in again and the rejected request is sent once more with the new session, so the SDK
// never sees the 401 and does not log out. One re-login per rejected session; a failed one returns the original 401,
// and a 401 of a renewed session reaches the caller unchanged instead of starting another re-login. A 401 of a session
// the app no longer uses, or one whose session was replaced by another login during the re-login, reaches the caller
// unchanged as well.
export function installSessionRenewal(renew: Renew, currentSession: CurrentSession): () => void {
  const originalFetch = window.fetch;
  const renewals = new Map<string, Promise<string | undefined>>();
  const renewedSessions = new Set<string>();
  let activeRenewals = 0;

  function renewalFor(token: string): Promise<string | undefined> | undefined {
    const pending = renewals.get(token);
    if (pending) return pending;
    if (renewedSessions.has(token) || currentSession() !== token) return undefined;

    const credentials = launchCredentials.get();
    if (!credentials || !isSameAddress(tokenAddress(token), credentials.address)) return undefined;

    activeRenewals += 1;
    const renewal = renew(credentials)
      .then(
        (renewed) => {
          renewedSessions.add(renewed);
          return renewed;
        },
        () => undefined,
      )
      .then((renewed) => {
        activeRenewals -= 1;
        return renewed;
      });
    renewals.set(token, renewal);
    return renewal;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const isSignIn = AUTH_PATH.test(requestUrl(input));
    const response = await originalFetch(input, isSignIn && activeRenewals > 0 ? withoutSession(init) : init);
    if (response.status !== 401 || isSignIn) return response;

    const headers = headerList(init?.headers);
    const authorization = headers.find(isAuthorization)?.[1];
    const rejected = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
    const renewal = rejected && renewalFor(rejected);
    const token = renewal && (await renewal);
    if (!token) return response;
    // The re-login itself makes the renewed session the current one; any other session comes from another login.
    const session = currentSession();
    if (session !== rejected && session !== token) return response;

    const otherHeaders = headers.filter((header) => !isAuthorization(header));
    return originalFetch(input, { ...init, headers: [...otherHeaders, ['Authorization', `Bearer ${token}`]] });
  };

  return () => {
    window.fetch = originalFetch;
  };
}
