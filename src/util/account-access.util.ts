import { UserRole } from '@dfx.swiss/react';

export const ONBOARDING_COMPLETE_KYC_LEVEL = 50;
export const VIP_ROLE = 'VIP';

/**
 * Managing account access is a Support, Compliance or Admin action. The API enforces the same rule
 * fail-closed for every update; the UI only hides the buttons from roles that would be refused.
 */
export function canManageAccountAccess(role: UserRole | undefined): boolean {
  return role === UserRole.SUPPORT || role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}

export function isOnboardingIncomplete(kycLevel: number | undefined): boolean {
  return (kycLevel ?? 0) < ONBOARDING_COMPLETE_KYC_LEVEL;
}
