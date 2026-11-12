import { useAuthContext, useSessionContext } from '@dfx.swiss/react';
import { useEffect, useSyncExternalStore } from 'react';
import {
  dfxPasskeyAccount,
  getOpenPasskey,
  getOpenPasskeyAccount,
  setOpenPasskey,
  setPasskeyCloseReason,
  subscribeOpenPasskey,
} from './passkey-session';

// Mounted for every route. Logout, another account, or a login after the passkey was opened
// with no account wipes the tab keys. The same account with a new token does not.
export function PasskeyDfxSession(): null {
  const { isInitialized, isLoggedIn } = useSessionContext();
  const { session } = useAuthContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);

  useEffect(() => {
    if (!isInitialized) return;
    if (!open) return;
    const account = dfxPasskeyAccount(isLoggedIn, session);
    // Logged in, but the account id is not a number yet. Wait instead of treating that as logout.
    if (isLoggedIn && account === undefined) return;
    if (account === getOpenPasskeyAccount()) return;
    open.keys?.wipe();
    setPasskeyCloseReason('session-changed');
    setOpenPasskey(undefined);
  }, [isInitialized, isLoggedIn, session, open]);

  return null;
}
