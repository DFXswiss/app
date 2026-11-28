import { User, UserStatus } from '@dfx.swiss/react';

export function isDeletedSessionAddress(user?: User): boolean {
  return user?.activeAddress?.status === UserStatus.DELETED;
}

// Hold the iframe until the signed-in user record is known. Otherwise buy and sell
// mount first and call routes that reject a deleted address. The passkey opt-in signs in
// inside the home screen and must stay mounted; Buy and Sell are held again once it is done.
export function shouldHoldForUser(input: {
  isInitialized: boolean;
  isLoggedIn: boolean;
  hasUser: boolean;
  isUserLoading: boolean;
  sawLoad: boolean;
  passkeySigningIn: boolean;
}): boolean {
  if (!input.isInitialized) return true;
  if (input.passkeySigningIn) return false;
  if (!input.isLoggedIn || input.hasUser) return false;
  return input.isUserLoading || !input.sawLoad;
}
