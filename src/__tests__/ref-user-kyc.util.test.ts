// Unit tests for the InvalidKycStatusRefUser predicate the manual-check UI keys the referrer waiver on.

import { hasRefUserKycHold, REF_USER_KYC_HOLD_TOKEN } from 'src/util/ref-user-kyc.util';

describe('hasRefUserKycHold', () => {
  it.each([
    REF_USER_KYC_HOLD_TOKEN,
    'InvalidKycStatusRefUser;ScorechainHighRisk',
    ' KycLevelTooLow ; InvalidKycStatusRefUser ',
  ])('is true when the token is one of the ;-joined members: %j', (comment) => {
    expect(hasRefUserKycHold(comment)).toBe(true);
  });

  it.each([undefined, '', 'InvalidKycStatus', 'InvalidKycStatusRefUserX', 'ScorechainHighRisk;KycLevelTooLow'])(
    'is false for %j',
    (comment) => {
      expect(hasRefUserKycHold(comment)).toBe(false);
    },
  );
});
