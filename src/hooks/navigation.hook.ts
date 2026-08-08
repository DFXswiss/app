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

export function useNavigation(): NavigationInterface {
  const navigateTo = useNavigate();
  const { search, pathname } = useLocation();
  const { redirectPath, setRedirectPath } = useAppHandlingContext();

  function navigate(to: To | number, options?: NavigationOptions) {
    if (options?.setRedirect) setRedirectPath(options?.redirectPath ?? pathname);

    switch (typeof to) {
      case 'number':
        return navigateTo(to);

      case 'string':
        return navigateTo(relativeUrl({ path: to, params: new URLSearchParams(search) }), options);

      default:
        const params = addParams(new URLSearchParams(to.search), options?.clearParams, options?.replaceParams);

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

  function addParams(
    newParams: URLSearchParams,
    clearParams?: string[],
    replaceParams?: boolean,
  ): URLSearchParams {
    const params = replaceParams ? new URLSearchParams() : new URLSearchParams(search);
    newParams.forEach((val, key) => params.set(key, val));
    clearParams?.forEach((s) => params.delete(s));

    return params;
  }

  function clearParams(params: string[]) {
    navigate({ pathname }, { replace: true, clearParams: params });
  }

  return useMemo(() => ({ navigate, goBack, setParams, clearParams }), [navigateTo, search, pathname, redirectPath]);
}
