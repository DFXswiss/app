import { ApiError, useApiSession, useUserContext } from '@dfx.swiss/react';
import {
  SpinnerSize,
  StyledButton,
  StyledButtonWidth,
  StyledLoadingSpinner,
  StyledVerticalStack,
} from '@dfx.swiss/react-components';
import { PropsWithChildren, useRef, useState } from 'react';
import { useSettingsContext } from 'src/contexts/settings.context';
import { isDeletedSessionAddress, shouldHoldForUser } from 'src/util/deleted-address';

export function DeletedAddressGate({ children }: PropsWithChildren): JSX.Element {
  const { user, isUserLoading } = useUserContext();
  const { isInitialized, isLoggedIn } = useApiSession();
  const sawLoad = useRef(false);
  if (isUserLoading) sawLoad.current = true;

  if (
    shouldHoldForUser({
      isInitialized,
      isLoggedIn,
      hasUser: user != null,
      isUserLoading,
      sawLoad: sawLoad.current,
    })
  ) {
    return <StyledLoadingSpinner size={SpinnerSize.LG} />;
  }

  if (!isDeletedSessionAddress(user)) return <>{children}</>;

  return <DeletedAddressNotice />;
}

function DeletedAddressNotice(): JSX.Element {
  const { translate } = useSettingsContext();
  const { reactivateAddress, reloadUser } = useUserContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  // The user context swaps in the returned session token and reloads the user. With the
  // address active again, the gate renders the app. After an error the user is loaded again:
  // when only the reload failed, the address is already active and a second attempt would be refused.
  function activate() {
    setIsLoading(true);
    setError(undefined);
    reactivateAddress()
      .catch((e: ApiError) => {
        setError(e.message ?? 'Unknown error');
        return reloadUser();
      })
      .finally(() => setIsLoading(false));
  }

  return (
    <StyledVerticalStack full center gap={6}>
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
