import { UserRole } from '@dfx.swiss/react';

export const ONBOARDING_COMPLETE_KYC_LEVEL = 50;
export const VIP_ROLE = UserRole.VIP;

/**
 * Managing account access is a Support, Compliance or Admin action. The API enforces the same rule
 * fail-closed for every update; the UI only hides the buttons from roles that would be refused.
 */
export function canManageAccountAccess(role: UserRole | undefined): boolean {
  return role === UserRole.SUPPORT || role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}

// Same window the API honours a provisional approval in: KYC level 0 to 40. Terminated (-10) and rejected
// (-20) accounts are not onboarding.
export function isOnboardingIncomplete(kycLevel: number | undefined): boolean {
  const level = kycLevel ?? 0;
  return level >= 0 && level < ONBOARDING_COMPLETE_KYC_LEVEL;
}
