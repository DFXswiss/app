import { useApi, useApiSession, useUserContext } from '@dfx.swiss/react';
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
  const { user, isUserLoading, reloadUser } = useUserContext();
  const { isInitialized, isLoggedIn, updateSession } = useApiSession();
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

  return (
    <DeletedAddressNotice
      onActivated={async (token) => {
        updateSession(token);
        await reloadUser();
      }}
    />
  );
}

function DeletedAddressNotice({ onActivated }: { onActivated: (token: string) => Promise<void> }): JSX.Element {
  const { translate } = useSettingsContext();
  const { call } = useApi();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function activate() {
    setIsLoading(true);
    setError(undefined);
    try {
      const result = await call<{ accessToken: string }>({ url: 'user/reactivate', version: 'v2', method: 'PUT' });
      if (!result?.accessToken) throw new Error('Activation failed');
      await onActivated(result.accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed');
    } finally {
      setIsLoading(false);
    }
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
        onClick={() => void activate()}
        width={StyledButtonWidth.MIN}
        className="self-center"
        isLoading={isLoading}
      />
    </StyledVerticalStack>
  );
}
