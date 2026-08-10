// Round-4 C1: classifyInviteCode must preserve usedRef case (API referral lookup is an exact
// match; live codes like `stb-tax` are lower-case) and only upper-case the recommendationCode
// branch. Recommendation classification stays first so a full code never falls through as usedRef.

import { classifyInviteCode } from '../wallets/invite';

describe('classifyInviteCode (round-4 C1)', () => {
  it('preserves the original case of a short usedRef', () => {
    expect(classifyInviteCode('stb-tax')).toEqual({ kind: 'usedRef', code: 'stb-tax' });
    expect(classifyInviteCode('  ab-c12  ')).toEqual({ kind: 'usedRef', code: 'ab-c12' });
    expect(classifyInviteCode('AB-C12')).toEqual({ kind: 'usedRef', code: 'AB-C12' });
  });

  it('upper-cases a full recommendation code and never classifies it as usedRef', () => {
    expect(classifyInviteCode('xy-ab12-cd34-ef')).toEqual({
      kind: 'recommendationCode',
      code: 'XY-AB12-CD34-EF',
    });
    expect(classifyInviteCode('XY-AB12-CD34-EF')).toEqual({
      kind: 'recommendationCode',
      code: 'XY-AB12-CD34-EF',
    });
  });

  it('returns undefined for shapes that match neither API field', () => {
    expect(classifyInviteCode('not-a-real-code-at-all')).toBeUndefined();
    expect(classifyInviteCode('')).toBeUndefined();
    expect(classifyInviteCode(undefined)).toBeUndefined();
  });
});
