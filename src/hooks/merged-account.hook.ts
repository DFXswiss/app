import { ApiError, useSessionContext } from '@dfx.swiss/react';
import { useNavigation } from './navigation.hook';

interface MergedAccountInterface {
  // Redirects a merged account to its master KYC code and ends the dead session.
  // Returns true if the error was a merged-account 401 and got handled, false otherwise.
  handleMergedError: (e: ApiError) => boolean;
}

export function useMergedAccount(): MergedAccountInterface {
  const { navigate } = useNavigation();
  const { logout } = useSessionContext();

  function handleMergedError(e: ApiError): boolean {
    if (e.statusCode !== 401 || !e.switchToCode) return false;

    navigate({ pathname: '/kyc', search: `?code=${e.switchToCode}` }, { clearParams: ['kyc-redirect'] });
    logout();
    return true;
  }

  return { handleMergedError };
}
