import { User, UserStatus } from '@dfx.swiss/react';

export function isDeletedSessionAddress(user?: User): boolean {
  return user?.activeAddress?.status === UserStatus.DELETED;
}

const loginRoutes = new Set(['/', '/login', '/login/mail', '/login/wallet', '/connect']);

// HomeScreen routes. Matched exactly so a look-alike such as /login/other does not qualify.
export function carriesLogin(pathname: string): boolean {
  return loginRoutes.has(pathname);
}

// Hold the iframe until the signed-in user record is known. Otherwise buy and sell
// mount first and call routes that reject a deleted address.
export function shouldHoldForUser(input: {
  isInitialized: boolean;
  isLoggedIn: boolean;
  hasUser: boolean;
  isUserLoading: boolean;
  sawLoad: boolean;
  carriesLogin: boolean;
}): boolean {
  if (!input.isInitialized) return true;
  // These routes run the login in place and keep its state in the mounted screen,
  // and they call no route that rejects a deleted address, so do not wait for the user record.
  if (input.carriesLogin) return false;
  if (!input.isLoggedIn || input.hasUser) return false;
  return input.isUserLoading || !input.sawLoad;
}
