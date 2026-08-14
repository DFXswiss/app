/** Accepts only absolute HTTPS URLs for every API-derived external navigation sink. */
export function isSafeHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
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
