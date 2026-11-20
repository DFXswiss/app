jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import { canManageOnboardingFee } from 'src/util/onboarding-fee.util';

describe('canManageOnboardingFee', () => {
  it('allows the Admin role', () => {
    expect(canManageOnboardingFee(UserRole.ADMIN)).toBe(true);
  });

  it.each([UserRole.COMPLIANCE, UserRole.SUPPORT, UserRole.MARKETING, UserRole.USER, undefined])(
    'refuses %s',
    (role) => {
      expect(canManageOnboardingFee(role)).toBe(false);
    },
  );
});
