jest.mock('@dfx.swiss/react', () => ({
  UserRole: { ADMIN: 'Admin', COMPLIANCE: 'Compliance', SUPPORT: 'Support' },
}));

import { UserRole } from '@dfx.swiss/react';
import { canManuallySetAmlPass } from 'src/util/aml-pass.util';

describe('canManuallySetAmlPass', () => {
  it('allows Admin only', () => {
    expect(canManuallySetAmlPass(UserRole.ADMIN)).toBe(true);
    expect(canManuallySetAmlPass(UserRole.COMPLIANCE)).toBe(false);
    expect(canManuallySetAmlPass(UserRole.SUPPORT)).toBe(false);
    expect(canManuallySetAmlPass(undefined)).toBe(false);
  });
});
