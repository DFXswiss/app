// Unit tests for the NameCheckUnavailable predicate the manual-check UI keys the Reset hint on.

import { hasNameCheckUnavailable, NAME_CHECK_UNAVAILABLE_TOKEN } from 'src/util/name-check.util';

describe('hasNameCheckUnavailable', () => {
  it.each([
    NAME_CHECK_UNAVAILABLE_TOKEN,
    'NameCheckUnavailable;IpPhoneVerificationNeeded',
    ' UserDataBlocked ; NameCheckUnavailable ',
  ])('is true when the token is one of the ;-joined members: %j', (comment) => {
    expect(hasNameCheckUnavailable(comment)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'NameCheckWithBirthday',
    'NameCheckUnavailableX',
    'ScorechainUnavailable;NameCheckWithoutKYC',
  ])('is false for %j', (comment) => {
    expect(hasNameCheckUnavailable(comment)).toBe(false);
  });
});
