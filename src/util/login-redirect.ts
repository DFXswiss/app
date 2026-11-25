import { normalizeRoute } from './deleted-address';
import { personalIbanOnlyParams } from './personal-iban';
import { storageGet } from './safe-storage';
import { isSafeRedirectUri } from './utils';

interface LoginRedirectSource {
  isWidget: boolean;
  widgetPersonalIban?: string;
}

// Where a login goes when no screen asked to be returned to. Only the login pages have a default.
export function loginTarget(redirectPath: string | undefined, pathname: string): string | undefined {
  if (redirectPath) return redirectPath;
  const route = normalizeRoute(pathname);
  if (route === '/login' || route === '/login/mail' || route === '/login/wallet') return '/buy';
  return undefined;
}

// The page a login that leaves the page returns to. A login target wins. Without one the API returns to
// `/account` on its own, but then nothing carries the partner `redirect-uri`, which the return's boot clears;
// so a callback that has to carry `redirect-uri` goes to that same `/account` page.
export function loginCallbackPath(target: string | undefined, params: URLSearchParams): string | undefined {
  if (target) return target;
  return params.has('redirect-uri') ? '/account' : undefined;
}

// Callback params for a login that leaves the page: `personal-iban` and, standalone only, the stored partner
// `redirect-uri`, because the return is a new page load whose boot clears the stored target. A value that fails
// `isSafeRedirectUri` is not forwarded. Embedded as a Web Component the selector is the widget attribute and the
// page query belongs to the embedding page, so the query is ignored.
export function loginRedirectParams(
  { isWidget, widgetPersonalIban }: LoginRedirectSource,
  search: string,
): URLSearchParams {
  if (!isWidget) {
    const params = personalIbanOnlyParams(search);
    const redirectUri = storageGet('localStorage', 'dfx.srv.redirectUri');
    if (redirectUri && isSafeRedirectUri(redirectUri)) params.set('redirect-uri', redirectUri);
    return params;
  }

  const params = new URLSearchParams();
  if (widgetPersonalIban != null) params.set('personal-iban', widgetPersonalIban);
  return params;
}
