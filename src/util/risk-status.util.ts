import { UserRole } from '@dfx.swiss/react';

/**
 * Setting an account's risk status is a Support, Compliance and Admin action. The API enforces the
 * same rule fail-closed (`RoleGuard(UserRole.SUPPORT)` on PUT userData/:id/riskStatus); the UI only
 * hides the box for roles that would be refused. SuperAdmin is not a separate session role in this app — Admin
 * covers it, and the page guard (`SUPPORT_DASHBOARD_ROLES`) does not admit it either.
 */
export function canManageRiskStatus(role: UserRole | undefined): boolean {
  return role === UserRole.SUPPORT || role === UserRole.COMPLIANCE || role === UserRole.ADMIN;
}
