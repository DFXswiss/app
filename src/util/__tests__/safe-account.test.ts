import { CustodyAccount } from 'src/dto/safe.dto';
import { canActOn, isOwnAccount } from '../safe-account';

function account(overrides: Partial<CustodyAccount>): CustodyAccount {
  return {
    id: 1,
    title: 'Safe',
    isLegacy: false,
    accessLevel: 'Write',
    ...overrides,
  };
}

/**
 * Whether a Safe may be acted on decides whether the screen offers deposits, withdrawals and
 * swaps at all. It went wrong twice during review, and until now only a Playwright run covered
 * it — and that is explicitly not a CI gate. This is.
 */
describe('canActOn', () => {
  it('allows acting on an own account with write access', () => {
    expect(canActOn(account({ accessLevel: 'Write' }))).toBe(true);
  });

  it('refuses acting on an own account the owner narrowed to read', () => {
    expect(canActOn(account({ accessLevel: 'Read' }))).toBe(false);
  });

  it('refuses acting on a foreign account held by inspection only', () => {
    expect(canActOn(account({ accessLevel: 'Read', owner: { id: 42 } }))).toBe(false);
  });

  it('allows acting on a foreign account held under a write mandate', () => {
    // The case this predicate exists for. Orders now go through the account resource, so a
    // write mandate books against the selected Safe rather than the caller.
    expect(canActOn(account({ accessLevel: 'Write', owner: { id: 42 } }))).toBe(true);
  });

  it("allows acting on the legacy Safe, which is the caller's own by definition", () => {
    expect(canActOn(account({ id: null, isLegacy: true, accessLevel: 'Write', owner: { id: 7 } }))).toBe(true);
  });
});

describe('isOwnAccount', () => {
  it('own non-legacy without owner → true', () => {
    expect(isOwnAccount(account({ isLegacy: false }))).toBe(true);
  });

  it('foreign with owner → false', () => {
    expect(isOwnAccount(account({ owner: { id: 42 } }))).toBe(false);
  });

  it('legacy (id null, isLegacy true, owner set) → true', () => {
    expect(isOwnAccount(account({ id: null, isLegacy: true, owner: { id: 7 } }))).toBe(true);
  });
});
