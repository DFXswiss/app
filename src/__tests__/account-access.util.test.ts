jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import {
  canManageAccountAccess,
  isOnboardingIncomplete,
  ONBOARDING_COMPLETE_KYC_LEVEL,
  VIP_ROLE,
} from 'src/util/account-access.util';

describe('account access rules', () => {
  it.each([UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.ADMIN])('allows %s to manage access', (role) => {
    expect(canManageAccountAccess(role)).toBe(true);
  });

  it.each([UserRole.MARKETING, UserRole.USER, undefined])('refuses %s', (role) => {
    expect(canManageAccountAccess(role)).toBe(false);
  });

  it.each<[number | undefined, boolean]>([
    [undefined, true],
    [0, true],
    [49, true],
    [50, false],
    [51, false],
  ])('classifies KYC level %s as incomplete=%s', (level, expected) => {
    expect(isOnboardingIncomplete(level)).toBe(expected);
  });

  it('exports the backend account access constants', () => {
    expect(ONBOARDING_COMPLETE_KYC_LEVEL).toBe(50);
    expect(VIP_ROLE).toBe('VIP');
  });
});
