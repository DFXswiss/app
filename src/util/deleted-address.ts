export interface SessionAddressUser {
  activeAddress?: { status?: string };
}

export function isDeletedSessionAddress(user?: SessionAddressUser): boolean {
  return user?.activeAddress?.status === 'Deleted';
}

// Hold the iframe until the signed-in user record is known. Otherwise buy and sell
// mount first and call routes that reject a deleted address.
export function shouldHoldForUser(input: {
  isInitialized: boolean;
  isLoggedIn: boolean;
  hasUser: boolean;
  isUserLoading: boolean;
  sawLoad: boolean;
}): boolean {
  if (!input.isInitialized) return true;
  if (!input.isLoggedIn || input.hasUser) return false;
  return input.isUserLoading || !input.sawLoad;
}
