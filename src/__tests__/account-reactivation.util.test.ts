jest.mock('@dfx.swiss/react', () => ({
  UserRole: { USER: 'User', SUPPORT: 'Support', MARKETING: 'Marketing', COMPLIANCE: 'Compliance', ADMIN: 'Admin' },
}));

import { UserRole } from '@dfx.swiss/react';
import { canReactivateAccount, DEACTIVATED_STATUS } from 'src/util/account-reactivation.util';

describe('canReactivateAccount', () => {
  it.each([UserRole.COMPLIANCE, UserRole.ADMIN])('allows %s', (role) => {
    expect(canReactivateAccount(role)).toBe(true);
  });

  it.each([UserRole.SUPPORT, UserRole.MARKETING, UserRole.USER, undefined])('refuses %s', (role) => {
    expect(canReactivateAccount(role)).toBe(false);
  });

  it('names the status the API stores for a deleted account', () => {
    expect(DEACTIVATED_STATUS).toBe('Deactivated');
  });
});
