import { CustodyAccount } from 'src/dto/safe.dto';

/**
 * Whether the caller owns this Safe rather than merely being granted access to someone else's.
 *
 * The account list marks foreign accounts with their owner and leaves the field off the
 * caller's own; the legacy Safe carries the caller as its owner. That distinction is a side
 * effect of how the API loads its relations rather than a documented guarantee — DFXswiss/backend
 * PR 4424 adds an explicit flag, and this should move to it once that lands.
 */
export function isOwnAccount(account: CustodyAccount): boolean {
  return account.isLegacy || account.owner === undefined;
}

/**
 * Whether the caller may act on this Safe — own it and hold full disposal.
 *
 * A write grant on another person's account does not qualify. Orders carry no account, so an
 * order placed while looking at someone else's Safe would be booked against the caller's own,
 * and acting on another person's behalf does not exist in the backend at all.
 */
export function canActOn(account: CustodyAccount): boolean {
  return isOwnAccount(account) && account.accessLevel === 'Write';
}
