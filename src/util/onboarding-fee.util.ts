import { UserRole } from '@dfx.swiss/react';

/**
 * Managing an onboarding fee is an Admin action. The API enforces the same rule fail-closed
 * (`RoleGuard(UserRole.ADMIN)` on PUT/DELETE userData/:id/onboardingFee); the UI only hides the
 * controls for roles that would be refused.
 */
export function canManageOnboardingFee(role: UserRole | undefined): boolean {
  return role === UserRole.ADMIN;
}
