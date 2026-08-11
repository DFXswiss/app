jest.mock('@dfx.swiss/react', () => ({
  CustodyAccessLevel: { READ: 'Read', WRITE: 'Write' },
}));

import { CustodyAccessLevel, CustodyAccount } from '@dfx.swiss/react';
import { canActOn } from '../safe-account';

/**
 * Whether a Safe may be acted on decides whether the screen offers deposits, withdrawals and
 * swaps at all. It went wrong twice during review, and until now only a Playwright run covered
 * it — and that is explicitly not a CI gate. This is.
 */
describe('canActOn', () => {
  function account(overrides: Partial<CustodyAccount>): CustodyAccount {
    return {
      id: 1,
      title: 'Safe',
      isLegacy: false,
      accessLevel: CustodyAccessLevel.WRITE,
      isOwner: true,
      ...overrides,
    };
  }

  it('allows acting on an own account with write access', () => {
    expect(canActOn(account({ accessLevel: CustodyAccessLevel.WRITE }))).toBe(true);
  });

  it('refuses acting on an own account the owner narrowed to read', () => {
    expect(canActOn(account({ accessLevel: CustodyAccessLevel.READ }))).toBe(false);
  });

  it('refuses acting on a foreign account held by inspection only', () => {
    expect(canActOn(account({ accessLevel: CustodyAccessLevel.READ, isOwner: false, owner: { id: 42 } }))).toBe(false);
  });

  it('refuses acting on a foreign account even with a write mandate', () => {
    // The case this predicate exists for. Orders carry no account, so acting here would book
    // against the caller's own Safe while the screen names someone else's.
    expect(canActOn(account({ accessLevel: CustodyAccessLevel.WRITE, isOwner: false, owner: { id: 42 } }))).toBe(false);
  });

  it("allows acting on the legacy Safe, which is the caller's own by definition", () => {
    expect(canActOn(account({ id: null, isLegacy: true, accessLevel: CustodyAccessLevel.WRITE, owner: { id: 7 } }))).toBe(true);
  });
});
