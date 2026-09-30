import { useApi, useApiSession, useAuthContext, UserAddress, useUserContext } from '@dfx.swiss/react';
import { useCallback, useMemo, useState } from 'react';

// The published SDK types do not know the deletion flag of an address yet.
type DeletableUserAddress = UserAddress & { isDeleted?: boolean };

// Pages that only work with a usable session address (exact paths, no prefixes: e.g. '/kyc/redirect',
// '/buy/success', '/buy/failure' and the public '/tx/<id>' status pages work without one and stay out).
const SessionAddressPaths = [
  '/account',
  '/account/mail',
  '/settings',
  '/buy',
  '/buy/info',
  '/buy/personal-iban',
  '/sell',
  '/sell/info',
  '/swap',
  '/routes',
  '/safe',
  '/tx',
];
// KYC pages also work with a KYC code in the URL alone, without a session.
const KycPaths = ['/kyc', '/profile', '/contact'];

export function requiresSessionAddress(pathname: string, search: string): boolean {
  const path = pathname.replace(/\/+$/, '');
  return SessionAddressPaths.includes(path) || (KycPaths.includes(path) && !new URLSearchParams(search).get('code'));
}

export function useAddressReactivation(): {
  deactivatedAddress?: string;
  reactivateAddress: (address: string) => Promise<void>;
} {
  const { call } = useApi();
  const { updateSession } = useApiSession();
  const { getAuthToken } = useAuthContext();
  const { user, reloadUser } = useUserContext();
  const [reactivatedToken, setReactivatedToken] = useState<string>();

  const activeAddress: DeletableUserAddress | undefined = user?.activeAddress;
  // A successful reactivation token belongs to an active address, even if reloadUser leaves stale user data
  // after a failed request. Comparing tokens also lets a later sign-in show the notice again if the address was
  // deleted again.
  const deactivatedAddress =
    activeAddress?.isDeleted === true && getAuthToken() !== reactivatedToken ? activeAddress.address : undefined;

  const reactivateAddress = useCallback(
    async (address: string): Promise<void> => {
      // The deletion flag and reactivate route are not part of the published SDK yet, so the route uses the
      // generic call.
      const { accessToken } = await call<{ accessToken: string }>({
        url: `user/addresses/${encodeURIComponent(address)}/reactivate`,
        version: 'v2',
        method: 'POST',
      });
      updateSession(accessToken);
      setReactivatedToken(accessToken);
      await reloadUser();
    },
    [call, reloadUser, updateSession],
  );

  return useMemo(() => ({ deactivatedAddress, reactivateAddress }), [deactivatedAddress, reactivateAddress]);
}
