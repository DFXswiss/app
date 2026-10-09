import { useMemo } from 'react';
import { NavigateOptions, To, useLocation, useNavigate } from 'react-router-dom';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import { redirectAllowedParams, relativeUrl } from '../util/utils';

interface NavigationOptions extends NavigateOptions {
  clearParams?: string[];
  setRedirect?: boolean;
  redirectPath?: string;
}

interface NavigationInterface {
  navigate: (to: To | number, options?: NavigationOptions) => void;
  goBack: (options?: NavigationOptions) => void;
  setParams: (params: URLSearchParams) => void;
  clearParams: (params: string[]) => void;
}

export function useNavigation(): NavigationInterface {
  const navigateTo = useNavigate();
  const { search, pathname } = useLocation();
  const { redirectPath, setRedirectPath } = useAppHandlingContext();

  function navigate(to: To | number, options?: NavigationOptions) {
    // Remember only allowlisted query params (e.g. a=call) so deep-links survive login without
    // leaking code=/user= into magic-link / Alby redirectUri. Explicit redirectPath unchanged.
    if (options?.setRedirect) {
      setRedirectPath(options?.redirectPath ?? relativeUrl({ path: pathname, params: redirectAllowedParams(search) }));
    }

    switch (typeof to) {
      case 'number':
        return navigateTo(to);

      case 'string':
        return navigateTo(relativeUrl({ path: to, params: new URLSearchParams(search) }), options);

      default:
        const params = addParams(new URLSearchParams(to.search), options?.clearParams);

        to.search = `?${params}`;
        return navigateTo(to, options);
    }
  }

  function goBack(options?: NavigationOptions) {
    setRedirectPath(undefined);
    navigate(redirectPath ?? '/account', options);
  }

  function setParams(newParams: URLSearchParams) {
    const params = addParams(newParams);

    return navigateTo(relativeUrl({ path: pathname, params }));
  }

  function addParams(newParams: URLSearchParams, clearParams?: string[]): URLSearchParams {
    const params = new URLSearchParams(search);
    newParams.forEach((val, key) => params.set(key, val));
    clearParams?.forEach((s) => params.delete(s));

    return params;
  }

  function clearParams(params: string[]) {
    navigate({ pathname }, { replace: true, clearParams: params });
  }

  return useMemo(() => ({ navigate, goBack, setParams, clearParams }), [navigateTo, search, pathname, redirectPath]);
}
