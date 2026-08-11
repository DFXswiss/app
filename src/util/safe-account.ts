import { CustodyAccessLevel, CustodyAccount } from '@dfx.swiss/react';

/** Whether the caller owns this Safe rather than merely being granted access to someone else's. */
export function isOwnAccount(account: CustodyAccount): boolean {
  return account.isOwner;
}

/**
 * Whether the caller may act on this Safe - own it and hold full disposal.
 *
 * A write grant on another person's account does not qualify. Orders carry no account, so an
 * order placed while looking at someone else's Safe would be booked against the caller's own,
 * and acting on another person's behalf does not exist in the backend at all.
 */
export function canActOn(account: CustodyAccount): boolean {
  return isOwnAccount(account) && account.accessLevel === CustodyAccessLevel.WRITE;
}
