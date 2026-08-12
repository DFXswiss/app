/**
 * Single source of truth for which query keys may appear in an outbound redirect URI.
 * Adding a key here is the only place that decides what leaves the app on login-return
 * paths and external login callbacks — check every use of that key before extending.
 */

/**
 * Copy from `search` exactly the keys listed in `allowed`, in that order, and nothing else.
 * A key missing from `search` is omitted (no empty placeholder). An empty value (`?a=`) is kept.
 */
export function allowedParamsOnly(search: string, allowed: readonly string[]): URLSearchParams {
  const source = new URLSearchParams(search);
  const params = new URLSearchParams();
  for (const key of allowed) {
    const value = source.get(key);
    if (value != null) {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Login-return path (`setRedirect`): only `a` (mail section anchor, see useAnchor).
 * Note that `a` is double-booked: payment-link routes read it as the `amount` shorthand
 * (payment-link.context.tsx). Those routes are unguarded and never reach setRedirect,
 * so the two uses do not collide today — but check both before adding a key here.
 * Do not copy the entire live search — that would leak code=/user=/arbitrary into the
 * outbound link.
 * Explicit options.redirectPath is not filtered by this helper.
 */
export const LOGIN_RETURN_ALLOWED_PARAMS = ['a'] as const;

/**
 * External login callbacks (magic-link mail, Alby): only an explicitly present `personal-iban`.
 * Do not copy the entire live search (would leak `user`, `arbitrary`, etc.).
 */
export const EXTERNAL_LOGIN_ALLOWED_PARAMS = ['personal-iban'] as const;
