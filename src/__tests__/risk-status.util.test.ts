jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import { canManageRiskStatus } from 'src/util/risk-status.util';

describe('canManageRiskStatus', () => {
  it.each([UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.ADMIN])('allows the %s role', (role) => {
    expect(canManageRiskStatus(role)).toBe(true);
  });

  it.each([UserRole.MARKETING, UserRole.USER, undefined])('refuses %s', (role) => {
    expect(canManageRiskStatus(role)).toBe(false);
  });
});
