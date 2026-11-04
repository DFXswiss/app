import { ApiError, useApiSession, useUserContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { Router } from '@remix-run/router';
import { PropsWithChildren, useRef, useState, useSyncExternalStore } from 'react';
import { useAppHandlingContext } from 'src/contexts/app-handling.context';
import { useSettingsContext } from 'src/contexts/settings.context';
import { carriesLogin, isDeletedSessionAddress, shouldHoldForUser } from 'src/util/deleted-address';
import { loginTarget } from 'src/util/login-redirect';
import { relativeUrl } from 'src/util/utils';

interface DeletedAddressGateProps extends PropsWithChildren {
  router: Router;
}

export function DeletedAddressGate({ children, router }: DeletedAddressGateProps): JSX.Element {
  const pathname = useSyncExternalStore(router.subscribe, () => router.state.location.pathname);
  const { user, isUserLoading } = useUserContext();
  const { isInitialized, isLoggedIn } = useApiSession();
  // A load seen before a logout must not release the app after the next login.
  const sawLoad = useRef(false);
  if (!isLoggedIn) sawLoad.current = false;
  if (isUserLoading) sawLoad.current = true;

  if (
    shouldHoldForUser({
      isInitialized,
      isLoggedIn,
      hasUser: user != null,
      isUserLoading,
      sawLoad: sawLoad.current,
      carriesLogin: carriesLogin(pathname),
    })
  ) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  if (!isLoggedIn || !isDeletedSessionAddress(user)) return <>{children}</>;

  return <DeletedAddressNotice router={router} />;
}

function DeletedAddressNotice({ router }: { router: Router }): JSX.Element {
  const { translate } = useSettingsContext();
  const { redirectPath, setRedirectPath } = useAppHandlingContext();
  const { reactivateAddress, reloadUser } = useUserContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  // The user context swaps in the returned session token and reloads the user. With the
  // address active again, the gate renders the app. Login routes continue to the login target
  // or /account; other routes stay in place. After an error the user is loaded again and the
  // route stays: when only the reload failed, the address is already active and a second attempt
  // would be refused.
  function activate() {
    setIsLoading(true);
    setError(undefined);
    reactivateAddress()
      .then(() => {
        const pathname = router.state.location.pathname;
        if (carriesLogin(pathname)) {
          const target = loginTarget(redirectPath, pathname) ?? '/account';
          router.navigate(relativeUrl({ path: target, params: new URLSearchParams(router.state.location.search) }));
          if (redirectPath) setRedirectPath(undefined);
        }
      })
      .catch((e: ApiError) => {
        setError(e.message ?? 'Unknown error');
        return reloadUser();
      })
      .finally(() => setIsLoading(false));
  }

  return (
    <StyledVerticalStack full center gap={6} className="p-6">
      <p className="text-dfxGray-700">
        {translate('screens/home', 'This address was deleted. You can activate it again.')}
      </p>
      {error && <p className="text-dfxRed-100">{error}</p>}
      <StyledButton
        type="button"
        label={translate('screens/home', 'Activate address')}
        onClick={activate}
        width={StyledButtonWidth.MIN}
        className="self-center"
        isLoading={isLoading}
      />
    </StyledVerticalStack>
  );
}
