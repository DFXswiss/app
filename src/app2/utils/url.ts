/** Accepts only absolute HTTPS URLs for every API-derived external navigation sink. */
export function isSafeHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Copied from src/util/utils.ts `isSafeRedirectUri` — App 2.0 does not import
// main-app private modules. Pinned by legacy-contract.test.ts against the original.
const blockedRedirectSchemes = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
  'about:',
  'view-source:',
  'filesystem:',
  'intent:',
  'ws:',
  'wss:',
  'ftp:',
  'tel:',
  'sms:',
  'mailto:',
  'chrome:',
]);

const validSchemePattern = /^[a-z][a-z0-9+.-]*:$/;

/** Same allowlist the main app uses before honouring `redirect-uri`. */
export function isSafeRedirectUri(uri: string): boolean {
  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    return false;
  }

  const protocol = parsedUri.protocol.toLowerCase();

  if (protocol === 'https:') return true;

  if (protocol === 'http:') return parsedUri.hostname === 'localhost' || parsedUri.hostname === '127.0.0.1';

  if (blockedRedirectSchemes.has(protocol)) return false;

  return validSchemePattern.test(protocol);
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Allows HTTPS everywhere and plain HTTP only for a local development origin. */
export function isSafeAppUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHostname(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Magic-link return target for POST /auth/mail.
 *
 * The API validates `redirectUri` with `@IsUrl()` (TLD required) and an allowlist.
 * HTTP origins without a TLD (localhost, local stacks) fail that validator, so
 * they are omitted and the API uses its default. HTTPS production origins are
 * passed through so the mailed link can return to `/app2/`.
 */
export function mailRedirectUri(origin = window.location.origin, pathname = window.location.pathname): string | undefined {
  try {
    const url = new URL(pathname, origin);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * First non-empty query value across the real search string and the hash query
 * (`#/path?key=val`). Hash-router screens put params in the hash; partner deep
 * links often put them on the real query — both must work.
 */
export function firstQueryParam(...keys: string[]): string | undefined {
  const sources: URLSearchParams[] = [new URLSearchParams(window.location.search)];
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  if (q >= 0) sources.push(new URLSearchParams(hash.slice(q + 1)));
  for (const key of keys) {
    for (const qp of sources) {
      const value = qp.get(key)?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

/**
 * Hash-router screens put params on `useLocation().search`; partner deep links
 * put them on the real query or the hash query. Same union `external-transaction-id`
 * already uses on Home, extracted so each param is not a new `||` branch.
 */
export function routeOrQueryParam(locationSearch: string, key: string): string | undefined {
  const fromRoute = new URLSearchParams(locationSearch).get(key)?.trim();
  return fromRoute || firstQueryParam(key);
}

/**
 * Real-path Checkout/email returns land on `/app2/buy/success` etc., which the
 * hash router never sees. Fold those paths into `/app2/#/...` (preserving the
 * query) so `ReturnRouteScreen` runs. Returns null when already on a hash route
 * or the path is not a known return path.
 */
export function foldApp2PathIntoHash(
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
): string | null {
  const match = location.pathname.match(/^\/app2\/(buy\/success|buy\/failure|account-merge)\/?$/i);
  if (!match) return null;
  const route = match[1].toLowerCase();
  if (location.hash.startsWith(`#/${route}`)) return null;
  return `/app2/#/${route}${location.search}`;
}

/** Builds a trusted URL on the environment-specific DFX app origin. */
export function appUrl(path = '/'): string | undefined {
  const configuredOrigin = process.env.REACT_APP_PUBLIC_URL;
  const runtimeOrigin = window.location.origin;
  const origin = configuredOrigin ?? runtimeOrigin;
  if (!isSafeAppUrl(origin)) return undefined;

  try {
    const base = new URL(origin);
    const url = new URL(path, `${base.origin}/`);
    return url.origin === base.origin ? url.href : undefined;
  } catch {
    return undefined;
  }
}
