import { personalIbanOnlyParams } from './personal-iban';

interface LoginRedirectSource {
  isWidget: boolean;
  widgetPersonalIban?: string;
}

// Where a login goes when no screen asked to be returned to. Only the login pages have a default.
export function loginTarget(redirectPath: string | undefined, pathname: string): string | undefined {
  if (redirectPath) return redirectPath;
  if (pathname === '/login' || pathname === '/login/mail' || pathname === '/login/wallet') return '/buy';
  return undefined;
}

// Callback params for a login that leaves the page: only `personal-iban`. Embedded as a Web Component the
// selector is the widget attribute and the page query belongs to the embedding page, so the query is ignored.
export function loginRedirectParams(
  { isWidget, widgetPersonalIban }: LoginRedirectSource,
  search: string,
): URLSearchParams {
  if (!isWidget) return personalIbanOnlyParams(search);

  const params = new URLSearchParams();
  if (widgetPersonalIban != null) params.set('personal-iban', widgetPersonalIban);
  return params;
}
