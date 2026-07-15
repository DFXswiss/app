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

/** Builds a trusted URL on the environment-specific DFX app origin. */
export function appUrl(path = '/'): string | undefined {
  const configuredOrigin = process.env.REACT_APP_PUBLIC_URL;
  const runtimeOrigin = typeof window === 'undefined' ? undefined : window.location.origin;
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
