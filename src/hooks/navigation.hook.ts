import { useMemo } from 'react';
import { NavigateOptions, To, useLocation, useNavigate } from 'react-router-dom';
import { useAppHandlingContext } from '../contexts/app-handling.context';
import { relativeUrl } from '../util/utils';

interface NavigationOptions extends NavigateOptions {
  clearParams?: string[];
  /**
   * When true, the target search is built only from `to.search` (and optional clearParams),
   * without inheriting the current location's query. Default false keeps legacy merge behavior.
   */
  replaceParams?: boolean;
  setRedirect?: boolean;
  redirectPath?: string;
}

interface NavigationInterface {
  navigate: (to: To | number, options?: NavigationOptions) => void;
  goBack: (options?: NavigationOptions) => void;
  setParams: (params: URLSearchParams) => void;
  clearParams: (params: string[]) => void;
}

function clearKycReturnStorage() {
  try {
    sessionStorage.removeItem('dfx.kyc.redirect');
    sessionStorage.removeItem('dfx.kyc.address');
  } catch {
    // ignore unavailable sessionStorage
  }
}

export function useNavigation(): NavigationInterface {
  const navigateTo = useNavigate();
  const { search, pathname } = useLocation();
  const { redirectPath, setRedirectPath, params: appParams } = useAppHandlingContext();

  function navigate(to: To | number, options?: NavigationOptions) {
    if (options?.setRedirect) {
      if (pathname === '/kyc' && search) {
        const query = new URLSearchParams(search);
        let returnPath = `${pathname}${search}`;
        let added = false;
        if (!query.has('wallet') && appParams.wallet) {
          query.set('wallet', appParams.wallet);
          added = true;
        }
        if (!query.has('address')) {
          try {
            const storedAddress = sessionStorage.getItem('dfx.kyc.address');
            if (storedAddress) {
              query.set('address', storedAddress);
              added = true;
            }
          } catch {
            // ignore unavailable sessionStorage
          }
        }
        if (added) {
          returnPath = `${pathname}?${query.toString()}`;
        }
        setRedirectPath(returnPath);
        try {
          sessionStorage.setItem('dfx.kyc.redirect', returnPath);
        } catch {
          // ignore unavailable sessionStorage
        }
      } else {
        setRedirectPath(options?.redirectPath ?? pathname);
      }
    }

    switch (typeof to) {
      case 'number':
        return navigateTo(to);

      case 'string':
        // replaceParams: do not merge location.search (clearParams remains a no-op here — pre-existing).
        return navigateTo(
          relativeUrl({
            path: to,
            params: options?.replaceParams ? undefined : new URLSearchParams(search),
          }),
          options,
        );

      default:
        const params = addParams(new URLSearchParams(to.search), options?.clearParams, options?.replaceParams);

        to.search = `?${params}`;
        return navigateTo(to, options);
    }
  }

  function goBack(options?: NavigationOptions) {
    const target = redirectPath ?? '/account';
    const queryIndex = target.indexOf('?');
    if (queryIndex !== -1) {
      navigate({ pathname: target.slice(0, queryIndex), search: target.slice(queryIndex) }, options);
      setRedirectPath(undefined);
      clearKycReturnStorage();
      return;
    }

    setRedirectPath(undefined);
    clearKycReturnStorage();
    navigate(target, options);
  }

  function setParams(newParams: URLSearchParams) {
    const params = addParams(newParams);

    return navigateTo(relativeUrl({ path: pathname, params }));
  }

  function addParams(newParams: URLSearchParams, clearParams?: string[], replaceParams?: boolean): URLSearchParams {
    const params = replaceParams ? new URLSearchParams() : new URLSearchParams(search);
    newParams.forEach((val, key) => params.set(key, val));
    clearParams?.forEach((s) => params.delete(s));

    return params;
  }

  function clearParams(params: string[]) {
    navigate({ pathname }, { replace: true, clearParams: params });
  }

  return useMemo(
    () => ({ navigate, goBack, setParams, clearParams }),
    [navigateTo, search, pathname, redirectPath, appParams],
  );
}
