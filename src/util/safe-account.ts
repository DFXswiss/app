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
 * Whether the caller may act on this Safe — Write is enough, including a write mandate on
 * someone else's Safe. Orders now go through the account resource, so they book against the
 * selected Safe rather than the caller. Read (own or foreign) remains view-only.
 */
export function canActOn(account: CustodyAccount): boolean {
  return account.accessLevel === 'Write';
}
