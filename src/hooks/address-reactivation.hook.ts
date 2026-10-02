import { useApi, useApiSession, useAuthContext, UserAddress, useUserContext } from '@dfx.swiss/react';
import { useCallback, useMemo, useState } from 'react';
import { isEmbedded } from '../util/client-error';
import { getStorageBlockedFlag } from '../util/storage-block-flag';

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
  '/support/tickets',
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
  // A successful reactivation token belongs to an active address. In the branch without a reload, comparing tokens
  // keeps stale deleted user data hidden and also lets a later sign-in show the notice again if the address was deleted
  // again.
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

      // The SDK contexts fetched their data while the API still rejected the session (the bank accounts, for
      // one) and only reload when a session opens, so a token swap alone leaves that data empty. The token,
      // the query params and the wallet type are persisted, so a fresh start comes back on this page with the
      // reactivated session. Inside a host page the window is not ours to reload, and without storage the
      // token would not survive it; there the user record is reloaded and the rest stays as loaded.
      if (isEmbedded() || getStorageBlockedFlag()) {
        await reloadUser();
      } else {
        window.location.reload();
      }
    },
    [call, reloadUser, updateSession],
  );

  return useMemo(() => ({ deactivatedAddress, reactivateAddress }), [deactivatedAddress, reactivateAddress]);
}
