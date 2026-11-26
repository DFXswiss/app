import { jwtDecode } from 'jwt-decode';
import { storageGetJson, storageRemove, storageSetJson } from './safe-storage';

export interface LaunchCredentials {
  address: string;
  signature: string;
  pubkey?: string;
}

type Renew = (credentials: LaunchCredentials) => Promise<string>;

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

// When the API rejects a session of the launch address with 401 (the account was merged into another one), the
// launch signature signs in again and the rejected request is sent once more with the new session, so the SDK never
// sees the 401 and does not log out. One re-login per rejected session; a failed one returns the original 401.
export function installSessionRenewal(renew: Renew): () => void {
  const originalFetch = window.fetch;
  const renewals = new Map<string, Promise<string | undefined>>();

  function renewalFor(token: string): Promise<string | undefined> | undefined {
    const pending = renewals.get(token);
    if (pending) return pending;

    const credentials = launchCredentials.get();
    if (!credentials || tokenAddress(token) !== credentials.address) return undefined;

    const renewal = renew(credentials).catch(() => undefined);
    renewals.set(token, renewal);
    return renewal;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    if (response.status !== 401 || AUTH_PATH.test(requestUrl(input))) return response;

    const authorization = headerList(init?.headers).find(isAuthorization)?.[1];
    const renewal = authorization?.startsWith('Bearer ') && renewalFor(authorization.slice('Bearer '.length));
    const token = renewal && (await renewal);
    if (!token) return response;

    const headers = headerList(init?.headers).filter((header) => !isAuthorization(header));
    return originalFetch(input, { ...init, headers: [...headers, ['Authorization', `Bearer ${token}`]] });
  };

  return () => {
    window.fetch = originalFetch;
  };
}
