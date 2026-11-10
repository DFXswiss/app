import { useAuthContext, useSessionContext } from '@dfx.swiss/react';
import { useEffect, useSyncExternalStore } from 'react';
import { getOpenPasskey, getOpenPasskeyAccount, setOpenPasskey, subscribeOpenPasskey } from './passkey-session';

// Mounted for every route. Logout, another account, or a login after the passkey was opened
// with no account wipes the tab keys. The same account with a new token does not.
export function PasskeyDfxSession(): null {
  const { isInitialized, isLoggedIn } = useSessionContext();
  const { session } = useAuthContext();
  const open = useSyncExternalStore(subscribeOpenPasskey, getOpenPasskey, getOpenPasskey);

  useEffect(() => {
    if (!isInitialized) return;
    if (!open) return;
    let account: number | undefined;
    if (isLoggedIn) {
      if (session == null || typeof session.account !== 'number') return;
      account = session.account;
    }
    if (account === getOpenPasskeyAccount()) return;
    open.keys?.wipe();
    setOpenPasskey(undefined);
  }, [isInitialized, isLoggedIn, session, open]);

  return null;
}
